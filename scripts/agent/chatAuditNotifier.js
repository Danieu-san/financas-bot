'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const GITHUB_REPOSITORY_URL = 'https://github.com/Danieu-san/financas-bot';

function assertAbsoluteExistingFile(value, name) {
    if (!path.isAbsolute(value)) throw new Error(`${name} deve ser absoluto`);
    const resolved = fs.realpathSync(value);
    if (!fs.statSync(resolved).isFile()) throw new Error(`${name} não é arquivo`);
    return resolved;
}

function assertChatConversationUrl(value) {
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error('chat-url inválida');
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'chatgpt.com'
        || parsed.search || parsed.hash
        || !/^\/(?:g\/[^/]+\/)?c\/[0-9a-f-]+\/?$/i.test(parsed.pathname)) {
        throw new Error('chat-url deve apontar para uma conversa HTTPS do chatgpt.com');
    }
    return parsed.toString();
}

function buildChatAuditMessage({ branch, remoteCommitSha, statePath, state, observedHash }) {
    if (!/^[0-9a-f]{40}$/i.test(remoteCommitSha || '')) {
        throw new Error('SHA remoto da campainha inválido');
    }
    if (!/^[0-9a-f]{64}$/i.test(observedHash || '')) {
        throw new Error('hash mecânico da campainha inválido');
    }
    const commitUrl = `${GITHUB_REPOSITORY_URL}/commit/${remoteCommitSha}`;
    const rawBase = `https://raw.githubusercontent.com/Danieu-san/financas-bot/${remoteCommitSha}`;
    return [
        'AUDITORIA_FINANCASBOT_PRONTA',
        `notification_id=${observedHash}`,
        `task_id=${state.task_id}`,
        `commit=${remoteCommitSha}`,
        `branch=${branch}`,
        `state_path=${statePath}`,
        `result_file=${state.result_file}`,
        `commit_url=${commitUrl}`,
        `state_url=${rawBase}/${statePath}`,
        `result_url=${rawBase}/${state.result_file}`,
        'Consulte o commit imutável e os dois arquivos no GitHub, confirme o SHA lido, faça a auditoria independente e devolva o resultado pelo canal versionado. O navegador é apenas a campainha; o GitHub é a autoridade.'
    ].join(' ');
}

function maybeNotifyChat({ cache, cachePath, options, observedHash, remoteCommitSha,
    state, powershellPath }, deps = {}) {
    const notifierPath = options['chat-notifier-script'];
    if (state.orchestration_state !== 'CHAT_READY' || !notifierPath) {
        return { cache, action: null };
    }
    if (cache.chat_notify_hash === observedHash && cache.chat_notify_status === 'sent') {
        return { cache, action: 'already_sent' };
    }
    if (typeof deps.saveCache !== 'function') throw new Error('saveCache ausente no notificador');
    const resolvedNotifier = assertAbsoluteExistingFile(notifierPath, 'chat-notifier-script');
    if (path.extname(resolvedNotifier).toLowerCase() !== '.ps1'
        || fs.lstatSync(resolvedNotifier).isSymbolicLink()) {
        throw new Error('chat-notifier-script deve ser arquivo PowerShell regular');
    }
    const expectedHash = options['chat-notifier-sha256'];
    if (!/^[0-9a-f]{64}$/i.test(expectedHash || '')) {
        throw new Error('chat-notifier-sha256 inválido');
    }
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(resolvedNotifier)).digest('hex');
    if (actualHash !== expectedHash.toLowerCase()) {
        throw new Error('chat-notifier-script divergiu do SHA-256 instalado');
    }
    const chatUrl = assertChatConversationUrl(options['chat-url']);
    const message = buildChatAuditMessage({
        branch: options.branch,
        remoteCommitSha,
        statePath: options['state-path'],
        state,
        observedHash
    });
    let nextCache = deps.saveCache(cachePath, {
        ...cache,
        chat_notify_hash: observedHash,
        chat_notify_status: 'dispatching'
    }, deps.now?.() || new Date());
    const spawn = deps.spawnSync || spawnSync;
    const result = spawn(powershellPath, [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', resolvedNotifier,
        '-ConversationUrl', chatUrl,
        '-Message', message,
        '-LoginTimeoutSeconds', '90'
    ], {
        encoding: 'utf8',
        windowsHide: true,
        shell: false,
        timeout: 120_000
    });
    if (result.error || result.status !== 0) {
        nextCache = deps.saveCache(cachePath, {
            ...nextCache,
            chat_notify_hash: null,
            chat_notify_status: 'failed'
        }, deps.now?.() || new Date());
        throw result.error || new Error(
            `notificador do Chat falhou: ${(result.stderr || '').trim() || result.status}`
        );
    }
    nextCache = deps.saveCache(cachePath, {
        ...nextCache,
        chat_notify_status: 'sent'
    }, deps.now?.() || new Date());
    return { cache: nextCache, action: 'sent' };
}

function resolveFetchedCommitSha(repoPath, deps = {}) {
    if (typeof deps.runGit !== 'function') throw new Error('runGit ausente no notificador');
    const value = deps.runGit(repoPath, ['rev-parse', 'FETCH_HEAD'], deps).trim();
    if (!/^[0-9a-f]{40}$/i.test(value)) throw new Error('FETCH_HEAD remoto inválido');
    return value;
}

module.exports = {
    assertChatConversationUrl,
    buildChatAuditMessage,
    maybeNotifyChat,
    resolveFetchedCommitSha
};
