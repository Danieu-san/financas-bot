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
    assert.deepStrictEqual(migrations.map(migration => migration.version), [1, 2]);
    assert.strictEqual(DEFAULT_MIGRATIONS_DIR.endsWith(path.join('src', 'ledger', 'migrations')), true);

    const tables = store.listTables();
    assert.ok(tables.includes('canonical_ledger_events'));
    assert.ok(tables.includes('canonical_ledger_event_lines'));
    assert.ok(tables.includes('canonical_ledger_schedules'));
    assert.ok(tables.includes('canonical_ledger_reconciliation_links'));
    assert.ok(tables.includes('canonical_ledger_public_projection'));
    assert.ok(tables.includes('canonical_ledger_accounts'));
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
        publicProjectionRows: 0,
        projectionRuns: 0,
        auditRows: 0
    });

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
        schedules: 2,
        reconciliationLinks: 5,
        publicProjectionRows: 15,
        projectionRuns: 1,
        auditRows: 1
    });

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
        schedules: 2,
        reconciliationLinks: 5,
        publicProjectionRows: 15,
        projectionRuns: 1,
        auditRows: 1
    });

    restored.close();
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
    store.close();
});
