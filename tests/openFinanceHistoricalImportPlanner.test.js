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
