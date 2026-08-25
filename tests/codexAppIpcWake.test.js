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

const threadId = '019f5b91-d615-7032-bc2b-3f1203becb4b';
const chatUrl = 'https://chatgpt.com/c/6a8ba15e-21b0-83e9-add4-76799c4df087';

test('protocolo IPC usa pipe local fixo e start-turn versão 2', () => {
    const request = buildStartTurnRequest({
        chatUrl,
        observedHash: 'a'.repeat(64),
        requestId: 'request-1',
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
        /envie exatamente: ORCH_WAKE ORCH-01/);
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

test('prompt é campainha mínima sem dados do projeto', () => {
    const prompt = buildWakePrompt({ chatUrl, observedHash: 'b'.repeat(64), taskId: 'ORCH-01' });
    assert.match(prompt, /GitHub\/CHAT_READY/);
    assert.match(prompt, /Use somente a ferramenta Browser/);
    assert.match(prompt, /Depois de confirmar o envio, termine/);
    assert.doesNotMatch(prompt, /senha|token|\.env/i);
});

test('validação rejeita destino externo e argumentos incompletos', () => {
    assert.throws(() => buildWakePrompt({
        chatUrl: 'https://example.com/c/abc',
        observedHash: 'b'.repeat(64),
        taskId: 'ORCH-01'
    }), /chat-url deve apontar/);
    assert.throws(() => parseArgs(['--thread-id']), /argumento inválido/);
});

