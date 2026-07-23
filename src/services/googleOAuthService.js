const crypto = require('crypto');
const { google } = require('googleapis');
const {
    issueOAuthConnectionAttempt,
    getOAuthConnectionAttempt,
    claimOAuthConnectionAttempt,
    advanceOAuthConnectionAttempt,
    releaseOAuthConnectionAttempt,
    promoteOAuthConnectionAttempt,
    completeOAuthConnectionAttempt,
    isOAuthSpreadsheetReferenced,
    beginOAuthConnectionCompensation,
    finishOAuthConnectionCompensation,
    listOAuthConnectionCompensationsForRecovery,
    getOAuthConnection
} = require('./oauthTokenStore');
const {
    getUserByIdFresh,
    executeWithFreshUserStatus,
    transitionUserStatus,
    USER_STATUS
} = require('./userService');
const {
    applyUserSpreadsheetTemplate,
    createUserSpreadsheetForAttempt,
    findUserSpreadsheetForAttempt,
    deleteUserSpreadsheetForAttempt,
    buildSpreadsheetUrl
} = require('./userSpreadsheetService');
const {
    OAUTH_CONNECT_ALLOWED_STATUSES,
    assertOAuthLifecycleAllowed
} = require('./oauthLifecyclePolicy');
const logger = require('../utils/logger');

const GOOGLE_OAUTH_SCOPES = Object.freeze([
    'openid',
    'email',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/calendar.events.owned'
]);

const STATE_TTL_SECONDS = Number.parseInt(process.env.GOOGLE_OAUTH_STATE_TTL_SECONDS || '7200', 10);

function base64UrlEncode(buffer) {
    return Buffer.from(buffer)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function base64UrlDecode(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return Buffer.from(padded, 'base64');
}

function getBaseUrl() {
    return String(process.env.DASHBOARD_BASE_URL || '').trim().replace(/\/+$/g, '');
}

function getStateSecret() {
    const secret = String(process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.DASHBOARD_TOKEN_SECRET || '').trim();
    if (!secret || secret.length < 16) {
        throw new Error('GOOGLE_OAUTH_STATE_SECRET ou DASHBOARD_TOKEN_SECRET forte é obrigatório para OAuth.');
    }
    return secret;
}

function getRedirectUri() {
    const explicit = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim();
    if (explicit) return explicit;
    const baseUrl = getBaseUrl();
    if (!baseUrl) throw new Error('DASHBOARD_BASE_URL é obrigatório para montar o callback OAuth.');
    return `${baseUrl}/oauth/google/callback`;
}

function getOAuthClient() {
    const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) {
        throw new Error('GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET são obrigatórios.');
    }
    return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
}

function signPayload(payload) {
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = crypto
        .createHmac('sha256', getStateSecret())
        .update(encodedPayload)
        .digest();
    return `${encodedPayload}.${base64UrlEncode(signature)}`;
}

function verifyOAuthState(state) {
    const [encodedPayload, encodedSignature] = String(state || '').split('.');
    if (!encodedPayload || !encodedSignature) return null;

    const expected = crypto
        .createHmac('sha256', getStateSecret())
        .update(encodedPayload)
        .digest();
    const actual = base64UrlDecode(encodedSignature);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
        return null;
    }

    try {
        const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
        if (payload.provider !== 'google') return null;
        if (!payload.userId) return null;
        if (Number(payload.exp || 0) < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch (error) {
        return null;
    }
}

function createOAuthState({ userId }) {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + Math.max(300, STATE_TTL_SECONDS);
    const attempt = issueOAuthConnectionAttempt({
        userId: String(userId || '').trim(),
        expiresAt: new Date(expiry * 1000)
    });
    return signPayload({
        provider: 'google',
        userId: attempt.user_id,
        attemptId: attempt.attempt_id,
        generation: attempt.generation,
        iat: now,
        exp: expiry
    });
}

function buildGoogleConnectLink({ userId }) {
    const baseUrl = getBaseUrl();
    if (!baseUrl) throw new Error('DASHBOARD_BASE_URL é obrigatório para montar link OAuth.');
    const state = createOAuthState({ userId });
    return `${baseUrl}/oauth/google/start?state=${encodeURIComponent(state)}`;
}

function buildGoogleAuthorizationUrl(state) {
    const payload = verifyOAuthState(state);
    const attempt = payload?.attemptId ? getOAuthConnectionAttempt(payload.attemptId) : null;
    if (!payload || !attempt || attempt.user_id !== payload.userId ||
        attempt.generation !== Number(payload.generation || 0) ||
        attempt.status !== 'issued') {
        throw new Error('State OAuth inválido ou expirado.');
    }
    const oauth2Client = getOAuthClient();
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        include_granted_scopes: true,
        prompt: 'consent',
        scope: GOOGLE_OAUTH_SCOPES,
        state
    });
}

async function fetchGoogleAccount(oauth2Client, injectedOAuth2Api) {
    const oauth2Api = injectedOAuth2Api || google.oauth2({ version: 'v2', auth: oauth2Client });
    const response = await oauth2Api.userinfo.get();
    const data = response?.data || {};
    return {
        id: String(data.id || data.sub || '').trim(),
        email: String(data.email || '').trim().toLowerCase()
    };
}

async function tryFetchGoogleAccount(oauth2Client, injectedOAuth2Api) {
    try {
        return await fetchGoogleAccount(oauth2Client, injectedOAuth2Api);
    } catch (error) {
        logger.warn(`[oauth] account_email_unavailable ${logger.safeError(error)}`);
        return {};
    }
}

async function requireOAuthEligibleUser(userId) {
    const user = await getUserByIdFresh(userId);
    return assertOAuthLifecycleAllowed(user);
}

function callbackAttemptError(outcome) {
    if (outcome === 'in_progress' || outcome === 'retry_later') {
        const error = new Error('ConexÃ£o Google jÃ¡ estÃ¡ sendo concluÃ­da.');
        error.code = 'OAUTH_CALLBACK_IN_PROGRESS';
        return error;
    }
    if (outcome === 'completed') return null;
    const error = new Error('State OAuth invÃ¡lido, expirado ou jÃ¡ substituÃ­do.');
    error.code = 'OAUTH_CALLBACK_INVALID';
    return error;
}

async function waitForCompletedAttempt(attemptId) {
    const timeoutMs = Math.max(100, Math.min(
        Number(process.env.GOOGLE_OAUTH_CONCURRENT_WAIT_MS || 10000),
        30000
    ));
    const deadline = Date.now() + timeoutMs;
    let delayMs = 20;
    while (Date.now() < deadline) {
        const attempt = getOAuthConnectionAttempt(attemptId);
        if (attempt?.status === 'completed') return attempt.result;
        if (attempt && attempt.status !== 'in_progress') return null;
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs = Math.min(delayMs * 2, 200);
    }
    return null;
}

async function compensateCreatedSpreadsheet({ attempt, spreadsheetId, oauth2Client, driveClient }) {
    const safeSpreadsheetId = String(spreadsheetId || attempt?.candidate_spreadsheet_id || '').trim();
    if (!safeSpreadsheetId || attempt?.candidate_sheet_origin === 'preexisting') return false;
    if (isOAuthSpreadsheetReferenced(safeSpreadsheetId)) return false;
    return deleteUserSpreadsheetForAttempt({
        spreadsheetId: safeSpreadsheetId,
        attemptId: attempt.attempt_id,
        oauth2Client,
        driveClient
    });
}

async function executeOAuthConnectionCompensation({
    attemptId,
    generation,
    leaseId = '',
    spreadsheetId = '',
    oauth2Client: injectedOAuth2Client,
    driveClient
} = {}) {
    const claim = beginOAuthConnectionCompensation({ attemptId, generation, leaseId, spreadsheetId });
    if (claim.outcome !== 'claimed') return claim;
    const oauth2Client = injectedOAuth2Client || getOAuthClient();
    if (typeof oauth2Client.setCredentials === 'function') {
        oauth2Client.setCredentials(claim.attempt.tokens || {});
    }
    try {
        const deleted = await compensateCreatedSpreadsheet({
            attempt: claim.attempt,
            oauth2Client,
            driveClient
        });
        const attempt = finishOAuthConnectionCompensation({
            attemptId,
            generation,
            leaseId: claim.leaseId,
            compensated: deleted,
            errorCode: deleted ? '' : 'COMPENSATION_DELETE_NOT_CONFIRMED'
        });
        return { outcome: deleted ? 'compensated' : 'compensation_pending', attempt };
    } catch (error) {
        const attempt = finishOAuthConnectionCompensation({
            attemptId,
            generation,
            leaseId: claim.leaseId,
            compensated: false,
            errorCode: 'COMPENSATION_DELETE_FAILED'
        });
        return { outcome: 'compensation_pending', attempt, error };
    }
}

async function recoverPendingGoogleOAuthCompensations({
    limit = 50,
    oauth2ClientFactory = getOAuthClient,
    driveClient
} = {}) {
    const pending = listOAuthConnectionCompensationsForRecovery({ limit });
    const result = { attempted: 0, compensated: 0, pending: 0, manualRequired: 0 };
    for (const item of pending) {
        const recovery = await executeOAuthConnectionCompensation({
            attemptId: item.attempt_id,
            generation: item.generation,
            oauth2Client: oauth2ClientFactory(),
            driveClient
        });
        if (recovery.outcome === 'claimed' || recovery.outcome === 'in_progress') continue;
        result.attempted += 1;
        if (recovery.outcome === 'compensated') result.compensated += 1;
        else if (recovery.outcome === 'manual_required') result.manualRequired += 1;
        else result.pending += 1;
    }
    return result;
}

function isLifecycleTerminalError(error) {
    const message = String(error?.message || '');
    return /OAuth.*encontrado/i.test(message) || /status.*permite conex/i.test(message);
}

async function completeGoogleOAuthCallback({
    code,
    state,
    oauth2Client: injectedOAuth2Client,
    oauth2Api,
    sheetsClient,
    driveClient
} = {}) {
    const payload = verifyOAuthState(state);
    if (!payload?.attemptId || !Number.isInteger(Number(payload.generation || 0))) {
        throw new Error('State OAuth invÃ¡lido ou expirado.');
    }
    const safeCode = String(code || '').trim();
    if (!safeCode) throw new Error('CÃ³digo OAuth ausente.');

    const claim = claimOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        userId: payload.userId,
        generation: Number(payload.generation)
    });
    if (claim.outcome === 'completed') return { ...claim.result, replayed: true };
    if (claim.outcome === 'in_progress') {
        const completed = await waitForCompletedAttempt(payload.attemptId);
        if (completed) return { ...completed, replayed: true };
        throw callbackAttemptError('in_progress');
    }
    if (claim.outcome !== 'claimed') throw callbackAttemptError(claim.outcome);

    const oauth2Client = injectedOAuth2Client || getOAuthClient();
    const claimContext = {
        attemptId: payload.attemptId,
        generation: Number(payload.generation),
        leaseId: claim.leaseId
    };
    let attempt = claim.attempt;
    let user = null;
    let connection = null;
    let locallyCreatedSpreadsheetId = '';

    try {
        if (attempt.stage === 'issued') {
            user = await requireOAuthEligibleUser(payload.userId);
            attempt = advanceOAuthConnectionAttempt({
                ...claimContext,
                expectedStage: 'issued',
                nextStage: 'token_exchange_started'
            });
            const exchanged = await oauth2Client.getToken(safeCode);
            const tokens = exchanged?.tokens;
            if (!tokens || (!tokens.refresh_token && !tokens.access_token)) {
                throw new Error('Resposta OAuth sem tokens utilizÃ¡veis.');
            }
            attempt = advanceOAuthConnectionAttempt({
                ...claimContext,
                expectedStage: 'token_exchange_started',
                nextStage: 'token_staged',
                tokens,
                scopes: GOOGLE_OAUTH_SCOPES
            });
        }

        if (attempt.stage === 'token_staged') {
            if (typeof oauth2Client.setCredentials === 'function') oauth2Client.setCredentials(attempt.tokens || {});
            user = await requireOAuthEligibleUser(payload.userId);
            const googleAccount = await tryFetchGoogleAccount(oauth2Client, oauth2Api);
            attempt = advanceOAuthConnectionAttempt({
                ...claimContext,
                expectedStage: 'token_staged',
                nextStage: 'account_ready',
                googleAccount
            });
        } else if (attempt.tokens && typeof oauth2Client.setCredentials === 'function') {
            oauth2Client.setCredentials(attempt.tokens);
        }

        if (attempt.stage === 'account_ready') {
            user = user || await requireOAuthEligibleUser(payload.userId);
            const existingConnection = getOAuthConnection(payload.userId);
            if (existingConnection?.spreadsheet_id) {
                attempt = advanceOAuthConnectionAttempt({
                    ...claimContext,
                    expectedStage: 'account_ready',
                    nextStage: 'sheet_ready',
                    spreadsheetId: existingConnection.spreadsheet_id,
                    sheetOrigin: 'preexisting'
                });
            } else {
                attempt = advanceOAuthConnectionAttempt({
                    ...claimContext,
                    expectedStage: 'account_ready',
                    nextStage: 'sheet_create_dispatched'
                });
                let created;
                try {
                    created = await createUserSpreadsheetForAttempt({
                        user,
                        attemptId: attempt.attempt_id,
                        oauth2Client,
                        driveClient
                    });
                } catch (error) {
                    created = await findUserSpreadsheetForAttempt({
                        attemptId: attempt.attempt_id,
                        oauth2Client,
                        driveClient
                    });
                    if (!created) throw error;
                }
                locallyCreatedSpreadsheetId = created.spreadsheetId;
                attempt = advanceOAuthConnectionAttempt({
                    ...claimContext,
                    expectedStage: 'sheet_create_dispatched',
                    nextStage: 'sheet_ready',
                    spreadsheetId: created.spreadsheetId,
                    sheetOrigin: 'created'
                });
            }
        } else if (attempt.stage === 'sheet_create_dispatched') {
            const recovered = await findUserSpreadsheetForAttempt({
                attemptId: attempt.attempt_id,
                oauth2Client,
                driveClient
            });
            if (!recovered) throw new Error('CriaÃ§Ã£o da planilha OAuth permanece incerta; nenhuma segunda criaÃ§Ã£o foi feita.');
            attempt = advanceOAuthConnectionAttempt({
                ...claimContext,
                expectedStage: 'sheet_create_dispatched',
                nextStage: 'sheet_ready',
                spreadsheetId: recovered.spreadsheetId,
                sheetOrigin: 'created'
            });
        }

        if (attempt.stage === 'sheet_ready') {
            user = await requireOAuthEligibleUser(payload.userId);
            await applyUserSpreadsheetTemplate({
                user,
                oauth2Client,
                sheetsClient,
                spreadsheetId: attempt.candidate_spreadsheet_id,
                includeInputExamples: attempt.candidate_sheet_origin === 'created'
            });
            attempt = advanceOAuthConnectionAttempt({
                ...claimContext,
                expectedStage: 'sheet_ready',
                nextStage: 'template_ready'
            });
        }

        if (attempt.stage === 'template_ready') {
            const persistence = await executeWithFreshUserStatus(payload.userId, {
                allowedStatuses: OAUTH_CONNECT_ALLOWED_STATUSES
            }, () => promoteOAuthConnectionAttempt(claimContext));
            if (!persistence.executed) {
                assertOAuthLifecycleAllowed(persistence.user);
                throw new Error('NÃ£o foi possÃ­vel confirmar o lifecycle OAuth.');
            }
            user = persistence.user;
            connection = persistence.result;
            attempt = getOAuthConnectionAttempt(payload.attemptId, { includeTokens: true });
        }

        if (attempt.stage === 'connection_committed') {
            const transition = await transitionUserStatus(payload.userId, {
                allowedFromStatuses: [USER_STATUS.APPROVED_AWAITING_GOOGLE, USER_STATUS.ACTIVE],
                targetStatus: USER_STATUS.ACTIVE
            });
            user = assertOAuthLifecycleAllowed(transition.user);
            attempt = advanceOAuthConnectionAttempt({
                ...claimContext,
                expectedStage: 'connection_committed',
                nextStage: 'lifecycle_active'
            });
        }

        if (attempt.stage !== 'lifecycle_active') {
            throw new Error('Tentativa OAuth terminou em etapa inesperada.');
        }
        user = user || await requireOAuthEligibleUser(payload.userId);
        connection = connection || getOAuthConnection(payload.userId);
        const receipt = {
            userId: payload.userId,
            whatsappId: user.whatsapp_id || '',
            spreadsheetId: attempt.candidate_spreadsheet_id,
            spreadsheetUrl: buildSpreadsheetUrl(attempt.candidate_spreadsheet_id),
            userStatus: user.status || ''
        };
        completeOAuthConnectionAttempt({ ...claimContext, result: receipt });
        return { ...receipt, connection, replayed: false };
    } catch (error) {
        const currentAttempt = getOAuthConnectionAttempt(payload.attemptId, { includeTokens: true }) || attempt;
        const terminal = isLifecycleTerminalError(error) ||
            currentAttempt?.stage === 'token_exchange_started' ||
            currentAttempt?.status === 'superseded';
        if (terminal && (locallyCreatedSpreadsheetId || currentAttempt?.candidate_sheet_origin === 'created') &&
            !['connection_committed', 'lifecycle_active', 'completed'].includes(currentAttempt?.stage)) {
            await executeOAuthConnectionCompensation({
                attemptId: payload.attemptId,
                generation: Number(payload.generation),
                leaseId: claim.leaseId,
                spreadsheetId: locallyCreatedSpreadsheetId,
                oauth2Client,
                driveClient
            });
        }
        releaseOAuthConnectionAttempt({
            ...claimContext,
            retryable: !terminal,
            errorCode: terminal ? 'TERMINAL_CALLBACK_FAILURE' : 'RETRYABLE_CALLBACK_FAILURE'
        });
        throw error;
    }
}

module.exports = {
    GOOGLE_OAUTH_SCOPES,
    buildGoogleConnectLink,
    buildGoogleAuthorizationUrl,
    completeGoogleOAuthCallback,
    recoverPendingGoogleOAuthCompensations,
    verifyOAuthState,
    createOAuthState,
    getOAuthClient,
    getRedirectUri,
    __test__: {
        fetchGoogleAccount,
        requireOAuthEligibleUser
    }
};
