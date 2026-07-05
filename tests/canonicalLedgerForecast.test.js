const test = require('node:test');
const assert = require('node:assert');

const fixture = require('./fixtures/ledger/canonical-ledger-phase1.json');
const { projectLegacyRowsToCanonicalLedger } = require('../src/ledger/canonicalLedgerProjector');
const { buildCanonicalForecast } = require('../src/ledger/canonicalLedgerForecast');
const financialQueryEngine = require('../src/query/financialQueryEngine');

test('canonical forecast lists open payables without changing current cash', () => {
    const forecastFixture = structuredClone(fixture);
    forecastFixture.projectionContext = {
        competenceMonth: '2026-07',
        materializeCompetenceMonths: ['2026-07']
    };
    forecastFixture.legacyRows.saidas = [];
    forecastFixture.legacyRows.pagamentosDividas = [];
    forecastFixture.legacyRows.transferencias = [];
    forecastFixture.legacyRows.lancamentosCartao = [];
    forecastFixture.legacyRows.dividas[0] = {
        ...forecastFixture.legacyRows.dividas[0],
        source_row_id: 'dividas-futura',
        nome: 'Emprestimo futuro',
        valor_original: '2000,00',
        saldo_atual: '1700,00',
        parcela: '320,00',
        status: 'Ativa',
        vencimento: '25/07/2026'
    };

    const projected = projectLegacyRowsToCanonicalLedger(forecastFixture);
    const forecast = buildCanonicalForecast(projected, {
        from: '2026-07-01',
        to: '2026-07-31'
    });

    assert.strictEqual(forecast.criteria.dateBasis, 'due_on_or_effective_on');
    assert.strictEqual(forecast.totals.current_cash_impact_cents, 0);
    assert.strictEqual(forecast.totals.payable_cents, 44000);
    assert.deepStrictEqual(forecast.items.map(item => [
        item.type,
        item.domain,
        item.status,
        item.date,
        item.amount_cents,
        item.affects_current_cash
    ]), [
        ['payable', 'bill', 'pending', '2026-07-10', 12000, false],
        ['payable', 'debt', 'pending', '2026-07-25', 32000, false]
    ]);
});

test('canonical forecast excludes settled occurrences and reports open invoice balance once', () => {
    const projected = {
        events: [],
        lines: [],
        schedules: [],
        recurrenceOccurrences: [
            {
                recurrence_occurrence_id: 'occ-paid',
                recurrence_rule_id: 'rr-phone',
                status: 'settled',
                competence_month: '2026-07',
                due_on: '2026-07-05',
                settled_event_id: 'evt-phone-paid',
                amount_cents: 10000,
                currency: 'BRL',
                description: 'Telefone pago'
            }
        ],
        invoices: [
            {
                invoice_id: 'inv-open',
                card_key: 'nubank thais',
                card_name: 'Cartao Nubank - Thais',
                competence_month: '2026-07',
                due_on: '2026-07-29',
                currency: 'BRL',
                observed_item_total_cents: 50000,
                observed_payment_total_cents: 12000,
                status: 'partially_paid'
            }
        ],
        invoiceItems: [],
        invoicePayments: []
    };

    const forecast = buildCanonicalForecast(projected, {
        from: '2026-07-01',
        to: '2026-07-31'
    });

    assert.deepStrictEqual(forecast.items.map(item => [item.domain, item.status, item.amount_cents]), [
        ['invoice', 'pending', 38000]
    ]);
    assert.strictEqual(forecast.totals.payable_cents, 38000);
    assert.strictEqual(forecast.totals.byStatus.pending, 38000);
});

test('canonical forecast includes pending receivables and pending transfers by cash direction', () => {
    const projected = {
        events: [
            {
                event_id: 'evt-salary',
                kind: 'income',
                status: 'pending',
                description: 'Salario futuro',
                amount_cents: 500000,
                currency: 'BRL',
                due_on: '2026-07-30',
                effective_on: '2026-07-30',
                owner_person_id: 'person-daniel',
                source_type: 'sheet.entradas',
                source_row_ref: 'entradas-futura'
            },
            {
                event_id: 'evt-pix-pendente',
                kind: 'transfer',
                status: 'pending',
                description: 'Pix pendente para Thais',
                amount_cents: 832,
                currency: 'BRL',
                due_on: null,
                effective_on: '2026-07-10',
                owner_person_id: 'person-daniel',
                source_type: 'sheet.transferencias',
                source_row_ref: 'transferencia-pendente'
            }
        ],
        lines: [
            { event_id: 'evt-pix-pendente', line_type: 'cash', direction: 'outflow', amount_cents: 832 }
        ],
        schedules: [],
        recurrenceOccurrences: [],
        invoices: []
    };

    const forecast = buildCanonicalForecast(projected, {
        from: '2026-07-01',
        to: '2026-07-31'
    });

    assert.deepStrictEqual(forecast.items.map(item => [item.type, item.domain, item.date, item.amount_cents]), [
        ['payable', 'transfer', '2026-07-10', 832],
        ['receivable', 'income', '2026-07-30', 500000]
    ]);
    assert.strictEqual(forecast.totals.payable_cents, 832);
    assert.strictEqual(forecast.totals.receivable_cents, 500000);
    assert.strictEqual(forecast.totals.net_expected_cash_cents, 499168);
    assert.strictEqual(forecast.totals.current_cash_impact_cents, 0);
});
test('canonical forecast uses projected pending transfer rows as future payable', () => {
    const forecastFixture = structuredClone(fixture);
    forecastFixture.projectionContext = {
        competenceMonth: '2026-07',
        materializeCompetenceMonths: []
    };
    forecastFixture.legacyRows.contas = [];
    forecastFixture.legacyRows.saidas = [];
    forecastFixture.legacyRows.entradas = [];
    forecastFixture.legacyRows.lancamentosCartao = [];
    forecastFixture.legacyRows.dividas = [];
    forecastFixture.legacyRows.pagamentosDividas = [];
    forecastFixture.legacyRows.metas = [];
    forecastFixture.legacyRows.movimentacoesMetas = [];
    forecastFixture.legacyRows.importedTransactions = [];
    forecastFixture.legacyRows.transferencias = [
        {
            source_row_id: 'transferencias-pendente',
            user_id: 'person-daniel',
            data: '10/07/2026',
            descricao: 'PIX agendado para Thais',
            valor: '8,32',
            origem: 'Daniel - Nubank',
            destino: 'Thais - Nubank',
            metodo: 'PIX',
            status: 'Pendente'
        }
    ];

    const projected = projectLegacyRowsToCanonicalLedger(forecastFixture);
    const transfer = projected.events.find(event => event.source_row_ref === 'transferencias-pendente');
    assert.strictEqual(transfer.status, 'pending');

    const forecast = buildCanonicalForecast(projected, {
        from: '2026-07-01',
        to: '2026-07-31'
    });

    assert.deepStrictEqual(forecast.items.map(item => [item.type, item.domain, item.status, item.date, item.amount_cents]), [
        ['payable', 'transfer', 'pending', '2026-07-10', 832]
    ]);
    assert.strictEqual(forecast.totals.current_cash_impact_cents, 0);
});
test('canonical forecast handles adversarial date windows and non-open statuses', () => {
    const projected = {
        events: [
            {
                event_id: 'evt-cancelled-income',
                kind: 'income',
                status: 'cancelled',
                description: 'Receita cancelada',
                amount_cents: 99999,
                currency: 'BRL',
                due_on: '2026-07-15',
                effective_on: '2026-07-15',
                source_type: 'sheet.entradas',
                source_row_ref: 'income-cancelled'
            },
            {
                event_id: 'evt-effective-transfer',
                kind: 'transfer',
                status: 'pending',
                description: 'Transferencia sem vencimento explicito',
                amount_cents: 2222,
                currency: 'BRL',
                due_on: null,
                effective_on: '2026-07-31',
                source_type: 'sheet.transferencias',
                source_row_ref: 'transfer-effective'
            }
        ],
        lines: [
            { event_id: 'evt-effective-transfer', line_type: 'cash', direction: 'outflow', amount_cents: 2222 }
        ],
        schedules: [],
        recurrenceOccurrences: [
            {
                recurrence_occurrence_id: 'occ-uncertain-month-end',
                recurrence_rule_id: 'rr-gas',
                status: 'uncertain',
                competence_month: '2026-07',
                due_on: '2026-07-31',
                amount_cents: 7777,
                currency: 'BRL',
                description: 'Gas fim de mes'
            },
            {
                recurrence_occurrence_id: 'occ-cancelled-inside-window',
                recurrence_rule_id: 'rr-internet',
                status: 'cancelled',
                competence_month: '2026-07',
                due_on: '2026-07-20',
                amount_cents: 8888,
                currency: 'BRL',
                description: 'Internet cancelada'
            },
            {
                recurrence_occurrence_id: 'occ-outside-window',
                recurrence_rule_id: 'rr-phone',
                status: 'pending',
                competence_month: '2026-08',
                due_on: '2026-08-01',
                amount_cents: 6666,
                currency: 'BRL',
                description: 'Telefone fora da janela'
            }
        ],
        invoices: [
            {
                invoice_id: 'inv-cancelled',
                card_name: 'Cartao cancelado',
                competence_month: '2026-07',
                due_on: '2026-07-29',
                currency: 'BRL',
                observed_item_total_cents: 12345,
                observed_payment_total_cents: 0,
                status: 'cancelled'
            }
        ]
    };

    const forecast = buildCanonicalForecast(projected, {
        from: '2026-07-01',
        to: '2026-07-31'
    });

    assert.strictEqual(forecast.criteria.dateBasis, 'due_on_or_effective_on');
    assert.deepStrictEqual(forecast.items.map(item => [item.domain, item.status, item.date, item.amount_cents]), [
        ['bill', 'uncertain', '2026-07-31', 7777],
        ['transfer', 'pending', '2026-07-31', 2222]
    ]);
    assert.strictEqual(forecast.totals.payable_cents, 9999);
    assert.strictEqual(forecast.totals.receivable_cents, 0);
    assert.strictEqual(forecast.totals.current_cash_impact_cents, 0);
    assert.strictEqual(forecast.totals.byStatus.uncertain, 7777);
    assert.strictEqual(forecast.totals.byStatus.pending, 2222);
    assert.doesNotMatch(JSON.stringify(forecast), /cancelada|fora da janela|Cartao cancelado/i);
});
test('canonical forecast recurring bills match legacy Query Engine pending bill totals where comparable', async () => {
    const forecastFixture = structuredClone(fixture);
    forecastFixture.projectionContext = {
        competenceMonth: '2026-02',
        materializeCompetenceMonths: ['2026-02']
    };
    forecastFixture.legacyRows.contas = [
        {
            source_row_id: 'conta-aluguel-parity',
            user_id: 'user-a',
            categoria: 'Moradia',
            subcategoria: 'ALUGUEL',
            nome: 'Aluguel',
            nome_conta: 'GRPQAMoradia',
            dia_vencimento: '10',
            valor_esperado: '1200,00',
            regra_ativa: 'SIM',
            observacoes: 'Apartamento'
        },
        {
            source_row_id: 'conta-internet-parity',
            user_id: 'user-a',
            categoria: 'Moradia',
            subcategoria: 'INTERNET / TELEFONE',
            nome: 'Internet',
            nome_conta: 'NET-FIBRA',
            dia_vencimento: '28',
            valor_esperado: '120,00',
            regra_ativa: 'SIM',
            observacoes: ''
        }
    ];
    forecastFixture.legacyRows.saidas = [
        {
            source_row_id: 'saida-aluguel-parity',
            user_id: 'user-a',
            data: '09/02/2026',
            descricao: 'Pagamento aluguel apartamento',
            categoria: 'Moradia',
            subcategoria: 'ALUGUEL',
            valor: '1200,00',
            pagamento: 'PIX',
            recorrente: 'Sim'
        }
    ];
    forecastFixture.legacyRows.entradas = [];
    forecastFixture.legacyRows.transferencias = [];
    forecastFixture.legacyRows.lancamentosCartao = [];
    forecastFixture.legacyRows.dividas = [];
    forecastFixture.legacyRows.pagamentosDividas = [];
    forecastFixture.legacyRows.metas = [];
    forecastFixture.legacyRows.movimentacoesMetas = [];
    forecastFixture.legacyRows.importedTransactions = [];

    const projected = projectLegacyRowsToCanonicalLedger(forecastFixture);
    const forecast = buildCanonicalForecast(projected, {
        from: '2026-02-01',
        to: '2026-02-28'
    });
    const billForecastItems = forecast.items.filter(item => item.domain === 'bill' && item.status === 'pending');

    const legacy = await financialQueryEngine.executeFinancialQuery({
        kind: 'financial_query',
        domain: 'bills',
        operation: 'compare',
        filters: { period: { type: 'month', month: 1, year: 2026 } },
        timeBasis: 'due_date',
        answerStyle: 'audit'
    }, {
        currentDate: '28/02/2026',
        scopeUserIds: ['user-a'],
        contas: [
            ['Categoria', 'Nome Amigável', 'Dia do Vencimento', 'Valor Esperado', 'Regra Ativa', 'Subcategoria', 'Nome da Conta', 'Observações', 'user_id'],
            ['Moradia', 'Aluguel', '10', '1200,00', 'SIM', 'ALUGUEL', 'GRPQAMoradia', 'Apartamento', 'user-a'],
            ['Moradia', 'Internet', '28', '120,00', 'SIM', 'INTERNET / TELEFONE', 'NET-FIBRA', '', 'user-a']
        ],
        saidas: [
            ['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Obs', 'user_id'],
            ['09/02/2026', 'Pagamento aluguel apartamento', 'Moradia', 'ALUGUEL', '1200,00', '', 'PIX', 'Sim', '', 'user-a']
        ]
    });

    assert.strictEqual(legacy.ok, true);
    assert.deepStrictEqual(billForecastItems.map(item => [item.description, item.amount_cents]), [
        ['Internet', 12000]
    ]);
    assert.strictEqual(forecast.totals.current_cash_impact_cents, 0);
    assert.strictEqual(
        billForecastItems.reduce((sum, item) => sum + item.amount_cents, 0),
        Math.round(legacy.result.value.totals.pending * 100)
    );
    assert.match(legacy.result.value.criteria, /data de vencimento/i);
});
