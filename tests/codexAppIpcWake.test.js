'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    FrameDecoder,
    IPC_PATH,
    buildStartTurnRequest,
    buildWakePrompt,
    frameMessage,
    parseArgs
} = require('../scripts/agent/wakeCodexAppViaIpc');

const threadId = '11111111-2222-4333-8444-555555555555';
const chatUrl = 'https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const statePath = 'docs/agent-memory/workstreams/chat-codex-channel.state.json';

test('protocolo IPC usa pipe local fixo e start-turn versão 2', () => {
    const request = buildStartTurnRequest({
        chatUrl,
        observedHash: 'a'.repeat(64),
        requestId: 'request-1',
        statePath,
        taskId: 'ORCH-01',
        threadId
    });
    assert.equal(IPC_PATH, '\\\\.\\pipe\\codex-ipc');
    assert.equal(request.method, 'thread-follower-start-turn');
    assert.equal(request.version, 2);
    assert.equal(request.params.conversationId, threadId);
    assert.equal(request.params.turnStart.request.threadId, threadId);
    assert.equal(request.params.turnStart.request.input.length, 1);
    assert.match(request.params.turnStart.request.input[0].text,
        /envie exatamente: ORCH_WAKE ORCH-01 [a-f0-9]{64} docs\/agent-memory\/workstreams\/chat-codex-channel\.state\.json/);
    assert.deepEqual(request.params.turnStart.context.attachments, []);
});

test('codec IPC recompõe frames fragmentados e múltiplos', () => {
    const first = frameMessage({ type: 'one', value: 'á' });
    const second = frameMessage({ type: 'two', value: 2 });
    const decoder = new FrameDecoder();
    assert.deepEqual(decoder.push(first.subarray(0, 3)), []);
    assert.deepEqual(decoder.push(Buffer.concat([first.subarray(3), second])), [
        { type: 'one', value: 'á' },
        { type: 'two', value: 2 }
    ]);
});

test('prompt identifica tarefa e estado exatos sem dados privados', () => {
    const prompt = buildWakePrompt({
        chatUrl, observedHash: 'b'.repeat(64), statePath, taskId: 'ORCH02-POC-1'
    });
    assert.match(prompt, /GitHub\/CHAT_READY/);
    assert.match(prompt, /ORCH02-POC-1/);
    assert.match(prompt, /chat-codex-channel\.state\.json/);
    assert.match(prompt, /Use somente a ferramenta Browser/);
    assert.match(prompt, /Depois de confirmar o envio, termine/);
    assert.doesNotMatch(prompt, /senha|token|\.env/i);
});

test('validação rejeita destino externo e argumentos incompletos', () => {
    assert.throws(() => buildWakePrompt({
        chatUrl: 'https://example.com/c/abc',
        observedHash: 'b'.repeat(64),
        statePath,
        taskId: 'ORCH-01'
    }), /chat-url deve apontar/);
    assert.throws(() => buildWakePrompt({
        chatUrl, observedHash: 'b'.repeat(64), statePath: '../private.state.json',
        taskId: 'ORCH-01'
    }), /state-path de wake inválido/);
    assert.throws(() => parseArgs(['--thread-id']), /argumento inválido/);
});
