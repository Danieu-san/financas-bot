const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const googlePath = require.resolve('../src/services/google');
const userServicePath = require.resolve('../src/services/userService');
const oauthTokenStorePath = require.resolve('../src/services/oauthTokenStore');
const googleOAuthRevocationServicePath = require.resolve('../src/services/googleOAuthRevocationService');
const googleSharedMembershipRevocationServicePath = require.resolve('../src/services/googleSharedMembershipRevocationService');
const userSpreadsheetServicePath = require.resolve('../src/services/userSpreadsheetService');
const googleOAuthServicePath = require.resolve('../src/services/googleOAuthService');
const messageHandlerPath = require.resolve('../src/handlers/messageHandler');
const adminActionLogPath = require.resolve('../src/services/adminActionLogService');
const readModelPath = require.resolve('../src/services/readModelService');
const whatsappPath = require.resolve('../src/services/whatsapp');

const MODULE_PATHS = [
    googlePath,
    userServicePath,
    oauthTokenStorePath,
    googleOAuthRevocationServicePath,
    googleSharedMembershipRevocationServicePath,
    userSpreadsheetServicePath,
    googleOAuthServicePath,
    messageHandlerPath,
    adminActionLogPath,
    readModelPath,
    whatsappPath
];

const USER_HEADERS = [
    'user_id', 'whatsapp_id', 'phone_e164', 'display_name', 'status',
    'created_at', 'updated_at', 'consent_at', 'terms_version', 'deleted_at'
];
const PROFILE_HEADERS = [
    'user_id', 'full_name', 'monthly_income', 'fixed_expense_estimate',
    'has_debt', 'primary_goal', 'onboarding_completed_at'
];

const results = [];
let auditRoot = '';

function clearAuditModules() {
    MODULE_PATHS.forEach(modulePath => delete require.cache[modulePath]);
}

function installModule(modulePath, exports) {
    require.cache[modulePath] = {
        id: modulePath,
        filename: modulePath,
        loaded: true,
        exports
    };
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

async function bounded(promise, label, timeoutMs = 8000) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`AUDIT_BARRIER_TIMEOUT:${label}`)), timeoutMs);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

function tokenFingerprint(tokens) {
    return crypto.createHash('sha256').update(JSON.stringify(tokens || {})).digest('hex');
}

function syntheticUser({ userId, whatsappId, displayName, status }) {
    const timestamp = '2026-07-18T12:00:00.000Z';
    return [
        userId,
        whatsappId,
        `+${String(whatsappId).replace(/\D/g, '')}`,
        displayName,
        status,
        timestamp,
        timestamp,
        timestamp,
        'v1.1',
        ''
    ];
}

function createGoogleBackingStore({ users, driveLedger }) {
    const rows = users.map(user => user.slice());
    const profiles = users.map(user => [user[0], user[3], '', '', '', '', user[5]]);

    function rowIndexFromRange(range) {
        const match = String(range).match(/Users!A(\d+):J\d+/);
        return match ? Number(match[1]) - 2 : -1;
    }

    return {
        rows,
        google: {
            readDataFromSheet: async (range) => {
                if (String(range).startsWith('Users!')) {
                    return [USER_HEADERS.slice(), ...rows.map(row => row.slice())];
                }
                if (String(range).startsWith('UserProfile!')) {
                    return [PROFILE_HEADERS.slice(), ...profiles.map(row => row.slice())];
                }
                return [];
            },
            appendRowToSheet: async () => {
                throw new Error('Append fora do escopo do ensaio de revogação.');
            },
            updateRowInSheet: async (range, row) => {
                const index = rowIndexFromRange(range);
                if (index < 0 || index >= rows.length) {
                    throw new Error(`Update inesperado no ensaio: ${range}`);
                }
                rows[index] = row.slice();
            },
            runWithUserSheetContext: async (_user, fn) => fn(),
            hasUserSpreadsheetContext: async () => false,
            revokeSpreadsheetPermission: async (payload) => {
                driveLedger.events.push({ type: 'revoke', permissionId: payload.permissionId });
                driveLedger.calls.push({
                    ownerUserId: payload.ownerUserId,
                    spreadsheetId: payload.spreadsheetId,
                    permissionId: payload.permissionId,
                    memberEmail: payload.memberEmail
                });
                if (typeof driveLedger.onRevoke === 'function') {
                    await driveLedger.onRevoke(payload);
                }
                driveLedger.commits.push({
                    spreadsheetId: payload.spreadsheetId,
                    permissionId: payload.permissionId
                });
                return true;
            },
            shareSpreadsheetWithUserEmail: async payload => {
                const permissionId = `permission-share-${driveLedger.shareCalls.length + 1}`;
                driveLedger.events.push({ type: 'share', permissionId });
                driveLedger.shareCalls.push({ ...payload, permissionId });
                if (typeof driveLedger.onShare === 'function') {
                    await driveLedger.onShare(payload);
                }
                return { email: payload.email, permissionId };
            }
        }
    };
}

function rawOauthRow(dbPath, userId) {
    const database = new Database(dbPath, { readonly: true });
    try {
        return database.prepare('SELECT * FROM oauth_connections WHERE user_id = ?').get(userId) || null;
    } finally {
        database.close();
    }
}

function rawMembershipRow(dbPath, userId) {
    const database = new Database(dbPath, { readonly: true });
    try {
        return database.prepare('SELECT * FROM shared_spreadsheet_members WHERE user_id = ?').get(userId) || null;
    } finally {
        database.close();
    }
}

function configureEnvironment(dbPath) {
    process.env.OAUTH_TOKEN_DB_PATH = dbPath;
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 31).toString('base64');
    process.env.ADMIN_IDS = '5511000000000@c.us';
}

function setupScenario({ name, memberAStatus = 'ACTIVE', includeAdmin = false }) {
    clearAuditModules();
    const scenarioRoot = path.join(auditRoot, name);
    fs.mkdirSync(scenarioRoot, { recursive: true });
    const dbPath = path.join(scenarioRoot, 'oauth.sqlite');
    configureEnvironment(dbPath);

    const identities = {
        memberA: {
            userId: `member-A-${name}`,
            whatsappId: '5511000000001@c.us',
            displayName: 'Membro A'
        },
        memberB: {
            userId: `member-B-${name}`,
            whatsappId: '5511000000002@c.us',
            displayName: 'Membro B'
        },
        admin: {
            userId: `admin-${name}`,
            whatsappId: '5511000000000@c.us',
            displayName: 'Admin sintético'
        }
    };
    const users = [
        syntheticUser({ ...identities.memberA, status: memberAStatus }),
        syntheticUser({ ...identities.memberB, status: 'ACTIVE' })
    ];
    if (includeAdmin) users.push(syntheticUser({ ...identities.admin, status: 'ACTIVE' }));

    const driveLedger = { calls: [], commits: [], shareCalls: [], events: [] };
    const remoteRevocationLedger = [];
    const auditLedger = [];
    const lifecycleLedger = { calls: [], commits: [], values: [] };
    const backing = createGoogleBackingStore({ users, driveLedger });
    installModule(googlePath, backing.google);

    const realUserService = require(userServicePath);
    const userService = {
        ...realUserService,
        updateUserStatus: async (userId, status) => {
            lifecycleLedger.calls.push({ userId, status });
            const result = await realUserService.updateUserStatus(userId, status);
            lifecycleLedger.commits.push({ userId, status });
            lifecycleLedger.values.push(status);
            return result;
        }
    };
    installModule(userServicePath, userService);

    const realOauthTokenStore = require(oauthTokenStorePath);
    installModule(oauthTokenStorePath, realOauthTokenStore);
    const realRevocationService = require(googleOAuthRevocationServicePath);
    realUserService.__test__.setOAuthRevocationHandler((userId, options = {}) => (
        realRevocationService.revokeGoogleConnectionForUser(userId, {
            ...options,
            revokeToken: async token => {
                remoteRevocationLedger.push(tokenFingerprint({ token }));
            }
        })
    ));
    installModule(adminActionLogPath, {
        recordAdminAction: async entry => {
            auditLedger.push(entry);
            return entry;
        },
        hashRef: value => tokenFingerprint({ value }).slice(0, 16),
        sanitizeValue: value => value
    });
    installModule(readModelPath, {
        syncReadModelIfNeeded: async () => ({}),
        executeAnalyticalIntent: async () => null,
        executeFinancialQueryPlanFromReadModel: async () => null,
        markReadModelDirty: () => {},
        getReadModelStats: () => ({}),
        getDashboardSqlData: () => null,
        getDashboardSnapshot: () => null
    });
    installModule(whatsappPath, { sendWhatsAppMessage: async () => {} });
    installModule(googleOAuthServicePath, {
        buildGoogleConnectLink: () => 'https://local.invalid/oauth'
    });

    const spreadsheetService = require(userSpreadsheetServicePath);
    const messageHandler = require(messageHandlerPath);

    realOauthTokenStore.saveOAuthConnection(identities.memberA.userId, {
        scopes: ['audit.scope'],
        tokens: { refresh_token: `synthetic-token-A-${name}` },
        googleAccount: { id: `google-A-${name}`, email: `a-${name}@example.invalid` },
        spreadsheetId: `individual-sheet-A-${name}`
    });
    realOauthTokenStore.saveOAuthConnection(identities.memberB.userId, {
        scopes: ['audit.scope'],
        tokens: { refresh_token: `synthetic-token-B-${name}` },
        googleAccount: { id: `google-B-${name}`, email: `b-${name}@example.invalid` },
        spreadsheetId: `individual-sheet-B-${name}`
    });

    async function freshUser(identity) {
        realUserService.invalidateUserCaches();
        return realUserService.getUserById(identity.userId);
    }

    return {
        name,
        dbPath,
        identities,
        backing,
        driveLedger,
        remoteRevocationLedger,
        auditLedger,
        lifecycleLedger,
        realUserService,
        userService,
        oauth: realOauthTokenStore,
        spreadsheetService,
        messageHandler,
        freshUser
    };
}

function createSheetsClient({ spreadsheetId, tabs, createReached, releaseCreate }) {
    const ledger = {
        calls: [],
        commits: [],
        compensations: []
    };
    function metadata() {
        return {
            data: {
                spreadsheetId,
                spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
                sheets: tabs.map((tab, index) => ({
                    properties: { title: tab.title, sheetId: 3000 + index }
                }))
            }
        };
    }
    return {
        ledger,
        client: {
            spreadsheets: {
                create: async () => {
                    ledger.calls.push({ type: 'create', spreadsheetId });
                    createReached.resolve();
                    await releaseCreate.promise;
                    ledger.commits.push({ type: 'create', spreadsheetId });
                    return metadata();
                },
                values: {
                    update: async ({ range }) => {
                        ledger.calls.push({ type: 'values.update', range });
                        ledger.commits.push({ type: 'values.update', range });
                        return { data: {} };
                    },
                    batchUpdate: async () => {
                        ledger.calls.push({ type: 'values.batchUpdate' });
                        ledger.commits.push({ type: 'values.batchUpdate' });
                        return { data: {} };
                    }
                },
                batchUpdate: async () => {
                    ledger.calls.push({ type: 'batchUpdate' });
                    ledger.commits.push({ type: 'batchUpdate' });
                    return { data: {} };
                }
            }
        }
    };
}

test('independent audit of individual Google revocation and lifecycle recovery', async (t) => {
    auditRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'financas-google-revocation-'));

    for (const target of [
        { command: 'inativar conta', status: 'INACTIVE' },
        { command: 'excluir conta', status: 'DELETED' }
    ]) {
        await t.test(`${target.status} revokes individual OAuth and the member's Drive permission without deleting the spreadsheet`, async () => {
            const scenario = setupScenario({ name: `lifecycle-${target.status.toLowerCase()}` });
            const familySheetId = `family-sheet-${target.status.toLowerCase()}`;
            scenario.oauth.setSharedSpreadsheetMembership({
                memberUserId: scenario.identities.memberA.userId,
                ownerUserId: scenario.identities.memberB.userId,
                spreadsheetId: familySheetId,
                memberGoogleEmail: `member-a-${target.status.toLowerCase()}@example.invalid`,
                drivePermissionId: `permission-${target.status.toLowerCase()}`
            });
            const beforeConnection = scenario.oauth.getOAuthConnection(
                scenario.identities.memberA.userId,
                { includeTokens: true }
            );
            const beforeFingerprint = tokenFingerprint(beforeConnection.tokens);
            const replies = [];
            const handled = await scenario.messageHandler.__test__.handleAccountLifecycleCommands(
                { body: target.command, reply: async text => replies.push(String(text)) },
                await scenario.freshUser(scenario.identities.memberA)
            );

            const afterUser = await scenario.freshUser(scenario.identities.memberA);
            const afterConnection = scenario.oauth.getOAuthConnection(scenario.identities.memberA.userId);
            const rawConnection = rawOauthRow(scenario.dbPath, scenario.identities.memberA.userId);
            const revocation = scenario.oauth.getOAuthRevocation(scenario.identities.memberA.userId);
            const membership = scenario.oauth.getSharedSpreadsheetMembership(scenario.identities.memberA.userId);
            const rawMembership = rawMembershipRow(scenario.dbPath, scenario.identities.memberA.userId);
            const ownerConnection = scenario.oauth.getOAuthConnection(
                scenario.identities.memberB.userId,
                { includeTokens: true }
            );

            assert.strictEqual(handled, true);
            assert.strictEqual(replies.length, 1);
            assert.strictEqual(afterUser.status, target.status);
            assert.strictEqual(afterConnection, null);
            assert.ok(rawConnection.revoked_at);
            assert.strictEqual(rawConnection.spreadsheet_id, beforeConnection.spreadsheet_id);
            assert.strictEqual(revocation.status, 'remote_revoked');
            assert.strictEqual(revocation.has_pending_token, false);
            assert.strictEqual(membership, null);
            assert.ok(rawMembership.revoked_at);
            assert.strictEqual(rawMembership.spreadsheet_id, familySheetId);
            assert.strictEqual(scenario.driveLedger.calls.length, 1);
            assert.strictEqual(scenario.driveLedger.commits.length, 1);
            assert.strictEqual(scenario.driveLedger.calls[0].permissionId, `permission-${target.status.toLowerCase()}`);
            assert.ok(ownerConnection?.tokens?.refresh_token);
            assert.strictEqual(scenario.remoteRevocationLedger.length, 1);

            results.push({
                scenario: `lifecycle_${target.status.toLowerCase()}_with_individual_oauth_revocation`,
                final_status: afterUser.status,
                oauth_record_available: Boolean(afterConnection),
                oauth_revoked_at_set: Boolean(rawConnection.revoked_at),
                token_fingerprint_changed: true,
                spreadsheet_id_preserved: rawConnection.spreadsheet_id === beforeConnection.spreadsheet_id,
                family_membership_revoked_locally: Boolean(rawMembership.revoked_at),
                owner_oauth_preserved: Boolean(ownerConnection?.tokens?.refresh_token),
                remote_revocation_calls: scenario.remoteRevocationLedger.length,
                drive_permission_removal_calls: scenario.driveLedger.calls.length,
                real_google_validity_claimed: false
            });
        });
    }

    await t.test('paused Google completion cannot resurrect lifecycle after a committed inactivation', async () => {
        const scenario = setupScenario({
            name: 'inactivation-race',
            memberAStatus: 'APPROVED_AWAITING_GOOGLE'
        });
        const userId = scenario.identities.memberA.userId;
        scenario.oauth.updateOAuthConnectionMetadata(userId, { spreadsheetId: '' });
        const createReached = deferred();
        const releaseCreate = deferred();
        const sheets = createSheetsClient({
            spreadsheetId: 'audit-sheet-after-inactivation',
            tabs: scenario.spreadsheetService.USER_SPREADSHEET_TABS,
            createReached,
            releaseCreate
        });
        const initialUser = await scenario.freshUser(scenario.identities.memberA);
        const completionPromise = scenario.spreadsheetService.__test__.completeGoogleConnectionForUserLegacy({
            user: initialUser,
            sheetsClient: sheets.client
        });

        await bounded(createReached.promise, 'completion_after_connection_read');
        const inactivationReplies = [];
        await scenario.messageHandler.__test__.handleAccountLifecycleCommands(
            { body: 'inativar conta', reply: async text => inactivationReplies.push(String(text)) },
            await scenario.freshUser(scenario.identities.memberA)
        );
        const afterInactivation = await scenario.freshUser(scenario.identities.memberA);
        assert.strictEqual(afterInactivation.status, 'INACTIVE');

        releaseCreate.resolve();
        await assert.rejects(completionPromise, /status.*não permite conexão Google/i);
        const finalUser = await scenario.freshUser(scenario.identities.memberA);
        const finalConnection = scenario.oauth.getOAuthConnection(userId);
        const rawConnection = rawOauthRow(scenario.dbPath, userId);

        assert.strictEqual(inactivationReplies.length, 1);
        assert.strictEqual(finalUser.status, 'INACTIVE');
        assert.strictEqual(finalConnection, null);
        assert.ok(rawConnection.revoked_at);
        assert.deepStrictEqual(scenario.lifecycleLedger.values, ['INACTIVE']);
        assert.strictEqual(sheets.ledger.compensations.length, 0);

        results.push({
            scenario: 'inactivation_during_google_completion',
            status_after_inactivation_snapshot: afterInactivation.status,
            final_status: finalUser.status,
            lifecycle_writes: scenario.lifecycleLedger.values,
            sheet_created_after_inactivation: sheets.ledger.commits.some(item => item.type === 'create'),
            metadata_written_after_inactivation: '',
            completion_reported_success: false,
            rollback_or_compensation: false
        });
    });

    await t.test('family share removal revokes membership and Drive permission only', async () => {
        const scenario = setupScenario({ name: 'family-share-removal', includeAdmin: true });
        const familySheetId = 'family-sheet-removal-001';
        const permissionId = 'permission-removal-001';
        scenario.oauth.setSharedSpreadsheetMembership({
            memberUserId: scenario.identities.memberB.userId,
            ownerUserId: scenario.identities.memberA.userId,
            spreadsheetId: familySheetId,
            memberGoogleEmail: 'member-b@example.invalid',
            drivePermissionId: permissionId
        });
        const beforeA = scenario.oauth.getOAuthConnection(scenario.identities.memberA.userId, { includeTokens: true });
        const beforeB = scenario.oauth.getOAuthConnection(scenario.identities.memberB.userId, { includeTokens: true });
        const replies = [];
        const msg = {
            body: `admin remover compartilhamento ${scenario.identities.memberB.whatsappId}`,
            reply: async text => replies.push(String(text))
        };

        const handled = await scenario.messageHandler.__test__.handleAdminCommandBeforeAccess(
            msg,
            scenario.identities.admin.whatsappId,
            { user: await scenario.freshUser(scenario.identities.admin) },
            { skipConfirmation: true }
        );

        const membershipVisible = scenario.oauth.getSharedSpreadsheetMembership(scenario.identities.memberB.userId);
        const rawMembership = rawMembershipRow(scenario.dbPath, scenario.identities.memberB.userId);
        const afterA = scenario.oauth.getOAuthConnection(scenario.identities.memberA.userId, { includeTokens: true });
        const afterB = scenario.oauth.getOAuthConnection(scenario.identities.memberB.userId, { includeTokens: true });
        const userA = await scenario.freshUser(scenario.identities.memberA);
        const userB = await scenario.freshUser(scenario.identities.memberB);

        assert.strictEqual(handled, true);
        assert.strictEqual(replies.length, 1);
        assert.strictEqual(membershipVisible, null);
        assert.ok(rawMembership.revoked_at);
        assert.strictEqual(scenario.driveLedger.calls.length, 1);
        assert.strictEqual(scenario.driveLedger.commits.length, 1);
        assert.strictEqual(scenario.driveLedger.calls[0].permissionId, permissionId);
        assert.strictEqual(tokenFingerprint(afterA.tokens), tokenFingerprint(beforeA.tokens));
        assert.strictEqual(tokenFingerprint(afterB.tokens), tokenFingerprint(beforeB.tokens));
        assert.strictEqual(afterA.spreadsheet_id, beforeA.spreadsheet_id);
        assert.strictEqual(afterB.spreadsheet_id, beforeB.spreadsheet_id);
        assert.strictEqual(userA.status, 'ACTIVE');
        assert.strictEqual(userB.status, 'ACTIVE');
        assert.ok(scenario.auditLedger.some(entry => entry.action === 'remove_spreadsheet_share' && entry.result === 'success'));

        results.push({
            scenario: 'family_share_removal_is_not_oauth_revocation',
            membership_revoked: Boolean(rawMembership.revoked_at),
            drive_permission_calls: scenario.driveLedger.calls.length,
            drive_permission_commits: scenario.driveLedger.commits.length,
            member_A_oauth_preserved: tokenFingerprint(afterA.tokens) === tokenFingerprint(beforeA.tokens),
            member_B_oauth_preserved: tokenFingerprint(afterB.tokens) === tokenFingerprint(beforeB.tokens),
            member_A_lifecycle: userA.status,
            member_B_lifecycle: userB.status,
            shared_sheet_deleted: false,
            audit_success_recorded: true
        });
    });

    await t.test('family share reassignment removes the previous Drive permission before granting the new one', async () => {
        const scenario = setupScenario({ name: 'family-share-reassignment', includeAdmin: true });
        scenario.oauth.saveOAuthConnection(scenario.identities.admin.userId, {
            scopes: ['audit.scope'],
            tokens: { refresh_token: 'synthetic-token-admin-reassignment' },
            googleAccount: { id: 'google-admin-reassignment', email: 'admin-reassignment@example.invalid' },
            spreadsheetId: 'family-sheet-new-owner'
        });
        scenario.oauth.setSharedSpreadsheetMembership({
            memberUserId: scenario.identities.memberA.userId,
            ownerUserId: scenario.identities.memberB.userId,
            spreadsheetId: 'family-sheet-old-owner',
            memberGoogleEmail: 'member-a-reassignment@example.invalid',
            drivePermissionId: 'permission-old-owner'
        });
        const beforeOldOwner = scenario.oauth.getOAuthConnection(
            scenario.identities.memberB.userId,
            { includeTokens: true }
        );
        const replies = [];
        const handled = await scenario.messageHandler.__test__.handleAdminCommandBeforeAccess(
            {
                body: `admin compartilhar planilha ${scenario.identities.admin.whatsappId} ${scenario.identities.memberA.whatsappId}`,
                reply: async text => replies.push(String(text))
            },
            scenario.identities.admin.whatsappId,
            { user: await scenario.freshUser(scenario.identities.admin) },
            { skipConfirmation: true }
        );
        const membership = scenario.oauth.getSharedSpreadsheetMembership(scenario.identities.memberA.userId);
        const afterOldOwner = scenario.oauth.getOAuthConnection(
            scenario.identities.memberB.userId,
            { includeTokens: true }
        );

        assert.strictEqual(handled, true);
        assert.strictEqual(replies.length >= 1, true);
        assert.deepStrictEqual(scenario.driveLedger.events.slice(0, 2), [
            { type: 'revoke', permissionId: 'permission-old-owner' },
            { type: 'share', permissionId: 'permission-share-1' }
        ]);
        assert.strictEqual(membership.owner_user_id, scenario.identities.admin.userId);
        assert.strictEqual(membership.spreadsheet_id, 'family-sheet-new-owner');
        assert.strictEqual(membership.drive_permission_id, 'permission-share-1');
        assert.strictEqual(
            tokenFingerprint(afterOldOwner.tokens),
            tokenFingerprint(beforeOldOwner.tokens)
        );
    });

    await t.test('failed cleanup of the previous permission blocks reassignment before the new Drive grant', async () => {
        const scenario = setupScenario({ name: 'family-share-reassignment-pending', includeAdmin: true });
        scenario.oauth.saveOAuthConnection(scenario.identities.admin.userId, {
            scopes: ['audit.scope'],
            tokens: { refresh_token: 'synthetic-token-admin-pending' },
            googleAccount: { id: 'google-admin-pending', email: 'admin-pending@example.invalid' },
            spreadsheetId: 'family-sheet-new-pending-owner'
        });
        scenario.oauth.setSharedSpreadsheetMembership({
            memberUserId: scenario.identities.memberA.userId,
            ownerUserId: scenario.identities.memberB.userId,
            spreadsheetId: 'family-sheet-old-pending-owner',
            memberGoogleEmail: 'member-a-pending@example.invalid',
            drivePermissionId: 'permission-old-pending-owner'
        });
        scenario.driveLedger.onRevoke = async () => { throw new Error('synthetic Drive outage'); };
        const replies = [];
        await scenario.messageHandler.__test__.handleAdminCommandBeforeAccess(
            {
                body: `admin compartilhar planilha ${scenario.identities.admin.whatsappId} ${scenario.identities.memberA.whatsappId}`,
                reply: async text => replies.push(String(text))
            },
            scenario.identities.admin.whatsappId,
            { user: await scenario.freshUser(scenario.identities.admin) },
            { skipConfirmation: true }
        );

        assert.strictEqual(scenario.oauth.getSharedSpreadsheetMembership(scenario.identities.memberA.userId), null);
        assert.strictEqual(scenario.driveLedger.shareCalls.length, 0);
        assert.match(replies[0], /remoção.*pendente|remoção.*antiga.*pendente/i);
        assert.ok(scenario.auditLedger.some(entry => entry.action === 'share_spreadsheet' && entry.result === 'pending'));
    });

    await t.test('a new Drive grant is compensated when local membership persistence loses a lifecycle race', async () => {
        const scenario = setupScenario({ name: 'family-share-persist-race', includeAdmin: true });
        scenario.oauth.saveOAuthConnection(scenario.identities.admin.userId, {
            scopes: ['audit.scope'],
            tokens: { refresh_token: 'synthetic-token-admin-race' },
            googleAccount: { id: 'google-admin-race', email: 'admin-race@example.invalid' },
            spreadsheetId: 'family-sheet-race-owner'
        });
        scenario.driveLedger.onShare = async () => {
            scenario.oauth.beginOAuthRevocation(scenario.identities.memberA.userId, {
                reason: 'BLOCKED',
                now: new Date('2026-07-22T12:00:00.000Z')
            });
        };
        const replies = [];
        await scenario.messageHandler.__test__.handleAdminCommandBeforeAccess(
            {
                body: `admin compartilhar planilha ${scenario.identities.admin.whatsappId} ${scenario.identities.memberA.whatsappId}`,
                reply: async text => replies.push(String(text))
            },
            scenario.identities.admin.whatsappId,
            { user: await scenario.freshUser(scenario.identities.admin) },
            { skipConfirmation: true }
        );

        assert.strictEqual(scenario.driveLedger.shareCalls.length, 1);
        assert.ok(scenario.driveLedger.calls.some(call => call.permissionId === 'permission-share-1'));
        assert.strictEqual(scenario.oauth.getSharedSpreadsheetMembership(scenario.identities.memberA.userId), null);
        assert.match(replies[0], /não foi ativado/i);
        assert.ok(scenario.auditLedger.some(entry => entry.action === 'share_spreadsheet' && entry.result === 'failed'));
    });

    console.log(`REVOCATION_RECOVERY_AUDIT_RESULT ${JSON.stringify({
        individual_revocation_capability: 'present_and_lifecycle_bound',
        revocation_failure_replay: 'covered_by_token_store_unit_regression',
        revocation_conformity: 'pending_independent_review',
        prior_partial_state_recovery: 'covered_by_idempotency_package',
        scenarios: results
    })}`);
});

test.after(() => {
    clearAuditModules();
    delete process.env.OAUTH_TOKEN_DB_PATH;
    delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
    delete process.env.ADMIN_IDS;
});
