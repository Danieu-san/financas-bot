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
