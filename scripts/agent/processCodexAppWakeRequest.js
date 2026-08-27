'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseState, stateHash } = require('./manageChatCodexOrchestration');

const CONFIG_SCHEMA = 'financasbot-codex-app-wake-bridge-config-v3';
const REQUEST_SCHEMA = 'financasbot-codex-app-wake-request-v4';
const LEGACY_REQUEST_SCHEMA = 'financasbot-codex-app-wake-request-v3';
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
    if (!path.isAbsolute(value.repo_path || '')) throw new Error('repo_path de config inválido');
    if (!path.isAbsolute(value.git_path || '')) throw new Error('git_path de config inválido');
    assertBranch(value.branch);
    assertStatePath(value.state_path);
    return value;
}

function assertStatePath(value) {
    if (!/^docs\/agent-memory\/workstreams\/[A-Za-z0-9._/-]+\.state\.json$/.test(
        value || '') || value.includes('..') || value.includes('//')) {
        throw new Error('state_path inválido');
    }
    return value;
}

function assertBranch(value) {
    if (!/^[A-Za-z0-9._/-]+$/.test(value || '')
        || value.startsWith('-') || value.includes('..')) {
        throw new Error('branch inválida');
    }
    return value;
}

function assertRequest(value) {
    if (!/^[0-9a-f]{64}$/.test(value.observed_hash || '')) throw new Error('observed_hash inválido');
    if (Number.isNaN(Date.parse(value.created_at || ''))) throw new Error('created_at inválido');
    if (!['execute', 'return'].includes(value.mode)) throw new Error('mode inválido');
    return value;
}

function readWakeRequest(filePath) {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON inválido');
    const common = ['schema', 'observed_hash', 'mode', 'created_at'];
    const legacy = [
        ...common, 'task_id', 'state_path', 'branch', 'repo_path'
    ];
    const allowed = value.schema === REQUEST_SCHEMA
        ? common
        : value.schema === LEGACY_REQUEST_SCHEMA
            ? legacy
            : null;
    if (!allowed || Object.keys(value).some(key => !allowed.includes(key))) {
        throw new Error('schema inválido');
    }
    assertRequest(value);
    return {
        schema: value.schema,
        observed_hash: value.observed_hash,
        mode: value.mode,
        created_at: value.created_at
    };
}

function writeAtomically(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, filePath);
}

function processIsAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        if (error.code === 'ESRCH') return false;
        return true;
    }
}

function withProcessLock(lockPath, callback, deps = {}) {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    let descriptor;
    try {
        descriptor = fs.openSync(lockPath, 'wx');
        fs.writeFileSync(descriptor, JSON.stringify({
            pid: process.pid,
            created_at: new Date().toISOString()
        }));
    } catch (error) {
        if (error.code === 'EEXIST') return { action: 'already_running' };
        throw error;
    }
    try {
        return callback();
    } finally {
        fs.closeSync(descriptor);
        fs.rmSync(lockPath, { force: true });
    }
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
            && !['IPC_ACCEPT_INVALID', 'IPC_WAKE_FAILED', 'LEGACY_RETURN_REJECTED']
                .includes(value.error_code))) {
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

function runGit(repoPath, args, deps = {}) {
    const spawn = deps.spawnSync || spawnSync;
    const command = deps.gitCommand || 'git';
    const result = spawn(command, ['-c', `safe.directory=${repoPath}`, '-C', repoPath, ...args], {
        encoding: 'utf8', windowsHide: true, timeout: 60_000
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`git ${args[0]} falhou`);
    return result.stdout;
}

function fetchRemoteState(repoPath, branch, statePath, deps = {}) {
    runGit(repoPath, ['fetch', '--quiet', 'origin', branch], deps);
    return runGit(repoPath, ['show', `FETCH_HEAD:${statePath}`], deps);
}

function verifyRemoteWakeRequest({ config, request }, deps = {}) {
    const raw = (deps.fetchRemoteState || fetchRemoteState)(
        config.repo_path, config.branch, config.state_path,
        { ...deps, gitCommand: config.git_path }
    );
    const state = parseState(raw);
    if (stateHash(raw) !== request.observed_hash) throw new Error('hash remoto divergente');
    if (state.orchestration_state !== 'CODEX_READY') {
        throw new Error('estado remoto não está CODEX_READY');
    }
    return {
        branch: config.branch,
        repoPath: config.repo_path,
        statePath: config.state_path,
        taskId: state.task_id
    };
}

function invokeWake({ branch, config, helperPath, mode, observedHash, repoPath, statePath, taskId }, deps = {}) {
    const spawn = deps.spawnSync || spawnSync;
    const result = spawn(process.execPath, [
        helperPath,
        '--thread-id', config.thread_id,
        '--chat-url', config.chat_url,
        '--hash', observedHash,
        '--task-id', taskId,
        '--state-path', statePath,
        '--mode', mode,
        '--branch', branch,
        '--repo-path', repoPath
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

function processWakeRequestUnlocked(options, deps = {}) {
    assertRegularFile(options.config, 'config');
    assertRegularFile(options.request, 'request');
    assertRegularFile(options.helper, 'helper');
    if (fs.existsSync(options.result)) assertRegularFile(options.result, 'result');
    const config = assertConfig(readExactJson(options.config,
        ['schema', 'thread_id', 'chat_url', 'repo_path', 'git_path', 'branch', 'state_path'], CONFIG_SCHEMA));
    const request = readWakeRequest(options.request);
    const store = fs.existsSync(options.result)
        ? readResultStore(options.result)
        : { schema: RESULT_SCHEMA, records: [] };
    const previous = store.records.find(record => record.observed_hash === request.observed_hash);

    const now = () => (deps.now?.() || new Date()).toISOString();
    if (request.mode === 'return') {
        if (!previous) {
            store.records.push({
                observed_hash: request.observed_hash,
                status: 'failed',
                updated_at: now(),
                handled_by_client_id: null,
                error_code: 'LEGACY_RETURN_REJECTED'
            });
            writeResultStore(options.result, store.records);
        }
        fs.rmSync(options.request, { force: true });
        return { action: 'legacy_return_rejected' };
    }
    if (previous) return { action: 'already_processed', status: previous.status };

    const verified = (deps.verifyRemoteWakeRequest || verifyRemoteWakeRequest)({
        config, request
    }, deps);
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
            statePath: verified.statePath,
            taskId: verified.taskId,
            mode: request.mode,
            branch: verified.branch,
            repoPath: verified.repoPath
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

function processWakeRequest(options, deps = {}) {
    for (const name of ['config', 'request', 'result', 'helper']) {
        if (!options[name] || !path.isAbsolute(options[name])) throw new Error(`${name} deve ser absoluto`);
    }
    if (!fs.existsSync(options.request)) return { action: 'no_request' };
    return withProcessLock(`${options.result}.lock`,
        () => processWakeRequestUnlocked(options, deps), deps);
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
    LEGACY_REQUEST_SCHEMA,
    REQUEST_SCHEMA,
    RESULT_SCHEMA,
    assertRegularFile,
    assertConfig,
    assertRequest,
    invokeWake,
    parseArgs,
    processWakeRequest,
    readWakeRequest,
    readExactJson,
    readResultStore,
    verifyRemoteWakeRequest,
    withProcessLock,
    writeAtomically
};
