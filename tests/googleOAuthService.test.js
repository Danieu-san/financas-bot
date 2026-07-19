const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

function resetModules() {
    for (const modulePath of [
        '../src/services/oauthTokenStore',
        '../src/services/googleOAuthService',
        '../src/services/userService',
        '../src/services/userSpreadsheetService'
    ]) {
        try {
            delete require.cache[require.resolve(modulePath)];
        } catch (error) {
            // Module may not exist yet in the RED step.
        }
    }
}

function configureTestEnv() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financas-oauth-'));
    const dbPath = path.join(tempDir, 'oauth.sqlite');
    process.env.OAUTH_TOKEN_DB_PATH = dbPath;
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id-test';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret-test';
    process.env.DASHBOARD_BASE_URL = 'https://bot.example.com';
    process.env.GOOGLE_OAUTH_STATE_SECRET = 'state-secret-test';
    return { tempDir, dbPath };
}

test('oauthTokenStore encrypts refresh tokens at rest and decrypts only when requested', () => {
    resetModules();
    const { dbPath } = configureTestEnv();
    const store = require('../src/services/oauthTokenStore');

    store.saveOAuthConnection('user-oauth-1', {
        scopes: ['scope-a', 'scope-b'],
        tokens: {
            access_token: 'access-secret-value',
            refresh_token: 'refresh-secret-value',
            expiry_date: 1770000000000
        },
        googleAccount: {
            id: 'google-user-1',
            email: 'user@example.com'
        }
    });

    const metadata = store.getOAuthConnection('user-oauth-1');
    assert.strictEqual(metadata.user_id, 'user-oauth-1');
    assert.strictEqual(metadata.provider, 'google');
    assert.strictEqual(metadata.google_email, 'user@example.com');
    assert.strictEqual(metadata.tokens, undefined);

    const withTokens = store.getOAuthConnection('user-oauth-1', { includeTokens: true });
    assert.strictEqual(withTokens.tokens.refresh_token, 'refresh-secret-value');
    assert.strictEqual(withTokens.tokens.access_token, 'access-secret-value');

    const rawFile = fs.readFileSync(dbPath);
    assert.strictEqual(rawFile.includes(Buffer.from('refresh-secret-value')), false);
    assert.strictEqual(rawFile.includes(Buffer.from('access-secret-value')), false);
});

test('oauthTokenStore links shared spreadsheets without merging user identities', () => {
    resetModules();
    configureTestEnv();
    const store = require('../src/services/oauthTokenStore');

    store.saveOAuthConnection('owner-user', {
        scopes: ['scope-a'],
        tokens: { refresh_token: 'owner-refresh-secret' },
        spreadsheetId: 'spreadsheet-casal'
    });
    store.saveOAuthConnection('member-user', {
        scopes: ['scope-a'],
        tokens: { refresh_token: 'member-refresh-secret' },
        spreadsheetId: 'spreadsheet-member-original'
    });

    const membership = store.setSharedSpreadsheetMembership({
        ownerUserId: 'owner-user',
        memberUserId: 'member-user',
        spreadsheetId: 'spreadsheet-casal',
        memberGoogleEmail: 'MEMBER@example.com',
        drivePermissionId: 'permission-123'
    });

    assert.strictEqual(membership.user_id, 'member-user');
    assert.strictEqual(membership.owner_user_id, 'owner-user');
    assert.strictEqual(membership.spreadsheet_id, 'spreadsheet-casal');
    assert.strictEqual(membership.member_google_email, 'member@example.com');
    assert.strictEqual(membership.drive_permission_id, 'permission-123');
    assert.deepStrictEqual(store.getFinancialScopeUserIds('member-user'), ['owner-user', 'member-user']);
    assert.deepStrictEqual(store.getFinancialScopeUserIds('owner-user'), ['owner-user', 'member-user']);
    assert.strictEqual(store.getOAuthConnection('member-user').spreadsheet_id, 'spreadsheet-member-original');

    const revoked = store.revokeSharedSpreadsheetMembership('member-user');
    assert.strictEqual(revoked.owner_user_id, 'owner-user');
    assert.strictEqual(store.getSharedSpreadsheetMembership('member-user'), null);
    assert.deepStrictEqual(store.getFinancialScopeUserIds('member-user'), ['member-user']);
    assert.deepStrictEqual(store.getFinancialScopeUserIds('owner-user'), ['owner-user']);
});

test('oauthTokenStore refuses to store tokens without a strong encryption key', () => {
    resetModules();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financas-oauth-missing-key-'));
    process.env.OAUTH_TOKEN_DB_PATH = path.join(tempDir, 'oauth.sqlite');
    delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;

    const store = require('../src/services/oauthTokenStore');
    assert.throws(() => {
        store.saveOAuthConnection('user-oauth-2', {
            scopes: ['scope-a'],
            tokens: { refresh_token: 'refresh-secret-value' }
        });
    }, /OAUTH_TOKEN_ENCRYPTION_KEY/);
});

test('googleOAuthService builds least-privilege OAuth links with signed state', () => {
    resetModules();
    configureTestEnv();
    const oauth = require('../src/services/googleOAuthService');

    const connectLink = oauth.buildGoogleConnectLink({ userId: 'user-oauth-3' });
    const connectUrl = new URL(connectLink);
    assert.strictEqual(connectUrl.origin, 'https://bot.example.com');
    assert.strictEqual(connectUrl.pathname, '/oauth/google/start');

    const state = connectUrl.searchParams.get('state');
    const verified = oauth.verifyOAuthState(state);
    assert.strictEqual(verified.userId, 'user-oauth-3');
    assert.strictEqual(verified.provider, 'google');

    const googleUrl = new URL(oauth.buildGoogleAuthorizationUrl(state));
    assert.strictEqual(googleUrl.hostname, 'accounts.google.com');
    assert.strictEqual(googleUrl.searchParams.get('access_type'), 'offline');
    assert.strictEqual(googleUrl.searchParams.get('include_granted_scopes'), 'true');
    assert.strictEqual(googleUrl.searchParams.get('redirect_uri'), 'https://bot.example.com/oauth/google/callback');

    const scopes = googleUrl.searchParams.get('scope').split(' ');
    assert.ok(scopes.includes('openid'));
    assert.ok(scopes.includes('email'));
    assert.ok(scopes.includes('https://www.googleapis.com/auth/drive.file'));
    assert.ok(scopes.includes('https://www.googleapis.com/auth/calendar.events.owned'));
    assert.ok(!scopes.includes('https://www.googleapis.com/auth/drive'));
    assert.ok(!scopes.includes('https://www.googleapis.com/auth/calendar'));
});

test('googleOAuthService rejects tampered state', () => {
    resetModules();
    configureTestEnv();
    const oauth = require('../src/services/googleOAuthService');
    const link = oauth.buildGoogleConnectLink({ userId: 'user-oauth-4' });
    const state = new URL(link).searchParams.get('state');

    assert.strictEqual(oauth.verifyOAuthState(`${state}tampered`), null);
    assert.strictEqual(oauth.verifyOAuthState('not-a-token'), null);
});

test('completeGoogleOAuthCallback stores encrypted tokens and activates connected user', async () => {
    resetModules();
    const { dbPath } = configureTestEnv();
    const userServicePath = require.resolve('../src/services/userService');
    const userSpreadsheetPath = require.resolve('../src/services/userSpreadsheetService');
    const completedCalls = [];

    require.cache[userServicePath] = {
        id: userServicePath,
        filename: userServicePath,
        loaded: true,
        exports: {
            getUserByIdFresh: async (userId) => ({
                user_id: userId,
                display_name: 'Usuário OAuth',
                status: 'APPROVED_AWAITING_GOOGLE'
            }),
            executeWithFreshUserStatus: async (userId, _options, operation) => {
                const user = {
                    user_id: userId,
                    display_name: 'Usuário OAuth',
                    status: 'APPROVED_AWAITING_GOOGLE'
                };
                return { executed: true, reason: 'executed', user, result: operation(user) };
            }
        }
    };
    require.cache[userSpreadsheetPath] = {
        id: userSpreadsheetPath,
        filename: userSpreadsheetPath,
        loaded: true,
        exports: {
            completeGoogleConnectionForUser: async (payload) => {
                completedCalls.push(payload);
                return {
                    spreadsheetId: 'spreadsheet-connected-1',
                    user: { user_id: payload.user.user_id, status: 'ACTIVE' }
                };
            }
        }
    };

    const oauth = require('../src/services/googleOAuthService');
    const state = new URL(oauth.buildGoogleConnectLink({ userId: 'user-oauth-callback' })).searchParams.get('state');
    const fakeOAuthClient = {
        credentials: null,
        getToken: async (code) => {
            assert.strictEqual(code, 'authorization-code');
            return {
                tokens: {
                    access_token: 'callback-access-secret',
                    refresh_token: 'callback-refresh-secret'
                }
            };
        },
        setCredentials(tokens) {
            this.credentials = tokens;
        }
    };

    const result = await oauth.completeGoogleOAuthCallback({
        code: 'authorization-code',
        state,
        oauth2Client: fakeOAuthClient,
        oauth2Api: {
            userinfo: {
                get: async () => ({
                    data: {
                        id: 'google-callback-user',
                        email: 'Callback.User@Example.com'
                    }
                })
            }
        },
        sheetsClient: { mocked: true }
    });

    assert.strictEqual(result.userId, 'user-oauth-callback');
    assert.strictEqual(result.spreadsheetId, 'spreadsheet-connected-1');
    assert.strictEqual(result.userStatus, 'ACTIVE');
    assert.strictEqual(fakeOAuthClient.credentials.refresh_token, 'callback-refresh-secret');
    assert.strictEqual(completedCalls.length, 1);
    assert.strictEqual(completedCalls[0].user.user_id, 'user-oauth-callback');

    const rawFile = fs.readFileSync(dbPath);
    assert.strictEqual(rawFile.includes(Buffer.from('callback-refresh-secret')), false);

    const store = require('../src/services/oauthTokenStore');
    const connection = store.getOAuthConnection('user-oauth-callback');
    assert.strictEqual(connection.google_user_id, 'google-callback-user');
    assert.strictEqual(connection.google_email, 'callback.user@example.com');
});
