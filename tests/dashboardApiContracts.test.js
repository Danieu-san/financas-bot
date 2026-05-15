const test = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');

const dashboardServerPath = require.resolve('../src/services/dashboardServer');
const readModelPath = require.resolve('../src/services/readModelService');
const dashboardAuthPath = require.resolve('../src/utils/dashboardAuth');

function installReadModelMock(calls) {
    delete require.cache[dashboardServerPath];
    delete require.cache[readModelPath];
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
            isSqliteReady: () => true
        }
    };
}

async function startTestServer(calls) {
    process.env.DASHBOARD_ENABLED = 'true';
    process.env.DASHBOARD_HOST = '127.0.0.1';
    process.env.DASHBOARD_PORT = '0';
    process.env.DASHBOARD_TOKEN_SECRET = 'dashboard-contract-secret';
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
