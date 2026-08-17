const test = require('node:test');
const assert = require('node:assert/strict');

const {
    planOpenFinanceHistoricalImport
} = require('../src/openFinance/openFinanceHistoricalImportPlanner');

const TRANSFER_RANGE = 'Transferências!A:I';
const TRANSFER_HEADER = [
    'Data', 'Descrição', 'Valor', 'Conta Origem', 'Conta Destino',
    'Método', 'Observações', 'Status', 'user_id'
];
const BINDINGS = {
    'bank-1': {
        kind: 'bank', ownerUserId: 'person-1', ownerLabel: 'Pessoa 1',
        financialAccount: 'Conta 1', paymentMethod: 'Débito',
        reserveAccount: 'Reserva 1'
    },
    'bank-2': {
        kind: 'bank', ownerUserId: 'person-2', ownerLabel: 'Pessoa 2',
        financialAccount: 'Conta 2', paymentMethod: 'Débito'
    }
};

function transaction(overrides = {}) {
    return {
        id: 'tx-1', item_id: 'item-1', account_id: 'bank-1',
        description: 'Fornecedor exemplo', amount_cents: -3000,
        currency: 'BRL', date: '2026-01-10', status: 'POSTED',
        type: 'DEBIT', provider_id: 'provider-1', reference_number: null,
        receiver_reference_id: null, operation_type: 'PIX',
        original_date: null, bill_id: null, bill_forecast_month: null,
        installment_number: null, total_installments: null,
        ...overrides
    };
}

function plan(transactions, options = {}) {
    const accounts = options.accounts || [{ id: 'bank-1', type: 'BANK' }];
    return planOpenFinanceHistoricalImport({
        pluggySnapshot: {
            observed_at: '2026-12-31T12:00:00.000Z',
            items: [{ id: 'item-1', alias_code: 'family-source',
                accounts, transactions }]
        },
        sheetSnapshot: {
            observed_at: '2026-12-31T12:00:00.000Z',
            ranges: {
                'Saídas!A:K': [['Data']],
                'Entradas!A:J': [['Data']],
                [TRANSFER_RANGE]: [TRANSFER_HEADER],
                ...(options.ranges || {})
            }
        },
        accountBindings: options.accountBindings || BINDINGS,
        merchantRules: options.merchantRules || [],
        decisionOverrides: options.decisionOverrides || {},
        historyStartDate: '2025-07-01',
        historyEndDate: '2026-12-31'
    });
}

test('reconciles a family transfer through the public planner with formatted money', () => {
    const transactions = [
        transaction({ id: 'out', provider_id: 'out-provider', amount_cents: -1234,
            reference_number: 'pair-ref' }),
        transaction({ id: 'in', provider_id: 'in-provider', account_id: 'bank-2',
            amount_cents: 1234, type: 'CREDIT', reference_number: 'pair-ref' })
    ];
    const result = plan(transactions, {
        accounts: [{ id: 'bank-1', type: 'BANK' }, { id: 'bank-2', type: 'BANK' }],
        ranges: { [TRANSFER_RANGE]: [TRANSFER_HEADER, [
            '10/01/2026', 'Fornecedor exemplo', 'R$ 12,34', 'Conta 1',
            'Conta 2', 'Transferência',
            'Importação histórica Open Finance revisada.', 'Conferida', 'person-1'
        ]] }
    });

    assert.equal(result.entries[0].state, 'existing');
    assert.equal(result.entries[1].state, 'excluded');
    assert.equal(result.summary.ready, 0);
});

test('reconciles one-sided and reserve transfers through their public planner paths', () => {
    const oneSided = transaction({ description: 'Transferência enviada' });
    const ref = plan([oneSided]).entries[0].source_ref;
    const decisionOverrides = { [ref]: {
        classification: 'internal_transfer',
        destinationFinancialAccount: 'Conta histórica externa'
    } };
    const planned = plan([oneSided], { decisionOverrides }).entries[0];
    const written = [...planned.write_plan.row];
    written[2] = 'R$ 30,00';
    assert.equal(plan([oneSided], { decisionOverrides,
        ranges: { [TRANSFER_RANGE]: [TRANSFER_HEADER, written] }
    }).entries[0].state, 'existing');

    const reserve = transaction({ operation_type: 'RESGATE_APLIC_FINANCEIRA',
        amount_cents: 25000, type: 'CREDIT' });
    const merchantRules = [{ match: { mode: 'exact', value: 'Fornecedor exemplo' },
        classification: 'reserve_redemption' }];
    const reservePlan = plan([reserve], { merchantRules }).entries[0];
    const reserveWritten = [...reservePlan.write_plan.row];
    reserveWritten[2] = 'R$ 250,00';
    assert.equal(plan([reserve], { merchantRules,
        ranges: { [TRANSFER_RANGE]: [TRANSFER_HEADER, reserveWritten] }
    }).entries[0].state, 'existing');
});

test('fails closed for every textual field, including an isolated user_id mismatch', () => {
    const tx = transaction({ description: 'Transferência enviada' });
    const ref = plan([tx]).entries[0].source_ref;
    const decisionOverrides = { [ref]: {
        classification: 'internal_transfer',
        destinationFinancialAccount: 'Conta histórica externa'
    } };
    const expected = plan([tx], { decisionOverrides }).entries[0].write_plan.row;
    const variants = [
        [1, 'TRANSFERENCIA ENVIADA'], [3, 'CONTA 1'],
        [4, 'Conta histórica   externa!'], [5, 'TRANSFERENCIA'],
        [6, 'Importação histórica Open Finance revisada'], [7, 'CONFERIDA'],
        [8, 'person-2']
    ];

    for (const [index, value] of variants) {
        const row = [...expected];
        row[2] = 'R$ 30,00';
        row[index] = value;
        const result = plan([tx], { decisionOverrides,
            ranges: { [TRANSFER_RANGE]: [TRANSFER_HEADER, row] }
        });
        assert.equal(result.entries[0].state, 'ready', `field ${index}`);
    }
});
