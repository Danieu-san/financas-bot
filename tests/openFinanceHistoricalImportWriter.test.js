const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const googleService = require('../src/services/google');
const oauthTokenStore = require('../src/services/oauthTokenStore');
const { FinancialWriteLedger } = require('../src/reliability/financialWriteLedger');
const {
    buildOpenFinanceHistoricalImportWriteBatch,
    executeOpenFinanceHistoricalImportWriteBatch
} = require('../src/openFinance/openFinanceHistoricalImportWriter');

function stableSerialize(value) {
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key =>
            `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function readyEntry(sourceRef, sheetName = 'Saídas', userId = 'user-1') {
    const rows = {
        'Saídas': ['01/08/2026', 'Item', 'Lazer', 'Lanche', 12.34,
            'Daniel', 'PIX', 'Não', 'Importação histórica Open Finance revisada.',
            userId, 'Nubank Daniel'],
        'Entradas': ['01/08/2026', 'Entrada', 'Salário', 1000,
            'Daniel', 'Conta Corrente', 'Não',
            'Importação histórica Open Finance revisada.', userId, 'Nubank Daniel'],
        'Lançamentos Cartão': ['01/08/2026', 'Compra', 'Lazer', 12.34,
            '1/1', 'Agosto de 2026', 'card-1', 'Nubank Daniel',
            'Importação histórica Open Finance revisada.', userId],
        'Transferências': ['01/08/2026', 'Transferência', 10,
            'Nubank Daniel', 'Nubank Thais', 'Transferência',
            'Importação histórica Open Finance revisada.', 'Conferida', userId]
    };
    const operations = {
        'Saídas': 'expense.create',
        'Entradas': 'income.create',
        'Lançamentos Cartão': 'expense.create',
        'Transferências': 'transfer.create'
    };
    return {
        source_ref: sourceRef,
        state: 'ready',
        classification: sheetName === 'Entradas' ? 'income' : 'expense',
        reason: 'test',
        write_plan: {
            operation: operations[sheetName],
            sheet_name: sheetName,
            row: rows[sheetName],
            financial_writes: 0
        },
        financial_writes: 0
    };
}

function plan(entries) {
    const summary = {
        ready: entries.filter(item => item.state === 'ready').length,
        existing: entries.filter(item => item.state === 'existing').length,
        possible_duplicate: entries.filter(item => item.state === 'possible_duplicate').length,
        excluded: entries.filter(item => item.state === 'excluded').length,
        needs_review: entries.filter(item => item.state === 'needs_review').length,
        outside_window: entries.filter(item => item.state === 'outside_window').length
    };
    const value = {
        history_start_date: '2025-07-01',
        history_end_date: '2026-08-15',
        source_observed_at: '2026-08-15T12:00:00.000Z',
        include_open_invoice_current_purchases: true,
        coverage_complete: true,
        plan_status: 'REVIEW_REQUIRED',
        writable: false,
        summary,
        entries,
        financial_writes: 0
    };
    value.plan_hash = crypto.createHash('sha256').update(stableSerialize({
        historyStartDate: value.history_start_date,
        historyEndDate: value.history_end_date,
        includeOpenInvoiceCurrentPurchases: true,
        entries
    })).digest('hex');
    return value;
}

function applyConfirmation(input) {
    const dryRun = buildOpenFinanceHistoricalImportWriteBatch({ plan: input });
    return {
        confirmApply: true,
        confirmPlanHash: input.plan_hash,
        confirmPlanFingerprint: dryRun.plan_fingerprint
    };
}

function nonReady(sourceRef, state) {
    return {
        source_ref: sourceRef,
        state,
        classification: 'excluded',
        reason: 'test',
        financial_writes: 0
    };
}

function tempLedger() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-writer-'));
    const ledger = new FinancialWriteLedger({ dbPath: path.join(directory, 'ledger.sqlite') });
    return { ledger, directory };
}

function ledgerBackedAppend(ledger, calls, { failAt = -1 } = {}) {
    return async (sheetName, row, options) => {
        calls.push({ sheetName, row, options });
        const current = ledger.getOperation(options.operationKey);
        if (current?.status === 'committed') return current;
        if (options.reconcileOnly && !current) {
            const error = new Error('missing uncertain operation');
            error.code = 'FINANCIAL_WRITE_UNCERTAIN';
            throw error;
        }
        if (!current) {
            ledger.beginOperation({
                operationKey: options.operationKey,
                actorScope: { userHash: options.userId, scope: 'user_spreadsheet' },
                operation: `append.${sheetName}`,
                payload: { sheetName, row },
                provenance: { source: options.source }
            });
        }
        if (calls.length === failAt) {
            ledger.markFailed(options.operationKey, { receipt: { sheetName } });
            throw new Error('injected failure');
        }
        return ledger.commitOperation(options.operationKey, {
            receipt: { sheetName, updatedRange: `${sheetName}!A2:J2` }
        });
    };
}

test('historical writer builds a deterministic dry-run only from ready entries', async () => {
    const input = plan([
        readyEntry('ref-1', 'Saídas'),
        readyEntry('ref-2', 'Lançamentos Cartão'),
        nonReady('ref-3', 'existing'),
        nonReady('ref-4', 'possible_duplicate'),
        nonReady('ref-5', 'excluded'),
        nonReady('ref-6', 'outside_window')
    ]);
    const first = buildOpenFinanceHistoricalImportWriteBatch({ plan: input });
    const second = buildOpenFinanceHistoricalImportWriteBatch({ plan: input });
    assert.equal(first.status, 'dry_run_ready');
    assert.equal(first.total_entries, 6);
    assert.equal(first.write_count, 2);
    assert.equal(first.blocked_count, 4);
    assert.deepEqual(first.items.map(item => item.operation_key),
        second.items.map(item => item.operation_key));
    assert.deepEqual(first.destination_counts, {
        'Lançamentos Cartão': 1,
        'Saídas': 1
    });

    let writes = 0;
    const result = await executeOpenFinanceHistoricalImportWriteBatch({
        plan: input,
        mode: 'dry-run',
        appendRowToSheet: async () => { writes += 1; }
    });
    assert.equal(result.status, 'dry_run_ready');
    assert.equal(result.financial_writes, 0);
    assert.equal(writes, 0);
});

test('historical writer rejects mutated hashes and any review residue', () => {
    const mutated = plan([readyEntry('ref-1')]);
    mutated.entries[0].write_plan.row[4] = 99;
    assert.throws(() => buildOpenFinanceHistoricalImportWriteBatch({ plan: mutated }),
        /historical_import_writer_plan_hash_mismatch/);

    const review = plan([nonReady('ref-2', 'needs_review')]);
    assert.throws(() => buildOpenFinanceHistoricalImportWriteBatch({ plan: review }),
        /historical_import_writer_review_residue/);

    const staleCoverage = plan([readyEntry('ref-3')]);
    staleCoverage.source_observed_at = '2026-08-14T23:59:59.000Z';
    assert.throws(() => buildOpenFinanceHistoricalImportWriteBatch({
        plan: staleCoverage
    }), /historical_import_writer_coverage_evidence_invalid/);
});

test('historical writer requires explicit apply confirmation and exact plan hash', async () => {
    const input = plan([readyEntry('ref-1')]);
    await assert.rejects(executeOpenFinanceHistoricalImportWriteBatch({
        plan: input,
        mode: 'apply'
    }), /historical_import_writer_apply_confirmation_required/);
    await assert.rejects(executeOpenFinanceHistoricalImportWriteBatch({
        plan: input,
        mode: 'apply',
        confirmApply: true,
        confirmPlanHash: '0'.repeat(64)
    }), /historical_import_writer_confirmed_hash_mismatch/);
    await assert.rejects(executeOpenFinanceHistoricalImportWriteBatch({
        plan: input,
        mode: 'apply',
        confirmApply: true,
        confirmPlanHash: input.plan_hash,
        confirmPlanFingerprint: '0'.repeat(64)
    }), /historical_import_writer_confirmed_fingerprint_mismatch/);
});

test('historical writer stops on partial failure and resumes without duplicate writes', async () => {
    const input = plan([
        readyEntry('ref-1', 'Saídas'),
        readyEntry('ref-2', 'Entradas'),
        readyEntry('ref-3', 'Lançamentos Cartão')
    ]);
    const { ledger, directory } = tempLedger();
    try {
        const firstCalls = [];
        const first = await executeOpenFinanceHistoricalImportWriteBatch({
            plan: input,
            mode: 'apply',
            ...applyConfirmation(input),
            writeLedger: ledger,
            appendRowToSheet: ledgerBackedAppend(ledger, firstCalls, { failAt: 2 })
        });
        assert.equal(first.status, 'stopped');
        assert.equal(first.committed, 1);
        assert.equal(first.failed, 1);
        assert.equal(first.remaining, 1);
        assert.equal(first.financial_writes, 1);

        const resumeCalls = [];
        const resumed = await executeOpenFinanceHistoricalImportWriteBatch({
            plan: input,
            mode: 'apply',
            ...applyConfirmation(input),
            writeLedger: ledger,
            appendRowToSheet: ledgerBackedAppend(ledger, resumeCalls)
        });
        assert.equal(resumed.status, 'committed');
        assert.equal(resumed.replayed, 1);
        assert.equal(resumed.committed, 2);
        assert.equal(resumed.financial_writes, 2);
        assert.equal(resumeCalls.length, 2);

        const replayCalls = [];
        const replay = await executeOpenFinanceHistoricalImportWriteBatch({
            plan: input,
            mode: 'apply',
            ...applyConfirmation(input),
            writeLedger: ledger,
            appendRowToSheet: ledgerBackedAppend(ledger, replayCalls)
        });
        assert.equal(replay.status, 'committed');
        assert.equal(replay.replayed, 3);
        assert.equal(replay.committed, 0);
        assert.equal(replay.financial_writes, 0);
        assert.equal(replayCalls.length, 0);
    } finally {
        ledger.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('historical writer reconciles pending or uncertain ledger entries without a new append', async () => {
    const input = plan([readyEntry('ref-1', 'Transferências')]);
    const batch = buildOpenFinanceHistoricalImportWriteBatch({ plan: input });
    const { ledger, directory } = tempLedger();
    try {
        ledger.beginOperation({
            operationKey: batch.items[0].operation_key,
            actorScope: { scope: 'user_spreadsheet' },
            operation: 'append.Transferências',
            payload: {},
            provenance: {}
        });
        const calls = [];
        const result = await executeOpenFinanceHistoricalImportWriteBatch({
            plan: input,
            mode: 'apply',
            ...applyConfirmation(input),
            writeLedger: ledger,
            appendRowToSheet: ledgerBackedAppend(ledger, calls)
        });
        assert.equal(result.status, 'committed');
        assert.equal(result.reconciled, 1);
        assert.equal(result.financial_writes, 0);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].options.reconcileOnly, true);
    } finally {
        ledger.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('historical writer traverses the real user-scoped Google writer and replays once', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-google-writer-'));
    const previous = {
        dbPath: process.env.OAUTH_TOKEN_DB_PATH,
        key: process.env.OAUTH_TOKEN_ENCRYPTION_KEY,
        clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET
    };
    process.env.OAUTH_TOKEN_DB_PATH = path.join(directory, 'oauth.sqlite');
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = '8'.repeat(64);
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
    oauthTokenStore.__test__.closeDatabaseForTests();
    const ledger = new FinancialWriteLedger({
        dbPath: path.join(directory, 'financial-writes.sqlite')
    });
    const appendCalls = [];
    const rowsBySheet = new Map();
    const fakeUserSheets = {
        spreadsheets: {
            values: {
                append: async ({ spreadsheetId, range, resource }) => {
                    const sheetName = range.split('!')[0];
                    const rows = rowsBySheet.get(sheetName) || [];
                    rows.push(resource.values[0]);
                    rowsBySheet.set(sheetName, rows);
                    appendCalls.push({ spreadsheetId, range });
                    return {
                        data: {
                            updates: {
                                updatedRange: `${sheetName}!A${rows.length + 1}:K${rows.length + 1}`
                            }
                        }
                    };
                },
                get: async ({ range }) => ({
                    data: { values: rowsBySheet.get(range.split('!')[0]) || [] }
                })
            },
            batchUpdate: async () => ({})
        }
    };
    const input = plan([
        readyEntry('ref-google-1', 'Saídas', 'user-family'),
        readyEntry('ref-google-2', 'Entradas', 'user-family'),
        readyEntry('ref-google-3', 'Lançamentos Cartão', 'user-family'),
        readyEntry('ref-google-4', 'Transferências', 'user-family')
    ]);
    try {
        oauthTokenStore.saveOAuthConnection('user-family', {
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            tokens: {
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token'
            },
            spreadsheetId: 'family-sheet'
        });
        googleService.__test__.setUserSheetsClientFactoryForTest(() => fakeUserSheets);

        const first = await executeOpenFinanceHistoricalImportWriteBatch({
            plan: input,
            mode: 'apply',
            ...applyConfirmation(input),
            writeLedger: ledger,
            appendRowToSheet: googleService.appendRowToSheet
        });
        assert.equal(first.status, 'committed');
        assert.equal(first.committed, 4);
        assert.equal(first.financial_writes, 4);
        assert.equal(appendCalls.length, 4);
        assert.ok(appendCalls.every(call => call.spreadsheetId === 'family-sheet'));
        assert.deepEqual(appendCalls.map(call => call.range), [
            'Saídas!A:A',
            'Entradas!A:A',
            'Lançamentos Cartão!A:A',
            'Transferências!A:A'
        ]);

        const replay = await executeOpenFinanceHistoricalImportWriteBatch({
            plan: input,
            mode: 'apply',
            ...applyConfirmation(input),
            writeLedger: ledger,
            appendRowToSheet: googleService.appendRowToSheet
        });
        assert.equal(replay.status, 'committed');
        assert.equal(replay.replayed, 4);
        assert.equal(replay.financial_writes, 0);
        assert.equal(appendCalls.length, 4);
    } finally {
        googleService.__test__.setUserSheetsClientFactoryForTest(null);
        googleService.__test__.clearSheetsReadCache();
        ledger.close();
        oauthTokenStore.__test__.closeDatabaseForTests();
        if (previous.dbPath === undefined) delete process.env.OAUTH_TOKEN_DB_PATH;
        else process.env.OAUTH_TOKEN_DB_PATH = previous.dbPath;
        if (previous.key === undefined) delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
        else process.env.OAUTH_TOKEN_ENCRYPTION_KEY = previous.key;
        if (previous.clientId === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
        else process.env.GOOGLE_OAUTH_CLIENT_ID = previous.clientId;
        if (previous.clientSecret === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
        else process.env.GOOGLE_OAUTH_CLIENT_SECRET = previous.clientSecret;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('historical writer CLI reports only aggregates and keeps apply fail-closed', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-writer-cli-'));
    const input = plan([
        readyEntry('ref-private-cli', 'Saídas'),
        nonReady('ref-private-blocked', 'possible_duplicate')
    ]);
    input.entries[0].write_plan.row[1] = 'DADO PRIVADO SINTÉTICO';
    input.plan_hash = crypto.createHash('sha256').update(stableSerialize({
        historyStartDate: input.history_start_date,
        historyEndDate: input.history_end_date,
        includeOpenInvoiceCurrentPurchases: true,
        entries: input.entries
    })).digest('hex');
    const planPath = path.join(directory, 'private-plan.json');
    fs.writeFileSync(planPath, JSON.stringify(input));
    const script = path.resolve(
        __dirname,
        '../scripts/runOpenFinanceHistoricalImportWriter.js'
    );
    try {
        const dryRun = spawnSync(process.execPath, [script, '--plan', planPath, '--dry-run'], {
            cwd: path.resolve(__dirname, '..'),
            encoding: 'utf8'
        });
        assert.equal(dryRun.status, 0, dryRun.stderr);
        assert.equal(dryRun.stdout.includes('DADO PRIVADO SINTÉTICO'), false);
        const output = JSON.parse(dryRun.stdout);
        assert.equal(output.write_count, 1);
        assert.equal(output.blocked_count, 1);
        assert.equal(output.items, undefined);
        assert.equal(output.financial_writes, 0);

        const blockedApply = spawnSync(process.execPath, [
            script, '--plan', planPath, '--apply',
            '--confirm-plan-hash', input.plan_hash
        ], {
            cwd: path.resolve(__dirname, '..'),
            encoding: 'utf8'
        });
        assert.equal(blockedApply.status, 1);
        assert.match(blockedApply.stderr,
            /historical_import_writer_apply_confirmation_required/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
