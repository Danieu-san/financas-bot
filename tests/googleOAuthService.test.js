const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

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
        assert.strictEqual(revocation.status, 'in_progress');
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
    store.markOAuthRevocationResult('user-revocation-generation', first.revocationId, first.leaseId, {
        status: 'remote_revoked'
    });

    store.saveOAuthConnection('user-revocation-generation', {
        scopes: ['scope-a'],
        tokens: { refresh_token: 'generation-two' }
    });
    const second = store.beginOAuthRevocation('user-revocation-generation', { reason: 'BLOCKED' });
    store.markOAuthRevocationResult('user-revocation-generation', first.revocationId, first.leaseId, {
        status: 'remote_failed',
        errorCode: 'LATE_OLD_RESULT'
    });

    const current = store.getOAuthRevocation('user-revocation-generation');
    assert.notStrictEqual(first.revocationId, second.revocationId);
    assert.strictEqual(current.revocation_id, second.revocationId);
    assert.strictEqual(current.status, 'in_progress');
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

test('concurrent recovery workers claim a retryable revocation only once', async () => {
    resetModules();
    configureTestEnv();
    const store = require('../src/services/oauthTokenStore');
    const service = require('../src/services/googleOAuthRevocationService');
    const failedAt = new Date('2026-04-01T00:00:00.000Z');
    const recoveryAt = new Date('2026-04-01T00:00:02.000Z');
    let remoteCalls = 0;

    store.saveOAuthConnection('user-concurrent-recovery', {
        scopes: ['scope-a'],
        tokens: { refresh_token: 'concurrent-recovery-secret' }
    });
    await service.revokeGoogleConnectionForUser('user-concurrent-recovery', {
        now: failedAt,
        baseDelayMs: 1000,
        revokeToken: async () => { throw new Error('synthetic outage'); }
    });

    const results = await Promise.all([
        service.retryPendingGoogleRevocations({
            now: recoveryAt,
            baseDelayMs: 1000,
            revokeToken: async () => {
                remoteCalls += 1;
                await new Promise(resolve => setImmediate(resolve));
            }
        }),
        service.retryPendingGoogleRevocations({
            now: recoveryAt,
            baseDelayMs: 1000,
            revokeToken: async () => {
                remoteCalls += 1;
                await new Promise(resolve => setImmediate(resolve));
            }
        })
    ]);

    assert.strictEqual(remoteCalls, 1);
    assert.strictEqual(results.reduce((sum, result) => sum + result.attempted, 0), 1);
    assert.strictEqual(results.reduce((sum, result) => sum + result.revoked, 0), 1);
    assert.strictEqual(store.getOAuthRevocation('user-concurrent-recovery').attempts, 2);
});

test('automatic recovery does not race an initial remote revocation in flight', async () => {
    resetModules();
    configureTestEnv();
    const store = require('../src/services/oauthTokenStore');
    const service = require('../src/services/googleOAuthRevocationService');
    let releaseRemote;
    let reportRemoteStarted;
    let remoteCalls = 0;
    const remoteStarted = new Promise(resolve => { reportRemoteStarted = resolve; });
    const remoteGate = new Promise(resolve => { releaseRemote = resolve; });

    store.saveOAuthConnection('user-initial-recovery-race', {
        scopes: ['scope-a'],
        tokens: { refresh_token: 'initial-recovery-secret' }
    });
    const initial = service.revokeGoogleConnectionForUser('user-initial-recovery-race', {
        now: new Date('2026-04-02T00:00:00.000Z'),
        timeoutMs: 5000,
        revokeToken: async () => {
            remoteCalls += 1;
            reportRemoteStarted();
            await remoteGate;
        }
    });
    await remoteStarted;

    let recovery;
    try {
        recovery = await service.retryPendingGoogleRevocations({
            now: new Date('2026-04-02T00:00:01.000Z'),
            revokeToken: async () => { remoteCalls += 1; }
        });
    } finally {
        releaseRemote();
    }
    const completed = await initial;
    assert.deepStrictEqual(recovery, { attempted: 0, revoked: 0, failed: 0, expired: 0 });
    assert.strictEqual(remoteCalls, 1);
    assert.strictEqual(completed.remoteStatus, 'revoked');
    assert.strictEqual(store.getOAuthRevocation('user-initial-recovery-race').attempts, 1);
});

test('a stale lease result cannot mutate a revocation claimed by a newer worker', () => {
    resetModules();
    configureTestEnv();
    const store = require('../src/services/oauthTokenStore');

    store.saveOAuthConnection('user-stale-lease', {
        scopes: ['scope-a'],
        tokens: { refresh_token: 'stale-lease-secret' }
    });
    const first = store.beginOAuthRevocation('user-stale-lease', {
        now: new Date('2026-04-03T00:00:00.000Z'),
        leaseDurationMs: 1000
    });
    const second = store.beginOAuthRevocation('user-stale-lease', {
        revocationId: first.revocationId,
        now: new Date('2026-04-03T00:00:02.000Z'),
        leaseDurationMs: 1000
    });

    const stale = store.markOAuthRevocationResult(
        'user-stale-lease',
        first.revocationId,
        first.leaseId,
        { status: 'remote_revoked', now: new Date('2026-04-03T00:00:02.500Z') }
    );
    assert.strictEqual(stale.applied, false);
    assert.strictEqual(store.getOAuthRevocation('user-stale-lease').status, 'in_progress');

    const current = store.markOAuthRevocationResult(
        'user-stale-lease',
        second.revocationId,
        second.leaseId,
        { status: 'remote_revoked', now: new Date('2026-04-03T00:00:02.500Z') }
    );
    assert.strictEqual(current.applied, true);
    assert.strictEqual(current.status, 'remote_revoked');
});

test('expiry cannot clear retained token material while a lease is active', () => {
    resetModules();
    const { dbPath } = configureTestEnv();
    const store = require('../src/services/oauthTokenStore');

    store.saveOAuthConnection('user-active-lease-expiry', {
        scopes: ['scope-a'],
        tokens: { refresh_token: 'active-lease-expiry-secret' }
    });
    const started = store.beginOAuthRevocation('user-active-lease-expiry', {
        now: new Date('2026-04-03T01:00:00.000Z'),
        leaseDurationMs: 5000
    });
    const blocked = store.expireOAuthRevocation(
        'user-active-lease-expiry',
        started.revocationId,
        { now: new Date('2026-04-03T01:00:01.000Z') }
    );
    assert.strictEqual(blocked.applied, false);
    assert.strictEqual(blocked.status, 'in_progress');
    assert.strictEqual(blocked.has_pending_token, true);

    const rawDb = require('better-sqlite3')(dbPath, { readonly: true });
    try {
        const active = rawDb.prepare(`
            SELECT length(encrypted_tokens) AS encrypted_length
            FROM oauth_revocations
            WHERE revocation_id = ?
        `).get(started.revocationId);
        assert.ok(active.encrypted_length > 0);
    } finally {
        rawDb.close();
    }

    const expired = store.expireOAuthRevocation(
        'user-active-lease-expiry',
        started.revocationId,
        { now: new Date('2026-04-03T01:00:06.000Z') }
    );
    assert.strictEqual(expired.applied, true);
    assert.strictEqual(expired.status, 'manual_required_expired');
    assert.strictEqual(expired.has_pending_token, false);
});

test('recovery honors persisted retention and attempt policies after runtime changes', async () => {
    resetModules();
    configureTestEnv();
    const store = require('../src/services/oauthTokenStore');
    const service = require('../src/services/googleOAuthRevocationService');
    let remoteCalls = 0;

    store.saveOAuthConnection('user-persisted-retention', {
        scopes: ['scope-a'],
        tokens: { refresh_token: 'persisted-retention-secret' }
    });
    await service.revokeGoogleConnectionForUser('user-persisted-retention', {
        now: new Date('2026-04-04T00:00:00.000Z'),
        retentionDays: 1,
        maxAttempts: 1,
        baseDelayMs: 1000,
        revokeToken: async () => { throw new Error('synthetic outage'); }
    });

    const recovery = await service.retryPendingGoogleRevocations({
        now: new Date('2026-04-06T00:00:00.000Z'),
        retentionDays: 90,
        maxAttempts: 20,
        revokeToken: async () => { remoteCalls += 1; }
    });
    const job = store.getOAuthRevocation('user-persisted-retention');
    assert.deepStrictEqual(recovery, { attempted: 0, revoked: 0, failed: 0, expired: 1 });
    assert.strictEqual(remoteCalls, 0);
    assert.strictEqual(job.status, 'manual_required_expired');
    assert.strictEqual(job.has_pending_token, false);
});

test('recovery honors the persisted attempt cap after runtime changes', async () => {
    resetModules();
    configureTestEnv();
    const store = require('../src/services/oauthTokenStore');
    const service = require('../src/services/googleOAuthRevocationService');
    let remoteCalls = 0;

    store.saveOAuthConnection('user-persisted-attempt-cap', {
        scopes: ['scope-a'],
        tokens: { refresh_token: 'persisted-attempt-cap-secret' }
    });
    await service.revokeGoogleConnectionForUser('user-persisted-attempt-cap', {
        now: new Date('2026-04-07T00:00:00.000Z'),
        retentionDays: 90,
        maxAttempts: 1,
        baseDelayMs: 1000,
        revokeToken: async () => { throw new Error('synthetic outage'); }
    });

    const recovery = await service.retryPendingGoogleRevocations({
        now: new Date('2026-04-07T00:00:02.000Z'),
        maxAttempts: 20,
        revokeToken: async () => { remoteCalls += 1; }
    });
    const job = store.getOAuthRevocation('user-persisted-attempt-cap');
    assert.deepStrictEqual(recovery, { attempted: 0, revoked: 0, failed: 0, expired: 1 });
    assert.strictEqual(remoteCalls, 0);
    assert.strictEqual(job.status, 'manual_required_exhausted');
    assert.strictEqual(job.has_pending_token, false);
});

test('legacy revocation schema migrates safely when two processes open it concurrently', async () => {
    resetModules();
    const { dbPath } = configureTestEnv();
    const Database = require('better-sqlite3');
    const legacyDb = new Database(dbPath);
    legacyDb.exec(`
        CREATE TABLE oauth_revocations (
            user_id TEXT PRIMARY KEY,
            encrypted_tokens TEXT NOT NULL,
            reason TEXT NOT NULL,
            status TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error_code TEXT,
            requested_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            completed_at TEXT,
            has_pending_token INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO oauth_revocations(
            user_id, encrypted_tokens, reason, status, attempts, last_error_code,
            requested_at, updated_at, completed_at, has_pending_token
        ) VALUES(
            'legacy-user', 'legacy-ciphertext', 'BLOCKED', 'pending', 1, '',
            '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', '', 1
        );
    `);
    legacyDb.close();

    const storePath = path.resolve(__dirname, '../src/services/oauthTokenStore.js');
    const workerSource = "const store = require(process.argv[1]); store.getOAuthRevocation('legacy-user');";
    const workerEnv = {
        ...process.env,
        OAUTH_TOKEN_DB_PATH: dbPath,
        OAUTH_SQLITE_BUSY_TIMEOUT_MS: '5000'
    };
    await Promise.all([
        runNodeWorker(workerSource, storePath, workerEnv),
        runNodeWorker(workerSource, storePath, workerEnv)
    ]);

    const migratedDb = new Database(dbPath, { readonly: true });
    try {
        const columns = migratedDb.prepare('PRAGMA table_info(oauth_revocations)').all()
            .map(column => column.name);
        const rows = migratedDb.prepare('SELECT COUNT(*) AS value FROM oauth_revocations').get();
        assert.ok(columns.includes('revocation_id'));
        assert.ok(columns.includes('lease_id'));
        assert.ok(columns.includes('lease_expires_at'));
        assert.ok(columns.includes('max_attempts'));
        assert.strictEqual(rows.value, 1);
    } finally {
        migratedDb.close();
    }
});

test('versioned revocation schema adds lease columns safely under concurrent startup', async () => {
    resetModules();
    const { dbPath } = configureTestEnv();
    const Database = require('better-sqlite3');
    const versionedDb = new Database(dbPath);
    versionedDb.exec(`
        CREATE TABLE oauth_revocations (
            revocation_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            generation INTEGER NOT NULL,
            encrypted_tokens TEXT NOT NULL,
            reason TEXT NOT NULL,
            status TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error_code TEXT,
            requested_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            next_attempt_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            completed_at TEXT,
            has_pending_token INTEGER NOT NULL DEFAULT 0,
            UNIQUE(user_id, generation)
        );
        INSERT INTO oauth_revocations(
            revocation_id, user_id, generation, encrypted_tokens, reason, status,
            attempts, last_error_code, requested_at, updated_at, next_attempt_at,
            expires_at, completed_at, has_pending_token
        ) VALUES(
            'versioned-job', 'versioned-user', 1, 'versioned-ciphertext', 'BLOCKED',
            'remote_failed', 1, 'REMOTE_REVOKE_FAILED', '2026-04-01T00:00:00.000Z',
            '2026-04-01T00:00:00.000Z', '2026-04-01T00:05:00.000Z',
            '2026-05-01T00:00:00.000Z', '', 1
        );
    `);
    versionedDb.close();

    const storePath = path.resolve(__dirname, '../src/services/oauthTokenStore.js');
    const workerSource = "const store = require(process.argv[1]); store.getOAuthRevocation('versioned-user');";
    const workerEnv = {
        ...process.env,
        OAUTH_TOKEN_DB_PATH: dbPath,
        OAUTH_SQLITE_BUSY_TIMEOUT_MS: '5000'
    };
    await Promise.all([
        runNodeWorker(workerSource, storePath, workerEnv),
        runNodeWorker(workerSource, storePath, workerEnv)
    ]);

    const migratedDb = new Database(dbPath, { readonly: true });
    try {
        const job = migratedDb.prepare(`
            SELECT max_attempts, lease_id, lease_expires_at
            FROM oauth_revocations
            WHERE revocation_id = 'versioned-job'
        `).get();
        assert.strictEqual(job.max_attempts, 5);
        assert.strictEqual(job.lease_id, '');
        assert.strictEqual(job.lease_expires_at, '');
    } finally {
        migratedDb.close();
    }
});

function runNodeWorker(source, storePath, env) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', source, storePath], {
            env,
            stdio: ['ignore', 'ignore', 'pipe']
        });
        let stderr = '';
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.once('error', reject);
        child.once('exit', code => {
            if (code === 0) resolve();
            else reject(new Error(`migration worker exited ${code}: ${stderr.slice(0, 500)}`));
        });
    });
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
