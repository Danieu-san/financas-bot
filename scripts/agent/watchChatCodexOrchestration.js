'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseState, stateHash, writeAtomically } = require('./manageChatCodexOrchestration');

const CACHE_SCHEMA = 'financasbot-chat-codex-watcher-v1';
const DEFAULT_BRANCH = 'chat/chat-codex-orchestration-20260824';
const DEFAULT_STATE_PATH = 'docs/agent-memory/workstreams/chat-codex-orchestration.state.json';
const DEFAULT_PLAN_PATH = 'docs/plans/workstreams/chat-codex-orchestration.md';

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
    const result = spawn('git', ['-c', `safe.directory=${repoPath}`, '-C', repoPath, ...args], {
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

function defaultCache() {
    return {
        schema: CACHE_SCHEMA,
        observed_hash: null,
        observed_state: null,
        launched_hash: null,
        launch_status: null,
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
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            descriptor = fs.openSync(lockPath, 'wx');
            fs.writeFileSync(descriptor, JSON.stringify({
                pid: process.pid,
                created_at: new Date().toISOString()
            }));
            break;
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            let existing;
            try {
                existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
            } catch {
                return { action: 'already_running' };
            }
            const validPid = Number.isSafeInteger(existing?.pid) && existing.pid > 0;
            const alive = validPid && (deps.processIsAlive || processIsAlive)(existing.pid);
            if (alive || !validPid || attempt > 0) return { action: 'already_running' };
            fs.rmSync(lockPath, { force: true });
        }
    }
    if (descriptor === undefined) return { action: 'already_running' };
    try {
        return callback();
    } finally {
        fs.closeSync(descriptor);
        fs.rmSync(lockPath, { force: true });
    }
}

function buildExecutorPrompt({ branch, observedHash, taskId }) {
    return [
        'Execute somente o ensaio no-op do workstream chat-codex-orchestration.',
        `Branch remota: ${branch}.`,
        `Task: ${taskId}. Hash mecânico observado: ${observedHash}.`,
        'Leia AGENTS.md, docs/agent-memory/README.md, o checkpoint, plano e estado deste workstream.',
        'O hash mecânico é o SHA-256 dos bytes serializados do arquivo JSON de estado; não é SHA de commit nem FETCH_HEAD.',
        'O watcher já confirmou que o estado remoto continua CODEX_READY e que o SHA-256 do JSON remoto é exatamente o hash mecânico observado.',
        'Nunca compare o hash mecânico com o SHA do commit; falhe fechado somente se o conteúdo/estado remoto divergir.',
        'Faça localmente as transições CODEX_READY -> CODEX_RUNNING -> CHAT_READY por compare-and-swap e execute apenas os checks descritos no checkpoint.',
        'Não execute git fetch, add, commit ou push; o watcher publicará deterministicamente somente os arquivos autorizados após validar seu resultado.',
        'Não toque no bot, produção, OCI, WhatsApp, Pluggy, planilhas, .env, writers ou dados reais.',
        'Registre localmente a evidência e deixe o estado CHAT_READY; não afirme que houve publicação remota.',
        'Não tente acessar navegador nem enviar campainha; o watcher verificará o GitHub depois da publicação.'
    ].join('\n');
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

function assertNoIgnoredPaths(repoPath, deps = {}) {
    const ignored = (deps.listIgnoredPaths || listIgnoredPaths)(repoPath, deps);
    const first = ignored.values().next().value;
    if (first) throw new Error(`worktree contém caminho ignorado: ${first}`);
}

function publishLocalResult({ repoPath, branch, statePath, observedHash, initialState }, deps = {}) {
    const git = deps.runGit || runGit;
    const entries = parsePorcelainPaths(git(repoPath, [
        'status', '--porcelain=v1', '--untracked-files=all'
    ], deps));
    const allowedPaths = new Set([statePath, initialState.task_file, DEFAULT_PLAN_PATH]);
    if (entries.length === 0) throw new Error('executor não produziu resultado local');
    const unsupported = entries.find(entry => entry.status !== ' M');
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

    const localRaw = fs.readFileSync(path.join(repoPath, ...statePath.split('/')), 'utf8');
    const localState = parseState(localRaw);
    if (localState.orchestration_state !== 'CHAT_READY' || localState.task_id !== initialState.task_id) {
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

function runCodex({ codexPath, powershellPath, repoPath, prompt, logPath }, deps = {}) {
    const spawn = deps.spawnSync || spawnSync;
    assertNoIgnoredPaths(repoPath, deps);
    const commonArgs = [
        'exec', '--ephemeral', '--sandbox', 'workspace-write',
        '-m', 'gpt-5.4-mini', '-c', 'model_reasoning_effort="medium"', '-C', repoPath, '-'
    ];
    const extension = path.extname(codexPath).toLowerCase();
    const command = extension === '.ps1' ? powershellPath : codexPath;
    const args = extension === '.ps1'
        ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', codexPath, ...commonArgs]
        : commonArgs;
    const result = spawn(command, args, {
        encoding: 'utf8',
        input: prompt,
        windowsHide: true,
        timeout: 30 * 60_000,
        maxBuffer: 10 * 1024 * 1024
    });
    assertNoIgnoredPaths(repoPath, deps);
    const log = [
        `status=${result.status}`,
        result.stdout || '',
        result.stderr || '',
        result.error ? String(result.error.stack || result.error) : ''
    ].join('\n');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    writeAtomically(logPath, log);
    if (result.error) throw result.error;
    return result.status ?? 1;
}

function pollOnce(options, deps = {}) {
    const repoPath = assertAbsoluteExistingDirectory(options.repo, 'repo');
    const runtimePath = path.resolve(options.runtime);
    const codexPath = assertAbsoluteExistingFile(options.codex, 'codex');
    const powershellPath = path.extname(codexPath).toLowerCase() === '.ps1'
        ? assertAbsoluteExistingFile(options.powershell, 'powershell')
        : null;
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
        const raw = (deps.fetchRemoteState || fetchRemoteState)(repoPath, branch, statePath, deps);
        const state = parseState(raw);
        const observedHash = stateHash(raw);
        let cache = readCache(cachePath);

        if (cache.observed_hash === observedHash && cache.observed_state === state.orchestration_state) {
            return { action: 'unchanged', hash: observedHash, state: state.orchestration_state };
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
        const prompt = buildExecutorPrompt({ branch, observedHash, taskId: state.task_id });
        let exitCode;
        try {
            exitCode = (deps.runCodex || runCodex)({
                codexPath,
                powershellPath,
                repoPath,
                prompt,
                logPath
            }, deps);
        } catch (error) {
            saveCache(cachePath, {
                ...cache,
                launch_status: 'failed:error'
            }, deps.now?.() || new Date());
            throw error;
        }

        if (exitCode === 0) {
            try {
                (deps.publishLocalResult || publishLocalResult)({
                    repoPath,
                    branch,
                    statePath,
                    observedHash,
                    initialState: state
                }, deps);
            } catch (error) {
                saveCache(cachePath, {
                    ...cache,
                    launch_status: 'failed:publish_error'
                }, deps.now?.() || new Date());
                throw error;
            }
        }

        let finalRaw;
        try {
            finalRaw = (deps.fetchRemoteState || fetchRemoteState)(repoPath, branch, statePath, deps);
        } catch (error) {
            saveCache(cachePath, {
                ...cache,
                launch_status: 'failed:verification_error'
            }, deps.now?.() || new Date());
            throw error;
        }
        const finalState = parseState(finalRaw);
        const finalHash = stateHash(finalRaw);
        const reachedChatReady = exitCode === 0
            && finalState.orchestration_state === 'CHAT_READY'
            && finalState.task_id === state.task_id;
        const launchStatus = reachedChatReady
            ? 'succeeded'
            : exitCode === 0
                ? 'failed:state_not_advanced'
                : `failed:${exitCode}`;
        saveCache(cachePath, {
            ...cache,
            observed_hash: finalHash,
            observed_state: finalState.orchestration_state,
            launch_status: launchStatus
        }, deps.now?.() || new Date());
        return {
            action: 'launched',
            exitCode,
            hash: observedHash,
            state: state.orchestration_state,
            finalState: finalState.orchestration_state
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
    DEFAULT_PLAN_PATH,
    DEFAULT_STATE_PATH,
    buildExecutorPrompt,
    assertNoIgnoredPaths,
    listIgnoredPaths,
    defaultCache,
    fetchRemoteState,
    parsePorcelainPaths,
    pollOnce,
    publishLocalResult,
    readCache,
    runCodex,
    saveCache,
    processIsAlive,
    withWatcherLock
};
