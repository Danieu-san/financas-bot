'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { serializeState, stateHash } = require('../scripts/agent/manageChatCodexOrchestration');
const {
    defaultCache,
    pollOnce,
    queueCodexAppWakeRequest,
    readCache,
    runGit,
    syncLocalBranch,
    wakeCodexApp
} = require('../scripts/agent/watchChatCodexOrchestration');

function fixture(state = 'CHAT_WORKING') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-watch-sync-'));
    const repo = path.join(root, 'repo'), runtime = path.join(root, 'runtime');
    const codex = path.join(root, 'codex.ps1'), git = path.join(root, 'git.exe');
    const powershell = path.join(root, 'pwsh.exe');
    fs.mkdirSync(repo);
    for (const file of [codex, git, powershell]) fs.writeFileSync(file, 'fixture\n');
    const value = {
        schema: 'financasbot-chat-codex-orchestration-v1',
        orchestration_state: state,
        next_executor: state.startsWith('CODEX_') ? 'codex' : 'chat',
        task_id: 'ORCH-01',
        expected_base_sha: 'a'.repeat(40),
        task_file: 'docs/task.md',
        candidate_sha: null,
        result_file: state === 'CHAT_READY' ? 'docs/result.md' : null,
        updated_at: '2026-08-24T00:00:00.000Z'
    };
    return { codex, git, powershell, repo, runtime, raw: serializeState(value) };
}

function withState(raw, state, updatedAt = '2026-08-24T00:02:00.000Z') {
    const value = JSON.parse(raw);
    value.orchestration_state = state;
    value.next_executor = state.startsWith('CODEX_') ? 'codex' : 'chat';
    value.updated_at = updatedAt;
    value.result_file = state === 'CHAT_READY' ? 'docs/result.md' : null;
    return serializeState(value);
}

function watcherOptions(item, extra = {}) {
    return {
        repo: item.repo,
        runtime: item.runtime,
        codex: item.codex,
        git: item.git,
        powershell: item.powershell,
        ...extra
    };
}

function executorDeps(deps = {}) {
    return {
        syncLocalBranch: () => {},
        loadTaskDefinition: () => ({
            task_id: 'ORCH-01', objective: 'fixture', required_files: [],
            allowed_paths: ['docs/result.md'], result_file: 'docs/result.md',
            validation: ['teste'], constraints: ['sem produção']
        }),
        ...deps
    };
}

test('CHAT_READY acorda Codex App uma vez por hash', () => {
    const item = fixture('CHAT_READY');
    const calls = [];
    const options = watcherOptions(item, {
        'app-thread-id': '11111111-2222-4333-8444-555555555555',
        'chat-url': 'https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    });
    const deps = {
        fetchRemoteState: () => item.raw,
        wakeCodexApp: value => calls.push(value)
    };
    assert.equal(pollOnce(options, deps).action, 'app_wake_accepted');
    assert.equal(pollOnce(options, deps).action, 'unchanged');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].taskId, 'ORCH-01');
    const cache = readCache(path.join(item.runtime, 'watcher-state.json'));
    assert.equal(cache.app_wake_status, 'accepted');
    assert.equal(cache.app_wake_hash.length, 64);
});

test('CHAT_READY enfileira hash, tarefa e estado exatos para a ponte S4U', () => {
    const item = fixture('CHAT_READY');
    const queue = path.join(item.runtime, 'bridge', 'request.json');
    fs.mkdirSync(path.dirname(queue), { recursive: true });
    const options = watcherOptions(item, { 'app-wake-request': queue });
    assert.equal(pollOnce(options, { fetchRemoteState: () => item.raw }).action,
        'app_wake_queued');
    assert.equal(pollOnce(options, { fetchRemoteState: () => item.raw }).action, 'unchanged');
    const request = JSON.parse(fs.readFileSync(queue, 'utf8'));
    assert.deepEqual(Object.keys(request), [
        'schema', 'observed_hash', 'task_id', 'state_path', 'created_at'
    ]);
    assert.equal(request.schema, 'financasbot-codex-app-wake-request-v2');
    assert.equal(request.observed_hash, stateHash(item.raw));
    assert.equal(request.task_id, 'ORCH-01');
    assert.equal(request.state_path,
        'docs/agent-memory/workstreams/chat-codex-channel.state.json');
    assert.equal(readCache(path.join(item.runtime, 'watcher-state.json')).app_wake_status, 'queued');
});

test('fila da ponte exige caminho absoluto e recusa symlink', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-wake-queue-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    assert.throws(() => queueCodexAppWakeRequest({
        observedHash: 'a'.repeat(64), requestPath: 'request.json',
        statePath: 'docs/agent-memory/workstreams/channel.state.json', taskId: 'ORCH-01'
    }), /deve ser absoluto/);
    const target = path.join(root, 'request.json');
    const source = path.join(root, 'source.json');
    fs.writeFileSync(source, '{}');
    try {
        fs.symlinkSync(source, target, 'file');
    } catch (error) {
        if (process.platform === 'win32' && error.code === 'EPERM') return;
        throw error;
    }
    assert.throws(() => queueCodexAppWakeRequest({
        observedHash: 'a'.repeat(64), requestPath: target,
        statePath: 'docs/agent-memory/workstreams/channel.state.json', taskId: 'ORCH-01'
    }), /link simbólico/);
});

test('launcher do wake chama helper Node sem shell', () => {
    let invocation;
    const result = wakeCodexApp({
        chatUrl: 'https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        observedHash: 'a'.repeat(64),
        statePath: 'docs/agent-memory/workstreams/chat-codex-channel.state.json',
        taskId: 'ORCH-01',
        threadId: '11111111-2222-4333-8444-555555555555'
    }, {
        spawnSync(command, args, options) {
            invocation = { command, args, options };
            return {
                status: 0,
                stdout: '{"status":"accepted","handledByClientId":"99999999-8888-4777-8666-555555555555"}\n',
                stderr: ''
            };
        }
    });
    assert.equal(invocation.command, process.execPath);
    assert.match(invocation.args[0], /wakeCodexAppViaIpc\.js$/);
    assert.equal(invocation.options.windowsHide, true);
    assert.equal(result.status, 'accepted');
});

test('launcher recusa aceite IPC sem cliente do Codex App confirmado', () => {
    assert.throws(() => wakeCodexApp({
        chatUrl: 'https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        observedHash: 'a'.repeat(64),
        statePath: 'docs/agent-memory/workstreams/chat-codex-channel.state.json',
        taskId: 'ORCH-01',
        threadId: '11111111-2222-4333-8444-555555555555'
    }, {
        spawnSync: () => ({ status: 0, stdout: '{"status":"accepted"}\n', stderr: '' })
    }), /não confirmou o cliente/);
});

test('wake falho fica terminal para o mesmo hash', () => {
    const item = fixture('CHAT_READY');
    let calls = 0;
    const options = watcherOptions(item, {
        'app-thread-id': '11111111-2222-4333-8444-555555555555',
        'chat-url': 'https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    });
    assert.throws(() => pollOnce(options, {
        fetchRemoteState: () => item.raw,
        wakeCodexApp() { calls += 1; throw new Error('IPC indisponível'); }
    }), /IPC indisponível/);
    assert.equal(pollOnce(options, {
        fetchRemoteState: () => item.raw,
        wakeCodexApp() { calls += 1; }
    }).action, 'unchanged');
    assert.equal(calls, 1);
    assert.equal(readCache(path.join(item.runtime, 'watcher-state.json')).app_wake_status, 'failed');
});

test('hash novo de CODEX_READY permite novo disparo', () => {
    const item = fixture('CODEX_READY');
    let raw = item.raw, launches = 0;
    const deps = executorDeps({
        fetchRemoteState: () => raw,
        runCodex: () => { launches += 1; raw = withState(raw, 'CHAT_READY'); return 0; },
        publishLocalResult: () => {}
    });
    pollOnce(watcherOptions(item), deps);
    raw = withState(raw, 'CODEX_READY', '2026-08-24T00:03:00.000Z');
    assert.equal(pollOnce(watcherOptions(item), deps).action, 'launched');
    assert.equal(launches, 2);
});

test('canal reutiliza CHAT_WORKING entre duas tarefas distintas', () => {
    const item = fixture('CODEX_READY');
    let raw = item.raw, launches = 0;
    const deps = executorDeps({
        fetchRemoteState: () => raw,
        loadTaskDefinition: (_repo, _file, taskId) => ({
            task_id: taskId, objective: `executar ${taskId}`, required_files: [],
            allowed_paths: ['docs/result.md'], result_file: 'docs/result.md',
            validation: ['teste'], constraints: ['sem produção']
        }),
        runCodex: ({ prompt }) => {
            launches += 1;
            assert.match(prompt, new RegExp(`executar JOB-${launches}`));
            raw = withState(raw, 'CHAT_READY');
            return 0;
        },
        publishLocalResult: () => {}
    });
    let value = JSON.parse(raw);
    value.task_id = 'JOB-1';
    raw = serializeState(value);
    assert.equal(pollOnce(watcherOptions(item), deps).action, 'launched');

    raw = withState(raw, 'CHAT_WORKING', '2026-08-24T00:03:00.000Z');
    assert.equal(pollOnce(watcherOptions(item), deps).state, 'CHAT_WORKING');
    value = JSON.parse(raw);
    value.task_id = 'JOB-2';
    value.orchestration_state = 'CODEX_READY';
    value.next_executor = 'codex';
    value.result_file = null;
    value.updated_at = '2026-08-24T00:04:00.000Z';
    raw = serializeState(value);
    assert.equal(pollOnce(watcherOptions(item), deps).action, 'launched');
    assert.equal(launches, 2);
});

test('sincronização exige worktree limpa, branch exata e fast-forward do FETCH_HEAD', () => {
    const item = fixture('CODEX_READY');
    const statePath = 'docs/agent-memory/workstreams/chat-codex-orchestration.state.json';
    fs.mkdirSync(path.join(item.repo, 'docs', 'agent-memory', 'workstreams'), { recursive: true });
    fs.writeFileSync(path.join(item.repo, ...statePath.split('/')), item.raw);
    const commands = [];
    const result = syncLocalBranch({
        repoPath: item.repo,
        branch: 'chat/test',
        statePath,
        observedHash: stateHash(item.raw)
    }, {
        runGit(repoPath, args) {
            commands.push(args);
            if (args[0] === 'status') return '';
            if (args[0] === 'branch') return 'chat/test\n';
            return '';
        }
    });
    assert.equal(result, item.raw);
    assert.deepEqual(commands, [
        ['status', '--porcelain=v1', '--untracked-files=all'],
        ['branch', '--show-current'],
        ['merge', '--ff-only', 'FETCH_HEAD']
    ]);
});

test('operações Git do watcher usam o executável absoluto validado', () => {
    const item = fixture();
    let invocation;
    runGit(item.repo, ['status', '--short'], {
        gitCommand: item.git,
        spawnSync(command, args, options) {
            invocation = { command, args, options };
            return { status: 0, stdout: '', stderr: '' };
        }
    });
    assert.equal(invocation.command, item.git);
    assert.equal(invocation.args[0], '-c');
    assert.match(invocation.args[1], /^safe\.directory=/);
    assert.equal(invocation.options.windowsHide, true);
});

test('falha de sincronização é terminal para o hash e não chama Codex', () => {
    const item = fixture('CODEX_READY');
    let launches = 0;
    const deps = {
        fetchRemoteState: () => item.raw,
        syncLocalBranch: () => { throw new Error('worktree do watcher deve estar limpa'); },
        runCodex: () => { launches += 1; return 0; }
    };
    assert.throws(() => pollOnce(watcherOptions(item), deps), /worktree do watcher deve estar limpa/);
    assert.equal(launches, 0);
    assert.equal(readCache(path.join(item.runtime, 'watcher-state.json')).launch_status,
        'failed:sync_error');
    assert.equal(pollOnce(watcherOptions(item), deps).action, 'unchanged');
});

test('retry manual exige limpar launched_hash, sem alterar o estado remoto', () => {
    const item = fixture('CODEX_READY');
    let launches = 0, raw = item.raw;
    const deps = executorDeps({
        fetchRemoteState: () => raw,
        runCodex: () => { launches += 1; raw = withState(raw, 'CHAT_READY'); return 0; },
        publishLocalResult: () => {}
    });
    const cachePath = path.join(item.runtime, 'watcher-state.json');
    fs.mkdirSync(item.runtime, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({
        ...defaultCache(),
        observed_hash: stateHash(item.raw),
        observed_state: 'CODEX_READY',
        launched_hash: null,
        launch_status: null
    }));
    assert.equal(pollOnce(watcherOptions(item), deps).action, 'launched');
    assert.equal(launches, 1);
});
