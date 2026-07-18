const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { AsyncLocalStorage } = require('node:async_hooks');

const googlePath = require.resolve('../src/services/google');
const userServicePath = require.resolve('../src/services/userService');
const oauthTokenStorePath = require.resolve('../src/services/oauthTokenStore');
const userSpreadsheetServicePath = require.resolve('../src/services/userSpreadsheetService');
const googleOAuthServicePath = require.resolve('../src/services/googleOAuthService');
const dashboardServerPath = require.resolve('../src/services/dashboardServer');
const readModelPath = require.resolve('../src/services/readModelService');
const whatsappPath = require.resolve('../src/services/whatsapp');

const MODULE_PATHS = [
    googlePath,
    userServicePath,
    oauthTokenStorePath,
    userSpreadsheetServicePath,
    googleOAuthServicePath,
    dashboardServerPath,
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

const operationContext = new AsyncLocalStorage();
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

function createTrace() {
    const events = [];
    let sequence = 0;
    return {
        events,
        push(event, details = {}) {
            events.push({ sequence: ++sequence, event, ...details });
        },
        significant() {
            return events
                .filter(item => !item.event.startsWith('sheet.values.') && item.event !== 'sheet.format.commit')
                .map(item => `${item.event}:${item.operationId || '-'}`);
        }
    };
}

function createConcurrencyControls() {
    const controls = {
        enabled: true,
        createArrivals: [],
        metadataArrivals: [],
        lifecycleArrivals: [],
        bothCreates: deferred(),
        bothMetadata: deferred(),
        bothLifecycle: deferred(),
        releaseCreate: new Map(),
        releaseMetadata: new Map(),
        releaseLifecycle: new Map(),
        metadataCommitted: new Map(),
        lifecycleCommitted: new Map()
    };
    for (const operationId of ['race-A', 'race-B']) {
        controls.releaseCreate.set(operationId, deferred());
        controls.releaseMetadata.set(operationId, deferred());
        controls.releaseLifecycle.set(operationId, deferred());
        controls.metadataCommitted.set(operationId, deferred());
        controls.lifecycleCommitted.set(operationId, deferred());
    }
    return controls;
}

function markArrival(list, operationId, target) {
    list.push(operationId);
    if (list.length === 2) target.resolve();
}

function createUserBackingStore({ userId, status }) {
    const createdAt = '2026-07-18T12:00:00.000Z';
    const store = {
        userRow: [
            userId,
            '5511999999999@c.us',
            '+5511999999999',
            'Usuário Auditoria',
            status,
            createdAt,
            createdAt,
            createdAt,
            'v1.1',
            ''
        ],
        profileRow: [userId, 'Usuário Auditoria', '', '', '', '', createdAt]
    };
    return {
        store,
        google: {
            readDataFromSheet: async (range) => {
                if (String(range).startsWith('Users!')) {
                    return [USER_HEADERS.slice(), store.userRow.slice()];
                }
                if (String(range).startsWith('UserProfile!')) {
                    return [PROFILE_HEADERS.slice(), store.profileRow.slice()];
                }
                return [];
            },
            appendRowToSheet: async () => {
                throw new Error('Append fora do escopo do ensaio de idempotência.');
            },
            updateRowInSheet: async (range, row) => {
                if (!String(range).startsWith('Users!')) {
                    throw new Error(`Escrita inesperada no ensaio: ${range}`);
                }
                store.userRow = row.slice();
            }
        }
    };
}

function createExternalLedger({
    tabs,
    trace,
    concurrency,
    seededSheets = [],
    seededTemplateApplications = {},
    sheetIdForOperation
}) {
    const ledger = {
        calls: [],
        committed_operations: [],
        compensated_operations: [],
        created_sheet_ids: seededSheets.slice(),
        template_applications_by_sheet: { ...seededTemplateApplications }
    };
    let sequence = 0;

    function begin(type, details = {}) {
        const operationId = operationContext.getStore() || 'unscoped';
        const ledgerId = `${operationId}:${type}:${++sequence}`;
        ledger.calls.push({ ledgerId, operationId, type, ...details });
        return { ledgerId, operationId };
    }

    function commit(entry, type, details = {}) {
        ledger.committed_operations.push({ ...entry, type, ...details });
    }

    function spreadsheetMetadata(spreadsheetId) {
        return {
            data: {
                spreadsheetId,
                spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
                sheets: tabs.map((tab, index) => ({
                    properties: { title: tab.title, sheetId: 2000 + index }
                }))
            }
        };
    }

    const client = {
        spreadsheets: {
            create: async () => {
                const entry = begin('create');
                const spreadsheetId = sheetIdForOperation(entry.operationId, ledger.created_sheet_ids.length);
                trace.push('sheet.create.call', { operationId: entry.operationId, spreadsheetId });
                if (concurrency?.enabled) {
                    markArrival(concurrency.createArrivals, entry.operationId, concurrency.bothCreates);
                    await concurrency.releaseCreate.get(entry.operationId).promise;
                }
                ledger.created_sheet_ids.push(spreadsheetId);
                commit(entry, 'create', { spreadsheetId });
                trace.push('sheet.create.commit', { operationId: entry.operationId, spreadsheetId });
                return spreadsheetMetadata(spreadsheetId);
            },
            get: async ({ spreadsheetId }) => {
                const entry = begin('get', { spreadsheetId });
                trace.push('sheet.get.return', { operationId: entry.operationId, spreadsheetId });
                return spreadsheetMetadata(spreadsheetId);
            },
            values: {
                update: async ({ spreadsheetId, range }) => {
                    const entry = begin('values.update', { spreadsheetId, range });
                    commit(entry, 'values.update', { spreadsheetId, range });
                    return { data: {} };
                },
                batchUpdate: async ({ spreadsheetId }) => {
                    const entry = begin('values.batchUpdate', { spreadsheetId });
                    commit(entry, 'values.batchUpdate', { spreadsheetId });
                    ledger.template_applications_by_sheet[spreadsheetId] =
                        Number(ledger.template_applications_by_sheet[spreadsheetId] || 0) + 1;
                    trace.push('sheet.template.commit', { operationId: entry.operationId, spreadsheetId });
                    return { data: {} };
                }
            },
            batchUpdate: async ({ spreadsheetId }) => {
                const entry = begin('batchUpdate', { spreadsheetId });
                commit(entry, 'batchUpdate', { spreadsheetId });
                trace.push('sheet.format.commit', { operationId: entry.operationId, spreadsheetId });
                return { data: {} };
            }
        }
    };

    return { client, ledger };
}

function configureEnvironment(dbPath) {
    process.env.OAUTH_TOKEN_DB_PATH = dbPath;
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 29).toString('base64');
    process.env.GOOGLE_OAUTH_STATE_SECRET = 'idempotency-audit-state-secret-2026';
    process.env.DASHBOARD_ENABLED = 'true';
    process.env.DASHBOARD_HOST = '127.0.0.1';
    process.env.DASHBOARD_PORT = '0';
}

function tokenFingerprint(tokens) {
    return crypto.createHash('sha256').update(JSON.stringify(tokens || {})).digest('hex');
}

function setupScenario({
    name,
    initialStatus = 'APPROVED_AWAITING_GOOGLE',
    seedConnection = true,
    seedSpreadsheetId = '',
    seededSheets = [],
    seededTemplateApplications = {},
    sheetIdForOperation,
    concurrent = false
}) {
    clearAuditModules();
    const scenarioRoot = path.join(auditRoot, name);
    fs.mkdirSync(scenarioRoot, { recursive: true });
    configureEnvironment(path.join(scenarioRoot, 'oauth.sqlite'));

    const trace = createTrace();
    const concurrency = concurrent ? createConcurrencyControls() : null;
    const userId = `idempotency-user-${name}`;
    const backing = createUserBackingStore({ userId, status: initialStatus });
    installModule(googlePath, backing.google);

    const realUserService = require(userServicePath);
    const lifecycleLedger = { calls: [], commits: [], values_written: [] };
    const userService = {
        ...realUserService,
        updateUserStatus: async (targetUserId, targetStatus) => {
            const operationId = operationContext.getStore() || 'unscoped';
            lifecycleLedger.calls.push({
                operationId,
                targetStatus,
                observedAtCall: backing.store.userRow[4]
            });
            trace.push('lifecycle.call', { operationId, targetStatus });
            if (concurrency?.enabled) {
                markArrival(concurrency.lifecycleArrivals, operationId, concurrency.bothLifecycle);
                await concurrency.releaseLifecycle.get(operationId).promise;
            }
            const observedBeforeDelegate = backing.store.userRow[4];
            const result = await realUserService.updateUserStatus(targetUserId, targetStatus);
            lifecycleLedger.commits.push({ operationId, observedBeforeDelegate, targetStatus });
            lifecycleLedger.values_written.push(targetStatus);
            trace.push('lifecycle.commit', { operationId, targetStatus });
            concurrency?.lifecycleCommitted.get(operationId)?.resolve();
            return result;
        }
    };
    installModule(userServicePath, userService);

    const realOauthTokenStore = require(oauthTokenStorePath);
    const metadataLedger = { calls: [], commits: [], values_written: [] };
    const oauthLedger = { saves: [] };
    const oauthTokenStore = {
        ...realOauthTokenStore,
        saveOAuthConnection: (targetUserId, payload) => {
            const operationId = operationContext.getStore() || 'unscoped';
            oauthLedger.saves.push({
                operationId,
                googleUserId: payload?.googleAccount?.id || '',
                tokenFingerprint: tokenFingerprint(payload?.tokens)
            });
            trace.push('oauth.save.call', { operationId });
            const result = realOauthTokenStore.saveOAuthConnection(targetUserId, payload);
            trace.push('oauth.save.commit', { operationId });
            return result;
        },
        getOAuthConnection: (targetUserId, options) => {
            const operationId = operationContext.getStore() || 'unscoped';
            const result = realOauthTokenStore.getOAuthConnection(targetUserId, options);
            trace.push('connection.get', {
                operationId,
                spreadsheetId: result?.spreadsheet_id || ''
            });
            return result;
        },
        updateOAuthConnectionMetadata: async (targetUserId, patch) => {
            const operationId = operationContext.getStore() || 'unscoped';
            metadataLedger.calls.push({ operationId, spreadsheetId: patch?.spreadsheetId || '' });
            trace.push('metadata.call', { operationId, spreadsheetId: patch?.spreadsheetId || '' });
            if (concurrency?.enabled) {
                markArrival(concurrency.metadataArrivals, operationId, concurrency.bothMetadata);
                await concurrency.releaseMetadata.get(operationId).promise;
            }
            const result = realOauthTokenStore.updateOAuthConnectionMetadata(targetUserId, patch);
            metadataLedger.commits.push({ operationId, spreadsheetId: patch?.spreadsheetId || '' });
            metadataLedger.values_written.push(patch?.spreadsheetId || '');
            trace.push('metadata.commit', { operationId, spreadsheetId: patch?.spreadsheetId || '' });
            concurrency?.metadataCommitted.get(operationId)?.resolve();
            return result;
        }
    };
    installModule(oauthTokenStorePath, oauthTokenStore);

    const realSpreadsheetService = require(userSpreadsheetServicePath);
    let callbackSequence = 0;
    async function runCompletion(operationId, payload) {
        return operationContext.run(operationId, async () => {
            trace.push('complete.enter', { operationId });
            try {
                const result = await realSpreadsheetService.completeGoogleConnectionForUser(payload);
                trace.push('complete.return', { operationId, spreadsheetId: result.spreadsheetId });
                return result;
            } catch (error) {
                trace.push('complete.error', { operationId, error: error.message });
                throw error;
            }
        });
    }
    const oauthCompletionBoundary = (payload) => {
        const inheritedOperationId = operationContext.getStore();
        const operationId = inheritedOperationId || `callback-${++callbackSequence}`;
        return runCompletion(operationId, payload);
    };
    installModule(userSpreadsheetServicePath, {
        ...realSpreadsheetService,
        completeGoogleConnectionForUser: oauthCompletionBoundary
    });

    const googleOAuthService = require(googleOAuthServicePath);
    const external = createExternalLedger({
        tabs: realSpreadsheetService.USER_SPREADSHEET_TABS,
        trace,
        concurrency,
        seededSheets,
        seededTemplateApplications,
        sheetIdForOperation
    });

    if (seedConnection) {
        realOauthTokenStore.saveOAuthConnection(userId, {
            scopes: ['audit.scope'],
            tokens: { refresh_token: `seed-${name}` },
            googleAccount: { id: `seed-google-${name}`, email: `${name}@example.invalid` },
            spreadsheetId: seedSpreadsheetId
        });
        trace.events.splice(0);
    }

    async function freshUser() {
        realUserService.invalidateUserCaches();
        return realUserService.getUserById(userId);
    }

    return {
        name,
        userId,
        trace,
        concurrency,
        backing,
        realUserService,
        realOauthTokenStore,
        metadataLedger,
        oauthLedger,
        lifecycleLedger,
        realSpreadsheetService,
        googleOAuthService,
        sheetsClient: external.client,
        externalLedger: external.ledger,
        runCompletion,
        freshUser
    };
}

function installDashboardRoute(scenario, { oauth2Client, oauth2Api }) {
    const realCallback = scenario.googleOAuthService.completeGoogleOAuthCallback;
    let callbackNumber = 0;
    installModule(googleOAuthServicePath, {
        ...scenario.googleOAuthService,
        completeGoogleOAuthCallback: ({ code, state }) => {
            const operationId = `http-callback-${++callbackNumber}`;
            return operationContext.run(operationId, () => realCallback({
                code,
                state,
                oauth2Client,
                oauth2Api,
                sheetsClient: scenario.sheetsClient
            }));
        }
    });
    installModule(readModelPath, {
        syncReadModelIfNeeded: async () => ({}),
        getDashboardSnapshot: () => null,
        getDashboardSqlData: () => null,
        isSqliteReady: () => true,
        ALL_USERS_ID: '__ALL_USERS__'
    });
    installModule(whatsappPath, {
        sendWhatsAppMessage: async () => {
            const operationId = operationContext.getStore() || 'unscoped';
            scenario.trace.push('whatsapp.return', { operationId });
        }
    });

    delete require.cache[dashboardServerPath];
    let requestHandler;
    const originalCreateServer = http.createServer;
    http.createServer = (handler) => {
        requestHandler = handler;
        return {
            listening: true,
            listen(_port, _host, callback) {
                if (callback) callback();
                return this;
            },
            address() {
                return { port: 0 };
            },
            close(callback) {
                if (callback) callback();
            }
        };
    };
    try {
        require(dashboardServerPath).startDashboardServer();
    } finally {
        http.createServer = originalCreateServer;
    }
    return requestHandler;
}

function createResponseLedger(trace) {
    const ledger = { calls: [], delivered: [] };
    function response({ failDelivery }) {
        let currentStatus = 0;
        return {
            writeHead(statusCode) {
                currentStatus = statusCode;
                ledger.calls.push({ statusCode });
                trace.push('http.call', { statusCode });
                return this;
            },
            end() {
                if (failDelivery) {
                    trace.push('http.fail.before_delivery', { statusCode: currentStatus });
                    throw new Error('AUDIT_HTTP_FAIL_BEFORE_DELIVERY');
                }
                ledger.delivered.push({ statusCode: currentStatus });
                trace.push('http.delivered', { statusCode: currentStatus });
            }
        };
    }
    return { ledger, response };
}

test('independent audit of Google connection concurrency and idempotency', async (t) => {
    auditRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'financas-google-idempotency-'));

    await t.test('retry after orphaned sheet creates a second sheet and ignores the orphan', async () => {
        const scenario = setupScenario({
            name: 'retry-orphan',
            seededSheets: ['audit-sheet-orphan-001'],
            seededTemplateApplications: { 'audit-sheet-orphan-001': 1 },
            sheetIdForOperation: () => 'audit-sheet-orphan-002'
        });
        const result = await scenario.runCompletion('retry-orphan', {
            user: await scenario.freshUser(),
            sheetsClient: scenario.sheetsClient
        });
        const connection = scenario.realOauthTokenStore.getOAuthConnection(scenario.userId);
        const user = await scenario.freshUser();

        assert.deepStrictEqual(scenario.externalLedger.created_sheet_ids, [
            'audit-sheet-orphan-001',
            'audit-sheet-orphan-002'
        ]);
        assert.strictEqual(connection.spreadsheet_id, 'audit-sheet-orphan-002');
        assert.strictEqual(user.status, 'ACTIVE');
        assert.strictEqual(result.spreadsheetId, 'audit-sheet-orphan-002');
        assert.strictEqual(scenario.externalLedger.compensated_operations.length, 0);
        assert.strictEqual(scenario.metadataLedger.commits.length, 1);
        assert.strictEqual(scenario.lifecycleLedger.commits.length, 1);

        results.push({
            scenario: 'retry_after_orphan',
            created_sheet_ids: scenario.externalLedger.created_sheet_ids,
            final_spreadsheet_id: connection.spreadsheet_id,
            orphan_reused: false,
            orphan_compensated: false,
            metadata_commits: scenario.metadataLedger.commits.length,
            lifecycle_commits: scenario.lifecycleLedger.commits.length,
            final_status: user.status,
            trace: scenario.trace.significant()
        });
    });

    await t.test('retry after linked sheet reapplies template without creating a new sheet', async () => {
        const linkedId = 'audit-sheet-linked-001';
        const scenario = setupScenario({
            name: 'retry-linked',
            seedSpreadsheetId: linkedId,
            seededSheets: [linkedId],
            seededTemplateApplications: { [linkedId]: 1 },
            sheetIdForOperation: () => 'unexpected-new-sheet'
        });
        const result = await scenario.runCompletion('retry-linked', {
            user: await scenario.freshUser(),
            sheetsClient: scenario.sheetsClient
        });
        const connection = scenario.realOauthTokenStore.getOAuthConnection(scenario.userId);
        const user = await scenario.freshUser();
        const createCalls = scenario.externalLedger.calls.filter(call => call.type === 'create');

        assert.strictEqual(createCalls.length, 0);
        assert.deepStrictEqual(scenario.externalLedger.created_sheet_ids, [linkedId]);
        assert.strictEqual(scenario.externalLedger.template_applications_by_sheet[linkedId], 2);
        assert.strictEqual(scenario.metadataLedger.commits.length, 0);
        assert.strictEqual(scenario.lifecycleLedger.commits.length, 1);
        assert.strictEqual(connection.spreadsheet_id, linkedId);
        assert.strictEqual(result.spreadsheetId, linkedId);
        assert.strictEqual(user.status, 'ACTIVE');

        results.push({
            scenario: 'retry_after_linked_without_activation',
            create_calls: createCalls.length,
            template_applications: scenario.externalLedger.template_applications_by_sheet[linkedId],
            metadata_commits: scenario.metadataLedger.commits.length,
            lifecycle_commits: scenario.lifecycleLedger.commits.length,
            final_spreadsheet_id: connection.spreadsheet_id,
            final_status: user.status,
            trace: scenario.trace.significant()
        });
    });

    await t.test('two simultaneous conclusions create two sheets and last metadata write wins', async () => {
        const scenario = setupScenario({
            name: 'concurrent-create',
            concurrent: true,
            sheetIdForOperation: operationId => operationId === 'race-A'
                ? 'audit-sheet-race-A'
                : 'audit-sheet-race-B'
        });
        const user = await scenario.freshUser();
        const promiseA = scenario.runCompletion('race-A', { user, sheetsClient: scenario.sheetsClient });
        const promiseB = scenario.runCompletion('race-B', { user, sheetsClient: scenario.sheetsClient });

        await bounded(scenario.concurrency.bothCreates.promise, 'both_connection_reads_and_creates');
        const initialReads = scenario.trace.events.filter(event => event.event === 'connection.get');
        assert.strictEqual(initialReads.length, 2);
        assert.ok(initialReads.every(event => event.spreadsheetId === ''));

        scenario.concurrency.releaseCreate.get('race-A').resolve();
        scenario.concurrency.releaseCreate.get('race-B').resolve();
        await bounded(scenario.concurrency.bothMetadata.promise, 'both_metadata_calls');

        scenario.concurrency.releaseMetadata.get('race-A').resolve();
        await bounded(scenario.concurrency.metadataCommitted.get('race-A').promise, 'metadata_A_commit');
        scenario.concurrency.releaseMetadata.get('race-B').resolve();
        await bounded(scenario.concurrency.metadataCommitted.get('race-B').promise, 'metadata_B_commit');
        await bounded(scenario.concurrency.bothLifecycle.promise, 'both_lifecycle_calls');

        scenario.concurrency.releaseLifecycle.get('race-A').resolve();
        await bounded(scenario.concurrency.lifecycleCommitted.get('race-A').promise, 'lifecycle_A_commit');
        scenario.concurrency.releaseLifecycle.get('race-B').resolve();
        await bounded(scenario.concurrency.lifecycleCommitted.get('race-B').promise, 'lifecycle_B_commit');

        const [resultA, resultB] = await Promise.all([promiseA, promiseB]);
        const connection = scenario.realOauthTokenStore.getOAuthConnection(scenario.userId);
        const finalUser = await scenario.freshUser();

        assert.deepStrictEqual(scenario.externalLedger.created_sheet_ids, [
            'audit-sheet-race-A',
            'audit-sheet-race-B'
        ]);
        assert.deepStrictEqual(scenario.metadataLedger.values_written, [
            'audit-sheet-race-A',
            'audit-sheet-race-B'
        ]);
        assert.strictEqual(connection.spreadsheet_id, 'audit-sheet-race-B');
        assert.strictEqual(scenario.lifecycleLedger.commits.length, 2);
        assert.strictEqual(finalUser.status, 'ACTIVE');
        assert.strictEqual(resultA.spreadsheetId, 'audit-sheet-race-A');
        assert.strictEqual(resultB.spreadsheetId, 'audit-sheet-race-B');
        assert.strictEqual(scenario.externalLedger.compensated_operations.length, 0);

        results.push({
            scenario: 'two_simultaneous_conclusions',
            created_sheet_ids: scenario.externalLedger.created_sheet_ids,
            metadata_writes: scenario.metadataLedger.values_written,
            final_spreadsheet_id: connection.spreadsheet_id,
            losing_orphan_sheet_id: 'audit-sheet-race-A',
            lifecycle_commits: scenario.lifecycleLedger.commits.length,
            both_reported_success: true,
            result_A_spreadsheet_id: resultA.spreadsheetId,
            result_B_spreadsheet_id: resultB.spreadsheetId,
            compensations: scenario.externalLedger.compensated_operations.length,
            trace: scenario.trace.significant()
        });
    });

    await t.test('exact callback replay repeats OAuth save, template and lifecycle after failed delivery', async () => {
        const sheetId = 'audit-sheet-http-001';
        const scenario = setupScenario({
            name: 'callback-replay',
            seedConnection: false,
            sheetIdForOperation: () => sheetId
        });
        let tokenExchangeCount = 0;
        let accountLookupCount = 0;
        const oauth2Client = {
            getToken: async () => {
                tokenExchangeCount += 1;
                scenario.trace.push('token.exchange.return', { operationId: operationContext.getStore() });
                return {
                    tokens: {
                        refresh_token: `synthetic-refresh-v${tokenExchangeCount}`,
                        access_token: `synthetic-access-v${tokenExchangeCount}`
                    }
                };
            },
            setCredentials: () => {}
        };
        const oauth2Api = {
            userinfo: {
                get: async () => {
                    accountLookupCount += 1;
                    return {
                        data: {
                            id: `synthetic-google-v${accountLookupCount}`,
                            email: `callback-v${accountLookupCount}@example.invalid`
                        }
                    };
                }
            }
        };
        const requestHandler = installDashboardRoute(scenario, { oauth2Client, oauth2Api });
        const state = scenario.googleOAuthService.createOAuthState({ userId: scenario.userId });
        const request = {
            method: 'GET',
            url: `/oauth/google/callback?code=synthetic-code&state=${encodeURIComponent(state)}`,
            headers: { host: 'local.audit' }
        };
        const httpLedger = createResponseLedger(scenario.trace);

        let firstError;
        try {
            await requestHandler(request, httpLedger.response({ failDelivery: true }));
        } catch (error) {
            firstError = error;
        }
        assert.match(firstError?.message || '', /AUDIT_HTTP_FAIL_BEFORE_DELIVERY/);
        const firstConnection = scenario.realOauthTokenStore.getOAuthConnection(scenario.userId, { includeTokens: true });
        const firstTokenFingerprint = tokenFingerprint(firstConnection.tokens);
        assert.strictEqual(firstConnection.spreadsheet_id, sheetId);
        assert.strictEqual((await scenario.freshUser()).status, 'ACTIVE');

        await requestHandler(request, httpLedger.response({ failDelivery: false }));
        const finalConnection = scenario.realOauthTokenStore.getOAuthConnection(scenario.userId, { includeTokens: true });
        const finalTokenFingerprint = tokenFingerprint(finalConnection.tokens);
        const finalUser = await scenario.freshUser();
        const createCalls = scenario.externalLedger.calls.filter(call => call.type === 'create');

        assert.strictEqual(tokenExchangeCount, 2);
        assert.strictEqual(accountLookupCount, 2);
        assert.strictEqual(scenario.oauthLedger.saves.length, 2);
        assert.notStrictEqual(firstTokenFingerprint, finalTokenFingerprint);
        assert.strictEqual(finalConnection.google_user_id, 'synthetic-google-v2');
        assert.strictEqual(finalConnection.spreadsheet_id, sheetId);
        assert.strictEqual(createCalls.length, 1);
        assert.strictEqual(scenario.externalLedger.template_applications_by_sheet[sheetId], 2);
        assert.strictEqual(scenario.metadataLedger.commits.length, 1);
        assert.strictEqual(scenario.lifecycleLedger.commits.length, 2);
        assert.strictEqual(finalUser.status, 'ACTIVE');
        assert.strictEqual(httpLedger.ledger.delivered.length, 1);
        assert.strictEqual(httpLedger.ledger.delivered[0].statusCode, 200);

        results.push({
            scenario: 'exact_callback_replay_after_http_failure',
            same_state_reused: true,
            token_exchanges: tokenExchangeCount,
            account_lookups: accountLookupCount,
            oauth_saves: scenario.oauthLedger.saves.length,
            token_overwritten: firstTokenFingerprint !== finalTokenFingerprint,
            final_google_user_id: finalConnection.google_user_id,
            create_calls: createCalls.length,
            template_applications: scenario.externalLedger.template_applications_by_sheet[sheetId],
            metadata_commits: scenario.metadataLedger.commits.length,
            lifecycle_commits: scenario.lifecycleLedger.commits.length,
            final_spreadsheet_id: finalConnection.spreadsheet_id,
            final_status: finalUser.status,
            http_calls: httpLedger.ledger.calls.length,
            http_deliveries: httpLedger.ledger.delivered.length,
            trace: scenario.trace.significant()
        });
    });

    console.log(`IDEMPOTENCY_AUDIT_RESULT ${JSON.stringify({ scenarios: results })}`);
});

test.after(() => {
    clearAuditModules();
    delete process.env.OAUTH_TOKEN_DB_PATH;
    delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
    delete process.env.GOOGLE_OAUTH_STATE_SECRET;
    delete process.env.DASHBOARD_ENABLED;
    delete process.env.DASHBOARD_HOST;
    delete process.env.DASHBOARD_PORT;
});
