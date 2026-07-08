const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const {
    projectLegacyRowsToCanonicalLedger,
    buildCanonicalPublicProjection
} = require('../src/ledger/canonicalLedgerProjector');
const {
    CanonicalLedgerShadowStore,
    DEFAULT_DB_PATH
} = require('../src/ledger/canonicalLedgerShadowStore');
const {
    readCanonicalLedgerCanaryDomain
} = require('../src/ledger/canonicalLedgerReceiptProjector');

function sanitize(value) {
    return String(value || '').replace(/[^A-Za-z0-9_:-]/g, '_').slice(0, 96);
}

function buildMarker(date = new Date()) {
    return `TESTE_APAGAR_REFUNDS_${date.toISOString().replace(/\D/g, '').slice(0, 12)}`;
}

function readEnv() {
    return {
        NODE_ENV: 'test',
        CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
        CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED: 'true',
        CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
        CANONICAL_LEDGER_CANARY_READ_APPROVED: 'true',
        CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'transactions'
    };
}

function buildFixture(marker) {
    const ownerPersonId = 'user-refunds-gate';
    return {
        householdId: 'household-refunds-gate',
        people: [{ person_id: ownerPersonId, display_name: 'Daniel' }],
        projectionContext: { competenceMonth: '2026-07' },
        legacyRows: {
            saidas: [{
                source_row_id: `${marker}-expense`,
                user_id: ownerPersonId,
                data: '08/07/2026',
                descricao: `Mercado ${marker}`,
                categoria: 'Alimentacao',
                subcategoria: 'Supermercado',
                valor: '120,00',
                pagamento: 'PIX',
                recorrente: 'Nao'
            }],
            entradas: [{
                source_row_id: `${marker}-reimbursement`,
                user_id: ownerPersonId,
                data: '09/07/2026',
                descricao: `Reembolso Mercado ${marker}`,
                categoria: 'Reembolso',
                valor: '45,00',
                recebimento: 'PIX',
                recorrente: 'Nao',
                related_source_row_id: `${marker}-expense`
            }],
            lancamentosCartao: [
                {
                    source_row_id: `${marker}-card-purchase`,
                    user_id: ownerPersonId,
                    card_id: 'card-refunds-gate',
                    cartao: 'Cartao Refunds Gate',
                    data: '08/07/2026',
                    descricao: `Notebook ${marker}`,
                    categoria: 'Eletronicos',
                    subcategoria: 'Computador',
                    valor_parcela: '200,00',
                    parcela: '1/1',
                    mes_cobranca: '2026-07'
                },
                {
                    source_row_id: `${marker}-chargeback`,
                    user_id: ownerPersonId,
                    card_id: 'card-refunds-gate',
                    cartao: 'Cartao Refunds Gate',
                    data: '10/07/2026',
                    descricao: `Estorno Notebook ${marker}`,
                    categoria: 'Estorno',
                    subcategoria: 'Estorno',
                    valor_parcela: '-50,00',
                    parcela: '1/1',
                    mes_cobranca: '2026-07',
                    related_source_row_id: `${marker}-card-purchase`
                }
            ]
        }
    };
}

function buildProjection(marker) {
    const fixture = buildFixture(marker);
    const projected = projectLegacyRowsToCanonicalLedger(fixture);
    const publicProjection = buildCanonicalPublicProjection(projected, fixture);
    return {
        runId: `REFUNDS_GATE_${sanitize(marker)}`,
        projected,
        publicProjection,
        report: {
            report_type: 'canonical_ledger_receipt_shadow',
            schema_version: 'canonical-ledger-v1',
            synthetic_fixture_only: true,
            marker
        },
        ownerPersonId: fixture.people[0].person_id
    };
}

function countRows(dbPath, runId) {
    const db = new Database(dbPath, { readonly: true });
    try {
        const count = table => db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE run_id = ?`).get(runId).count;
        return {
            events: count('canonical_ledger_events'),
            lines: count('canonical_ledger_event_lines'),
            links: count('canonical_ledger_reconciliation_links'),
            publicProjectionRows: count('canonical_ledger_public_projection'),
            projectionRuns: count('canonical_ledger_projection_runs')
        };
    } finally {
        db.close();
    }
}

function summarizeRows(rows = [], marker = '') {
    const relevant = rows.filter(row => String(row.description || '').includes(marker));
    const byCategory = new Map();
    for (const row of relevant) {
        const category = row.category || 'Outros';
        const existing = byCategory.get(category) || {
            category,
            gross_cents: 0,
            compensation_cents: 0,
            net_cents: 0
        };
        const net = Number(row.net_income_expense_impact || 0);
        if (net >= 0) existing.gross_cents += net;
        else existing.compensation_cents += Math.abs(net);
        existing.net_cents += net;
        byCategory.set(category, existing);
    }
    return {
        rows: relevant.map(row => ({
            kind: row.kind,
            status: row.status,
            category: row.category,
            amount_cents: row.amount_cents,
            net_income_expense_impact: row.net_income_expense_impact
        })).sort((left, right) => `${left.category}:${left.kind}`.localeCompare(`${right.category}:${right.kind}`)),
        byCategory: [...byCategory.values()].sort((left, right) => left.category.localeCompare(right.category))
    };
}

function privacyScan(value) {
    const serialized = JSON.stringify(value);
    const unsafe = /user-refunds-gate|source_row_hash|idempotency_key|operationKey|oauth|token|spreadsheet|prompt/i;
    return {
        ok: !unsafe.test(serialized),
        leaks: unsafe.test(serialized) ? ['internal_identifier_or_secret'] : []
    };
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function runCanonicalLedgerRefundsGate({
    dbPath = DEFAULT_DB_PATH,
    reportDir,
    marker = buildMarker(),
    confirmMarkerOnly = false,
    readDomain = readCanonicalLedgerCanaryDomain
} = {}) {
    if (!confirmMarkerOnly) {
        throw new Error('Refusing refunds gate without confirmMarkerOnly=true.');
    }
    if (!String(marker).includes('TESTE_APAGAR')) {
        throw new Error('Refunds gate marker must include TESTE_APAGAR.');
    }

    const projection = buildProjection(marker);
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    try {
        store.persistProjection(projection);
    } finally {
        store.close();
    }
    const firstCounts = countRows(dbPath, projection.runId);

    const replayStore = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    try {
        replayStore.persistProjection(projection);
    } finally {
        replayStore.close();
    }
    const replayCounts = countRows(dbPath, projection.runId);
    const idempotency = {
        ok: JSON.stringify(firstCounts) === JSON.stringify(replayCounts),
        firstCounts,
        replayCounts
    };

    let read = { enabled: false, rows: [] };
    const validationProblems = [];
    try {
        read = readDomain({
            env: readEnv(),
            dbPath,
            domain: 'transactions',
            ownerPersonIds: [projection.ownerPersonId],
            personByUserId: { [projection.ownerPersonId]: 'Daniel' }
        });
    } catch {
        validationProblems.push('canonical_read_failed');
    }

    const summary = summarizeRows(read.rows, marker);
    const expectedCategories = [
        { category: 'Alimentacao', gross_cents: 12000, compensation_cents: 4500, net_cents: 7500 },
        { category: 'Eletronicos', gross_cents: 20000, compensation_cents: 5000, net_cents: 15000 }
    ];
    const expectedKinds = ['card_purchase', 'chargeback', 'expense', 'reimbursement'];
    const parityOk = validationProblems.length === 0 &&
        read.enabled &&
        summary.rows.length === 4 &&
        JSON.stringify(summary.byCategory) === JSON.stringify(expectedCategories) &&
        JSON.stringify(summary.rows.map(row => row.kind).sort()) === JSON.stringify(expectedKinds) &&
        summary.rows.every(row => row.status === 'settled');

    const publicResult = { marker, summary };
    const privacy = privacyScan(publicResult);

    const cleanupStore = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    try {
        cleanupStore.deleteRun(projection.runId);
    } finally {
        cleanupStore.close();
    }
    const cleanup = { remainingMarkerRows: countRows(dbPath, projection.runId) };
    const cleanupOk = Object.values(cleanup.remainingMarkerRows).every(count => count === 0);
    const decision = parityOk && idempotency.ok && privacy.ok && cleanupOk ? 'GO' : 'NO-GO';
    const outputDir = path.resolve(reportDir || path.join(
        'data',
        'qa-runs',
        `REFUNDS_GATE_${sanitize(marker)}`
    ));
    const reportPath = path.join(outputDir, 'canonical-ledger-refunds-gate.json');
    const result = {
        marker,
        decision,
        summary,
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
    const result = runCanonicalLedgerRefundsGate({
        dbPath: argValue('--shadow-db') || DEFAULT_DB_PATH,
        reportDir: argValue('--report-dir'),
        marker: argValue('--marker') || buildMarker(),
        confirmMarkerOnly: process.argv.includes('--confirm-marker-only')
    });
    console.log(`[canonical-ledger-refunds] decision=${result.decision}`);
    console.log(`[canonical-ledger-refunds] report=${result.reportPath}`);
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
    runCanonicalLedgerRefundsGate
};
