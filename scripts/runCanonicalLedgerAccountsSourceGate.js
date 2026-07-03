const fs = require('node:fs');
const path = require('node:path');

const {
    CanonicalLedgerShadowStore,
    DEFAULT_DB_PATH
} = require('../src/ledger/canonicalLedgerShadowStore');
const {
    buildCanonicalLedgerAccountsSourceProjection,
    readCanonicalLedgerCanaryDomain
} = require('../src/ledger/canonicalLedgerReceiptProjector');

function sanitizeRunId(value) {
    return String(value || '')
        .replace(/[^A-Za-z0-9_:-]/g, '_')
        .slice(0, 96);
}

function defaultRunId(date = new Date()) {
    return `ACCOUNTS_SOURCE_${date.toISOString().replace(/\D/g, '').slice(0, 14)}`;
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

function headerIndex(headers = [], names = [], fallback = -1) {
    const normalizedNames = names.map(name => String(name).trim().toLowerCase());
    const index = headers.findIndex(header => normalizedNames.includes(String(header || '').trim().toLowerCase()));
    return index >= 0 ? index : fallback;
}

function ownerPersonIdsFromFinancialAccountRows(financialAccountRows = []) {
    if (!Array.isArray(financialAccountRows) || financialAccountRows.length < 2) return [];
    const headers = financialAccountRows[0] || [];
    const userIdIndex = headerIndex(headers, ['user_id', 'user id'], 7);
    return [...new Set(financialAccountRows.slice(1).map(row => String(row[userIdIndex] || '').trim()).filter(Boolean))];
}

function expectedAccountRowsFromProjection(projection) {
    return (projection.projected.accounts || []).map(account => ({
        name: account.name,
        opening_balance_cents: account.opening_balance_cents,
        balance_cents: account.opening_balance_cents
    })).sort((left, right) => left.name.localeCompare(right.name));
}

function validateReadRows(readRows = [], expectedRows = []) {
    const problems = [];
    const readByName = new Map(readRows.map(row => [row.name, row]));
    for (const expected of expectedRows) {
        const row = readByName.get(expected.name);
        if (!row) {
            problems.push(`missing:${expected.name}`);
            continue;
        }
        if (row.opening_balance_cents !== expected.opening_balance_cents) problems.push(`opening:${expected.name}`);
        if (row.balance_cents !== expected.balance_cents) problems.push(`balance:${expected.name}`);
    }
    return problems;
}

function validateConversationSourceRows(conversationFinancialAccountRows = [], expectedRows = []) {
    if (!Array.isArray(conversationFinancialAccountRows) || conversationFinancialAccountRows.length < 2) {
        return ['conversation_source_empty'];
    }
    const projection = buildCanonicalLedgerAccountsSourceProjection({
        financialAccountRows: conversationFinancialAccountRows,
        runId: 'conversation_source_validation'
    });
    return validateReadRows(expectedAccountRowsFromProjection(projection), expectedRows)
        .map(problem => `conversation_${problem}`);
}
function privacyScan(value) {
    const serialized = JSON.stringify(value);
    const leakPattern = /acct_|owner_person_id|user_id|source_row_hash|idempotency_key|oauth|token|spreadsheet|prompt/i;
    const leaks = leakPattern.test(serialized) ? ['internal_identifier_or_secret'] : [];
    return {
        ok: leaks.length === 0,
        leaks
    };
}

function runCanonicalLedgerAccountsSourceGate({
    dbPath = DEFAULT_DB_PATH,
    reportDir,
    financialAccountRows = [],
    conversationFinancialAccountRows = [],
    runId = defaultRunId(),
    confirmRealSource = false,
    persistSource = false,
    personByUserId = {}
} = {}) {
    if (!confirmRealSource) {
        throw new Error('Refusing to project financial account source without confirmRealSource=true.');
    }
    if (!Array.isArray(financialAccountRows) || financialAccountRows.length < 2) {
        throw new Error('financialAccountRows with header and at least one row is required.');
    }

    const safeRunId = sanitizeRunId(runId);
    const outputDir = path.resolve(reportDir || path.join('data', 'qa-runs', safeRunId));
    const reportPath = path.join(outputDir, 'canonical-ledger-accounts-source-gate.json');
    const projection = buildCanonicalLedgerAccountsSourceProjection({
        financialAccountRows,
        runId: safeRunId
    });
    const expectedRows = expectedAccountRowsFromProjection(projection);
    const conversationValidationProblems = validateConversationSourceRows(
        conversationFinancialAccountRows,
        expectedRows
    );
    const ownerPersonIds = ownerPersonIdsFromFinancialAccountRows(financialAccountRows);

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
        ownerPersonIds,
        personByUserId
    });
    const validationProblems = read.enabled
        ? validateReadRows(read.rows, expectedRows)
        : [read.reason || 'accounts_read_disabled'];
    validationProblems.push(...conversationValidationProblems);

    let cleanup = { executed: false, persistentRun: Boolean(persistSource) };
    if (!persistSource) {
        const cleanupStore = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
        try {
            cleanupStore.applyMigrations();
            cleanupStore.deleteRun(safeRunId);
        } finally {
            cleanupStore.close();
        }
        cleanup = { executed: true, persistentRun: false };
    }

    const result = {
        runId: safeRunId,
        decision: read.enabled && validationProblems.length === 0 ? 'GO' : 'NO-GO',
        seeded,
        read: {
            source: read.enabled ? 'canonical' : 'legacy',
            reason: read.reason || null,
            rows: read.rows || []
        },
        expectedRows,
        validation: {
            problems: validationProblems
        },
        cleanup,
        reportPath
    };
    result.privacy = privacyScan(result);
    if (!result.privacy.ok) result.decision = 'NO-GO';

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

function readRowsJson(filePath) {
    if (!filePath) throw new Error('--rows-json is required for CLI use.');
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
    const result = runCanonicalLedgerAccountsSourceGate({
        dbPath: argValue('--shadow-db') || DEFAULT_DB_PATH,
        reportDir: argValue('--report-dir'),
        financialAccountRows: readRowsJson(argValue('--rows-json')),
        conversationFinancialAccountRows: readRowsJson(argValue('--conversation-rows-json')),
        runId: argValue('--run-id') || defaultRunId(),
        confirmRealSource: argFlag('--confirm-real-source'),
        persistSource: argFlag('--persist-source')
    });
    console.log(`[canonical-ledger-accounts-source] decision=${result.decision}`);
    console.log(`[canonical-ledger-accounts-source] report=${result.reportPath}`);
    console.log(`[canonical-ledger-accounts-source] rows=${result.read.rows.length} persistent=${result.cleanup.persistentRun}`);
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
    runCanonicalLedgerAccountsSourceGate
};
