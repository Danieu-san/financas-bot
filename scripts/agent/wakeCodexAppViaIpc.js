'use strict';

const net = require('node:net');
const { randomUUID } = require('node:crypto');

const IPC_PATH = '\\\\.\\pipe\\codex-ipc';
const MAX_FRAME_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

function parseArgs(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 2) {
        const token = argv[index], value = argv[index + 1];
        if (!token?.startsWith('--') || value === undefined || value.startsWith('--')) {
            throw new Error(`argumento inválido: ${token || '<vazio>'}`);
        }
        options[token.slice(2)] = value;
    }
    return options;
}

function assertThreadId(value) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '')) {
        throw new Error('thread-id inválido');
    }
    return value.toLowerCase();
}

function assertChatUrl(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error('chat-url inválida');
    }
    if (url.protocol !== 'https:' || url.hostname !== 'chatgpt.com'
        || !/^\/(?:g\/[^/]+\/)?c\/[0-9a-f-]+\/?$/i.test(url.pathname)
        || url.search || url.hash) {
        throw new Error('chat-url deve apontar para uma conversa HTTPS do chatgpt.com');
    }
    return url.toString();
}

function buildWakePrompt({ chatUrl, observedHash, taskId }) {
    if (!/^[0-9a-f]{64}$/i.test(observedHash || '')) throw new Error('hash de wake inválido');
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(taskId || '')) throw new Error('task-id de wake inválido');
    const safeChatUrl = assertChatUrl(chatUrl);
    return [
        `Retorno mecânico ${taskId}.`,
        `O watcher confirmou GitHub/CHAT_READY no hash de estado ${observedHash}.`,
        'Use somente a ferramenta Browser do Codex App nesta tarefa.',
        `Na conversa ${safeChatUrl}, envie exatamente: ORCH_WAKE ${taskId} ${observedHash}`,
        'Não leia Git, arquivos, produção, WhatsApp, Pluggy, planilhas ou dados privados.',
        'Depois de confirmar o envio, termine sem executar outra ação.'
    ].join(' ');
}

function frameMessage(value) {
    const body = Buffer.from(JSON.stringify(value), 'utf8');
    if (body.length === 0 || body.length > MAX_FRAME_BYTES) throw new Error('frame IPC inválido');
    const frame = Buffer.allocUnsafe(4 + body.length);
    frame.writeUInt32LE(body.length, 0);
    body.copy(frame, 4);
    return frame;
}

class FrameDecoder {
    constructor() {
        this.buffer = Buffer.alloc(0);
    }

    push(chunk) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        const messages = [];
        while (this.buffer.length >= 4) {
            const length = this.buffer.readUInt32LE(0);
            if (length === 0 || length > MAX_FRAME_BYTES) throw new Error('comprimento IPC inválido');
            if (this.buffer.length < 4 + length) break;
            messages.push(JSON.parse(this.buffer.subarray(4, 4 + length).toString('utf8')));
            this.buffer = this.buffer.subarray(4 + length);
        }
        return messages;
    }
}

function buildStartTurnRequest({ chatUrl, observedHash, requestId, taskId, threadId }) {
    const conversationId = assertThreadId(threadId);
    const prompt = buildWakePrompt({ chatUrl, observedHash, taskId });
    return {
        type: 'request',
        requestId,
        sourceClientId: null,
        version: 2,
        method: 'thread-follower-start-turn',
        timeoutMs: REQUEST_TIMEOUT_MS,
        params: {
            conversationId,
            turnStart: {
                request: {
                    threadId: conversationId,
                    clientUserMessageId: randomUUID(),
                    input: [{ type: 'text', text: prompt, text_elements: [] }]
                },
                context: {
                    localTurnMetadata: null,
                    attachments: [],
                    commentAttachments: [],
                    useAppServerPermissionDefault: true,
                    usePermissionSelection: false,
                    inheritThreadSettings: true,
                    threadStartKind: null,
                    mcpAppModelContextAttachments: []
                }
            }
        }
    };
}

function runClient(options, deps = {}) {
    const createConnection = deps.createConnection || net.createConnection;
    const initializeId = randomUUID();
    const startId = randomUUID();
    const decoder = new FrameDecoder();
    const startRequest = buildStartTurnRequest({
        chatUrl: options['chat-url'],
        observedHash: options.hash,
        requestId: startId,
        taskId: options['task-id'],
        threadId: options['thread-id']
    });

    return new Promise((resolve, reject) => {
        let initialized = false, settled = false;
        const socket = createConnection(IPC_PATH);
        const finish = (error, result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            socket.destroy();
            error ? reject(error) : resolve(result);
        };
        const timer = setTimeout(() => finish(new Error('timeout no IPC do Codex App')),
            REQUEST_TIMEOUT_MS);
        socket.on('connect', () => socket.write(frameMessage({
            type: 'request',
            requestId: initializeId,
            sourceClientId: 'initializing-client',
            version: 0,
            method: 'initialize',
            params: { clientType: 'financasbot-orchestration-watcher' }
        })));
        socket.on('data', chunk => {
            let messages;
            try {
                messages = decoder.push(chunk);
            } catch (error) {
                finish(error);
                return;
            }
            for (const message of messages) {
                if (message.type !== 'response') continue;
                if (message.requestId === initializeId) {
                    if (message.resultType !== 'success' || !message.result?.clientId) {
                        finish(new Error(`initialize IPC recusado: ${message.error || 'resposta inválida'}`));
                        return;
                    }
                    initialized = true;
                    startRequest.sourceClientId = message.result.clientId;
                    socket.write(frameMessage(startRequest));
                    continue;
                }
                if (initialized && message.requestId === startId) {
                    if (message.resultType !== 'success') {
                        finish(new Error(`wake IPC recusado: ${message.error || 'resposta inválida'}`));
                        return;
                    }
                    finish(null, {
                        handledByClientId: message.handledByClientId || null,
                        status: 'accepted'
                    });
                    return;
                }
            }
        });
        socket.on('error', error => finish(error));
        socket.on('close', () => {
            if (!settled) finish(new Error('IPC do Codex App encerrou antes da resposta'));
        });
    });
}

async function runCli(argv = process.argv.slice(2)) {
    const result = await runClient(parseArgs(argv));
    process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
    runCli().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    FrameDecoder,
    IPC_PATH,
    buildStartTurnRequest,
    buildWakePrompt,
    frameMessage,
    parseArgs,
    runClient
};
