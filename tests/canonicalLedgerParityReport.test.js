const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const fixture = require('./fixtures/ledger/canonical-ledger-phase1.json');

const {
    buildCanonicalLedgerParityReport
} = require('../src/ledger/canonicalLedgerParityReport');
const {
    runCanonicalLedgerDryRun
} = require('../scripts/runCanonicalLedgerDryRun');
const {
    runCanonicalLedgerAccountsCanaryGate
} = require('../scripts/runCanonicalLedgerAccountsCanaryGate');
const {
    runCanonicalLedgerAccountsSourceGate
} = require('../scripts/runCanonicalLedgerAccountsSourceGate');
const {
    runCanonicalLedgerAccountMovementsGate
} = require('../scripts/runCanonicalLedgerAccountMovementsGate');

test('canonical ledger parity report summarizes fixture projection without unexplained differences', () => {
    const report = buildCanonicalLedgerParityReport(fixture, {
        runId: 'LEDGER_DRY_RUN_TEST',
        startedAt: '2026-06-24T00:00:00.000Z',
        finishedAt: '2026-06-24T00:00:01.000Z'
    });

    assert.strictEqual(report.run_id, 'LEDGER_DRY_RUN_TEST');
    assert.strictEqual(report.schema_version, 'canonical-ledger-v1');
    assert.strictEqual(report.synthetic_fixture_only, true);
    assert.deepStrictEqual(report.source_counts, {
        contas: 1,
        saidas: 3,
        entradas: 2,
        transferencias: 3,
        lancamentosCartao: 1,
        dividas: 1,
        pagamentosDividas: 1,
        metas: 1,
        movimentacoesMetas: 1,
        importedTransactions: 1,
        total_rows: 15
    });
    assert.strictEqual(report.canonical_counts.events, 15);
    assert.strictEqual(report.canonical_counts.schedules, 2);
    assert.strictEqual(report.canonical_counts.reconciliation_links, 5);
    assert.strictEqual(report.canonical_counts.warnings, 1);
    assert.strictEqual(report.totals_by_kind.bill_payment.amount_cents, 12000);
    assert.strictEqual(report.totals_by_kind.invoice_payment.amount_cents, 50000);
    assert.strictEqual(report.totals_by_kind.debt_payment.net_income_expense_impact_cents, 2000);
    assert.strictEqual(report.totals_by_kind.reimbursement.net_income_expense_impact_cents, -5000);
    assert.strictEqual(report.totals_by_kind.adjustment.net_income_expense_impact_cents, 0);
    assert.strictEqual(report.totals_by_kind.transfer.net_income_expense_impact_cents, 0);
    assert.strictEqual(report.totals_by_kind.goal_contribution.net_income_expense_impact_cents, 0);
    assert.strictEqual(report.totals_by_status.uncertain.count, 1);
    assert.strictEqual(report.totals_by_competence['2026-06'].count, 15);
    assert.deepStrictEqual(report.unexplained_differences, []);
    assert.deepStrictEqual(report.warning_summary, {
        category_unresolved: 1
    });
});

test('canonical ledger parity report privacy scan excludes internal identifiers from public rows', () => {
    const report = buildCanonicalLedgerParityReport(fixture, {
        runId: 'LEDGER_PRIVACY_TEST',
        startedAt: '2026-06-24T00:00:00.000Z',
        finishedAt: '2026-06-24T00:00:01.000Z'
    });
    const serialized = JSON.stringify(report);

    assert.strictEqual(report.privacy_scan.ok, true);
    assert.deepStrictEqual(report.privacy_scan.leaks, []);
    assert.doesNotMatch(serialized, /person-daniel|person-thais|user_id|sheet_id|spreadsheet|token|oauth|prompt|rawRows|source_row_hash|idempotency_key/i);
});

test('canonical ledger dry-run runner writes report artifact for local review', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-ledger-dry-run-'));
    const reportDir = path.join(tempDir, 'run');

    const { report, reportPath, publicProjectionPath } = runCanonicalLedgerDryRun({
        fixturePath: path.resolve(__dirname, 'fixtures', 'ledger', 'canonical-ledger-phase1.json'),
        reportDir,
        runId: 'LEDGER_DRY_RUN_TEST'
    });

    assert.strictEqual(report.run_id, 'LEDGER_DRY_RUN_TEST');
    assert.strictEqual(report.report_type, 'canonical_ledger_dry_run');
    assert.strictEqual(fs.existsSync(reportPath), true);
    assert.strictEqual(fs.existsSync(publicProjectionPath), true);

    const persisted = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const publicProjection = JSON.parse(fs.readFileSync(publicProjectionPath, 'utf8'));
    assert.strictEqual(persisted.run_id, report.run_id);
    assert.ok(publicProjection.some(row => row.kind === 'bill_payment'));
    assert.ok(publicProjection.some(row => row.kind === 'debt_payment'));
    assert.ok(publicProjection.some(row => row.kind === 'reimbursement'));
    assert.doesNotMatch(JSON.stringify(publicProjection), /person-daniel|user_id|source_row_hash|idempotency_key/i);
});
test('canonical ledger accounts canary gate seeds, validates and cleans marker accounts', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-ledger-accounts-gate-'));
    const dbPath = path.join(tempDir, 'canonical-ledger-shadow.sqlite');
    const reportDir = path.join(tempDir, 'report');

    const result = runCanonicalLedgerAccountsCanaryGate({
        dbPath,
        reportDir,
        marker: 'TESTE_APAGAR_ACCOUNTS_GATE_UNIT',
        confirmMarkerOnly: true
    });

    assert.strictEqual(result.decision, 'GO');
    assert.strictEqual(result.read.source, 'canonical');
    assert.deepStrictEqual(
        result.read.rows.map(row => [row.name, row.opening_balance_cents, row.balance_cents]),
        [
            ['Carteira TESTE_APAGAR_ACCOUNTS_GATE_UNIT', 1000, 13345],
            ['Conta principal TESTE_APAGAR_ACCOUNTS_GATE_UNIT', 100000, 85655]
        ]
    );
    assert.strictEqual(result.privacy.ok, true);
    assert.deepStrictEqual(result.cleanup.remainingMarkerRows, {
        accounts: 0,
        events: 0,
        lines: 0,
        projectionRuns: 0
    });
    assert.strictEqual(result.postCleanup.reason, 'canonical_accounts_opening_balances_unavailable');
    assert.strictEqual(fs.existsSync(result.reportPath), true);
    assert.doesNotMatch(JSON.stringify(result), /user-a|acct-|source_row_hash|idempotency_key/i);
});

test('canonical ledger accounts source gate persists real opening balances when explicitly requested', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-ledger-accounts-source-'));
    const dbPath = path.join(tempDir, 'canonical-ledger-shadow.sqlite');
    const reportDir = path.join(tempDir, 'report');
    const financialAccountRows = [
        ['Nome da Conta', 'Tipo', 'Saldo Inicial', 'Data de Abertura', 'Status', 'Moeda', 'Responsavel', 'user_id', 'Observacoes'],
        ['Daniel - Nubank', 'bank', '262,85', '03/07/2026', 'active', 'BRL', 'Daniel', 'user-daniel', 'Saldo real'],
        ['Daniel - Nubank Caixinha', 'reserve', '1264,91', '03/07/2026', 'active', 'BRL', 'Daniel', 'user-daniel', 'Saldo real'],
        ['Thais - Nubank', 'bank', '0,00', '03/07/2026', 'active', 'BRL', 'Thais', 'user-thais', 'Saldo real'],
        ['Thais - Itau', 'bank', '133,46', '03/07/2026', 'active', 'BRL', 'Thais', 'user-thais', 'Saldo real']
    ];

    const result = runCanonicalLedgerAccountsSourceGate({
        dbPath,
        reportDir,
        financialAccountRows,
        conversationFinancialAccountRows: financialAccountRows,
        runId: 'ACCOUNTS_SOURCE_UNIT_REAL',
        confirmRealSource: true,
        persistSource: true,
        personByUserId: {
            'user-daniel': 'Daniel',
            'user-thais': 'Thais'
        }
    });

    assert.strictEqual(result.decision, 'GO');
    assert.strictEqual(result.cleanup.executed, false);
    assert.strictEqual(result.cleanup.persistentRun, true);
    assert.deepStrictEqual(
        result.read.rows.map(row => [row.name, row.account_type, row.opening_balance_cents, row.balance_cents]).sort((left, right) => left[0].localeCompare(right[0])),
        [
            ['Daniel - Nubank', 'bank', 26285, 26285],
            ['Daniel - Nubank Caixinha', 'reserve', 126491, 126491],
            ['Thais - Itau', 'bank', 13346, 13346],
            ['Thais - Nubank', 'bank', 0, 0]
        ]
    );
    assert.strictEqual(result.privacy.ok, true);
    assert.strictEqual(fs.existsSync(result.reportPath), true);
    assert.doesNotMatch(JSON.stringify(result), /user-daniel|user-thais|acct_|source_row_hash|idempotency_key/i);
});
test('canonical ledger accounts source gate rejects accounts absent from the conversational spreadsheet', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-ledger-accounts-conversation-source-'));
    const financialAccountRows = [
        ['Nome da Conta', 'Tipo', 'Saldo Inicial', 'Data de Abertura', 'Status', 'Moeda', 'Responsavel', 'user_id', 'Observacoes'],
        ['Daniel - Nubank', 'bank', '262,85', '03/07/2026', 'active', 'BRL', 'Daniel', 'user-daniel', 'Saldo real']
    ];

    const result = runCanonicalLedgerAccountsSourceGate({
        dbPath: path.join(tempDir, 'canonical-ledger-shadow.sqlite'),
        reportDir: path.join(tempDir, 'report'),
        financialAccountRows,
        conversationFinancialAccountRows: [financialAccountRows[0]],
        runId: 'ACCOUNTS_SOURCE_UNIT_CONVERSATION_EMPTY',
        confirmRealSource: true
    });

    assert.strictEqual(result.decision, 'NO-GO');
    assert.deepStrictEqual(result.validation.problems, ['conversation_source_empty']);
});
test('canonical ledger account movements gate proves dated settled and pending receipt parity', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-ledger-account-movements-'));
    const dbPath = path.join(tempDir, 'canonical-ledger-shadow.sqlite');
    const reportDir = path.join(tempDir, 'report');

    const result = runCanonicalLedgerAccountMovementsGate({
        dbPath,
        reportDir,
        marker: 'TESTE_APAGAR_ACCOUNT_MOVEMENTS_UNIT',
        confirmMarkerOnly: true
    });

    assert.strictEqual(result.decision, 'GO');
    assert.deepStrictEqual(result.parity.accountBalances, [
        {
            name: 'Conta destino TESTE_APAGAR_ACCOUNT_MOVEMENTS_UNIT',
            opening_balance_cents: 5000,
            expected_balance_cents: 18000,
            canonical_balance_cents: 18000
        },
        {
            name: 'Conta origem TESTE_APAGAR_ACCOUNT_MOVEMENTS_UNIT',
            opening_balance_cents: 100000,
            expected_balance_cents: 88000,
            canonical_balance_cents: 88000
        }
    ]);
    assert.deepStrictEqual(result.parity.events, [
        { kind: 'expense', date: '2026-07-04', effective_on: '2026-07-04', status: 'settled' },
        { kind: 'income', date: '2026-07-05', effective_on: '2026-07-05', status: 'settled' },
        { kind: 'transfer', date: '2026-07-06', effective_on: '2026-07-06', status: 'settled' },
        { kind: 'transfer', date: '2026-07-07', effective_on: '2026-07-07', status: 'pending' }
    ]);
    assert.strictEqual(result.parity.transferNetImpactCents, 0);
    assert.strictEqual(result.idempotency.ok, true);
    assert.strictEqual(result.privacy.ok, true);
    assert.deepStrictEqual(result.cleanup.remainingMarkerRows, {
        accounts: 0,
        events: 0,
        lines: 0,
        projectionRuns: 0
    });
    assert.strictEqual(fs.existsSync(result.reportPath), true);
    assert.doesNotMatch(
        JSON.stringify(result),
        /user-account-movements|acct_|source_row_hash|idempotency_key|operationKey/i
    );
});
test('canonical ledger account movements gate fails closed and cleans marker rows when canary read fails', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-ledger-account-movements-failure-'));
    const dbPath = path.join(tempDir, 'canonical-ledger-shadow.sqlite');

    const result = runCanonicalLedgerAccountMovementsGate({
        dbPath,
        reportDir: path.join(tempDir, 'report'),
        marker: 'TESTE_APAGAR_ACCOUNT_MOVEMENTS_FAILURE',
        confirmMarkerOnly: true,
        readDomain: () => {
            throw new Error('forced canary read failure');
        }
    });

    assert.strictEqual(result.decision, 'NO-GO');
    assert.deepStrictEqual(result.validation.problems, ['canonical_read_failed']);
    assert.deepStrictEqual(result.cleanup.remainingMarkerRows, {
        accounts: 0,
        events: 0,
        lines: 0,
        projectionRuns: 0
    });
    assert.doesNotMatch(JSON.stringify(result), /forced canary read failure/i);
});
