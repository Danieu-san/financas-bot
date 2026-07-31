const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { __test__ } = require('../src/services/userSheetAnalyticsService');
const financialAgentTools = require('../src/agent/financialAgentTools');
const { CanonicalLedgerShadowStore } = require('../src/ledger/canonicalLedgerShadowStore');

test('public dashboard excludes exact TESTE_APAGAR markers before aggregation without deleting source rows', () => {
    const rows = [
        ['Data', 'Descrição', 'Valor'],
        ['30/07/2026', 'Mercado da família', 25],
        ['30/07/2026', 'TESTE_APAGAR_DASHBOARD_20260730', 999],
        ['30/07/2026', 'prefixo TESTE_APAGAR_DASHBOARD_20260730 sufixo', 777],
        ['30/07/2026', 'Texto TESTE_APAGAR sem identificador controlado', 11]
    ];

    const filtered = __test__.filterPublicDashboardRows(rows);

    assert.deepEqual(filtered, [
        rows[0],
        rows[1],
        rows[4]
    ]);
    assert.equal(rows.length, 5, 'the source rows must remain untouched');
    assert.equal(__test__.isPublicDashboardTestRow(['teste_apagar_dashboard_20260730']), true);
    assert.equal(__test__.isPublicDashboardTestRow(['TESTE_APAGAR']), false);
});

test('dashboard query sources exclude marker rows and canonical events only when the public filter is requested', () => {
    const source = {
        saidas: [
            ['Data', 'Descrição'],
            ['30/07/2026', 'Mercado'],
            ['30/07/2026', 'TESTE_APAGAR_DASHBOARD_20260730']
        ],
        cartoes: [[
            ['Data', 'Descrição'],
            ['30/07/2026', 'Compra real'],
            ['30/07/2026', 'Compra TESTE_APAGAR_DASHBOARD_20260730']
        ]],
        canonicalBudgetEvents: [
            { event_id: 'real', description: 'Mercado' },
            { event_id: 'test', description: 'TESTE_APAGAR_DASHBOARD_20260730' }
        ]
    };

    const filtered = financialAgentTools.__test__.filterPublicDashboardDataSources(source);

    assert.deepEqual(filtered.saidas, source.saidas.slice(0, 2));
    assert.deepEqual(filtered.cartoes[0], source.cartoes[0].slice(0, 2));
    assert.deepEqual(filtered.canonicalBudgetEvents, [source.canonicalBudgetEvents[0]]);
    assert.equal(source.saidas.length, 3, 'the read model source must remain untouched');
});

test('dashboard public query filters canonical accounts and forecast before their aggregations', async () => {
    const dbPath = path.join(os.tmpdir(), `dashboard-public-filter-${Date.now()}-${Math.random()}.sqlite`);
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    store.persistProjection({
        runId: 'dashboard-public-filter-run',
        projected: {
            events: [
                {
                    event_id: 'evt-real-income',
                    household_id: 'household-dashboard',
                    owner_person_id: 'user-owner',
                    actor_person_id: 'user-owner',
                    kind: 'income',
                    status: 'pending',
                    description: 'Entrada prevista real',
                    amount_cents: 5000,
                    currency: 'BRL',
                    occurred_on: '2026-07-20',
                    effective_on: '2026-07-20',
                    due_on: '2026-07-20',
                    source_type: 'sheet.entradas',
                    source_row_ref: 'row-real-income',
                    source_id_hash: 'source-real-income',
                    source_row_hash: 'hash-real-income',
                    idempotency_key: 'idem-real-income'
                },
                {
                    event_id: 'evt-test-income',
                    household_id: 'household-dashboard',
                    owner_person_id: 'user-owner',
                    actor_person_id: 'user-owner',
                    kind: 'income',
                    status: 'pending',
                    description: 'TESTE_APAGAR_DASHBOARD_20260730',
                    amount_cents: 99900,
                    currency: 'BRL',
                    occurred_on: '2026-07-21',
                    effective_on: '2026-07-21',
                    due_on: '2026-07-21',
                    source_type: 'sheet.entradas',
                    source_row_ref: 'row-test-income',
                    source_id_hash: 'source-test-income',
                    source_row_hash: 'hash-test-income',
                    idempotency_key: 'idem-test-income'
                }
            ],
            lines: [],
            accounts: [
                {
                    account_id: 'acct-real',
                    household_id: 'household-dashboard',
                    owner_person_id: 'user-owner',
                    account_type: 'bank',
                    name: 'Conta real',
                    currency: 'BRL',
                    opening_balance_cents: 1000,
                    opened_on: '2026-07-01',
                    status: 'active'
                },
                {
                    account_id: 'acct-test',
                    household_id: 'household-dashboard',
                    owner_person_id: 'user-owner',
                    account_type: 'bank',
                    name: 'TESTE_APAGAR_DASHBOARD_20260730',
                    currency: 'BRL',
                    opening_balance_cents: 99900,
                    opened_on: '2026-07-01',
                    status: 'active'
                }
            ],
            recurrenceRules: [],
            recurrenceOccurrences: [],
            reconciliationLinks: []
        },
        publicProjection: [],
        report: {
            report_type: 'canonical_ledger_receipt_shadow',
            schema_version: 'canonical-ledger-v1',
            synthetic_fixture_only: false
        }
    });
    store.close();
    const env = {
        NODE_ENV: 'production',
        CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
        CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED: 'true',
        CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
        CANONICAL_LEDGER_CANARY_READ_APPROVED: 'true',
        CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'accounts,forecast'
    };
    const common = {
        userIds: ['user-owner'],
        personByUserId: { 'user-owner': 'Daniel' },
        currentDate: '2026-07-13',
        env,
        canonicalLedgerDbPath: dbPath
    };
    try {
        const accounts = await financialAgentTools.queryFinancialPlanTool({
            ...common,
            excludePublicTestMarkers: true,
            plan: {
                kind: 'financial_query',
                domain: 'accounts',
                operation: 'detail',
                filters: { scope: 'personal' },
                timeBasis: 'current_state'
            }
        });
        const forecast = await financialAgentTools.queryFinancialPlanTool({
            ...common,
            excludePublicTestMarkers: true,
            plan: {
                kind: 'financial_query',
                domain: 'forecast',
                operation: 'forecast',
                filters: { period: { type: 'date_range', from: '2026-07-01', to: '2026-07-31' } },
                sort: { by: 'due_date', direction: 'asc' },
                limit: 50,
                timeBasis: 'due_date'
            }
        });
        const sourceStillIntact = await financialAgentTools.queryFinancialPlanTool({
            ...common,
            plan: {
                kind: 'financial_query',
                domain: 'accounts',
                operation: 'detail',
                filters: { scope: 'personal' },
                timeBasis: 'current_state'
            }
        });

        assert.equal(accounts.result.value.total, 10);
        assert.deepEqual(accounts.result.value.items.map(item => item.name), ['Conta real']);
        assert.equal(forecast.result.value.receivable, 50);
        assert.deepEqual(forecast.result.value.items.map(item => item.description), ['Entrada prevista real']);
        assert.equal(sourceStillIntact.result.value.total, 1009);
        assert.equal(sourceStillIntact.result.value.count, 2);
    } finally {
        fs.rmSync(dbPath, { force: true });
        fs.rmSync(`${dbPath}-shm`, { force: true });
        fs.rmSync(`${dbPath}-wal`, { force: true });
    }
});
