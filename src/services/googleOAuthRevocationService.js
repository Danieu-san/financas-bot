const { google } = require('googleapis');
const logger = require('../utils/logger');
const {
    beginOAuthRevocation,
    getOAuthRevocation,
    markOAuthRevocationResult,
    listOAuthRevocationsForRecovery,
    expireOAuthRevocation
} = require('./oauthTokenStore');

function createRemoteTokenRevoker() {
    const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) {
        throw new Error('Credenciais OAuth Google indisponíveis para revogação remota.');
    }
    const client = new google.auth.OAuth2(clientId, clientSecret);
    return token => client.revokeToken(token);
}

function selectRevocationToken(tokens = {}) {
    return String(tokens.refresh_token || tokens.access_token || '').trim();
}

async function withTimeout(promise, timeoutMs) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    const error = new Error('Revogação OAuth remota excedeu o tempo limite.');
                    error.code = 'OAUTH_REVOCATION_TIMEOUT';
                    reject(error);
                }, timeoutMs);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function revokeGoogleConnectionForUser(userId, {
    reason = 'lifecycle',
    revocationId = '',
    revokeToken,
    timeoutMs = Number(process.env.OAUTH_REVOCATION_TIMEOUT_MS || 5000),
    now,
    retentionDays = Number(process.env.OAUTH_REVOCATION_RETENTION_DAYS || 30),
    maxAttempts = Number(process.env.OAUTH_REVOCATION_MAX_ATTEMPTS || 5),
    baseDelayMs = Number(process.env.OAUTH_REVOCATION_RETRY_BASE_MS || 300000),
    maxDelayMs = Number(process.env.OAUTH_REVOCATION_RETRY_MAX_MS || 86400000),
    respectBackoff = false
} = {}) {
    const safeTimeoutMs = Math.max(10, Math.min(Number(timeoutMs) || 5000, 30000));
    const started = beginOAuthRevocation(userId, {
        reason,
        revocationId,
        now,
        retentionDays,
        maxAttempts,
        leaseDurationMs: safeTimeoutMs + 5000,
        respectBackoff
    });
    if (!started.tokens) {
        const existing = started.revocation || getOAuthRevocation(userId);
        const manualRequired = String(existing?.status || '').startsWith('manual_required_');
        return {
            localStatus: existing ? 'already_revoked' : 'not_connected',
            remoteStatus: !existing
                ? 'not_required'
                : (existing.status === 'remote_revoked'
                    ? 'already_revoked'
                    : (manualRequired
                        ? 'manual_required'
                        : (existing.status === 'in_progress' ? 'in_progress' : 'pending'))),
            attempted: false,
            attempts: Number(existing?.attempts || 0)
        };
    }

    const token = selectRevocationToken(started.tokens);
    if (!token) {
        const completed = markOAuthRevocationResult(userId, started.revocationId, started.leaseId, {
            status: 'remote_revoked',
            now
        });
        return {
            localStatus: started.started ? 'revoked' : 'already_revoked',
            remoteStatus: completed.applied ? 'not_required' : 'superseded',
            attempted: completed.applied,
            attempts: completed.attempts
        };
    }

    try {
        const remoteRevoker = typeof revokeToken === 'function' ? revokeToken : createRemoteTokenRevoker();
        await withTimeout(Promise.resolve().then(() => remoteRevoker(token)), safeTimeoutMs);
        const completed = markOAuthRevocationResult(userId, started.revocationId, started.leaseId, {
            status: 'remote_revoked',
            now
        });
        if (completed.applied) {
            logger.info('oauth: credencial individual revogada local e remotamente');
        } else {
            logger.warn('oauth: resultado remoto obsoleto descartado');
        }
        return {
            localStatus: started.started ? 'revoked' : 'already_revoked',
            remoteStatus: completed.applied ? 'revoked' : 'superseded',
            attempted: true,
            attempts: completed.attempts
        };
    } catch (error) {
        const failed = markOAuthRevocationResult(userId, started.revocationId, started.leaseId, {
            status: 'remote_failed',
            errorCode: 'REMOTE_REVOKE_FAILED',
            now,
            baseDelayMs,
            maxDelayMs
        });
        if (failed.applied) {
            logger.warn('oauth: credencial individual revogada localmente; revogação remota pendente');
        } else {
            logger.warn('oauth: falha remota obsoleta descartada');
        }
        return {
            localStatus: started.started ? 'revoked' : 'already_revoked',
            remoteStatus: failed.applied ? 'failed' : 'superseded',
            attempted: true,
            attempts: failed.attempts
        };
    }
}

function normalizeRecoveryDate(value) {
    const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value || Date.now());
    if (Number.isNaN(parsed.getTime())) throw new Error('Data de recuperação OAuth inválida.');
    return parsed;
}

function boundedInteger(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(Math.trunc(parsed), max));
}

async function retryPendingGoogleRevocations({
    now,
    revokeToken,
    timeoutMs = Number(process.env.OAUTH_REVOCATION_TIMEOUT_MS || 5000),
    retentionDays = Number(process.env.OAUTH_REVOCATION_RETENTION_DAYS || 30),
    maxAttempts = Number(process.env.OAUTH_REVOCATION_MAX_ATTEMPTS || 5),
    baseDelayMs = Number(process.env.OAUTH_REVOCATION_RETRY_BASE_MS || 300000),
    maxDelayMs = Number(process.env.OAUTH_REVOCATION_RETRY_MAX_MS || 86400000),
    limit = 50
} = {}) {
    const recoveryAt = normalizeRecoveryDate(now);
    const safeRetentionDays = boundedInteger(retentionDays, 30, 1, 90);
    const safeMaxAttempts = boundedInteger(maxAttempts, 5, 1, 20);
    const jobs = listOAuthRevocationsForRecovery({ limit, now: recoveryAt });
    const result = { attempted: 0, revoked: 0, failed: 0, expired: 0 };

    for (const job of jobs) {
        const expiresAt = normalizeRecoveryDate(job.expires_at);
        if (recoveryAt.getTime() >= expiresAt.getTime()) {
            const expired = expireOAuthRevocation(job.user_id, job.revocation_id, {
                status: 'manual_required_expired',
                errorCode: 'REVOCATION_RETENTION_EXPIRED',
                now: recoveryAt
            });
            if (expired.applied) result.expired += 1;
            continue;
        }
        if (job.attempts >= job.max_attempts) {
            const exhausted = expireOAuthRevocation(job.user_id, job.revocation_id, {
                status: 'manual_required_exhausted',
                errorCode: 'REVOCATION_ATTEMPTS_EXHAUSTED',
                now: recoveryAt
            });
            if (exhausted.applied) result.expired += 1;
            continue;
        }
        const retried = await revokeGoogleConnectionForUser(job.user_id, {
            reason: job.reason,
            revocationId: job.revocation_id,
            revokeToken,
            timeoutMs,
            now: recoveryAt,
            retentionDays: safeRetentionDays,
            maxAttempts: safeMaxAttempts,
            baseDelayMs,
            maxDelayMs,
            respectBackoff: true
        });
        if (!retried.attempted) continue;
        result.attempted += 1;
        if (['revoked', 'already_revoked', 'not_required'].includes(retried.remoteStatus)) {
            result.revoked += 1;
        } else {
            result.failed += 1;
        }
    }

    return result;
}

module.exports = {
    revokeGoogleConnectionForUser,
    retryPendingGoogleRevocations,
    __test__: {
        selectRevocationToken,
        createRemoteTokenRevoker,
        withTimeout
    }
};
