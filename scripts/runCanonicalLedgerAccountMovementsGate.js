const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const {
    CanonicalLedgerShadowStore,
    DEFAULT_DB_PATH
} = require('../src/ledger/canonicalLedgerShadowStore');
const {
    buildCanonicalLedgerAccountsSourceProjection,
    buildCanonicalLedgerReceiptProjection,
    readCanonicalLedgerCanaryDomain
} = require('../src/ledger/canonicalLedgerReceiptProjector');

function sanitize(value) {
    return String(value || '').replace(/[^A-Za-z0-9_:-]/g, '_').slice(0, 96);
}

function buildMarker(date = new Date()) {
    return `TESTE_APAGAR_ACCOUNT_MOVEMENTS_${date.toISOString().replace(/\D/g, '').slice(0, 12)}`;
}

function readEnv() {
    return {
        NODE_ENV: 'test',
        CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
        CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED: 'true',
        CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
        CANONICAL_LEDGER_CANARY_READ_APPROVED: 'true',
        CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'accounts,transactions,transfers'
    };
}

function buildFixture(marker) {
    const ownerPersonId = 'user-account-movements';
    const originName = `Conta origem ${marker}`;
    const destinationName = `Conta destino ${marker}`;
    const financialAccountRows = [
        ['Nome da Conta', 'Tipo', 'Saldo Inicial', 'Data de Abertura', 'Status', 'Moeda', 'Responsavel', 'user_id', 'Observacoes'],
        [originName, 'bank', '1000,00', '03/07/2026', 'active', 'BRL', 'Daniel', ownerPersonId, marker],
        [destinationName, 'bank', '50,00', '03/07/2026', 'active', 'BRL', 'Daniel', ownerPersonId, marker]
    ];
    return {
        ownerPersonId,
        financialAccountRows,
        receipts: [
            {
                sheetName: 'Saídas',
                row: ['04/07/2026', `Despesa ${marker}`, 'Teste', 'Movimentos', 20, 'Daniel', originName, 'Não', marker, ownerPersonId]
            },
            {
                sheetName: 'Entradas',
                row: ['05/07/2026', `Entrada ${marker}`, 'Teste', 30, 'Daniel', destinationName, 'Não', marker, ownerPersonId]
            },
            {
                sheetName: 'Transferências',
                row: ['06/07/2026', `Transferencia concluida ${marker}`, 100, originName, destinationName, 'PIX', marker, 'Conferida', ownerPersonId]
            },
            {
                sheetName: 'Transferências',
                row: ['07/07/2026', `Transferencia pendente ${marker}`, 40, originName, destinationName, 'PIX', marker, 'Pendente', ownerPersonId]
            }
        ],
        expectedBalances: new Map([
            [originName, { opening: 100000, balance: 88000 }],
            [destinationName, { opening: 5000, balance: 18000 }]
        ])
    };
}

function buildProjections(fixture, marker) {
    const source = buildCanonicalLedgerAccountsSourceProjection({
        financialAccountRows: fixture.financialAccountRows,
        runId: `ACCOUNT_MOVEMENTS_SOURCE_${sanitize(marker)}`
    });
    const receipts = fixture.receipts.map((receipt, index) => buildCanonicalLedgerReceiptProjection({
        ...receipt,
        operationKey: `account-movements:${sanitize(marker)}:${index + 1}`,
        status: 'committed',
        source: 'gate.account_movements',
        receipt: { updatedRange: `Gate!${index + 2}` },
        financialAccountRows: fixture.financialAccountRows,
        committedAt: `2026-07-0${index + 4}T12:00:00.000Z`
    }));
    return [source, ...receipts];
}

function countRows(dbPath, runIds) {
    const db = new Database(dbPath, { readonly: true });
    try {
        const placeholders = runIds.map(() => '?').join(', ');
        const count = table => db.prepare(
            `SELECT COUNT(*) AS count FROM ${table} WHERE run_id IN (${placeholders})`
        ).get(...runIds).count;
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

function accountParity(rows, expectedBalances) {
    return [...expectedBalances.entries()]
        .map(([name, expected]) => {
            const canonical = rows.find(row => row.name === name);
            return {
                name,
                opening_balance_cents: expected.opening,
                expected_balance_cents: expected.balance,
                canonical_balance_cents: canonical?.balance_cents ?? null
            };
        })
        .sort((left, right) => left.name.localeCompare(right.name));
}

function eventParity(rows, marker) {
    return rows
        .filter(row => String(row.description || '').includes(marker))
        .map(row => ({
            kind: row.kind,
            date: row.date,
            effective_on: row.effective_on,
            status: row.status
        }))
        .sort((left, right) => left.date.localeCompare(right.date));
}

function privacyScan(value) {
    const serialized = JSON.stringify(value);
    const unsafe = /user-account-movements|acct_|source_row_hash|idempotency_key|operationKey|oauth|token|spreadsheet|prompt/i;
    return {
        ok: !unsafe.test(serialized),
        leaks: unsafe.test(serialized) ? ['internal_identifier_or_secret'] : []
    };
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function runCanonicalLedgerAccountMovementsGate({
    dbPath = DEFAULT_DB_PATH,
    reportDir,
    marker = buildMarker(),
    confirmMarkerOnly = false,
    readDomain = readCanonicalLedgerCanaryDomain
} = {}) {
    if (!confirmMarkerOnly) {
        throw new Error('Refusing account movements gate without confirmMarkerOnly=true.');
    }
    if (!String(marker).includes('TESTE_APAGAR')) {
        throw new Error('Account movements marker must include TESTE_APAGAR.');
    }

    const fixture = buildFixture(marker);
    const projections = buildProjections(fixture, marker);
    const runIds = projections.map(projection => projection.runId);
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    try {
        for (const projection of projections) store.persistProjection(projection);
    } finally {
        store.close();
    }
    const firstCounts = countRows(dbPath, runIds);

    const replayStore = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    try {
        for (const projection of projections) replayStore.persistProjection(projection);
    } finally {
        replayStore.close();
    }
    const replayCounts = countRows(dbPath, runIds);
    const idempotency = {
        ok: JSON.stringify(firstCounts) === JSON.stringify(replayCounts),
        firstCounts,
        replayCounts
    };

    const input = {
        env: readEnv(),
        dbPath,
        ownerPersonIds: [fixture.ownerPersonId],
        personByUserId: { [fixture.ownerPersonId]: 'Daniel' }
    };
    let accounts = { enabled: false, rows: [] };
    let transactions = { enabled: false, rows: [] };
    let transfers = { enabled: false, rows: [] };
    const validationProblems = [];
    try {
        accounts = readDomain({ ...input, domain: 'accounts' });
        transactions = readDomain({ ...input, domain: 'transactions' });
        transfers = readDomain({ ...input, domain: 'transfers' });
    } catch {
        validationProblems.push('canonical_read_failed');
    }
    const accountBalances = accountParity(accounts.rows, fixture.expectedBalances);
    const events = eventParity(transactions.rows, marker);
    const transferNetImpactCents = projections
        .flatMap(projection => projection.projected.events || [])
        .filter(event => event.kind === 'transfer')
        .reduce((total, event) => total + Number(event.net_income_expense_impact || 0), 0);
    const expectedEvents = [
        { kind: 'expense', date: '2026-07-04', effective_on: '2026-07-04', status: 'settled' },
        { kind: 'income', date: '2026-07-05', effective_on: '2026-07-05', status: 'settled' },
        { kind: 'transfer', date: '2026-07-06', effective_on: '2026-07-06', status: 'settled' },
        { kind: 'transfer', date: '2026-07-07', effective_on: '2026-07-07', status: 'pending' }
    ];
    const parity = {
        accountBalances,
        events,
        transferRows: transfers.rows.filter(row => String(row.description || '').includes(marker)).length,
        transferNetImpactCents
    };
    const parityOk = validationProblems.length === 0 &&
        accounts.enabled && transactions.enabled && transfers.enabled &&
        accountBalances.every(row =>
            row.canonical_balance_cents === row.expected_balance_cents
        ) && JSON.stringify(events) === JSON.stringify(expectedEvents) &&
        parity.transferRows === 2 && transferNetImpactCents === 0;

    const publicResult = { marker, parity, idempotency };
    const privacy = privacyScan(publicResult);
    const cleanupStore = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    try {
        for (const runId of runIds) cleanupStore.deleteRun(runId);
    } finally {
        cleanupStore.close();
    }
    const cleanup = { remainingMarkerRows: countRows(dbPath, runIds) };
    const cleanupOk = Object.values(cleanup.remainingMarkerRows).every(count => count === 0);
    const decision = parityOk && idempotency.ok && privacy.ok && cleanupOk ? 'GO' : 'NO-GO';
    const outputDir = path.resolve(reportDir || path.join(
        'data',
        'qa-runs',
        `ACCOUNT_MOVEMENTS_${sanitize(marker)}`
    ));
    const reportPath = path.join(outputDir, 'canonical-ledger-account-movements-gate.json');
    const result = {
        marker,
        decision,
        parity,
        idempotency,
        validation: { problems: validationProblems },
        privacy,
        cleanup,
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
    return index >= 0 ? process.argv[index + 1] : null;
}

function main() {
    const result = runCanonicalLedgerAccountMovementsGate({
        dbPath: argValue('--shadow-db') || DEFAULT_DB_PATH,
        reportDir: argValue('--report-dir'),
        marker: argValue('--marker') || buildMarker(),
        confirmMarkerOnly: process.argv.includes('--confirm-marker-only')
    });
    console.log(`[canonical-ledger-account-movements] decision=${result.decision}`);
    console.log(`[canonical-ledger-account-movements] report=${result.reportPath}`);
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
    buildMarker,
    runCanonicalLedgerAccountMovementsGate
};
