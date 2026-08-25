'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    CONFIG_SCHEMA,
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
        thread_id: '019f5b91-d615-7032-bc2b-3f1203becb4b',
        chat_url: 'https://chatgpt.com/c/6a8ba15e-21b0-83e9-add4-76799c4df087',
        task_id: 'ORCH-01'
    }));
    fs.writeFileSync(paths.request, JSON.stringify({
        schema: REQUEST_SCHEMA,
        observed_hash: 'a'.repeat(64),
        created_at: '2026-08-25T00:00:00.000Z'
    }));
    return paths;
}

test('ponte usa configuração protegida e processa cada hash no máximo uma vez', t => {
    const paths = fixture(t);
    let calls = 0;
    const deps = {
        now: () => new Date('2026-08-25T00:01:00.000Z'),
        invokeWake({ config, observedHash }) {
            calls += 1;
            assert.equal(config.task_id, 'ORCH-01');
            assert.equal(observedHash, 'a'.repeat(64));
            return { status: 'accepted', handledByClientId: '8aae4c18-47d2-4b50-963f-6241eb9c3074' };
        }
    };
    assert.equal(processWakeRequest(paths, deps).action, 'accepted');
    assert.deepEqual(JSON.parse(fs.readFileSync(paths.result, 'utf8')), {
        schema: RESULT_SCHEMA,
        observed_hash: 'a'.repeat(64),
        status: 'accepted',
        updated_at: '2026-08-25T00:01:00.000Z',
        handled_by_client_id: '8aae4c18-47d2-4b50-963f-6241eb9c3074',
        error_code: null
    });
    assert.equal(processWakeRequest(paths, deps).action, 'already_processed');
    assert.equal(calls, 1);
});

test('falha fica terminal para o mesmo hash sem duplicar campainha', t => {
    const paths = fixture(t);
    let calls = 0;
    const deps = {
        invokeWake() { calls += 1; throw new Error('pipe indisponível'); }
    };
    assert.throws(() => processWakeRequest(paths, deps), /pipe indisponível/);
    const result = JSON.parse(fs.readFileSync(paths.result, 'utf8'));
    assert.equal(result.status, 'failed');
    assert.equal(result.error_code, 'IPC_WAKE_FAILED');
    assert.equal(processWakeRequest(paths, deps).action, 'already_processed');
    assert.equal(calls, 1);
});

test('pedido gravável não pode injetar destino, tarefa ou prompt', t => {
    const paths = fixture(t);
    const request = JSON.parse(fs.readFileSync(paths.request, 'utf8'));
    request.chat_url = 'https://example.com/';
    fs.writeFileSync(paths.request, JSON.stringify(request));
    assert.throws(() => processWakeRequest(paths), /schema inválido/);
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
            thread_id: '019f5b91-d615-7032-bc2b-3f1203becb4b',
            chat_url: 'https://chatgpt.com/c/6a8ba15e-21b0-83e9-add4-76799c4df087',
            task_id: 'ORCH-01'
        },
        helperPath: 'C:\\ProgramData\\FinancasBot\\bridge\\wake.js',
        observedHash: 'b'.repeat(64)
    }, {
        spawnSync(command, args, options) {
            invocation = { command, args, options };
            return {
                status: 0,
                stdout: '{"status":"accepted","handledByClientId":"8aae4c18-47d2-4b50-963f-6241eb9c3074"}',
                stderr: ''
            };
        }
    });
    assert.equal(invocation.command, process.execPath);
    assert.equal(invocation.options.windowsHide, true);
    assert.equal(invocation.options.shell, undefined);
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
});
