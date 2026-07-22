const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const Database = require('better-sqlite3');

const projectRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(projectRoot, 'src');
const googlePath = require.resolve('../src/services/google');
const userServicePath = require.resolve('../src/services/userService');
const oauthTokenStorePath = require.resolve('../src/services/oauthTokenStore');
const userSpreadsheetServicePath = require.resolve('../src/services/userSpreadsheetService');
const googleOAuthServicePath = require.resolve('../src/services/googleOAuthService');
const schedulerPath = require.resolve('../src/jobs/scheduler');
const dashboardServerPath = require.resolve('../src/services/dashboardServer');
const readModelPath = require.resolve('../src/services/readModelService');
const whatsappPath = require.resolve('../src/services/whatsapp');
const messageHandlerPath = require.resolve('../src/handlers/messageHandler');
const adminActionLogPath = require.resolve('../src/services/adminActionLogService');
const metricsPath = require.resolve('../src/utils/metrics');
const googleapisPath = require.resolve('googleapis');
const manifestPath = path.join(projectRoot, 'docs', 'audit', '08-google-entrypoint-sink-negative-proof-2026-07-18.md');
const c03ManifestPath = path.join(
    projectRoot,
    'docs',
    'audit',
    'correction-packets',
    '2026-07-19-c03-oauth-revocation.md'
);

const USER_HEADERS = [
    'user_id', 'whatsapp_id', 'phone_e164', 'display_name', 'status',
    'created_at', 'updated_at', 'consent_at', 'terms_version', 'deleted_at'
];
const PROFILE_HEADERS = [
    'user_id', 'full_name', 'monthly_income', 'fixed_expense_estimate',
    'has_debt', 'primary_goal', 'onboarding_completed_at'
];

let auditRoot = '';
const results = [];

function clearAuditModules() {
    for (const modulePath of Object.keys(require.cache)) {
        if (modulePath.startsWith(srcRoot) || modulePath === googleapisPath) {
            delete require.cache[modulePath];
        }
    }
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

function syntheticUser({ userId, whatsappId, displayName, status = 'ACTIVE' }) {
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

function createGoogleBackingStore({ users, trace }) {
    const rows = users.map(user => user.slice());
    const profiles = users.map(user => [user[0], user[3], '', '', '', '', user[5]]);
    const ledgers = {
        append: [],
        lifecycle: [],
        drive: [],
        share: []
    };

    function rowIndexFromRange(range) {
        const match = String(range).match(/Users!A(\d+):J\d+/);
        return match ? Number(match[1]) - 2 : -1;
    }

    const google = {
        readDataFromSheet: async (range) => {
            if (String(range).startsWith('Users!')) {
                return [USER_HEADERS.slice(), ...rows.map(row => row.slice())];
            }
            if (String(range).startsWith('UserProfile!')) {
                return [PROFILE_HEADERS.slice(), ...profiles.map(row => row.slice())];
            }
            return [];
        },
        appendRowToSheet: async (sheetName, row) => {
            ledgers.append.push({ sheetName, row: Array.isArray(row) ? row.slice() : row });
            trace.push('google.append', { sheetName });
            throw new Error('AUDIT_UNEXPECTED_APPEND');
        },
        updateRowInSheet: async (range, row) => {
            ledgers.lifecycle.push({ range, row: row.slice() });
            trace.push('lifecycle.write', { range, status: row[4] });
            const index = rowIndexFromRange(range);
            if (index < 0 || index >= rows.length) {
                throw new Error(`AUDIT_UNEXPECTED_USER_RANGE:${range}`);
            }
            rows[index] = row.slice();
        },
        runWithUserSheetContext: async (_user, fn) => fn(),
        hasUserSpreadsheetContext: async () => false,
        revokeSpreadsheetPermission: async (payload) => {
            ledgers.drive.push({ ...payload });
            trace.push('drive.revoke');
            return true;
        },
        shareSpreadsheetWithUserEmail: async (payload) => {
            ledgers.share.push({ ...payload });
            trace.push('drive.share');
            return { permissionId: 'unexpected-permission' };
        }
    };

    return { rows, profiles, ledgers, google };
}

function configureEnvironment(dbPath) {
    process.env.OAUTH_TOKEN_DB_PATH = dbPath;
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 47).toString('base64');
    process.env.GOOGLE_OAUTH_STATE_SECRET = 'negative-proof-state-secret-2026';
    process.env.GOOGLE_OAUTH_STATE_TTL_SECONDS = '7200';
    process.env.DASHBOARD_ENABLED = 'true';
    process.env.DASHBOARD_HOST = '127.0.0.1';
    process.env.DASHBOARD_PORT = '0';
    process.env.ADMIN_IDS = '5511000000000@c.us';
    process.env.TERMS_VERSION = 'v1.1';
}

function rawTableRows(dbPath, tableName) {
    const allowed = new Set(['oauth_connections', 'shared_spreadsheet_members']);
    if (!allowed.has(tableName)) throw new Error(`Tabela não permitida no snapshot: ${tableName}`);
    const database = new Database(dbPath, { readonly: true });
    try {
        return database.prepare(`SELECT * FROM ${tableName} ORDER BY user_id ASC`).all();
    } finally {
        database.close();
    }
}

async function captureState(fixture) {
    fixture.realUserService.invalidateUserCaches();
    const userViews = {};
    for (const identity of Object.values(fixture.identities)) {
        const user = await fixture.realUserService.getUserById(identity.userId);
        userViews[identity.userId] = user
            ? {
                user_id: user.user_id,
                whatsapp_id: user.whatsapp_id,
                status: user.status,
                updated_at: user.updated_at,
                deleted_at: user.deleted_at
            }
            : null;
    }
    return {
        users: userViews,
        oauth: rawTableRows(fixture.dbPath, 'oauth_connections'),
        memberships: rawTableRows(fixture.dbPath, 'shared_spreadsheet_members')
    };
}

function createFixture(name, { includeOutsider = false } = {}) {
    clearAuditModules();
    const scenarioRoot = path.join(auditRoot, name);
    fs.mkdirSync(scenarioRoot, { recursive: true });
    const dbPath = path.join(scenarioRoot, 'oauth.sqlite');
    configureEnvironment(dbPath);
    const trace = createTrace();
    const identities = {
        memberA: {
            userId: `negative-A-${name}`,
            whatsappId: '5511000000001@c.us',
            displayName: 'Membro A sintético'
        },
        memberB: {
            userId: `negative-B-${name}`,
            whatsappId: '5511000000002@c.us',
            displayName: 'Membro B sintético'
        }
    };
    if (includeOutsider) {
        identities.outsider = {
            userId: `negative-outsider-${name}`,
            whatsappId: '5511000000003@c.us',
            displayName: 'Terceiro sintético'
        };
    }
    const rows = Object.values(identities).map(identity => syntheticUser(identity));
    const backing = createGoogleBackingStore({ users: rows, trace });
    installModule(googlePath, backing.google);

    const realUserService = require(userServicePath);
    const realOauthStore = require(oauthTokenStorePath);
    realOauthStore.saveOAuthConnection(identities.memberA.userId, {
        scopes: ['audit.scope'],
        tokens: { refresh_token: `negative-token-A-${name}` },
        googleAccount: { id: `google-A-${name}`, email: `a-${name}@example.invalid` },
        spreadsheetId: `negative-sheet-A-${name}`
    });
    realOauthStore.saveOAuthConnection(identities.memberB.userId, {
        scopes: ['audit.scope'],
        tokens: { refresh_token: `negative-token-B-${name}` },
        googleAccount: { id: `google-B-${name}`, email: `b-${name}@example.invalid` },
        spreadsheetId: `negative-sheet-B-${name}`
    });
    realOauthStore.setSharedSpreadsheetMembership({
        memberUserId: identities.memberB.userId,
        ownerUserId: identities.memberA.userId,
        spreadsheetId: `negative-family-sheet-${name}`,
        memberGoogleEmail: `b-${name}@example.invalid`,
        drivePermissionId: `negative-permission-${name}`
    });

    return {
        name,
        scenarioRoot,
        dbPath,
        trace,
        identities,
        backing,
        realUserService,
        realOauthStore
    };
}

function encodeBase64Url(value) {
    return Buffer.from(value)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function decodeBase64Url(value) {
    const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return Buffer.from(padded, 'base64').toString('utf8');
}

function tamperStateUserId(state, replacementUserId) {
    const [encodedPayload, signature] = String(state).split('.');
    const payload = JSON.parse(decodeBase64Url(encodedPayload));
    payload.userId = replacementUserId;
    return `${encodeBase64Url(JSON.stringify(payload))}.${signature}`;
}

function installReadModelStub() {
    installModule(readModelPath, {
        syncReadModelIfNeeded: async () => ({}),
        executeAnalyticalIntent: async () => null,
        executeFinancialQueryPlanFromReadModel: async () => null,
        markReadModelDirty: () => {},
        getReadModelStats: () => ({}),
        getDashboardSqlData: () => null,
        getDashboardSnapshot: () => null,
        isSqliteReady: () => true,
        ALL_USERS_ID: '__ALL_USERS__'
    });
}

function listJavaScriptFiles(root) {
    const files = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) files.push(...listJavaScriptFiles(entryPath));
        else if (entry.isFile() && entry.name.endsWith('.js')) files.push(entryPath);
    }
    return files;
}

function extractPreparedSql(source) {
    return [...source.matchAll(/prepare\(\s*`([\s\S]*?)`\s*\)/g)].map(match => match[1]);
}

test('P5 negative proof for Google entrypoints and authorization boundaries', async (t) => {
    auditRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'financas-google-negative-'));

    await t.test('static manifest and lifecycle deltas cover the bounded OAuth and membership revocation writers', () => {
        const manifest = fs.readFileSync(manifestPath, 'utf8');
        const c03Manifest = fs.readFileSync(c03ManifestPath, 'utf8');
        const sourceFiles = listJavaScriptFiles(srcRoot);
        const combinedSource = sourceFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');
        const oauthStoreSource = fs.readFileSync(oauthTokenStorePath, 'utf8');
        const googleFlowSourceWithoutIndividualRevocationRecovery = [
            googleOAuthServicePath,
            userSpreadsheetServicePath,
            dashboardServerPath,
            path.join(projectRoot, 'index.js'),
            ...sourceFiles.filter(file => (
                file.includes(`${path.sep}jobs${path.sep}`) && file !== schedulerPath
            ))
        ].map(file => fs.readFileSync(file, 'utf8')).join('\n');
        const schedulerSource = fs.readFileSync(schedulerPath, 'utf8');

        for (const required of [
            'completeGoogleOAuthCallback',
            'completeGoogleConnectionForUser',
            'saveOAuthConnection',
            'updateOAuthConnectionMetadata',
            'updateUserStatusByWhatsAppId',
            'revokeSpreadsheetPermission',
            'revokeSharedSpreadsheetMembership'
        ]) {
            assert.match(manifest, new RegExp(required));
            assert.match(combinedSource, new RegExp(required));
        }

        for (const required of [
            'beginOAuthRevocation',
            'revokeGoogleConnectionForUser',
            'oauth_revocations'
        ]) {
            assert.match(c03Manifest, new RegExp(required));
            assert.match(combinedSource, new RegExp(required));
        }

        assert.doesNotMatch(combinedSource, /\bdeleteOAuthConnection\b/);
        assert.doesNotMatch(combinedSource, /DELETE\s+FROM\s+oauth_connections/i);

        const preparedSql = extractPreparedSql(oauthStoreSource);
        const oauthRevocationWriters = preparedSql.filter(sql =>
            /\boauth_connections\b/i.test(sql) &&
            (/DELETE\s+FROM\s+oauth_connections/i.test(sql) || /SET[\s\S]*\brevoked_at\s*=\s*@/i.test(sql))
        );
        const membershipRevocationWriters = preparedSql.filter(sql =>
            /UPDATE\s+shared_spreadsheet_members/i.test(sql) && /\brevoked_at\s*=\s*@revoked_at/i.test(sql)
        );
        assert.strictEqual(oauthRevocationWriters.length, 1);
        assert.strictEqual(membershipRevocationWriters.length, 2);
        assert.match(oauthStoreSource, /function revokeSharedSpreadsheetMembership\s*\(/);
        assert.match(oauthStoreSource, /function beginSharedMembershipRevocationsForLifecycle\s*\(/);
        assert.match(oauthStoreSource, /CREATE TABLE IF NOT EXISTS shared_membership_revocations/);
        assert.match(oauthStoreSource, /revoked_at\s*=\s*''/);
        assert.match(oauthStoreSource, /COALESCE\(revoked_at,\s*''\)\s*=\s*''/);
        assert.doesNotMatch(
            googleFlowSourceWithoutIndividualRevocationRecovery,
            /\b(?:beginOAuthRevocation|markOAuthRevocationResult|listOAuthRevocationsForRecovery|retryPendingGoogleRevocations|revokeGoogleConnectionForUser)\b/
        );
        assert.strictEqual(
            [...schedulerSource.matchAll(/\bretryPendingGoogleRevocations\s*\(/g)].length,
            1
        );
        assert.strictEqual(
            [...schedulerSource.matchAll(/\brecoverPendingGoogleOAuthCompensations\s*\(/g)].length,
            1
        );

        results.push({
            scenario: 'static_entrypoint_sink_manifest',
            source_files_scanned: sourceFiles.length,
            oauth_revocation_writers: oauthRevocationWriters.length,
            membership_revocation_writers: membershipRevocationWriters.length,
            individual_revocation_recovery_paths: 1,
            connection_compensation_recovery_paths: 1
        });
    });

    await t.test('tampered signed state is rejected by the real route before every sensitive sink', async () => {
        const fixture = createFixture('tampered-state');
        const before = await captureState(fixture);
        const tripwires = {
            oauthClientConstruction: 0,
            tokenExchange: 0,
            accountLookup: 0,
            oauthSave: 0,
            oauthMetadataUpdate: 0,
            completion: 0,
            lifecycle: 0,
            membership: 0,
            drive: 0,
            whatsapp: 0,
            successMetric: 0
        };

        installModule(oauthTokenStorePath, {
            ...fixture.realOauthStore,
            saveOAuthConnection: (...args) => {
                tripwires.oauthSave += 1;
                fixture.trace.push('tripwire.oauth.save');
                return fixture.realOauthStore.saveOAuthConnection(...args);
            },
            updateOAuthConnectionMetadata: (...args) => {
                tripwires.oauthMetadataUpdate += 1;
                fixture.trace.push('tripwire.oauth.metadata');
                return fixture.realOauthStore.updateOAuthConnectionMetadata(...args);
            },
            setSharedSpreadsheetMembership: (...args) => {
                tripwires.membership += 1;
                fixture.trace.push('tripwire.membership.set');
                return fixture.realOauthStore.setSharedSpreadsheetMembership(...args);
            },
            revokeSharedSpreadsheetMembership: (...args) => {
                tripwires.membership += 1;
                fixture.trace.push('tripwire.membership.revoke');
                return fixture.realOauthStore.revokeSharedSpreadsheetMembership(...args);
            }
        });
        installModule(userServicePath, {
            ...fixture.realUserService,
            getUserById: async (...args) => {
                fixture.trace.push('tripwire.user.lookup');
                return fixture.realUserService.getUserById(...args);
            },
            updateUserStatus: async (...args) => {
                tripwires.lifecycle += 1;
                fixture.trace.push('tripwire.lifecycle.update');
                return fixture.realUserService.updateUserStatus(...args);
            }
        });
        installModule(userSpreadsheetServicePath, {
            completeGoogleConnectionForUser: async () => {
                tripwires.completion += 1;
                fixture.trace.push('tripwire.completion');
                throw new Error('AUDIT_COMPLETION_TRIPWIRE');
            }
        });
        installModule(googleapisPath, {
            google: {
                auth: {
                    OAuth2: class AuditOAuth2 {
                        constructor() {
                            tripwires.oauthClientConstruction += 1;
                            fixture.trace.push('tripwire.oauth.client');
                        }
                        async getToken() {
                            tripwires.tokenExchange += 1;
                            fixture.trace.push('tripwire.token.exchange');
                            throw new Error('AUDIT_TOKEN_EXCHANGE_TRIPWIRE');
                        }
                        setCredentials() {}
                    }
                },
                oauth2: () => {
                    tripwires.accountLookup += 1;
                    fixture.trace.push('tripwire.account.lookup');
                    throw new Error('AUDIT_ACCOUNT_LOOKUP_TRIPWIRE');
                }
            }
        });

        const realOAuthService = require(googleOAuthServicePath);
        installModule(googleOAuthServicePath, {
            ...realOAuthService,
            completeGoogleOAuthCallback: async (args) => {
                fixture.trace.push('callback.enter');
                try {
                    return await realOAuthService.completeGoogleOAuthCallback(args);
                } catch (error) {
                    fixture.trace.push('callback.reject', { message: error.message });
                    throw error;
                }
            }
        });
        installReadModelStub();
        installModule(whatsappPath, {
            sendWhatsAppMessage: async () => {
                tripwires.whatsapp += 1;
                fixture.trace.push('tripwire.whatsapp');
            }
        });
        const realMetrics = require(metricsPath);
        installModule(metricsPath, {
            ...realMetrics,
            increment: (name) => {
                fixture.trace.push('metric.increment', { name });
                if (name === 'oauth.google.callback.success') tripwires.successMetric += 1;
            }
        });

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

        const validState = realOAuthService.createOAuthState({ userId: fixture.identities.memberA.userId });
        const tamperedState = tamperStateUserId(validState, fixture.identities.memberB.userId);
        assert.ok(realOAuthService.verifyOAuthState(validState));
        assert.strictEqual(realOAuthService.verifyOAuthState(tamperedState), null);

        const response = { statusCode: null, headers: null, body: '' };
        const req = {
            method: 'GET',
            url: `/oauth/google/callback?code=synthetic-code&state=${encodeURIComponent(tamperedState)}`,
            headers: { host: 'local.audit' }
        };
        const res = {
            writeHead(statusCode, headers) {
                response.statusCode = statusCode;
                response.headers = headers;
                fixture.trace.push('response.writeHead', { statusCode });
                return this;
            },
            end(body = '') {
                response.body += String(body || '');
                fixture.trace.push('response.end');
            }
        };
        fixture.trace.push('route.enter');
        await requestHandler(req, res);

        tripwires.drive = fixture.backing.ledgers.drive.length + fixture.backing.ledgers.share.length;
        const after = await captureState(fixture);
        assert.strictEqual(response.statusCode, 400);
        assert.match(response.body, /Não foi possível concluir a conexão/);
        assert.deepStrictEqual(after, before);
        assert.deepStrictEqual(tripwires, {
            oauthClientConstruction: 0,
            tokenExchange: 0,
            accountLookup: 0,
            oauthSave: 0,
            oauthMetadataUpdate: 0,
            completion: 0,
            lifecycle: 0,
            membership: 0,
            drive: 0,
            whatsapp: 0,
            successMetric: 0
        });
        assert.deepStrictEqual(fixture.backing.ledgers.lifecycle, []);
        assert.deepStrictEqual(fixture.backing.ledgers.append, []);
        assert.deepStrictEqual(fixture.trace.names().slice(0, 3), [
            'route.enter',
            'callback.enter',
            'callback.reject'
        ]);

        results.push({
            scenario: 'tampered_state_rejected_before_sinks',
            response_status: response.statusCode,
            snapshots_unchanged: true,
            tripwires,
            trace: fixture.trace.names()
        });
    });

    await t.test('real sender resolution and pre-access admin dispatcher reject a non-admin without mutations', async () => {
        const fixture = createFixture('non-admin-command', { includeOutsider: true });
        const before = await captureState(fixture);
        const writes = {
            lifecycle: 0,
            oauth: 0,
            membership: 0,
            drive: 0,
            spreadsheet: 0,
            successAdminAudit: 0
        };
        const auditLedger = [];

        installModule(userServicePath, {
            ...fixture.realUserService,
            updateUserStatus: async (...args) => {
                writes.lifecycle += 1;
                fixture.trace.push('tripwire.lifecycle.update');
                return fixture.realUserService.updateUserStatus(...args);
            },
            updateUserStatusByWhatsAppId: async (...args) => {
                writes.lifecycle += 1;
                fixture.trace.push('tripwire.lifecycle.admin');
                return fixture.realUserService.updateUserStatusByWhatsAppId(...args);
            }
        });
        installModule(oauthTokenStorePath, {
            ...fixture.realOauthStore,
            saveOAuthConnection: (...args) => {
                writes.oauth += 1;
                return fixture.realOauthStore.saveOAuthConnection(...args);
            },
            updateOAuthConnectionMetadata: (...args) => {
                writes.oauth += 1;
                return fixture.realOauthStore.updateOAuthConnectionMetadata(...args);
            },
            setSharedSpreadsheetMembership: (...args) => {
                writes.membership += 1;
                return fixture.realOauthStore.setSharedSpreadsheetMembership(...args);
            },
            revokeSharedSpreadsheetMembership: (...args) => {
                writes.membership += 1;
                return fixture.realOauthStore.revokeSharedSpreadsheetMembership(...args);
            }
        });
        installModule(adminActionLogPath, {
            recordAdminAction: async entry => {
                auditLedger.push(entry);
                fixture.trace.push('admin.audit', { action: entry.action, result: entry.result });
                if (entry.result === 'success') writes.successAdminAudit += 1;
                return entry;
            },
            hashRef: value => String(value || ''),
            sanitizeValue: value => value
        });
        installReadModelStub();
        installModule(whatsappPath, { sendWhatsAppMessage: async () => {} });
        installModule(googleOAuthServicePath, {
            buildGoogleConnectLink: () => 'https://local.invalid/oauth'
        });

        const messageHandler = require(messageHandlerPath);
        const replies = [];
        const msg = {
            id: { id: 'negative-proof-admin-message' },
            body: `admin inativar ${fixture.identities.memberA.whatsappId}`,
            from: fixture.identities.outsider.whatsappId,
            author: '',
            type: 'chat',
            isStatus: false,
            fromMe: false,
            _data: { notifyName: fixture.identities.outsider.displayName },
            reply: async text => {
                replies.push(String(text));
                fixture.trace.push('reply', { text: String(text) });
            }
        };

        fixture.trace.push('resolve.enter');
        const access = await fixture.realUserService.resolveUserAccess(msg);
        fixture.trace.push('resolve.return', { allowed: access.allowed, userId: access.user?.user_id || '' });
        assert.strictEqual(access.allowed, true);
        assert.strictEqual(access.user.user_id, fixture.identities.outsider.userId);

        fixture.trace.push('admin.dispatch.enter');
        const handled = await messageHandler.__test__.handleAdminCommandBeforeAccess(
            msg,
            fixture.identities.outsider.whatsappId,
            access
        );
        fixture.trace.push('admin.dispatch.return', { handled });

        writes.drive = fixture.backing.ledgers.drive.length + fixture.backing.ledgers.share.length;
        writes.spreadsheet = fixture.backing.ledgers.append.length;
        const after = await captureState(fixture);
        assert.strictEqual(handled, true);
        assert.strictEqual(replies.length, 1);
        assert.match(replies[0], /restrito a administradores/i);
        assert.deepStrictEqual(after, before);
        assert.deepStrictEqual(writes, {
            lifecycle: 0,
            oauth: 0,
            membership: 0,
            drive: 0,
            spreadsheet: 0,
            successAdminAudit: 0
        });
        assert.deepStrictEqual(fixture.backing.ledgers.lifecycle, []);
        assert.strictEqual(auditLedger.length, 1);
        assert.strictEqual(auditLedger[0].action, 'access_denied');
        assert.strictEqual(auditLedger[0].result, 'denied');
        assert.deepStrictEqual(
            fixture.trace.names().slice(0, 6),
            ['resolve.enter', 'resolve.return', 'admin.dispatch.enter', 'admin.audit', 'reply', 'admin.dispatch.return']
        );

        results.push({
            scenario: 'non_admin_rejected_by_real_pre_access_dispatcher',
            sender_resolved: access.user.user_id,
            handled,
            denied_audit_recorded: true,
            success_audit_recorded: false,
            snapshots_unchanged: true,
            writes,
            trace: fixture.trace.names()
        });
    });

    console.log(`NEGATIVE_PROOF_AUDIT_RESULT ${JSON.stringify({
        audit_root: auditRoot,
        scenarios: results
    })}`);
});

test.after(() => {
    clearAuditModules();
    delete process.env.OAUTH_TOKEN_DB_PATH;
    delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
    delete process.env.GOOGLE_OAUTH_STATE_SECRET;
    delete process.env.GOOGLE_OAUTH_STATE_TTL_SECONDS;
    delete process.env.DASHBOARD_ENABLED;
    delete process.env.DASHBOARD_HOST;
    delete process.env.DASHBOARD_PORT;
    delete process.env.ADMIN_IDS;
    delete process.env.TERMS_VERSION;
});
