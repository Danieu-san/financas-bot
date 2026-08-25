'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CONFIG_SCHEMA = 'financasbot-codex-app-wake-bridge-config-v2';
const REQUEST_SCHEMA = 'financasbot-codex-app-wake-request-v2';
const LEGACY_RESULT_SCHEMA = 'financasbot-codex-app-wake-result-v1';
const RESULT_SCHEMA = 'financasbot-codex-app-wake-result-v2';

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
    if (!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(value.task_id || '')) {
        throw new Error('task_id inválido');
    }
    if (!/^docs\/agent-memory\/workstreams\/[A-Za-z0-9._/-]+\.state\.json$/.test(
        value.state_path || '') || value.state_path.includes('..') || value.state_path.includes('//')) {
        throw new Error('state_path inválido');
    }
    if (Number.isNaN(Date.parse(value.created_at || ''))) throw new Error('created_at inválido');
    return value;
}

function writeAtomically(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, filePath);
}

function assertResultRecord(value) {
    const allowedKeys = [
        'observed_hash', 'status', 'updated_at', 'handled_by_client_id', 'error_code'
    ];
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).some(key => !allowedKeys.includes(key))
        || !/^[0-9a-f]{64}$/.test(value.observed_hash || '')
        || !['dispatching', 'accepted', 'failed'].includes(value.status)
        || Number.isNaN(Date.parse(value.updated_at || ''))
        || (value.handled_by_client_id !== null
            && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
                .test(value.handled_by_client_id || ''))
        || (value.error_code !== null
            && !['IPC_ACCEPT_INVALID', 'IPC_WAKE_FAILED'].includes(value.error_code))) {
        throw new Error('resultado inválido');
    }
    return value;
}

function readResultStore(filePath) {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('resultado inválido');
    }
    if (value.schema === LEGACY_RESULT_SCHEMA) {
        const allowedKeys = [
            'schema', 'observed_hash', 'status', 'updated_at', 'handled_by_client_id', 'error_code'
        ];
        if (Object.keys(value).some(key => !allowedKeys.includes(key))) {
            throw new Error('resultado inválido');
        }
        const { schema: _legacySchema, ...record } = value;
        return { schema: RESULT_SCHEMA, records: [assertResultRecord(record)] };
    }
    if (value.schema !== RESULT_SCHEMA
        || Object.keys(value).some(key => !['schema', 'records'].includes(key))
        || !Array.isArray(value.records)) {
        throw new Error('resultado inválido');
    }
    const seen = new Set();
    for (const record of value.records) {
        assertResultRecord(record);
        if (seen.has(record.observed_hash)) throw new Error('resultado duplicado');
        seen.add(record.observed_hash);
    }
    return value;
}

function writeResultStore(filePath, records) {
    writeAtomically(filePath, { schema: RESULT_SCHEMA, records });
}

function invokeWake({ config, helperPath, observedHash, statePath, taskId }, deps = {}) {
    const spawn = deps.spawnSync || spawnSync;
    const result = spawn(process.execPath, [
        helperPath,
        '--thread-id', config.thread_id,
        '--chat-url', config.chat_url,
        '--hash', observedHash,
        '--task-id', taskId,
        '--state-path', statePath
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
        ['schema', 'thread_id', 'chat_url'], CONFIG_SCHEMA));
    const request = assertRequest(readExactJson(options.request,
        ['schema', 'observed_hash', 'task_id', 'state_path', 'created_at'], REQUEST_SCHEMA));
    const store = fs.existsSync(options.result)
        ? readResultStore(options.result)
        : { schema: RESULT_SCHEMA, records: [] };
    const previous = store.records.find(record => record.observed_hash === request.observed_hash);
    if (previous) return { action: 'already_processed', status: previous.status };

    const now = () => (deps.now?.() || new Date()).toISOString();
    const record = {
        observed_hash: request.observed_hash,
        status: 'dispatching',
        updated_at: now(),
        handled_by_client_id: null,
        error_code: null
    };
    store.records.push(record);
    writeResultStore(options.result, store.records);
    try {
        const response = (deps.invokeWake || invokeWake)({
            config,
            helperPath: fs.realpathSync(options.helper),
            observedHash: request.observed_hash,
            statePath: request.state_path,
            taskId: request.task_id
        }, deps);
        Object.assign(record, {
            status: 'accepted', updated_at: now(),
            handled_by_client_id: response.handledByClientId, error_code: null
        });
        writeResultStore(options.result, store.records);
        return { action: 'accepted', hash: request.observed_hash };
    } catch (error) {
        Object.assign(record, {
            status: 'failed', updated_at: now(), handled_by_client_id: null,
            error_code: error.message === 'IPC_ACCEPT_INVALID' ? 'IPC_ACCEPT_INVALID' : 'IPC_WAKE_FAILED'
        });
        writeResultStore(options.result, store.records);
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
    LEGACY_RESULT_SCHEMA,
    REQUEST_SCHEMA,
    RESULT_SCHEMA,
    assertRegularFile,
    assertConfig,
    assertRequest,
    invokeWake,
    parseArgs,
    processWakeRequest,
    readExactJson,
    readResultStore,
    writeAtomically
};
