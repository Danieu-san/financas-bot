'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
    buildOpenFinanceHistoricalRx,
    snapshotSqliteFileSet,
    sqliteFileSetsEqual
} = require('../src/openFinance/openFinanceHistoricalRx');
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');

const SECRET = 'rx-hist-seg-test-secret-32-bytes-minimum';

function fixture() {
    return {
        observedAt: '2026-07-28T12:00:00.000Z',
        items: [{
            id: 'item-daniel',
            alias_code: 'daniel_nubank',
            owner_scope: 'daniel',
            availability: { accounts: 'available', transactions: 'available', bills: 'available', investments: 'available' },
            accounts: [
                { id: 'bank-1', type: 'BANK', subtype: 'CHECKING_ACCOUNT', currency: 'BRL', balance_cents: 10000 },
                { id: 'card-1', type: 'CREDIT', subtype: 'CREDIT_CARD', currency: 'BRL', balance_cents: 30000,
                    credit_limit_cents: 100000, available_credit_limit_cents: 70000, used_limit_cents: 30000 }
            ],
            transactions: [
                { id: 'bank-before', account_id: 'bank-1', description: 'Antes do corte', amount_cents: 1000,
                    currency: 'BRL', date: '2026-02-20T10:00:00.000Z', status: 'POSTED' },
                { id: 'bank-income', account_id: 'bank-1', description: 'Entrada privada', amount_cents: 5000,
                    currency: 'BRL', date: '2026-03-10T10:00:00.000Z', status: 'POSTED' },
                { id: 'bank-expense', account_id: 'bank-1', description: 'Saida privada', amount_cents: -2000,
                    currency: 'BRL', date: '2026-03-11T10:00:00.000Z', status: 'POSTED' },
                { id: 'bank-pending', account_id: 'bank-1', description: 'Pendente privada', amount_cents: -500,
                    currency: 'BRL', date: '2026-03-12T10:00:00.000Z', status: 'PENDING' },
                { id: 'card-i1', account_id: 'card-1', description: 'Compra parcelada privada', amount_cents: 1000,
                    currency: 'BRL', date: '2026-03-20T10:00:00.000Z', original_date: '2026-03-20T10:00:00.000Z',
                    status: 'POSTED', installment_number: 1, total_installments: 3, bill_forecast_month: '2026-04' },
                { id: 'card-i2', account_id: 'card-1', description: 'Compra parcelada privada', amount_cents: 1000,
                    currency: 'BRL', date: '2026-04-20T10:00:00.000Z', original_date: '2026-03-20T10:00:00.000Z',
                    status: 'PENDING', installment_number: 2, total_installments: 3, bill_forecast_month: '2026-05' },
                { id: 'card-payment', account_id: 'card-1', description: 'Pagamento privado', amount_cents: -2000,
                    currency: 'BRL', date: '2026-04-25T10:00:00.000Z', status: 'POSTED' }
            ],
            bills: [
                { id: 'bill-1', account_id: 'card-1', due_date: '2026-04-10T00:00:00.000Z', total_cents: 4500, currency: 'BRL' }
            ],
            investments: [
                { id: 'investment-1', name: 'Investimento privado', type: 'CDB', balance_cents: 9000, currency: 'BRL', status: 'ACTIVE' }
            ]
        }, {
            id: 'item-itau',
            alias_code: 'thais_itau',
            owner_scope: 'thais',
            availability: { accounts: 'available', transactions: 'available', bills: 'available', investments: 'unavailable' },
            accounts: [
                { id: 'card-itau', type: 'CREDIT', subtype: 'CREDIT_CARD', currency: 'BRL', balance_cents: 1200,
                    credit_limit_cents: 50000, available_credit_limit_cents: 48800, used_limit_cents: 1200 }
            ],
            transactions: [], bills: [], investments: []
        }]
    };
}

test('RX separa conta, cartao, fatura e investimento sem expor payload bruto', () => {
    const input = fixture();
    const report = buildOpenFinanceHistoricalRx({
        items: input.items,
        cutoffDate: '2026-03-01',
        observedAt: input.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtCutoff: true },
            thais_itau: { existedAtCutoff: false }
        }
    });

    assert.equal(report.financial_writes, 0);
    assert.equal(report.segments.length, 3);
    const bank = report.segments.find(row => row.product === 'bank_account');
    const card = report.segments.find(row => row.source_alias === 'daniel_nubank' && row.product === 'credit_card');
    const itau = report.segments.find(row => row.source_alias === 'thais_itau');
    assert.equal(bank.cutoff_reconstruction.balance_cents, 7000);
    assert.equal(bank.cutoff_reconstruction.confidence, 'conditional_on_complete_posted_history');
    assert.equal(bank.flows.pending_count, 1);
    assert.equal(bank.flows.credits_cents, 5000);
    assert.equal(bank.flows.debits_cents, 2500);
    assert.equal(card.cutoff_reconstruction.balance_cents, null);
    assert.equal(card.cutoff_reconstruction.reason, 'credit_balance_is_not_invoice');
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
    assert.equal(itau.cutoff_relation, 'not_applicable_before_source_start');
    assert.equal(itau.cutoff_reconstruction.balance_cents, null);
    assert.equal(report.investments.length, 1);
    assert.equal(report.investments[0].current_balance_cents, 9000);

    const serialized = JSON.stringify(report);
    for (const privateValue of ['bank-1', 'card-1', 'card-itau', 'Entrada privada', 'Compra parcelada privada', 'Investimento privado']) {
        assert.doesNotMatch(serialized, new RegExp(privateValue, 'i'));
    }
});

test('RX falha fechado em fonte essencial incompleta e nunca transforma ausencia em zero', () => {
    const input = fixture();
    input.items[0].availability.transactions = 'partial';
    const report = buildOpenFinanceHistoricalRx({
        items: input.items,
        cutoffDate: '2026-03-01',
        observedAt: input.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtCutoff: true },
            thais_itau: { existedAtCutoff: false }
        }
    });
    assert.equal(report.ready_for_reconciliation, false);
    assert.deepEqual(report.blockers, ['daniel_nubank:transactions_partial']);
    assert.equal(report.financial_writes, 0);
    const incompleteBank = report.segments.find(row => row.product === 'bank_account');
    assert.equal(incompleteBank.flows.count, null);
    assert.equal(incompleteBank.flows.credits_cents, null);
    assert.equal(incompleteBank.flows.debits_cents, null);
    assert.equal(incompleteBank.cutoff_reconstruction.balance_cents, null);
    assert.equal(incompleteBank.cutoff_reconstruction.reason, 'complete_bank_history_unavailable');

    const unknownLifecycle = fixture();
    const unknownReport = buildOpenFinanceHistoricalRx({
        items: unknownLifecycle.items,
        cutoffDate: '2026-03-01',
        observedAt: unknownLifecycle.observedAt,
        secret: SECRET
    });
    assert.equal(unknownReport.ready_for_reconciliation, false);
    assert.deepEqual(unknownReport.blockers, [
        'daniel_nubank:source_start_unknown',
        'thais_itau:source_start_unknown'
    ]);

    const unavailableAccounts = fixture();
    unavailableAccounts.items[0].availability.accounts = 'unavailable';
    const unavailableAccountsReport = buildOpenFinanceHistoricalRx({
        items: unavailableAccounts.items,
        cutoffDate: '2026-03-01',
        observedAt: unavailableAccounts.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtCutoff: true },
            thais_itau: { existedAtCutoff: false }
        }
    });
    const unavailableBank = unavailableAccountsReport.segments.find(row => row.product === 'bank_account');
    const unavailableCard = unavailableAccountsReport.segments.find(row =>
        row.source_alias === 'daniel_nubank' && row.product === 'credit_card');
    assert.equal(unavailableBank.current_snapshot.balance_cents, null);
    assert.equal(unavailableBank.flows.count, null);
    assert.equal(unavailableCard.current_snapshot.provider_balance_cents, null);
    assert.equal(unavailableCard.current_snapshot.credit_limit_cents, null);
    assert.equal(unavailableCard.bills.total_cents, null);
});

test('RX exige cobertura de fatura para cartao e recusa ligacao a conta desconhecida', () => {
    const missingBills = fixture();
    missingBills.items[0].availability.bills = 'unavailable';
    const report = buildOpenFinanceHistoricalRx({
        items: missingBills.items,
        cutoffDate: '2026-03-01',
        observedAt: missingBills.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtCutoff: true },
            thais_itau: { existedAtCutoff: false }
        }
    });
    assert.equal(report.ready_for_reconciliation, false);
    assert.deepEqual(report.blockers, ['daniel_nubank:bills_unavailable']);
    const unavailableBills = report.segments.find(row =>
        row.source_alias === 'daniel_nubank' && row.product === 'credit_card').bills;
    assert.equal(unavailableBills.count, null);
    assert.equal(unavailableBills.total_cents, null);

    const unknownAccount = fixture();
    unknownAccount.items[0].transactions[0].account_id = 'conta-inexistente';
    assert.throws(() => buildOpenFinanceHistoricalRx({
        items: unknownAccount.items,
        cutoffDate: '2026-03-01',
        observedAt: unknownAccount.observedAt,
        secret: SECRET
    }), /historical_rx_transaction_account_unknown/);

    assert.throws(() => buildOpenFinanceHistoricalRx({
        items: fixture().items,
        cutoffDate: '2026-02-30',
        observedAt: fixture().observedAt,
        secret: SECRET
    }), /invalid_historical_rx_cutoff/);

    const missingBalance = fixture();
    missingBalance.items[0].accounts[0].balance_cents = null;
    const missingBalanceReport = buildOpenFinanceHistoricalRx({
        items: missingBalance.items,
        cutoffDate: '2026-03-01',
        observedAt: missingBalance.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtCutoff: true },
            thais_itau: { existedAtCutoff: false }
        }
    });
    assert.equal(missingBalanceReport.segments.find(row => row.product === 'bank_account')
        .cutoff_reconstruction.balance_cents, null);
    assert.equal(missingBalanceReport.segments.find(row => row.product === 'bank_account')
        .cutoff_reconstruction.reason, 'complete_bank_history_unavailable');

    assert.throws(() => buildOpenFinanceHistoricalRx({
        items: fixture().items,
        cutoffDate: '2026-03-01',
        observedAt: fixture().observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtCutoff: true, availableFrom: '2026-04-01' },
            thais_itau: { existedAtCutoff: false }
        }
    }), /conflicting_historical_rx_source_lifecycle/);

    const invalidInstallment = fixture();
    invalidInstallment.items[0].transactions[4].installment_number = 4;
    assert.throws(() => buildOpenFinanceHistoricalRx({
        items: invalidInstallment.items,
        cutoffDate: '2026-03-01',
        observedAt: invalidInstallment.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtCutoff: true },
            thais_itau: { existedAtCutoff: false }
        }
    }), /invalid_historical_rx_installment_number/);

    const bankBill = fixture();
    bankBill.items[0].bills[0].account_id = 'bank-1';
    assert.throws(() => buildOpenFinanceHistoricalRx({
        items: bankBill.items,
        cutoffDate: '2026-03-01',
        observedAt: bankBill.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtCutoff: true },
            thais_itau: { existedAtCutoff: false }
        }
    }), /historical_rx_bill_requires_credit_account/);

    const bankInstallment = fixture();
    bankInstallment.items[0].transactions[0].installment_number = 1;
    bankInstallment.items[0].transactions[0].total_installments = 3;
    assert.throws(() => buildOpenFinanceHistoricalRx({
        items: bankInstallment.items,
        cutoffDate: '2026-03-01',
        observedAt: bankInstallment.observedAt,
        secret: SECRET,
        sourceLifecycles: {
            daniel_nubank: { existedAtCutoff: true },
            thais_itau: { existedAtCutoff: false }
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

test('CLI le vault real em readonly, grava fora do Git e nao imprime payload privado', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-finance-rx-'));
    const databasePath = path.join(root, 'live-staging.sqlite');
    const secretPath = path.join(root, 'staging-secret.txt');
    const mappingPath = path.join(root, 'pluggy-item-map.json');
    const lifecyclePath = path.join(root, 'source-lifecycle.json');
    const outputPath = path.join(root, 'historical-rx.json');
    const input = fixture();
    fs.writeFileSync(secretPath, SECRET, 'utf8');
    fs.writeFileSync(mappingPath, JSON.stringify(input.items.map(item => ({ alias: item.alias_code }))), 'utf8');
    fs.writeFileSync(lifecyclePath, JSON.stringify({
        daniel_nubank: { existedAtCutoff: true },
        thais_itau: { existedAtCutoff: false }
    }), 'utf8');
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
        script, '--confirm-read-only', '--cutoff', '2026-03-01',
        '--staging-db', databasePath, '--secret-file', secretPath,
        '--mapping-file', mappingPath, '--source-lifecycle-file', lifecyclePath,
        '--output', outputPath
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const publicResult = JSON.parse(result.stdout);
    assert.equal(publicResult.database_unchanged, true);
    assert.equal(publicResult.sqlite_files_unchanged, true);
    assert.equal(publicResult.financial_writes, 0);
    assert.equal(publicResult.segments, 3);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(databasePath)).digest('hex'), beforeHash);
    assert.equal(sqliteFileSetsEqual(beforeSqliteFiles, snapshotSqliteFileSet(databasePath)), true);
    const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(report.financial_writes, 0);
    assert.equal(report.segments.find(row => row.source_alias === 'thais_itau').cutoff_relation,
        'not_applicable_before_source_start');
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
        const outputPath = path.join(root, 'historical-rx.json');
        const input = fixture();
        input.items[0].availability.transactions = 'partial';
        fs.writeFileSync(secretPath, SECRET, 'utf8');
        fs.writeFileSync(mappingPath, JSON.stringify(input.items.map(item => ({ alias: item.alias_code }))), 'utf8');
        fs.writeFileSync(lifecyclePath, JSON.stringify({
            daniel_nubank: { existedAtCutoff: true },
            thais_itau: { existedAtCutoff: false }
        }), 'utf8');
        const vault = new OpenFinanceLiveStagingVault({ databasePath, secret: SECRET });
        vault.ingestSnapshot({
            provider: 'pluggy', mode: 'live_readonly_staging', event_id: 'rx-blocked-event',
            observed_at: input.observedAt, items: input.items
        });
        vault.close();
        const script = path.resolve(__dirname, '..', 'scripts', 'runOpenFinanceHistoricalRx.js');
        const result = spawnSync(process.execPath, [
            script, '--confirm-read-only', '--cutoff', '2026-03-01',
            '--staging-db', databasePath, '--secret-file', secretPath,
            '--mapping-file', mappingPath, '--source-lifecycle-file', lifecyclePath,
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
