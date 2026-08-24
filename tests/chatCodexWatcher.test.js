'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { serializeState } = require('../scripts/agent/manageChatCodexOrchestration');
const {
    buildExecutorPrompt,
    pollOnce,
    readCache,
    runCodex,
    withWatcherLock
} = require('../scripts/agent/watchChatCodexOrchestration');

function fixture(state = 'CHAT_WORKING') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-watch-'));
    const repo = path.join(root, 'repo');
    const runtime = path.join(root, 'runtime');
    const codex = path.join(root, 'codex.ps1');
    fs.mkdirSync(repo);
    fs.writeFileSync(codex, 'exit 0\n');
    const value = {
        schema: 'financasbot-chat-codex-orchestration-v1',
        orchestration_state: state,
        next_executor: state.startsWith('CODEX_') ? 'codex' : 'chat',
        task_id: 'ORCH-01',
        expected_base_sha: 'a'.repeat(40),
        task_file: 'docs/task.md',
        candidate_sha: null,
        result_file: null,
        updated_at: '2026-08-24T00:00:00.000Z'
    };
    return { codex, repo, root, runtime, raw: serializeState(value) };
}

test('poll inalterado não desperta executor', () => {
    const item = fixture();
    let launches = 0;
    const deps = {
        fetchRemoteState: () => item.raw,
        runCodex: () => { launches += 1; return 0; },
        now: () => new Date('2026-08-24T01:00:00.000Z')
    };
    const options = { repo: item.repo, runtime: item.runtime, codex: item.codex };
    assert.equal(pollOnce(options, deps).action, 'observed');
    assert.equal(pollOnce(options, deps).action, 'unchanged');
    assert.equal(launches, 0);
});

test('CODEX_READY novo dispara exatamente uma vez', () => {
    const item = fixture('CODEX_READY');
    let launches = 0;
    const deps = {
        fetchRemoteState: () => item.raw,
        runCodex: ({ prompt }) => {
            launches += 1;
            assert.match(prompt, /ORCH-01/);
            assert.doesNotMatch(prompt, /produção.*alter/i);
            return 0;
        }
    };
    const options = { repo: item.repo, runtime: item.runtime, codex: item.codex };
    assert.equal(pollOnce(options, deps).action, 'launched');
    assert.equal(pollOnce(options, deps).action, 'unchanged');
    assert.equal(launches, 1);
    assert.equal(readCache(path.join(item.runtime, 'watcher-state.json')).launch_status, 'succeeded');
});

test('hash novo de CODEX_READY permite novo disparo', () => {
    const item = fixture('CODEX_READY');
    let raw = item.raw;
    let launches = 0;
    const deps = {
        fetchRemoteState: () => raw,
        runCodex: () => { launches += 1; return 0; }
    };
    const options = { repo: item.repo, runtime: item.runtime, codex: item.codex };
    pollOnce(options, deps);
    const changed = JSON.parse(raw);
    changed.updated_at = '2026-08-24T00:01:00.000Z';
    raw = serializeState(changed);
    assert.equal(pollOnce(options, deps).action, 'launched');
    assert.equal(launches, 2);
});

test('lock existente impede execução concorrente', () => {
    const item = fixture();
    const cachePath = path.join(item.runtime, 'watcher-state.json');
    fs.mkdirSync(item.runtime);
    fs.writeFileSync(`${cachePath}.lock`, 'busy');
    assert.deepEqual(withWatcherLock(cachePath, () => assert.fail('não deveria executar')), {
        action: 'already_running'
    });
});

test('prompt é local, limitado e não contém ação financeira', () => {
    const prompt = buildExecutorPrompt({
        branch: 'chat/test',
        observedHash: 'b'.repeat(64),
        taskId: 'ORCH-01'
    });
    assert.match(prompt, /somente o ensaio no-op/);
    assert.match(prompt, /falhe fechado/);
    assert.match(prompt, /Não toque no bot/);
    assert.match(prompt, /CHAT_READY/);
});

test('launcher PowerShell usa argumentos fixos sem shell', () => {
    const item = fixture();
    let invocation;
    const status = runCodex({
        codexPath: item.codex,
        repoPath: item.repo,
        prompt: 'no-op',
        logPath: path.join(item.runtime, 'run.log')
    }, {
        spawnSync(command, args, options) {
            invocation = { command, args, options };
            return { status: 0, stdout: 'ok', stderr: '' };
        }
    });
    assert.equal(status, 0);
    assert.equal(invocation.command, 'pwsh.exe');
    assert.equal(invocation.options.input, 'no-op');
    assert.equal(invocation.options.windowsHide, true);
    assert.equal(invocation.args.includes('--full-auto'), true);
    assert.equal(invocation.args.includes('workspace-write'), true);
    assert.equal(invocation.args.at(-1), '-');
});
