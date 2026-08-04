'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
    CANONICAL_HISTORICAL_RX_INVENTORY,
    buildOpenFinanceHistoricalRx: buildHistoricalRx,
    snapshotSqliteFileSet,
    sqliteFileSetsEqual
} = require('../src/openFinance/openFinanceHistoricalRx');
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');
const { copySqliteFileSet, main: runHistoricalRx } = require('../scripts/runOpenFinanceHistoricalRx');

const SECRET = 'rx-hist-seg-test-secret-32-bytes-minimum';

function fixture() {
    const input = familyInventoryFixture();
    input.observedAt = '2026-07-28T12:00:00.000Z';
    const daniel = input.items.find(item => item.alias_code === 'daniel_nubank');
    daniel.accounts = [
        { id: 'bank-1', type: 'BANK', subtype: 'CHECKING_ACCOUNT', currency: 'BRL', balance_cents: 10000 },
        { id: 'card-1', type: 'CREDIT', subtype: 'CREDIT_CARD', currency: 'BRL', balance_cents: 30000,
            credit_limit_cents: 100000, available_credit_limit_cents: 70000, used_limit_cents: 30000 }
    ];
    daniel.transactions = [
        { id: 'bank-before', account_id: 'bank-1', description: 'Antes do corte', amount_cents: 1000,
            currency: 'BRL', date: '2026-02-20T10:00:00.000Z', status: 'POSTED' },
        { id: 'bank-income', account_id: 'bank-1', description: 'Entrada privada', amount_cents: 5000,
            currency: 'BRL', date: '2026-03-10T10:00:00.000Z', status: 'POSTED',
            operation_type: 'RESGATE_APLIC_FINANCEIRA' },
        { id: 'bank-expense', account_id: 'bank-1', description: 'Saida privada', amount_cents: -2000,
            currency: 'BRL', date: '2026-03-11T10:00:00.000Z', status: 'POSTED',
            operation_type: 'APLICACAO_FINANCEIRA' },
        { id: 'bank-pending', account_id: 'bank-1', description: 'Caixinha sem rotulo', amount_cents: -500,
            currency: 'BRL', date: '2026-03-12T10:00:00.000Z', status: 'PENDING',
            operation_type: 'NAO_APLICAVEL' },
        { id: 'card-i1', account_id: 'card-1', description: 'Compra parcelada privada', amount_cents: 1000,
            currency: 'BRL', date: '2026-03-20T10:00:00.000Z', original_date: '2026-03-20T10:00:00.000Z',
            status: 'POSTED', installment_number: 1, total_installments: 3, bill_forecast_month: '2026-04' },
        { id: 'card-i2', account_id: 'card-1', description: 'Compra parcelada privada', amount_cents: 1000,
            currency: 'BRL', date: '2026-04-20T10:00:00.000Z', original_date: '2026-03-20T10:00:00.000Z',
            status: 'PENDING', installment_number: 2, total_installments: 3, bill_forecast_month: '2026-05' },
        { id: 'card-payment', account_id: 'card-1', description: 'Pagamento privado', amount_cents: -2000,
            currency: 'BRL', date: '2026-04-25T10:00:00.000Z', status: 'POSTED' }
    ];
    daniel.bills = [
        { id: 'bill-1', account_id: 'card-1', due_date: '2026-04-10T00:00:00.000Z', total_cents: 4500, currency: 'BRL' }
    ];
    daniel.investments = [
        { id: 'investment-1', name: 'Investimento privado', type: 'CDB', balance_cents: 9000, currency: 'BRL', status: 'ACTIVE' }
    ];
    const itau = input.items.find(item => item.alias_code === 'thais_itau');
    itau.availability.investments = 'unavailable';
    itau.accounts[0].balance_cents = 2500;
    Object.assign(itau.accounts[1], {
        balance_cents: 1200, credit_limit_cents: 50000,
        available_credit_limit_cents: 48800, used_limit_cents: 1200
    });
    return input;
}

function canonicalSourceLifecycles() {
    return {
        daniel_nubank: { existedAtHistoryStart: true },
        thais_nubank: { existedAtHistoryStart: true },
        cristina_nubank: { existedAtHistoryStart: true },
        thais_itau: {
            accounts: {
                'thais_itau-bank': { existedAtHistoryStart: true },
                'thais_itau-savings': { existedAtHistoryStart: true },
                'thais_itau-card': { existedAtHistoryStart: false }
            }
        }
    };
}

function resolvedSourceLifecycles() {
    const lifecycles = canonicalSourceLifecycles();
    lifecycles.thais_itau.accounts['thais_itau-savings'] = { existedAtHistoryStart: true };
    return lifecycles;
}

function buildOpenFinanceHistoricalRx(options) {
    const sourceLifecycles = Object.hasOwn(options, 'sourceLifecycles')
        ? { ...canonicalSourceLifecycles(), ...options.sourceLifecycles }
        : undefined;
    return buildHistoricalRx({
        ...options,
        sourceLifecycles,
        expectedInventory: options.expectedInventory || structuredClone(CANONICAL_HISTORICAL_RX_INVENTORY)
    });
}

function familyInventoryFixture() {
    const ownerByAlias = {
        daniel_nubank: 'daniel',
        thais_nubank: 'thais',
        thais_itau: 'thais',
        cristina_nubank: 'thais'
    };
    const items = Object.entries(ownerByAlias).map(([alias, ownerScope]) => ({
        id: `item-${alias}`,
        alias_code: alias,
        owner_scope: ownerScope,
        availability: { accounts: 'available', transactions: 'available', bills: 'available', investments: 'available' },
        accounts: [
            { id: `${alias}-bank`, type: 'BANK', subtype: 'CHECKING_ACCOUNT', currency: 'BRL', balance_cents: 0 },
            { id: `${alias}-card`, type: 'CREDIT', subtype: 'CREDIT_CARD', currency: 'BRL', balance_cents: 0,
                credit_limit_cents: 0, available_credit_limit_cents: 0, used_limit_cents: 0 }
        ],
        transactions: [],
        bills: [],
        investments: []
    }));
    items.find(item => item.alias_code === 'thais_itau').accounts.push({
        id: 'thais_itau-savings', type: 'BANK', subtype: 'SAVINGS_ACCOUNT', currency: 'BRL', balance_cents: 0
    });
    return {
        observedAt: '2026-08-04T12:00:00.000Z',
        items,
        expectedInventory: structuredClone(CANONICAL_HISTORICAL_RX_INVENTORY),
        sourceLifecycles: canonicalSourceLifecycles()
    };
}

test('RX separa conta, cartao, fatura e investimento sem expor payload bruto', () => {
    const input = fixture();
    const report = buildOpenFinanceHistoricalRx({
        items: input.items,
        historyStartDate: '2026-03-01',
        observedAt: input.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtHistoryStart: true },
            thais_itau: { existedAtHistoryStart: false }
        }
    });

    assert.equal(report.financial_writes, 0);
    assert.equal(report.gate, 'RX-HIST-RESERVE-LIFECYCLE-01');
    assert.equal(report.segments.length, 9);
    const bank = report.segments.find(row => row.source_alias === 'daniel_nubank' && row.product === 'bank_account');
    const card = report.segments.find(row => row.source_alias === 'daniel_nubank' && row.product === 'credit_card');
    const itau = report.segments.find(row => row.source_alias === 'thais_itau' && row.product === 'credit_card');
    assert.equal(bank.history_start_reconstruction.balance_cents, 7000);
    assert.equal(bank.history_start_reconstruction.confidence, 'conditional_on_complete_posted_history');
    assert.equal(bank.flows.pending_count, 1);
    assert.equal(bank.flows.credits_cents, 5000);
    assert.equal(bank.flows.debits_cents, 2500);
    assert.equal(bank.flows.semantic, 'raw_account_movement_not_income_expense');
    assert.equal(bank.flows.reserve_principal_exclusion_scope, 'provider_labeled_only');
    assert.equal(bank.flows.non_reserve_principal_credits_cents, 0);
    assert.equal(bank.flows.non_reserve_principal_debits_cents, 500);
    assert.deepEqual(bank.investment_movements, {
        status: 'provider_labeled_only',
        unlabeled_movements_inferred: false,
        principal_transfers_treated_as_income: false,
        principal_transfers_treated_as_expense: false,
        count: 2,
        posted_count: 2,
        pending_count: 0,
        credits_cents: 5000,
        debits_cents: 2000,
        applications_cents: 2000,
        redemptions_cents: 5000,
        investment_income_cents: 0,
        semantically_ambiguous_count: 0,
        operation_types: ['APLICACAO_FINANCEIRA', 'RESGATE_APLIC_FINANCEIRA']
    });
    assert.equal(card.history_start_reconstruction.balance_cents, null);
    assert.equal(card.history_start_reconstruction.reason, 'credit_balance_is_not_invoice');
    assert.equal(card.current_snapshot.used_limit_cents, 30000);
    assert.equal(card.flows.charges_cents, 2000);
    assert.equal(card.flows.payments_or_credits_cents, 2000);
    assert.equal(Object.hasOwn(card.flows, 'inflow_cents'), false);
    assert.equal(card.bills.count, 1);
    assert.equal(card.bills.total_cents, 4500);
    assert.equal(card.installments.series_count, 1);
    assert.deepEqual(card.installments.series[0].observed_numbers, [1, 2]);
    assert.deepEqual(card.installments.series[0].missing_numbers, [3]);
    assert.deepEqual(card.installments.series[0].billing_months, ['2026-04', '2026-05']);
    assert.equal(itau.history_start_relation, 'not_applicable_before_account_start');
    assert.equal(itau.history_start_reconstruction.balance_cents, null);
    assert.equal(report.investments.length, 1);
    assert.equal(report.investments[0].current_balance_cents, 9000);
    assert.equal(report.investments[0].movement_linkage, 'not_provided_by_provider');
    assert.equal(report.investments[0].historical_reconstruction, null);
    assert.equal(report.blockers.includes('daniel_nubank:investment_history_unlinked'), true);

    const serialized = JSON.stringify(report);
    for (const privateValue of ['bank-1', 'card-1', 'thais_itau-card', 'thais_itau-savings', 'Entrada privada', 'Caixinha sem rotulo', 'Compra parcelada privada', 'Investimento privado']) {
        assert.doesNotMatch(serialized, new RegExp(privateValue, 'i'));
    }
});

test('RX trata rendimento como ganho e aplicacao/resgate como transferencia patrimonial', () => {
    const input = fixture();
    const daniel = input.items.find(item => item.alias_code === 'daniel_nubank');
    daniel.transactions.push({
        id: 'bank-yield', account_id: 'bank-1', description: 'Rendimento privado', amount_cents: 300,
        currency: 'BRL', date: '2026-03-13T10:00:00.000Z', status: 'POSTED',
        operation_type: 'RENDIMENTO_APLIC_FINANCEIRA'
    });

    const report = buildOpenFinanceHistoricalRx({
        items: input.items,
        historyStartDate: '2026-03-01',
        observedAt: input.observedAt,
        secret: SECRET,
        sourceLifecycles: canonicalSourceLifecycles()
    });
    const bank = report.segments.find(row =>
        row.source_alias === 'daniel_nubank' && row.product === 'bank_account');

    assert.equal(bank.flows.credits_cents, 5300);
    assert.equal(bank.flows.non_reserve_principal_credits_cents, 300);
    assert.equal(bank.flows.non_reserve_principal_debits_cents, 500);
    assert.equal(bank.investment_movements.applications_cents, 2000);
    assert.equal(bank.investment_movements.redemptions_cents, 5000);
    assert.equal(bank.investment_movements.investment_income_cents, 300);
    assert.equal(bank.investment_movements.principal_transfers_treated_as_income, false);
    assert.equal(bank.investment_movements.principal_transfers_treated_as_expense, false);
});

test('RX bloqueia rotulo de investimento sem semantica patrimonial suficiente', () => {
    const input = fixture();
    const daniel = input.items.find(item => item.alias_code === 'daniel_nubank');
    daniel.transactions.find(row => row.id === 'bank-expense').operation_type = 'INVESTIMENTO';

    const report = buildOpenFinanceHistoricalRx({
        items: input.items,
        historyStartDate: '2026-03-01',
        observedAt: input.observedAt,
        secret: SECRET,
        sourceLifecycles: canonicalSourceLifecycles()
    });
    const bank = report.segments.find(row =>
        row.source_alias === 'daniel_nubank' && row.product === 'bank_account');

    assert.equal(report.ready_for_reconciliation, false);
    assert.equal(report.blockers.includes('daniel_nubank:investment_movement_semantics_ambiguous'), true);
    assert.equal(bank.flows.reserve_principal_exclusion_scope,
        'provider_labeled_with_ambiguous_semantics');
    assert.equal(bank.flows.non_reserve_principal_debits_cents, 2500);
    assert.equal(bank.investment_movements.status, 'provider_labeled_with_ambiguous_semantics');
    assert.equal(bank.investment_movements.semantically_ambiguous_count, 1);
    assert.equal(bank.investment_movements.principal_transfers_treated_as_expense, false);
});

test('RX nao exclui do subtotal nem classifica operacao patrimonial com direcao incompatível', () => {
    const input = fixture();
    const daniel = input.items.find(item => item.alias_code === 'daniel_nubank');
    daniel.transactions.find(row => row.id === 'bank-income').operation_type = 'APLICACAO_FINANCEIRA';

    const report = buildOpenFinanceHistoricalRx({
        items: input.items,
        historyStartDate: '2026-03-01',
        observedAt: input.observedAt,
        secret: SECRET,
        sourceLifecycles: canonicalSourceLifecycles()
    });
    const bank = report.segments.find(row =>
        row.source_alias === 'daniel_nubank' && row.product === 'bank_account');

    assert.equal(report.blockers.includes('daniel_nubank:investment_movement_semantics_ambiguous'), true);
    assert.equal(bank.flows.non_reserve_principal_credits_cents, 5000);
    assert.equal(bank.investment_movements.applications_cents, 2000);
    assert.equal(bank.investment_movements.semantically_ambiguous_count, 1);
});

test('RX nao transforma rotulo de resgate nao financeiro em retirada de reserva', () => {
    const input = fixture();
    const daniel = input.items.find(item => item.alias_code === 'daniel_nubank');
    daniel.transactions.find(row => row.id === 'bank-income').operation_type = 'RESGATE_TARIFA';

    const report = buildOpenFinanceHistoricalRx({
        items: input.items,
        historyStartDate: '2026-03-01',
        observedAt: input.observedAt,
        secret: SECRET,
        sourceLifecycles: canonicalSourceLifecycles()
    });
    const bank = report.segments.find(row =>
        row.source_alias === 'daniel_nubank' && row.product === 'bank_account');

    assert.equal(bank.flows.non_reserve_principal_credits_cents, 5000);
    assert.equal(bank.investment_movements.redemptions_cents, 0);
    assert.deepEqual(bank.investment_movements.operation_types, ['APLICACAO_FINANCEIRA']);
});

test('RX separa inicio historico do cutoff de alertas e aplica lifecycle por conta', () => {
    const input = fixture();
    const itau = input.items.find(item => item.alias_code === 'thais_itau');
    itau.transactions.push(
        { id: 'itau-card-before', account_id: 'thais_itau-card', description: 'Antes da existencia', amount_cents: 100,
            currency: 'BRL', date: '2026-03-31T10:00:00.000Z', status: 'POSTED' },
        { id: 'itau-card-after', account_id: 'thais_itau-card', description: 'Depois da existencia', amount_cents: 200,
            currency: 'BRL', date: '2026-04-02T10:00:00.000Z', status: 'POSTED' }
    );
    const report = buildOpenFinanceHistoricalRx({
        items: input.items,
        historyStartDate: '2025-07-01',
        observedAt: input.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtHistoryStart: true },
            thais_itau: {
                accounts: {
                    'thais_itau-bank': { existedAtHistoryStart: true },
                    'thais_itau-savings': { existedAtHistoryStart: true },
                    'thais_itau-card': { existedAtHistoryStart: false, availableFrom: '2026-04-01' }
                }
            }
        }
    });

    assert.equal(report.history_start_date, '2025-07-01');
    assert.equal(Object.hasOwn(report, 'cutoff_date'), false);
    assert.equal(Object.hasOwn(report, 'alert_cutoff_date'), false);
    const bank = report.segments.find(row => row.source_alias === 'thais_itau'
        && row.product === 'bank_account' && row.subtype === 'CHECKING_ACCOUNT');
    const savings = report.segments.find(row => row.source_alias === 'thais_itau'
        && row.product === 'bank_account' && row.subtype === 'SAVINGS_ACCOUNT');
    const card = report.segments.find(row => row.source_alias === 'thais_itau' && row.product === 'credit_card');
    assert.equal(bank.history_start_relation, 'account_available_at_history_start');
    assert.equal(bank.account_existed_at_history_start, true);
    assert.equal(savings.history_start_relation, 'account_available_at_history_start');
    assert.equal(savings.account_existed_at_history_start, true);
    assert.equal(report.blockers.includes('thais_itau:account_start_unknown'), false);
    assert.equal(card.history_start_relation, 'not_applicable_before_account_start');
    assert.equal(card.account_existed_at_history_start, false);
    assert.equal(card.account_available_from, '2026-04-01');
    assert.equal(card.history_start_reconstruction.reason, 'account_not_available_at_history_start');
    assert.equal(card.flows.count, 1);
    assert.equal(card.coverage.first_observed_date, '2026-04-02');
    assert.equal(report.blockers.includes('thais_itau:activity_before_account_start'), true);

    assert.throws(() => buildOpenFinanceHistoricalRx({
        items: fixture().items,
        historyStartDate: '2025-07-01',
        observedAt: input.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { accounts: { 'unknown-account': { existedAtHistoryStart: true } } },
            thais_itau: { existedAtHistoryStart: false }
        }
    }), /historical_rx_lifecycle_account_unknown/);

    assert.throws(() => buildOpenFinanceHistoricalRx({
        items: fixture().items,
        historyStartDate: '2025-07-01',
        observedAt: input.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { accounts: { 'bank-1': { existedAtHistoryStart: true } } },
            thais_itau: { existedAtHistoryStart: false }
        }
    }), /historical_rx_account_lifecycle_required/);
});

test('RX preserva colisao heuristica de parcelas como ambigua sem inferir lacunas', () => {
    const input = fixture();
    const daniel = input.items.find(item => item.alias_code === 'daniel_nubank');
    const firstInstallment = daniel.transactions.find(row => row.id === 'card-i1');
    daniel.transactions.push({
        ...firstInstallment,
        id: 'card-i1-collision',
        date: '2026-03-21T10:00:00.000Z'
    });

    const report = buildOpenFinanceHistoricalRx({
        items: input.items,
        historyStartDate: '2025-07-01',
        observedAt: input.observedAt,
        secret: SECRET,
        sourceLifecycles: canonicalSourceLifecycles()
    });
    const card = report.segments.find(row =>
        row.source_alias === 'daniel_nubank' && row.product === 'credit_card');
    const series = card.installments.series[0];

    assert.equal(report.ready_for_reconciliation, false);
    assert.equal(report.blockers.includes('daniel_nubank:installment_series_ambiguous'), true);
    assert.equal(card.flows.identity_status, 'ambiguous_raw_provider_rows');
    assert.equal(card.installments.ambiguous_series_count, 1);
    assert.equal(series.identity_status, 'ambiguous_duplicate_installment_number');
    assert.equal(series.save_eligibility, 'blocked_pending_identity_resolution');
    assert.equal(card.installments.write_mode, 'read_only');
    assert.equal(series.observed_rows, 3);
    assert.deepEqual(series.observed_numbers, [1, 2]);
    assert.deepEqual(series.duplicate_numbers, [1]);
    assert.equal(series.missing_numbers, null);
});

test('RX valida inventario familiar exato sem misturar titular, conta e cartao', () => {
    const input = familyInventoryFixture();
    const report = buildOpenFinanceHistoricalRx({
        items: input.items,
        historyStartDate: '2025-07-01',
        observedAt: input.observedAt,
        secret: SECRET,
        sourceLifecycles: input.sourceLifecycles,
        expectedInventory: input.expectedInventory
    });

    assert.deepEqual(report.inventory_validation, {
        status: 'validated',
        sources: 4,
        accounts: 9,
        bank_accounts: 5,
        credit_cards: 4,
        owner_segment_counts: { daniel: 2, thais: 7 }
    });
    assert.equal(report.segments.length, 9);
    assert.equal(report.segments.filter(segment => segment.owner_scope === 'daniel').length, 2);
    assert.equal(report.segments.filter(segment => segment.owner_scope === 'thais').length, 7);
    assert.equal(report.segments.filter(segment => segment.product === 'bank_account').length, 5);
    assert.equal(report.segments.filter(segment => segment.product === 'credit_card').length, 4);
    const itauBank = report.segments.find(segment =>
        segment.source_alias === 'thais_itau' && segment.product === 'bank_account'
        && segment.subtype === 'CHECKING_ACCOUNT');
    const itauSavings = report.segments.find(segment =>
        segment.source_alias === 'thais_itau' && segment.product === 'bank_account'
        && segment.subtype === 'SAVINGS_ACCOUNT');
    const itauCard = report.segments.find(segment =>
        segment.source_alias === 'thais_itau' && segment.product === 'credit_card');
    assert.equal(itauBank.history_start_relation, 'account_available_at_history_start');
    assert.equal(itauSavings.history_start_relation, 'account_available_at_history_start');
    assert.equal(itauCard.history_start_relation, 'not_applicable_before_account_start');
    assert.notEqual(itauBank.segment_ref, itauSavings.segment_ref);
    assert.notEqual(itauSavings.segment_ref, itauCard.segment_ref);

    assert.throws(() => buildOpenFinanceHistoricalRx({
        items: input.items.slice(0, 3), historyStartDate: '2025-07-01', observedAt: input.observedAt,
        secret: SECRET, sourceLifecycles: input.sourceLifecycles, expectedInventory: input.expectedInventory
    }), /historical_rx_inventory_source_mismatch/);

    const extraCardItems = structuredClone(input.items);
    extraCardItems[0].accounts.push({
        id: 'daniel-extra-card', type: 'CREDIT', subtype: 'CREDIT_CARD', currency: 'BRL', balance_cents: 0
    });
    assert.throws(() => buildOpenFinanceHistoricalRx({
        items: extraCardItems, historyStartDate: '2025-07-01', observedAt: input.observedAt,
        secret: SECRET, sourceLifecycles: input.sourceLifecycles, expectedInventory: input.expectedInventory
    }), /historical_rx_inventory_account_count_mismatch/);

    const wrongOwnerItems = structuredClone(input.items);
    wrongOwnerItems.find(item => item.alias_code === 'cristina_nubank').owner_scope = 'cristina';
    assert.throws(() => buildOpenFinanceHistoricalRx({
        items: wrongOwnerItems, historyStartDate: '2025-07-01', observedAt: input.observedAt,
        secret: SECRET, sourceLifecycles: input.sourceLifecycles, expectedInventory: input.expectedInventory
    }), /historical_rx_inventory_owner_mismatch/);

    const wrongSubtypeItems = structuredClone(input.items);
    wrongSubtypeItems.find(item => item.alias_code === 'thais_itau')
        .accounts.find(account => account.subtype === 'SAVINGS_ACCOUNT').subtype = 'CHECKING_ACCOUNT';
    assert.throws(() => buildOpenFinanceHistoricalRx({
        items: wrongSubtypeItems, historyStartDate: '2025-07-01', observedAt: input.observedAt,
        secret: SECRET, sourceLifecycles: input.sourceLifecycles, expectedInventory: input.expectedInventory
    }), /historical_rx_inventory_account_subtype_mismatch/);
});

test('RX exige inventario tambem na fronteira direta do builder', () => {
    const input = fixture();
    assert.throws(() => buildHistoricalRx({
        items: input.items,
        historyStartDate: '2025-07-01',
        observedAt: input.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtHistoryStart: true },
            thais_itau: { existedAtHistoryStart: false }
        }
    }), /historical_rx_expected_inventory_required/);

    assert.throws(() => buildHistoricalRx({
        items: input.items,
        historyStartDate: '2025-07-01',
        observedAt: input.observedAt,
        secret: SECRET,
        sourceLifecycles: canonicalSourceLifecycles(),
        expectedInventory: structuredClone(CANONICAL_HISTORICAL_RX_INVENTORY).slice(0, 3)
    }), /historical_rx_noncanonical_inventory/);
});

test('RX falha fechado em fonte essencial incompleta e nunca transforma ausencia em zero', () => {
    const input = fixture();
    input.items[0].availability.transactions = 'partial';
    const report = buildOpenFinanceHistoricalRx({
        items: input.items,
        historyStartDate: '2026-03-01',
        observedAt: input.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtHistoryStart: true },
            thais_itau: { existedAtHistoryStart: false }
        }
    });
    assert.equal(report.ready_for_reconciliation, false);
    assert.deepEqual(report.blockers, [
        'daniel_nubank:investment_history_unlinked',
        'daniel_nubank:transactions_partial'
    ]);
    assert.equal(report.financial_writes, 0);
    const incompleteBank = report.segments.find(row =>
        row.source_alias === 'daniel_nubank' && row.product === 'bank_account');
    assert.equal(incompleteBank.flows.count, null);
    assert.equal(incompleteBank.flows.posted_count, null);
    assert.equal(incompleteBank.flows.pending_count, null);
    assert.equal(incompleteBank.flows.credits_cents, null);
    assert.equal(incompleteBank.flows.debits_cents, null);
    assert.equal(incompleteBank.flows.posted_net_cents, null);
    assert.equal(incompleteBank.coverage.first_observed_date, null);
    assert.equal(incompleteBank.coverage.last_observed_date, null);
    assert.equal(incompleteBank.history_start_reconstruction.balance_cents, null);
    assert.equal(incompleteBank.history_start_reconstruction.reason, 'complete_bank_history_unavailable');
    const incompleteCard = report.segments.find(row =>
        row.source_alias === 'daniel_nubank' && row.product === 'credit_card');
    assert.deepEqual(incompleteCard.flows, {
        identity_status: 'unavailable',
        count: null,
        posted_count: null,
        pending_count: null,
        charges_cents: null,
        payments_or_credits_cents: null,
        posted_net_cents: null
    });
    assert.deepEqual(incompleteCard.installments, {
        status: 'partial',
        write_mode: 'read_only',
        series: null,
        series_count: null,
        incomplete_series_count: null,
        ambiguous_series_count: null,
        observed_rows: null,
        synthesized_rows: 0
    });

    const unknownLifecycle = fixture();
    const unknownReport = buildOpenFinanceHistoricalRx({
        items: unknownLifecycle.items,
        historyStartDate: '2026-03-01',
        observedAt: unknownLifecycle.observedAt,
        secret: SECRET
    });
    assert.equal(unknownReport.ready_for_reconciliation, false);
    assert.deepEqual(unknownReport.blockers, [
        'cristina_nubank:account_start_unknown',
        'daniel_nubank:account_start_unknown',
        'daniel_nubank:investment_history_unlinked',
        'thais_itau:account_start_unknown',
        'thais_nubank:account_start_unknown'
    ]);

    const unavailableAccounts = fixture();
    unavailableAccounts.items[0].availability.accounts = 'unavailable';
    const unavailableAccountsReport = buildOpenFinanceHistoricalRx({
        items: unavailableAccounts.items,
        historyStartDate: '2026-03-01',
        observedAt: unavailableAccounts.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtHistoryStart: true },
            thais_itau: { existedAtHistoryStart: false }
        }
    });
    const unavailableBank = unavailableAccountsReport.segments.find(row =>
        row.source_alias === 'daniel_nubank' && row.product === 'bank_account');
    const unavailableCard = unavailableAccountsReport.segments.find(row =>
        row.source_alias === 'daniel_nubank' && row.product === 'credit_card');
    assert.equal(unavailableBank.current_snapshot.balance_cents, null);
    assert.deepEqual(unavailableBank.flows, {
        semantic: 'raw_account_movement_not_income_expense',
        reserve_principal_exclusion_scope: 'unavailable',
        count: null,
        posted_count: null,
        pending_count: null,
        credits_cents: null,
        debits_cents: null,
        non_reserve_principal_credits_cents: null,
        non_reserve_principal_debits_cents: null,
        posted_net_cents: null
    });
    assert.deepEqual(unavailableCard.current_snapshot, {
        provider_balance_cents: null,
        provider_balance_semantic: 'used_limit_not_invoice',
        credit_limit_cents: null,
        available_credit_limit_cents: null,
        used_limit_cents: null,
        observed_at: input.observedAt
    });
    assert.deepEqual(unavailableCard.bills, {
        status: 'available',
        count: null,
        total_cents: null,
        first_due_date: null,
        last_due_date: null
    });
});

test('RX exige cobertura de fatura para cartao e recusa ligacao a conta desconhecida', () => {
    const missingBills = fixture();
    missingBills.items[0].availability.bills = 'unavailable';
    const report = buildOpenFinanceHistoricalRx({
        items: missingBills.items,
        historyStartDate: '2026-03-01',
        observedAt: missingBills.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtHistoryStart: true },
            thais_itau: { existedAtHistoryStart: false }
        }
    });
    assert.equal(report.ready_for_reconciliation, false);
    assert.deepEqual(report.blockers, [
        'daniel_nubank:bills_unavailable',
        'daniel_nubank:investment_history_unlinked'
    ]);
    const unavailableBills = report.segments.find(row =>
        row.source_alias === 'daniel_nubank' && row.product === 'credit_card').bills;
    assert.deepEqual(unavailableBills, {
        status: 'unavailable',
        count: null,
        total_cents: null,
        first_due_date: null,
        last_due_date: null
    });

    const unknownAccount = fixture();
    unknownAccount.items[0].transactions[0].account_id = 'conta-inexistente';
    assert.throws(() => buildOpenFinanceHistoricalRx({
        items: unknownAccount.items,
        historyStartDate: '2026-03-01',
        observedAt: unknownAccount.observedAt,
        secret: SECRET
    }), /historical_rx_transaction_account_unknown/);

    assert.throws(() => buildOpenFinanceHistoricalRx({
        items: fixture().items,
        historyStartDate: '2026-02-30',
        observedAt: fixture().observedAt,
        secret: SECRET
    }), /invalid_historical_rx_history_start/);

    const missingBalance = fixture();
    missingBalance.items[0].accounts[0].balance_cents = null;
    const missingBalanceReport = buildOpenFinanceHistoricalRx({
        items: missingBalance.items,
        historyStartDate: '2026-03-01',
        observedAt: missingBalance.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtHistoryStart: true },
            thais_itau: { existedAtHistoryStart: false }
        }
    });
    assert.equal(missingBalanceReport.segments.find(row =>
        row.source_alias === 'daniel_nubank' && row.product === 'bank_account')
        .history_start_reconstruction.balance_cents, null);
    assert.equal(missingBalanceReport.segments.find(row =>
        row.source_alias === 'daniel_nubank' && row.product === 'bank_account')
        .history_start_reconstruction.reason, 'complete_bank_history_unavailable');

    assert.throws(() => buildOpenFinanceHistoricalRx({
        items: fixture().items,
        historyStartDate: '2026-03-01',
        observedAt: fixture().observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtHistoryStart: true, availableFrom: '2026-04-01' },
            thais_itau: { existedAtHistoryStart: false }
        }
    }), /conflicting_historical_rx_account_lifecycle/);

    const invalidInstallment = fixture();
    invalidInstallment.items[0].transactions[4].installment_number = 4;
    assert.throws(() => buildOpenFinanceHistoricalRx({
        items: invalidInstallment.items,
        historyStartDate: '2026-03-01',
        observedAt: invalidInstallment.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtHistoryStart: true },
            thais_itau: { existedAtHistoryStart: false }
        }
    }), /invalid_historical_rx_installment_number/);

    const bankBill = fixture();
    bankBill.items[0].bills[0].account_id = 'bank-1';
    assert.throws(() => buildOpenFinanceHistoricalRx({
        items: bankBill.items,
        historyStartDate: '2026-03-01',
        observedAt: bankBill.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtHistoryStart: true },
            thais_itau: { existedAtHistoryStart: false }
        }
    }), /historical_rx_bill_requires_credit_account/);

    const bankInstallment = fixture();
    bankInstallment.items[0].transactions[0].installment_number = 1;
    bankInstallment.items[0].transactions[0].total_installments = 3;
    assert.throws(() => buildOpenFinanceHistoricalRx({
        items: bankInstallment.items,
        historyStartDate: '2026-03-01',
        observedAt: bankInstallment.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtHistoryStart: true },
            thais_itau: { existedAtHistoryStart: false }
        }
    }), /historical_rx_installment_requires_credit_account/);
});

test('snapshot de imutabilidade cobre sidecars SQLite e detecta qualquer divergencia', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-finance-rx-sqlite-set-'));
    try {
        const databasePath = path.join(root, 'staging.sqlite');
        fs.writeFileSync(databasePath, 'db');
        fs.writeFileSync(`${databasePath}-wal`, 'wal-before');
        fs.writeFileSync(`${databasePath}-shm`, 'shm-before');
        const before = snapshotSqliteFileSet(databasePath);
        assert.deepEqual(Object.keys(before).sort(), ['database', 'journal', 'shm', 'wal']);
        assert.equal(sqliteFileSetsEqual(before, snapshotSqliteFileSet(databasePath)), true);
        fs.writeFileSync(`${databasePath}-wal`, 'wal-after');
        assert.equal(sqliteFileSetsEqual(before, snapshotSqliteFileSet(databasePath)), false);
        fs.writeFileSync(`${databasePath}-wal`, 'wal-before');
        fs.writeFileSync(`${databasePath}-journal`, 'journal-created');
        assert.equal(sqliteFileSetsEqual(before, snapshotSqliteFileSet(databasePath)), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('copia SQLite replica o conjunto completo sem tocar a fonte', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-finance-rx-copy-set-'));
    try {
        const source = path.join(root, 'source.sqlite');
        const target = path.join(root, 'private', 'staging.sqlite');
        fs.mkdirSync(path.dirname(target), { mode: 0o700 });
        for (const [suffix, contents] of [['', 'db'], ['-wal', 'wal'], ['-shm', 'shm'], ['-journal', '']]) {
            fs.writeFileSync(`${source}${suffix}`, contents);
        }
        const before = snapshotSqliteFileSet(source);
        copySqliteFileSet(source, target, before);
        assert.deepEqual(snapshotSqliteFileSet(target), before);
        assert.deepEqual(snapshotSqliteFileSet(source), before);
        if (process.platform !== 'win32') {
            assert.equal(fs.statSync(path.dirname(target)).mode & 0o777, 0o700);
            for (const suffix of ['', '-wal', '-shm', '-journal']) {
                assert.equal(fs.statSync(`${target}${suffix}`).mode & 0o777, 0o600);
            }
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('CLI abre somente copia privada no vault real, exige readonly e limpa em finally', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-finance-rx-boundary-'));
    const databasePath = path.join(root, 'live-staging.sqlite');
    const secretPath = path.join(root, 'staging-secret.txt');
    const mappingPath = path.join(root, 'pluggy-item-map.json');
    const lifecyclePath = path.join(root, 'source-lifecycle.json');
    const inventoryPath = path.join(root, 'expected-inventory.json');
    const outputPath = path.join(root, 'historical-rx.json');
    const input = fixture();
    input.items.forEach(item => { item.investments = []; });
    fs.writeFileSync(secretPath, SECRET, 'utf8');
    fs.writeFileSync(mappingPath, JSON.stringify(input.items.map(item => ({ alias: item.alias_code }))), 'utf8');
    fs.writeFileSync(inventoryPath, JSON.stringify(CANONICAL_HISTORICAL_RX_INVENTORY), 'utf8');
    fs.writeFileSync(lifecyclePath, JSON.stringify(resolvedSourceLifecycles()), 'utf8');
    const sourceVault = new OpenFinanceLiveStagingVault({ databasePath, secret: SECRET });
    sourceVault.ingestSnapshot({
        provider: 'pluggy', mode: 'live_readonly_staging', event_id: 'rx-boundary-event',
        observed_at: input.observedAt, items: input.items
    });
    sourceVault.close();
    const sourceBefore = snapshotSqliteFileSet(databasePath);
    let openedPath;
    let openedReadonly;
    let snapshotInsideVault;
    class ObservedRealVault extends OpenFinanceLiveStagingVault {
        constructor(options) {
            openedPath = options.databasePath;
            openedReadonly = options.readonly;
            snapshotInsideVault = snapshotSqliteFileSet(options.databasePath);
            super(options);
        }
    }
    try {
        const stdout = { value: '', write(chunk) { this.value += chunk; } };
        const status = runHistoricalRx([
            '--confirm-read-only', '--history-start', '2026-03-01',
            '--staging-db', databasePath, '--secret-file', secretPath,
            '--mapping-file', mappingPath, '--source-lifecycle-file', lifecyclePath,
            '--expected-inventory-file', inventoryPath,
            '--output', outputPath
        ], { VaultClass: ObservedRealVault, stdout });
        assert.equal(status, 0);
        assert.notEqual(path.resolve(openedPath), path.resolve(databasePath));
        assert.match(path.basename(path.dirname(openedPath)), /^financasbot-historical-rx-/);
        assert.equal(openedReadonly, true);
        assert.deepEqual(snapshotInsideVault, sourceBefore);
        assert.equal(fs.existsSync(path.dirname(openedPath)), false);
        assert.deepEqual(snapshotSqliteFileSet(databasePath), sourceBefore);
        assert.equal(JSON.parse(stdout.value).sqlite_files_unchanged, true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('CLI exige inventario externo antes de abrir o vault', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-finance-rx-inventory-required-'));
    try {
        const databasePath = path.join(root, 'live-staging.sqlite');
        const secretPath = path.join(root, 'staging-secret.txt');
        const mappingPath = path.join(root, 'pluggy-item-map.json');
        const inventoryPath = path.join(root, 'expected-inventory.json');
        const outputPath = path.join(root, 'historical-rx.json');
        fs.writeFileSync(databasePath, 'not-opened');
        fs.writeFileSync(secretPath, SECRET, 'utf8');
        fs.writeFileSync(mappingPath, JSON.stringify([{ alias: 'daniel_nubank' }]), 'utf8');
        let vaultOpened = false;
        let snapshotCalls = 0;
        let copyCalls = 0;
        class VaultTripwire extends OpenFinanceLiveStagingVault {
            constructor(options) {
                vaultOpened = true;
                super(options);
            }
        }
        const tripwires = {
            VaultClass: VaultTripwire,
            snapshotSqliteFileSetFn() {
                snapshotCalls += 1;
                throw new Error('snapshot_tripwire_called');
            },
            copySqliteFileSetFn() {
                copyCalls += 1;
                throw new Error('copy_tripwire_called');
            }
        };
        assert.throws(() => runHistoricalRx([
            '--confirm-read-only', '--history-start', '2025-07-01',
            '--staging-db', databasePath, '--secret-file', secretPath,
            '--mapping-file', mappingPath, '--output', outputPath
        ], tripwires), /historical_rx_expected_inventory_file_required/);
        assert.equal(vaultOpened, false);
        assert.equal(fs.existsSync(outputPath), false);

        fs.writeFileSync(inventoryPath, '{"broken":', 'utf8');
        assert.throws(() => runHistoricalRx([
            '--confirm-read-only', '--history-start', '2025-07-01',
            '--staging-db', databasePath, '--secret-file', secretPath,
            '--mapping-file', mappingPath, '--expected-inventory-file', inventoryPath,
            '--output', outputPath
        ], tripwires), /invalid_historical_rx_expected_inventory_file/);

        const wrongOwner = structuredClone(CANONICAL_HISTORICAL_RX_INVENTORY);
        wrongOwner.find(entry => entry.alias === 'cristina_nubank').ownerScope = 'cristina';
        const wrongCount = structuredClone(CANONICAL_HISTORICAL_RX_INVENTORY);
        wrongCount.find(entry => entry.alias === 'daniel_nubank').accounts.CREDIT = 0;
        const wrongShape = structuredClone(CANONICAL_HISTORICAL_RX_INVENTORY);
        wrongShape[0].unexpected = true;
        for (const [inventory, expectedError] of [
            [structuredClone(CANONICAL_HISTORICAL_RX_INVENTORY).slice(0, 3), /historical_rx_noncanonical_inventory/],
            [wrongOwner, /historical_rx_noncanonical_inventory/],
            [wrongCount, /historical_rx_noncanonical_inventory/],
            [wrongShape, /invalid_historical_rx_expected_inventory/]
        ]) {
            fs.writeFileSync(inventoryPath, JSON.stringify(inventory), 'utf8');
            assert.throws(() => runHistoricalRx([
                '--confirm-read-only', '--history-start', '2025-07-01',
                '--staging-db', databasePath, '--secret-file', secretPath,
                '--mapping-file', mappingPath, '--expected-inventory-file', inventoryPath,
                '--output', outputPath
            ], tripwires), expectedError);
            assert.equal(vaultOpened, false);
        }

        fs.writeFileSync(inventoryPath, JSON.stringify(CANONICAL_HISTORICAL_RX_INVENTORY), 'utf8');
        assert.throws(() => runHistoricalRx([
            '--confirm-read-only', '--history-start', '2025-07-01',
            '--staging-db', databasePath, '--secret-file', secretPath,
            '--mapping-file', mappingPath, '--expected-inventory-file', inventoryPath,
            '--output', outputPath
        ], tripwires), /historical_rx_mapping_inventory_mismatch/);
        assert.equal(vaultOpened, false);
        assert.equal(snapshotCalls, 0);
        assert.equal(copyCalls, 0);
        assert.equal(fs.existsSync(outputPath), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('CLI subprocesso publica erro sanitizado com o gate novo', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-finance-rx-error-contract-'));
    try {
        const databasePath = path.join(root, 'live-staging.sqlite');
        const secretPath = path.join(root, 'staging-secret.txt');
        const mappingPath = path.join(root, 'pluggy-item-map.json');
        const inventoryPath = path.join(root, 'expected-inventory.json');
        const outputPath = path.join(root, 'historical-rx.json');
        fs.writeFileSync(databasePath, 'not-opened');
        fs.writeFileSync(secretPath, SECRET, 'utf8');
        fs.writeFileSync(mappingPath,
            JSON.stringify(CANONICAL_HISTORICAL_RX_INVENTORY.map(({ alias }) => ({ alias }))), 'utf8');
        fs.writeFileSync(inventoryPath, '{"broken":', 'utf8');
        const script = path.resolve(__dirname, '..', 'scripts', 'runOpenFinanceHistoricalRx.js');
        const result = spawnSync(process.execPath, [
            script, '--confirm-read-only', '--history-start', '2025-07-01',
            '--staging-db', databasePath, '--secret-file', secretPath,
            '--mapping-file', mappingPath, '--expected-inventory-file', inventoryPath,
            '--output', outputPath
        ], { encoding: 'utf8' });
        assert.equal(result.status, 1);
        assert.equal(result.stdout, '');
        assert.deepEqual(JSON.parse(result.stderr), {
            gate: 'RX-HIST-RESERVE-LIFECYCLE-01',
            outcome: 'NO_GO',
            reason: 'invalid_historical_rx_expected_inventory_file',
            financial_writes: 0
        });
        assert.equal(fs.existsSync(outputPath), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('CLI falha fechado com journal pendente antes de abrir vault ou criar saida', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-finance-rx-journal-'));
    try {
        const databasePath = path.join(root, 'live-staging.sqlite');
        const secretPath = path.join(root, 'staging-secret.txt');
        const mappingPath = path.join(root, 'pluggy-item-map.json');
        const inventoryPath = path.join(root, 'expected-inventory.json');
        const outputPath = path.join(root, 'historical-rx.json');
        const input = fixture();
        fs.writeFileSync(secretPath, SECRET, 'utf8');
        fs.writeFileSync(mappingPath, JSON.stringify(input.items.map(item => ({ alias: item.alias_code }))), 'utf8');
        fs.writeFileSync(inventoryPath, JSON.stringify(CANONICAL_HISTORICAL_RX_INVENTORY), 'utf8');
        const sourceVault = new OpenFinanceLiveStagingVault({ databasePath, secret: SECRET });
        sourceVault.ingestSnapshot({
            provider: 'pluggy', mode: 'live_readonly_staging', event_id: 'rx-journal-event',
            observed_at: input.observedAt, items: input.items
        });
        sourceVault.close();
        fs.writeFileSync(`${databasePath}-journal`, 'uncheckpointed');
        let vaultOpened = false;
        class VaultTripwire extends OpenFinanceLiveStagingVault {
            constructor(options) {
                vaultOpened = true;
                super(options);
            }
        }
        assert.throws(() => runHistoricalRx([
            '--confirm-read-only', '--history-start', '2026-03-01',
            '--staging-db', databasePath, '--secret-file', secretPath,
            '--mapping-file', mappingPath, '--expected-inventory-file', inventoryPath,
            '--output', outputPath
        ], { VaultClass: VaultTripwire }), /historical_rx_uncheckpointed_sqlite_state/);
        assert.equal(vaultOpened, false);
        assert.equal(fs.existsSync(outputPath), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('CLI remove copia privada mesmo quando o vault real falha apos abrir', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-finance-rx-cleanup-'));
    const databasePath = path.join(root, 'live-staging.sqlite');
    const secretPath = path.join(root, 'staging-secret.txt');
    const mappingPath = path.join(root, 'pluggy-item-map.json');
    const inventoryPath = path.join(root, 'expected-inventory.json');
    const outputPath = path.join(root, 'historical-rx.json');
    const input = fixture();
    input.items.forEach(item => { item.investments = []; });
    fs.writeFileSync(secretPath, SECRET, 'utf8');
    fs.writeFileSync(mappingPath, JSON.stringify(CANONICAL_HISTORICAL_RX_INVENTORY.map(({ alias }) => ({ alias }))), 'utf8');
    fs.writeFileSync(inventoryPath, JSON.stringify(CANONICAL_HISTORICAL_RX_INVENTORY), 'utf8');
    input.items = input.items.filter(item => item.alias_code !== 'cristina_nubank');
    const sourceVault = new OpenFinanceLiveStagingVault({ databasePath, secret: SECRET });
    sourceVault.ingestSnapshot({
        provider: 'pluggy', mode: 'live_readonly_staging', event_id: 'rx-cleanup-event',
        observed_at: input.observedAt, items: input.items
    });
    sourceVault.close();
    const sourceBefore = snapshotSqliteFileSet(databasePath);
    let openedPath;
    class ObservedRealVault extends OpenFinanceLiveStagingVault {
        constructor(options) {
            openedPath = options.databasePath;
            super(options);
        }
    }
    try {
        assert.throws(() => runHistoricalRx([
            '--confirm-read-only', '--history-start', '2026-03-01',
            '--staging-db', databasePath, '--secret-file', secretPath,
            '--mapping-file', mappingPath, '--expected-inventory-file', inventoryPath,
            '--output', outputPath
        ], { VaultClass: ObservedRealVault }), /historical_rx_alias_snapshot_missing:cristina_nubank/);
        assert.equal(fs.existsSync(path.dirname(openedPath)), false);
        assert.deepEqual(snapshotSqliteFileSet(databasePath), sourceBefore);
        assert.equal(fs.existsSync(outputPath), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('CLI le vault real em readonly, grava fora do Git e nao imprime payload privado', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-finance-rx-'));
    const databasePath = path.join(root, 'live-staging.sqlite');
    const secretPath = path.join(root, 'staging-secret.txt');
    const mappingPath = path.join(root, 'pluggy-item-map.json');
    const lifecyclePath = path.join(root, 'source-lifecycle.json');
    const inventoryPath = path.join(root, 'expected-inventory.json');
    const outputPath = path.join(root, 'historical-rx.json');
    const input = fixture();
    input.items.forEach(item => { item.investments = []; });
    fs.writeFileSync(secretPath, SECRET, 'utf8');
    fs.writeFileSync(mappingPath, JSON.stringify(input.items.map(item => ({ alias: item.alias_code }))), 'utf8');
    fs.writeFileSync(inventoryPath, JSON.stringify(CANONICAL_HISTORICAL_RX_INVENTORY), 'utf8');
    fs.writeFileSync(lifecyclePath, JSON.stringify(resolvedSourceLifecycles()), 'utf8');
    const vault = new OpenFinanceLiveStagingVault({ databasePath, secret: SECRET });
    vault.ingestSnapshot({
        provider: 'pluggy', mode: 'live_readonly_staging', event_id: 'rx-test-event',
        observed_at: input.observedAt, items: input.items
    });
    vault.close();
    const beforeHash = crypto.createHash('sha256').update(fs.readFileSync(databasePath)).digest('hex');
    const beforeSqliteFiles = snapshotSqliteFileSet(databasePath);
    const script = path.resolve(__dirname, '..', 'scripts', 'runOpenFinanceHistoricalRx.js');
    const result = spawnSync(process.execPath, [
        script, '--confirm-read-only', '--history-start', '2026-03-01',
        '--staging-db', databasePath, '--secret-file', secretPath,
        '--mapping-file', mappingPath, '--source-lifecycle-file', lifecyclePath,
        '--expected-inventory-file', inventoryPath,
        '--output', outputPath
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const publicResult = JSON.parse(result.stdout);
    assert.equal(publicResult.database_unchanged, true);
    assert.equal(publicResult.sqlite_files_unchanged, true);
    assert.equal(publicResult.financial_writes, 0);
    assert.equal(publicResult.gate, 'RX-HIST-RESERVE-LIFECYCLE-01');
    assert.equal(publicResult.segments, 9);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(databasePath)).digest('hex'), beforeHash);
    assert.equal(sqliteFileSetsEqual(beforeSqliteFiles, snapshotSqliteFileSet(databasePath)), true);
    const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(report.financial_writes, 0);
    assert.equal(report.gate, 'RX-HIST-RESERVE-LIFECYCLE-01');
    assert.equal(report.segments.find(row =>
        row.source_alias === 'thais_itau' && row.product === 'credit_card').history_start_relation,
        'not_applicable_before_account_start');
    for (const privateValue of ['bank-1', 'card-1', 'Entrada privada', 'Compra parcelada privada']) {
        assert.doesNotMatch(result.stdout, new RegExp(privateValue, 'i'));
        assert.doesNotMatch(JSON.stringify(report), new RegExp(privateValue, 'i'));
    }
});

test('CLI retorna NO_GO quando o relatorio contem blockers', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-finance-rx-blocked-'));
    try {
        const databasePath = path.join(root, 'live-staging.sqlite');
        const secretPath = path.join(root, 'staging-secret.txt');
        const mappingPath = path.join(root, 'pluggy-item-map.json');
        const lifecyclePath = path.join(root, 'source-lifecycle.json');
        const inventoryPath = path.join(root, 'expected-inventory.json');
        const outputPath = path.join(root, 'historical-rx.json');
        const input = fixture();
        input.items.forEach(item => { item.investments = []; });
        input.items[0].availability.transactions = 'partial';
        fs.writeFileSync(secretPath, SECRET, 'utf8');
        fs.writeFileSync(mappingPath, JSON.stringify(input.items.map(item => ({ alias: item.alias_code }))), 'utf8');
        fs.writeFileSync(inventoryPath, JSON.stringify(CANONICAL_HISTORICAL_RX_INVENTORY), 'utf8');
        fs.writeFileSync(lifecyclePath, JSON.stringify(resolvedSourceLifecycles()), 'utf8');
        const vault = new OpenFinanceLiveStagingVault({ databasePath, secret: SECRET });
        vault.ingestSnapshot({
            provider: 'pluggy', mode: 'live_readonly_staging', event_id: 'rx-blocked-event',
            observed_at: input.observedAt, items: input.items
        });
        vault.close();
        const script = path.resolve(__dirname, '..', 'scripts', 'runOpenFinanceHistoricalRx.js');
        const result = spawnSync(process.execPath, [
            script, '--confirm-read-only', '--history-start', '2026-03-01',
            '--staging-db', databasePath, '--secret-file', secretPath,
            '--mapping-file', mappingPath, '--source-lifecycle-file', lifecyclePath,
            '--expected-inventory-file', inventoryPath,
            '--output', outputPath
        ], { encoding: 'utf8' });
        assert.equal(result.status, 2, result.stderr);
        const publicResult = JSON.parse(result.stdout);
        assert.equal(publicResult.outcome, 'NO_GO');
        assert.equal(publicResult.ready_for_reconciliation, false);
        assert.deepEqual(publicResult.blockers, ['daniel_nubank:transactions_partial']);
        assert.equal(publicResult.sqlite_files_unchanged, true);
        assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).ready_for_reconciliation, false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('CLI grava RX bloqueado e sanitizado quando identidade de parcela e ambigua', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-finance-rx-installment-ambiguity-'));
    try {
        const databasePath = path.join(root, 'live-staging.sqlite');
        const secretPath = path.join(root, 'staging-secret.txt');
        const mappingPath = path.join(root, 'pluggy-item-map.json');
        const lifecyclePath = path.join(root, 'source-lifecycle.json');
        const inventoryPath = path.join(root, 'expected-inventory.json');
        const outputPath = path.join(root, 'historical-rx.json');
        const input = fixture();
        input.items.forEach(item => { item.investments = []; });
        const daniel = input.items.find(item => item.alias_code === 'daniel_nubank');
        const firstInstallment = daniel.transactions.find(row => row.id === 'card-i1');
        daniel.transactions.push({
            ...firstInstallment,
            id: 'private-collision-id',
            date: '2026-03-21T10:00:00.000Z'
        });
        fs.writeFileSync(secretPath, SECRET, 'utf8');
        fs.writeFileSync(mappingPath, JSON.stringify(input.items.map(item => ({ alias: item.alias_code }))), 'utf8');
        fs.writeFileSync(inventoryPath, JSON.stringify(CANONICAL_HISTORICAL_RX_INVENTORY), 'utf8');
        fs.writeFileSync(lifecyclePath, JSON.stringify(resolvedSourceLifecycles()), 'utf8');
        const vault = new OpenFinanceLiveStagingVault({ databasePath, secret: SECRET });
        vault.ingestSnapshot({
            provider: 'pluggy', mode: 'live_readonly_staging', event_id: 'rx-ambiguous-installment-event',
            observed_at: input.observedAt, items: input.items
        });
        vault.close();
        const beforeSqliteFiles = snapshotSqliteFileSet(databasePath);
        const script = path.resolve(__dirname, '..', 'scripts', 'runOpenFinanceHistoricalRx.js');
        const result = spawnSync(process.execPath, [
            script, '--confirm-read-only', '--history-start', '2026-03-01',
            '--staging-db', databasePath, '--secret-file', secretPath,
            '--mapping-file', mappingPath, '--source-lifecycle-file', lifecyclePath,
            '--expected-inventory-file', inventoryPath,
            '--output', outputPath
        ], { encoding: 'utf8' });

        assert.equal(result.status, 2, result.stderr);
        const publicResult = JSON.parse(result.stdout);
        assert.deepEqual(publicResult.blockers, ['daniel_nubank:installment_series_ambiguous']);
        assert.equal(publicResult.financial_writes, 0);
        assert.equal(publicResult.sqlite_files_unchanged, true);
        assert.equal(sqliteFileSetsEqual(beforeSqliteFiles, snapshotSqliteFileSet(databasePath)), true);
        const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        const card = report.segments.find(row =>
            row.source_alias === 'daniel_nubank' && row.product === 'credit_card');
        assert.equal(card.flows.identity_status, 'ambiguous_raw_provider_rows');
        assert.equal(card.installments.ambiguous_series_count, 1);
        assert.equal(card.installments.series[0].missing_numbers, null);
        for (const privateValue of ['private-collision-id', 'Compra parcelada privada']) {
            assert.doesNotMatch(result.stdout, new RegExp(privateValue, 'i'));
            assert.doesNotMatch(JSON.stringify(report), new RegExp(privateValue, 'i'));
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
