'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    EXECUTOR_BY_STATE,
    SCHEMA,
    assertExpectedStateHash,
    isSafeRepoPath,
    parseState,
    serializeState,
    stateHash,
    transitionState,
    validateState,
    withStateLock,
    writeAtomically
} = require('../scripts/agent/manageChatCodexOrchestration');

const BASE_SHA = '11c8fe591287d7f020338594dbd08fb4e2920bee';
const CANDIDATE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function makeState(overrides = {}) {
    return {
        schema: SCHEMA,
        orchestration_state: 'CHAT_WORKING',
        next_executor: 'chat',
        task_id: 'ORCH-01',
        expected_base_sha: BASE_SHA,
        task_file: 'docs/plans/workstreams/chat-codex-orchestration.md',
        candidate_sha: null,
        result_file: null,
        updated_at: '2026-08-24T13:10:00.000Z',
        ...overrides
    };
}

test('estado inicial v1 é fechado e válido', () => {
    const state = makeState();
    assert.deepEqual(validateState(state), []);
    assert.equal(parseState(serializeState(state)).task_id, 'ORCH-01');
});

test('schema rejeita campo extra e executor incoerente', () => {
    const extra = validateState(makeState({ extra: true }));
    assert.match(extra.join('\n'), /campo extra não permitido: extra/);

    const wrongOwner = validateState(makeState({ next_executor: 'codex' }));
    assert.match(wrongOwner.join('\n'), /next_executor incoerente/);
});

test('hash mecânico é estável sem mudança e muda quando o estado muda', () => {
    const first = serializeState(makeState());
    const second = serializeState(makeState());
    assert.equal(stateHash(first), stateHash(second));

    const changed = serializeState(makeState({ task_id: 'ORCH-02' }));
    assert.notEqual(stateHash(first), stateHash(changed));
});

test('hash mecânico é idêntico em LF e CRLF', () => {
    const lf = serializeState(makeState());
    assert.equal(stateHash(lf), stateHash(lf.replace(/\n/g, '\r\n')));
});

test('compare-and-swap rejeita hash de estado obsoleto', () => {
    const raw = serializeState(makeState());
    const hash = stateHash(raw);
    assert.doesNotThrow(() => assertExpectedStateHash(raw, hash));
    assert.throws(
        () => assertExpectedStateHash(raw, '0'.repeat(64)),
        /estado mudou: esperado/
    );
    assert.throws(() => assertExpectedStateHash(raw, 'abc123'), /expected-state-hash inválido/);
});

test('fluxo normal exige cada transição e deriva o executor', () => {
    const t0 = new Date('2026-08-24T13:11:00.000Z');
    const t1 = new Date('2026-08-24T13:12:00.000Z');
    const t2 = new Date('2026-08-24T13:13:00.000Z');
    const t3 = new Date('2026-08-24T13:14:00.000Z');

    const ready = transitionState(makeState(), 'CODEX_READY', {}, t0);
    assert.equal(ready.next_executor, 'codex');
    assert.equal(ready.candidate_sha, null);
    assert.equal(ready.result_file, null);

    const running = transitionState(ready, 'CODEX_RUNNING', {}, t1);
    assert.equal(running.next_executor, 'codex');

    const chatReady = transitionState(running, 'CHAT_READY', {
        candidate_sha: CANDIDATE_SHA,
        result_file: 'docs/agent-memory/workstreams/chat-codex-orchestration.md'
    }, t2);
    assert.equal(chatReady.next_executor, 'chat');
    assert.equal(chatReady.candidate_sha, CANDIDATE_SHA);

    const chatWorking = transitionState(chatReady, 'CHAT_WORKING', {}, t3);
    assert.equal(chatWorking.next_executor, 'chat');
    assert.equal(chatWorking.result_file, chatReady.result_file);
});

test('salto de estado falha fechado', () => {
    assert.throws(
        () => transitionState(makeState(), 'CODEX_RUNNING'),
        /transição inválida: CHAT_WORKING -> CODEX_RUNNING/
    );
});

test('CHAT_READY exige result_file', () => {
    const ready = transitionState(makeState(), 'CODEX_READY', {}, new Date('2026-08-24T13:11:00.000Z'));
    const running = transitionState(ready, 'CODEX_RUNNING', {}, new Date('2026-08-24T13:12:00.000Z'));
    assert.throws(
        () => transitionState(running, 'CHAT_READY', {}, new Date('2026-08-24T13:13:00.000Z')),
        /CHAT_READY exige result_file/
    );
});

test('hashes curtos e caminhos que escapam do repositório são rejeitados', () => {
    const errors = validateState(makeState({
        expected_base_sha: 'abc123',
        task_file: '../private/task.md',
        candidate_sha: 'def456',
        result_file: '/tmp/result.md'
    }));
    const joined = errors.join('\n');
    assert.match(joined, /expected_base_sha inválido/);
    assert.match(joined, /task_file inválido/);
    assert.match(joined, /candidate_sha inválido/);
    assert.match(joined, /result_file inválido/);
});

test('caminhos absolutos Windows e UNC são rejeitados independentemente do host', () => {
    assert.equal(isSafeRepoPath('C:\\private\\task.md'), false);
    assert.equal(isSafeRepoPath('D:/private/task.md'), false);
    assert.equal(isSafeRepoPath('\\\\server\\share\\task.md'), false);
    assert.equal(isSafeRepoPath('docs/tasks/task.md'), true);
});

test('estados de parada não possuem saída silenciosa', () => {
    for (const terminal of ['BLOCKED', 'FAILED', 'HUMAN_APPROVAL_REQUIRED', 'FINISHED']) {
        const state = makeState({
            orchestration_state: terminal,
            next_executor: EXECUTOR_BY_STATE[terminal]
        });
        assert.deepEqual(validateState(state), []);
        assert.throws(() => transitionState(state, 'CHAT_WORKING'), /transição inválida/);
    }
});

test('lock exclusivo impede dois transitioners locais de possuir o mesmo estado', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-orch-lock-'));
    const file = path.join(directory, 'state.json');
    try {
        fs.writeFileSync(file, serializeState(makeState()), 'utf8');
        withStateLock(file, () => {
            assert.throws(
                () => withStateLock(file, () => {}),
                /estado já está sendo transicionado/
            );
        });
        assert.equal(fs.existsSync(`${file}.lock`), false);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('escrita atômica substitui o arquivo completo sem resíduos temporários', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-orch-'));
    const file = path.join(directory, 'state.json');
    try {
        fs.writeFileSync(file, serializeState(makeState()), 'utf8');
        const next = transitionState(
            makeState(),
            'CODEX_READY',
            {},
            new Date('2026-08-24T13:11:00.000Z')
        );
        writeAtomically(file, serializeState(next));
        assert.equal(parseState(fs.readFileSync(file, 'utf8')).orchestration_state, 'CODEX_READY');
        assert.equal(fs.readdirSync(directory).filter(name => name.includes('.tmp-')).length, 0);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
