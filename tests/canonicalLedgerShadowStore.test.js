const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const fixture = require('./fixtures/ledger/canonical-ledger-phase1.json');

const {
    projectLegacyRowsToCanonicalLedger,
    buildCanonicalPublicProjection
} = require('../src/ledger/canonicalLedgerProjector');
const {
    buildCanonicalLedgerParityReport
} = require('../src/ledger/canonicalLedgerParityReport');
const {
    CanonicalLedgerShadowStore,
    DEFAULT_MIGRATIONS_DIR
} = require('../src/ledger/canonicalLedgerShadowStore');
const {
    runCanonicalLedgerDryRun
} = require('../scripts/runCanonicalLedgerDryRun');

function tempDbPath() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-ledger-shadow-'));
    return {
        dir,
        dbPath: path.join(dir, 'canonical-ledger-shadow.sqlite')
    };
}

function buildProjection(runId) {
    const projected = projectLegacyRowsToCanonicalLedger(fixture);
    const publicProjection = buildCanonicalPublicProjection(projected, fixture);
    const report = buildCanonicalLedgerParityReport(fixture, {
        runId,
        startedAt: '2026-06-24T00:00:00.000Z',
        finishedAt: '2026-06-24T00:00:01.000Z'
    });
    return {
        projected,
        publicProjection,
        report
    };
}

test('canonical ledger shadow store applies versioned schema and keeps writes disabled by default', () => {
    const { dbPath } = tempDbPath();
    const store = new CanonicalLedgerShadowStore({ dbPath });

    const migrations = store.applyMigrations();
    assert.deepStrictEqual(migrations.map(migration => migration.version), [1, 2, 3, 4, 5, 6]);
    assert.strictEqual(DEFAULT_MIGRATIONS_DIR.endsWith(path.join('src', 'ledger', 'migrations')), true);

    const tables = store.listTables();
    assert.ok(tables.includes('canonical_ledger_events'));
    assert.ok(tables.includes('canonical_ledger_event_lines'));
    assert.ok(tables.includes('canonical_ledger_schedules'));
    assert.ok(tables.includes('canonical_ledger_reconciliation_links'));
    assert.ok(tables.includes('canonical_ledger_statement_reconciliation_links'));
    assert.ok(tables.includes('canonical_ledger_public_projection'));
    assert.ok(tables.includes('canonical_ledger_accounts'));
    assert.ok(tables.includes('canonical_ledger_invoices'));
    assert.ok(tables.includes('canonical_ledger_invoice_items'));
    assert.ok(tables.includes('canonical_ledger_invoice_payments'));
    assert.ok(tables.includes('canonical_ledger_recurrence_rules'));
    assert.ok(tables.includes('canonical_ledger_recurrence_occurrences'));
    const invoiceColumns = store.db.prepare('PRAGMA table_info(canonical_ledger_invoices)').all().map(column => column.name);
    assert.ok(!invoiceColumns.includes('observed_item_total_cents'));
    assert.ok(!invoiceColumns.includes('observed_payment_total_cents'));
    assert.ok(!invoiceColumns.includes('status'));
    assert.ok(tables.includes('canonical_ledger_projection_runs'));
    assert.ok(tables.includes('canonical_ledger_audit_log'));

    const projection = buildProjection('LEDGER_SHADOW_DISABLED_TEST');
    assert.throws(() => {
        store.persistProjection({
            runId: 'LEDGER_SHADOW_DISABLED_TEST',
            ...projection
        });
    }, /disabled/i);

    assert.deepStrictEqual(store.countRows('LEDGER_SHADOW_DISABLED_TEST'), {
        events: 0,
        lines: 0,
        schedules: 0,
        reconciliationLinks: 0,
        recurrenceRules: 0,
        recurrenceOccurrences: 0,
        publicProjectionRows: 0,
        projectionRuns: 0,
        auditRows: 0
    });

    store.close();
});

test('canonical ledger shadow stores statement reconciliation links idempotently', () => {
    const { dbPath } = tempDbPath();
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    const links = [{
        linkId: 'stmtrec-test',
        operationKeyHash: 'operation-hash',
        actorHash: 'actor-hash',
        sourceFileHash: 'file-hash',
        transactionHash: 'transaction-hash',
        matchedSourceHash: 'matched-hash',
        decisionStatus: 'matched',
        decisionRule: 'exact_existing',
        confirmedAt: '2026-07-12T10:00:00.000Z'
    }];

    assert.strictEqual(store.persistStatementReconciliationLinks(links), 1);
    assert.strictEqual(store.persistStatementReconciliationLinks(links), 1);
    const stored = store.listStatementReconciliationLinks();
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].decision_status, 'matched');
    assert.strictEqual(stored[0].matched_source_hash, 'matched-hash');
    assert.deepStrictEqual(JSON.parse(stored[0].link_json), links[0]);
    store.close();
});

test('canonical ledger shadow store rejects accounts without explicit opening balance', () => {
    const { dbPath } = tempDbPath();
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });

    assert.throws(() => {
        store.persistProjection({
            runId: 'LEDGER_SHADOW_ACCOUNT_WITHOUT_OPENING_TEST',
            projected: {
                accounts: [{
                    account_id: 'acct-missing-opening',
                    household_id: 'household-test',
                    owner_person_id: 'person-test',
                    account_type: 'bank',
                    name: 'Conta sem saldo inicial',
                    currency: 'BRL',
                    opened_on: '2026-01-01',
                    status: 'active'
                }],
                events: [],
                lines: [],
                schedules: [],
                reconciliationLinks: []
            },
            publicProjection: [],
            report: {
                report_type: 'canonical_ledger_receipt_shadow',
                schema_version: 'canonical-ledger-v1',
                synthetic_fixture_only: false
            }
        });
    }, /opening_balance_cents/);

    store.close();
});
test('canonical ledger shadow store persists projection only when enabled and restores from backup', () => {
    const { dir, dbPath } = tempDbPath();
    const runId = 'LEDGER_SHADOW_BACKUP_TEST';
    const projection = buildProjection(runId);
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });

    store.applyMigrations();
    const receipt = store.persistProjection({
        runId,
        ...projection
    });

    assert.strictEqual(receipt.runId, runId);
    assert.deepStrictEqual(store.countRows(runId), {
        events: 15,
        lines: projection.projected.lines.length,
        schedules: 3,
        reconciliationLinks: 6,
        recurrenceRules: 1,
        recurrenceOccurrences: 1,
        publicProjectionRows: 15,
        projectionRuns: 1,
        auditRows: 1
    });

    const invoices = store.listInvoiceAggregates();
    assert.deepStrictEqual(
        invoices.map(invoice => [
            invoice.card_key,
            invoice.competence_month,
            invoice.item_total_cents,
            invoice.payment_total_cents,
            invoice.status,
            invoice.item_count,
            invoice.payment_count
        ]),
        [['nubank daniel', '2026-06', 50000, 50000, 'paid', 1, 1]]
    );
    const publicRows = store.listPublicProjection(runId);
    assert.strictEqual(publicRows.length, 15);
    assert.ok(publicRows.some(row => row.kind === 'bill_payment' && row.free_budget_eligible === 0));
    assert.doesNotMatch(JSON.stringify(publicRows), /person-daniel|person-thais|user_id|source_row_hash|idempotency_key|spreadsheet|token|prompt/i);

    const backupPath = path.join(dir, 'canonical-ledger-shadow.backup.sqlite');
    store.backupTo(backupPath);
    store.close();

    const restoredPath = path.join(dir, 'canonical-ledger-shadow-restored.sqlite');
    CanonicalLedgerShadowStore.restoreFromBackup({ backupPath, dbPath: restoredPath });

    const restored = new CanonicalLedgerShadowStore({ dbPath: restoredPath });
    restored.applyMigrations();
    assert.deepStrictEqual(restored.countRows(runId), {
        events: 15,
        lines: projection.projected.lines.length,
        schedules: 3,
        reconciliationLinks: 6,
        recurrenceRules: 1,
        recurrenceOccurrences: 1,
        publicProjectionRows: 15,
        projectionRuns: 1,
        auditRows: 1
    });
    assert.deepStrictEqual(
        restored.listInvoiceAggregates().map(invoice => [
            invoice.card_key,
            invoice.competence_month,
            invoice.item_total_cents,
            invoice.payment_total_cents,
            invoice.status
        ]),
        [['nubank daniel', '2026-06', 50000, 50000, 'paid']]
    );

    restored.close();
});

test('phase 3H combined replay preserves settled recurrence history and avoids duplicate financial effects', () => {
    const { dbPath } = tempDbPath();
    const runId = 'PHASE3H_COMBINED_REPLAY';
    const initialInput = structuredClone(fixture);
    initialInput.projectionContext = {
        competenceMonth: '2026-06',
        materializeCompetenceMonths: ['2026-06', '2026-07']
    };

    const buildCombinedProjection = input => {
        const projected = projectLegacyRowsToCanonicalLedger(input);
        return {
            runId,
            projected,
            publicProjection: buildCanonicalPublicProjection(projected, input),
            report: {
                report_type: 'phase_3h_combined_gate',
                schema_version: 'canonical-ledger-v1',
                synthetic_fixture_only: true
            }
        };
    };
    const occurrence = (store, month) => {
        const row = store.db.prepare(`
            SELECT occurrence_json
            FROM canonical_ledger_recurrence_occurrences
            WHERE run_id = ? AND competence_month = ?
        `).get(runId, month);
        return row ? JSON.parse(row.occurrence_json) : null;
    };

    const initialProjection = buildCombinedProjection(initialInput);
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    store.persistProjection(initialProjection);
    const initialCounts = store.countRows(runId);
    const settledBefore = occurrence(store, '2026-06');
    assert.deepStrictEqual({
        status: settledBefore.status,
        dueOn: settledBefore.due_on,
        amountCents: settledBefore.amount_cents
    }, {
        status: 'settled',
        dueOn: '2026-06-10',
        amountCents: 12000
    });
    store.close();

    const replayStore = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    replayStore.persistProjection(initialProjection);
    assert.deepStrictEqual(replayStore.countRows(runId), initialCounts);
    replayStore.close();

    const editedInput = structuredClone(initialInput);
    editedInput.legacyRows.contas[0].dia_vencimento = '20';
    editedInput.legacyRows.contas[0].valor_esperado = '180,00';
    const editedProjection = buildCombinedProjection(editedInput);
    const editedStore = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    editedStore.persistProjection(editedProjection);

    const settledAfter = occurrence(editedStore, '2026-06');
    const futureAfter = occurrence(editedStore, '2026-07');
    assert.deepStrictEqual({
        status: settledAfter.status,
        dueOn: settledAfter.due_on,
        amountCents: settledAfter.amount_cents
    }, {
        status: 'settled',
        dueOn: '2026-06-10',
        amountCents: 12000
    });
    assert.deepStrictEqual({
        status: futureAfter.status,
        dueOn: futureAfter.due_on,
        amountCents: futureAfter.amount_cents
    }, {
        status: 'pending',
        dueOn: '2026-07-20',
        amountCents: 18000
    });

    const invoices = editedStore.listInvoiceAggregates({ reportType: 'phase_3h_combined_gate' });
    assert.strictEqual(invoices.length, 1);
    assert.strictEqual(invoices[0].payment_count, 1);
    assert.strictEqual(invoices[0].status, 'paid');
    const importLinks = editedStore.db.prepare(`
        SELECT COUNT(1) AS count
        FROM canonical_ledger_reconciliation_links
        WHERE run_id = ? AND link_type = 'import_match'
    `).get(runId).count;
    assert.strictEqual(importLinks, 1);
    assert.deepStrictEqual(editedStore.countRows(runId), initialCounts);
    editedStore.close();
});

test('canonical ledger dry-run writes SQLite shadow only with explicit opt-in', () => {
    const { dir, dbPath } = tempDbPath();
    const reportDir = path.join(dir, 'dry-run-report');
    const runId = 'LEDGER_SHADOW_DRY_RUN_TEST';

    const dryRun = runCanonicalLedgerDryRun({
        fixturePath: path.resolve(__dirname, 'fixtures', 'ledger', 'canonical-ledger-phase1.json'),
        reportDir,
        runId,
        shadowDbPath: dbPath
    });

    assert.strictEqual(dryRun.shadowDbPath, null);
    assert.strictEqual(fs.existsSync(dbPath), false);

    const shadowRun = runCanonicalLedgerDryRun({
        fixturePath: path.resolve(__dirname, 'fixtures', 'ledger', 'canonical-ledger-phase1.json'),
        reportDir,
        runId,
        shadowDbPath: dbPath,
        writeShadow: true
    });

    assert.strictEqual(shadowRun.shadowDbPath, dbPath);
    assert.strictEqual(fs.existsSync(dbPath), true);

    const store = new CanonicalLedgerShadowStore({ dbPath });
    store.applyMigrations();
    assert.strictEqual(store.countRows(runId).events, 15);
    assert.strictEqual(store.countRows(runId).recurrenceRules, 1);
    assert.strictEqual(store.countRows(runId).recurrenceOccurrences, 1);
    store.close();
});
