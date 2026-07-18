const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const googlePath = require.resolve('../src/services/google');
const userServicePath = require.resolve('../src/services/userService');
const oauthTokenStorePath = require.resolve('../src/services/oauthTokenStore');
const userSpreadsheetServicePath = require.resolve('../src/services/userSpreadsheetService');
const googleOAuthServicePath = require.resolve('../src/services/googleOAuthService');
const dashboardServerPath = require.resolve('../src/services/dashboardServer');
const readModelPath = require.resolve('../src/services/readModelService');
const whatsappPath = require.resolve('../src/services/whatsapp');

const USER_HEADERS = [
    'user_id',
    'whatsapp_id',
    'phone_e164',
    'display_name',
    'status',
    'created_at',
    'updated_at',
    'consent_at',
    'terms_version',
    'deleted_at'
];

const PROFILE_HEADERS = [
    'user_id',
    'full_name',
    'monthly_income',
    'fixed_expense_estimate',
    'has_debt',
    'primary_goal',
    'onboarding_completed_at'
];

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

const auditResults = [];
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

function createTrace() {
    const events = [];
    let sequence = 0;
    return {
        events,
        push(event, details = {}) {
            events.push({ sequence: ++sequence, event, ...details });
        },
        names() {
            return events.map(item => item.event);
        }
    };
}

function createUserBackingStore({ userId, status, trace, failStatusBeforeCommit = false }) {
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

    const google = {
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
            throw new Error('Escrita append fora do escopo do ensaio causal.');
        },
        updateRowInSheet: async (range, row) => {
            if (!String(range).startsWith('Users!')) {
                throw new Error(`Escrita inesperada no ensaio causal: ${range}`);
            }
            trace.push('status.call', { target: 'Users' });
            if (failStatusBeforeCommit) {
                trace.push('status.fail.before_commit', { target: 'Users' });
                throw new Error('AUDIT_STATUS_FAIL_BEFORE_COMMIT');
            }
            store.userRow = row.slice();
            trace.push('status.commit', { target: 'Users', status: row[4] });
        }
    };

    return { store, google };
}

function createSheetsClient({ spreadsheetId, tabs, trace, failCreateBeforeCommit = false }) {
    const ledger = {
        calls: [],
        committed_operations: [],
        compensated_operations: []
    };
    let operationSequence = 0;

    function begin(type, details = {}) {
        const operationId = `${type}:${++operationSequence}`;
        ledger.calls.push({ operationId, type, ...details });
        trace.push(`sheet.${type}.call`, { operationId });
        return operationId;
    }

    function commit(operationId, type, details = {}) {
        ledger.committed_operations.push({ operationId, type, ...details });
        trace.push(`sheet.${type}.commit`, { operationId });
    }

    const client = {
        spreadsheets: {
            create: async () => {
                const operationId = begin('create', { spreadsheetId });
                if (failCreateBeforeCommit) {
                    trace.push('sheet.create.fail.before_commit', { operationId });
                    throw new Error('AUDIT_SHEET_FAIL_BEFORE_COMMIT');
                }
                commit(operationId, 'create', { spreadsheetId });
                return {
                    data: {
                        spreadsheetId,
                        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
                        sheets: tabs.map((tab, index) => ({
                            properties: { title: tab.title, sheetId: 1000 + index }
                        }))
                    }
                };
            },
            values: {
                update: async (payload) => {
                    const operationId = begin('values.update', { range: payload.range });
                    commit(operationId, 'values.update', { range: payload.range });
                    return { data: {} };
                },
                batchUpdate: async () => {
                    const operationId = begin('values.batchUpdate');
                    commit(operationId, 'values.batchUpdate');
                    return { data: {} };
                }
            },
            batchUpdate: async () => {
                const operationId = begin('batchUpdate');
                commit(operationId, 'batchUpdate');
                return { data: {} };
            }
        }
    };

    return { client, ledger };
}

function configureSyntheticEnvironment(dbPath) {
    process.env.OAUTH_TOKEN_DB_PATH = dbPath;
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 23).toString('base64');
    process.env.GOOGLE_OAUTH_STATE_SECRET = 'audit-state-secret-2026-local-only';
    process.env.DASHBOARD_ENABLED = 'true';
    process.env.DASHBOARD_HOST = '127.0.0.1';
    process.env.DASHBOARD_PORT = '0';
}

function setupScenario({
    name,
    initialStatus = 'APPROVED_AWAITING_GOOGLE',
    spreadsheetId,
    failCreateBeforeCommit = false,
    failMetadataBeforeCommit = false,
    failStatusBeforeCommit = false,
    seedConnection = true
}) {
    clearAuditModules();
    const trace = createTrace();
    const scenarioRoot = path.join(auditRoot, name);
    fs.mkdirSync(scenarioRoot, { recursive: true });
    configureSyntheticEnvironment(path.join(scenarioRoot, 'oauth.sqlite'));

    const userId = `audit-user-${name}`;
    const backing = createUserBackingStore({
        userId,
        status: initialStatus,
        trace,
        failStatusBeforeCommit
    });
    installModule(googlePath, backing.google);

    const userService = require(userServicePath);
    const realOauthTokenStore = require(oauthTokenStorePath);
    const oauthTokenStore = {
        ...realOauthTokenStore,
        saveOAuthConnection: (...args) => {
            trace.push('connection.save.call');
            const result = realOauthTokenStore.saveOAuthConnection(...args);
            trace.push('connection.save.commit');
            return result;
        },
        getOAuthConnection: (...args) => {
            trace.push('connection.get');
            return realOauthTokenStore.getOAuthConnection(...args);
        },
        updateOAuthConnectionMetadata: (...args) => {
            trace.push('metadata.call');
            if (failMetadataBeforeCommit) {
                trace.push('metadata.fail.before_commit');
                throw new Error('AUDIT_METADATA_FAIL_BEFORE_COMMIT');
            }
            const result = realOauthTokenStore.updateOAuthConnectionMetadata(...args);
            trace.push('metadata.commit');
            return result;
        }
    };
    installModule(oauthTokenStorePath, oauthTokenStore);

    const realSpreadsheetService = require(userSpreadsheetServicePath);
    let completionResult = null;
    const completionBoundary = async (payload) => {
        trace.push('complete.enter');
        try {
            completionResult = await realSpreadsheetService.completeGoogleConnectionForUser(payload);
            trace.push('complete.return');
            return completionResult;
        } catch (error) {
            trace.push('complete.error', { code: error.message });
            throw error;
        }
    };
    installModule(userSpreadsheetServicePath, {
        ...realSpreadsheetService,
        completeGoogleConnectionForUser: completionBoundary
    });

    const googleOAuthService = require(googleOAuthServicePath);
    const sheets = createSheetsClient({
        spreadsheetId,
        tabs: realSpreadsheetService.USER_SPREADSHEET_TABS,
        trace,
        failCreateBeforeCommit
    });

    if (seedConnection) {
        realOauthTokenStore.saveOAuthConnection(userId, {
            scopes: ['audit.scope'],
            tokens: { refresh_token: 'synthetic-refresh-token' },
            googleAccount: { id: `google-${name}`, email: `${name}@example.invalid` }
        });
        trace.events.splice(0);
    }

    async function readFreshUser() {
        userService.invalidateUserCaches();
        return userService.getUserById(userId);
    }

    return {
        name,
        userId,
        trace,
        backing,
        userService,
        realOauthTokenStore,
        realSpreadsheetService,
        completionBoundary,
        getCompletionResult: () => completionResult,
        googleOAuthService,
        sheetsClient: sheets.client,
        sheetLedger: sheets.ledger,
        readFreshUser
    };
}

function summarizeScenario(scenario, error, extra = {}) {
    const connection = scenario.realOauthTokenStore.getOAuthConnection(scenario.userId);
    return scenario.readFreshUser().then(user => ({
        scenario: scenario.name,
        error: error?.message || '',
        sheet_calls: scenario.sheetLedger.calls.length,
        sheet_commits: scenario.sheetLedger.committed_operations.length,
        spreadsheet_create_committed: scenario.sheetLedger.committed_operations.some(op => op.type === 'create'),
        compensations: scenario.sheetLedger.compensated_operations.length,
        metadata_committed: scenario.trace.names().includes('metadata.commit'),
        status_committed: scenario.trace.names().includes('status.commit'),
        final_spreadsheet_id: connection?.spreadsheet_id || '',
        final_user_status: user?.status || '',
        trace: scenario.trace.names(),
        ...extra
    }));
}

test('independent causal audit of Google connection completion', async (t) => {
    auditRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'financas-google-causality-'));

    await t.test('sheet failure before external commit leaves metadata and status unchanged', async () => {
        const scenario = setupScenario({
            name: 'sheet-before-commit',
            spreadsheetId: 'audit-sheet-fail-000',
            failCreateBeforeCommit: true
        });
        const user = await scenario.readFreshUser();
        let caught;
        try {
            await scenario.completionBoundary({ user, sheetsClient: scenario.sheetsClient });
        } catch (error) {
            caught = error;
        }

        assert.match(caught?.message || '', /AUDIT_SHEET_FAIL_BEFORE_COMMIT/);
        assert.strictEqual(scenario.sheetLedger.calls.length, 1);
        assert.strictEqual(scenario.sheetLedger.committed_operations.length, 0);
        assert.strictEqual(scenario.realOauthTokenStore.getOAuthConnection(scenario.userId).spreadsheet_id, '');
        assert.strictEqual((await scenario.readFreshUser()).status, 'APPROVED_AWAITING_GOOGLE');
        assert.strictEqual(scenario.trace.names().includes('metadata.call'), false);
        assert.strictEqual(scenario.trace.names().includes('status.call'), false);
        auditResults.push(await summarizeScenario(scenario, caught));
    });

    await t.test('metadata failure after sheet commit leaves an orphaned external spreadsheet', async () => {
        const scenario = setupScenario({
            name: 'metadata-before-commit',
            spreadsheetId: 'audit-sheet-001',
            failMetadataBeforeCommit: true
        });
        const user = await scenario.readFreshUser();
        let caught;
        try {
            await scenario.completionBoundary({ user, sheetsClient: scenario.sheetsClient });
        } catch (error) {
            caught = error;
        }

        assert.match(caught?.message || '', /AUDIT_METADATA_FAIL_BEFORE_COMMIT/);
        assert.ok(scenario.sheetLedger.committed_operations.some(op => op.type === 'create' && op.spreadsheetId === 'audit-sheet-001'));
        assert.strictEqual(scenario.realOauthTokenStore.getOAuthConnection(scenario.userId).spreadsheet_id, '');
        assert.strictEqual((await scenario.readFreshUser()).status, 'APPROVED_AWAITING_GOOGLE');
        assert.strictEqual(scenario.trace.names().includes('metadata.call'), true);
        assert.strictEqual(scenario.trace.names().includes('metadata.commit'), false);
        assert.strictEqual(scenario.trace.names().includes('status.call'), false);
        assert.strictEqual(scenario.sheetLedger.compensated_operations.length, 0);
        auditResults.push(await summarizeScenario(scenario, caught));
    });

    await t.test('status failure occurs after external and local metadata commits', async () => {
        const scenario = setupScenario({
            name: 'status-before-commit',
            spreadsheetId: 'audit-sheet-002',
            failStatusBeforeCommit: true
        });
        const user = await scenario.readFreshUser();
        let caught;
        try {
            await scenario.completionBoundary({ user, sheetsClient: scenario.sheetsClient });
        } catch (error) {
            caught = error;
        }

        assert.match(caught?.message || '', /AUDIT_STATUS_FAIL_BEFORE_COMMIT/);
        assert.strictEqual(scenario.realOauthTokenStore.getOAuthConnection(scenario.userId).spreadsheet_id, 'audit-sheet-002');
        assert.strictEqual((await scenario.readFreshUser()).status, 'APPROVED_AWAITING_GOOGLE');
        assert.strictEqual(scenario.trace.names().includes('metadata.commit'), true);
        assert.strictEqual(scenario.trace.names().includes('status.call'), true);
        assert.strictEqual(scenario.trace.names().includes('status.commit'), false);
        assert.strictEqual(scenario.sheetLedger.compensated_operations.length, 0);
        auditResults.push(await summarizeScenario(scenario, caught));
    });

    await t.test('response delivery failure happens after callback durable effects commit', async () => {
        const scenario = setupScenario({
            name: 'response-before-delivery',
            spreadsheetId: 'audit-sheet-003',
            seedConnection: false
        });
        const oauth2Client = {
            getToken: async () => {
                scenario.trace.push('token.exchange.call');
                scenario.trace.push('token.exchange.return');
                return {
                    tokens: {
                        refresh_token: 'synthetic-callback-refresh-token',
                        access_token: 'synthetic-callback-access-token'
                    }
                };
            },
            setCredentials: () => scenario.trace.push('token.credentials.set')
        };
        const oauth2Api = {
            userinfo: {
                get: async () => {
                    scenario.trace.push('account.lookup.call');
                    scenario.trace.push('account.lookup.return');
                    return {
                        data: {
                            id: 'audit-google-response',
                            email: 'response@example.invalid'
                        }
                    };
                }
            }
        };
        const realCallback = scenario.googleOAuthService.completeGoogleOAuthCallback;
        installModule(googleOAuthServicePath, {
            ...scenario.googleOAuthService,
            completeGoogleOAuthCallback: ({ code, state }) => realCallback({
                code,
                state,
                oauth2Client,
                oauth2Api,
                sheetsClient: scenario.sheetsClient
            })
        });
        installModule(readModelPath, {
            syncReadModelIfNeeded: async () => ({}),
            getDashboardSnapshot: () => null,
            getDashboardSqlData: () => null,
            isSqliteReady: () => true,
            ALL_USERS_ID: '__ALL_USERS__'
        });
        installModule(whatsappPath, {
            sendWhatsAppMessage: async () => scenario.trace.push('whatsapp.notification.return')
        });

        delete require.cache[dashboardServerPath];
        let requestHandler = null;
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
            const { startDashboardServer } = require(dashboardServerPath);
            startDashboardServer();
        } finally {
            http.createServer = originalCreateServer;
        }

        assert.strictEqual(typeof requestHandler, 'function');
        const state = scenario.googleOAuthService.createOAuthState({ userId: scenario.userId });
        let responseAttempts = 0;
        let delivered = false;
        const req = {
            method: 'GET',
            url: `/oauth/google/callback?code=audit-code&state=${encodeURIComponent(state)}`,
            headers: { host: 'local.audit' }
        };
        const res = {
            writeHead(statusCode) {
                responseAttempts += 1;
                scenario.trace.push('response.call', { statusCode, attempt: responseAttempts });
                return this;
            },
            end() {
                scenario.trace.push('response.fail.before_delivery', { attempt: responseAttempts });
                throw new Error('AUDIT_RESPONSE_FAIL_BEFORE_DELIVERY');
            }
        };

        let caught;
        try {
            await requestHandler(req, res);
            delivered = true;
        } catch (error) {
            caught = error;
        }

        assert.match(caught?.message || '', /AUDIT_RESPONSE_FAIL_BEFORE_DELIVERY/);
        assert.strictEqual(delivered, false);
        assert.ok(responseAttempts >= 1);
        assert.strictEqual(scenario.realOauthTokenStore.getOAuthConnection(scenario.userId).spreadsheet_id, 'audit-sheet-003');
        assert.strictEqual((await scenario.readFreshUser()).status, 'ACTIVE');
        assert.strictEqual(scenario.trace.names().includes('connection.save.commit'), true);
        assert.strictEqual(scenario.trace.names().includes('metadata.commit'), true);
        assert.strictEqual(scenario.trace.names().includes('status.commit'), true);
        assert.strictEqual(scenario.trace.names().includes('complete.return'), true);
        assert.strictEqual(scenario.sheetLedger.compensated_operations.length, 0);
        auditResults.push(await summarizeScenario(scenario, caught, {
            response_attempts: responseAttempts,
            response_delivered: delivered
        }));
    });

    console.log(`CAUSAL_AUDIT_RESULT ${JSON.stringify({ audit_root: auditRoot, scenarios: auditResults })}`);
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
