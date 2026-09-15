'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { writeAtomically } = require('./manageChatCodexOrchestration');

const WAKE_REQUEST_SCHEMA = 'financasbot-codex-app-wake-request-v3';

function wakeCodexApp({ branch, chatUrl, mode, observedHash, repoPath, statePath,
    taskId, threadId }, deps = {}) {
    const spawn = deps.spawnSync || spawnSync;
    const helper = path.join(__dirname, 'wakeCodexAppViaIpc.js');
    const result = spawn(process.execPath, [
        helper,
        '--thread-id', threadId,
        '--chat-url', chatUrl,
        '--hash', observedHash,
        '--task-id', taskId,
        '--state-path', statePath,
        '--mode', mode,
        '--branch', branch,
        '--repo-path', repoPath
    ], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 15_000
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`Codex App wake falhou: ${(result.stderr || '').trim() || result.status}`);
    }
    const response = JSON.parse(result.stdout);
    if (response.status !== 'accepted') throw new Error('Codex App não aceitou o wake');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        .test(response.handledByClientId || '')) {
        throw new Error('wake IPC não confirmou o cliente do Codex App');
    }
    return response;
}

function queueCodexAppWakeRequest({ branch, mode, observedHash, repoPath, requestPath,
    statePath, taskId }, deps = {}) {
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
        task_id: taskId,
        state_path: statePath,
        mode,
        branch,
        repo_path: repoPath,
        created_at: now.toISOString()
    }, null, 2)}\n`);
    return { status: 'queued', requestPath: target };
}

function maybeWakeCodexApp({ cache, cachePath, options, observedHash, state }, deps = {}) {
    if (state.orchestration_state !== 'CODEX_READY') {
        return { cache, action: null };
    }
    if (typeof deps.saveCache !== 'function') throw new Error('saveCache ausente no dispatcher');
    const mode = 'execute';
    const threadId = options['app-thread-id'];
    const chatUrl = options['chat-url'];
    const requestPath = options['app-wake-request'];
    if (requestPath && threadId) {
        throw new Error('app-wake-request é exclusivo de app-thread-id');
    }
    if (!threadId && !requestPath) return { cache, action: null };
    if (!requestPath && (!threadId || !chatUrl)) {
        throw new Error('app-thread-id e chat-url devem ser informados juntos');
    }
    if (cache.app_wake_hash === observedHash) return { cache, action: 'already_dispatched' };

    let nextCache = deps.saveCache(cachePath, {
        ...cache,
        observed_hash: observedHash,
        observed_state: state.orchestration_state,
        app_wake_hash: observedHash,
        app_wake_status: 'dispatching'
    }, deps.now?.() || new Date());
    let dispatchStatus;
    try {
        if (requestPath) {
            (deps.queueCodexAppWakeRequest || queueCodexAppWakeRequest)({
                observedHash,
                branch: options.branch,
                mode,
                repoPath: options.repo,
                requestPath,
                statePath: options['state-path'],
                taskId: state.task_id
            }, deps);
            dispatchStatus = 'queued';
        } else {
            (deps.wakeCodexApp || wakeCodexApp)({
                chatUrl,
                branch: options.branch,
                mode,
                observedHash,
                repoPath: options.repo,
                statePath: options['state-path'],
                taskId: state.task_id,
                threadId
            }, deps);
            dispatchStatus = 'accepted';
        }
    } catch (error) {
        nextCache = deps.saveCache(cachePath, {
            ...nextCache,
            app_wake_status: 'failed'
        }, deps.now?.() || new Date());
        throw error;
    }
    nextCache = deps.saveCache(cachePath, {
        ...nextCache,
        app_wake_status: dispatchStatus
    }, deps.now?.() || new Date());
    return { cache: nextCache, action: dispatchStatus };
}

module.exports = {
    WAKE_REQUEST_SCHEMA,
    maybeWakeCodexApp,
    queueCodexAppWakeRequest,
    wakeCodexApp
};
