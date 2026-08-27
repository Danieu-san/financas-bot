'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { serializeState, stateHash } = require('../scripts/agent/manageChatCodexOrchestration');
const { pollOnce } = require('../scripts/agent/watchChatCodexOrchestration');
const { buildWakePrompt } = require('../scripts/agent/wakeCodexAppViaIpc');
const {
    CONFIG_SCHEMA,
    REQUEST_SCHEMA,
    LEGACY_REQUEST_SCHEMA,
    processWakeRequest
} = require('../scripts/agent/processCodexAppWakeRequest');

function remoteState(taskId = 'ORCH02-HARDENING') {
    return serializeState({
        schema: 'financasbot-chat-codex-orchestration-v1',
        orchestration_state: 'CODEX_READY',
        next_executor: 'codex',
        task_id: taskId,
        expected_base_sha: 'a'.repeat(40),
        task_file: 'docs/agent-memory/workstreams/tasks/chat-codex-task-slot.json',
        candidate_sha: null,
        result_file: null,
        updated_at: '2026-08-27T12:00:00.000Z'
    });
}

function bridgeFixture(t, request = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-channel-hardening-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const paths = {
        config: path.join(root, 'config.json'),
        request: path.join(root, 'request.json'),
        result: path.join(root, 'result.json'),
        helper: path.join(root, 'wakeCodexAppViaIpc.js')
    };
    fs.writeFileSync(paths.helper, '// fixture\n');
    fs.writeFileSync(paths.config, JSON.stringify({
        schema: CONFIG_SCHEMA,
        thread_id: '11111111-2222-4333-8444-555555555555',
        chat_url: 'https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        repo_path: 'C:\\protected\\financas-bot',
        git_path: 'C:\\protected\\git.exe',
        branch: 'chat/chat-codex-orchestration-20260824',
        state_path: 'docs/agent-memory/workstreams/chat-codex-channel.state.json'
    }));
    const raw = remoteState();
    fs.writeFileSync(paths.request, JSON.stringify({
        schema: REQUEST_SCHEMA,
        observed_hash: stateHash(raw),
        mode: 'execute',
        created_at: '2026-08-27T12:00:01.000Z',
        ...request
    }));
    return { paths, raw };
}

test('CODEX_READY falha fechado sem executor Codex App e nunca cai no CLI', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-app-only-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const repo = path.join(root, 'repo');
    const runtime = path.join(root, 'runtime');
    const git = path.join(root, 'git.exe');
    fs.mkdirSync(repo);
    fs.writeFileSync(git, 'fixture\n');
    let cliCalls = 0;
    assert.throws(() => pollOnce({ repo, runtime, git }, {
        fetchRemoteState: () => remoteState(),
        syncLocalBranch: () => {},
        listWorktreeEntries: () => [],
        listIgnoredPaths: () => new Set(),
        loadTaskDefinition: () => ({
            task_id: 'ORCH02-HARDENING', objective: 'fixture', required_files: [],
            allowed_paths: ['docs/result.md'], result_file: 'docs/result.md',
            validation: ['teste'], constraints: ['sem produção']
        }),
        runCodex: () => { cliCalls += 1; return 0; }
    }), /executor Codex App obrigatório/);
    assert.equal(cliCalls, 0);
});

test('aviso da tarefa não afirma publicação remota que o modelo não pode provar', () => {
    const prompt = buildWakePrompt({
        chatUrl: 'https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        observedHash: 'a'.repeat(64),
        statePath: 'docs/agent-memory/workstreams/chat-codex-channel.state.json',
        taskId: 'ORCH02-HARDENING', mode: 'execute',
        branch: 'chat/chat-codex-orchestration-20260824',
        repoPath: 'C:\\protected\\financas-bot'
    });
    assert.match(prompt, /Peça ao Chat para verificar o resultado no GitHub/);
    assert.doesNotMatch(prompt, /Resultado publicado no GitHub/);
});

test('ponte deriva destino e tarefa somente da configuração protegida e do estado remoto', t => {
    const { paths, raw } = bridgeFixture(t, {
        schema: LEGACY_REQUEST_SCHEMA,
        task_id: 'EVIL-TASK',
        state_path: 'docs/agent-memory/workstreams/evil.state.json',
        branch: 'evil/branch',
        repo_path: 'C:\\evil\\repo'
    });
    let invocation;
    const result = processWakeRequest(paths, {
        fetchRemoteState: (repoPath, branch, statePath) => {
            assert.equal(repoPath, 'C:\\protected\\financas-bot');
            assert.equal(branch, 'chat/chat-codex-orchestration-20260824');
            assert.equal(statePath,
                'docs/agent-memory/workstreams/chat-codex-channel.state.json');
            return raw;
        },
        invokeWake: value => {
            invocation = value;
            return { status: 'accepted',
                handledByClientId: '99999999-8888-4777-8666-555555555555' };
        }
    });
    assert.equal(result.action, 'accepted');
    assert.equal(invocation.repoPath, 'C:\\protected\\financas-bot');
    assert.equal(invocation.branch, 'chat/chat-codex-orchestration-20260824');
    assert.equal(invocation.statePath,
        'docs/agent-memory/workstreams/chat-codex-channel.state.json');
    assert.equal(invocation.taskId, 'ORCH02-HARDENING');
});

test('hash local divergente do CODEX_READY remoto falha antes do IPC', t => {
    const { paths } = bridgeFixture(t);
    let calls = 0;
    assert.throws(() => processWakeRequest(paths, {
        fetchRemoteState: () => remoteState('OTHER-TASK'),
        invokeWake: () => { calls += 1; }
    }), /hash remoto divergente/);
    assert.equal(calls, 0);
});

test('trava interprocesso impede segundo wake concorrente para o mesmo request', t => {
    const { paths, raw } = bridgeFixture(t);
    let calls = 0;
    const deps = {
        fetchRemoteState: () => raw,
        invokeWake: () => {
            calls += 1;
            assert.deepEqual(processWakeRequest(paths, deps), { action: 'already_running' });
            return { status: 'accepted',
                handledByClientId: '99999999-8888-4777-8666-555555555555' };
        }
    };
    assert.equal(processWakeRequest(paths, deps).action, 'accepted');
    assert.equal(calls, 1);
});

test('pedido legado mode=return é terminalizado e removido sem wake', t => {
    const { paths } = bridgeFixture(t, {
        schema: LEGACY_REQUEST_SCHEMA,
        task_id: 'ORCH02-HARDENING',
        state_path: 'docs/agent-memory/workstreams/chat-codex-channel.state.json',
        mode: 'return',
        branch: 'chat/chat-codex-orchestration-20260824',
        repo_path: 'C:\\protected\\financas-bot'
    });
    let calls = 0;
    assert.deepEqual(processWakeRequest(paths, {
        invokeWake: () => { calls += 1; }
    }), { action: 'legacy_return_rejected' });
    assert.equal(calls, 0);
    assert.equal(fs.existsSync(paths.request), false);
    const store = JSON.parse(fs.readFileSync(paths.result, 'utf8'));
    assert.equal(store.records[0].status, 'failed');
    assert.equal(store.records[0].error_code, 'LEGACY_RETURN_REJECTED');
});
