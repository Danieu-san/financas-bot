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
const branch = 'chat/chat-codex-orchestration-20260824';
const repoPath = 'C:\\workspace\\financas-bot';

test('protocolo IPC usa pipe local fixo e inicia somente execução', () => {
    const request = buildStartTurnRequest({
        chatUrl,
        observedHash: 'a'.repeat(64),
        requestId: 'request-1',
        statePath,
        taskId: 'ORCH-01', mode: 'execute', branch, repoPath,
        threadId
    });
    assert.equal(IPC_PATH, '\\\\.\\pipe\\codex-ipc');
    assert.equal(request.method, 'thread-follower-start-turn');
    assert.equal(request.version, 2);
    assert.equal(request.params.conversationId, threadId);
    assert.equal(request.params.turnStart.request.threadId, threadId);
    assert.equal(request.params.turnStart.request.input.length, 1);
    assert.match(request.params.turnStart.request.input[0].text,
        /Tarefa ORCH-01 encerrada\. Peça ao Chat para verificar o resultado no GitHub/);
    assert.doesNotMatch(request.params.turnStart.request.input[0].text,
        /Resultado publicado no GitHub/);
    assert.doesNotMatch(request.params.turnStart.request.input[0].text, /ORCH_WAKE/);
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

test('prompt recusa modo de retorno ao Chat', () => {
    assert.throws(() => buildWakePrompt({
        chatUrl, observedHash: 'b'.repeat(64), statePath, taskId: 'ORCH02-POC-1',
        mode: 'return', branch, repoPath
    }), /mode de wake inválido/);
});

test('prompt execute entrega Git e manifesto ao App sem usar Browser', () => {
    const prompt = buildWakePrompt({
        chatUrl, observedHash: 'c'.repeat(64), statePath, taskId: 'ORCH02-POC-2',
        mode: 'execute', branch, repoPath
    });
    assert.match(prompt, /GitHub\/CODEX_READY/);
    assert.match(prompt, /task_file indicado pelo estado/);
    assert.match(prompt, /allowed_paths/);
    assert.match(prompt, /Não use Browser nesta etapa/);
    assert.doesNotMatch(prompt, /ORCH_WAKE/);
    assert.match(prompt,
        /Tarefa ORCH02-POC-2 encerrada\. Peça ao Chat para verificar o resultado no GitHub/);
    assert.doesNotMatch(prompt, /Resultado publicado no GitHub/);
});

test('validação rejeita destino externo e argumentos incompletos', () => {
    assert.throws(() => buildWakePrompt({
        chatUrl: 'https://example.com/c/abc',
        observedHash: 'b'.repeat(64),
        statePath,
        taskId: 'ORCH-01', mode: 'return', branch, repoPath
    }), /chat-url deve apontar/);
    assert.throws(() => buildWakePrompt({
        chatUrl, observedHash: 'b'.repeat(64), statePath: '../private.state.json',
        taskId: 'ORCH-01', mode: 'return', branch, repoPath
    }), /state-path de wake inválido/);
    assert.throws(() => parseArgs(['--thread-id']), /argumento inválido/);
});
