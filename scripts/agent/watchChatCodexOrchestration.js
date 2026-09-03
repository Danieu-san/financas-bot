'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseState, stateHash, writeAtomically } = require('./manageChatCodexOrchestration');
const { loadTaskDefinition } = require('./chatCodexTaskContract');
const { completeChatCodexAppExecution } = require('./completeChatCodexAppExecution');
const {
    WAKE_REQUEST_SCHEMA,
    maybeWakeCodexApp: dispatchCodexAppWake,
    queueCodexAppWakeRequest,
    wakeCodexApp
} = require('./chatCodexAppWake');

const CACHE_SCHEMA = 'financasbot-chat-codex-watcher-v1';
const DEFAULT_BRANCH = 'chat/chat-codex-orchestration-20260824';
const DEFAULT_STATE_PATH = 'docs/agent-memory/workstreams/chat-codex-channel.state.json';

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
        chat_notify_hash: null,
        chat_notify_status: null,
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

function maybeWakeCodexApp(context, deps = {}) {
    return dispatchCodexAppWake({
        ...context,
        options: {
            branch: DEFAULT_BRANCH,
            'state-path': DEFAULT_STATE_PATH,
            ...context.options
        }
    }, { ...deps, saveCache: deps.saveCache || saveCache });
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

function quotePowerShellLiteral(value) {
    return `'${value.replaceAll("'", "''")}'`;
}

function buildExecutorPrompt({ branch, gitPath, observedHash, repoPath, statePath, task, taskFile }) {
    const quotedGit = quotePowerShellLiteral(gitPath);
    const quotedRepo = quotePowerShellLiteral(repoPath.replaceAll('\\', '/'));
    return [
        'Execute uma tarefa versionada do canal permanente Chat -> Codex.',
        `Branch remota: ${branch}.`,
        `Task: ${task.task_id}. Hash mecânico observado: ${observedHash}.`,
        'O hash mecânico é o SHA-256 dos bytes serializados do arquivo JSON de estado; não é SHA de commit nem FETCH_HEAD.',
        'O watcher já confirmou que o estado remoto continua CODEX_READY e que o SHA-256 do JSON remoto é exatamente o hash mecânico observado.',
        `Leia AGENTS.md, ${taskFile} e somente os required_files abaixo:`,
        ...task.required_files.map(file => `- ${file}`),
        `Objetivo: ${task.objective}`,
        'Modifique somente estes caminhos exatos:',
        ...task.allowed_paths.map(file => `- ${file}`),
        'Validações exigidas:',
        ...task.validation.map(item => `- ${item}`),
        'Restrições adicionais:',
        ...task.constraints.map(item => `- ${item}`),
        'Sequência obrigatória:',
        `1. node scripts/agent/manageChatCodexOrchestration.js transition --file ${statePath} --to CODEX_RUNNING --expected-state-hash ${observedHash}`,
        '2. execute o objetivo e as validações, sem ampliar o escopo.',
        `3. registre resultado, evidências e pendências em ${task.result_file}.`,
        `4. calcule o hash atual e transicione ${statePath} para CHAT_READY com --result-file ${task.result_file}.`,
        'Se qualquer comando falhar, falhe fechado: pare sem tentar recovery ou alternativa.',
        'Não execute git fetch, add, commit ou push; o watcher publicará deterministicamente somente os arquivos autorizados após validar seu resultado.',
        `Use Git somente com $env:GIT_BIN = ${quotedGit}; $env:GIT_CONFIG_COUNT = '1'; $env:GIT_CONFIG_KEY_0 = 'safe.directory'; $env:GIT_CONFIG_VALUE_0 = ${quotedRepo}.`,
        'Não acesse produção, OCI, WhatsApp, Pluggy, planilhas, .env, credenciais, sessões ou dados privados.',
        'Deixe o estado em CHAT_READY e não afirme que houve publicação remota.',
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

function runCodex({ codexPath, gitPath, powershellPath, repoPath, prompt, logPath }, deps = {}) {
    const spawn = deps.spawnSync || spawnSync;
    assertNoIgnoredPaths(repoPath, deps);
    const commonArgs = [
        '--profile', 'chat-codex-orchestration',
        'exec', '--ephemeral', '--sandbox', 'workspace-write',
        '-m', 'gpt-5.4-mini', '-c', 'model_reasoning_effort="medium"', '-C', repoPath, '-'
    ];
    const extension = path.extname(codexPath).toLowerCase();
    const command = extension === '.ps1' ? powershellPath : codexPath;
    const args = extension === '.ps1'
        ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', codexPath, ...commonArgs]
        : commonArgs;
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, `started_at=${new Date().toISOString()}\n`);
    const logDescriptor = fs.openSync(logPath, 'a');
    let result;
    try {
        result = spawn(command, args, {
            input: prompt,
            stdio: ['pipe', logDescriptor, logDescriptor],
            windowsHide: true,
            env: {
                ...process.env,
                GIT_BIN: gitPath,
                GIT_CONFIG_COUNT: '1',
                GIT_CONFIG_KEY_0: 'safe.directory',
                GIT_CONFIG_VALUE_0: repoPath.replaceAll('\\', '/')
            },
            timeout: 10 * 60_000
        });
    } finally {
        fs.closeSync(logDescriptor);
    }
    assertNoIgnoredPaths(repoPath, deps);
    fs.appendFileSync(logPath, `\nstatus=${result.status}\n`);
    if (result.error) throw result.error;
    return result.status ?? 1;
}

function pollOnce(options, deps = {}) {
    const repoPath = assertAbsoluteExistingDirectory(options.repo, 'repo');
    const runtimePath = path.resolve(options.runtime);
    const codexPath = assertAbsoluteExistingFile(options.codex, 'codex');
    const gitPath = assertAbsoluteExistingFile(options.git, 'git');
    const gitDeps = { ...deps, gitCommand: gitPath };
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
        const raw = (deps.fetchRemoteState || fetchRemoteState)(repoPath, branch, statePath, gitDeps);
        const state = parseState(raw);
        const observedHash = stateHash(raw);
        let cache = readCache(cachePath);

        const usesAppExecutor = state.orchestration_state === 'CODEX_READY'
            && Boolean(options['app-wake-request']
                || (options['app-thread-id'] && options['chat-url']));
        const completion = usesAppExecutor && cache.launched_hash === observedHash
            && cache.launch_status === 'running'
            ? completeChatCodexAppExecution(
                { repoPath, branch, statePath, observedHash, initialState: state,
                    gitDeps, cache, cachePath, options, powershellPath },
                { loadTaskDefinition, publishLocalResult, fetchRemoteState,
                    saveCache, ...deps })
            : null;
        if (completion) return completion;

        const observationUnchanged = cache.observed_hash === observedHash
            && cache.observed_state === state.orchestration_state;
        const codeReadyAwaitingRetry = state.orchestration_state === 'CODEX_READY'
            && cache.launched_hash !== observedHash
            && (!usesAppExecutor || cache.launch_status === 'failed:sync_error');
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
        if (usesAppExecutor) {
            const executionWake = maybeWakeCodexApp({
                cache: readCache(cachePath), cachePath, options, observedHash, state
            }, deps);
            return {
                action: executionWake.action === 'accepted'
                    ? 'app_task_accepted' : 'app_task_queued',
                hash: observedHash,
                state: state.orchestration_state
            };
        }
        const prompt = buildExecutorPrompt({
            branch, gitPath, observedHash, repoPath, statePath,
            task, taskFile: state.task_file
        });
        let exitCode;
        try {
            exitCode = (deps.runCodex || runCodex)({
                codexPath,
                gitPath,
                powershellPath,
                repoPath,
                prompt,
                logPath
            }, gitDeps);
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
                    initialState: state,
                    task
                }, gitDeps);
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
            finalRaw = (deps.fetchRemoteState || fetchRemoteState)(
                repoPath, branch, statePath, gitDeps
            );
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
    DEFAULT_STATE_PATH,
    WAKE_REQUEST_SCHEMA,
    buildExecutorPrompt,
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
    runCodex,
    runGit,
    saveCache,
    processIsAlive,
    syncLocalBranch,
    wakeCodexApp,
    withWatcherLock
};
