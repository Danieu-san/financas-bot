const test = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');

const dashboardServerPath = require.resolve('../src/services/dashboardServer');
const readModelPath = require.resolve('../src/services/readModelService');
const userSheetAnalyticsPath = require.resolve('../src/services/userSheetAnalyticsService');
const userServicePath = require.resolve('../src/services/userService');
const dashboardAuthPath = require.resolve('../src/utils/dashboardAuth');

function installReadModelMock(calls) {
    delete require.cache[dashboardServerPath];
    delete require.cache[readModelPath];
    delete require.cache[userSheetAnalyticsPath];
    delete require.cache[userServicePath];
    require.cache[readModelPath] = {
        id: readModelPath,
        filename: readModelPath,
        loaded: true,
        exports: {
            syncReadModelIfNeeded: async () => ({ lastSyncedAt: '2026-05-15T00:00:00.000Z' }),
            getDashboardSqlData: (userId, period = {}) => {
                calls.push({ userId, period });
                return {
                    period: { month: Number(period.month ?? 4), year: Number(period.year ?? 2026) },
                    kpis: {
                        entradas: 1000,
                        saidas: 300,
                        cartoes: 100,
                        saldo: 600,
                        debtActiveCount: 1,
                        debtTotal: 1200
                    },
                    topCategories: [{ category: 'Alimentação', value: 300 }],
                    dailyFlow: [{ date: '10/05/2026', entradas: 1000, saidas: 400, saldo: 600 }],
                    recentTransactions: [{ date: '10/05/2026', description: 'mercado', category: 'Alimentação', value: 300, type: 'saida' }],
                    goals: [{ name: 'Reserva', target: 3000, current: 600, progressPct: 20 }],
                    debts: [{ name: 'Cartão', creditor: 'Banco', saldoAtual: 1200, jurosPct: 8, status: 'Ativa' }],
                    alerts: [{ level: 'low', code: 'OK', message: 'Sem alerta crítico.' }],
                    sync: { lastSyncedAt: '2026-05-15T00:00:00.000Z' }
                };
            },
            getDashboardSnapshot: () => {
                throw new Error('dashboard API contract test should use SQL data');
            },
            isSqliteReady: () => true,
            ALL_USERS_ID: '__ALL_USERS__'
        }
    };
    require.cache[userSheetAnalyticsPath] = {
        id: userSheetAnalyticsPath,
        filename: userSheetAnalyticsPath,
        loaded: true,
        exports: {
            getUserSheetDashboardData: async () => null
        }
    };
    require.cache[userServicePath] = {
        id: userServicePath,
        filename: userServicePath,
        loaded: true,
        exports: {
            getAllUsers: async () => [
                { user_id: 'admin-user', display_name: 'Daniel', phone_e164: '5521970112407', status: 'ACTIVE' },
                { user_id: 'user-dash-a', display_name: 'Usuário A', phone_e164: '5599999999999', status: 'ACTIVE' },
                { user_id: 'inactive-user', display_name: 'Inativo', phone_e164: '5588888888888', status: 'INACTIVE' },
                { user_id: 'deleted-user', display_name: 'Deletado', phone_e164: '5577777777777', status: 'DELETED', deleted_at: '2026-05-01T00:00:00.000Z' }
            ],
            getUserProfileByUserId: async () => null
        }
    };
}

async function startTestServer(calls, options = {}) {
    process.env.DASHBOARD_ENABLED = 'true';
    process.env.DASHBOARD_HOST = '127.0.0.1';
    process.env.DASHBOARD_PORT = '0';
    process.env.DASHBOARD_TOKEN_SECRET = 'dashboard-contract-secret';
    if (options.adminAllUsersEnabled) {
        process.env.DASHBOARD_ADMIN_ALL_USERS_ENABLED = 'true';
    } else {
        delete process.env.DASHBOARD_ADMIN_ALL_USERS_ENABLED;
    }
    delete require.cache[dashboardAuthPath];
    installReadModelMock(calls);

    const { generateDashboardToken } = require('../src/utils/dashboardAuth');
    const { startDashboardServer } = require('../src/services/dashboardServer');
    const server = startDashboardServer();
    if (!server.listening) {
        await once(server, 'listening');
    }
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const token = generateDashboardToken({ userId: 'user-dash-a', ttlSeconds: 600 });
    return { server, baseUrl, token };
}

async function fetchJson(url) {
    const response = await fetch(url);
    const json = await response.json();
    return { response, json };
}

test('dashboard API endpoints expose stable user-scoped contracts', async () => {
    const calls = [];
    const { server, baseUrl, token } = await startTestServer(calls);
    try {
        const endpoints = {
            kpis: '/dashboard/api/kpis',
            cashflow: '/dashboard/api/cashflow',
            debts: '/dashboard/api/debts',
            goals: '/dashboard/api/goals',
            alerts: '/dashboard/api/alerts',
            summary: '/dashboard/api/summary'
        };

        const kpis = await fetchJson(`${baseUrl}${endpoints.kpis}?token=${token}&month=4&year=2026`);
        assert.strictEqual(kpis.response.status, 200);
        assert.deepStrictEqual(Object.keys(kpis.json).sort(), ['kpis', 'period', 'source', 'topCategories'].sort());
        assert.strictEqual(kpis.json.source, 'sqlite');
        assert.strictEqual(kpis.json.kpis.saldo, 600);

        const cashflow = await fetchJson(`${baseUrl}${endpoints.cashflow}?token=${token}&month=4&year=2026`);
        assert.strictEqual(cashflow.response.status, 200);
        assert.ok(Array.isArray(cashflow.json.dailyFlow));

        const debts = await fetchJson(`${baseUrl}${endpoints.debts}?token=${token}`);
        assert.strictEqual(debts.response.status, 200);
        assert.strictEqual(debts.json.debts[0].name, 'Cartão');

        const goals = await fetchJson(`${baseUrl}${endpoints.goals}?token=${token}`);
        assert.strictEqual(goals.response.status, 200);
        assert.strictEqual(goals.json.goals[0].name, 'Reserva');

        const alerts = await fetchJson(`${baseUrl}${endpoints.alerts}?token=${token}&month=4&year=2026`);
        assert.strictEqual(alerts.response.status, 200);
        assert.strictEqual(alerts.json.alerts[0].code, 'OK');

        const summary = await fetchJson(`${baseUrl}${endpoints.summary}?token=${token}&month=4&year=2026`);
        assert.strictEqual(summary.response.status, 200);
        assert.ok(summary.json.recentTransactions);
        assert.ok(summary.json.sync);

        assert.ok(calls.length >= 6);
        assert.ok(calls.every(call => call.userId === 'user-dash-a'));
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('dashboard admin token defaults to own user and rejects cross-user financial scopes by default', async () => {
    const calls = [];
    const { server, baseUrl } = await startTestServer(calls);
    const { generateDashboardToken } = require('../src/utils/dashboardAuth');
    const adminToken = generateDashboardToken({ userId: 'admin-user', ttlSeconds: 600, isAdmin: true });

    try {
        const kpis = await fetchJson(`${baseUrl}/dashboard/api/kpis?token=${adminToken}&month=1&year=2026`);
        assert.strictEqual(kpis.response.status, 200);
        assert.strictEqual(calls.at(-1).userId, 'admin-user');

        const callsAfterOwnDashboard = calls.length;

        const aggregate = await fetchJson(`${baseUrl}/dashboard/api/kpis?token=${adminToken}&user=all&month=1&year=2026`);
        assert.strictEqual(aggregate.response.status, 403);
        assert.match(aggregate.json.error, /próprio usuário/);

        const personal = await fetchJson(`${baseUrl}/dashboard/api/kpis?token=${adminToken}&user=user-dash-a&month=1&year=2026`);
        assert.strictEqual(personal.response.status, 403);
        assert.match(personal.json.error, /próprio usuário/);
        assert.strictEqual(calls.length, callsAfterOwnDashboard);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('dashboard admin all-users support mode requires explicit env flag', async () => {
    const calls = [];
    const { server, baseUrl } = await startTestServer(calls, { adminAllUsersEnabled: true });
    const { generateDashboardToken } = require('../src/utils/dashboardAuth');
    const adminToken = generateDashboardToken({ userId: 'admin-user', ttlSeconds: 600, isAdmin: true });
    try {
        const aggregate = await fetchJson(`${baseUrl}/dashboard/api/kpis?token=${adminToken}&user=all&month=1&year=2026`);
        assert.strictEqual(aggregate.response.status, 200);
        assert.strictEqual(calls.at(-1).userId, '__ALL_USERS__');

        const personal = await fetchJson(`${baseUrl}/dashboard/api/kpis?token=${adminToken}&user=user-dash-a&month=1&year=2026`);
        assert.strictEqual(personal.response.status, 200);
        assert.strictEqual(calls.at(-1).userId, 'user-dash-a');
    } finally {
        delete process.env.DASHBOARD_ADMIN_ALL_USERS_ENABLED;
        await new Promise(resolve => server.close(resolve));
    }
});

test('dashboard page reloads data when month or year filters change', async () => {
    const calls = [];
    const { server, baseUrl, token } = await startTestServer(calls);
    try {
        const page = await fetch(`${baseUrl}/dashboard?token=${token}`);
        assert.strictEqual(page.status, 200);
        const html = await page.text();
        assert.match(html, /monthEl\.addEventListener\('change', loadData\)/);
        assert.match(html, /yearEl\.addEventListener\('change', loadData\)/);
        assert.match(html, /sessionStorage\.setItem\('financasbot_dashboard_token'/);
        assert.match(html, /history\.replaceState\(null, '', window\.location\.pathname\)/);
        assert.match(html, /fetch\(base \+ '\/summary\?token='/);
        assert.doesNotMatch(html, /fetch\(base \+ '\/kpis\?token='/);
        assert.doesNotMatch(html, /fetch\(base \+ '\/cashflow\?token='/);
        assert.match(html, /kpiDisponivel/);
        assert.match(html, /saldoDisponivelEstimado/);
        assert.match(html, /Orçamento Livre/);
        assert.match(html, /renderDailyGoal\(data\.dailyGoal\)/);
        assert.match(html, /definir orçamento mensal 3000 dia 5/);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('dashboard admin user selector only lists active users', async () => {
    const calls = [];
    const { server, baseUrl } = await startTestServer(calls);
    const { generateDashboardToken } = require('../src/utils/dashboardAuth');
    const adminToken = generateDashboardToken({ userId: 'admin-user', ttlSeconds: 600, isAdmin: true });

    try {
        const result = await fetchJson(`${baseUrl}/dashboard/api/users?token=${adminToken}`);
        assert.strictEqual(result.response.status, 200);
        const values = result.json.users.map(user => user.value);
        assert.ok(values.includes('admin-user'));
        assert.ok(!values.includes('user-dash-a'));
        assert.ok(!values.includes('all'));
        assert.ok(!values.includes('inactive-user'));
        assert.ok(!values.includes('deleted-user'));
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('dashboard API rejects invalid token with safe error', async () => {
    const calls = [];
    const { server, baseUrl } = await startTestServer(calls);
    try {
        const result = await fetchJson(`${baseUrl}/dashboard/api/kpis?token=invalid`);
        assert.strictEqual(result.response.status, 401);
        assert.deepStrictEqual(result.json, { error: 'Token inválido ou expirado.' });
        assert.strictEqual(calls.length, 0);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('dashboard responses include security and privacy headers', async () => {
    const calls = [];
    const { server, baseUrl, token } = await startTestServer(calls);
    try {
        const page = await fetch(`${baseUrl}/dashboard?token=${token}`);
        assert.strictEqual(page.status, 200);
        assert.strictEqual(page.headers.get('cache-control'), 'no-store');
        assert.strictEqual(page.headers.get('referrer-policy'), 'no-referrer');
        assert.strictEqual(page.headers.get('x-frame-options'), 'DENY');
        assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
        const pageBody = await page.text();
        assert.match(pageBody, /Visão Gráfica/);
        assert.match(pageBody, /financeChart/);

        const api = await fetch(`${baseUrl}/dashboard/api/summary?token=${token}`);
        assert.strictEqual(api.status, 200);
        assert.strictEqual(api.headers.get('cache-control'), 'no-store');
        assert.strictEqual(api.headers.get('x-content-type-options'), 'nosniff');
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
