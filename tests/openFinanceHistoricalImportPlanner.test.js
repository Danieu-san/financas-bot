const test = require('node:test');
const assert = require('node:assert/strict');

const {
    planOpenFinanceHistoricalImport
} = require('../src/openFinance/openFinanceHistoricalImportPlanner');

function transaction(overrides = {}) {
    return {
        id: 'tx-1',
        item_id: 'item-1',
        account_id: 'bank-1',
        description: 'Fornecedor exemplo',
        amount_cents: -10000,
        currency: 'BRL',
        date: '2026-01-10',
        status: 'POSTED',
        type: 'DEBIT',
        provider_id: 'provider-1',
        reference_number: null,
        receiver_reference_id: null,
        operation_type: '',
        original_date: null,
        bill_id: null,
        bill_forecast_month: null,
        installment_number: null,
        total_installments: null,
        ...overrides
    };
}

function pluggy(transactions, accounts = [{ id: 'bank-1', type: 'BANK' }]) {
    return {
        observed_at: '2026-01-31T12:00:00.000Z',
        items: [{
            id: 'item-1',
            alias_code: 'family-source',
            accounts,
            transactions
        }]
    };
}

function sheet(ranges = {}) {
    return {
        observed_at: '2026-02-01T12:00:00.000Z',
        source: 'central_legacy',
        ranges: {
            'Saídas!A:K': [[
                'Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor',
                'Responsável', 'Pagamento', 'Recorrente', 'Observações',
                'user_id', 'Conta Financeira'
            ]],
            'Entradas!A:J': [[
                'Data', 'Descrição', 'Categoria', 'Valor', 'Responsável',
                'Recebimento', 'Recorrente', 'Observações', 'user_id',
                'Conta Financeira'
            ]],
            'Transferências!A:I': [[
                'Data', 'Descrição', 'Valor', 'Conta Origem', 'Conta Destino',
                'Método', 'Observações', 'Status', 'user_id'
            ]],
            "'Cartão Familiar'!A:J": [[
                'Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela',
                'Mês de Cobrança', 'user_id'
            ]],
            ...ranges
        }
    };
}

const bindings = {
    'bank-1': {
        kind: 'bank',
        ownerUserId: 'person-1',
        ownerLabel: 'Pessoa 1',
        financialAccount: 'Conta 1',
        paymentMethod: 'Débito',
        reserveAccount: 'Reserva 1'
    },
    'card-1': {
        kind: 'card',
        ownerUserId: 'person-1',
        ownerLabel: 'Pessoa 1',
        sheetName: 'Cartão Familiar',
        closingDay: 20
    }
};

function plan(transactions, options = {}) {
    const accounts = options.accounts || [
        { id: 'bank-1', type: 'BANK' },
        { id: 'card-1', type: 'CREDIT' }
    ];
    return planOpenFinanceHistoricalImport({
        pluggySnapshot: pluggy(transactions, accounts),
        sheetSnapshot: sheet(options.ranges),
        accountBindings: options.accountBindings || bindings,
        merchantRules: options.merchantRules || [],
        decisionOverrides: options.decisionOverrides || {},
        includeOpenInvoiceCurrentPurchases:
            options.includeOpenInvoiceCurrentPurchases === true,
        historyStartDate: '2025-07-01',
        historyEndDate: '2026-12-31'
    });
}

test('applies only an explicit private merchant rule and keeps financial writes at zero', () => {
    const result = plan([transaction({ description: 'Imobiliaria exemplo mensal' })], {
        merchantRules: [{
            match: { mode: 'contains', value: 'imobiliaria exemplo' },
            classification: 'expense',
            category: 'Moradia',
            subcategory: 'Aluguel'
        }]
    });

    assert.equal(result.financial_writes, 0);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].state, 'ready');
    assert.equal(result.entries[0].classification, 'expense');
    assert.equal(result.entries[0].write_plan.sheet_name, 'Saídas');
    assert.equal(result.entries[0].write_plan.row[2], 'Moradia');
    assert.equal(result.entries[0].write_plan.row[3], 'Aluguel');
});

test('preserves a registered recurring-bill suggestion in the planned bank row', () => {
    const tx = transaction({
        id: 'registered-bill',
        provider_id: 'registered-bill-provider',
        description: 'Prestador recorrente',
        amount_cents: -10000
    });
    const stableRef = plan([tx]).entries[0].source_ref;
    const result = plan([tx], {
        decisionOverrides: {
            [stableRef]: {
                suggestedCategory: 'Educação',
                suggestedSubcategory: 'Aula',
                suggestedRecurring: true,
                suggestionOrigin: 'registered_recurring_bill'
            }
        }
    });

    assert.equal(result.entries[0].state, 'ready');
    assert.equal(result.entries[0].write_plan.row[2], 'Educação');
    assert.equal(result.entries[0].write_plan.row[3], 'Aula');
    assert.equal(result.entries[0].write_plan.row[7], 'Sim');
    assert.equal(result.financial_writes, 0);
});

test('does not add a recurring field to a card row from a recurring suggestion', () => {
    const tx = transaction({
        id: 'registered-card-bill',
        provider_id: 'registered-card-bill-provider',
        account_id: 'card-1',
        description: 'Prestador recorrente no cartao',
        amount_cents: 10000,
        bill_forecast_month: '2026-01'
    });
    const stableRef = plan([tx]).entries[0].source_ref;
    const result = plan([tx], {
        decisionOverrides: {
            [stableRef]: {
                suggestedCategory: 'Educacao',
                suggestedSubcategory: 'Aula',
                suggestedRecurring: true,
                suggestionOrigin: 'registered_recurring_bill'
            }
        }
    });

    assert.equal(result.entries[0].state, 'ready');
    assert.equal(result.entries[0].write_plan.sheet_name, bindings['card-1'].sheetName);
    assert.equal(result.entries[0].write_plan.row.length, 7);
    assert.equal(result.entries[0].write_plan.row.includes('Sim'), false);
    assert.equal(result.financial_writes, 0);
});

test('excludes an explicitly confirmed bank card-payment instead of creating an expense', () => {
    const result = plan([transaction({
        description: 'Pagamento de fatura',
        amount_cents: -12345,
        account_id: 'bank-1'
    })], {
        merchantRules: [{
            match: { mode: 'exact', value: 'Pagamento de fatura' },
            classification: 'card_payment',
            category: '',
            subcategory: ''
        }]
    });

    assert.equal(result.financial_writes, 0);
    assert.equal(result.entries[0].state, 'excluded');
    assert.equal(result.entries[0].classification, 'card_bill_payment');
    assert.equal(result.entries[0].reason, 'confirmed_card_bill_payment');
    assert.equal(result.entries[0].write_plan, undefined);
});

test('card-payment rules fail closed for bank credits and credit-card transactions', () => {
    const merchantRules = [{
        match: { mode: 'exact', value: 'Pagamento de fatura' },
        classification: 'card_payment',
        category: '',
        subcategory: ''
    }];
    const bankCredit = plan([transaction({
        description: 'Pagamento de fatura',
        amount_cents: 12345,
        account_id: 'bank-1'
    })], { merchantRules });
    const cardCredit = plan([transaction({
        description: 'Pagamento de fatura',
        amount_cents: -12345,
        account_id: 'card-1'
    })], { merchantRules });

    assert.equal(bankCredit.entries[0].state, 'needs_review');
    assert.notEqual(bankCredit.entries[0].reason, 'confirmed_card_bill_payment');
    assert.equal(cardCredit.entries[0].state, 'needs_review');
    assert.equal(cardCredit.entries[0].reason, 'refund_or_card_payment_requires_link');
    assert.equal(bankCredit.financial_writes, 0);
    assert.equal(cardCredit.financial_writes, 0);
});

test('neutralizes a mutually unique two-sided card bill payment', () => {
    const merchantRules = [{
        match: { mode: 'exact', value: 'Pagamento de fatura' },
        classification: 'card_payment',
        category: '',
        subcategory: ''
    }];
    const bankDebit = transaction({
        id: 'bill-payment-bank', provider_id: 'bill-payment-bank-provider',
        description: 'Pagamento de fatura', amount_cents: -12345,
        account_id: 'bank-1', type: 'DEBIT', date: '2026-01-10'
    });
    const cardCredit = transaction({
        id: 'bill-payment-card', provider_id: 'bill-payment-card-provider',
        description: 'Pagamento recebido', amount_cents: -12345,
        account_id: 'card-1', type: 'CREDIT', date: '2026-01-11'
    });

    const forward = plan([bankDebit, cardCredit], { merchantRules });
    const reversed = plan([cardCredit, bankDebit], { merchantRules });

    assert.deepEqual(forward.entries.map(current => [
        current.state, current.classification, current.reason
    ]), [
        ['excluded', 'card_bill_payment', 'strong_two_sided_card_payment'],
        ['excluded', 'card_bill_payment_counterpart',
            'strong_two_sided_card_payment']
    ]);
    assert.deepEqual(reversed.entries.map(current => [
        current.state, current.classification, current.reason
    ]), [
        ['excluded', 'card_bill_payment_counterpart',
            'strong_two_sided_card_payment'],
        ['excluded', 'card_bill_payment', 'strong_two_sided_card_payment']
    ]);
    assert.equal(forward.financial_writes, 0);
    assert.equal(reversed.financial_writes, 0);
    assert.equal(forward.entries.some(current => current.write_plan), false);
    assert.equal(reversed.entries.some(current => current.write_plan), false);
});

test('neutralizes only an exact and strongly linked card-payment reversal', () => {
    const accountBindings = {
        'bank-payer': {
            kind: 'bank', ownerUserId: 'payer', ownerLabel: 'Pagador',
            financialAccount: 'Conta Pagador', paymentMethod: 'Débito'
        },
        'bank-card-owner': {
            kind: 'bank', ownerUserId: 'card-owner', ownerLabel: 'Titular',
            financialAccount: 'Conta Titular', paymentMethod: 'Débito'
        },
        'card-owner': {
            kind: 'card', ownerUserId: 'card-owner', ownerLabel: 'Titular',
            sheetName: 'Cartão Familiar', closingDay: 20
        }
    };
    const accounts = [
        { id: 'bank-payer', type: 'BANK' },
        { id: 'bank-card-owner', type: 'BANK' },
        { id: 'card-owner', type: 'CREDIT' }
    ];
    const merchantRules = [{
        match: { mode: 'exact', value: 'Pagamento de fatura' },
        classification: 'card_payment', category: '', subcategory: ''
    }];
    const bankPayment = transaction({
        id: 'bank-payment', provider_id: 'bank-payment-provider',
        item_id: 'payer-item', account_id: 'bank-payer',
        description: 'Pagamento de fatura', amount_cents: -12345,
        type: 'DEBIT', date: '2026-01-10T10:00:00.000Z'
    });
    const cardCredit = transaction({
        id: 'card-credit', provider_id: 'card-credit-provider',
        item_id: 'card-owner-item', account_id: 'card-owner',
        description: 'Pagamento recebido', amount_cents: -12345,
        type: 'CREDIT', date: '2026-01-10T03:00:00.000Z'
    });
    const reversal = transaction({
        id: 'payment-reversal', provider_id: 'payment-reversal-provider',
        item_id: 'card-owner-item', account_id: 'bank-card-owner',
        description: 'Ajuste (Nubank)', amount_cents: 12345,
        type: 'CREDIT', operation_type: 'OUTROS',
        date: '2026-01-10T10:20:00.000Z'
    });
    const first = plan([bankPayment, cardCredit, reversal], {
        accountBindings, accounts, merchantRules
    });
    const reversalRef = first.entries[2].source_ref;
    const result = plan([bankPayment, cardCredit, reversal], {
        accountBindings, accounts, merchantRules,
        decisionOverrides: {
            [reversalRef]: { classification: 'card_payment_reversal' }
        }
    });

    assert.deepEqual(result.entries.map(current => [
        current.state, current.classification, current.reason
    ]), [
        ['excluded', 'card_bill_payment', 'strong_two_sided_card_payment'],
        ['excluded', 'card_bill_payment_counterpart',
            'strong_two_sided_card_payment'],
        ['excluded', 'card_payment_reversal',
            'strong_linked_card_payment_reversal']
    ]);
    assert.equal(result.entries.some(current => current.write_plan), false);
    assert.equal(result.financial_writes, 0);
});

test('keeps reviewed card-payment reversals closed without the full causal link', () => {
    const accountBindings = {
        'bank-payer': {
            kind: 'bank', ownerUserId: 'payer', ownerLabel: 'Pagador',
            financialAccount: 'Conta Pagador', paymentMethod: 'Débito'
        },
        'bank-card-owner': {
            kind: 'bank', ownerUserId: 'card-owner', ownerLabel: 'Titular',
            financialAccount: 'Conta Titular', paymentMethod: 'Débito'
        },
        'bank-other': {
            kind: 'bank', ownerUserId: 'other-owner', ownerLabel: 'Terceiro',
            financialAccount: 'Conta Terceiro', paymentMethod: 'Débito'
        },
        'card-owner': {
            kind: 'card', ownerUserId: 'card-owner', ownerLabel: 'Titular',
            sheetName: 'Cartão Familiar', closingDay: 20
        }
    };
    const accounts = [
        { id: 'bank-payer', type: 'BANK' },
        { id: 'bank-card-owner', type: 'BANK' },
        { id: 'bank-other', type: 'BANK' },
        { id: 'card-owner', type: 'CREDIT' }
    ];
    const merchantRules = [{
        match: { mode: 'exact', value: 'Pagamento de fatura' },
        classification: 'card_payment', category: '', subcategory: ''
    }];
    const bankPayment = transaction({
        id: 'bank-payment-control', provider_id: 'bank-payment-control-provider',
        item_id: 'payer-item', account_id: 'bank-payer',
        description: 'Pagamento de fatura', amount_cents: -12345,
        type: 'DEBIT', date: '2026-01-10T10:00:00.000Z'
    });
    const cardCredit = transaction({
        id: 'card-credit-control', provider_id: 'card-credit-control-provider',
        item_id: 'card-owner-item', account_id: 'card-owner',
        description: 'Pagamento recebido', amount_cents: -12345,
        type: 'CREDIT', date: '2026-01-10T03:00:00.000Z'
    });
    const template = transaction({
        id: 'payment-reversal-control',
        provider_id: 'payment-reversal-control-provider',
        item_id: 'card-owner-item', account_id: 'bank-card-owner',
        description: 'Ajuste (Nubank)', amount_cents: 12345,
        type: 'CREDIT', operation_type: 'OUTROS',
        date: '2026-01-10T10:20:00.000Z'
    });
    const controls = [
        { name: 'pending', patch: { status: 'PENDING' } },
        { name: 'wrong-item', patch: { item_id: 'unrelated-item' } },
        { name: 'wrong-owner', patch: { account_id: 'bank-other' } },
        { name: 'wrong-amount', patch: { amount_cents: 12346 } },
        { name: 'before-payment', patch: { date: '2026-01-10T09:59:59.000Z' } },
        { name: 'too-late', patch: { date: '2026-01-14T10:20:00.000Z' } },
        { name: 'wrong-direction', patch: { amount_cents: -12345, type: 'DEBIT' } },
        { name: 'foreign-currency', patch: { currency: 'USD' } }
    ];

    for (const control of controls) {
        const reversal = { ...template, ...control.patch,
            id: 'reversal-' + control.name,
            provider_id: 'reversal-provider-' + control.name };
        const preliminary = plan([bankPayment, cardCredit, reversal], {
            accountBindings, accounts, merchantRules
        });
        const reversalRef = preliminary.entries[2].source_ref;
        const result = plan([bankPayment, cardCredit, reversal], {
            accountBindings, accounts, merchantRules,
            decisionOverrides: {
                [reversalRef]: { classification: 'card_payment_reversal' }
            }
        });
        assert.notEqual(result.entries[2].reason,
            'strong_linked_card_payment_reversal', control.name);
        assert.equal(result.entries[2].write_plan, undefined, control.name);
        assert.equal(result.financial_writes, 0, control.name);
    }

    const reversalA = { ...template, id: 'ambiguous-reversal-a',
        provider_id: 'ambiguous-reversal-provider-a' };
    const reversalB = { ...template, id: 'ambiguous-reversal-b',
        provider_id: 'ambiguous-reversal-provider-b',
        date: '2026-01-10T10:21:00.000Z' };
    const ambiguousFirst = plan([
        bankPayment, cardCredit, reversalA, reversalB
    ], { accountBindings, accounts, merchantRules });
    const ambiguous = plan([bankPayment, cardCredit, reversalA, reversalB], {
        accountBindings, accounts, merchantRules,
        decisionOverrides: {
            [ambiguousFirst.entries[2].source_ref]: {
                classification: 'card_payment_reversal'
            },
            [ambiguousFirst.entries[3].source_ref]: {
                classification: 'card_payment_reversal'
            }
        }
    });
    assert.deepEqual(ambiguous.entries.slice(2).map(current => current.reason), [
        'positive_bank_movement_requires_semantic_decision',
        'positive_bank_movement_requires_semantic_decision'
    ]);
    assert.equal(ambiguous.entries.some(current => current.write_plan), false);
    assert.equal(ambiguous.financial_writes, 0);

    const repeatedIdentity = { ...template, id: 'repeated-identity-copy',
        provider_id: template.provider_id,
        date: '2026-01-10T10:21:00.000Z' };
    const repeatedFirst = plan([
        bankPayment, cardCredit, template, repeatedIdentity
    ], { accountBindings, accounts, merchantRules });
    const repeated = plan([
        bankPayment, cardCredit, template, repeatedIdentity
    ], {
        accountBindings, accounts, merchantRules,
        decisionOverrides: {
            [repeatedFirst.entries[2].source_ref]: {
                classification: 'card_payment_reversal'
            }
        }
    });
    assert.notEqual(repeated.entries[2].reason,
        'strong_linked_card_payment_reversal');
    assert.equal(repeated.entries[2].write_plan, undefined);

    const recordedFirst = plan([bankPayment, cardCredit, template], {
        accountBindings, accounts, merchantRules
    });
    const recorded = plan([bankPayment, cardCredit, template], {
        accountBindings, accounts, merchantRules,
        ranges: {
            'Entradas!A:J': [
                sheet().ranges['Entradas!A:J'][0],
                ['10/01/2026', 'Ajuste (Nubank)', 'Outros', 123.45,
                    'Titular', 'Conta Corrente', 'Não', '',
                    'card-owner', 'Conta Titular']
            ]
        },
        decisionOverrides: {
            [recordedFirst.entries[2].source_ref]: {
                classification: 'card_payment_reversal'
            }
        }
    });
    assert.equal(recorded.entries[2].state, 'existing');
    assert.notEqual(recorded.entries[2].reason,
        'strong_linked_card_payment_reversal');
    assert.equal(recorded.entries[2].write_plan, undefined);

    const probableFirst = plan([bankPayment, cardCredit, template], {
        accountBindings, accounts, merchantRules
    });
    const probable = plan([bankPayment, cardCredit, template], {
        accountBindings, accounts, merchantRules,
        ranges: {
            'Entradas!A:J': [
                sheet().ranges['Entradas!A:J'][0],
                ['10/01/2026', 'Lancamento manual diferente', 'Outros', 123.45,
                    'Titular', 'Conta Corrente', 'Não', '',
                    'card-owner', 'Conta Titular']
            ]
        },
        decisionOverrides: {
            [probableFirst.entries[2].source_ref]: {
                classification: 'card_payment_reversal'
            }
        }
    });
    assert.equal(probable.entries[2].state, 'possible_duplicate');
    assert.equal(probable.entries[2].reason,
        'strong_non_identical_sheet_match');
    assert.notEqual(probable.entries[2].reason,
        'strong_linked_card_payment_reversal');
    assert.equal(probable.entries[2].write_plan, undefined);
    assert.equal(probable.financial_writes, 0);

    const secondPayment = { ...bankPayment, id: 'second-payment',
        provider_id: 'second-payment-provider',
        date: '2026-01-11T10:00:00.000Z' };
    const secondCredit = { ...cardCredit, id: 'second-card-credit',
        provider_id: 'second-card-credit-provider',
        date: '2026-01-11T03:00:00.000Z' };
    const inverseFirst = plan([
        bankPayment, cardCredit, secondPayment, secondCredit, template
    ], { accountBindings, accounts, merchantRules });
    const inverse = plan([
        bankPayment, cardCredit, secondPayment, secondCredit, template
    ], {
        accountBindings, accounts, merchantRules,
        decisionOverrides: {
            [inverseFirst.entries[4].source_ref]: {
                classification: 'card_payment_reversal'
            }
        }
    });
    assert.notEqual(inverse.entries[4].reason,
        'strong_linked_card_payment_reversal');
    assert.equal(inverse.entries[4].write_plan, undefined);
    assert.equal(inverse.financial_writes, 0);
});

test('excludes explicit card-side payments while keeping non-payment credits closed', () => {
    const merchantRules = [{
        match: { mode: 'contains', value: 'Pagamento de fatura' },
        classification: 'card_payment',
        category: '',
        subcategory: ''
    }];
    const shared = {
        description: 'Pagamento de fatura', amount_cents: -12345,
        account_id: 'bank-1', type: 'DEBIT'
    };
    const result = plan([
        transaction({ ...shared, id: 'bank-a', provider_id: 'bank-a',
            date: '2026-01-10' }),
        transaction({ ...shared, id: 'bank-b', provider_id: 'bank-b',
            date: '2026-01-11' }),
        transaction({ id: 'ambiguous-credit', provider_id: 'ambiguous-credit',
            description: 'Pagamento recebido', amount_cents: -12345,
            account_id: 'card-1', type: 'CREDIT', date: '2026-01-11' }),
        transaction({ id: 'stale-credit', provider_id: 'stale-credit',
            description: 'Pagamento recebido', amount_cents: -67890,
            account_id: 'card-1', type: 'CREDIT', date: '2026-01-20' }),
        transaction({ id: 'non-payment-credit', provider_id: 'non-payment-credit',
            description: 'CrÃ©dito de atraso', amount_cents: -5555,
            account_id: 'card-1', type: 'CREDIT', date: '2026-01-10' })
    ], { merchantRules });

    assert.deepEqual(result.entries.map(current => current.state), [
        'excluded', 'excluded', 'excluded', 'excluded', 'needs_review'
    ]);
    assert.deepEqual(result.entries.slice(2).map(current => current.reason), [
        'explicit_card_payment_credit',
        'explicit_card_payment_credit',
        'refund_or_card_payment_requires_link'
    ]);
    assert.equal(result.financial_writes, 0);
});

test('excludes the explicit card side when the bank payment is already recorded', () => {
    const bankRangeName = Object.keys(sheet().ranges)[0];
    const ranges = {
        [bankRangeName]: [
            sheet().ranges[bankRangeName][0],
            ['10/01/2026', 'Pagamento de fatura', 'Outros', '', 123.45,
                'Pessoa 1', 'DÃ©bito', 'NÃ£o', '', 'person-1', 'Conta 1']
        ]
    };
    const result = plan([
        transaction({
            id: 'recorded-bank-payment', provider_id: 'recorded-bank-provider',
            description: 'Pagamento de fatura', amount_cents: -12345,
            account_id: 'bank-1', type: 'DEBIT', date: '2026-01-10'
        }),
        transaction({
            id: 'unlinked-card-credit', provider_id: 'unlinked-card-provider',
            description: 'Pagamento recebido', amount_cents: -12345,
            account_id: 'card-1', type: 'CREDIT', date: '2026-01-10'
        })
    ], {
        ranges,
        merchantRules: [{
            match: { mode: 'exact', value: 'Pagamento de fatura' },
            classification: 'card_payment',
            category: '',
            subcategory: ''
        }]
    });

    assert.equal(result.entries[0].state, 'existing');
    assert.equal(result.entries[1].state, 'excluded');
    assert.equal(result.entries[1].classification,
        'card_bill_payment_counterpart');
    assert.equal(result.entries[1].reason, 'explicit_card_payment_credit');
    assert.equal(result.financial_writes, 0);
});

test('does not deduplicate a card purchase against the bank expense sheet', () => {
    const result = plan([transaction({
        account_id: 'card-1',
        amount_cents: 10000,
        description: 'Fornecedor exemplo',
        bill_forecast_month: '2026-01'
    })], {
        ranges: {
            'Saídas!A:K': [
                sheet().ranges['Saídas!A:K'][0],
                ['10/01/2026', 'Fornecedor exemplo', 'Outros', '', 100,
                    'Pessoa 1', 'Débito', 'Não', '', 'person-1', 'Conta 1']
            ]
        },
        merchantRules: [{
            match: { mode: 'exact', value: 'Fornecedor exemplo' },
            classification: 'expense',
            category: 'Outros',
            subcategory: ''
        }]
    });

    assert.equal(result.entries[0].state, 'ready');
    assert.equal(result.entries[0].write_plan.sheet_name, 'Cartão Familiar');
});

test('separates exact existing rows from strong but non-identical probable duplicates', () => {
    const header = sheet().ranges['Saídas!A:K'][0];
    const ranges = {
        'Saídas!A:K': [
            header,
            ['10/01/2026', 'Fornecedor exemplo', 'Outros', '', 100,
                'Pessoa 1', 'Débito', 'Não', '', 'person-1', 'Conta 1'],
            ['11/01/2026', 'Mercado Central Loja', 'Alimentação', '', 55,
                'Pessoa 1', 'Débito', 'Não', '', 'person-1', 'Conta 1']
        ]
    };
    const result = plan([
        transaction(),
        transaction({
            id: 'tx-2',
            provider_id: 'provider-2',
            description: 'Mercado Central Loja 01',
            amount_cents: -5500,
            date: '2026-01-10'
        })
    ], { ranges });

    assert.equal(result.entries[0].state, 'existing');
    assert.equal(result.entries[1].state, 'possible_duplicate');
    assert.equal(result.summary.existing, 1);
    assert.equal(result.summary.possible_duplicate, 1);
});

test('holds same-account same-day same-value rows for duplicate review despite text drift', () => {
    const header = sheet().ranges['Saídas!A:K'][0];
    const result = plan([transaction({ description: 'Texto totalmente diferente' })], {
        ranges: {
            'Saídas!A:K': [
                header,
                ['10/01/2026', 'Lançamento manual', 'Outros', '', 100,
                    'Pessoa 1', 'Débito', 'Não', '', 'person-1', 'Conta 1']
            ]
        }
    });

    assert.equal(result.entries[0].state, 'possible_duplicate');
    assert.equal(result.entries[0].reason, 'strong_non_identical_sheet_match');
});

test('defers an ordinary pending card purchase but preserves a future installment schedule', () => {
    const result = plan([
        transaction({
            account_id: 'card-1',
            amount_cents: 4500,
            status: 'PENDING',
            id: 'pending-purchase',
            provider_id: 'pending-provider'
        }),
        transaction({
            account_id: 'card-1',
            amount_cents: 3000,
            status: 'PENDING',
            date: '2026-03-10',
            id: 'future-installment',
            provider_id: 'future-provider',
            installment_number: 3,
            total_installments: 6,
            bill_forecast_month: '2026-03'
        })
    ], {
        merchantRules: [{
            match: { mode: 'exact', value: 'Fornecedor exemplo' },
            classification: 'expense',
            category: 'Outros',
            subcategory: ''
        }]
    });

    assert.equal(result.entries[0].state, 'excluded');
    assert.equal(result.entries[0].classification, 'pending_card_purchase');
    assert.equal(result.entries[1].state, 'ready');
    assert.equal(result.entries[1].classification, 'planned_card_installment');
    assert.equal(result.entries[1].write_plan.row[4], '3/6');
});

test('incremental opt-in admits only current open-invoice purchases and keeps raw provider state', () => {
    const merchantRules = [{
        match: { mode: 'contains', value: 'compra corrente' },
        classification: 'expense', category: 'Outros', subcategory: ''
    }];
    const result = plan([
        transaction({
            account_id: 'card-1', id: 'current', provider_id: 'provider-current',
            amount_cents: 4500, status: 'PENDING', type: 'DEBIT',
            description: 'Compra corrente', bill_forecast_month: '2026-01'
        }),
        transaction({
            account_id: 'card-1', id: 'descriptor-installment',
            provider_id: 'provider-descriptor-installment', amount_cents: 4200,
            status: 'PENDING', type: 'DEBIT', description: 'Compra corrente 1/4',
            bill_forecast_month: '2026-01'
        }),
        transaction({
            account_id: 'card-1', id: 'metadata-installment',
            provider_id: 'provider-metadata-installment', amount_cents: 4300,
            status: 'PENDING', type: 'DEBIT', description: 'Compra corrente',
            installment_number: 1, total_installments: 4,
            bill_forecast_month: '2026-01'
        }),
        transaction({
            account_id: 'card-1', id: 'pending-credit',
            provider_id: 'provider-pending-credit', amount_cents: -4500,
            status: 'PENDING', type: 'CREDIT', description: 'Estorno compra corrente',
            bill_forecast_month: '2026-01'
        }),
        transaction({
            account_id: 'card-1', id: 'overdue-balance',
            provider_id: 'provider-overdue-balance', amount_cents: 4400,
            status: 'PENDING', type: 'DEBIT', description: 'Saldo em atraso',
            bill_forecast_month: '2026-01'
        })
    ], { merchantRules, includeOpenInvoiceCurrentPurchases: true });

    assert.equal(result.include_open_invoice_current_purchases, true);
    assert.equal(result.entries[0].state, 'ready');
    assert.equal(result.entries[0].classification, 'card_expense');
    assert.equal(result.entries[0].reason, 'reviewable_open_invoice_purchase');
    assert.equal(result.entries[0].review_context.provider_state, 'PENDING');
    assert.equal(result.entries[0].review_context.source_classification, 'purchase');
    assert.equal(result.entries[1].state, 'excluded');
    assert.equal(result.entries[2].state, 'excluded');
    assert.equal(result.entries[3].state, 'excluded');
    assert.equal(result.entries[4].state, 'excluded');
    assert.equal(result.financial_writes, 0);
});

test('keeps reserve principal neutral and emits a transfer plan only with a bound reserve', () => {
    const result = plan([transaction({
        operation_type: 'RESGATE_APLIC_FINANCEIRA',
        amount_cents: 25000,
        type: 'CREDIT'
    })], {
        merchantRules: [{
            match: { mode: 'exact', value: 'Fornecedor exemplo' },
            classification: 'reserve_redemption'
        }]
    });

    assert.equal(result.entries[0].state, 'ready');
    assert.equal(result.entries[0].classification, 'reserve_transfer');
    assert.equal(result.entries[0].write_plan.sheet_name, 'Transferências');
    assert.equal(result.entries[0].write_plan.row[3], 'Reserva 1');
    assert.equal(result.entries[0].write_plan.row[4], 'Conta 1');
    assert.equal(result.entries[0].financial_writes, 0);
});

test('consolidates a strong two-sided family transfer into one write plan', () => {
    const accountBindings = {
        ...bindings,
        'bank-2': {
            kind: 'bank',
            ownerUserId: 'person-2',
            ownerLabel: 'Pessoa 2',
            financialAccount: 'Conta 2',
            paymentMethod: 'Débito'
        }
    };
    const result = plan([
        transaction({
            id: 'outbound',
            provider_id: 'out-provider',
            amount_cents: -1234,
            operation_type: 'PIX',
            reference_number: 'pair-ref'
        }),
        transaction({
            id: 'inbound',
            provider_id: 'in-provider',
            account_id: 'bank-2',
            amount_cents: 1234,
            type: 'CREDIT',
            operation_type: 'PIX',
            reference_number: 'pair-ref'
        })
    ], {
        accounts: [
            { id: 'bank-1', type: 'BANK' },
            { id: 'bank-2', type: 'BANK' }
        ],
        accountBindings
    });

    assert.equal(result.entries[0].classification, 'transfer');
    assert.equal(result.entries[0].state, 'ready');
    assert.equal(result.entries[1].classification, 'paired_transfer_counterpart');
    assert.equal(result.entries[1].state, 'excluded');
    assert.equal(result.summary.ready, 1);
});

test('recognizes a written family transfer when Google formats its amount as currency', () => {
    const accountBindings = {
        ...bindings,
        'bank-2': {
            kind: 'bank',
            ownerUserId: 'person-2',
            ownerLabel: 'Pessoa 2',
            financialAccount: 'Conta 2',
            paymentMethod: 'Débito'
        }
    };
    const transactions = [
        transaction({
            id: 'written-outbound',
            provider_id: 'written-out-provider',
            amount_cents: -1234,
            operation_type: 'PIX',
            reference_number: 'written-pair-ref'
        }),
        transaction({
            id: 'written-inbound',
            provider_id: 'written-in-provider',
            account_id: 'bank-2',
            amount_cents: 1234,
            type: 'CREDIT',
            operation_type: 'PIX',
            reference_number: 'written-pair-ref'
        })
    ];
    const transferRange = Object.keys(sheet().ranges)
        .find(key => key.startsWith('Transfer'));
    const result = plan(transactions, {
        accounts: [
            { id: 'bank-1', type: 'BANK' },
            { id: 'bank-2', type: 'BANK' }
        ],
        accountBindings,
        ranges: {
            [transferRange]: [
                ['Data', 'Descrição', 'Valor', 'Conta Origem', 'Conta Destino',
                    'Método', 'Observações', 'Status', 'user_id'],
                ['10/01/2026', 'Fornecedor exemplo', 'R$ 12,34', 'Conta 1',
                    'Conta 2', 'Transferência',
                    'Importação histórica Open Finance revisada.', 'Conferida',
                    'person-1']
            ]
        }
    });

    assert.equal(result.entries[0].state, 'existing');
    assert.equal(result.entries[0].reason, 'exact_scoped_transfer_match');
    assert.equal(result.entries[1].state, 'excluded');
    assert.equal(result.summary.existing, 1);
    assert.equal(result.summary.ready, 0);
});

test('recognizes written one-sided and reserve transfers through their real planner paths', () => {
    const transferRange = Object.keys(sheet().ranges)
        .find(key => key.startsWith('Transfer'));
    const oneSided = transaction({
        id: 'written-one-sided',
        provider_id: 'written-one-sided-provider',
        amount_cents: -3000,
        description: 'Transferência enviada',
        operation_type: 'PIX'
    });
    const oneSidedRef = plan([oneSided]).entries[0].source_ref;
    const oneSidedOptions = {
        decisionOverrides: {
            [oneSidedRef]: {
                classification: 'internal_transfer',
                destinationFinancialAccount: 'Conta histórica externa'
            }
        }
    };
    const plannedOneSided = plan([oneSided], oneSidedOptions).entries[0];
    const existingOneSided = plan([oneSided], {
        ...oneSidedOptions,
        ranges: {
            [transferRange]: [
                ['Data', 'Descrição', 'Valor', 'Conta Origem', 'Conta Destino',
                    'Método', 'Observações', 'Status', 'user_id'],
                plannedOneSided.write_plan.row.map((value, index) =>
                    index === 2 ? 'R$ 30,00' : value)
            ]
        }
    });

    assert.equal(existingOneSided.entries[0].state, 'existing');

    const reserve = transaction({
        id: 'written-reserve',
        provider_id: 'written-reserve-provider',
        operation_type: 'RESGATE_APLIC_FINANCEIRA',
        amount_cents: 25000,
        type: 'CREDIT'
    });
    const reserveOptions = {
        merchantRules: [{
            match: { mode: 'exact', value: 'Fornecedor exemplo' },
            classification: 'reserve_redemption'
        }]
    };
    const plannedReserve = plan([reserve], reserveOptions).entries[0];
    const existingReserve = plan([reserve], {
        ...reserveOptions,
        ranges: {
            [transferRange]: [
                ['Data', 'Descrição', 'Valor', 'Conta Origem', 'Conta Destino',
                    'Método', 'Observações', 'Status', 'user_id'],
                plannedReserve.write_plan.row.map((value, index) =>
                    index === 2 ? 'R$ 250,00' : value)
            ]
        }
    });

    assert.equal(existingReserve.entries[0].state, 'existing');
});

test('requires byte-exact transfer text fields before classifying a row as existing', () => {
    const tx = transaction({
        id: 'strict-transfer',
        provider_id: 'strict-transfer-provider',
        amount_cents: -3000,
        description: 'Transferência enviada',
        operation_type: 'PIX'
    });
    const stableRef = plan([tx]).entries[0].source_ref;
    const decisionOverrides = {
        [stableRef]: {
            classification: 'internal_transfer',
            destinationFinancialAccount: 'Conta histórica externa'
        }
    };
    const expected = plan([tx], { decisionOverrides })
        .entries[0].write_plan.row;
    const transferRange = Object.keys(sheet().ranges)
        .find(key => key.startsWith('Transfer'));
    const variants = [
        [1, 'TRANSFERENCIA ENVIADA', 'description'],
        [3, 'CONTA 1', 'origin'],
        [4, 'Conta histórica   externa!', 'destination'],
        [5, 'TRANSFERENCIA', 'method'],
        [6, 'Importação histórica Open Finance revisada', 'note'],
        [7, 'CONFERIDA', 'status']
    ];

    for (const [index, value, field] of variants) {
        const row = [...expected];
        row[2] = 'R$ 30,00';
        row[index] = value;
        const result = plan([tx], {
            decisionOverrides,
            ranges: {
                [transferRange]: [
                    ['Data', 'Descrição', 'Valor', 'Conta Origem', 'Conta Destino',
                        'Método', 'Observações', 'Status', 'user_id'],
                    row
                ]
            }
        });
        assert.equal(result.entries[0].state, 'ready', field);
    }
});
test('does not accept a transfer row from another account or user scope', () => {
    const tx = transaction({
        id: 'scoped-transfer',
        provider_id: 'scoped-transfer-provider',
        amount_cents: -3000,
        description: 'Transferência enviada',
        operation_type: 'PIX'
    });
    const stableRef = plan([tx]).entries[0].source_ref;
    const transferRange = Object.keys(sheet().ranges)
        .find(key => key.startsWith('Transfer'));
    const result = plan([tx], {
        decisionOverrides: {
            [stableRef]: {
                classification: 'internal_transfer',
                destinationFinancialAccount: 'Conta histórica externa'
            }
        },
        ranges: {
            [transferRange]: [
                ['Data', 'Descrição', 'Valor', 'Conta Origem', 'Conta Destino',
                    'Método', 'Observações', 'Status', 'user_id'],
                ['10/01/2026', 'Transferência enviada', 'R$ 30,00', 'Conta 1',
                    'Outra conta', 'Transferência',
                    'Importação histórica Open Finance revisada.', 'Conferida',
                    'person-2']
            ]
        }
    });

    assert.equal(result.entries[0].state, 'ready');
    assert.equal(result.entries[0].reason, 'explicit_one_sided_internal_transfer');
});

test('consolidates a strong transfer even when the inbound side appears first', () => {
    const accountBindings = {
        ...bindings,
        'bank-2': {
            kind: 'bank',
            ownerUserId: 'person-2',
            ownerLabel: 'Pessoa 2',
            financialAccount: 'Conta 2',
            paymentMethod: 'Débito'
        }
    };
    const inbound = transaction({
        id: 'inbound-first',
        provider_id: 'inbound-first-provider',
        account_id: 'bank-2',
        amount_cents: 1234,
        type: 'CREDIT',
        operation_type: 'PIX',
        reference_number: 'reverse-pair-ref'
    });
    const outbound = transaction({
        id: 'outbound-second',
        provider_id: 'outbound-second-provider',
        amount_cents: -1234,
        operation_type: 'PIX',
        reference_number: 'reverse-pair-ref'
    });
    const result = plan([inbound, outbound], {
        accounts: [
            { id: 'bank-1', type: 'BANK' },
            { id: 'bank-2', type: 'BANK' }
        ],
        accountBindings
    });

    assert.equal(result.entries[0].classification, 'paired_transfer_counterpart');
    assert.equal(result.entries[0].state, 'excluded');
    assert.equal(result.entries[1].classification, 'transfer');
    assert.equal(result.entries[1].state, 'ready');
});

test('plans an explicitly reviewed one-sided internal transfer without cataloging its destination', () => {
    const tx = transaction({
        id: 'one-sided-transfer',
        provider_id: 'one-sided-transfer-provider',
        amount_cents: -3000,
        description: 'TransferÃªncia enviada Daniel',
        operation_type: 'PIX'
    });
    const stableRef = plan([tx]).entries[0].source_ref;
    const result = plan([tx], {
        decisionOverrides: {
            [stableRef]: {
                classification: 'internal_transfer',
                destinationFinancialAccount: 'Conta histÃ³rica externa'
            }
        }
    });

    assert.equal(result.entries[0].state, 'ready');
    assert.equal(result.entries[0].classification, 'transfer');
    assert.equal(result.entries[0].reason, 'explicit_one_sided_internal_transfer');
    assert.equal(result.entries[0].write_plan.sheet_name, `Transfer\u00eancias`);
    assert.equal(result.entries[0].write_plan.row[3], 'Conta 1');
    assert.equal(result.entries[0].write_plan.row[4], 'Conta histÃ³rica externa');
    assert.equal(result.financial_writes, 0);
});

test('plans an explicitly reviewed incoming internal transfer from a historical account', () => {
    const tx = transaction({
        id: 'incoming-one-sided-transfer',
        provider_id: 'incoming-one-sided-transfer-provider',
        amount_cents: 3000,
        type: 'CREDIT',
        description: 'TransferÃªncia recebida Pessoa 1',
        operation_type: 'PIX'
    });
    const stableRef = plan([tx]).entries[0].source_ref;
    const result = plan([tx], {
        decisionOverrides: {
            [stableRef]: {
                classification: 'internal_transfer',
                originFinancialAccount: 'Conta histÃ³rica externa'
            }
        }
    });

    assert.equal(result.entries[0].state, 'ready');
    assert.equal(result.entries[0].classification, 'transfer');
    assert.equal(result.entries[0].reason, 'explicit_one_sided_internal_transfer');
    assert.equal(result.entries[0].write_plan.sheet_name, `Transfer\u00eancias`);
    assert.equal(result.entries[0].write_plan.row[3], 'Conta histÃ³rica externa');
    assert.equal(result.entries[0].write_plan.row[4], 'Conta 1');
    assert.equal(result.financial_writes, 0);
});

test('uses reciprocal exact decisions to disambiguate equal family transfers without duplicate effects', () => {
    const accountBindings = {
        ...bindings,
        'bank-2': {
            kind: 'bank',
            ownerUserId: 'person-2',
            ownerLabel: 'Pessoa 2',
            financialAccount: 'Conta 2',
            paymentMethod: 'DÃ©bito'
        }
    };
    const transactions = [
        transaction({ id: 'out-1', provider_id: 'out-provider-1', amount_cents: -12345,
            date: '2026-01-10T10:00:00.000Z', description: 'TransferÃªncia enviada Pessoa 2' }),
        transaction({ id: 'in-1', provider_id: 'in-provider-1', account_id: 'bank-2',
            amount_cents: 12345, type: 'CREDIT', date: '2026-01-10T10:00:01.000Z',
            description: 'TransferÃªncia recebida Pessoa 1' }),
        transaction({ id: 'out-2', provider_id: 'out-provider-2', amount_cents: -12345,
            date: '2026-01-10T10:02:00.000Z', description: 'TransferÃªncia enviada Pessoa 2' }),
        transaction({ id: 'in-2', provider_id: 'in-provider-2', account_id: 'bank-2',
            amount_cents: 12345, type: 'CREDIT', date: '2026-01-10T10:02:01.000Z',
            description: 'TransferÃªncia recebida Pessoa 1' })
    ];
    const refs = plan(transactions, {
        accounts: [{ id: 'bank-1', type: 'BANK' }, { id: 'bank-2', type: 'BANK' }],
        accountBindings
    }).entries.map(item => item.source_ref);
    const decisionOverrides = {
        [refs[0]]: { classification: 'internal_transfer_pair', counterpartSourceRef: refs[1] },
        [refs[1]]: { classification: 'internal_transfer_pair', counterpartSourceRef: refs[0] },
        [refs[2]]: { classification: 'internal_transfer_pair', counterpartSourceRef: refs[3] },
        [refs[3]]: { classification: 'internal_transfer_pair', counterpartSourceRef: refs[2] }
    };
    const result = plan(transactions, {
        accounts: [{ id: 'bank-1', type: 'BANK' }, { id: 'bank-2', type: 'BANK' }],
        accountBindings,
        decisionOverrides
    });

    assert.deepEqual(result.entries.map(item => item.state),
        ['ready', 'excluded', 'ready', 'excluded']);
    assert.equal(result.summary.ready, 2);
    assert.equal(result.summary.excluded, 2);
    assert.equal(result.entries.filter(item => item.write_plan).length, 2);
    assert.equal(result.financial_writes, 0);

    const invalid = plan(transactions, {
        accounts: [{ id: 'bank-1', type: 'BANK' }, { id: 'bank-2', type: 'BANK' }],
        accountBindings,
        decisionOverrides: {
            [refs[0]]: { classification: 'internal_transfer_pair', counterpartSourceRef: refs[3] }
        }
    });
    assert.equal(invalid.entries[0].state, 'needs_review');
    assert.equal(invalid.entries[3].state, 'needs_review');
    assert.equal(invalid.entries.filter(item => item.write_plan).length, 0);
});

test('keeps reciprocal transfer decisions closed across amount, status and source boundaries', () => {
    const accountBindings = {
        ...bindings,
        'bank-2': {
            kind: 'bank', ownerUserId: 'person-2', ownerLabel: 'Pessoa 2',
            financialAccount: 'Conta 2', paymentMethod: 'DÃ©bito'
        }
    };
    const close = (transactions, accounts, scopedBindings = accountBindings) => {
        const refs = plan(transactions, { accounts, accountBindings: scopedBindings })
            .entries.map(item => item.source_ref);
        const result = plan(transactions, {
            accounts,
            accountBindings: scopedBindings,
            decisionOverrides: {
                [refs[0]]: {
                    classification: 'internal_transfer_pair',
                    counterpartSourceRef: refs[1]
                },
                [refs[1]]: {
                    classification: 'internal_transfer_pair',
                    counterpartSourceRef: refs[0]
                }
            }
        });
        assert.equal(result.entries.filter(item => item.write_plan).length, 0);
        assert.equal(result.entries.every(item => item.state === 'needs_review'), true);
    };
    const bankAccounts = [{ id: 'bank-1', type: 'BANK' }, { id: 'bank-2', type: 'BANK' }];
    close([
        transaction({ id: 'amount-out', provider_id: 'amount-out-provider', amount_cents: -12345 }),
        transaction({ id: 'amount-in', provider_id: 'amount-in-provider', account_id: 'bank-2',
            amount_cents: 12346, type: 'CREDIT' })
    ], bankAccounts);
    close([
        transaction({ id: 'pending-out', provider_id: 'pending-out-provider', amount_cents: -23456 }),
        transaction({ id: 'pending-in', provider_id: 'pending-in-provider', account_id: 'bank-2',
            amount_cents: 23456, type: 'CREDIT', status: 'PENDING' })
    ], bankAccounts);
    close([
        transaction({ id: 'card-out', provider_id: 'card-out-provider', amount_cents: -34567 }),
        transaction({ id: 'card-in', provider_id: 'card-in-provider', account_id: 'card-1',
            amount_cents: 34567, type: 'DEBIT' })
    ], [{ id: 'bank-1', type: 'BANK' }, { id: 'card-1', type: 'CREDIT' }], bindings);
});

test('excludes exact reviewed loan proceeds only for a posted bank credit', () => {
    const credit = transaction({
        id: 'loan-credit', provider_id: 'loan-credit-provider',
        amount_cents: 3000, type: 'CREDIT', status: 'POSTED',
        description: 'DepÃ³sito de emprÃ©stimo'
    });
    const creditRef = plan([credit]).entries[0].source_ref;
    const result = plan([credit], {
        decisionOverrides: { [creditRef]: { classification: 'loan_proceeds' } }
    });
    assert.equal(result.entries[0].state, 'excluded');
    assert.equal(result.entries[0].classification, 'loan_proceeds');
    assert.equal(result.entries[0].reason, 'explicit_loan_proceeds_not_income');

    const debit = transaction({
        id: 'loan-debit', provider_id: 'loan-debit-provider',
        amount_cents: -3000, type: 'DEBIT', status: 'POSTED',
        description: 'DepÃ³sito de emprÃ©stimo'
    });
    const debitRef = plan([debit]).entries[0].source_ref;
    const invalid = plan([debit], {
        decisionOverrides: { [debitRef]: { classification: 'loan_proceeds' } }
    });
    assert.equal(invalid.entries[0].state, 'needs_review');
    assert.equal(invalid.entries[0].reason,
        'explicit_loan_proceeds_requires_posted_bank_credit');

    const pending = transaction({
        id: 'loan-pending', provider_id: 'loan-pending-provider',
        amount_cents: 3000, type: 'CREDIT', status: 'PENDING',
        description: 'DepÃ³sito de emprÃ©stimo'
    });
    const pendingRef = plan([pending]).entries[0].source_ref;
    const pendingResult = plan([pending], {
        decisionOverrides: { [pendingRef]: { classification: 'loan_proceeds' } }
    });
    assert.equal(pendingResult.entries[0].state, 'needs_review');
    assert.equal(pendingResult.entries[0].reason,
        'explicit_loan_proceeds_requires_posted_bank_credit');
});

test('fails closed when an explicit one-sided transfer is not a bank debit', () => {
    const positiveTransaction = transaction({
        id: 'positive-transfer',
        provider_id: 'positive-transfer-provider',
        amount_cents: 3000,
        type: 'CREDIT'
    });
    const positiveRef = plan([positiveTransaction]).entries[0].source_ref;
    const result = plan([positiveTransaction], {
        decisionOverrides: {
            [positiveRef]: {
                classification: 'internal_transfer',
                destinationFinancialAccount: 'Conta histÃ³rica externa'
            }
        }
    });

    assert.equal(result.entries[0].state, 'needs_review');
    assert.equal(result.entries[0].reason, 'explicit_transfer_requires_bank_debit');

    const sameAccountTransaction = transaction({
        id: 'same-account-transfer',
        provider_id: 'same-account-transfer-provider'
    });
    const sameAccountRef = plan([sameAccountTransaction]).entries[0].source_ref;
    const sameAccount = plan([sameAccountTransaction], {
        decisionOverrides: {
            [sameAccountRef]: {
                classification: 'internal_transfer',
                destinationFinancialAccount: 'Conta 1'
            }
        }
    });
    assert.equal(sameAccount.entries[0].state, 'needs_review');
    assert.equal(sameAccount.entries[0].reason,
        'explicit_transfer_requires_bank_debit');

    const cardDebit = transaction({
        id: 'card-debit-transfer',
        provider_id: 'card-debit-transfer-provider',
        account_id: 'card-1',
        amount_cents: -3000,
        type: 'DEBIT'
    });
    const cardDebitRef = plan([cardDebit]).entries[0].source_ref;
    const nonBankSource = plan([cardDebit], {
        decisionOverrides: {
            [cardDebitRef]: {
                classification: 'internal_transfer',
                destinationFinancialAccount: 'Conta historica externa'
            }
        }
    });
    assert.equal(nonBankSource.entries[0].state, 'needs_review');
    assert.equal(nonBankSource.entries[0].reason,
        'explicit_transfer_requires_bank_debit');
});

test('accepts an explicit existing-row decision only with a unique factual sheet match', () => {
    const expensesRange = Object.keys(sheet().ranges)
        .find(key => key.endsWith('!A:K'));
    const tx = transaction({
        id: 'loan-may',
        provider_id: 'loan-may-provider',
        amount_cents: -225,
        date: '2026-05-07',
        description: 'Parcela quitada | Contas'
    });
    const stableRef = plan([tx]).entries[0].source_ref;
    const options = {
        ranges: {
            [expensesRange]: [
                ['Data', 'DescriÃ§Ã£o', 'Categoria', 'Subcategoria', 'Valor',
                    'ResponsÃ¡vel', 'Pagamento', 'Recorrente', 'ObservaÃ§Ãµes',
                    'user_id', 'Conta Financeira'],
                ['06/05/2026', 'Pagamento de empr\u00e9stimo hist\u00f3rico',
                    'Outros', 'ImportaÃ§Ã£o',
                    2.25, 'Pessoa 1', 'DÃ©bito', 'NÃ£o', '', 'person-1', '']
            ]
        },
        decisionOverrides: {
            [stableRef]: {
                classification: 'existing_sheet_match',
                existingDescription: 'Pagamento de empr\u00e9stimo hist\u00f3rico'
            }
        }
    };
    const result = plan([tx], options);

    assert.equal(result.entries[0].state, 'existing');
    assert.equal(result.entries[0].classification, 'already_recorded');
    assert.equal(result.entries[0].reason, 'explicit_reviewed_sheet_match');
    assert.equal(result.entries[0].write_plan, undefined);
    assert.equal(result.financial_writes, 0);

    options.ranges[expensesRange][1][4] = 9.99;
    const mismatch = plan([tx], options);
    assert.equal(mismatch.entries[0].state, 'needs_review');
    assert.equal(mismatch.entries[0].reason, 'explicit_sheet_match_not_proven');

    options.ranges[expensesRange][1][4] = 2.25;
    options.ranges[expensesRange][1][9] = 'another-user';
    const wrongUser = plan([tx], options);
    assert.equal(wrongUser.entries[0].state, 'needs_review');
    assert.equal(wrongUser.entries[0].reason, 'explicit_sheet_match_not_proven');

    options.ranges[expensesRange][1][9] = 'person-1';
    options.ranges[expensesRange][1][10] = 'Conta 2';
    const wrongAccount = plan([tx], options);
    assert.equal(wrongAccount.entries[0].state, 'needs_review');
    assert.equal(wrongAccount.entries[0].reason, 'explicit_sheet_match_not_proven');

    options.ranges[expensesRange][1][10] = '';
    options.ranges[expensesRange][1][0] = '03/05/2026';
    const outsideDateWindow = plan([tx], options);
    assert.equal(outsideDateWindow.entries[0].state, 'needs_review');
    assert.equal(outsideDateWindow.entries[0].reason,
        'explicit_sheet_match_not_proven');

    options.ranges[expensesRange][1][0] = '06/05/2026';
    options.ranges[expensesRange][1][1] = 'Descricao historica divergente';
    const wrongDescription = plan([tx], options);
    assert.equal(wrongDescription.entries[0].state, 'needs_review');
    assert.equal(wrongDescription.entries[0].reason,
        'explicit_sheet_match_not_proven');

    options.ranges[expensesRange][1][1] =
        'Pagamento de empr\u00e9stimo hist\u00f3rico';
    options.ranges[expensesRange].push([...options.ranges[expensesRange][1]]);
    const ambiguous = plan([tx], options);
    assert.equal(ambiguous.entries[0].state, 'needs_review');
    assert.equal(ambiguous.entries[0].reason, 'explicit_sheet_match_not_proven');
});

test('consolidates a mutually unique family transfer without provider reference', () => {
    const accountBindings = {
        ...bindings,
        'bank-1': { ...bindings['bank-1'], ownerLabel: 'Daniel' },
        'bank-2': {
            kind: 'bank', ownerUserId: 'person-2', ownerLabel: 'Thais',
            financialAccount: 'Conta 2', paymentMethod: 'DÃ©bito'
        }
    };
    const result = plan([
        transaction({
            id: 'outbound-no-ref', provider_id: 'out-no-ref', amount_cents: -1234,
            description: 'Pix enviado Thais', operation_type: 'PIX'
        }),
        transaction({
            id: 'inbound-no-ref', provider_id: 'in-no-ref', account_id: 'bank-2',
            amount_cents: 1234, description: 'Pix recebido Daniel',
            type: 'CREDIT', operation_type: 'PIX'
        })
    ], {
        accounts: [{ id: 'bank-1', type: 'BANK' }, { id: 'bank-2', type: 'BANK' }],
        accountBindings
    });

    assert.equal(result.entries[0].classification, 'transfer');
    assert.equal(result.entries[0].state, 'ready');
    assert.equal(result.entries[1].classification, 'paired_transfer_counterpart');
    assert.equal(result.entries[1].state, 'excluded');
    assert.equal(result.financial_writes, 0);
});

test('keeps reference-free family transfers in review without bilateral unique identity', () => {
    const accountBindings = {
        ...bindings,
        'bank-1': { ...bindings['bank-1'], ownerLabel: 'Daniel' },
        'bank-2': {
            kind: 'bank', ownerUserId: 'person-2', ownerLabel: 'Thais',
            financialAccount: 'Conta 2', paymentMethod: 'DÃ©bito'
        }
    };
    const transactions = [
        transaction({
            id: 'outbound-ambiguous', provider_id: 'out-ambiguous', amount_cents: -1234,
            description: 'Pix enviado Thais', operation_type: 'PIX'
        }),
        transaction({
            id: 'inbound-ambiguous-a', provider_id: 'in-ambiguous-a',
            account_id: 'bank-2', amount_cents: 1234,
            description: 'Pix recebido Daniel', type: 'CREDIT', operation_type: 'PIX'
        }),
        transaction({
            id: 'inbound-ambiguous-b', provider_id: 'in-ambiguous-b',
            account_id: 'bank-2', amount_cents: 1234,
            description: 'Pix recebido Daniel', type: 'CREDIT', operation_type: 'PIX'
        })
    ];
    const result = plan(transactions, {
        accounts: [{ id: 'bank-1', type: 'BANK' }, { id: 'bank-2', type: 'BANK' }],
        accountBindings
    });

    assert.equal(result.entries[0].state, 'needs_review');
    assert.equal(result.entries[0].reason, 'category_required');
    assert.equal(result.summary.ready, 0);
    assert.equal(result.financial_writes, 0);
});

test('keeps a reference-free family match in review when its counterpart is outside the RX', () => {
    const accountBindings = {
        ...bindings,
        'bank-1': { ...bindings['bank-1'], ownerLabel: 'Daniel' },
        'bank-2': {
            kind: 'bank', ownerUserId: 'person-2', ownerLabel: 'Thais',
            financialAccount: 'Conta 2', paymentMethod: 'DÃ©bito'
        }
    };
    const result = plan([
        transaction({
            id: 'outbound-in-window', provider_id: 'out-in-window', amount_cents: -1234,
            date: '2026-12-31', description: 'Pix enviado Thais', operation_type: 'PIX'
        }),
        transaction({
            id: 'inbound-outside', provider_id: 'in-outside', account_id: 'bank-2',
            amount_cents: 1234, date: '2027-01-01', description: 'Pix recebido Daniel',
            type: 'CREDIT', operation_type: 'PIX'
        })
    ], {
        accounts: [{ id: 'bank-1', type: 'BANK' }, { id: 'bank-2', type: 'BANK' }],
        accountBindings
    });

    assert.equal(result.entries[0].state, 'needs_review');
    assert.equal(result.entries[0].reason, 'category_required');
    assert.equal(result.entries[1].state, 'outside_window');
    assert.equal(result.financial_writes, 0);
});

test('keeps a one-sided family name match in review without bilateral identity', () => {
    const accountBindings = {
        ...bindings,
        'bank-1': { ...bindings['bank-1'], ownerLabel: 'Daniel' },
        'bank-2': {
            kind: 'bank', ownerUserId: 'person-2', ownerLabel: 'Thais',
            financialAccount: 'Conta 2', paymentMethod: 'DÃ©bito'
        }
    };
    const result = plan([
        transaction({
            id: 'outbound-one-sided', provider_id: 'out-one-sided', amount_cents: -1234,
            description: 'Pix enviado Thais', operation_type: 'PIX'
        }),
        transaction({
            id: 'inbound-one-sided', provider_id: 'in-one-sided', account_id: 'bank-2',
            amount_cents: 1234, description: 'Pix recebido',
            type: 'CREDIT', operation_type: 'PIX'
        })
    ], {
        accounts: [{ id: 'bank-1', type: 'BANK' }, { id: 'bank-2', type: 'BANK' }],
        accountBindings
    });

    assert.equal(result.entries[0].state, 'needs_review');
    assert.equal(result.entries[1].state, 'needs_review');
    assert.equal(result.summary.ready, 0);
    assert.equal(result.financial_writes, 0);
});

test('uses the financial-account identity before its linked owner identity', () => {
    const accountBindings = {
        ...bindings,
        'bank-1': { ...bindings['bank-1'], ownerLabel: 'Daniel',
            financialAccount: 'Daniel - Nubank' },
        'bank-2': {
            kind: 'bank', ownerUserId: 'person-2', ownerLabel: 'Thais',
            financialAccount: 'Cristina - Nubank', paymentMethod: 'DÃ©bito'
        }
    };
    const transactions = [
        transaction({
            id: 'outbound-cristina', provider_id: 'out-cristina', amount_cents: -1234,
            description: 'Pix enviado Cristina', operation_type: 'PIX'
        }),
        transaction({
            id: 'inbound-daniel', provider_id: 'in-daniel', account_id: 'bank-2',
            amount_cents: 1234, description: 'Pix recebido Daniel',
            type: 'CREDIT', operation_type: 'PIX'
        })
    ];
    const matched = plan(transactions, {
        accounts: [{ id: 'bank-1', type: 'BANK' }, { id: 'bank-2', type: 'BANK' }],
        accountBindings
    });
    const wrongIdentity = plan(transactions.map(item => item.account_id === 'bank-1'
        ? { ...item, description: 'Pix enviado Thais' }
        : item), {
        accounts: [{ id: 'bank-1', type: 'BANK' }, { id: 'bank-2', type: 'BANK' }],
        accountBindings
    });

    assert.equal(matched.entries[0].classification, 'transfer');
    assert.equal(matched.entries[1].classification, 'paired_transfer_counterpart');
    assert.equal(wrongIdentity.entries[0].state, 'needs_review');
    assert.equal(wrongIdentity.financial_writes, 0);
});

test('neutralizes a mutually unique explicit bank refund before either side is saved', () => {
    const debit = transaction({
        id: 'refunded-debit', provider_id: 'refunded-debit-provider',
        description: 'Compra via NuPay', amount_cents: -3490,
        date: '2026-01-10'
    });
    const refund = transaction({
        id: 'explicit-refund', provider_id: 'explicit-refund-provider',
        description: 'Estorno - Compra via NuPay', amount_cents: 3490,
        type: 'CREDIT', date: '2026-01-10'
    });

    const forward = plan([debit, refund]);
    const reversed = plan([refund, debit]);

    assert.deepEqual(forward.entries.map(item => [item.state, item.classification]), [
        ['excluded', 'paired_refund_purchase'],
        ['excluded', 'paired_refund']
    ]);
    assert.deepEqual(reversed.entries.map(item => [item.state, item.classification]), [
        ['excluded', 'paired_refund'],
        ['excluded', 'paired_refund_purchase']
    ]);
    assert.equal(forward.summary.ready, 0);
    assert.equal(forward.summary.excluded, 2);
    assert.equal(forward.financial_writes, 0);
    assert.ok(forward.entries.every(item => !item.write_plan));
});

test('does not neutralize an explicit refund when the debit is already recorded', () => {
    const expenseRange = Object.keys(sheet().ranges).find(key => key.startsWith('Sa'));
    const result = plan([
        transaction({
            id: 'recorded-debit', provider_id: 'recorded-debit-provider',
            description: 'Compra via NuPay', amount_cents: -3490,
            date: '2026-01-10'
        }),
        transaction({
            id: 'refund-for-recorded-debit', provider_id: 'refund-recorded-provider',
            description: 'Estorno - Compra via NuPay', amount_cents: 3490,
            type: 'CREDIT', date: '2026-01-10'
        })
    ], {
        ranges: {
            [expenseRange]: [
                ['Data', 'DescriÃ§Ã£o', 'Categoria', 'Subcategoria', 'Valor',
                    'ResponsÃ¡vel', 'Pagamento', 'Recorrente', 'ObservaÃ§Ãµes',
                    'user_id', 'Conta Financeira'],
                ['10/01/2026', 'Compra via NuPay', 'Outros', '', 34.90,
                    'Pessoa 1', 'DÃ©bito', 'NÃ£o', '', 'person-1', 'Conta 1']
            ]
        }
    });

    assert.equal(result.entries[0].state, 'existing');
    assert.equal(result.entries[1].state, 'needs_review');
    assert.equal(result.entries[1].classification, 'income_or_refund');
});

test('does not neutralize an explicit refund already recorded as bank income', () => {
    const incomeRange = Object.keys(sheet().ranges).find(key => key.startsWith('Entr'));
    const result = plan([
        transaction({
            id: 'unwritten-debit', provider_id: 'unwritten-debit-provider',
            description: 'Compra via NuPay', amount_cents: -3490,
            date: '2026-01-10'
        }),
        transaction({
            id: 'recorded-refund', provider_id: 'recorded-refund-provider',
            description: 'Estorno - Compra via NuPay', amount_cents: 3490,
            type: 'CREDIT', date: '2026-01-10'
        })
    ], {
        ranges: {
            [incomeRange]: [
                ['Data', 'Descrição', 'Categoria', 'Valor', 'Responsável',
                    'Recebimento', 'Recorrente', 'Observações', 'user_id',
                    'Conta Financeira'],
                ['10/01/2026', 'Estorno - Compra via NuPay', 'Reembolso', 34.90,
                    'Pessoa 1', 'Conta Corrente', 'Não', '', 'person-1', 'Conta 1']
            ]
        }
    });

    assert.ok(result.entries.every(item => ![
        'paired_refund_purchase', 'paired_refund'
    ].includes(item.classification)));
    assert.equal(result.entries[1].state, 'existing');
    assert.equal(result.entries[1].classification, 'already_recorded');
    assert.equal(result.financial_writes, 0);
});

test('keeps ambiguous, cross-account, stale and non-explicit refund candidates out of pairing', () => {
    const accountBindings = {
        ...bindings,
        'bank-2': {
            kind: 'bank', ownerUserId: 'person-2', ownerLabel: 'Pessoa 2',
            financialAccount: 'Conta 2', paymentMethod: 'DÃ©bito'
        }
    };
    const cases = [
        [
            transaction({ id: 'ambiguous-debit-a', provider_id: 'ambiguous-debit-a', amount_cents: -2500 }),
            transaction({ id: 'ambiguous-debit-b', provider_id: 'ambiguous-debit-b', amount_cents: -2500 }),
            transaction({ id: 'ambiguous-refund', provider_id: 'ambiguous-refund', description: 'Estorno compra', amount_cents: 2500, type: 'CREDIT' })
        ],
        [
            transaction({ id: 'cross-debit', provider_id: 'cross-debit', amount_cents: -2500 }),
            transaction({ id: 'cross-refund', provider_id: 'cross-refund', account_id: 'bank-2', description: 'Estorno compra', amount_cents: 2500, type: 'CREDIT' })
        ],
        [
            transaction({ id: 'stale-debit', provider_id: 'stale-debit', amount_cents: -2500, date: '2025-10-01' }),
            transaction({ id: 'stale-refund', provider_id: 'stale-refund', description: 'Estorno compra', amount_cents: 2500, type: 'CREDIT', date: '2026-01-10' })
        ],
        [
            transaction({ id: 'ordinary-debit', provider_id: 'ordinary-debit', amount_cents: -2500 }),
            transaction({ id: 'ordinary-credit', provider_id: 'ordinary-credit', description: 'Pix recebido', amount_cents: 2500, type: 'CREDIT' })
        ]
    ];

    for (const candidates of cases) {
        const result = plan(candidates, {
            accounts: [{ id: 'bank-1', type: 'BANK' }, { id: 'bank-2', type: 'BANK' }],
            accountBindings
        });
        assert.ok(result.entries.every(item => ![
            'paired_refund_purchase', 'paired_refund'
        ].includes(item.classification)));
        assert.equal(result.financial_writes, 0);
    }
});

test('neutralizes a mutually unique explicit card refund before either side is saved', () => {
    const purchase = transaction({
        id: 'card-refunded-purchase',
        provider_id: 'card-refunded-purchase-provider',
        account_id: 'card-1',
        description: 'Compra via NuPay',
        amount_cents: 3490,
        type: 'DEBIT',
        date: '2026-01-10',
        bill_forecast_month: '2026-01'
    });
    const refund = transaction({
        id: 'card-explicit-refund',
        provider_id: 'card-explicit-refund-provider',
        account_id: 'card-1',
        description: 'Estorno - Compra via NuPay',
        amount_cents: -3490,
        type: 'CREDIT',
        date: '2026-01-11',
        bill_forecast_month: '2026-01'
    });
    const options = {
        merchantRules: [{
            match: { mode: 'exact', value: 'Compra via NuPay' },
            classification: 'expense',
            category: 'Transporte',
            subcategory: ''
        }]
    };

    const forward = plan([purchase, refund], options);
    const reversed = plan([refund, purchase], options);

    assert.deepEqual(forward.entries.map(item => [item.state, item.classification]), [
        ['excluded', 'paired_refund_purchase'],
        ['excluded', 'paired_refund']
    ]);
    assert.deepEqual(reversed.entries.map(item => [item.state, item.classification]), [
        ['excluded', 'paired_refund'],
        ['excluded', 'paired_refund_purchase']
    ]);
    assert.ok(forward.entries.every(item => !item.write_plan));
    assert.equal(forward.financial_writes, 0);
    assert.equal(reversed.financial_writes, 0);
});

test('does not neutralize a card refund when its purchase is already recorded', () => {
    const purchase = transaction({
        id: 'recorded-card-purchase',
        provider_id: 'recorded-card-purchase-provider',
        account_id: 'card-1',
        description: 'Compra via NuPay',
        amount_cents: 3490,
        type: 'DEBIT',
        date: '2026-01-10',
        bill_forecast_month: '2026-01'
    });
    const refund = transaction({
        id: 'refund-for-recorded-card-purchase',
        provider_id: 'refund-for-recorded-card-purchase-provider',
        account_id: 'card-1',
        description: 'Estorno - Compra via NuPay',
        amount_cents: -3490,
        type: 'CREDIT',
        date: '2026-01-11',
        bill_forecast_month: '2026-01'
    });
    const merchantRules = [{
        match: { mode: 'exact', value: 'Compra via NuPay' },
        classification: 'expense',
        category: 'Transporte',
        subcategory: ''
    }];
    const purchasePlan = plan([purchase], { merchantRules });
    const cardRangeName = Object.keys(sheet().ranges)
        .find(key => key.includes('Cart'));
    const result = plan([purchase, refund], {
        merchantRules,
        ranges: {
            [cardRangeName]: [
                sheet().ranges[cardRangeName][0],
                purchasePlan.entries[0].write_plan.row
            ]
        }
    });

    assert.equal(result.entries[0].state, 'existing');
    assert.equal(result.entries[1].state, 'possible_duplicate');
    assert.equal(result.entries[1].classification, 'already_recorded');
    assert.ok(result.entries.every(item => ![
        'paired_refund_purchase', 'paired_refund'
    ].includes(item.classification)));
    assert.equal(result.financial_writes, 0);
});

test('keeps ambiguous and near-match card refunds out of neutralization', () => {
    const sharedPurchase = {
        account_id: 'card-1',
        description: 'Compra via NuPay',
        amount_cents: 3490,
        type: 'DEBIT',
        bill_forecast_month: '2026-01'
    };
    const result = plan([
        transaction({
            ...sharedPurchase,
            id: 'card-purchase-a',
            provider_id: 'card-purchase-a-provider',
            date: '2026-01-10'
        }),
        transaction({
            ...sharedPurchase,
            id: 'card-purchase-b',
            provider_id: 'card-purchase-b-provider',
            date: '2026-01-10'
        }),
        transaction({
            id: 'card-ambiguous-refund',
            provider_id: 'card-ambiguous-refund-provider',
            account_id: 'card-1',
            description: 'Estorno de compra',
            amount_cents: -3490,
            type: 'CREDIT',
            date: '2026-01-11'
        }),
        transaction({
            id: 'card-near-match-credit',
            provider_id: 'card-near-match-credit-provider',
            account_id: 'card-1',
            description: 'Credito promocional',
            amount_cents: -3490,
            type: 'CREDIT',
            date: '2026-01-11'
        })
    ], {
        merchantRules: [{
            match: { mode: 'exact', value: 'Compra via NuPay' },
            classification: 'expense',
            category: 'Transporte',
            subcategory: ''
        }]
    });

    assert.ok(result.entries.every(item => ![
        'paired_refund_purchase', 'paired_refund'
    ].includes(item.classification)));
    assert.equal(result.entries[2].state, 'needs_review');
    assert.equal(result.entries[3].state, 'needs_review');
    assert.equal(result.financial_writes, 0);

    const pending = plan([
        transaction({
            ...sharedPurchase,
            id: 'card-pending-purchase',
            provider_id: 'card-pending-purchase-provider',
            status: 'PENDING'
        }),
        transaction({
            id: 'card-pending-refund',
            provider_id: 'card-pending-refund-provider',
            account_id: 'card-1',
            description: 'Estorno de compra',
            amount_cents: -3490,
            type: 'CREDIT',
            status: 'PENDING'
        })
    ]);
    assert.ok(pending.entries.every(item => ![
        'paired_refund_purchase', 'paired_refund'
    ].includes(item.classification)));
    assert.equal(pending.financial_writes, 0);
});

test('excludes only exact posted card payment credits without a bank counterpart', () => {
    const result = plan([
        transaction({
            id: 'card-payment-received',
            provider_id: 'card-payment-received-provider',
            account_id: 'card-1',
            description: 'Pagamento recebido',
            amount_cents: -5000,
            type: 'CREDIT'
        }),
        transaction({
            id: 'card-payment-balance',
            provider_id: 'card-payment-balance-provider',
            account_id: 'card-1',
            description: 'Pagamento com saldo',
            amount_cents: -5000,
            type: 'CREDIT'
        }),
        transaction({
            id: 'card-payment-pending',
            provider_id: 'card-payment-pending-provider',
            account_id: 'card-1',
            description: 'Pagamento recebido',
            amount_cents: -5000,
            type: 'CREDIT',
            status: 'PENDING'
        }),
        transaction({
            id: 'card-payment-near-match',
            provider_id: 'card-payment-near-match-provider',
            account_id: 'card-1',
            description: 'Pagamento recebido parcial',
            amount_cents: -5000,
            type: 'CREDIT'
        }),
        transaction({
            id: 'bank-payment-received',
            provider_id: 'bank-payment-received-provider',
            account_id: 'bank-1',
            description: 'Pagamento recebido',
            amount_cents: 5000,
            type: 'CREDIT'
        })
    ]);

    assert.deepEqual(result.entries.slice(0, 2).map(item => [
        item.state, item.classification, item.reason
    ]), [
        ['excluded', 'card_bill_payment_counterpart',
            'explicit_card_payment_credit'],
        ['excluded', 'card_bill_payment_counterpart',
            'explicit_card_payment_credit']
    ]);
    assert.deepEqual(result.entries.slice(2).map(item => item.state), [
        'excluded', 'needs_review', 'needs_review'
    ]);
    assert.equal(result.entries[2].reason, 'provider_pending_not_historical_fact');
    assert.equal(result.financial_writes, 0);
});

test('excludes exact posted card statement and financing adjustments only', () => {
    const result = plan([
        transaction({
            id: 'overdue-balance',
            provider_id: 'overdue-balance-provider',
            account_id: 'card-1',
            description: 'Saldo em atraso',
            amount_cents: 5000,
            type: 'DEBIT'
        }),
        transaction({
            id: 'revolving-balance',
            provider_id: 'revolving-balance-provider',
            account_id: 'card-1',
            description: 'Saldo em rotativo',
            amount_cents: 5000,
            type: 'DEBIT'
        }),
        transaction({
            id: 'overdue-credit',
            provider_id: 'overdue-credit-provider',
            account_id: 'card-1',
            description: 'Credito de atraso',
            amount_cents: -5000,
            type: 'CREDIT'
        }),
        transaction({
            id: 'revolving-credit',
            provider_id: 'revolving-credit-provider',
            account_id: 'card-1',
            description: 'Credito de rotativo',
            amount_cents: -5000,
            type: 'CREDIT'
        }),
        transaction({
            id: 'debt-close',
            provider_id: 'debt-close-provider',
            account_id: 'card-1',
            description: 'Encerramento de divida',
            amount_cents: -5000,
            type: 'CREDIT'
        }),
        transaction({
            id: 'near-balance',
            provider_id: 'near-balance-provider',
            account_id: 'card-1',
            description: 'Saldo em atraso da compra',
            amount_cents: 5000,
            type: 'DEBIT'
        }),
        transaction({
            id: 'pending-balance',
            provider_id: 'pending-balance-provider',
            account_id: 'card-1',
            description: 'Saldo em atraso',
            amount_cents: 5000,
            type: 'DEBIT',
            status: 'PENDING'
        })
    ]);

    assert.deepEqual(result.entries.slice(0, 5).map(item => [
        item.state, item.classification, item.reason
    ]), [
        ['excluded', 'card_balance_carryover',
            'explicit_card_statement_balance'],
        ['excluded', 'card_balance_carryover',
            'explicit_card_statement_balance'],
        ['excluded', 'card_financing_adjustment',
            'explicit_card_financing_adjustment'],
        ['excluded', 'card_financing_adjustment',
            'explicit_card_financing_adjustment'],
        ['excluded', 'card_financing_adjustment',
            'explicit_card_financing_adjustment']
    ]);
    assert.equal(result.entries[5].state, 'needs_review');
    assert.equal(result.entries[6].state, 'excluded');
    assert.equal(result.entries[6].reason, 'provider_pending_not_historical_fact');
    assert.equal(result.financial_writes, 0);
});

test('isolates a unique card-funded Pix principal and keeps only its fee in review', () => {
    const bankDebit = transaction({
        id: 'funded-pix-bank-debit',
        provider_id: 'funded-pix-bank-debit-provider',
        description: 'Transferencia enviada|Mercado Exemplo',
        amount_cents: -5445,
        type: 'DEBIT',
        operation_type: 'PIX',
        date: '2026-01-10T12:00:00.000Z'
    });
    const bankCredit = transaction({
        id: 'funded-pix-bank-credit',
        provider_id: 'funded-pix-bank-credit-provider',
        description: 'Valor adicionado na conta por cartao de credito | Valor adicionado para PIX no Credito',
        amount_cents: 5445,
        type: 'CREDIT',
        operation_type: 'TRANSFERENCIA_MESMA_INSTITUICAO',
        date: '2026-01-10T12:00:00.500Z'
    });
    const cardDebit = transaction({
        id: 'funded-pix-card-debit',
        provider_id: 'funded-pix-card-debit-provider',
        account_id: 'card-1',
        description: 'Pagamento de pix',
        amount_cents: 6172,
        type: 'DEBIT',
        date: '2026-01-10T12:00:03.000Z',
        bill_forecast_month: '2026-01'
    });
    const options = {
        merchantRules: [
            {
                match: { mode: 'contains', value: 'mercado exemplo' },
                classification: 'expense',
                category: 'Alimentacao',
                subcategory: 'Mercado'
            },
            {
                match: { mode: 'exact', value: 'Pagamento de pix' },
                classification: 'expense',
                category: 'Alimentacao',
                subcategory: 'Lanche'
            }
        ]
    };

    const forward = plan([bankDebit, bankCredit, cardDebit], options);
    const reversed = plan([cardDebit, bankCredit, bankDebit], options);

    assert.deepEqual(forward.entries.map(item => [
        item.state, item.classification, item.reason
    ]), [
        ['ready', 'expense', 'explicit_merchant_rule'],
        ['excluded', 'card_funded_pix_principal',
            'represented_by_card_funded_pix_flow'],
        ['needs_review', 'card_funded_pix_fee',
            'card_funded_pix_fee_category_required']
    ]);
    assert.deepEqual(forward.entries[2].review_context, {
        principal_amount_cents: 5445,
        fee_amount_cents: 727,
        bank_debit_ref: forward.entries[0].source_ref,
        bank_credit_ref: forward.entries[1].source_ref
    });
    assert.deepEqual(forward.entries[1].review_context,
        forward.entries[2].review_context);
    assert.equal(forward.entries[2].write_plan, undefined);
    assert.deepEqual(reversed.entries.map(item => item.classification), [
        'card_funded_pix_fee', 'card_funded_pix_principal', 'expense'
    ]);
    assert.equal(forward.financial_writes, 0);
    assert.equal(reversed.financial_writes, 0);
});

test('fails closed for ambiguous, pending or imprecise card-funded Pix triples', () => {
    const base = [
        transaction({
            id: 'funded-pix-bank-debit-negative',
            provider_id: 'funded-pix-bank-debit-negative-provider',
            description: 'Transferencia enviada|Pessoa Exemplo',
            amount_cents: -1000,
            date: '2026-01-10T12:00:00.000Z'
        }),
        transaction({
            id: 'funded-pix-bank-credit-negative',
            provider_id: 'funded-pix-bank-credit-negative-provider',
            description: 'Valor adicionado na conta por cartao de credito | Valor adicionado para PIX no Credito',
            amount_cents: 1000,
            type: 'CREDIT',
            operation_type: 'TRANSFERENCIA_MESMA_INSTITUICAO',
            date: '2026-01-10T12:00:00.500Z'
        })
    ];
    const card = overrides => transaction({
        id: 'funded-pix-card-negative',
        provider_id: 'funded-pix-card-negative-provider',
        account_id: 'card-1',
        description: 'Pessoa Exemplo',
        amount_cents: 1114,
        type: 'DEBIT',
        date: '2026-01-10T12:00:03.000Z',
        bill_forecast_month: '2026-01',
        ...overrides
    });
    const merchantRules = [{
        match: { mode: 'contains', value: 'pessoa exemplo' },
        classification: 'expense',
        category: 'Outros',
        subcategory: ''
    }];
    const ambiguous = plan([...base, card(), card({
        id: 'funded-pix-card-negative-2',
        provider_id: 'funded-pix-card-negative-provider-2',
        amount_cents: 1120
    })], { merchantRules });
    const pending = plan([...base, card({ status: 'PENDING' })], { merchantRules });
    const imprecise = plan(base.map(item => ({
        ...item,
        date: item.date.slice(0, 10)
    })).concat(card({ date: '2026-01-10' })), { merchantRules });
    const approximateDescription = plan([
        base[0],
        { ...base[1], description: `${base[1].description} promocional` },
        card()
    ], { merchantRules });
    const wrongBankDescription = plan([
        { ...base[0], description: 'Transferencia agendada|Pessoa Exemplo' },
        base[1], card()
    ], { merchantRules });
    const wrongOperation = plan([
        base[0], { ...base[1], operation_type: 'PIX' }, card()
    ], { merchantRules });
    const wrongCardDescription = plan([
        ...base, card({ description: 'Pessoa Exemplo parcial' })
    ], { merchantRules });
    const noFee = plan([
        ...base, card({ amount_cents: 1000 })
    ], { merchantRules });
    const staleCard = plan([
        ...base, card({ date: '2026-01-10T12:00:06.000Z' })
    ], { merchantRules });
    const crossOwner = plan([...base, card()], {
        merchantRules,
        accountBindings: {
            ...bindings,
            'card-1': {
                ...bindings['card-1'],
                ownerUserId: 'person-2'
            }
        }
    });
    const missingOwners = plan([...base, card()], {
        merchantRules,
        accountBindings: {
            ...bindings,
            'bank-1': {
                ...bindings['bank-1'],
                ownerUserId: ''
            },
            'card-1': {
                ...bindings['card-1'],
                ownerUserId: ''
            }
        }
    });

    for (const result of [
        ambiguous, pending, imprecise, approximateDescription,
        wrongBankDescription, wrongOperation, wrongCardDescription, noFee,
        staleCard, crossOwner, missingOwners
    ]) {
        assert.ok(result.entries.every(item => ![
            'card_funded_pix_principal', 'card_funded_pix_fee'
        ].includes(item.classification)));
        assert.equal(result.financial_writes, 0);
    }
});

test('does not form a card-funded Pix triple when one side is already recorded', () => {
    const bankDebit = transaction({
        id: 'saved-funded-pix-bank-debit',
        provider_id: 'saved-funded-pix-bank-debit-provider',
        description: 'Transferencia enviada|Pessoa Exemplo',
        amount_cents: -1000,
        date: '2026-01-10T12:00:00.000Z'
    });
    const bankCredit = transaction({
        id: 'saved-funded-pix-bank-credit',
        provider_id: 'saved-funded-pix-bank-credit-provider',
        description: 'Valor adicionado na conta por cartao de credito | Valor adicionado para PIX no Credito',
        amount_cents: 1000,
        type: 'CREDIT',
        operation_type: 'TRANSFERENCIA_MESMA_INSTITUICAO',
        date: '2026-01-10T12:00:00.500Z'
    });
    const cardDebit = transaction({
        id: 'saved-funded-pix-card-debit',
        provider_id: 'saved-funded-pix-card-debit-provider',
        account_id: 'card-1',
        description: 'Pessoa Exemplo',
        amount_cents: 1114,
        type: 'DEBIT',
        date: '2026-01-10T12:00:03.000Z',
        bill_forecast_month: '2026-01'
    });
    const merchantRules = [{
        match: { mode: 'contains', value: 'pessoa exemplo' },
        classification: 'expense',
        category: 'Outros',
        subcategory: ''
    }];
    const debitOnly = plan([bankDebit], { merchantRules });
    const bankRangeName = Object.keys(sheet().ranges)
        .find(key => key.endsWith('A:K'));
    const result = plan([bankDebit, bankCredit, cardDebit], {
        merchantRules,
        ranges: {
            [bankRangeName]: [
                sheet().ranges[bankRangeName][0],
                debitOnly.entries[0].write_plan.row
            ]
        }
    });

    assert.ok(result.entries.every(item => ![
        'card_funded_pix_principal', 'card_funded_pix_fee'
    ].includes(item.classification)));
    assert.equal(result.financial_writes, 0);
});

test('requires review for unbound sources and unmatched card credits', () => {
    const result = plan([
        transaction({ account_id: 'unknown-account' }),
        transaction({
            id: 'card-credit',
            provider_id: 'card-credit-provider',
            account_id: 'card-1',
            amount_cents: -9999,
            type: 'CREDIT'
        })
    ], {
        accounts: [
            { id: 'unknown-account', type: 'BANK' },
            { id: 'card-1', type: 'CREDIT' }
        ]
    });

    assert.equal(result.entries[0].state, 'needs_review');
    assert.equal(result.entries[0].reason, 'account_binding_required');
    assert.equal(result.entries[1].state, 'needs_review');
    assert.equal(result.entries[1].classification, 'card_credit_or_payment');
});

test('uses reciprocal reviewed refund decisions to neutralize one exact card purchase', () => {
    const merchantRules = [{
        match: { mode: 'exact', value: 'Fornecedor exemplo' },
        classification: 'expense',
        category: 'Outros',
        subcategory: ''
    }];
    const purchase = transaction({
        id: 'reviewed-refund-purchase',
        provider_id: 'reviewed-refund-purchase-provider',
        account_id: 'card-1',
        amount_cents: 6917,
        type: 'DEBIT',
        bill_forecast_month: '2026-01'
    });
    const refund = transaction({
        id: 'reviewed-refund-credit',
        provider_id: 'reviewed-refund-credit-provider',
        account_id: 'card-1',
        amount_cents: -6917,
        type: 'CREDIT',
        date: '2026-01-11',
        bill_forecast_month: '2026-01'
    });
    const initial = plan([purchase, refund], { merchantRules });
    const purchaseRef = initial.entries[0].source_ref;
    const refundRef = initial.entries[1].source_ref;
    const decisionOverrides = {
        [purchaseRef]: {
            classification: 'card_refund_pair',
            counterpartSourceRef: refundRef
        },
        [refundRef]: {
            classification: 'card_refund_pair',
            counterpartSourceRef: purchaseRef
        }
    };
    const result = plan([purchase, refund], {
        merchantRules,
        decisionOverrides
    });

    assert.deepEqual(result.entries.map(item => [item.state, item.classification]), [
        ['excluded', 'paired_refund_purchase'],
        ['excluded', 'paired_refund']
    ]);
    const purchasePlan = plan([purchase], { merchantRules });
    const cardRangeName = Object.keys(sheet().ranges)
        .find(key => key.includes('Cart'));
    const recordedResult = plan([purchase, refund], {
        merchantRules,
        decisionOverrides: {
            ...decisionOverrides
        },
        ranges: {
            [cardRangeName]: [
                sheet().ranges[cardRangeName][0],
                purchasePlan.entries[0].write_plan.row
            ]
        }
    });

    assert.ok(recordedResult.entries.every(item => ![
        'paired_refund_purchase', 'paired_refund'
    ].includes(item.classification)));
    assert.equal(result.financial_writes, 0);
});

test('plans reviewed unmatched card credits as negative adjustments', () => {
    const credit = transaction({
        id: 'reviewed-card-credit',
        provider_id: 'reviewed-card-credit-provider',
        account_id: 'card-1',
        amount_cents: -1289,
        type: 'CREDIT',
        bill_forecast_month: '2026-01'
    });
    const ref = plan([credit]).entries[0].source_ref;
    const result = plan([credit], {
        decisionOverrides: {
            [ref]: {
                classification: 'card_credit_adjustment',
                category: 'Outros',
                subcategory: ''
            }
        }
    });

    assert.equal(result.entries[0].state, 'ready');
    assert.equal(result.entries[0].classification, 'card_credit_adjustment');
    assert.equal(result.entries[0].write_plan.row[3], -12.89);
    assert.equal(result.financial_writes, 0);
});

test('uses only the reviewed fee of a card-funded Pix triple', () => {
    const bankDebit = transaction({
        id: 'reviewed-fee-bank-debit',
        provider_id: 'reviewed-fee-bank-debit-provider',
        description: 'Transferencia enviada|Pessoa Exemplo',
        amount_cents: -5445,
        date: '2026-01-10T12:00:00.000Z'
    });
    const bankCredit = transaction({
        id: 'reviewed-fee-bank-credit',
        provider_id: 'reviewed-fee-bank-credit-provider',
        description: 'Valor adicionado na conta por cartao de credito | Valor adicionado para PIX no Credito',
        amount_cents: 5445,
        type: 'CREDIT',
        operation_type: 'TRANSFERENCIA_MESMA_INSTITUICAO',
        date: '2026-01-10T12:00:00.500Z'
    });
    const cardDebit = transaction({
        id: 'reviewed-fee-card-debit',
        provider_id: 'reviewed-fee-card-debit-provider',
        account_id: 'card-1',
        description: 'Pagamento de pix',
        amount_cents: 6172,
        type: 'DEBIT',
        date: '2026-01-10T12:00:03.000Z',
        bill_forecast_month: '2026-01'
    });
    const initial = plan([bankDebit, bankCredit, cardDebit], {
        merchantRules: [{
            match: { mode: 'contains', value: 'pessoa exemplo' },
            classification: 'expense', category: 'Outros', subcategory: ''
        }]
    });
    const cardRef = initial.entries[2].source_ref;
    const result = plan([bankDebit, bankCredit, cardDebit], {
        merchantRules: [{
            match: { mode: 'contains', value: 'pessoa exemplo' },
            classification: 'expense', category: 'Outros', subcategory: ''
        }],
        decisionOverrides: {
            [cardRef]: {
                classification: 'expense',
                category: 'Taxas e Juros',
                subcategory: ''
            }
        }
    });

    assert.equal(result.entries[2].state, 'ready');
    assert.equal(result.entries[2].classification, 'card_funded_pix_fee');
    assert.equal(result.entries[2].write_plan.row[3], 7.27);
    assert.equal(result.financial_writes, 0);
});

test('accepts only an explicit BRL amount for a posted foreign card expense and excludes pending foreign purchases', () => {
    const posted = transaction({
        id: 'posted-foreign-card',
        provider_id: 'posted-foreign-card-provider',
        account_id: 'card-1',
        amount_cents: 500,
        currency: 'USD',
        type: 'DEBIT',
        bill_forecast_month: '2026-03'
    });
    const pending = transaction({
        id: 'pending-foreign-card',
        provider_id: 'pending-foreign-card-provider',
        account_id: 'card-1',
        amount_cents: 1970,
        currency: 'USD',
        type: 'DEBIT',
        status: 'PENDING',
        bill_forecast_month: null
    });
    const initial = plan([posted, pending]);
    const postedRef = initial.entries[0].source_ref;
    const result = plan([posted, pending], {
        decisionOverrides: {
            [postedRef]: {
                classification: 'foreign_card_expense',
                category: 'Outros',
                subcategory: '',
                brlAmountCents: 2738
            }
        }
    });

    assert.equal(result.entries[0].state, 'ready');
    assert.equal(result.entries[0].classification, 'foreign_card_expense');
    assert.equal(result.entries[0].write_plan.row[3], 27.38);
    assert.deepEqual(result.entries[0].review_context, {
        original_amount_cents: 500,
        original_currency: 'USD',
        reviewed_brl_amount_cents: 2738
    });
    assert.equal(result.entries[1].state, 'excluded');
    assert.equal(result.entries[1].classification, 'pending_card_purchase');
    assert.equal(result.financial_writes, 0);
});

test('fails closed on source type mismatch, zero amount and non-BRL currency', () => {
    const result = plan([
        transaction({
            account_id: 'card-1',
            id: 'binding-mismatch',
            provider_id: 'binding-mismatch-provider',
            amount_cents: 1000
        }),
        transaction({
            id: 'zero-amount',
            provider_id: 'zero-provider',
            amount_cents: 0
        }),
        transaction({
            id: 'foreign-currency',
            provider_id: 'foreign-provider',
            currency: 'USD'
        })
    ], {
        accounts: [
            { id: 'bank-1', type: 'BANK' },
            { id: 'card-1', type: 'BANK' }
        ],
        merchantRules: [{
            match: { mode: 'exact', value: 'Fornecedor exemplo' },
            classification: 'expense',
            category: 'Outros',
            subcategory: ''
        }]
    });

    assert.equal(result.entries[0].reason, 'account_binding_type_mismatch');
    assert.equal(result.entries[1].reason, 'non_positive_absolute_amount');
    assert.equal(result.entries[2].reason, 'unsupported_currency');
    assert.ok(result.entries.every(item => item.state === 'needs_review'));
});

test('fails closed on conflicting merchant rules and invalid installment metadata', () => {
    const rules = [
        {
            match: { mode: 'exact', value: 'Fornecedor exemplo' },
            classification: 'expense',
            category: 'Outros',
            subcategory: ''
        },
        {
            match: { mode: 'contains', value: 'Fornecedor' },
            classification: 'expense',
            category: 'Compras',
            subcategory: ''
        }
    ];
    const conflict = plan([transaction()], { merchantRules: rules });
    assert.equal(conflict.entries[0].state, 'needs_review');
    assert.equal(conflict.entries[0].reason, 'merchant_rule_conflict');

    const invalidInstallment = plan([transaction({
        account_id: 'card-1',
        amount_cents: 1000,
        installment_number: 7,
        total_installments: 6
    })], { merchantRules: [rules[0]] });
    assert.equal(invalidInstallment.entries[0].state, 'needs_review');
    assert.equal(invalidInstallment.entries[0].reason, 'invalid_installment_metadata');
});

test('does not report a conflict when overlapping rules have the same decision', () => {
    const result = plan([transaction({
        description: 'Ifd restaurante alimentos'
    })], {
        merchantRules: [{
            match: { mode: 'contains', value: 'ifd' },
            classification: 'expense', category: 'Alimentação', subcategory: ''
        }, {
            match: { mode: 'contains', value: 'alimentos' },
            classification: 'expense', category: 'Alimentação', subcategory: ''
        }]
    });

    assert.equal(result.entries[0].state, 'ready');
    assert.equal(result.entries[0].reason, 'explicit_merchant_rule');
    assert.equal(result.entries[0].write_plan.row[2], 'Alimentação');
    assert.equal(result.financial_writes, 0);
});

test('requires an evidenced billing month for a historical card row', () => {
    const result = plan([transaction({
        account_id: 'card-1',
        amount_cents: 1000
    })], {
        merchantRules: [{
            match: { mode: 'exact', value: 'Fornecedor exemplo' },
            classification: 'expense',
            category: 'Outros',
            subcategory: ''
        }]
    });

    assert.equal(result.entries[0].state, 'needs_review');
    assert.equal(result.entries[0].reason, 'billing_month_required');
});

test('keeps a future installment only when its original purchase is inside the cutoff', () => {
    const result = plan([
        transaction({
            id: 'future-with-origin',
            provider_id: 'future-with-origin-provider',
            account_id: 'card-1',
            amount_cents: 2000,
            status: 'PENDING',
            date: '2027-01-10',
            original_date: '2026-06-10',
            installment_number: 8,
            total_installments: 12,
            bill_forecast_month: '2027-01'
        }),
        transaction({
            id: 'future-without-origin',
            provider_id: 'future-without-origin-provider',
            account_id: 'card-1',
            amount_cents: 2000,
            status: 'PENDING',
            date: '2027-01-10',
            original_date: null,
            installment_number: 8,
            total_installments: 12,
            bill_forecast_month: '2027-01'
        })
    ], {
        merchantRules: [{
            match: { mode: 'exact', value: 'Fornecedor exemplo' },
            classification: 'expense', category: 'Outros', subcategory: ''
        }]
    });

    assert.equal(result.entries[0].state, 'ready');
    assert.equal(result.entries[0].classification, 'planned_card_installment');
    assert.equal(result.entries[1].state, 'outside_window');
});

test('prefers a unique sheet pattern over a broader established import suggestion', () => {
    const header = sheet().ranges['Saídas!A:K'][0];
    const tx = transaction({ description: 'Fornecedor habitacional exemplo' });
    const result = plan([tx], {
        ranges: {
            'Saídas!A:K': [
                header,
                ['05/01/2026', 'Fornecedor habitacional exemplo', 'Moradia',
                    'Condomínio', 90, 'Pessoa 1', 'Débito', 'Não', '',
                    'person-1', 'Conta 1']
            ]
        },
        decisionOverrides: {
            'tx-1': {
                suggestedCategory: 'Moradia',
                suggestedSubcategory: 'Habitação'
            }
        }
    });

    assert.equal(result.entries[0].state, 'ready');
    assert.equal(result.entries[0].write_plan.row[3], 'Condomínio');
    assert.equal(result.entries[0].reason, 'unique_sheet_pattern');
});

test('assigns exactly one terminal state and produces a stable plan hash', () => {
    const input = [
        transaction(),
        transaction({
            id: 'outside',
            provider_id: 'outside-provider',
            date: '2025-06-30'
        })
    ];
    const first = plan(input);
    const second = plan(input);

    assert.equal(first.entries.length, input.length);
    assert.ok(first.entries.every(entry => [
        'ready', 'existing', 'possible_duplicate', 'excluded',
        'needs_review', 'outside_window'
    ].includes(entry.state)));
    assert.equal(first.plan_hash, second.plan_hash);
    assert.equal(first.financial_writes, 0);
});

test('never marks an in-window transaction ready without stable provider identity', () => {
    const candidate = transaction();
    delete candidate.provider_id;
    delete candidate.id;
    const result = plan([candidate], {
        merchantRules: [{
            match: { mode: 'exact', value: 'Fornecedor exemplo' },
            classification: 'expense', category: 'Outros', subcategory: ''
        }]
    });

    assert.equal(result.entries[0].state, 'needs_review');
    assert.equal(result.entries[0].reason, 'provider_identity_required');
});

test('derives coverage only from the exact snapshot being planned', () => {
    const snapshot = pluggy([transaction()]);
    snapshot.observed_at = '2026-01-15T00:00:00.000Z';
    const result = planOpenFinanceHistoricalImport({
        pluggySnapshot: snapshot,
        sheetSnapshot: sheet(),
        accountBindings: bindings,
        historyStartDate: '2025-07-01',
        historyEndDate: '2026-01-31'
    });

    assert.equal(result.source_observed_at, '2026-01-15T00:00:00.000Z');
    assert.equal(result.coverage_complete, false);
    assert.equal(result.plan_status, 'PARTIAL_NO_GO');
    assert.equal(result.writable, false);
});

test('writes consolidated card rows and scopes exact matches by card id', () => {
    const consolidatedBindings = {
        ...bindings,
        'card-1': {
            kind: 'card', ownerUserId: 'person-1', ownerLabel: 'Pessoa 1',
            sheetName: 'Lançamentos Cartão', cardId: 'card-daniel',
            cardName: 'Cartão Daniel', closingDay: 20
        }
    };
    const candidate = transaction({
        account_id: 'card-1', amount_cents: 1000,
        bill_forecast_month: '2026-01'
    });
    const header = ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela',
        'Mês de Cobrança', 'card_id', 'Cartão', 'Status', 'user_id'];
    const merchantRules = [{
        match: { mode: 'exact', value: 'Fornecedor exemplo' },
        classification: 'expense', category: 'Outros', subcategory: ''
    }];

    const differentCard = plan([candidate], {
        accountBindings: consolidatedBindings,
        ranges: {
            'Lançamentos Cartão!A:J': [
                header,
                ['10/01/2026', 'Fornecedor exemplo', 'Outros', 10, '1/1',
                    'Janeiro de 2026', 'card-thais', 'Cartão Thais', '', 'person-1']
            ]
        },
        merchantRules
    });

    assert.equal(differentCard.entries[0].state, 'ready');
    assert.equal(differentCard.entries[0].write_plan.sheet_name,
        'Lançamentos Cartão');
    assert.equal(differentCard.entries[0].write_plan.row.length, 10);
    assert.equal(differentCard.entries[0].write_plan.row[6], 'card-daniel');
    assert.equal(differentCard.entries[0].write_plan.row[9], 'person-1');

    const exactCard = plan([candidate], {
        accountBindings: consolidatedBindings,
        ranges: {
            'Lançamentos Cartão!A:J': [
                header,
                differentCard.entries[0].write_plan.row
            ]
        },
        merchantRules
    });

    assert.equal(exactCard.entries[0].state, 'existing');
});

test('uses a matching Pluggy bill as evidence for the billing month', () => {
    const snapshot = pluggy([
        transaction({
            account_id: 'card-1',
            amount_cents: 1000,
            bill_id: 'bill-1',
            bill_forecast_month: null
        })
    ], [
        { id: 'bank-1', type: 'BANK' },
        { id: 'card-1', type: 'CREDIT' }
    ]);
    snapshot.items[0].bills = [{
        id: 'bill-1',
        account_id: 'card-1',
        due_date: '2026-02-10'
    }, {
        id: 'bill-1',
        account_id: 'different-card',
        due_date: '2026-03-10'
    }];
    const result = planOpenFinanceHistoricalImport({
        pluggySnapshot: snapshot,
        sheetSnapshot: sheet(),
        accountBindings: {
            ...bindings,
            'card-1': {
                ...bindings['card-1'],
                billingFallbackAuthorized: false
            }
        },
        merchantRules: [{
            match: { mode: 'exact', value: 'Fornecedor exemplo' },
            classification: 'expense', category: 'Outros', subcategory: ''
        }],
        historyStartDate: '2025-07-01',
        historyEndDate: '2026-12-31'
    });

    assert.equal(result.entries[0].state, 'ready');
    assert.equal(result.entries[0].write_plan.row[5], 'Fevereiro de 2026');
});
