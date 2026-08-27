'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    CONFIG_SCHEMA,
    LEGACY_RESULT_SCHEMA,
    REQUEST_SCHEMA,
    RESULT_SCHEMA,
    invokeWake,
    processWakeRequest
} = require('../scripts/agent/processCodexAppWakeRequest');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-app-bridge-'));
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
        chat_url: 'https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    }));
    fs.writeFileSync(paths.request, JSON.stringify({
        schema: REQUEST_SCHEMA,
        observed_hash: 'a'.repeat(64),
        task_id: 'ORCH02-POC-1',
        state_path: 'docs/agent-memory/workstreams/chat-codex-channel.state.json',
        mode: 'execute',
        branch: 'chat/chat-codex-orchestration-20260824',
        repo_path: 'C:\\workspace\\financas-bot',
        created_at: '2026-08-25T00:00:00.000Z'
    }));
    return paths;
}

test('ponte usa configuração protegida e processa cada hash no máximo uma vez', t => {
    const paths = fixture(t);
    let calls = 0;
    const deps = {
        now: () => new Date('2026-08-25T00:01:00.000Z'),
        invokeWake({ config, observedHash, statePath, taskId }) {
            calls += 1;
            assert.equal(config.chat_url, 'https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
            assert.match(observedHash, /^[ab]{64}$/);
            assert.equal(taskId, 'ORCH02-POC-1');
            assert.equal(statePath, 'docs/agent-memory/workstreams/chat-codex-channel.state.json');
            return { status: 'accepted', handledByClientId: '99999999-8888-4777-8666-555555555555' };
        }
    };
    assert.equal(processWakeRequest(paths, deps).action, 'accepted');
    assert.deepEqual(JSON.parse(fs.readFileSync(paths.result, 'utf8')), {
        schema: RESULT_SCHEMA,
        records: [{
            observed_hash: 'a'.repeat(64),
            status: 'accepted',
            updated_at: '2026-08-25T00:01:00.000Z',
            handled_by_client_id: '99999999-8888-4777-8666-555555555555',
            error_code: null
        }]
    });
    assert.equal(processWakeRequest(paths, deps).action, 'already_processed');
    assert.equal(calls, 1);

    fs.writeFileSync(paths.request, JSON.stringify({
        schema: REQUEST_SCHEMA,
        observed_hash: 'b'.repeat(64),
        task_id: 'ORCH02-POC-1',
        state_path: 'docs/agent-memory/workstreams/chat-codex-channel.state.json',
        mode: 'execute', branch: 'chat/chat-codex-orchestration-20260824',
        repo_path: 'C:\\workspace\\financas-bot',
        created_at: '2026-08-25T00:02:00.000Z'
    }));
    assert.equal(processWakeRequest(paths, deps).action, 'accepted');
    assert.equal(calls, 2);

    fs.writeFileSync(paths.request, JSON.stringify({
        schema: REQUEST_SCHEMA,
        observed_hash: 'a'.repeat(64),
        task_id: 'ORCH02-POC-1',
        state_path: 'docs/agent-memory/workstreams/chat-codex-channel.state.json',
        mode: 'execute', branch: 'chat/chat-codex-orchestration-20260824',
        repo_path: 'C:\\workspace\\financas-bot',
        created_at: '2026-08-25T00:03:00.000Z'
    }));
    assert.equal(processWakeRequest(paths, deps).action, 'already_processed');
    assert.equal(calls, 2);
});

test('falha fica terminal para o mesmo hash sem duplicar campainha', t => {
    const paths = fixture(t);
    let calls = 0;
    const deps = {
        invokeWake() { calls += 1; throw new Error('pipe indisponível'); }
    };
    assert.throws(() => processWakeRequest(paths, deps), /pipe indisponível/);
    const result = JSON.parse(fs.readFileSync(paths.result, 'utf8'));
    assert.equal(result.records[0].status, 'failed');
    assert.equal(result.records[0].error_code, 'IPC_WAKE_FAILED');
    assert.equal(processWakeRequest(paths, deps).action, 'already_processed');
    assert.equal(calls, 1);
});

test('marcador legado preserva o hash já terminal durante a migração', t => {
    const paths = fixture(t);
    fs.writeFileSync(paths.result, JSON.stringify({
        schema: LEGACY_RESULT_SCHEMA,
        observed_hash: 'a'.repeat(64),
        status: 'accepted',
        updated_at: '2026-08-25T00:00:30.000Z',
        handled_by_client_id: '99999999-8888-4777-8666-555555555555',
        error_code: null
    }));
    let calls = 0;
    assert.equal(processWakeRequest(paths, {
        invokeWake() { calls += 1; }
    }).action, 'already_processed');
    assert.equal(calls, 0);
});

test('pedido gravável não pode injetar destino, tarefa ou prompt', t => {
    const paths = fixture(t);
    const request = JSON.parse(fs.readFileSync(paths.request, 'utf8'));
    request.chat_url = 'https://example.com/';
    fs.writeFileSync(paths.request, JSON.stringify(request));
    assert.throws(() => processWakeRequest(paths), /schema inválido/);
});

test('ponte recusa pedido legado de retorno ao Chat', t => {
    const paths = fixture(t);
    const request = JSON.parse(fs.readFileSync(paths.request, 'utf8'));
    request.mode = 'return';
    fs.writeFileSync(paths.request, JSON.stringify(request));
    assert.throws(() => processWakeRequest(paths), /mode inválido/);
});

test('ponte recusa pedido ou marcador idempotente por link simbólico', t => {
    const paths = fixture(t);
    const original = path.join(path.dirname(paths.request), 'original.json');
    fs.renameSync(paths.request, original);
    try {
        fs.symlinkSync(original, paths.request, 'file');
    } catch (error) {
        if (process.platform === 'win32' && error.code === 'EPERM') return;
        throw error;
    }
    assert.throws(() => processWakeRequest(paths), /request deve ser arquivo regular/);
});

test('launcher da ponte chama helper protegido sem shell', () => {
    let invocation;
    const response = invokeWake({
        config: {
            thread_id: '11111111-2222-4333-8444-555555555555',
            chat_url: 'https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
        },
        helperPath: 'C:\\ProgramData\\FinancasBot\\bridge\\wake.js',
        observedHash: 'b'.repeat(64),
        statePath: 'docs/agent-memory/workstreams/chat-codex-channel.state.json',
        taskId: 'ORCH02-POC-1', mode: 'execute',
        branch: 'chat/chat-codex-orchestration-20260824',
        repoPath: 'C:\\workspace\\financas-bot'
    }, {
        spawnSync(command, args, options) {
            invocation = { command, args, options };
            return {
                status: 0,
                stdout: '{"status":"accepted","handledByClientId":"99999999-8888-4777-8666-555555555555"}',
                stderr: ''
            };
        }
    });
    assert.equal(invocation.command, process.execPath);
    assert.equal(invocation.options.windowsHide, true);
    assert.equal(invocation.options.shell, undefined);
    assert.deepEqual(invocation.args.slice(-10), [
        '--task-id', 'ORCH02-POC-1', '--state-path',
        'docs/agent-memory/workstreams/chat-codex-channel.state.json',
        '--mode', 'execute', '--branch', 'chat/chat-codex-orchestration-20260824',
        '--repo-path', 'C:\\workspace\\financas-bot'
    ]);
    assert.equal(response.status, 'accepted');
});

test('instalador usa S4U limitado e executa somente cópia protegida em ProgramData', () => {
    const installer = fs.readFileSync(path.join(
        __dirname, '..', 'scripts', 'agent', 'Install-CodexAppWakeBridge.ps1'
    ), 'utf8');
    assert.match(installer, /LogonType S4U/);
    assert.match(installer, /RunLevel Limited/);
    assert.match(installer, /ProgramData/);
    assert.match(installer, /SetAccessRuleProtection\(\$true, \$false\)/);
    assert.match(installer, /Set-BridgeAcl \$inboxPath \$true/);
    assert.match(installer, /Set-BridgeAcl \$statePath \$false/);
    assert.match(installer, /Copy-Item -LiteralPath \$workerSource -Destination \$workerInstalled/);
    assert.match(installer, /Copy-Item -LiteralPath \$helperSource -Destination \$helperInstalled/);
    assert.doesNotMatch(installer, /RunLevel Highest|NT AUTHORITY\\SYSTEM.*Principal/);
    assert.match(installer, /raiz da ponte inesperada/);
    const installedSchema = installer.match(
        /schema\s*=\s*'(financasbot-codex-app-wake-bridge-config-v\d+)'/
    )?.[1];
    assert.equal(installedSchema, CONFIG_SCHEMA,
        'schema gravado pelo instalador deve ser o aceito pelo worker');
});
