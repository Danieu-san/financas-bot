const crypto = require('crypto');
const { google } = require('googleapis');
const { saveOAuthConnection } = require('./oauthTokenStore');
const { getUserByIdFresh, executeWithFreshUserStatus } = require('./userService');
const { completeGoogleConnectionForUser } = require('./userSpreadsheetService');
const {
    OAUTH_CONNECT_ALLOWED_STATUSES,
    assertOAuthLifecycleAllowed
} = require('./oauthLifecyclePolicy');

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
    return signPayload({
        provider: 'google',
        userId: String(userId || '').trim(),
        iat: now,
        exp: now + Math.max(300, STATE_TTL_SECONDS)
    });
}

function buildGoogleConnectLink({ userId }) {
    const baseUrl = getBaseUrl();
    if (!baseUrl) throw new Error('DASHBOARD_BASE_URL é obrigatório para montar link OAuth.');
    const state = createOAuthState({ userId });
    return `${baseUrl}/oauth/google/start?state=${encodeURIComponent(state)}`;
}

function buildGoogleAuthorizationUrl(state) {
    if (!verifyOAuthState(state)) {
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
        console.warn(`⚠️ OAuth Google conectado sem e-mail da conta: ${error.message}`);
        return {};
    }
}

async function requireOAuthEligibleUser(userId) {
    const user = await getUserByIdFresh(userId);
    return assertOAuthLifecycleAllowed(user);
}

async function completeGoogleOAuthCallback({ code, state, oauth2Client: injectedOAuth2Client, oauth2Api, sheetsClient } = {}) {
    const payload = verifyOAuthState(state);
    if (!payload) {
        throw new Error('State OAuth inválido ou expirado.');
    }
    const safeCode = String(code || '').trim();
    if (!safeCode) {
        throw new Error('Código OAuth ausente.');
    }

    // Fail before exchanging a code when the signed identity is no longer
    // allowed to connect Google.
    let user = await requireOAuthEligibleUser(payload.userId);

    const oauth2Client = injectedOAuth2Client || getOAuthClient();
    const { tokens } = await oauth2Client.getToken(safeCode);
    if (!tokens || (!tokens.refresh_token && !tokens.access_token)) {
        throw new Error('Resposta OAuth sem tokens utilizáveis.');
    }

    if (typeof oauth2Client.setCredentials === 'function') {
        oauth2Client.setCredentials(tokens);
    }

    user = await requireOAuthEligibleUser(payload.userId);
    const googleAccount = await tryFetchGoogleAccount(oauth2Client, oauth2Api);
    const persistence = await executeWithFreshUserStatus(payload.userId, {
        allowedStatuses: OAUTH_CONNECT_ALLOWED_STATUSES
    }, currentUser => saveOAuthConnection(payload.userId, {
        scopes: GOOGLE_OAUTH_SCOPES,
        tokens,
        googleAccount
    }));
    if (!persistence.executed) {
        assertOAuthLifecycleAllowed(persistence.user);
        throw new Error('Não foi possível confirmar o lifecycle OAuth.');
    }
    user = persistence.user;
    const connection = persistence.result;

    const completion = await completeGoogleConnectionForUser({
        user,
        oauth2Client,
        sheetsClient
    });

    return {
        userId: payload.userId,
        whatsappId: completion.user?.whatsapp_id || user.whatsapp_id || '',
        connection,
        spreadsheetId: completion.spreadsheetId,
        spreadsheetUrl: completion.spreadsheetUrl || '',
        userStatus: completion.user?.status || ''
    };
}

module.exports = {
    GOOGLE_OAUTH_SCOPES,
    buildGoogleConnectLink,
    buildGoogleAuthorizationUrl,
    completeGoogleOAuthCallback,
    verifyOAuthState,
    createOAuthState,
    getOAuthClient,
    getRedirectUri,
    __test__: {
        fetchGoogleAccount,
        requireOAuthEligibleUser
    }
};
