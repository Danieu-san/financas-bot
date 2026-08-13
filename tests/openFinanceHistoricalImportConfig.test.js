const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
    buildConfig,
    buildRecurringExpenseClassifier
} = require('../scripts/buildOpenFinanceHistoricalImportConfig');
const {
    applyAccountClassificationRules
} = require('../src/services/statementImportService');

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
                'Cartões!A:H': [
                    ['card_id', 'Nome', 'Banco', 'Dia de Fechamento',
                        'Dia de Vencimento', 'Ativo', 'Observações', 'user_id'],
                    ['card-1', 'Banco - Pessoa', 'Banco', 18, 25, 'Sim', '', '']
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

test('binds an explicitly identified existing card without inventing a new catalog row', () => {
    const input = {
        pluggySnapshot: {
            observed_at: '2026-08-11T00:00:00.000Z',
            items: [{
                alias_code: 'thais_itau', owner_scope: 'thais',
                accounts: [{ id: 'itau-credit', type: 'CREDIT',
                    subtype: 'CREDIT_CARD', balance_close_date: '2026-08-03' }]
            }]
        },
        sheetSnapshot: {
            ranges: {
                'Contas Financeiras!A:I': [
                    ['header'],
                    ['Thais - Itaú', 'bank', '', '', 'active', '', 'Thais', 'u-thais']
                ],
                'Cartões!A:H': [
                    ['card_id', 'Nome', 'Banco', 'Dia de Fechamento',
                        'Dia de Vencimento', 'Ativo', 'Observações', 'user_id'],
                    ['card-itau', 'Cartão Itaú', 'Itaú', 3, 10, 'Sim', '', '']
                ]
            }
        },
        historyStartDate: '2025-07-01',
        historyEndDate: '2026-07-27'
    };

    const withoutOverride = buildConfig(input);
    assert.equal(withoutOverride.accountBindings['itau-credit'], undefined);
    assert.equal(withoutOverride.diagnostics.unbound_card, 1);

    const withOverride = buildConfig({
        ...input,
        cardIdByAlias: { thais_itau: 'card-itau' }
    });
    assert.equal(withOverride.accountBindings['itau-credit'].cardId, 'card-itau');
    assert.equal(withOverride.accountBindings['itau-credit'].cardName, 'Cartão Itaú');
    assert.equal(withOverride.diagnostics.explicit_card_bindings, 1);
    assert.equal(withOverride.financial_writes, 0);
});

test('keeps reviewed private decisions separate from automatic suggestions', () => {
    const config = buildConfig({
        pluggySnapshot: { observed_at: '2026-08-11T00:00:00.000Z', items: [] },
        sheetSnapshot: { ranges: {} },
        historyStartDate: '2025-07-01',
        historyEndDate: '2026-07-27',
        privateDecisions: {
            merchantRules: [{
                match: { mode: 'contains', value: 'grpqa' },
                classification: 'expense',
                category: 'Moradia',
                subcategory: 'Aluguel'
            }],
            decisionOverrides: {
                'source-ref-1': {
                    classification: 'income',
                    category: 'Entradas',
                    subcategory: 'Reembolso'
                }
            }
        }
    });

    assert.deepEqual(config.merchantRules, [{
        match: { mode: 'contains', value: 'grpqa' },
        classification: 'expense',
        category: 'Moradia',
        subcategory: 'Aluguel'
    }]);
    assert.deepEqual(config.decisionOverrides['source-ref-1'], {
        classification: 'income',
        category: 'Entradas',
        subcategory: 'Reembolso'
    });
    assert.equal(config.diagnostics.private_merchant_rules, 1);
    assert.equal(config.diagnostics.private_decision_overrides, 1);
    assert.equal(config.financial_writes, 0);
});

test('fails closed for malformed private review decisions', () => {
    const input = {
        pluggySnapshot: { observed_at: '2026-08-11T00:00:00.000Z', items: [] },
        sheetSnapshot: { ranges: {} },
        historyStartDate: '2025-07-01',
        historyEndDate: '2026-07-27'
    };

    assert.throws(() => buildConfig({
        ...input,
        privateDecisions: {
            merchantRules: [{
                match: { mode: 'regex', value: '.*' },
                classification: 'expense', category: 'Outros'
            }]
        }
    }), /historical_import_private_merchant_rule_invalid:0/);
    assert.throws(() => buildConfig({
        ...input,
        privateDecisions: {
            decisionOverrides: { 'source-ref-1': { classification: 'income' } }
        }
    }), /historical_import_private_decision_invalid:source-ref-1/);
});

test('accepts only scoped one-sided transfers and evidenced existing rows as private overrides', () => {
    const base = {
        pluggySnapshot: { observed_at: '2026-08-11T00:00:00.000Z', items: [] },
        sheetSnapshot: { ranges: {} },
        historyStartDate: '2025-07-01',
        historyEndDate: '2026-07-27'
    };
    const config = buildConfig({
        ...base,
        privateDecisions: {
            decisionOverrides: {
                'transfer-ref': {
                    classification: 'internal_transfer',
                    destinationFinancialAccount: 'Conta histÃ³rica externa'
                },
                'existing-ref': {
                    classification: 'existing_sheet_match',
                    existingDescription: 'Pagamento de emprÃ©stimo histÃ³rico'
                }
            }
        }
    });

    assert.deepEqual(config.decisionOverrides['transfer-ref'], {
        classification: 'internal_transfer',
        destinationFinancialAccount: 'Conta histÃ³rica externa'
    });
    assert.deepEqual(config.decisionOverrides['existing-ref'], {
        classification: 'existing_sheet_match',
        existingDescription: 'Pagamento de emprÃ©stimo histÃ³rico'
    });
    assert.throws(() => buildConfig({
        ...base,
        privateDecisions: { decisionOverrides: {
            bad: { classification: 'internal_transfer' }
        } }
    }), /historical_import_private_decision_invalid:bad/);
    assert.throws(() => buildConfig({
        ...base,
        privateDecisions: { decisionOverrides: {
            bad: {
                classification: 'existing_sheet_match',
                existingDescription: 'Pagamento de emprÃ©stimo histÃ³rico',
                category: 'Outros'
            }
        } }
    }), /historical_import_private_decision_invalid:bad/);
});

test('accepts a category-free reviewed card-payment rule', () => {
    const config = buildConfig({
        pluggySnapshot: { observed_at: '2026-08-11T00:00:00.000Z', items: [] },
        sheetSnapshot: { ranges: {} },
        historyStartDate: '2025-07-01',
        historyEndDate: '2026-07-27',
        privateDecisions: {
            merchantRules: [{
                match: { mode: 'contains', value: 'pagamento de fatura' },
                classification: 'card_payment'
            }]
        }
    });

    assert.deepEqual(config.merchantRules[0], {
        match: { mode: 'contains', value: 'pagamento de fatura' },
        classification: 'card_payment', category: '', subcategory: ''
    });
    assert.equal(config.financial_writes, 0);
});

test('CLI requires an absolute private-decisions path and applies the reviewed file', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-config-private-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const pluggyPath = path.join(root, 'pluggy.json');
    const sheetPath = path.join(root, 'sheet.json');
    const decisionsPath = path.join(root, 'decisions.json');
    const outputPath = path.join(root, 'config.json');
    fs.writeFileSync(pluggyPath, JSON.stringify({
        observed_at: '2026-08-11T00:00:00.000Z', items: []
    }));
    fs.writeFileSync(sheetPath, JSON.stringify({ ranges: {} }));
    fs.writeFileSync(decisionsPath, JSON.stringify({
        merchantRules: [{
            match: { mode: 'contains', value: 'grpqa' },
            classification: 'expense', category: 'Moradia', subcategory: 'Aluguel'
        }]
    }));
    const script = path.resolve(__dirname,
        '../scripts/buildOpenFinanceHistoricalImportConfig.js');
    const common = [script, '--confirm-private-output',
        '--pluggy-snapshot', pluggyPath, '--sheet-snapshot', sheetPath,
        '--history-start', '2025-07-01', '--history-end', '2026-07-27'];

    const relative = spawnSync(process.execPath, [
        ...common, '--output', path.join(root, 'relative.json'),
        '--private-decisions', 'decisions.json'
    ], { encoding: 'utf8' });
    assert.notEqual(relative.status, 0);
    assert.match(relative.stderr, /private-decisions_must_be_absolute/);

    const insideRepository = spawnSync(process.execPath, [
        ...common, '--output', path.join(root, 'inside-repository.json'),
        '--private-decisions', path.resolve(__dirname, '../package.json')
    ], { encoding: 'utf8' });
    assert.notEqual(insideRepository.status, 0);
    assert.match(insideRepository.stderr,
        /historical_import_private_decisions_must_stay_outside_repository/);

    const applied = spawnSync(process.execPath, [
        ...common, '--output', outputPath, '--private-decisions', decisionsPath
    ], { encoding: 'utf8' });
    assert.equal(applied.status, 0, applied.stderr);
    const config = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(config.merchantRules.length, 1);
    assert.equal(config.merchantRules[0].match.value, 'grpqa');
    assert.equal(config.diagnostics.private_merchant_rules, 1);
    assert.equal(config.financial_writes, 0);
    assert.doesNotMatch(applied.stdout, /grpqa|Aluguel/);
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

test('uses a registered recurring bill before the generic classifier', () => {
    const config = buildConfig({
        pluggySnapshot: {
            observed_at: '2026-02-01T00:00:00.000Z',
            items: [{
                id: 'item-1', alias_code: 'pessoa banco', owner_scope: 'Pessoa',
                accounts: [{ id: 'bank-1', type: 'BANK', subtype: 'CHECKING_ACCOUNT' }],
                transactions: [{
                    id: 'recurring-1', item_id: 'item-1', account_id: 'bank-1',
                    provider_id: 'recurring-provider-1', description: 'Pix Prestador recorrente',
                    amount_cents: -10000, date: '2026-01-02'
                }]
            }]
        },
        sheetSnapshot: {
            ranges: {
                'Contas Financeiras!A:I': [
                    ['Nome', 'Tipo', '', '', 'Status', '', 'Responsável', 'user_id'],
                    ['Pessoa - Banco', 'bank', '', '', 'active', '', 'Pessoa', 'u1']
                ],
                'Contas!A:I': [
                    ['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id',
                        'Nome Amigável', 'Categoria', 'Subcategoria', 'Valor Esperado',
                        'Regra Ativa'],
                    ['Pix Prestador recorrente', '5', '', 'u1', 'Serviço mensal',
                        'Educação', 'Aula', '100', 'Sim']
                ]
            }
        },
        historyStartDate: '2025-07-01',
        historyEndDate: '2026-01-31',
        classifyExpense: () => ({ categoria: 'Outros', subcategoria: 'Importação' }),
        classifyRecurringExpense: description => description.includes('Prestador recorrente')
            ? { categoria: 'Educação', subcategoria: 'Aula' }
            : null
    });

    const override = Object.values(config.decisionOverrides)[0];
    assert.equal(override.suggestedCategory, 'Educação');
    assert.equal(override.suggestedSubcategory, 'Aula');
    assert.equal(override.suggestedRecurring, true);
    assert.equal(override.suggestionOrigin, 'registered_recurring_bill');
    assert.equal(config.diagnostics.registered_recurring_bill_suggestions, 1);
    assert.equal(config.financial_writes, 0);
});

test('fails closed when matching recurring bill rows disagree on classification', () => {
    const classify = buildRecurringExpenseClassifier([
        ['Nome da Conta', 'Dia', 'Obs', 'user_id', 'Nome Amigável',
            'Categoria', 'Subcategoria', 'Valor', 'Regra Ativa'],
        ['Prestador recorrente', '5', '', 'u1', 'Serviço mensal',
            'Educação', 'Aula', '100', 'Sim'],
        ['Prestador recorrente', '5', '', 'u1', 'Outro serviço',
            'Assinaturas', 'Aplicativo', '100', 'Sim']
    ], applyAccountClassificationRules);

    assert.equal(classify('Pix Prestador recorrente'), null);
});

test('does not turn a store purchase into a bill from a one-term recurring rule', () => {
    const classify = buildRecurringExpenseClassifier([
        ['Nome da Conta', 'Dia', 'Obs', 'user_id', 'Nome Amigável',
            'Categoria', 'Subcategoria', 'Valor', 'Regra Ativa'],
        ['Claro', '4', '', 'u1', 'Claro',
            'Moradia', 'INTERNET / TELEFONE', '', 'Sim']
    ], applyAccountClassificationRules);

    assert.equal(classify('Compra no débito|CLARO LJ MADUREIRA S'), null);
    assert.deepEqual(classify('Net Pgt*Fatura Claro'), {
        categoria: 'Moradia',
        subcategoria: 'INTERNET / TELEFONE'
    });
    assert.deepEqual(classify('CLARO BANDA LARGA - INTERNET'), {
        categoria: 'Moradia',
        subcategoria: 'INTERNET / TELEFONE'
    });
});

test('keeps exact historical category precedence without losing recurrence', () => {
    const config = buildConfig({
        pluggySnapshot: {
            observed_at: '2026-02-01T00:00:00.000Z',
            items: [{
                id: 'item-1', alias_code: 'pessoa banco', owner_scope: 'Pessoa',
                accounts: [{ id: 'bank-1', type: 'BANK', subtype: 'CHECKING_ACCOUNT' }],
                transactions: [{
                    id: 'exact-recurring', item_id: 'item-1', account_id: 'bank-1',
                    provider_id: 'exact-recurring-provider', description: 'Prestador mensal',
                    amount_cents: -10000, date: '2026-01-02'
                }]
            }]
        },
        sheetSnapshot: { ranges: {
            'Contas Financeiras!A:I': [
                ['Nome', 'Tipo', '', '', 'Status', '', 'Responsável', 'user_id'],
                ['Pessoa - Banco', 'bank', '', '', 'active', '', 'Pessoa', 'u1']
            ],
            'Saídas!A:K': [
                ['Data', 'Descrição', 'Categoria', 'Subcategoria'],
                ['01/01/2026', 'Prestador mensal', 'Outros', 'Aula particular']
            ]
        } },
        historyStartDate: '2025-07-01',
        historyEndDate: '2026-01-31',
        classifyRecurringExpense: () => ({
            categoria: 'Educação', subcategoria: 'Aula'
        })
    });

    const override = Object.values(config.decisionOverrides)[0];
    assert.equal(override.suggestedCategory, 'Outros');
    assert.equal(override.suggestedSubcategory, 'Aula particular');
    assert.equal(override.suggestedRecurring, true);
    assert.equal(override.suggestionOrigin, 'registered_recurring_bill');
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
