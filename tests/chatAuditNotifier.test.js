'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { serializeState } = require('../scripts/agent/manageChatCodexOrchestration');
const {
    buildChatAuditMessage,
    maybeWakeCodexApp,
    maybeNotifyChat,
    readCache
} = require('../scripts/agent/watchChatCodexOrchestration');

function fixture(state = 'CHAT_WORKING') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-chat-notify-'));
    const runtime = path.join(root, 'runtime');
    const powershell = path.join(root, 'powershell.exe');
    const notifier = path.join(root, 'notificar_chatgpt.ps1');
    fs.writeFileSync(powershell, 'fixture\n');
    fs.writeFileSync(notifier, 'fixture notifier\n');
    const value = {
        schema: 'financasbot-chat-codex-orchestration-v1',
        orchestration_state: state,
        next_executor: state.startsWith('CODEX_') ? 'codex' : 'chat',
        task_id: 'ORCH-02',
        expected_base_sha: 'a'.repeat(40),
        task_file: 'docs/task.json',
        candidate_sha: 'c'.repeat(40),
        result_file: state === 'CHAT_READY' ? 'docs/result.md' : null,
        updated_at: '2026-09-03T00:00:00.000Z'
    };
    const hash = crypto.createHash('sha256').update(fs.readFileSync(notifier)).digest('hex');
    return {
        notifier, powershell, root, runtime, state: JSON.parse(serializeState(value)),
        options: {
            branch: 'chat/chat-codex-orchestration-20260824',
            'state-path': 'docs/agent-memory/workstreams/chat-codex-channel.state.json',
            'chat-url': 'https://chatgpt.com/c/11111111-1111-1111-1111-111111111111',
            'chat-notifier-script': notifier,
            'chat-notifier-sha256': hash
        }
    };
}

function notificationContext(item, observedHash = 'b'.repeat(64)) {
    return {
        cache: readCache(path.join(item.runtime, 'watcher-state.json')),
        cachePath: path.join(item.runtime, 'watcher-state.json'),
        options: item.options,
        observedHash,
        remoteCommitSha: 'c'.repeat(40),
        state: item.state,
        powershellPath: item.powershell
    };
}

test('campainha usa GitHub imutável e envia uma vez por estado CHAT_READY', () => {
    const item = fixture('CHAT_READY');
    const invocations = [];
    const context = notificationContext(item);
    const first = maybeNotifyChat(context, {
        spawnSync(command, args, spawnOptions) {
            invocations.push({ command, args, spawnOptions });
            return { status: 0, stdout: 'Mensagem enviada e confirmada.\n', stderr: '' };
        }
    });
    assert.equal(first.action, 'sent');
    assert.equal(invocations.length, 1);
    assert.equal(invocations[0].command, item.powershell);
    assert.equal(invocations[0].spawnOptions.shell, false);
    const message = invocations[0].args[invocations[0].args.indexOf('-Message') + 1];
    assert.equal(message, buildChatAuditMessage({
        branch: item.options.branch,
        remoteCommitSha: context.remoteCommitSha,
        statePath: item.options['state-path'],
        state: item.state,
        observedHash: context.observedHash
    }));
    assert.match(message, /task_id=ORCH-02/);
    assert.match(message, /github\.com\/Danieu-san\/financas-bot\/commit\//);
    assert.match(message, /result_file=docs\/result\.md/);

    const second = maybeNotifyChat({ ...context, cache: readCache(context.cachePath) }, {
        spawnSync() { assert.fail('não deve reenviar a mesma campainha'); }
    });
    assert.equal(second.action, 'already_sent');
});

test('campainha só dispara em CHAT_READY e falha de envio pode ser tentada novamente', () => {
    const idle = fixture('CHAT_WORKING');
    let calls = 0;
    assert.equal(maybeNotifyChat(notificationContext(idle), {
        spawnSync() { calls += 1; }
    }).action, null);
    assert.equal(calls, 0);

    const ready = fixture('CHAT_READY');
    const context = notificationContext(ready, 'd'.repeat(64));
    assert.throws(() => maybeNotifyChat(context, {
        spawnSync() {
            calls += 1;
            return { status: 1, stdout: '', stderr: 'falha controlada' };
        }
    }), /notificador do Chat falhou/);
    assert.equal(readCache(context.cachePath).chat_notify_hash, null);
    const retried = maybeNotifyChat({ ...context, cache: readCache(context.cachePath) }, {
        spawnSync() {
            calls += 1;
            return { status: 0, stdout: 'ok', stderr: '' };
        }
    });
    assert.equal(retried.action, 'sent');
    assert.equal(calls, 2);
});

test('script divergente e URL fora da conversa falham antes de executar o bot', () => {
    const item = fixture('CHAT_READY');
    const context = notificationContext(item);
    fs.appendFileSync(item.notifier, 'mudança\n');
    assert.throws(() => maybeNotifyChat(context, {
        spawnSync() { assert.fail('hash divergente não pode executar'); }
    }), /divergiu do SHA-256/);

    const other = fixture('CHAT_READY');
    const invalid = notificationContext(other);
    invalid.options = { ...other.options, 'chat-url': 'https://example.com/c/123' };
    assert.throws(() => maybeNotifyChat(invalid, {
        spawnSync() { assert.fail('URL inválida não pode executar'); }
    }), /chat-url deve apontar/);
});

test('CHAT_READY com bot configurado não usa a ponte direta do Codex App', () => {
    const item = fixture('CHAT_READY');
    const result = maybeWakeCodexApp({
        cache: readCache(path.join(item.runtime, 'watcher-state.json')),
        cachePath: path.join(item.runtime, 'watcher-state.json'),
        observedHash: 'f'.repeat(64),
        state: item.state,
        options: {
            ...item.options,
            'app-thread-id': '11111111-1111-1111-1111-111111111111'
        }
    }, {
        wakeCodexApp() { assert.fail('a ponte direta não deve ser chamada no retorno'); }
    });
    assert.equal(result.action, null);
});
