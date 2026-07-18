const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const MODULES = [
    '../src/services/oauthTokenStore',
    '../src/services/googleOAuthService',
    '../src/services/userService',
    '../src/services/userSpreadsheetService'
];

function resetModules() {
    for (const modulePath of MODULES) {
        try {
            delete require.cache[require.resolve(modulePath)];
        } catch (_) {
            // Optional during isolated cache setup.
        }
    }
}

function configureEnv(t) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financas-oauth-audit-'));
    process.env.OAUTH_TOKEN_DB_PATH = path.join(tempDir, 'oauth.sqlite');
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'audit-client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'audit-client-secret';
    process.env.DASHBOARD_BASE_URL = 'https://audit.invalid';
    process.env.GOOGLE_OAUTH_STATE_SECRET = 'audit-state-secret-with-sufficient-length';
}

function installLifecycleMocks({ status, completionError = null }) {
    const userServicePath = require.resolve('../src/services/userService');
    const spreadsheetPath = require.resolve('../src/services/userSpreadsheetService');
    const completionCalls = [];

    require.cache[userServicePath] = {
        id: userServicePath,
        filename: userServicePath,
        loaded: true,
        exports: {
            getUserById: async (userId) => status === null ? null : ({ user_id: userId, status })
        }
    };
    require.cache[spreadsheetPath] = {
        id: spreadsheetPath,
        filename: spreadsheetPath,
        loaded: true,
        exports: {
            completeGoogleConnectionForUser: async (payload) => {
                completionCalls.push(payload);
                if (completionError) throw completionError;
                return {
                    spreadsheetId: 'audit-sheet',
                    user: { user_id: payload.user.user_id, status: 'ACTIVE' }
                };
            }
        }
    };
    return completionCalls;
}

function fakeOAuthClient(counters = {}) {
    let sequence = 0;
    return {
        getToken: async () => {
            counters.tokenExchange = Number(counters.tokenExchange || 0) + 1;
            return {
                tokens: {
                    access_token: `audit-access-${++sequence}`,
                    refresh_token: `audit-refresh-${sequence}`
                }
            };
        },
        setCredentials() {}
    };
}

function fakeOAuthApi(counters = {}) {
    return {
        userinfo: {
            get: async () => {
                counters.accountLookup = Number(counters.accountLookup || 0) + 1;
                return { data: { id: 'audit-google-user', email: 'audit@example.invalid' } };
            }
        }
    };
}

test('audit OAuth: expired signed state is rejected', (t) => {
    resetModules();
    configureEnv(t);
    const oauth = require('../src/services/googleOAuthService');
    const state = new URL(oauth.buildGoogleConnectLink({ userId: 'audit-expired' })).searchParams.get('state');
    const payload = oauth.verifyOAuthState(state);
    const originalNow = Date.now;
    t.after(() => { Date.now = originalNow; });
    Date.now = () => (payload.exp + 1) * 1000;
    assert.strictEqual(oauth.verifyOAuthState(state), null);
});

test('audit OAuth: approved awaiting Google completes once from an empty connection state', async (t) => {
    resetModules();
    configureEnv(t);
    const counters = {};
    const calls = installLifecycleMocks({ status: 'APPROVED_AWAITING_GOOGLE' });
    const oauth = require('../src/services/googleOAuthService');
    const store = require('../src/services/oauthTokenStore');
    const userId = 'audit-approved-awaiting-google';
    const state = new URL(oauth.buildGoogleConnectLink({ userId })).searchParams.get('state');

    assert.strictEqual(store.getOAuthConnection(userId, { includeTokens: true }), null);

    const result = await oauth.completeGoogleOAuthCallback({
        code: 'approved-code',
        state,
        oauth2Client: fakeOAuthClient(counters),
        oauth2Api: fakeOAuthApi(counters),
        sheetsClient: {}
    });
    const after = store.getOAuthConnection(userId, { includeTokens: true });

    assert.deepStrictEqual(counters, { tokenExchange: 1, accountLookup: 1 });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].user.status, 'APPROVED_AWAITING_GOOGLE');
    assert.strictEqual(result.userStatus, 'ACTIVE');
    assert.ok(after);
    assert.strictEqual(after.user_id, userId);
    assert.strictEqual(after.tokens.refresh_token, 'audit-refresh-1');
});

test('audit OAuth: active user follows the generic callback and overwrites the existing connection', async (t) => {
    resetModules();
    configureEnv(t);
    const counters = {};
    const calls = installLifecycleMocks({ status: 'ACTIVE' });
    const store = require('../src/services/oauthTokenStore');
    const userId = 'audit-active-reconnect';
    store.saveOAuthConnection(userId, {
        scopes: ['audit-old-scope'],
        tokens: { access_token: 'audit-old-access', refresh_token: 'audit-old-refresh' },
        googleAccount: { id: 'audit-old-google-user', email: 'old@example.invalid' }
    });
    const before = store.getOAuthConnection(userId, { includeTokens: true });
    const oauth = require('../src/services/googleOAuthService');
    const state = new URL(oauth.buildGoogleConnectLink({ userId })).searchParams.get('state');

    const result = await oauth.completeGoogleOAuthCallback({
        code: 'active-reconnect-code',
        state,
        oauth2Client: fakeOAuthClient(counters),
        oauth2Api: fakeOAuthApi(counters),
        sheetsClient: {}
    });
    const after = store.getOAuthConnection(userId, { includeTokens: true });

    assert.strictEqual(before.tokens.refresh_token, 'audit-old-refresh');
    assert.deepStrictEqual(counters, { tokenExchange: 1, accountLookup: 1 });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].user.status, 'ACTIVE');
    assert.strictEqual(result.userStatus, 'ACTIVE');
    assert.strictEqual(after.user_id, userId);
    assert.strictEqual(after.tokens.refresh_token, 'audit-refresh-1');
    assert.strictEqual(after.google_user_id, 'audit-google-user');
});

test('audit OAuth: disallowed current statuses still reach completion and persist credentials', async (t) => {
    for (const status of ['BLOCKED', 'INACTIVE', 'DELETED', 'PENDING', 'PENDING_APPROVAL', 'EXPIRED']) {
        await t.test(status, async (st) => {
            resetModules();
            configureEnv(st);
            const calls = installLifecycleMocks({ status });
            const oauth = require('../src/services/googleOAuthService');
            const state = new URL(oauth.buildGoogleConnectLink({ userId: `audit-${status}` })).searchParams.get('state');

            const result = await oauth.completeGoogleOAuthCallback({
                code: `code-${status}`,
                state,
                oauth2Client: fakeOAuthClient(),
                oauth2Api: fakeOAuthApi(),
                sheetsClient: {}
            });

            assert.strictEqual(calls.length, 1);
            assert.strictEqual(calls[0].user.status, status);
            assert.strictEqual(result.userStatus, 'ACTIVE');
            const stored = require('../src/services/oauthTokenStore').getOAuthConnection(`audit-${status}`);
            assert.ok(stored);
        });
    }
});

test('audit OAuth: nonexistent user leaves persisted credentials before failure', async (t) => {
    resetModules();
    configureEnv(t);
    installLifecycleMocks({ status: null });
    const oauth = require('../src/services/googleOAuthService');
    const userId = 'audit-missing-user';
    const state = new URL(oauth.buildGoogleConnectLink({ userId })).searchParams.get('state');

    await assert.rejects(() => oauth.completeGoogleOAuthCallback({
        code: 'missing-user-code',
        state,
        oauth2Client: fakeOAuthClient(),
        oauth2Api: fakeOAuthApi(),
        sheetsClient: {}
    }), /Usuário OAuth não encontrado/);

    assert.ok(require('../src/services/oauthTokenStore').getOAuthConnection(userId));
});

test('audit OAuth: failure after credential persistence leaves the committed connection', async (t) => {
    resetModules();
    configureEnv(t);
    installLifecycleMocks({ status: 'APPROVED_AWAITING_GOOGLE', completionError: new Error('audit completion failure') });
    const oauth = require('../src/services/googleOAuthService');
    const userId = 'audit-partial-failure';
    const state = new URL(oauth.buildGoogleConnectLink({ userId })).searchParams.get('state');

    await assert.rejects(() => oauth.completeGoogleOAuthCallback({
        code: 'partial-failure-code',
        state,
        oauth2Client: fakeOAuthClient(),
        oauth2Api: fakeOAuthApi(),
        sheetsClient: {}
    }), /audit completion failure/);

    assert.ok(require('../src/services/oauthTokenStore').getOAuthConnection(userId));
});

test('audit OAuth: the same state can drive two sequential callbacks', async (t) => {
    resetModules();
    configureEnv(t);
    const calls = installLifecycleMocks({ status: 'APPROVED_AWAITING_GOOGLE' });
    const oauth = require('../src/services/googleOAuthService');
    const state = new URL(oauth.buildGoogleConnectLink({ userId: 'audit-reuse' })).searchParams.get('state');
    const client = fakeOAuthClient();

    for (const code of ['reuse-code-one', 'reuse-code-two']) {
        await oauth.completeGoogleOAuthCallback({
            code,
            state,
            oauth2Client: client,
            oauth2Api: fakeOAuthApi(),
            sheetsClient: {}
        });
    }

    assert.strictEqual(calls.length, 2);
});

test('audit OAuth: concurrent callbacks with the same state both reach completion', async (t) => {
    resetModules();
    configureEnv(t);
    const calls = installLifecycleMocks({ status: 'APPROVED_AWAITING_GOOGLE' });
    const oauth = require('../src/services/googleOAuthService');
    const state = new URL(oauth.buildGoogleConnectLink({ userId: 'audit-concurrent' })).searchParams.get('state');

    const results = await Promise.all(['concurrent-one', 'concurrent-two'].map(code =>
        oauth.completeGoogleOAuthCallback({
            code,
            state,
            oauth2Client: fakeOAuthClient(),
            oauth2Api: fakeOAuthApi(),
            sheetsClient: {}
        })
    ));

    assert.strictEqual(results.length, 2);
    assert.strictEqual(calls.length, 2);
});
