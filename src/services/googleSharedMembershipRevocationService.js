const logger = require('../utils/logger');
const {
    beginSharedMembershipRevocationsForLifecycle,
    beginDetachedSharedPermissionRevocation,
    claimSharedMembershipRevocation,
    markSharedMembershipRevocationResult,
    listSharedMembershipRevocationsForRecovery
} = require('./oauthTokenStore');
const { revokeSpreadsheetPermission } = require('./google');

function boundedInteger(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(Math.trunc(parsed), max));
}

async function withTimeout(promise, timeoutMs) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    const error = new Error('Remoção de permissão Drive excedeu o tempo limite.');
                    error.code = 'SHARED_PERMISSION_REVOCATION_TIMEOUT';
                    reject(error);
                }, timeoutMs);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function executeSharedMembershipRevocationClaim(claim, {
    revokePermission = revokeSpreadsheetPermission,
    timeoutMs = Number(process.env.SHARED_PERMISSION_REVOCATION_TIMEOUT_MS || 5000),
    now,
    baseDelayMs = Number(process.env.SHARED_PERMISSION_REVOCATION_RETRY_BASE_MS || 300000),
    maxDelayMs = Number(process.env.SHARED_PERMISSION_REVOCATION_RETRY_MAX_MS || 86400000)
} = {}) {
    if (!claim?.job || !claim?.ownerTokens || !claim?.leaseId) {
        return { attempted: false, status: claim?.job?.status || 'not_required' };
    }
    const safeTimeoutMs = boundedInteger(timeoutMs, 5000, 10, 30000);
    try {
        const revoked = await withTimeout(Promise.resolve().then(() => revokePermission({
            ownerUserId: claim.job.owner_user_id,
            spreadsheetId: claim.job.spreadsheet_id,
            permissionId: claim.job.drive_permission_id,
            memberEmail: claim.job.member_google_email,
            ownerTokens: claim.ownerTokens
        })), safeTimeoutMs);
        if (revoked !== true) {
            throw new Error('Remoção de permissão Drive não foi confirmada.');
        }
        const completed = markSharedMembershipRevocationResult(
            claim.job.revocation_id,
            claim.leaseId,
            { status: 'remote_revoked', now }
        );
        return {
            attempted: true,
            status: completed?.applied ? 'remote_revoked' : 'superseded'
        };
    } catch (error) {
        const failed = markSharedMembershipRevocationResult(
            claim.job.revocation_id,
            claim.leaseId,
            {
                status: 'remote_failed',
                errorCode: 'DRIVE_PERMISSION_REVOKE_FAILED',
                now,
                baseDelayMs,
                maxDelayMs
            }
        );
        return {
            attempted: true,
            status: failed?.applied ? 'remote_failed' : 'superseded'
        };
    }
}

async function revokeSharedMembershipsForLifecycle(userId, {
    reason = 'lifecycle',
    targetOwnerTokens = null,
    relationshipScope = 'all',
    revokePermission = revokeSpreadsheetPermission,
    timeoutMs,
    now,
    retentionDays = Number(process.env.SHARED_PERMISSION_REVOCATION_RETENTION_DAYS || 30),
    maxAttempts = Number(process.env.SHARED_PERMISSION_REVOCATION_MAX_ATTEMPTS || 5),
    baseDelayMs,
    maxDelayMs
} = {}) {
    const jobs = beginSharedMembershipRevocationsForLifecycle(userId, {
        reason,
        targetOwnerTokens,
        relationshipScope,
        now,
        retentionDays,
        maxAttempts,
        leaseDurationMs: boundedInteger(timeoutMs, 5000, 10, 30000) + 5000
    });
    const result = {
        localRevoked: jobs.length,
        attempted: 0,
        revoked: 0,
        failed: 0,
        manualRequired: 0
    };

    for (const job of jobs) {
        if (!job.ownerTokens || !job.leaseId) {
            result.manualRequired += 1;
            continue;
        }
        const outcome = await executeSharedMembershipRevocationClaim({
            job,
            ownerTokens: job.ownerTokens,
            leaseId: job.leaseId
        }, { revokePermission, timeoutMs, now, baseDelayMs, maxDelayMs });
        if (!outcome.attempted) continue;
        result.attempted += 1;
        if (outcome.status === 'remote_revoked') result.revoked += 1;
        else result.failed += 1;
    }

    if (result.localRevoked > 0) {
        logger.info(
            `oauth: compartilhamentos familiares removidos por lifecycle local=${result.localRevoked} `
            + `remote=${result.revoked} pending=${result.failed} manual=${result.manualRequired}`
        );
    }
    return result;
}

async function revokeSharedMembershipForMember(userId, options = {}) {
    return revokeSharedMembershipsForLifecycle(userId, {
        ...options,
        relationshipScope: 'member'
    });
}

async function compensateUnpersistedSharedPermission({
    memberUserId,
    ownerUserId,
    spreadsheetId,
    drivePermissionId = '',
    memberGoogleEmail = '',
    ownerTokens = null,
    reason = 'membership_persist_failed'
} = {}, {
    revokePermission = revokeSpreadsheetPermission,
    timeoutMs,
    now,
    retentionDays = Number(process.env.SHARED_PERMISSION_REVOCATION_RETENTION_DAYS || 30),
    maxAttempts = Number(process.env.SHARED_PERMISSION_REVOCATION_MAX_ATTEMPTS || 5),
    baseDelayMs,
    maxDelayMs
} = {}) {
    const job = beginDetachedSharedPermissionRevocation({
        memberUserId,
        ownerUserId,
        spreadsheetId,
        drivePermissionId,
        memberGoogleEmail,
        reason,
        ownerTokens,
        now,
        retentionDays,
        maxAttempts,
        leaseDurationMs: boundedInteger(timeoutMs, 5000, 10, 30000) + 5000
    });
    if (!job.ownerTokens || !job.leaseId) {
        return { attempted: 0, revoked: 0, failed: 0, manualRequired: 1 };
    }
    const outcome = await executeSharedMembershipRevocationClaim({
        job,
        ownerTokens: job.ownerTokens,
        leaseId: job.leaseId
    }, { revokePermission, timeoutMs, now, baseDelayMs, maxDelayMs });
    return {
        attempted: outcome.attempted ? 1 : 0,
        revoked: outcome.status === 'remote_revoked' ? 1 : 0,
        failed: outcome.status === 'remote_failed' ? 1 : 0,
        manualRequired: outcome.attempted ? 0 : 1
    };
}

async function retryPendingSharedMembershipRevocations({
    now,
    revokePermission = revokeSpreadsheetPermission,
    timeoutMs,
    baseDelayMs,
    maxDelayMs,
    limit = 50
} = {}) {
    const jobs = listSharedMembershipRevocationsForRecovery({ limit, now });
    const result = { attempted: 0, revoked: 0, failed: 0, manualRequired: 0 };
    const leaseDurationMs = boundedInteger(timeoutMs, 5000, 10, 30000) + 5000;

    for (const job of jobs) {
        const claim = claimSharedMembershipRevocation(job.revocation_id, {
            now,
            leaseDurationMs,
            respectBackoff: true
        });
        if (!claim?.claimed) {
            if (String(claim?.job?.status || '').startsWith('manual_required_')) {
                result.manualRequired += 1;
            }
            continue;
        }
        const outcome = await executeSharedMembershipRevocationClaim(claim, {
            revokePermission,
            timeoutMs,
            now,
            baseDelayMs,
            maxDelayMs
        });
        if (!outcome.attempted) continue;
        result.attempted += 1;
        if (outcome.status === 'remote_revoked') result.revoked += 1;
        else result.failed += 1;
    }
    return result;
}

module.exports = {
    revokeSharedMembershipsForLifecycle,
    revokeSharedMembershipForMember,
    compensateUnpersistedSharedPermission,
    retryPendingSharedMembershipRevocations,
    __test__: {
        withTimeout,
        executeSharedMembershipRevocationClaim
    }
};
