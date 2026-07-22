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
    process.env.GOOGLE_OAUTH_ATTEMPT_RETRY_BASE_MS = '0';
}

function installLifecycleMocks({ status, statusSequence = null, completionError = null, counters = {} }) {
    const userServicePath = require.resolve('../src/services/userService');
    const spreadsheetPath = require.resolve('../src/services/userSpreadsheetService');
    const completionCalls = [];

    const getUserByIdFresh = async (userId) => {
        counters.userReads = Number(counters.userReads || 0) + 1;
        const sequence = Array.isArray(statusSequence) && statusSequence.length
            ? statusSequence
            : [status];
        const currentStatus = sequence[Math.min(counters.userReads - 1, sequence.length - 1)];
        return currentStatus === null ? null : ({ user_id: userId, status: currentStatus });
    };
    require.cache[userServicePath] = {
        id: userServicePath,
        filename: userServicePath,
        loaded: true,
        exports: {
            getUserByIdFresh,
            executeWithFreshUserStatus: async (userId, { allowedStatuses }, operation) => {
                const user = await getUserByIdFresh(userId);
                if (!user) return { executed: false, reason: 'not_found', user: null, result: null };
                if (!allowedStatuses.includes(user.status)) {
                    return { executed: false, reason: 'status_mismatch', user, result: null };
                }
                return { executed: true, reason: 'executed', user, result: operation(user) };
            },
            transitionUserStatus: async (userId) => ({
                transitioned: true,
                reason: 'updated',
                user: { user_id: userId, status: 'ACTIVE' }
            }),
            USER_STATUS: {
                APPROVED_AWAITING_GOOGLE: 'APPROVED_AWAITING_GOOGLE',
                ACTIVE: 'ACTIVE'
            }
        }
    };
    require.cache[spreadsheetPath] = {
        id: spreadsheetPath,
        filename: spreadsheetPath,
        loaded: true,
        exports: {
            createUserSpreadsheetForAttempt: async () => ({
                spreadsheetId: 'audit-sheet',
                spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/audit-sheet/edit'
            }),
            findUserSpreadsheetForAttempt: async () => null,
            deleteUserSpreadsheetForAttempt: async () => true,
            buildSpreadsheetUrl: spreadsheetId => `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
            applyUserSpreadsheetTemplate: async (payload) => {
                completionCalls.push(payload);
                if (completionError) throw completionError;
                return { spreadsheetId: payload.spreadsheetId };
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

test('audit OAuth: disallowed current statuses fail before token exchange and persistence', async (t) => {
    for (const status of ['BLOCKED', 'INACTIVE', 'DELETED', 'PENDING', 'PENDING_APPROVAL', 'EXPIRED']) {
        await t.test(status, async (st) => {
            resetModules();
            configureEnv(st);
            const counters = {};
            const calls = installLifecycleMocks({ status, counters });
            const oauth = require('../src/services/googleOAuthService');
            const userId = `audit-${status}`;
            const state = new URL(oauth.buildGoogleConnectLink({ userId })).searchParams.get('state');

            await assert.rejects(() => oauth.completeGoogleOAuthCallback({
                code: `code-${status}`,
                state,
                oauth2Client: fakeOAuthClient(counters),
                oauth2Api: fakeOAuthApi(counters),
                sheetsClient: {}
            }), /status.*não permite conexão Google/i);

            assert.deepStrictEqual(counters, { userReads: 1 });
            assert.strictEqual(calls.length, 0);
            assert.strictEqual(require('../src/services/oauthTokenStore').getOAuthConnection(userId), null);
        });
    }
});

test('audit OAuth: nonexistent user fails before token exchange and persistence', async (t) => {
    resetModules();
    configureEnv(t);
    const counters = {};
    installLifecycleMocks({ status: null, counters });
    const oauth = require('../src/services/googleOAuthService');
    const userId = 'audit-missing-user';
    const state = new URL(oauth.buildGoogleConnectLink({ userId })).searchParams.get('state');

    await assert.rejects(() => oauth.completeGoogleOAuthCallback({
        code: 'missing-user-code',
        state,
        oauth2Client: fakeOAuthClient(counters),
        oauth2Api: fakeOAuthApi(counters),
        sheetsClient: {}
    }), /Usuário OAuth não encontrado/);

    assert.deepStrictEqual(counters, { userReads: 1 });
    assert.strictEqual(require('../src/services/oauthTokenStore').getOAuthConnection(userId), null);
});

test('audit OAuth: lifecycle change during token exchange blocks before account lookup and persistence', async (t) => {
    resetModules();
    configureEnv(t);
    const counters = {};
    const calls = installLifecycleMocks({
        statusSequence: ['APPROVED_AWAITING_GOOGLE', 'INACTIVE'],
        counters
    });
    const oauth = require('../src/services/googleOAuthService');
    const userId = 'audit-status-change-after-token';
    const state = new URL(oauth.buildGoogleConnectLink({ userId })).searchParams.get('state');

    await assert.rejects(() => oauth.completeGoogleOAuthCallback({
        code: 'status-change-token-code',
        state,
        oauth2Client: fakeOAuthClient(counters),
        oauth2Api: fakeOAuthApi(counters),
        sheetsClient: {}
    }), /status.*não permite conexão Google/i);

    assert.deepStrictEqual(counters, { userReads: 2, tokenExchange: 1 });
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(require('../src/services/oauthTokenStore').getOAuthConnection(userId), null);
});

test('audit OAuth: lifecycle change during account lookup blocks before persistence', async (t) => {
    resetModules();
    configureEnv(t);
    const counters = {};
    const calls = installLifecycleMocks({
        statusSequence: ['APPROVED_AWAITING_GOOGLE', 'APPROVED_AWAITING_GOOGLE', 'BLOCKED'],
        counters
    });
    const oauth = require('../src/services/googleOAuthService');
    const userId = 'audit-status-change-after-account';
    const state = new URL(oauth.buildGoogleConnectLink({ userId })).searchParams.get('state');

    await assert.rejects(() => oauth.completeGoogleOAuthCallback({
        code: 'status-change-account-code',
        state,
        oauth2Client: fakeOAuthClient(counters),
        oauth2Api: fakeOAuthApi(counters),
        sheetsClient: {}
    }), /status.*não permite conexão Google/i);

    assert.deepStrictEqual(counters, { userReads: 3, tokenExchange: 1, accountLookup: 1 });
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(require('../src/services/oauthTokenStore').getOAuthConnection(userId), null);
});

test('audit OAuth: template failure keeps candidate credentials staged and recoverable', async (t) => {
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

    const store = require('../src/services/oauthTokenStore');
    const payload = oauth.verifyOAuthState(state);
    const attempt = store.getOAuthConnectionAttempt(payload.attemptId, { includeTokens: true });
    assert.strictEqual(store.getOAuthConnection(userId), null);
    assert.strictEqual(attempt.status, 'retryable');
    assert.strictEqual(attempt.stage, 'sheet_ready');
    assert.strictEqual(attempt.candidate_spreadsheet_id, 'audit-sheet');
    assert.strictEqual(attempt.tokens.refresh_token, 'audit-refresh-1');
});

test('audit OAuth: the same state returns one durable conclusion across sequential callbacks', async (t) => {
    resetModules();
    configureEnv(t);
    const calls = installLifecycleMocks({ status: 'APPROVED_AWAITING_GOOGLE' });
    const oauth = require('../src/services/googleOAuthService');
    const state = new URL(oauth.buildGoogleConnectLink({ userId: 'audit-reuse' })).searchParams.get('state');

    const counters = {};
    const results = [];
    for (const code of ['reuse-code-one', 'reuse-code-two']) {
        results.push(await oauth.completeGoogleOAuthCallback({
            code,
            state,
            oauth2Client: fakeOAuthClient(counters),
            oauth2Api: fakeOAuthApi(counters),
            sheetsClient: {}
        }));
    }

    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(counters, { tokenExchange: 1, accountLookup: 1 });
    assert.strictEqual(results[0].spreadsheetId, 'audit-sheet');
    assert.strictEqual(results[1].spreadsheetId, 'audit-sheet');
    assert.strictEqual(results[0].replayed, false);
    assert.strictEqual(results[1].replayed, true);
});

test('audit OAuth: concurrent callbacks with the same state converge to one durable conclusion', async (t) => {
    resetModules();
    configureEnv(t);
    const calls = installLifecycleMocks({ status: 'APPROVED_AWAITING_GOOGLE' });
    const oauth = require('../src/services/googleOAuthService');
    const state = new URL(oauth.buildGoogleConnectLink({ userId: 'audit-concurrent' })).searchParams.get('state');

    const counters = {};
    const client = fakeOAuthClient(counters);
    const api = fakeOAuthApi(counters);
    const results = await Promise.all(['concurrent-one', 'concurrent-two'].map(code =>
        oauth.completeGoogleOAuthCallback({
            code,
            state,
            oauth2Client: client,
            oauth2Api: api,
            sheetsClient: {}
        })
    ));

    assert.strictEqual(results.length, 2);
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(counters, { tokenExchange: 1, accountLookup: 1 });
    assert.strictEqual(results[0].spreadsheetId, 'audit-sheet');
    assert.strictEqual(results[1].spreadsheetId, 'audit-sheet');
    assert.strictEqual(results.filter(result => result.replayed).length, 1);
});
