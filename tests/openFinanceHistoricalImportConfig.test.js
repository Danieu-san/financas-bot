const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildConfig
} = require('../scripts/buildOpenFinanceHistoricalImportConfig');

test('derives only unique bank, reserve and consolidated card bindings', () => {
    const config = buildConfig({
        pluggySnapshot: {
            observed_at: ['2026-01-20T00:00:00.000Z'],
            items: [{
                alias_code: 'pessoa_banco',
                owner_scope: 'pessoa',
                accounts: [
                    { id: 'bank', type: 'BANK', subtype: 'CHECKING_ACCOUNT' },
                    { id: 'savings', type: 'BANK', subtype: 'SAVINGS_ACCOUNT' },
                    { id: 'card', type: 'CREDIT', subtype: 'CREDIT_CARD',
                        balance_close_date: '2026-01-18' }
                ]
            }]
        },
        sheetSnapshot: {
            ranges: {
                "'Contas Financeiras'!A:I": [
                    ['Nome', 'Tipo', '', '', 'Status', '', 'Responsável', 'user_id'],
                    ['Pessoa - Banco', 'bank', '', '', 'active', '', 'Pessoa', 'u1'],
                    ['Pessoa - Banco Reserva', 'reserve', '', '', 'active', '',
                        'Pessoa', 'u1']
                ],
                'Cartões!A:G': [
                    ['card_id', 'Nome', 'Banco', 'Dia de Fechamento',
                        'Dia de Vencimento', 'Ativo', 'Observações'],
                    ['card-1', 'Banco - Pessoa', 'Banco', 18, 25, 'Sim', '']
                ]
            }
        },
        historyStartDate: '2025-07-01',
        historyEndDate: '2026-01-31'
    });

    assert.equal(config.accountBindings.bank.financialAccount, 'Pessoa - Banco');
    assert.equal(config.accountBindings.bank.reserveAccount,
        'Pessoa - Banco Reserva');
    assert.equal(config.accountBindings.card.sheetName, 'Lançamentos Cartão');
    assert.equal(config.accountBindings.card.cardId, 'card-1');
    assert.equal(config.accountBindings.card.cardName, 'Banco - Pessoa');
    assert.equal(config.accountBindings.card.closingDay, 18);
    assert.equal(config.accountBindings.card.billingFallbackAuthorized, false);
    assert.equal(config.accountBindings.savings, undefined);
    assert.equal(config.diagnostics.unbound_savings, 1);
    assert.equal(config.coverageComplete, false);
    assert.equal(config.financial_writes, 0);
});

test('does not bind an owner when account rows disagree on user identity', () => {
    const config = buildConfig({
        pluggySnapshot: {
            observed_at: '2026-02-01T00:00:00.000Z',
            items: [{
                alias_code: 'pessoa_banco', owner_scope: 'pessoa',
                accounts: [{ id: 'bank', type: 'BANK', subtype: 'CHECKING_ACCOUNT' }]
            }]
        },
        sheetSnapshot: {
            ranges: {
                'Contas Financeiras!A:I': [
                    ['header'],
                    ['Pessoa - Banco', 'bank', '', '', 'active', '', 'Pessoa', 'u1'],
                    ['Pessoa - Banco Reserva', 'reserve', '', '', 'active', '',
                        'Pessoa', 'u2']
                ]
            }
        },
        historyStartDate: '2025-07-01',
        historyEndDate: '2026-01-31'
    });

    assert.deepEqual(config.accountBindings, {});
    assert.equal(config.diagnostics.owners_without_unique_user, 1);
});

test('records only non-fallback suggestions from the established classifier', () => {
    const config = buildConfig({
        pluggySnapshot: {
            observed_at: '2026-02-01T00:00:00.000Z',
            items: [{
                id: 'item', alias_code: 'pessoa_banco', owner_scope: 'pessoa',
                accounts: [{ id: 'bank', type: 'BANK', subtype: 'CHECKING_ACCOUNT' }],
                transactions: [
                    { id: 'known', item_id: 'item', account_id: 'bank',
                        provider_id: 'known-provider', description: 'Known',
                        amount_cents: -100, date: '2026-01-01' },
                    { id: 'unknown', item_id: 'item', account_id: 'bank',
                        provider_id: 'unknown-provider', description: 'Unknown',
                        amount_cents: -200, date: '2026-01-02' }
                ]
            }]
        },
        sheetSnapshot: { ranges: { 'Contas Financeiras!A:I': [['header']] } },
        historyStartDate: '2025-07-01',
        historyEndDate: '2026-01-31',
        classifyExpense: description => description === 'Known'
            ? { categoria: 'Moradia', subcategoria: 'Aluguel' }
            : { categoria: 'Outros', subcategoria: 'Importação' }
    });

    assert.equal(Object.keys(config.decisionOverrides).length, 1);
    assert.equal(Object.values(config.decisionOverrides)[0].suggestedCategory,
        'Moradia');
});

test('propagates a category only inside an unambiguous recurring merchant group', () => {
    const config = buildConfig({
        pluggySnapshot: {
            observed_at: '2026-02-01T00:00:00.000Z',
            items: [{
                id: 'item', alias_code: 'pessoa_banco', owner_scope: 'pessoa',
                accounts: [{ id: 'bank', type: 'BANK', subtype: 'CHECKING_ACCOUNT' }],
                transactions: [
                    { id: 'known', item_id: 'item', account_id: 'bank',
                        provider_id: 'known-provider', description: 'Mercado Central',
                        amount_cents: -100, date: '2026-01-01' },
                    { id: 'variant', item_id: 'item', account_id: 'bank',
                        provider_id: 'variant-provider',
                        description: 'Mercado Central Loja 01',
                        amount_cents: -200, date: '2026-01-02' }
                ]
            }]
        },
        sheetSnapshot: { ranges: { 'Contas Financeiras!A:I': [['header']] } },
        historyStartDate: '2025-07-01',
        historyEndDate: '2026-01-31',
        classifyExpense: description => description === 'Mercado Central'
            ? { categoria: 'Alimentação', subcategoria: 'Supermercado' }
            : { categoria: 'Outros', subcategoria: 'Importação' }
    });

    assert.equal(Object.keys(config.decisionOverrides).length, 2);
    const propagated = Object.values(config.decisionOverrides)
        .find(value => value.suggestionOrigin === 'unambiguous_recurring_merchant');
    assert.equal(propagated.suggestedCategory, 'Alimentação');
});

test('does not propagate when a recurring signature has conflicting categories', () => {
    const config = buildConfig({
        pluggySnapshot: {
            observed_at: '2026-02-01T00:00:00.000Z',
            items: [{
                id: 'item', alias_code: 'pessoa_banco', owner_scope: 'pessoa',
                accounts: [{ id: 'bank', type: 'BANK', subtype: 'CHECKING_ACCOUNT' }],
                transactions: [
                    { id: 'one', item_id: 'item', account_id: 'bank',
                        provider_id: 'one-provider', description: 'Fornecedor Central A',
                        amount_cents: -100, date: '2026-01-01' },
                    { id: 'two', item_id: 'item', account_id: 'bank',
                        provider_id: 'two-provider', description: 'Fornecedor Central B',
                        amount_cents: -200, date: '2026-01-02' },
                    { id: 'three', item_id: 'item', account_id: 'bank',
                        provider_id: 'three-provider', description: 'Fornecedor Central C',
                        amount_cents: -300, date: '2026-01-03' }
                ]
            }]
        },
        sheetSnapshot: { ranges: { 'Contas Financeiras!A:I': [['header']] } },
        historyStartDate: '2025-07-01',
        historyEndDate: '2026-01-31',
        classifyExpense: description => description.endsWith('A')
            ? { categoria: 'Casa', subcategoria: '' }
            : description.endsWith('B')
                ? { categoria: 'Trabalho', subcategoria: '' }
                : { categoria: 'Outros', subcategoria: 'Importação' }
    });

    assert.equal(Object.keys(config.decisionOverrides).length, 2);
    assert.equal(Object.values(config.decisionOverrides)
        .some(value => value.suggestionOrigin), false);
});
