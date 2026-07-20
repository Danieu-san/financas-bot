const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

function resetModules() {
    for (const modulePath of [
        '../src/services/oauthTokenStore',
        '../src/services/googleOAuthRevocationService',
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

test('oauthTokenStore revokes local credentials while preserving public metadata', () => {
    resetModules();
    const { dbPath } = configureTestEnv();
    const store = require('../src/services/oauthTokenStore');

    store.saveOAuthConnection('user-revoke-local', {
        scopes: ['scope-a'],
        tokens: {
            access_token: 'access-local-secret',
            refresh_token: 'refresh-local-secret'
        },
        googleAccount: { id: 'google-local', email: 'local@example.com' },
        spreadsheetId: 'spreadsheet-preserved',
        calendarId: 'calendar-preserved'
    });

    const result = store.beginOAuthRevocation('user-revoke-local', { reason: 'INACTIVE' });

    assert.strictEqual(result.started, true);
    assert.strictEqual(result.tokens.refresh_token, 'refresh-local-secret');
    assert.strictEqual(store.getOAuthConnection('user-revoke-local'), null);

    const rawDb = require('better-sqlite3')(dbPath, { readonly: true });
    try {
        const connection = rawDb.prepare('SELECT * FROM oauth_connections WHERE user_id = ?')
            .get('user-revoke-local');
        const revocation = rawDb.prepare('SELECT * FROM oauth_revocations WHERE user_id = ?')
            .get('user-revoke-local');
        assert.ok(connection.revoked_at);
        assert.strictEqual(connection.spreadsheet_id, 'spreadsheet-preserved');
        assert.strictEqual(connection.calendar_id, 'calendar-preserved');
        assert.strictEqual(connection.encrypted_tokens.includes('refresh-local-secret'), false);
        assert.strictEqual(revocation.status, 'pending');
        assert.strictEqual(revocation.reason, 'INACTIVE');
    } finally {
        rawDb.close();
    }
});

test('Google revocation fails closed locally and retries the remote revoke idempotently', async () => {
    resetModules();
    configureTestEnv();
    const store = require('../src/services/oauthTokenStore');
    const service = require('../src/services/googleOAuthRevocationService');
    const calls = [];

    store.saveOAuthConnection('user-revoke-retry', {
        scopes: ['scope-a'],
        tokens: { refresh_token: 'refresh-retry-secret' },
        spreadsheetId: 'spreadsheet-retry'
    });

    const failed = await service.revokeGoogleConnectionForUser('user-revoke-retry', {
        reason: 'BLOCKED',
        revokeToken: async token => {
            calls.push(token);
            throw new Error('synthetic remote outage with secret refresh-retry-secret');
        }
    });

    assert.strictEqual(failed.localStatus, 'revoked');
    assert.strictEqual(failed.remoteStatus, 'failed');
    assert.strictEqual(store.getOAuthConnection('user-revoke-retry'), null);
    const pending = store.getOAuthRevocation('user-revoke-retry');
    assert.strictEqual(pending.status, 'remote_failed');
    assert.strictEqual(pending.last_error_code, 'REMOTE_REVOKE_FAILED');
    assert.strictEqual(JSON.stringify(pending).includes('refresh-retry-secret'), false);

    const retried = await service.revokeGoogleConnectionForUser('user-revoke-retry', {
        reason: 'BLOCKED',
        revokeToken: async token => calls.push(token)
    });
    const completed = store.getOAuthRevocation('user-revoke-retry');

    assert.strictEqual(retried.localStatus, 'already_revoked');
    assert.strictEqual(retried.remoteStatus, 'revoked');
    assert.deepStrictEqual(calls, ['refresh-retry-secret', 'refresh-retry-secret']);
    assert.strictEqual(completed.status, 'remote_revoked');
    assert.strictEqual(completed.has_pending_token, false);

    const idempotent = await service.revokeGoogleConnectionForUser('user-revoke-retry', {
        reason: 'BLOCKED',
        revokeToken: async token => calls.push(token)
    });
    assert.strictEqual(idempotent.remoteStatus, 'already_revoked');
    assert.strictEqual(calls.length, 2);
});

test('a new OAuth connection is blocked until an old remote revocation is resolved', async () => {
    resetModules();
    configureTestEnv();
    const store = require('../src/services/oauthTokenStore');
    const service = require('../src/services/googleOAuthRevocationService');

    store.saveOAuthConnection('user-reconnect-after-revoke', {
        scopes: ['scope-a'],
        tokens: { refresh_token: 'old-refresh-secret' }
    });
    await service.revokeGoogleConnectionForUser('user-reconnect-after-revoke', {
        reason: 'INACTIVE',
        revokeToken: async () => { throw new Error('synthetic outage'); }
    });
    assert.strictEqual(store.getOAuthRevocation('user-reconnect-after-revoke').has_pending_token, true);

    assert.throws(() => {
        store.saveOAuthConnection('user-reconnect-after-revoke', {
            scopes: ['scope-a'],
            tokens: { refresh_token: 'new-refresh-secret' }
        });
    }, /revoga(?:ção|cao) OAuth pendente/i);

    await service.revokeGoogleConnectionForUser('user-reconnect-after-revoke', {
        reason: 'INACTIVE',
        revokeToken: async () => {}
    });
    store.saveOAuthConnection('user-reconnect-after-revoke', {
        scopes: ['scope-a'],
        tokens: { refresh_token: 'new-refresh-secret' }
    });

    const revocation = store.getOAuthRevocation('user-reconnect-after-revoke');
    assert.strictEqual(revocation.status, 'remote_revoked');
    assert.strictEqual(revocation.has_pending_token, false);
    assert.strictEqual(
        store.getOAuthConnection('user-reconnect-after-revoke', { includeTokens: true }).tokens.refresh_token,
        'new-refresh-secret'
    );
});

test('late results from an old revocation cannot mutate a newer revocation generation', () => {
    resetModules();
    configureTestEnv();
    const store = require('../src/services/oauthTokenStore');

    store.saveOAuthConnection('user-revocation-generation', {
        scopes: ['scope-a'],
        tokens: { refresh_token: 'generation-one' }
    });
    const first = store.beginOAuthRevocation('user-revocation-generation', { reason: 'INACTIVE' });
    store.markOAuthRevocationResult('user-revocation-generation', first.revocationId, {
        status: 'remote_revoked'
    });

    store.saveOAuthConnection('user-revocation-generation', {
        scopes: ['scope-a'],
        tokens: { refresh_token: 'generation-two' }
    });
    const second = store.beginOAuthRevocation('user-revocation-generation', { reason: 'BLOCKED' });
    store.markOAuthRevocationResult('user-revocation-generation', first.revocationId, {
        status: 'remote_failed',
        errorCode: 'LATE_OLD_RESULT'
    });

    const current = store.getOAuthRevocation('user-revocation-generation');
    assert.notStrictEqual(first.revocationId, second.revocationId);
    assert.strictEqual(current.revocation_id, second.revocationId);
    assert.strictEqual(current.status, 'pending');
    assert.strictEqual(current.has_pending_token, true);
});

test('automatic recovery retries due revocations and expires retained tokens by policy', async () => {
    resetModules();
    configureTestEnv();
    const store = require('../src/services/oauthTokenStore');
    const service = require('../src/services/googleOAuthRevocationService');

    store.saveOAuthConnection('user-auto-retry', {
        scopes: ['scope-a'],
        tokens: { refresh_token: 'auto-retry-secret' }
    });
    await service.revokeGoogleConnectionForUser('user-auto-retry', {
        reason: 'DELETED',
        now: new Date('2026-07-01T00:00:00.000Z'),
        revokeToken: async () => { throw new Error('synthetic outage'); }
    });

    const recovered = await service.retryPendingGoogleRevocations({
        now: new Date('2026-07-02T00:00:00.000Z'),
        revokeToken: async () => {},
        limit: 10
    });
    assert.deepStrictEqual(recovered, { attempted: 1, revoked: 1, failed: 0, expired: 0 });
    assert.strictEqual(store.getOAuthRevocation('user-auto-retry').status, 'remote_revoked');

    store.saveOAuthConnection('user-expire-retention', {
        scopes: ['scope-a'],
        tokens: { refresh_token: 'expire-retention-secret' }
    });
    await service.revokeGoogleConnectionForUser('user-expire-retention', {
        reason: 'BLOCKED',
        now: new Date('2026-01-01T00:00:00.000Z'),
        revokeToken: async () => { throw new Error('synthetic outage'); }
    });
    const expired = await service.retryPendingGoogleRevocations({
        now: new Date('2026-02-01T00:00:00.000Z'),
        revokeToken: async () => {},
        retentionDays: 30,
        limit: 10
    });
    const stale = store.getOAuthRevocation('user-expire-retention');
    assert.strictEqual(expired.expired, 1);
    assert.strictEqual(stale.status, 'manual_required_expired');
    assert.strictEqual(stale.has_pending_token, false);
});

test('automatic recovery honors backoff and exhausts bounded attempts without retaining token material', async () => {
    resetModules();
    const { dbPath } = configureTestEnv();
    const store = require('../src/services/oauthTokenStore');
    const service = require('../src/services/googleOAuthRevocationService');

    store.saveOAuthConnection('user-bounded-retry', {
        scopes: ['scope-a'],
        tokens: { refresh_token: 'bounded-retry-secret' }
    });
    await service.revokeGoogleConnectionForUser('user-bounded-retry', {
        reason: 'BLOCKED',
        now: new Date('2026-03-01T00:00:00.000Z'),
        maxAttempts: 2,
        baseDelayMs: 3600000,
        revokeToken: async () => { throw new Error('synthetic outage'); }
    });

    const beforeDue = await service.retryPendingGoogleRevocations({
        now: new Date('2026-03-01T00:30:00.000Z'),
        maxAttempts: 2,
        baseDelayMs: 3600000,
        revokeToken: async () => { throw new Error('must not run before backoff'); }
    });
    assert.deepStrictEqual(beforeDue, { attempted: 0, revoked: 0, failed: 0, expired: 0 });

    const secondFailure = await service.retryPendingGoogleRevocations({
        now: new Date('2026-03-01T02:00:00.000Z'),
        maxAttempts: 2,
        baseDelayMs: 3600000,
        revokeToken: async () => { throw new Error('synthetic outage'); }
    });
    assert.deepStrictEqual(secondFailure, { attempted: 1, revoked: 0, failed: 1, expired: 0 });

    const exhausted = await service.retryPendingGoogleRevocations({
        now: new Date('2026-03-01T04:00:00.000Z'),
        maxAttempts: 2,
        baseDelayMs: 3600000,
        revokeToken: async () => {}
    });
    const finalJob = store.getOAuthRevocation('user-bounded-retry');
    assert.strictEqual(exhausted.expired, 1);
    assert.strictEqual(finalJob.status, 'manual_required_exhausted');
    assert.strictEqual(finalJob.has_pending_token, false);

    const rawDb = require('better-sqlite3')(dbPath, { readonly: true });
    try {
        const rawJob = rawDb.prepare(`
            SELECT encrypted_tokens FROM oauth_revocations
            WHERE user_id = ? AND revocation_id = ?
        `).get('user-bounded-retry', finalJob.revocation_id);
        assert.strictEqual(rawJob.encrypted_tokens, '');
    } finally {
        rawDb.close();
    }
});

test('remote OAuth revocation is time-bounded while local credentials remain revoked', async () => {
    resetModules();
    configureTestEnv();
    const store = require('../src/services/oauthTokenStore');
    const service = require('../src/services/googleOAuthRevocationService');

    store.saveOAuthConnection('user-revoke-timeout', {
        scopes: ['scope-a'],
        tokens: { refresh_token: 'timeout-refresh-secret' }
    });
    const startedAt = Date.now();
    const result = await service.revokeGoogleConnectionForUser('user-revoke-timeout', {
        reason: 'DELETED',
        timeoutMs: 20,
        revokeToken: async () => new Promise(() => {})
    });

    assert.ok(Date.now() - startedAt < 1000);
    assert.strictEqual(result.localStatus, 'revoked');
    assert.strictEqual(result.remoteStatus, 'failed');
    assert.strictEqual(store.getOAuthConnection('user-revoke-timeout'), null);
    assert.strictEqual(store.getOAuthRevocation('user-revoke-timeout').status, 'remote_failed');
});

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
