'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CONFIG_SCHEMA = 'financasbot-codex-app-wake-bridge-config-v1';
const REQUEST_SCHEMA = 'financasbot-codex-app-wake-request-v1';
const RESULT_SCHEMA = 'financasbot-codex-app-wake-result-v1';

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

function readExactJson(filePath, allowedKeys, schema) {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON inválido');
    if (value.schema !== schema || Object.keys(value).some(key => !allowedKeys.includes(key))) {
        throw new Error('schema inválido');
    }
    return value;
}

function assertRegularFile(filePath, name) {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${name} deve ser arquivo regular`);
    return filePath;
}

function assertConfig(value) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        .test(value.thread_id || '')) throw new Error('thread_id inválido');
    if (!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(value.task_id || '')) throw new Error('task_id inválido');
    let parsed;
    try { parsed = new URL(value.chat_url); } catch { throw new Error('chat_url inválida'); }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'chatgpt.com'
        || parsed.search || parsed.hash
        || !/^\/(?:g\/[^/]+\/)?c\/[0-9a-f-]+\/?$/i.test(parsed.pathname)) {
        throw new Error('chat_url inválida');
    }
    return value;
}

function assertRequest(value) {
    if (!/^[0-9a-f]{64}$/.test(value.observed_hash || '')) throw new Error('observed_hash inválido');
    if (Number.isNaN(Date.parse(value.created_at || ''))) throw new Error('created_at inválido');
    return value;
}

function writeAtomically(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, filePath);
}

function invokeWake({ config, helperPath, observedHash }, deps = {}) {
    const spawn = deps.spawnSync || spawnSync;
    const result = spawn(process.execPath, [
        helperPath,
        '--thread-id', config.thread_id,
        '--chat-url', config.chat_url,
        '--hash', observedHash,
        '--task-id', config.task_id
    ], { encoding: 'utf8', windowsHide: true, timeout: 15_000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('IPC_WAKE_FAILED');
    const response = JSON.parse(result.stdout);
    if (response.status !== 'accepted'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            .test(response.handledByClientId || '')) {
        throw new Error('IPC_ACCEPT_INVALID');
    }
    return response;
}

function processWakeRequest(options, deps = {}) {
    for (const name of ['config', 'request', 'result', 'helper']) {
        if (!options[name] || !path.isAbsolute(options[name])) throw new Error(`${name} deve ser absoluto`);
    }
    if (!fs.existsSync(options.request)) return { action: 'no_request' };
    assertRegularFile(options.config, 'config');
    assertRegularFile(options.request, 'request');
    assertRegularFile(options.helper, 'helper');
    if (fs.existsSync(options.result)) assertRegularFile(options.result, 'result');
    const config = assertConfig(readExactJson(options.config,
        ['schema', 'thread_id', 'chat_url', 'task_id'], CONFIG_SCHEMA));
    const request = assertRequest(readExactJson(options.request,
        ['schema', 'observed_hash', 'created_at'], REQUEST_SCHEMA));
    if (fs.existsSync(options.result)) {
        const previous = readExactJson(options.result,
            ['schema', 'observed_hash', 'status', 'updated_at', 'handled_by_client_id', 'error_code'],
            RESULT_SCHEMA);
        if (previous.observed_hash === request.observed_hash) {
            return { action: 'already_processed', status: previous.status };
        }
    }

    const now = () => (deps.now?.() || new Date()).toISOString();
    writeAtomically(options.result, {
        schema: RESULT_SCHEMA,
        observed_hash: request.observed_hash,
        status: 'dispatching',
        updated_at: now(),
        handled_by_client_id: null,
        error_code: null
    });
    try {
        const response = (deps.invokeWake || invokeWake)({
            config,
            helperPath: fs.realpathSync(options.helper),
            observedHash: request.observed_hash
        }, deps);
        writeAtomically(options.result, {
            schema: RESULT_SCHEMA,
            observed_hash: request.observed_hash,
            status: 'accepted',
            updated_at: now(),
            handled_by_client_id: response.handledByClientId,
            error_code: null
        });
        return { action: 'accepted', hash: request.observed_hash };
    } catch (error) {
        writeAtomically(options.result, {
            schema: RESULT_SCHEMA,
            observed_hash: request.observed_hash,
            status: 'failed',
            updated_at: now(),
            handled_by_client_id: null,
            error_code: error.message === 'IPC_ACCEPT_INVALID' ? 'IPC_ACCEPT_INVALID' : 'IPC_WAKE_FAILED'
        });
        throw error;
    }
}

function runCli(argv = process.argv.slice(2)) {
    const result = processWakeRequest(parseArgs(argv));
    process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
    try { runCli(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = {
    CONFIG_SCHEMA,
    REQUEST_SCHEMA,
    RESULT_SCHEMA,
    assertRegularFile,
    assertConfig,
    assertRequest,
    invokeWake,
    parseArgs,
    processWakeRequest,
    readExactJson,
    writeAtomically
};
