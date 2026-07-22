const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const STORE_PATH = '../src/services/oauthTokenStore';
const OAUTH_PATH = '../src/services/googleOAuthService';
const USER_PATH = '../src/services/userService';
const SPREADSHEET_PATH = '../src/services/userSpreadsheetService';

function resetModules() {
    for (const modulePath of [STORE_PATH, OAUTH_PATH, USER_PATH, SPREADSHEET_PATH]) {
        try {
            delete require.cache[require.resolve(modulePath)];
        } catch (_) {
            // Optional during isolated cache setup.
        }
    }
}

function installModule(modulePath, exports) {
    const resolved = require.resolve(modulePath);
    require.cache[resolved] = {
        id: resolved,
        filename: resolved,
        loaded: true,
        exports
    };
}

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function installSagaDoubles({
    failTokenExchangeOnce = false,
    failCreateBeforeCommitOnce = false,
    failCreateAfterCommitOnce = false,
    failTemplateOnce = false,
    failPromotionGuardOnce = false,
    failLifecycleOnce = false,
    failDeleteOnce = false,
    failDeleteAfterCommitOnce = false,
    statusSequence = null,
    beforeCreateReturn = null
} = {}) {
    const counters = {
        tokenExchange: 0,
        accountLookup: 0,
        create: 0,
        find: 0,
        template: 0,
        promotionGuard: 0,
        lifecycle: 0,
        delete: 0
    };
    const state = {
        status: 'APPROVED_AWAITING_GOOGLE',
        sheet: null,
        userReads: 0,
        tokenFailureRemaining: failTokenExchangeOnce ? 1 : 0,
        createBeforeCommitFailureRemaining: failCreateBeforeCommitOnce ? 1 : 0,
        createFailureRemaining: failCreateAfterCommitOnce ? 1 : 0,
        templateFailureRemaining: failTemplateOnce ? 1 : 0,
        promotionFailureRemaining: failPromotionGuardOnce ? 1 : 0,
        lifecycleFailureRemaining: failLifecycleOnce ? 1 : 0,
        deleteFailureRemaining: failDeleteOnce ? 1 : 0,
        deleteAfterCommitFailureRemaining: failDeleteAfterCommitOnce ? 1 : 0
    };
    const user = userId => {
        if (Array.isArray(statusSequence) && statusSequence.length) {
            state.status = statusSequence[Math.min(state.userReads, statusSequence.length - 1)];
            state.userReads += 1;
        }
        return {
            user_id: userId,
            whatsapp_id: '5511999999999@c.us',
            display_name: 'FamÃ­lia Saga',
            status: state.status
        };
    };

    installModule(USER_PATH, {
        getUserByIdFresh: async userId => user(userId),
        executeWithFreshUserStatus: async (userId, { allowedStatuses }, operation) => {
            counters.promotionGuard += 1;
            if (state.promotionFailureRemaining > 0) {
                state.promotionFailureRemaining -= 1;
                throw new Error('AUDIT_PROMOTION_GUARD_FAILURE');
            }
            const current = user(userId);
            if (!allowedStatuses.includes(current.status)) {
                return { executed: false, reason: 'status_mismatch', user: current, result: null };
            }
            return { executed: true, reason: 'executed', user: current, result: operation(current) };
        },
        transitionUserStatus: async userId => {
            counters.lifecycle += 1;
            if (state.lifecycleFailureRemaining > 0) {
                state.lifecycleFailureRemaining -= 1;
                throw new Error('AUDIT_LIFECYCLE_FAILURE');
            }
            state.status = 'ACTIVE';
            return { transitioned: true, reason: 'updated', user: user(userId) };
        },
        USER_STATUS: {
            APPROVED_AWAITING_GOOGLE: 'APPROVED_AWAITING_GOOGLE',
            ACTIVE: 'ACTIVE'
        }
    });
    installModule(SPREADSHEET_PATH, {
        createUserSpreadsheetForAttempt: async ({ attemptId }) => {
            counters.create += 1;
            if (state.createBeforeCommitFailureRemaining > 0) {
                state.createBeforeCommitFailureRemaining -= 1;
                throw new Error('AUDIT_CREATE_FAILED_BEFORE_COMMIT');
            }
            state.sheet = {
                spreadsheetId: 'saga-sheet-1',
                marker: attemptId
            };
            if (state.createFailureRemaining > 0) {
                state.createFailureRemaining -= 1;
                throw new Error('AUDIT_CREATE_RESPONSE_LOST');
            }
            if (typeof beforeCreateReturn === 'function') await beforeCreateReturn();
            return state.sheet;
        },
        findUserSpreadsheetForAttempt: async ({ attemptId }) => {
            counters.find += 1;
            return state.sheet?.marker === attemptId ? state.sheet : null;
        },
        deleteUserSpreadsheetForAttempt: async () => {
            counters.delete += 1;
            if (state.deleteFailureRemaining > 0) {
                state.deleteFailureRemaining -= 1;
                throw new Error('AUDIT_COMPENSATION_DELETE_FAILED');
            }
            if (state.deleteAfterCommitFailureRemaining > 0) {
                state.deleteAfterCommitFailureRemaining -= 1;
                state.sheet = null;
                throw new Error('AUDIT_COMPENSATION_DELETE_RESPONSE_LOST');
            }
            state.sheet = null;
            return true;
        },
        applyUserSpreadsheetTemplate: async ({ spreadsheetId }) => {
            counters.template += 1;
            assert.strictEqual(spreadsheetId, 'saga-sheet-1');
            if (state.templateFailureRemaining > 0) {
                state.templateFailureRemaining -= 1;
                throw new Error('AUDIT_TEMPLATE_FAILURE');
            }
            return { spreadsheetId };
        },
        buildSpreadsheetUrl: spreadsheetId => `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    });

    return {
        counters,
        state,
        oauthClient: {
            getToken: async () => {
                counters.tokenExchange += 1;
                if (state.tokenFailureRemaining > 0) {
                    state.tokenFailureRemaining -= 1;
                    throw new Error('AUDIT_TOKEN_EXCHANGE_UNCERTAIN');
                }
                return { tokens: { refresh_token: `saga-refresh-${counters.tokenExchange}` } };
            },
            setCredentials() {}
        },
        oauthApi: {
            userinfo: {
                get: async () => {
                    counters.accountLookup += 1;
                    return { data: { id: 'saga-google-user', email: 'saga@example.invalid' } };
                }
            }
        }
    };
}

function configureEnv() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financas-oauth-saga-'));
    process.env.OAUTH_TOKEN_DB_PATH = path.join(tempDir, 'oauth.sqlite');
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'saga-client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'saga-client-secret';
    process.env.DASHBOARD_BASE_URL = 'https://saga.invalid';
    process.env.GOOGLE_OAUTH_STATE_SECRET = 'saga-state-secret-with-sufficient-length';
    process.env.GOOGLE_OAUTH_ATTEMPT_RETRY_BASE_MS = '0';
    return tempDir;
}

function spawnClaimWorker({ startFile, storePath, payload }) {
    const source = `
        const fs = require('node:fs');
        process.stdout.write('READY\\n');
        const wait = () => {
            if (!fs.existsSync(${JSON.stringify(startFile)})) return setTimeout(wait, 5);
            try {
                const store = require(${JSON.stringify(storePath)});
                const result = store.claimOAuthConnectionAttempt(${JSON.stringify({
                    attemptId: payload.attemptId,
                    userId: payload.userId,
                    generation: payload.generation
                })});
                process.stdout.write('RESULT ' + JSON.stringify({ outcome: result.outcome }) + '\\n');
                store.__test__.closeDatabaseForTests();
                process.exit(0);
            } catch (error) {
                process.stderr.write(String(error && error.stack || error));
                process.exit(1);
            }
        };
        wait();
    `;
    const child = spawn(process.execPath, ['-e', source], {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let readyResolve;
    const ready = new Promise(resolve => { readyResolve = resolve; });
    child.stdout.on('data', chunk => {
        stdout += chunk.toString();
        if (stdout.includes('READY\n')) readyResolve();
    });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    const done = new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', code => {
            if (code !== 0) return reject(new Error(stderr || `claim worker exited ${code}`));
            const match = stdout.match(/RESULT (\{[^\n]+\})/);
            if (!match) return reject(new Error(`claim worker returned no result: ${stdout}`));
            resolve(JSON.parse(match[1]));
        });
    });
    return { ready, done };
}

function spawnIssueWorker({ startFile, storePath, attemptId }) {
    const source = `
        const fs = require('node:fs');
        process.stdout.write('READY\\n');
        const wait = () => {
            if (!fs.existsSync(${JSON.stringify(startFile)})) return setTimeout(wait, 5);
            try {
                const store = require(${JSON.stringify(storePath)});
                const result = store.issueOAuthConnectionAttempt({
                    userId: 'multiprocess-issue-user',
                    attemptId: ${JSON.stringify(attemptId)},
                    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
                });
                process.stdout.write('RESULT ' + JSON.stringify({
                    attemptId: result.attempt_id,
                    generation: result.generation
                }) + '\\n');
                store.__test__.closeDatabaseForTests();
                process.exit(0);
            } catch (error) {
                process.stderr.write(String(error && error.stack || error));
                process.exit(1);
            }
        };
        wait();
    `;
    const child = spawn(process.execPath, ['-e', source], {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let readyResolve;
    const ready = new Promise(resolve => { readyResolve = resolve; });
    child.stdout.on('data', chunk => {
        stdout += chunk.toString();
        if (stdout.includes('READY\n')) readyResolve();
    });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    const done = new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', code => {
            if (code !== 0) return reject(new Error(stderr || `issue worker exited ${code}`));
            const match = stdout.match(/RESULT (\{[^\n]+\})/);
            if (!match) return reject(new Error(`issue worker returned no result: ${stdout}`));
            resolve(JSON.parse(match[1]));
        });
    });
    return { ready, done };
}

test('OAuth states issued in the same second are distinct, durable and generation fenced', (t) => {
    resetModules();
    const tempDir = configureEnv();
    t.after(() => {
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const originalNow = Date.now;
    Date.now = () => Date.UTC(2026, 6, 22, 12, 0, 0);
    t.after(() => { Date.now = originalNow; });

    const oauth = require(OAUTH_PATH);
    const store = require(STORE_PATH);
    const stateOne = oauth.createOAuthState({ userId: 'saga-user' });
    const stateTwo = oauth.createOAuthState({ userId: 'saga-user' });
    const payloadOne = oauth.verifyOAuthState(stateOne);
    const payloadTwo = oauth.verifyOAuthState(stateTwo);

    assert.notStrictEqual(stateOne, stateTwo);
    assert.match(payloadOne.attemptId, /^[a-f0-9-]{36}$/i);
    assert.match(payloadTwo.attemptId, /^[a-f0-9-]{36}$/i);
    assert.strictEqual(payloadOne.generation, 1);
    assert.strictEqual(payloadTwo.generation, 2);

    const firstAttempt = store.getOAuthConnectionAttempt(payloadOne.attemptId);
    const secondAttempt = store.getOAuthConnectionAttempt(payloadTwo.attemptId);
    assert.strictEqual(firstAttempt.status, 'superseded');
    assert.strictEqual(secondAttempt.status, 'issued');

    const staleClaim = store.claimOAuthConnectionAttempt({
        attemptId: payloadOne.attemptId,
        userId: payloadOne.userId,
        generation: payloadOne.generation
    });
    assert.strictEqual(staleClaim.outcome, 'superseded');

    const winningClaim = store.claimOAuthConnectionAttempt({
        attemptId: payloadTwo.attemptId,
        userId: payloadTwo.userId,
        generation: payloadTwo.generation
    });
    assert.strictEqual(winningClaim.outcome, 'claimed');
    assert.match(winningClaim.leaseId, /^[a-f0-9-]{36}$/i);

    const concurrentClaim = store.claimOAuthConnectionAttempt({
        attemptId: payloadTwo.attemptId,
        userId: payloadTwo.userId,
        generation: payloadTwo.generation
    });
    assert.strictEqual(concurrentClaim.outcome, 'in_progress');
});

test('two Node processes claiming the same durable state produce exactly one owner', async (t) => {
    resetModules();
    const tempDir = configureEnv();
    t.after(() => {
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    const oauth = require(OAUTH_PATH);
    const store = require(STORE_PATH);
    const state = oauth.createOAuthState({ userId: 'multiprocess-claim-user' });
    const payload = oauth.verifyOAuthState(state);
    store.__test__.closeDatabaseForTests();

    const startFile = path.join(tempDir, 'start.claim');
    const storePath = require.resolve(STORE_PATH);
    const workers = [
        spawnClaimWorker({ startFile, storePath, payload }),
        spawnClaimWorker({ startFile, storePath, payload })
    ];
    await Promise.all(workers.map(worker => worker.ready));
    fs.writeFileSync(startFile, 'go');
    const outcomes = (await Promise.all(workers.map(worker => worker.done)))
        .map(result => result.outcome)
        .sort();

    assert.deepStrictEqual(outcomes, ['claimed', 'in_progress']);
});

test('two Node processes initialize the saga schema and issue monotonic generations safely', async (t) => {
    resetModules();
    const tempDir = configureEnv();
    t.after(() => {
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    const startFile = path.join(tempDir, 'start.issue');
    const storePath = require.resolve(STORE_PATH);
    const attemptIds = [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222'
    ];
    const workers = attemptIds.map(attemptId => spawnIssueWorker({ startFile, storePath, attemptId }));
    await Promise.all(workers.map(worker => worker.ready));
    fs.writeFileSync(startFile, 'go');
    const issued = await Promise.all(workers.map(worker => worker.done));

    assert.deepStrictEqual(issued.map(item => item.generation).sort(), [1, 2]);
    const store = require(STORE_PATH);
    const attempts = attemptIds.map(attemptId => store.getOAuthConnectionAttempt(attemptId));
    assert.deepStrictEqual(attempts.map(item => item.status).sort(), ['issued', 'superseded']);
});

test('a completed OAuth attempt returns its durable receipt without a second claim', (t) => {
    resetModules();
    const tempDir = configureEnv();
    t.after(() => {
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const oauth = require(OAUTH_PATH);
    const store = require(STORE_PATH);
    const state = oauth.createOAuthState({ userId: 'receipt-user' });
    const payload = oauth.verifyOAuthState(state);
    const claim = store.claimOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        userId: payload.userId,
        generation: payload.generation
    });
    const receipt = {
        userId: payload.userId,
        spreadsheetId: 'sheet-receipt-1',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-receipt-1/edit',
        userStatus: 'ACTIVE',
        whatsappId: '5511999999999@c.us'
    };
    store.advanceOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: claim.leaseId,
        expectedStage: 'issued',
        nextStage: 'token_exchange_started'
    });
    store.advanceOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: claim.leaseId,
        expectedStage: 'token_exchange_started',
        nextStage: 'token_staged',
        tokens: { refresh_token: 'receipt-refresh' },
        scopes: ['scope.receipt']
    });
    store.advanceOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: claim.leaseId,
        expectedStage: 'token_staged',
        nextStage: 'account_ready',
        googleAccount: { id: 'receipt-google-id', email: 'receipt@example.invalid' }
    });
    store.advanceOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: claim.leaseId,
        expectedStage: 'account_ready',
        nextStage: 'sheet_ready',
        spreadsheetId: 'sheet-receipt-1',
        sheetOrigin: 'preexisting'
    });
    store.advanceOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: claim.leaseId,
        expectedStage: 'sheet_ready',
        nextStage: 'template_ready'
    });
    store.promoteOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: claim.leaseId
    });
    store.advanceOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: claim.leaseId,
        expectedStage: 'connection_committed',
        nextStage: 'lifecycle_active'
    });
    store.completeOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: claim.leaseId,
        result: receipt
    });

    const replay = store.claimOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        userId: payload.userId,
        generation: payload.generation
    });
    assert.strictEqual(replay.outcome, 'completed');
    assert.deepStrictEqual(replay.result, receipt);
});

test('attempt retention is bounded and expiry destroys staged token material', (t) => {
    resetModules();
    const tempDir = configureEnv();
    process.env.GOOGLE_OAUTH_ATTEMPT_RETENTION_MS = String(60 * 60 * 1000);
    t.after(() => {
        delete process.env.GOOGLE_OAUTH_ATTEMPT_RETENTION_MS;
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    const oauth = require(OAUTH_PATH);
    const store = require(STORE_PATH);
    const state = oauth.createOAuthState({ userId: 'retention-user' });
    const payload = oauth.verifyOAuthState(state);
    const claim = store.claimOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        userId: payload.userId,
        generation: payload.generation
    });
    store.advanceOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: claim.leaseId,
        expectedStage: 'issued',
        nextStage: 'token_exchange_started'
    });
    store.advanceOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: claim.leaseId,
        expectedStage: 'token_exchange_started',
        nextStage: 'token_staged',
        tokens: { refresh_token: 'retained-only-until-deadline' },
        scopes: ['scope.retention']
    });
    store.releaseOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: claim.leaseId,
        retryable: true,
        errorCode: 'TEST_RETRYABLE'
    });

    const expiry = new Date(Date.parse(store.getOAuthConnectionAttempt(payload.attemptId).retention_expires_at) + 1);
    const cleanup = store.expireOAuthConnectionAttempts({ now: expiry });
    const expired = store.getOAuthConnectionAttempt(payload.attemptId, { includeTokens: true });
    assert.deepStrictEqual(cleanup, { expired: 1, deleted: 0 });
    assert.strictEqual(expired.status, 'expired');
    assert.strictEqual(expired.tokens, undefined);
    assert.deepStrictEqual(expired.result, {});
});

test('retry backoff is persisted and bounded before a failed stage can be reclaimed', (t) => {
    resetModules();
    const tempDir = configureEnv();
    process.env.GOOGLE_OAUTH_ATTEMPT_RETRY_BASE_MS = '1000';
    t.after(() => {
        process.env.GOOGLE_OAUTH_ATTEMPT_RETRY_BASE_MS = '0';
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    const oauth = require(OAUTH_PATH);
    const store = require(STORE_PATH);
    const state = oauth.createOAuthState({ userId: 'backoff-user' });
    const payload = oauth.verifyOAuthState(state);
    const claim = store.claimOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        userId: payload.userId,
        generation: payload.generation
    });
    store.releaseOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: claim.leaseId,
        retryable: true,
        errorCode: 'TEST_RETRYABLE'
    });
    const delayed = store.claimOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        userId: payload.userId,
        generation: payload.generation
    });
    assert.strictEqual(delayed.outcome, 'retry_later');

    const originalNow = Date.now;
    Date.now = () => Date.parse(delayed.nextAttemptAt) + 1;
    t.after(() => { Date.now = originalNow; });
    const reclaimed = store.claimOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        userId: payload.userId,
        generation: payload.generation
    });
    assert.strictEqual(reclaimed.outcome, 'claimed');
});

test('only the current lease advances stages and candidate credentials remain hidden until promotion', (t) => {
    resetModules();
    const tempDir = configureEnv();
    t.after(() => {
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const oauth = require(OAUTH_PATH);
    const store = require(STORE_PATH);
    const state = oauth.createOAuthState({ userId: 'lease-user' });
    const payload = oauth.verifyOAuthState(state);
    const firstClaim = store.claimOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        userId: payload.userId,
        generation: payload.generation,
        leaseMs: 5000
    });

    const originalNow = Date.now;
    Date.now = () => originalNow() + 6000;
    t.after(() => { Date.now = originalNow; });
    const secondClaim = store.claimOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        userId: payload.userId,
        generation: payload.generation,
        leaseMs: 5000
    });
    assert.strictEqual(secondClaim.outcome, 'claimed');

    assert.throws(() => store.advanceOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: firstClaim.leaseId,
        expectedStage: 'issued',
        nextStage: 'token_exchange_started'
    }), /precedÃªncia|etapa/i);

    store.advanceOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: secondClaim.leaseId,
        expectedStage: 'issued',
        nextStage: 'token_exchange_started'
    });
    store.advanceOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: secondClaim.leaseId,
        expectedStage: 'token_exchange_started',
        nextStage: 'token_staged',
        tokens: { refresh_token: 'candidate-refresh' },
        scopes: ['scope.one']
    });
    store.advanceOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: secondClaim.leaseId,
        expectedStage: 'token_staged',
        nextStage: 'account_ready',
        googleAccount: { id: 'google-one', email: 'one@example.invalid' }
    });
    store.advanceOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: secondClaim.leaseId,
        expectedStage: 'account_ready',
        nextStage: 'sheet_create_dispatched'
    });
    store.advanceOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: secondClaim.leaseId,
        expectedStage: 'sheet_create_dispatched',
        nextStage: 'sheet_ready',
        spreadsheetId: 'sheet-one',
        sheetOrigin: 'created'
    });
    store.advanceOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: secondClaim.leaseId,
        expectedStage: 'sheet_ready',
        nextStage: 'template_ready'
    });

    assert.strictEqual(store.getOAuthConnection(payload.userId), null);
    store.promoteOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: secondClaim.leaseId
    });
    const connection = store.getOAuthConnection(payload.userId, { includeTokens: true });
    assert.strictEqual(connection.spreadsheet_id, 'sheet-one');
    assert.strictEqual(connection.tokens.refresh_token, 'candidate-refresh');
    assert.strictEqual(store.getOAuthConnectionAttempt(payload.attemptId).stage, 'connection_committed');
});

test('an in-flight compensation blocks every local writer from creating a new sheet reference', (t) => {
    resetModules();
    const tempDir = configureEnv();
    t.after(() => {
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    const oauth = require(OAUTH_PATH);
    const store = require(STORE_PATH);
    store.saveOAuthConnection('metadata-writer-user', {
        scopes: ['scope.old'],
        tokens: { refresh_token: 'old-refresh' },
        spreadsheetId: 'old-sheet'
    });
    const state = oauth.createOAuthState({ userId: 'compensation-writer-fence-user' });
    const payload = oauth.verifyOAuthState(state);
    const claim = store.claimOAuthConnectionAttempt({
        attemptId: payload.attemptId,
        userId: payload.userId,
        generation: payload.generation
    });
    const context = {
        attemptId: payload.attemptId,
        generation: payload.generation,
        leaseId: claim.leaseId
    };
    store.advanceOAuthConnectionAttempt({
        ...context,
        expectedStage: 'issued',
        nextStage: 'token_exchange_started'
    });
    store.advanceOAuthConnectionAttempt({
        ...context,
        expectedStage: 'token_exchange_started',
        nextStage: 'token_staged',
        tokens: { refresh_token: 'candidate-refresh' },
        scopes: ['scope.candidate']
    });
    store.advanceOAuthConnectionAttempt({
        ...context,
        expectedStage: 'token_staged',
        nextStage: 'account_ready',
        googleAccount: { id: 'candidate-google', email: 'candidate@example.invalid' }
    });
    store.advanceOAuthConnectionAttempt({
        ...context,
        expectedStage: 'account_ready',
        nextStage: 'sheet_create_dispatched'
    });
    store.advanceOAuthConnectionAttempt({
        ...context,
        expectedStage: 'sheet_create_dispatched',
        nextStage: 'sheet_ready',
        spreadsheetId: 'sheet-under-compensation',
        sheetOrigin: 'created'
    });
    const compensation = store.beginOAuthConnectionCompensation(context);
    assert.strictEqual(compensation.outcome, 'claimed');

    assert.throws(() => store.saveOAuthConnection('late-connection-writer', {
        scopes: ['scope.late'],
        tokens: { refresh_token: 'late-refresh' },
        spreadsheetId: 'sheet-under-compensation'
    }), /compensa/i);
    assert.throws(() => store.updateOAuthConnectionMetadata('metadata-writer-user', {
        spreadsheetId: 'sheet-under-compensation'
    }), /compensa/i);
    assert.throws(() => store.setSharedSpreadsheetMembership({
        memberUserId: 'late-family-member',
        ownerUserId: 'late-family-owner',
        spreadsheetId: 'sheet-under-compensation'
    }), /compensa/i);
    assert.strictEqual(store.isOAuthSpreadsheetReferenced('sheet-under-compensation'), false);
});

test('an ambiguous remote create is reconciled by its durable marker without a second create', async (t) => {
    resetModules();
    const tempDir = configureEnv();
    const doubles = installSagaDoubles({ failCreateAfterCommitOnce: true });
    t.after(() => {
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    const oauth = require(OAUTH_PATH);
    const state = oauth.createOAuthState({ userId: 'ambiguous-create-user' });

    const result = await oauth.completeGoogleOAuthCallback({
        code: 'ambiguous-code',
        state,
        oauth2Client: doubles.oauthClient,
        oauth2Api: doubles.oauthApi,
        sheetsClient: {}
    });

    assert.strictEqual(result.spreadsheetId, 'saga-sheet-1');
    assert.deepStrictEqual(doubles.counters, {
        tokenExchange: 1,
        accountLookup: 1,
        create: 1,
        find: 1,
        template: 1,
        promotionGuard: 1,
        lifecycle: 1,
        delete: 0
    });
});

test('an unresolved create outcome never triggers a blind second spreadsheet creation', async (t) => {
    resetModules();
    const tempDir = configureEnv();
    const doubles = installSagaDoubles({ failCreateBeforeCommitOnce: true });
    t.after(() => {
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    const oauth = require(OAUTH_PATH);
    const store = require(STORE_PATH);
    const state = oauth.createOAuthState({ userId: 'unresolved-create-user' });
    const payload = oauth.verifyOAuthState(state);

    await assert.rejects(() => oauth.completeGoogleOAuthCallback({
        code: 'unresolved-code-one',
        state,
        oauth2Client: doubles.oauthClient,
        oauth2Api: doubles.oauthApi,
        sheetsClient: {}
    }), /AUDIT_CREATE_FAILED_BEFORE_COMMIT/);
    await assert.rejects(() => oauth.completeGoogleOAuthCallback({
        code: 'unresolved-code-two-must-not-create',
        state,
        oauth2Client: doubles.oauthClient,
        oauth2Api: doubles.oauthApi,
        sheetsClient: {}
    }), /incerta|segunda cria/i);

    const attempt = store.getOAuthConnectionAttempt(payload.attemptId);
    assert.strictEqual(doubles.counters.create, 1);
    assert.strictEqual(doubles.counters.find, 2);
    assert.strictEqual(doubles.counters.template, 0);
    assert.strictEqual(store.getOAuthConnection(payload.userId), null);
    assert.strictEqual(attempt.stage, 'sheet_create_dispatched');
    assert.strictEqual(attempt.status, 'retryable');
});

test('an uncertain token exchange becomes manual-required and the authorization code is never retried', async (t) => {
    resetModules();
    const tempDir = configureEnv();
    const doubles = installSagaDoubles({ failTokenExchangeOnce: true });
    t.after(() => {
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    const oauth = require(OAUTH_PATH);
    const store = require(STORE_PATH);
    const state = oauth.createOAuthState({ userId: 'uncertain-token-user' });
    const payload = oauth.verifyOAuthState(state);

    await assert.rejects(() => oauth.completeGoogleOAuthCallback({
        code: 'uncertain-token-code',
        state,
        oauth2Client: doubles.oauthClient,
        oauth2Api: doubles.oauthApi,
        sheetsClient: {}
    }), /AUDIT_TOKEN_EXCHANGE_UNCERTAIN/);
    await assert.rejects(() => oauth.completeGoogleOAuthCallback({
        code: 'uncertain-token-code-replay',
        state,
        oauth2Client: doubles.oauthClient,
        oauth2Api: doubles.oauthApi,
        sheetsClient: {}
    }), /State OAuth|expirado/i);

    const attempt = store.getOAuthConnectionAttempt(payload.attemptId, { includeTokens: true });
    assert.strictEqual(doubles.counters.tokenExchange, 1);
    assert.strictEqual(doubles.counters.accountLookup, 0);
    assert.strictEqual(doubles.counters.create, 0);
    assert.strictEqual(attempt.status, 'manual_required');
    assert.strictEqual(attempt.tokens, undefined);
});

test('failed compensation is persisted and recovered after a newer OAuth generation is issued', async (t) => {
    resetModules();
    const tempDir = configureEnv();
    process.env.GOOGLE_OAUTH_ATTEMPT_RETRY_BASE_MS = '0';
    const doubles = installSagaDoubles({
        failDeleteOnce: true,
        statusSequence: ['APPROVED_AWAITING_GOOGLE', 'APPROVED_AWAITING_GOOGLE', 'BLOCKED']
    });
    t.after(() => {
        delete process.env.GOOGLE_OAUTH_ATTEMPT_RETRY_BASE_MS;
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    const oauth = require(OAUTH_PATH);
    const store = require(STORE_PATH);
    const state = oauth.createOAuthState({ userId: 'recoverable-compensation-user' });
    const payload = oauth.verifyOAuthState(state);

    await assert.rejects(() => oauth.completeGoogleOAuthCallback({
        code: 'terminal-code-with-delete-failure',
        state,
        oauth2Client: doubles.oauthClient,
        oauth2Api: doubles.oauthApi,
        sheetsClient: {}
    }), /status.*permite conex/i);

    const pending = store.getOAuthConnectionAttempt(payload.attemptId, { includeTokens: true });
    assert.strictEqual(pending.status, 'compensation_pending');
    assert.strictEqual(pending.compensation_attempts, 1);
    assert.strictEqual(pending.tokens.refresh_token, 'saga-refresh-1');
    assert.strictEqual(doubles.counters.delete, 1);

    const newerState = oauth.createOAuthState({ userId: payload.userId });
    const newerPayload = oauth.verifyOAuthState(newerState);
    assert.strictEqual(newerPayload.generation, payload.generation + 1);
    assert.strictEqual(store.getOAuthConnectionAttempt(payload.attemptId).status, 'compensation_pending');

    const recovery = await oauth.recoverPendingGoogleOAuthCompensations({
        oauth2ClientFactory: () => doubles.oauthClient
    });
    const compensated = store.getOAuthConnectionAttempt(payload.attemptId, { includeTokens: true });
    assert.deepStrictEqual(recovery, {
        attempted: 1,
        compensated: 1,
        pending: 0,
        manualRequired: 0
    });
    assert.strictEqual(doubles.counters.delete, 2);
    assert.strictEqual(compensated.status, 'compensated');
    assert.strictEqual(compensated.compensation_attempts, 2);
    assert.strictEqual(compensated.tokens, undefined);
    assert.strictEqual(store.getOAuthConnectionAttempt(newerPayload.attemptId).status, 'issued');
});

test('compensation converges when remote deletion commits but its response is lost', async (t) => {
    resetModules();
    const tempDir = configureEnv();
    process.env.GOOGLE_OAUTH_ATTEMPT_RETRY_BASE_MS = '0';
    const doubles = installSagaDoubles({
        failDeleteAfterCommitOnce: true,
        statusSequence: ['APPROVED_AWAITING_GOOGLE', 'APPROVED_AWAITING_GOOGLE', 'BLOCKED']
    });
    t.after(() => {
        delete process.env.GOOGLE_OAUTH_ATTEMPT_RETRY_BASE_MS;
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    const oauth = require(OAUTH_PATH);
    const store = require(STORE_PATH);
    const state = oauth.createOAuthState({ userId: 'ambiguous-delete-compensation-user' });
    const payload = oauth.verifyOAuthState(state);

    await assert.rejects(() => oauth.completeGoogleOAuthCallback({
        code: 'terminal-code-with-ambiguous-delete',
        state,
        oauth2Client: doubles.oauthClient,
        oauth2Api: doubles.oauthApi,
        sheetsClient: {}
    }), /status.*permite conex/i);

    assert.strictEqual(doubles.state.sheet, null);
    assert.strictEqual(store.getOAuthConnectionAttempt(payload.attemptId).status, 'compensation_pending');
    const recovery = await oauth.recoverPendingGoogleOAuthCompensations({
        oauth2ClientFactory: () => doubles.oauthClient
    });
    const compensated = store.getOAuthConnectionAttempt(payload.attemptId, { includeTokens: true });
    assert.deepStrictEqual(recovery, {
        attempted: 1,
        compensated: 1,
        pending: 0,
        manualRequired: 0
    });
    assert.strictEqual(doubles.counters.delete, 2);
    assert.strictEqual(compensated.status, 'compensated');
    assert.strictEqual(compensated.tokens, undefined);
});

test('template failure resumes from the recorded sheet without repeating token or create effects', async (t) => {
    resetModules();
    const tempDir = configureEnv();
    const doubles = installSagaDoubles({ failTemplateOnce: true });
    t.after(() => {
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    const oauth = require(OAUTH_PATH);
    const state = oauth.createOAuthState({ userId: 'template-recovery-user' });

    await assert.rejects(() => oauth.completeGoogleOAuthCallback({
        code: 'template-code-one',
        state,
        oauth2Client: doubles.oauthClient,
        oauth2Api: doubles.oauthApi,
        sheetsClient: {}
    }), /AUDIT_TEMPLATE_FAILURE/);
    const result = await oauth.completeGoogleOAuthCallback({
        code: 'template-code-two-must-not-be-exchanged',
        state,
        oauth2Client: doubles.oauthClient,
        oauth2Api: doubles.oauthApi,
        sheetsClient: {}
    });

    assert.strictEqual(result.spreadsheetId, 'saga-sheet-1');
    assert.strictEqual(doubles.counters.tokenExchange, 1);
    assert.strictEqual(doubles.counters.accountLookup, 1);
    assert.strictEqual(doubles.counters.create, 1);
    assert.strictEqual(doubles.counters.template, 2);
    assert.strictEqual(doubles.counters.promotionGuard, 1);
    assert.strictEqual(doubles.counters.lifecycle, 1);
});

test('restart resumes the persisted sheet checkpoint without re-exchanging the authorization code', async (t) => {
    resetModules();
    const tempDir = configureEnv();
    const firstProcess = installSagaDoubles({ failTemplateOnce: true });
    t.after(() => {
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    let oauth = require(OAUTH_PATH);
    const state = oauth.createOAuthState({ userId: 'restart-recovery-user' });

    await assert.rejects(() => oauth.completeGoogleOAuthCallback({
        code: 'restart-code-one',
        state,
        oauth2Client: firstProcess.oauthClient,
        oauth2Api: firstProcess.oauthApi,
        sheetsClient: {}
    }), /AUDIT_TEMPLATE_FAILURE/);
    require(STORE_PATH).__test__.closeDatabaseForTests();
    resetModules();

    const secondProcess = installSagaDoubles();
    oauth = require(OAUTH_PATH);
    const result = await oauth.completeGoogleOAuthCallback({
        code: 'restart-code-two-must-not-be-exchanged',
        state,
        oauth2Client: secondProcess.oauthClient,
        oauth2Api: secondProcess.oauthApi,
        sheetsClient: {}
    });

    assert.strictEqual(result.spreadsheetId, 'saga-sheet-1');
    assert.strictEqual(firstProcess.counters.tokenExchange, 1);
    assert.strictEqual(firstProcess.counters.create, 1);
    assert.strictEqual(secondProcess.counters.tokenExchange, 0);
    assert.strictEqual(secondProcess.counters.accountLookup, 0);
    assert.strictEqual(secondProcess.counters.create, 0);
    assert.strictEqual(secondProcess.counters.template, 1);
    assert.strictEqual(secondProcess.counters.promotionGuard, 1);
    assert.strictEqual(secondProcess.counters.lifecycle, 1);
});

test('promotion failure preserves a healthy old connection and resumes only the local commit', async (t) => {
    resetModules();
    const tempDir = configureEnv();
    const doubles = installSagaDoubles({ failPromotionGuardOnce: true });
    t.after(() => {
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    const store = require(STORE_PATH);
    store.saveOAuthConnection('promotion-recovery-user', {
        scopes: ['old.scope'],
        tokens: { refresh_token: 'old-refresh' },
        googleAccount: { id: 'old-google', email: 'old@example.invalid' },
        spreadsheetId: 'saga-sheet-1'
    });
    const oauth = require(OAUTH_PATH);
    const state = oauth.createOAuthState({ userId: 'promotion-recovery-user' });

    await assert.rejects(() => oauth.completeGoogleOAuthCallback({
        code: 'promotion-code-one',
        state,
        oauth2Client: doubles.oauthClient,
        oauth2Api: doubles.oauthApi,
        sheetsClient: {}
    }), /AUDIT_PROMOTION_GUARD_FAILURE/);
    assert.strictEqual(
        store.getOAuthConnection('promotion-recovery-user', { includeTokens: true }).tokens.refresh_token,
        'old-refresh'
    );
    const result = await oauth.completeGoogleOAuthCallback({
        code: 'promotion-code-two-must-not-be-exchanged',
        state,
        oauth2Client: doubles.oauthClient,
        oauth2Api: doubles.oauthApi,
        sheetsClient: {}
    });

    assert.strictEqual(result.spreadsheetId, 'saga-sheet-1');
    assert.strictEqual(doubles.counters.tokenExchange, 1);
    assert.strictEqual(doubles.counters.accountLookup, 1);
    assert.strictEqual(doubles.counters.create, 0);
    assert.strictEqual(doubles.counters.template, 1);
    assert.strictEqual(doubles.counters.promotionGuard, 2);
    assert.strictEqual(doubles.counters.lifecycle, 1);
    assert.strictEqual(
        store.getOAuthConnection('promotion-recovery-user', { includeTokens: true }).tokens.refresh_token,
        'saga-refresh-1'
    );
});

test('lifecycle failure resumes after the committed connection without repeating prior stages', async (t) => {
    resetModules();
    const tempDir = configureEnv();
    const doubles = installSagaDoubles({ failLifecycleOnce: true });
    t.after(() => {
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    const oauth = require(OAUTH_PATH);
    const state = oauth.createOAuthState({ userId: 'lifecycle-recovery-user' });

    await assert.rejects(() => oauth.completeGoogleOAuthCallback({
        code: 'lifecycle-code-one',
        state,
        oauth2Client: doubles.oauthClient,
        oauth2Api: doubles.oauthApi,
        sheetsClient: {}
    }), /AUDIT_LIFECYCLE_FAILURE/);
    const result = await oauth.completeGoogleOAuthCallback({
        code: 'lifecycle-code-two-must-not-be-exchanged',
        state,
        oauth2Client: doubles.oauthClient,
        oauth2Api: doubles.oauthApi,
        sheetsClient: {}
    });

    assert.strictEqual(result.userStatus, 'ACTIVE');
    assert.strictEqual(doubles.counters.tokenExchange, 1);
    assert.strictEqual(doubles.counters.accountLookup, 1);
    assert.strictEqual(doubles.counters.create, 1);
    assert.strictEqual(doubles.counters.template, 1);
    assert.strictEqual(doubles.counters.promotionGuard, 1);
    assert.strictEqual(doubles.counters.lifecycle, 2);
});

test('terminal lifecycle change compensates only the newly created unadopted sheet and clears staged tokens', async (t) => {
    resetModules();
    const tempDir = configureEnv();
    const doubles = installSagaDoubles({
        statusSequence: ['APPROVED_AWAITING_GOOGLE', 'APPROVED_AWAITING_GOOGLE', 'BLOCKED']
    });
    t.after(() => {
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    const oauth = require(OAUTH_PATH);
    const store = require(STORE_PATH);
    const state = oauth.createOAuthState({ userId: 'terminal-compensation-user' });
    const payload = oauth.verifyOAuthState(state);

    await assert.rejects(() => oauth.completeGoogleOAuthCallback({
        code: 'terminal-code',
        state,
        oauth2Client: doubles.oauthClient,
        oauth2Api: doubles.oauthApi,
        sheetsClient: {}
    }), /status.*permite conex/i);

    const attempt = store.getOAuthConnectionAttempt(payload.attemptId, { includeTokens: true });
    assert.strictEqual(doubles.counters.create, 1);
    assert.strictEqual(doubles.counters.delete, 1);
    assert.strictEqual(doubles.counters.template, 0);
    assert.strictEqual(store.getOAuthConnection(payload.userId), null);
    assert.strictEqual(attempt.status, 'compensated');
    assert.strictEqual(attempt.tokens, undefined);
});

test('terminal lifecycle change never compensates a preexisting adopted spreadsheet', async (t) => {
    resetModules();
    const tempDir = configureEnv();
    const doubles = installSagaDoubles({
        statusSequence: ['APPROVED_AWAITING_GOOGLE', 'APPROVED_AWAITING_GOOGLE', 'BLOCKED']
    });
    t.after(() => {
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    const store = require(STORE_PATH);
    store.saveOAuthConnection('preexisting-sheet-user', {
        scopes: ['old.scope'],
        tokens: { refresh_token: 'old-refresh' },
        googleAccount: { id: 'old-google', email: 'old@example.invalid' },
        spreadsheetId: 'preexisting-sheet'
    });
    const oauth = require(OAUTH_PATH);
    const state = oauth.createOAuthState({ userId: 'preexisting-sheet-user' });

    await assert.rejects(() => oauth.completeGoogleOAuthCallback({
        code: 'preexisting-terminal-code',
        state,
        oauth2Client: doubles.oauthClient,
        oauth2Api: doubles.oauthApi,
        sheetsClient: {}
    }), /status.*permite conex/i);

    assert.strictEqual(doubles.counters.create, 0);
    assert.strictEqual(doubles.counters.delete, 0);
    assert.strictEqual(store.getOAuthConnection('preexisting-sheet-user').spreadsheet_id, 'preexisting-sheet');
});

test('compensation never deletes a created sheet that became referenced by a family membership', async (t) => {
    resetModules();
    const tempDir = configureEnv();
    let store;
    const doubles = installSagaDoubles({
        statusSequence: ['APPROVED_AWAITING_GOOGLE', 'APPROVED_AWAITING_GOOGLE', 'BLOCKED'],
        beforeCreateReturn: async () => {
            store.setSharedSpreadsheetMembership({
                memberUserId: 'durable-family-member',
                ownerUserId: 'durable-family-owner',
                spreadsheetId: 'saga-sheet-1'
            });
        }
    });
    t.after(() => {
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    const oauth = require(OAUTH_PATH);
    store = require(STORE_PATH);
    const state = oauth.createOAuthState({ userId: 'referenced-compensation-user' });
    const payload = oauth.verifyOAuthState(state);

    await assert.rejects(() => oauth.completeGoogleOAuthCallback({
        code: 'referenced-terminal-code',
        state,
        oauth2Client: doubles.oauthClient,
        oauth2Api: doubles.oauthApi,
        sheetsClient: {}
    }), /status.*permite conex/i);

    const attempt = store.getOAuthConnectionAttempt(payload.attemptId, { includeTokens: true });
    assert.strictEqual(doubles.counters.delete, 0);
    assert.strictEqual(attempt.status, 'compensation_not_required');
    assert.strictEqual(attempt.tokens, undefined);
    assert.strictEqual(
        store.getSharedSpreadsheetMembership('durable-family-member').spreadsheet_id,
        'saga-sheet-1'
    );
});

test('a newer state generation fences a late create result and compensates only the losing sheet', async (t) => {
    resetModules();
    const tempDir = configureEnv();
    const createArrived = deferred();
    const releaseCreate = deferred();
    const doubles = installSagaDoubles({
        beforeCreateReturn: async () => {
            createArrived.resolve();
            await releaseCreate.promise;
        }
    });
    t.after(() => {
        try { require(STORE_PATH).__test__.closeDatabaseForTests(); } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    const oauth = require(OAUTH_PATH);
    const store = require(STORE_PATH);
    const firstState = oauth.createOAuthState({ userId: 'generation-fence-user' });
    const firstCallback = oauth.completeGoogleOAuthCallback({
        code: 'generation-one-code',
        state: firstState,
        oauth2Client: doubles.oauthClient,
        oauth2Api: doubles.oauthApi,
        sheetsClient: {}
    });
    await createArrived.promise;
    const secondState = oauth.createOAuthState({ userId: 'generation-fence-user' });
    releaseCreate.resolve();

    await assert.rejects(firstCallback, /precedÃªncia|superada|claim/i);
    assert.strictEqual(doubles.counters.delete, 1);
    assert.strictEqual(store.getOAuthConnection('generation-fence-user'), null);

    const result = await oauth.completeGoogleOAuthCallback({
        code: 'generation-two-code',
        state: secondState,
        oauth2Client: doubles.oauthClient,
        oauth2Api: doubles.oauthApi,
        sheetsClient: {}
    });
    const connection = store.getOAuthConnection('generation-fence-user', { includeTokens: true });
    assert.strictEqual(result.spreadsheetId, 'saga-sheet-1');
    assert.strictEqual(doubles.counters.tokenExchange, 2);
    assert.strictEqual(doubles.counters.create, 2);
    assert.strictEqual(doubles.counters.delete, 1);
    assert.strictEqual(connection.tokens.refresh_token, 'saga-refresh-2');
});
