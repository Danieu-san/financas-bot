'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseState, stateHash, writeAtomically } = require('./manageChatCodexOrchestration');
const { loadTaskDefinition } = require('./chatCodexTaskContract');

const CACHE_SCHEMA = 'financasbot-chat-codex-watcher-v1';
const DEFAULT_BRANCH = 'chat/chat-codex-orchestration-20260824';
const DEFAULT_STATE_PATH = 'docs/agent-memory/workstreams/chat-codex-channel.state.json';
const WAKE_REQUEST_SCHEMA = 'financasbot-codex-app-wake-request-v4';

function parseArgs(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 2) {
        const token = argv[index];
        const value = argv[index + 1];
        if (!token?.startsWith('--') || value === undefined || value.startsWith('--')) {
            throw new Error(`argumento inválido: ${token || '<vazio>'}`);
        }
        options[token.slice(2)] = value;
    }
    return options;
}

function assertAbsoluteExistingDirectory(value, name) {
    if (!path.isAbsolute(value)) throw new Error(`${name} deve ser absoluto`);
    const resolved = fs.realpathSync(value);
    if (!fs.statSync(resolved).isDirectory()) throw new Error(`${name} não é diretório`);
    return resolved;
}

function assertAbsoluteExistingFile(value, name) {
    if (!path.isAbsolute(value)) throw new Error(`${name} deve ser absoluto`);
    const resolved = fs.realpathSync(value);
    if (!fs.statSync(resolved).isFile()) throw new Error(`${name} não é arquivo`);
    return resolved;
}

function runGit(repoPath, args, deps = {}) {
    const spawn = deps.spawnSync || spawnSync;
    const command = deps.gitCommand || 'git';
    const result = spawn(command, ['-c', `safe.directory=${repoPath}`, '-C', repoPath, ...args], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 60_000
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`git ${args[0]} falhou: ${(result.stderr || '').trim()}`);
    }
    return result.stdout;
}

function fetchRemoteState(repoPath, branch, statePath, deps = {}) {
    runGit(repoPath, ['fetch', '--quiet', 'origin', branch], deps);
    return runGit(repoPath, ['show', `FETCH_HEAD:${statePath}`], deps);
}

function syncLocalBranch({ repoPath, branch, statePath, observedHash }, deps = {}) {
    const git = deps.runGit || runGit;
    assertWatcherWorktreeClean(repoPath, deps);

    const currentBranch = git(repoPath, ['branch', '--show-current'], deps).trim();
    if (currentBranch !== branch) {
        throw new Error(`branch local divergente: esperado ${branch}, atual ${currentBranch || '<detached>'}`);
    }

    git(repoPath, ['merge', '--ff-only', 'FETCH_HEAD'], deps);
    assertWatcherWorktreeClean(repoPath, deps);
    const localPath = path.join(repoPath, ...statePath.split('/'));
    const localRaw = fs.readFileSync(localPath, 'utf8');
    parseState(localRaw);
    if (stateHash(localRaw) !== observedHash) {
        throw new Error('estado local não corresponde ao estado remoto observado após fast-forward');
    }
    return localRaw;
}

function defaultCache() {
    return {
        schema: CACHE_SCHEMA,
        observed_hash: null,
        observed_state: null,
        launched_hash: null,
        launch_status: null,
        app_wake_hash: null,
        app_wake_status: null,
        updated_at: null
    };
}

function readCache(cachePath) {
    if (!fs.existsSync(cachePath)) return defaultCache();
    const value = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const allowed = Object.keys(defaultCache());
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('cache inválido');
    }
    if (Object.keys(value).some(key => !allowed.includes(key)) || value.schema !== CACHE_SCHEMA) {
        throw new Error('schema do cache inválido');
    }
    return { ...defaultCache(), ...value };
}

function saveCache(cachePath, cache, now = new Date()) {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const next = { ...cache, schema: CACHE_SCHEMA, updated_at: now.toISOString() };
    writeAtomically(cachePath, `${JSON.stringify(next, null, 2)}\n`);
    return next;
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

function withWatcherLock(cachePath, callback, deps = {}) {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const lockPath = `${cachePath}.lock`;
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

function queueCodexAppWakeRequest({ mode, observedHash, requestPath }, deps = {}) {
    if (!path.isAbsolute(requestPath)) throw new Error('app-wake-request deve ser absoluto');
    const parent = fs.realpathSync(path.dirname(requestPath));
    if (!fs.statSync(parent).isDirectory()) {
        throw new Error('diretório de app-wake-request inválido');
    }
    const target = path.join(parent, path.basename(requestPath));
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
        throw new Error('app-wake-request não pode ser link simbólico');
    }
    const now = deps.now?.() || new Date();
    writeAtomically(target, `${JSON.stringify({
        schema: WAKE_REQUEST_SCHEMA,
        observed_hash: observedHash,
        mode,
        created_at: now.toISOString()
    }, null, 2)}\n`);
    return { status: 'queued', requestPath: target };
}

function maybeWakeCodexApp({ cache, cachePath, options, observedHash, state }, deps = {}) {
    if (state.orchestration_state !== 'CODEX_READY') {
        return { cache, action: null };
    }
    const mode = 'execute';
    const requestPath = options['app-wake-request'];
    if (!requestPath) return { cache, action: null };
    if (cache.app_wake_hash === observedHash) return { cache, action: 'already_dispatched' };

    let nextCache = saveCache(cachePath, {
        ...cache,
        observed_hash: observedHash,
        observed_state: state.orchestration_state,
        app_wake_hash: observedHash,
        app_wake_status: 'dispatching'
    }, deps.now?.() || new Date());
    let dispatchStatus;
    try {
        (deps.queueCodexAppWakeRequest || queueCodexAppWakeRequest)({
            observedHash,
            mode,
            requestPath
        }, deps);
        dispatchStatus = 'queued';
    } catch (error) {
        nextCache = saveCache(cachePath, {
            ...nextCache,
            app_wake_status: 'failed'
        }, deps.now?.() || new Date());
        throw error;
    }
    nextCache = saveCache(cachePath, {
        ...nextCache,
        app_wake_status: dispatchStatus
    }, deps.now?.() || new Date());
    return { cache: nextCache, action: dispatchStatus };
}

function parsePorcelainPaths(raw) {
    if (typeof raw !== 'string') throw new Error('status Git inválido');
    return raw.split(/\r?\n/).filter(Boolean).map(line => {
        if (line.length < 4 || line[2] !== ' ') throw new Error(`status Git não suportado: ${line}`);
        const status = line.slice(0, 2);
        const filePath = line.slice(3).replaceAll('\\', '/');
        if (status.includes('R') || status.includes('C') || filePath.includes(' -> ')) {
            throw new Error(`rename/copy não autorizado: ${line}`);
        }
        return { status, path: filePath };
    });
}

function listIgnoredPaths(repoPath, deps = {}) {
    const git = deps.runGit || runGit;
    const raw = git(repoPath, [
        'ls-files', '-z', '--others', '--ignored', '--exclude-standard'
    ], deps.runGit ? deps : {});
    return new Set(raw.split('\0').filter(Boolean).map(filePath => filePath.replaceAll('\\', '/')));
}

function listWorktreeEntries(repoPath, deps = {}) {
    const git = deps.runGit || runGit;
    const raw = git(repoPath, ['status', '--porcelain=v1', '--untracked-files=all'], deps);
    return raw.split(/\r?\n/).filter(Boolean);
}

function assertNoIgnoredPaths(repoPath, deps = {}) {
    const ignored = (deps.listIgnoredPaths || listIgnoredPaths)(repoPath, deps);
    const first = ignored.values().next().value;
    if (first) throw new Error(`worktree contém caminho ignorado: ${first}`);
}

function assertWatcherWorktreeClean(repoPath, deps = {}) {
    const entries = (deps.listWorktreeEntries || listWorktreeEntries)(repoPath, deps);
    const first = entries.values().next().value;
    if (first) {
        throw new Error(`worktree do watcher deve estar limpa antes da execução: ${first}`);
    }
    assertNoIgnoredPaths(repoPath, deps);
}

function publishLocalResult({ repoPath, branch, statePath, observedHash, initialState, task }, deps = {}) {
    const git = deps.runGit || runGit;
    const entries = parsePorcelainPaths(git(repoPath, [
        'status', '--porcelain=v1', '--untracked-files=all'
    ], deps));
    const allowedPaths = new Set([statePath, ...task.allowed_paths]);
    if (entries.length === 0) throw new Error('executor não produziu resultado local');
    const unsupported = entries.find(entry => entry.path === statePath
        ? entry.status !== ' M'
        : ![' M', '??'].includes(entry.status));
    if (unsupported) {
        throw new Error(`status Git não autorizado para ${unsupported.path}: ${unsupported.status}`);
    }
    const unexpected = entries.filter(entry => !allowedPaths.has(entry.path));
    if (unexpected.length > 0) {
        throw new Error(`executor alterou caminho não autorizado: ${unexpected[0].path}`);
    }
    if (!entries.some(entry => entry.path === statePath)) {
        throw new Error('estado mecânico não foi alterado pelo executor');
    }
    if (!entries.some(entry => entry.path === task.result_file)) {
        throw new Error('executor não produziu result_file');
    }
    for (const entry of entries) {
        const changedPath = path.join(repoPath, ...entry.path.split('/'));
        const stat = fs.lstatSync(changedPath);
        if (stat.isSymbolicLink() || !stat.isFile()) {
            throw new Error(`artefato alterado deve ser arquivo regular: ${entry.path}`);
        }
    }

    const localRaw = fs.readFileSync(path.join(repoPath, ...statePath.split('/')), 'utf8');
    const localState = parseState(localRaw);
    if (localState.orchestration_state !== 'CHAT_READY'
        || localState.task_id !== initialState.task_id
        || localState.result_file !== task.result_file) {
        throw new Error('resultado local não alcançou CHAT_READY para a mesma tarefa');
    }

    const remoteRaw = (deps.fetchRemoteState || fetchRemoteState)(repoPath, branch, statePath, deps);
    const remoteState = parseState(remoteRaw);
    if (stateHash(remoteRaw) !== observedHash
        || remoteState.orchestration_state !== 'CODEX_READY'
        || remoteState.task_id !== initialState.task_id) {
        throw new Error('estado remoto avançou antes da publicação');
    }

    const changedPaths = [...new Set(entries.map(entry => entry.path))];
    git(repoPath, ['add', '--', ...changedPaths], deps);
    git(repoPath, ['commit', '-m', `chore: publish ${initialState.task_id} CHAT_READY`], deps);
    git(repoPath, ['push', 'origin', `HEAD:refs/heads/${branch}`], deps);
}

function pollOnce(options, deps = {}) {
    const repoPath = assertAbsoluteExistingDirectory(options.repo, 'repo');
    const runtimePath = path.resolve(options.runtime);
    const gitPath = assertAbsoluteExistingFile(options.git, 'git');
    const gitDeps = { ...deps, gitCommand: gitPath };
    const branch = options.branch || DEFAULT_BRANCH;
    const statePath = options['state-path'] || DEFAULT_STATE_PATH;
    if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.startsWith('-') || branch.includes('..')) {
        throw new Error('branch inválida');
    }
    if (!/^[A-Za-z0-9._/-]+$/.test(statePath) || statePath.includes('..') || path.isAbsolute(statePath)) {
        throw new Error('state-path inválido');
    }
    const cachePath = path.join(runtimePath, 'watcher-state.json');

    return withWatcherLock(cachePath, () => {
        const raw = (deps.fetchRemoteState || fetchRemoteState)(repoPath, branch, statePath, gitDeps);
        const state = parseState(raw);
        const observedHash = stateHash(raw);
        let cache = readCache(cachePath);

        const usesAppExecutor = state.orchestration_state === 'CODEX_READY'
            && Boolean(options['app-wake-request']);
        const observationUnchanged = cache.observed_hash === observedHash
            && cache.observed_state === state.orchestration_state;
        const codeReadyAwaitingRetry = state.orchestration_state === 'CODEX_READY'
            && cache.launched_hash !== observedHash;
        if (observationUnchanged && !codeReadyAwaitingRetry) {
            return {
                action: 'unchanged',
                hash: observedHash,
                state: state.orchestration_state
            };
        }

        cache = saveCache(cachePath, {
            ...cache,
            observed_hash: observedHash,
            observed_state: state.orchestration_state
        }, deps.now?.() || new Date());

        if (state.orchestration_state !== 'CODEX_READY') {
            return { action: 'observed', hash: observedHash, state: state.orchestration_state };
        }
        if (cache.launched_hash === observedHash) {
            return { action: 'already_launched', hash: observedHash, state: state.orchestration_state };
        }

        cache = saveCache(cachePath, {
            ...cache,
            launched_hash: observedHash,
            launch_status: 'running'
        }, deps.now?.() || new Date());
        const logPath = path.join(runtimePath, 'runs', `${observedHash}.log`);
        try {
            (deps.syncLocalBranch || syncLocalBranch)({
                repoPath, branch, statePath, observedHash
            }, gitDeps);
        } catch (error) {
            fs.mkdirSync(path.dirname(logPath), { recursive: true });
            fs.writeFileSync(logPath,
                `sync_failed_at=${new Date().toISOString()}\nsync_error=${error.message}\n`);
            saveCache(cachePath, {
                ...cache,
                launched_hash: null,
                launch_status: 'failed:sync_error'
            }, deps.now?.() || new Date());
            throw error;
        }
        let task;
        try {
            task = (deps.loadTaskDefinition || loadTaskDefinition)(
                repoPath, state.task_file, state.task_id
            );
        } catch (error) {
            saveCache(cachePath, {
                ...cache,
                launch_status: 'failed:task_invalid'
            }, deps.now?.() || new Date());
            throw error;
        }
        try {
            assertWatcherWorktreeClean(repoPath, gitDeps);
        } catch (error) {
            fs.mkdirSync(path.dirname(logPath), { recursive: true });
            fs.writeFileSync(logPath, `pre_dispatch_error=${error.message}\n`);
            saveCache(cachePath, {
                ...cache,
                launched_hash: null,
                launch_status: 'failed:sync_error'
            }, deps.now?.() || new Date());
            throw error;
        }
        if (!usesAppExecutor) {
            saveCache(cachePath, {
                ...cache,
                launch_status: 'failed:app_required'
            }, deps.now?.() || new Date());
            throw new Error('executor Codex App obrigatório para CODEX_READY');
        }
        const executionWake = maybeWakeCodexApp({
            cache: readCache(cachePath), cachePath, options, observedHash, state
        }, deps);
        return {
            action: 'app_task_queued',
            hash: observedHash,
            state: state.orchestration_state
        };
    }, deps);
}

function defaultRuntimePath() {
    const root = process.env.LOCALAPPDATA;
    if (!root) throw new Error('LOCALAPPDATA ausente; informe --runtime');
    return path.join(root, 'FinancasBot', 'chat-codex-orchestration');
}

function runCli(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    options.runtime ||= defaultRuntimePath();
    const result = pollOnce(options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
    try {
        runCli();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    CACHE_SCHEMA,
    DEFAULT_BRANCH,
    DEFAULT_STATE_PATH,
    WAKE_REQUEST_SCHEMA,
    loadTaskDefinition,
    maybeWakeCodexApp,
    assertNoIgnoredPaths,
    assertWatcherWorktreeClean,
    listIgnoredPaths,
    defaultCache,
    fetchRemoteState,
    parsePorcelainPaths,
    pollOnce,
    publishLocalResult,
    queueCodexAppWakeRequest,
    readCache,
    runGit,
    saveCache,
    processIsAlive,
    syncLocalBranch,
    withWatcherLock
};
