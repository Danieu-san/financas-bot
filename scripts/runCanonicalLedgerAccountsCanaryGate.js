const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const {
    CanonicalLedgerShadowStore,
    DEFAULT_DB_PATH
} = require('../src/ledger/canonicalLedgerShadowStore');
const {
    readCanonicalLedgerCanaryDomain
} = require('../src/ledger/canonicalLedgerReceiptProjector');

function buildMarker(date = new Date()) {
    return `TESTE_APAGAR_ACCOUNTS_CANARY_${date.toISOString().replace(/\D/g, '').slice(0, 12)}`;
}

function sanitizeRunId(value) {
    return String(value || '')
        .replace(/[^A-Za-z0-9_:-]/g, '_')
        .slice(0, 96);
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function countMarkerRows(dbPath, runId) {
    const db = new Database(dbPath, { readonly: true });
    try {
        const count = table => db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE run_id = ?`).get(runId).count;
        return {
            accounts: count('canonical_ledger_accounts'),
            events: count('canonical_ledger_events'),
            lines: count('canonical_ledger_event_lines'),
            projectionRuns: count('canonical_ledger_projection_runs')
        };
    } finally {
        db.close();
    }
}

function buildAccountsProjection({ marker, runId }) {
    const now = '2026-07-02T12:00:00.000Z';
    const householdId = 'household_accounts_gate';
    const ownerPersonId = 'person_accounts_gate';
    const principalAccountId = `account_main_${sanitizeRunId(marker)}`;
    const walletAccountId = `account_wallet_${sanitizeRunId(marker)}`;
    const transferEventId = `event_transfer_${sanitizeRunId(marker)}`;
    const expenseEventId = `event_expense_${sanitizeRunId(marker)}`;

    return {
        runId,
        projected: {
            accounts: [
                {
                    account_id: principalAccountId,
                    household_id: householdId,
                    owner_person_id: ownerPersonId,
                    account_type: 'bank',
                    name: `Conta principal ${marker}`,
                    currency: 'BRL',
                    opening_balance_cents: 100000,
                    opened_on: '2026-07-01',
                    status: 'active'
                },
                {
                    account_id: walletAccountId,
                    household_id: householdId,
                    owner_person_id: ownerPersonId,
                    account_type: 'wallet',
                    name: `Carteira ${marker}`,
                    currency: 'BRL',
                    opening_balance_cents: 1000,
                    opened_on: '2026-07-01',
                    status: 'active'
                }
            ],
            events: [
                {
                    event_id: transferEventId,
                    household_id: householdId,
                    owner_person_id: ownerPersonId,
                    actor_person_id: ownerPersonId,
                    kind: 'transfer',
                    status: 'settled',
                    description: `Transferencia marker-only ${marker}`,
                    amount_cents: 12345,
                    currency: 'BRL',
                    occurred_on: '2026-07-02',
                    effective_on: '2026-07-02',
                    source_type: 'gate.accounts',
                    source_id_hash: `source_${sanitizeRunId(marker)}`,
                    source_row_hash: `row_${sanitizeRunId(marker)}`,
                    idempotency_key: `op_${sanitizeRunId(marker)}`,
                    free_budget_eligible: false,
                    net_income_expense_impact: 0,
                    created_at: now,
                    updated_at: now
                },
                {
                    event_id: expenseEventId,
                    household_id: householdId,
                    owner_person_id: ownerPersonId,
                    actor_person_id: ownerPersonId,
                    kind: 'expense',
                    status: 'settled',
                    description: `Despesa marker-only ${marker}`,
                    amount_cents: 2000,
                    currency: 'BRL',
                    occurred_on: '2026-07-02',
                    effective_on: '2026-07-02',
                    category: 'Teste',
                    subcategory: 'Accounts gate',
                    category_status: 'known',
                    source_type: 'gate.accounts',
                    source_id_hash: `source_expense_${sanitizeRunId(marker)}`,
                    source_row_hash: `row_expense_${sanitizeRunId(marker)}`,
                    idempotency_key: `op_expense_${sanitizeRunId(marker)}`,
                    free_budget_eligible: true,
                    net_income_expense_impact: 2000,
                    created_at: now,
                    updated_at: now
                }
            ],
            lines: [
                {
                    line_id: `line_main_out_${sanitizeRunId(marker)}`,
                    event_id: transferEventId,
                    line_type: 'cash',
                    account_id: principalAccountId,
                    direction: 'outflow',
                    amount_cents: 12345,
                    currency: 'BRL',
                    metadata_hash: `meta_main_out_${sanitizeRunId(marker)}`
                },
                {
                    line_id: `line_wallet_in_${sanitizeRunId(marker)}`,
                    event_id: transferEventId,
                    line_type: 'clearing',
                    account_id: walletAccountId,
                    direction: 'inflow',
                    amount_cents: 12345,
                    currency: 'BRL',
                    metadata_hash: `meta_wallet_in_${sanitizeRunId(marker)}`
                },
                {
                    line_id: `line_main_expense_${sanitizeRunId(marker)}`,
                    event_id: expenseEventId,
                    line_type: 'cash',
                    account_id: principalAccountId,
                    direction: 'outflow',
                    amount_cents: 2000,
                    currency: 'BRL',
                    metadata_hash: `meta_main_expense_${sanitizeRunId(marker)}`
                }
            ],
            schedules: [],
            reconciliationLinks: []
        },
        publicProjection: [],
        report: {
            run_id: runId,
            report_type: 'canonical_ledger_receipt_shadow',
            schema_version: 'canonical-ledger-v1',
            synthetic_fixture_only: false,
            marker,
            gate: 'accounts_canary_marker_only'
        },
        ownerPersonId
    };
}

function accountsReadEnv() {
    return {
        NODE_ENV: 'test',
        CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
        CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED: 'true',
        CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
        CANONICAL_LEDGER_CANARY_READ_APPROVED: 'true',
        CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'accounts'
    };
}

function validateAccounts(rows, marker) {
    const expected = new Map([
        [`Conta principal ${marker}`, { opening: 100000, balance: 85655 }],
        [`Carteira ${marker}`, { opening: 1000, balance: 13345 }]
    ]);
    const problems = [];

    for (const [name, expectedValues] of expected.entries()) {
        const row = rows.find(candidate => candidate.name === name);
        if (!row) {
            problems.push(`missing:${name}`);
            continue;
        }
        if (row.opening_balance_cents !== expectedValues.opening) {
            problems.push(`opening:${name}`);
        }
        if (row.balance_cents !== expectedValues.balance) {
            problems.push(`balance:${name}`);
        }
    }

    return problems;
}

function privacyScan(value) {
    const serialized = JSON.stringify(value);
    const leakPattern = /person_accounts_gate|account_main_|account_wallet_|source_row_hash|idempotency_key|row_|op_|meta_/i;
    return {
        ok: !leakPattern.test(serialized),
        leaks: leakPattern.test(serialized) ? ['internal_identifier'] : []
    };
}

function runCanonicalLedgerAccountsCanaryGate({
    dbPath = DEFAULT_DB_PATH,
    reportDir,
    marker = buildMarker(),
    confirmMarkerOnly = false,
    cleanup = true
} = {}) {
    if (!confirmMarkerOnly) {
        throw new Error('Refusing to run accounts canary gate without confirmMarkerOnly=true.');
    }
    if (!String(marker || '').includes('TESTE_APAGAR')) {
        throw new Error('Accounts canary marker must include TESTE_APAGAR.');
    }

    const runId = `ACCOUNTS_CANARY_${sanitizeRunId(marker)}`;
    const outputDir = path.resolve(reportDir || path.join('data', 'qa-runs', runId));
    const reportPath = path.join(outputDir, 'canonical-ledger-accounts-canary-gate.json');
    const projection = buildAccountsProjection({ marker, runId });
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    let seeded;

    try {
        seeded = store.persistProjection(projection);
    } finally {
        store.close();
    }

    const read = readCanonicalLedgerCanaryDomain({
        env: accountsReadEnv(),
        dbPath,
        domain: 'accounts',
        ownerPersonIds: [projection.ownerPersonId],
        personByUserId: { [projection.ownerPersonId]: 'Pessoa' }
    });
    const validationProblems = read.enabled ? validateAccounts(read.rows, marker) : ['accounts_read_disabled'];
    const privacy = privacyScan(read);
    const decision = read.enabled && validationProblems.length === 0 && privacy.ok ? 'GO' : 'NO-GO';
    const cleanupResult = {
        executed: false,
        remainingMarkerRows: countMarkerRows(dbPath, runId)
    };
    let postCleanup = null;

    if (cleanup) {
        const cleanupStore = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
        try {
            cleanupStore.applyMigrations();
            cleanupStore.deleteRun(runId);
        } finally {
            cleanupStore.close();
        }
        cleanupResult.executed = true;
        cleanupResult.remainingMarkerRows = countMarkerRows(dbPath, runId);
        postCleanup = readCanonicalLedgerCanaryDomain({
            env: accountsReadEnv(),
            dbPath,
            domain: 'accounts',
            ownerPersonIds: [projection.ownerPersonId],
            personByUserId: { [projection.ownerPersonId]: 'Pessoa' }
        });
    }

    const result = {
        marker,
        runId,
        decision,
        seeded,
        read: {
            source: read.enabled ? 'canonical' : 'legacy',
            reason: read.reason || null,
            rows: read.rows || []
        },
        validation: {
            problems: validationProblems
        },
        privacy,
        cleanup: cleanupResult,
        postCleanup,
        reportPath
    };

    writeJson(reportPath, result);
    return result;
}

function argValue(name) {
    const prefix = `${name}=`;
    const inline = process.argv.find(arg => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const index = process.argv.indexOf(name);
    if (index >= 0) return process.argv[index + 1];
    return null;
}

function argFlag(name) {
    return process.argv.includes(name);
}

function main() {
    const result = runCanonicalLedgerAccountsCanaryGate({
        dbPath: argValue('--shadow-db') || DEFAULT_DB_PATH,
        reportDir: argValue('--report-dir'),
        marker: argValue('--marker') || buildMarker(),
        confirmMarkerOnly: argFlag('--confirm-marker-only'),
        cleanup: !argFlag('--no-cleanup')
    });
    console.log(`[canonical-ledger-accounts-canary] decision=${result.decision}`);
    console.log(`[canonical-ledger-accounts-canary] report=${result.reportPath}`);
    console.log(`[canonical-ledger-accounts-canary] rows=${result.read.rows.length} cleanup=${result.cleanup.executed}`);
    if (result.decision !== 'GO') process.exitCode = 1;
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error.message || error);
        process.exit(1);
    }
}

module.exports = {
    buildAccountsProjection,
    buildMarker,
    runCanonicalLedgerAccountsCanaryGate
};
