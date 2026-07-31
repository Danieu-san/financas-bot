const test = require('node:test');
const assert = require('node:assert/strict');

const { __test__ } = require('../src/services/userSheetAnalyticsService');
const financialAgentTools = require('../src/agent/financialAgentTools');

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
