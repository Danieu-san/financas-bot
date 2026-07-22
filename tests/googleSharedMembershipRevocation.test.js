const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const storePath = require.resolve('../src/services/oauthTokenStore');
const servicePath = require.resolve('../src/services/googleSharedMembershipRevocationService');

function deferred() {
    let resolve;
    const promise = new Promise(res => { resolve = res; });
    return { promise, resolve };
}

function readRow(dbPath, table, column, value) {
    const database = new Database(dbPath, { readonly: true });
    try {
        return database.prepare(`SELECT * FROM ${table} WHERE ${column} = ?`).get(value) || null;
    } finally {
        database.close();
    }
}

function setup(t, name, { members = ['member-a'] } = {}) {
    delete require.cache[servicePath];
    delete require.cache[storePath];
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `financas-shared-revoke-${name}-`));
    const dbPath = path.join(root, 'oauth.sqlite');
    process.env.OAUTH_TOKEN_DB_PATH = dbPath;
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 47).toString('base64');

    const store = require(storePath);
    const service = require(servicePath);
    const ownerUserId = `owner-${name}`;
    const spreadsheetId = `sheet-${name}`;
    store.saveOAuthConnection(ownerUserId, {
        scopes: ['drive.file'],
        tokens: { refresh_token: `owner-secret-${name}` },
        googleAccount: { id: `google-owner-${name}`, email: `owner-${name}@example.invalid` },
        spreadsheetId
    });
    for (const memberUserId of members) {
        store.saveOAuthConnection(memberUserId, {
            scopes: ['drive.file'],
            tokens: { refresh_token: `member-secret-${memberUserId}` },
            googleAccount: { id: `google-${memberUserId}`, email: `${memberUserId}@example.invalid` },
            spreadsheetId: `individual-${memberUserId}`
        });
        store.setSharedSpreadsheetMembership({
            memberUserId,
            ownerUserId,
            spreadsheetId,
            memberGoogleEmail: `${memberUserId}@example.invalid`,
            drivePermissionId: `permission-${memberUserId}`
        });
    }

    t.after(() => {
        store.__test__.closeDatabaseForTests();
        delete require.cache[servicePath];
        delete require.cache[storePath];
        fs.rmSync(root, { recursive: true, force: true });
    });
    return { store, service, dbPath, ownerUserId, spreadsheetId, members };
}

test('shared spreadsheet lifecycle revocation is durable, fenced and fail-closed', async t => {
    await t.test('member removal is locally invisible before the remote Drive call and preserves the owner', async t => {
        const scenario = setup(t, 'member-local-first');
        const calls = [];
        const result = await scenario.service.revokeSharedMembershipsForLifecycle('member-a', {
            reason: 'INACTIVE',
            now: new Date('2026-07-22T12:00:00.000Z'),
            revokePermission: async payload => {
                assert.strictEqual(scenario.store.getSharedSpreadsheetMembership('member-a'), null);
                calls.push(payload);
                return true;
            }
        });

        const owner = scenario.store.getOAuthConnection(scenario.ownerUserId, { includeTokens: true });
        const rawMembership = readRow(scenario.dbPath, 'shared_spreadsheet_members', 'user_id', 'member-a');
        const job = readRow(scenario.dbPath, 'shared_membership_revocations', 'member_user_id', 'member-a');
        assert.deepStrictEqual(result, {
            localRevoked: 1,
            attempted: 1,
            revoked: 1,
            failed: 0,
            manualRequired: 0
        });
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].ownerUserId, scenario.ownerUserId);
        assert.strictEqual(calls[0].permissionId, 'permission-member-a');
        assert.ok(rawMembership.revoked_at);
        assert.ok(owner?.tokens?.refresh_token);
        assert.strictEqual(job.status, 'remote_revoked');
        assert.strictEqual(job.has_pending_token, 0);
        assert.strictEqual(job.encrypted_owner_tokens, '');
    });

    await t.test('the member OAuth tombstone hides a real share even if complementary local cleanup has not run', async t => {
        const scenario = setup(t, 'oauth-tombstone-visibility');
        scenario.store.beginOAuthRevocation('member-a', {
            reason: 'BLOCKED',
            now: new Date('2026-07-22T12:00:00.000Z')
        });

        assert.strictEqual(scenario.store.getSharedSpreadsheetMembership('member-a'), null);
        assert.deepStrictEqual(
            scenario.store.listSharedSpreadsheetMembersBySpreadsheetId(scenario.spreadsheetId),
            []
        );
        const rawMembership = readRow(scenario.dbPath, 'shared_spreadsheet_members', 'user_id', 'member-a');
        assert.strictEqual(rawMembership.revoked_at, '');
    });

    await t.test('owner removal revokes every family permission but preserves member OAuth and the sheet record', async t => {
        const scenario = setup(t, 'owner-all-members', { members: ['member-a', 'member-b'] });
        const started = scenario.store.beginOAuthRevocation(scenario.ownerUserId, {
            reason: 'DELETED',
            now: new Date('2026-07-22T12:00:00.000Z')
        });
        const calls = [];
        const result = await scenario.service.revokeSharedMembershipsForLifecycle(scenario.ownerUserId, {
            reason: 'DELETED',
            targetOwnerTokens: started.tokens,
            now: new Date('2026-07-22T12:00:00.000Z'),
            revokePermission: async payload => {
                calls.push(payload);
                return true;
            }
        });

        assert.strictEqual(result.localRevoked, 2);
        assert.strictEqual(result.revoked, 2);
        assert.deepStrictEqual(calls.map(item => item.permissionId).sort(), [
            'permission-member-a',
            'permission-member-b'
        ]);
        for (const memberUserId of scenario.members) {
            assert.strictEqual(scenario.store.getSharedSpreadsheetMembership(memberUserId), null);
            assert.ok(scenario.store.getOAuthConnection(memberUserId, { includeTokens: true })?.tokens?.refresh_token);
            const rawMembership = readRow(scenario.dbPath, 'shared_spreadsheet_members', 'user_id', memberUserId);
            assert.strictEqual(rawMembership.spreadsheet_id, scenario.spreadsheetId);
            assert.ok(rawMembership.revoked_at);
        }
    });

    await t.test('member-only removal does not revoke shares owned by that same user', async t => {
        const scenario = setup(t, 'member-only-scope');
        scenario.store.saveOAuthConnection('member-x', {
            scopes: ['drive.file'],
            tokens: { refresh_token: 'member-x-secret' },
            googleAccount: { id: 'google-member-x', email: 'member-x@example.invalid' },
            spreadsheetId: 'individual-member-x'
        });
        scenario.store.setSharedSpreadsheetMembership({
            memberUserId: 'member-x',
            ownerUserId: 'member-a',
            spreadsheetId: 'individual-member-a',
            memberGoogleEmail: 'member-x@example.invalid',
            drivePermissionId: 'permission-member-x'
        });
        const calls = [];
        const result = await scenario.service.revokeSharedMembershipForMember('member-a', {
            now: new Date('2026-07-22T12:00:00.000Z'),
            revokePermission: async payload => {
                calls.push(payload);
                return true;
            }
        });

        assert.strictEqual(result.localRevoked, 1);
        assert.deepStrictEqual(calls.map(item => item.permissionId), ['permission-member-a']);
        assert.strictEqual(scenario.store.getSharedSpreadsheetMembership('member-a'), null);
        assert.strictEqual(
            scenario.store.getSharedSpreadsheetMembership('member-x')?.drive_permission_id,
            'permission-member-x'
        );
    });

    await t.test('remote failure retains encrypted owner credentials only until a successful retry', async t => {
        const scenario = setup(t, 'failure-retry');
        const firstAt = new Date('2026-07-22T12:00:00.000Z');
        const first = await scenario.service.revokeSharedMembershipsForLifecycle('member-a', {
            now: firstAt,
            baseDelayMs: 1000,
            maxAttempts: 3,
            revokePermission: async () => {
                const error = new Error('provider unavailable with sensitive details');
                error.code = 503;
                throw error;
            }
        });
        const failedJob = readRow(scenario.dbPath, 'shared_membership_revocations', 'member_user_id', 'member-a');
        assert.strictEqual(first.failed, 1);
        assert.strictEqual(scenario.store.getSharedSpreadsheetMembership('member-a'), null);
        assert.strictEqual(failedJob.status, 'remote_failed');
        assert.strictEqual(failedJob.has_pending_token, 1);
        assert.ok(failedJob.encrypted_owner_tokens);
        assert.doesNotMatch(failedJob.encrypted_owner_tokens, /owner-secret-failure-retry/);
        assert.strictEqual(failedJob.last_error_code, 'DRIVE_PERMISSION_REVOKE_FAILED');

        const retry = await scenario.service.retryPendingSharedMembershipRevocations({
            now: new Date(firstAt.getTime() + 1000),
            baseDelayMs: 1000,
            revokePermission: async () => true
        });
        const completedJob = readRow(scenario.dbPath, 'shared_membership_revocations', 'member_user_id', 'member-a');
        assert.strictEqual(retry.attempted, 1);
        assert.strictEqual(retry.revoked, 1);
        assert.strictEqual(completedJob.status, 'remote_revoked');
        assert.strictEqual(completedJob.has_pending_token, 0);
        assert.strictEqual(completedJob.encrypted_owner_tokens, '');
    });

    await t.test('a Drive permission created before local persistence failure is compensated durably', async t => {
        const scenario = setup(t, 'detached-compensation');
        const firstAt = new Date('2026-07-22T12:00:00.000Z');
        const owner = scenario.store.getOAuthConnection(scenario.ownerUserId, { includeTokens: true });
        const first = await scenario.service.compensateUnpersistedSharedPermission({
            memberUserId: 'member-a',
            ownerUserId: scenario.ownerUserId,
            spreadsheetId: scenario.spreadsheetId,
            drivePermissionId: 'orphan-permission',
            memberGoogleEmail: 'member-a@example.invalid',
            ownerTokens: owner.tokens
        }, {
            now: firstAt,
            baseDelayMs: 1000,
            revokePermission: async () => { throw new Error('response lost'); }
        });
        const failedJob = readRow(
            scenario.dbPath,
            'shared_membership_revocations',
            'drive_permission_id',
            'orphan-permission'
        );
        assert.strictEqual(first.failed, 1);
        assert.strictEqual(failedJob.status, 'remote_failed');
        assert.strictEqual(failedJob.has_pending_token, 1);
        assert.ok(failedJob.encrypted_owner_tokens);

        const retry = await scenario.service.retryPendingSharedMembershipRevocations({
            now: new Date(firstAt.getTime() + 1000),
            baseDelayMs: 1000,
            revokePermission: async payload => {
                assert.strictEqual(payload.permissionId, 'orphan-permission');
                return true;
            }
        });
        const completedJob = readRow(
            scenario.dbPath,
            'shared_membership_revocations',
            'drive_permission_id',
            'orphan-permission'
        );
        assert.strictEqual(retry.revoked, 1);
        assert.strictEqual(completedJob.status, 'remote_revoked');
        assert.strictEqual(completedJob.encrypted_owner_tokens, '');
    });

    await t.test('two recovery workers cannot execute the same Drive removal concurrently', async t => {
        const scenario = setup(t, 'concurrent-workers');
        const firstAt = new Date('2026-07-22T12:00:00.000Z');
        await scenario.service.revokeSharedMembershipsForLifecycle('member-a', {
            now: firstAt,
            baseDelayMs: 1000,
            revokePermission: async () => { throw new Error('temporary'); }
        });
        const entered = deferred();
        const release = deferred();
        let calls = 0;
        const retryOptions = {
            now: new Date(firstAt.getTime() + 1000),
            baseDelayMs: 1000,
            revokePermission: async () => {
                calls += 1;
                entered.resolve();
                await release.promise;
                return true;
            }
        };
        const firstWorker = scenario.service.retryPendingSharedMembershipRevocations(retryOptions);
        await entered.promise;
        const secondWorker = await scenario.service.retryPendingSharedMembershipRevocations(retryOptions);
        release.resolve();
        const firstWorkerResult = await firstWorker;

        assert.strictEqual(calls, 1);
        assert.strictEqual(firstWorkerResult.revoked, 1);
        assert.strictEqual(secondWorker.attempted, 0);
    });

    await t.test('a stale lease result cannot overwrite the result of a newer claim', async t => {
        const scenario = setup(t, 'stale-lease');
        const firstAt = new Date('2026-07-22T12:00:00.000Z');
        const [initial] = scenario.store.beginSharedMembershipRevocationsForLifecycle('member-a', {
            now: firstAt,
            leaseDurationMs: 1000
        });
        const newer = scenario.store.claimSharedMembershipRevocation(initial.revocation_id, {
            now: new Date(firstAt.getTime() + 1001),
            leaseDurationMs: 1000,
            respectBackoff: false
        });
        assert.strictEqual(newer.claimed, true);
        const staleResult = scenario.store.markSharedMembershipRevocationResult(
            initial.revocation_id,
            initial.leaseId,
            { status: 'remote_revoked', now: new Date(firstAt.getTime() + 1002) }
        );
        assert.strictEqual(staleResult.applied, false);
        const currentResult = scenario.store.markSharedMembershipRevocationResult(
            initial.revocation_id,
            newer.leaseId,
            { status: 'remote_revoked', now: new Date(firstAt.getTime() + 1003) }
        );
        assert.strictEqual(currentResult.applied, true);
    });

    await t.test('retention expiry and attempt exhaustion clear retry credentials and require manual handling', async t => {
        const expiry = setup(t, 'retention-expiry');
        const firstAt = new Date('2026-07-22T12:00:00.000Z');
        await expiry.service.revokeSharedMembershipsForLifecycle('member-a', {
            now: firstAt,
            retentionDays: 1,
            baseDelayMs: 1000,
            revokePermission: async () => { throw new Error('temporary'); }
        });
        const expiredResult = await expiry.service.retryPendingSharedMembershipRevocations({
            now: new Date(firstAt.getTime() + 86400001),
            revokePermission: async () => true
        });
        const expiredJob = readRow(expiry.dbPath, 'shared_membership_revocations', 'member_user_id', 'member-a');
        assert.strictEqual(expiredResult.attempted, 0);
        assert.strictEqual(expiredResult.manualRequired, 1);
        assert.strictEqual(expiredJob.status, 'manual_required_expired');
        assert.strictEqual(expiredJob.has_pending_token, 0);
        assert.strictEqual(expiredJob.encrypted_owner_tokens, '');

        const exhausted = setup(t, 'attempt-exhaustion');
        await exhausted.service.revokeSharedMembershipsForLifecycle('member-a', {
            now: firstAt,
            maxAttempts: 1,
            baseDelayMs: 1000,
            revokePermission: async () => { throw new Error('temporary'); }
        });
        const exhaustedResult = await exhausted.service.retryPendingSharedMembershipRevocations({
            now: new Date(firstAt.getTime() + 1000),
            revokePermission: async () => true
        });
        const exhaustedJob = readRow(exhausted.dbPath, 'shared_membership_revocations', 'member_user_id', 'member-a');
        assert.strictEqual(exhaustedResult.attempted, 0);
        assert.strictEqual(exhaustedResult.manualRequired, 1);
        assert.strictEqual(exhaustedJob.status, 'manual_required_exhausted');
        assert.strictEqual(exhaustedJob.has_pending_token, 0);
        assert.strictEqual(exhaustedJob.encrypted_owner_tokens, '');
    });

    await t.test('new remote sharing is blocked during pending cleanup and after terminal OAuth revocation', async t => {
        const scenario = setup(t, 'reshare-block');
        const firstAt = new Date('2026-07-22T12:00:00.000Z');
        await scenario.service.revokeSharedMembershipsForLifecycle('member-a', {
            now: firstAt,
            baseDelayMs: 1000,
            revokePermission: async () => { throw new Error('temporary'); }
        });
        assert.throws(() => scenario.store.setSharedSpreadsheetMembership({
            memberUserId: 'member-a',
            ownerUserId: scenario.ownerUserId,
            spreadsheetId: scenario.spreadsheetId,
            memberGoogleEmail: 'member-a@example.invalid',
            drivePermissionId: 'replacement-permission'
        }), /remo.*compartilhamento pendente/i);

        await scenario.service.retryPendingSharedMembershipRevocations({
            now: new Date(firstAt.getTime() + 1000),
            revokePermission: async () => true
        });
        scenario.store.beginOAuthRevocation('member-a', {
            reason: 'BLOCKED',
            now: new Date(firstAt.getTime() + 2000)
        });
        assert.throws(() => scenario.store.setSharedSpreadsheetMembership({
            memberUserId: 'member-a',
            ownerUserId: scenario.ownerUserId,
            spreadsheetId: scenario.spreadsheetId,
            memberGoogleEmail: 'member-a@example.invalid',
            drivePermissionId: 'replacement-permission'
        }), /conex.*OAuth ativas/i);
    });

    await t.test('manual-required cleanup also blocks a new remote share while OAuth remains active', async t => {
        const scenario = setup(t, 'manual-block');
        scenario.store.revokeSharedSpreadsheetMembership('member-a');
        scenario.store.setSharedSpreadsheetMembership({
            memberUserId: 'member-a',
            ownerUserId: scenario.ownerUserId,
            spreadsheetId: scenario.spreadsheetId
        });
        const cleanup = await scenario.service.revokeSharedMembershipsForLifecycle('member-a', {
            now: new Date('2026-07-22T12:00:00.000Z')
        });
        assert.strictEqual(cleanup.manualRequired, 1);
        assert.ok(scenario.store.getOAuthConnection('member-a'));
        assert.ok(scenario.store.getOAuthConnection(scenario.ownerUserId));
        assert.throws(() => scenario.store.setSharedSpreadsheetMembership({
            memberUserId: 'member-a',
            ownerUserId: scenario.ownerUserId,
            spreadsheetId: scenario.spreadsheetId,
            memberGoogleEmail: 'member-a@example.invalid',
            drivePermissionId: 'replacement-permission'
        }), /remo.*compartilhamento pendente/i);
    });

    await t.test('Drive reconciliation by email treats an absent or already removed permission as success', async () => {
        const { revokeSpreadsheetPermission } = require('../src/services/google');
        const deleted = [];
        const driveClient = {
            permissions: {
                list: async () => ({
                    data: {
                        permissions: [
                            { id: 'other', emailAddress: 'other@example.invalid' },
                            { id: 'resolved-permission', emailAddress: 'member@example.invalid' }
                        ]
                    }
                }),
                delete: async payload => {
                    deleted.push(payload);
                    const error = new Error('already absent');
                    error.code = 404;
                    throw error;
                }
            }
        };
        const result = await revokeSpreadsheetPermission({
            ownerUserId: 'owner-adapter',
            spreadsheetId: 'sheet-adapter',
            memberEmail: 'MEMBER@example.invalid',
            driveClient
        });
        assert.strictEqual(result, true);
        assert.strictEqual(deleted.length, 1);
        assert.strictEqual(deleted[0].permissionId, 'resolved-permission');

        let deleteCalled = false;
        const absent = await revokeSpreadsheetPermission({
            ownerUserId: 'owner-adapter',
            spreadsheetId: 'sheet-adapter',
            memberEmail: 'absent@example.invalid',
            driveClient: {
                permissions: {
                    list: async () => ({ data: { permissions: [] } }),
                    delete: async () => { deleteCalled = true; }
                }
            }
        });
        assert.strictEqual(absent, true);
        assert.strictEqual(deleteCalled, false);

        const missingFile = await revokeSpreadsheetPermission({
            ownerUserId: 'owner-adapter',
            spreadsheetId: 'missing-sheet-adapter',
            memberEmail: 'member@example.invalid',
            driveClient: {
                permissions: {
                    list: async () => {
                        const error = new Error('file already absent');
                        error.response = { status: 404 };
                        throw error;
                    },
                    delete: async () => { throw new Error('delete must not run'); }
                }
            }
        });
        assert.strictEqual(missingFile, true);
    });
});
