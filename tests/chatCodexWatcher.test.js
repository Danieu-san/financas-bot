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
    const powershell = path.join(root, 'pwsh.exe');
    fs.mkdirSync(repo);
    fs.writeFileSync(codex, 'exit 0\n');
    fs.writeFileSync(powershell, 'fixture\n');
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
    return { codex, powershell, repo, root, runtime, raw: serializeState(value) };
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
        powershell: item.powershell,
        ...extra
    };
}

test('poll inalterado não desperta executor', () => {
    const item = fixture();
    let launches = 0;
    const deps = {
        fetchRemoteState: () => item.raw,
        runCodex: () => { launches += 1; return 0; },
        now: () => new Date('2026-08-24T01:00:00.000Z')
    };
    const options = watcherOptions(item);
    assert.equal(pollOnce(options, deps).action, 'observed');
    assert.equal(pollOnce(options, deps).action, 'unchanged');
    assert.equal(launches, 0);
});

test('CODEX_READY novo dispara exatamente uma vez', () => {
    const item = fixture('CODEX_READY');
    let launches = 0;
    let raw = item.raw;
    const deps = {
        fetchRemoteState: () => raw,
        runCodex: ({ prompt }) => {
            launches += 1;
            assert.match(prompt, /ORCH-01/);
            assert.doesNotMatch(prompt, /produção.*alter/i);
            raw = withState(raw, 'CHAT_READY');
            return 0;
        }
    };
    const options = watcherOptions(item);
    assert.equal(pollOnce(options, deps).action, 'launched');
    assert.equal(pollOnce(options, deps).action, 'unchanged');
    assert.equal(launches, 1);
    const cache = readCache(path.join(item.runtime, 'watcher-state.json'));
    assert.equal(cache.launch_status, 'succeeded');
    assert.equal(cache.observed_state, 'CHAT_READY');
});

test('hash novo de CODEX_READY permite novo disparo', () => {
    const item = fixture('CODEX_READY');
    let raw = item.raw;
    let launches = 0;
    const deps = {
        fetchRemoteState: () => raw,
        runCodex: () => {
            launches += 1;
            raw = withState(raw, 'CHAT_READY');
            return 0;
        }
    };
    const options = watcherOptions(item);
    pollOnce(options, deps);
    raw = withState(raw, 'CODEX_READY', '2026-08-24T00:03:00.000Z');
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

test('lock de PID comprovadamente morto é recuperado uma única vez', () => {
    const item = fixture();
    const cachePath = path.join(item.runtime, 'watcher-state.json');
    fs.mkdirSync(item.runtime);
    fs.writeFileSync(`${cachePath}.lock`, JSON.stringify({
        pid: 999999,
        created_at: '2026-08-24T00:00:00.000Z'
    }));
    let executions = 0;
    const result = withWatcherLock(cachePath, () => {
        executions += 1;
        return { action: 'recovered' };
    }, { processIsAlive: () => false });
    assert.deepEqual(result, { action: 'recovered' });
    assert.equal(executions, 1);
    assert.equal(fs.existsSync(`${cachePath}.lock`), false);
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
    assert.match(prompt, /SHA-256 dos bytes serializados/);
    assert.match(prompt, /não é SHA de commit nem FETCH_HEAD/);
});

test('exit zero sem CHAT_READY falha fechado e não relança o mesmo hash', () => {
    const item = fixture('CODEX_READY');
    let launches = 0;
    const deps = {
        fetchRemoteState: () => item.raw,
        runCodex: () => { launches += 1; return 0; }
    };
    const options = watcherOptions(item);
    const result = pollOnce(options, deps);
    assert.equal(result.action, 'launched');
    assert.equal(result.finalState, 'CODEX_READY');
    assert.equal(readCache(path.join(item.runtime, 'watcher-state.json')).launch_status,
        'failed:state_not_advanced');
    assert.equal(pollOnce(options, deps).action, 'unchanged');
    assert.equal(launches, 1);
});

test('launcher PowerShell usa argumentos fixos sem shell', () => {
    const item = fixture();
    let invocation;
    const status = runCodex({
        codexPath: item.codex,
        powershellPath: item.powershell,
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
    assert.equal(invocation.command, item.powershell);
    assert.equal(invocation.options.input, 'no-op');
    assert.equal(invocation.options.windowsHide, true);
    assert.equal(invocation.args.includes('--full-auto'), false);
    assert.equal(invocation.args.includes('workspace-write'), true);
    assert.equal(invocation.args.includes('gpt-5.4-mini'), true);
    assert.equal(invocation.args.includes('gpt-5.4'), false);
    assert.equal(invocation.args.includes('gpt-5.6-sol'), false);
    assert.equal(invocation.args.at(-1), '-');
});

test('branch iniciada por hífen falha antes de chamar Git ou Codex', () => {
    const item = fixture('CODEX_READY');
    let fetched = false;
    assert.throws(() => pollOnce(watcherOptions(item, {
        branch: '-upload-pack=malicioso'
    }), {
        fetchRemoteState() { fetched = true; return item.raw; },
        runCodex() { assert.fail('não deveria chamar Codex'); }
    }), /branch inválida/);
    assert.equal(fetched, false);
});

test('falha de spawn é persistida e o mesmo hash não relança', () => {
    const item = fixture('CODEX_READY');
    let launches = 0;
    const deps = {
        fetchRemoteState: () => item.raw,
        runCodex: () => { launches += 1; throw new Error('spawn falhou'); }
    };
    assert.throws(() => pollOnce(watcherOptions(item), deps), /spawn falhou/);
    const cachePath = path.join(item.runtime, 'watcher-state.json');
    assert.equal(readCache(cachePath).launch_status, 'failed:error');
    assert.equal(pollOnce(watcherOptions(item), deps).action, 'unchanged');
    assert.equal(launches, 1);
});

test('instalador recusa apagar lock sem provar PID morto', () => {
    const installer = fs.readFileSync(path.join(
        __dirname,
        '..',
        'scripts',
        'agent',
        'Install-ChatCodexOrchestrationWatcher.ps1'
    ), 'utf8');
    assert.match(installer, /Get-Command powershell\.exe -ErrorAction Stop/);
    assert.match(installer, /if \(\$task -and \$task\.State -eq 'Running'\)/);
    assert.match(installer, /ConvertFrom-Json -ErrorAction Stop/);
    assert.match(installer, /Get-Process -Id \$lockPid -ErrorAction SilentlyContinue/);
    assert.match(installer, /Lock pertence ao processo vivo/);
    assert.match(installer, /Lock malformado/);
    assert.equal((installer.match(/Remove-Item -LiteralPath \$lockPath -Force/g) || []).length, 1);
    assert.match(installer, /Assert-WatcherLifecycleSafe[\s\S]*?'Install' \{\s*Assert-WatcherLifecycleSafe/);
    assert.match(installer, /'Remove' \{\s*Assert-WatcherLifecycleSafe/);
});
