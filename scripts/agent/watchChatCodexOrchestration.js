'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseState, stateHash, writeAtomically } = require('./manageChatCodexOrchestration');

const CACHE_SCHEMA = 'financasbot-chat-codex-watcher-v1';
const DEFAULT_BRANCH = 'chat/chat-codex-orchestration-20260824';
const DEFAULT_STATE_PATH = 'docs/agent-memory/workstreams/chat-codex-orchestration.state.json';

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
        'Confirme que o remoto ainda está CODEX_READY com exatamente esse hash; falhe fechado se divergir.',
        'Reivindique CODEX_RUNNING por compare-and-swap, publique a reivindicação e execute apenas os checks descritos no checkpoint.',
        'Não toque no bot, produção, OCI, WhatsApp, Pluggy, planilhas, .env, writers ou dados reais.',
        'Registre evidência, publique CHAT_READY e, se o navegador interno estiver acessível, envie ao Chat somente ORCH-01 CHAT_READY <commit_sha>.',
        'Se a campainha não puder ser enviada, deixe CHAT_READY publicado e informe isso no resultado; não amplie o escopo.'
    ].join('\n');
}

function runCodex({ codexPath, powershellPath, repoPath, prompt, logPath }, deps = {}) {
    const spawn = deps.spawnSync || spawnSync;
    const commonArgs = [
        'exec', '--ephemeral', '--full-auto', '--sandbox', 'workspace-write',
        '-m', 'gpt-5.4', '-c', 'model_reasoning_effort="medium"', '-C', repoPath, '-'
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
        saveCache(cachePath, {
            ...cache,
            launch_status: exitCode === 0 ? 'succeeded' : `failed:${exitCode}`
        }, deps.now?.() || new Date());
        return { action: 'launched', exitCode, hash: observedHash, state: state.orchestration_state };
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
    buildExecutorPrompt,
    defaultCache,
    fetchRemoteState,
    pollOnce,
    readCache,
    runCodex,
    saveCache,
    processIsAlive,
    withWatcherLock
};
