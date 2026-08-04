'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');
const {
    HISTORICAL_RX_GATE,
    buildOpenFinanceHistoricalRx,
    snapshotSqliteFileSet,
    sqliteFileSetsEqual,
    validateHistoricalRxInventoryContract,
    validateHistoricalRxMappingAliases
} = require('../src/openFinance/openFinanceHistoricalRx');

function parseArgs(argv) {
    const allowed = new Set([
        '--confirm-read-only', '--history-start', '--staging-db', '--secret-file',
        '--mapping-file', '--source-lifecycle-file', '--expected-inventory-file', '--output'
    ]);
    const result = {};
    for (let index = 0; index < argv.length; index += 1) {
        const key = argv[index];
        if (!allowed.has(key)) throw new Error(`unsupported_argument:${key}`);
        if (key === '--confirm-read-only') {
            result.confirmReadOnly = true;
            continue;
        }
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) throw new Error(`missing_argument_value:${key}`);
        result[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
        index += 1;
    }
    return result;
}

function requireFile(value, code) {
    const resolved = path.resolve(String(value || ''));
    if (!value || !fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()) throw new Error(code);
    return resolved;
}

function loadJson(file, code) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        throw new Error(code);
    }
}

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function requirePrivateOutput(value) {
    if (!value || path.extname(value).toLowerCase() !== '.json') throw new Error('historical_rx_json_output_required');
    const output = path.resolve(value);
    if (fs.existsSync(output)) throw new Error('historical_rx_output_already_exists');
    const parent = path.dirname(output);
    if (!fs.statSync(parent, { throwIfNoEntry: false })?.isDirectory()) throw new Error('historical_rx_output_parent_missing');
    const physicalParent = fs.realpathSync(parent);
    const physicalRepo = fs.realpathSync(path.resolve(__dirname, '..'));
    const relative = path.relative(physicalRepo, physicalParent);
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
        throw new Error('historical_rx_output_must_be_outside_repository');
    }
    return output;
}

function aliasList(mappings) {
    if (!Array.isArray(mappings) || !mappings.length) throw new Error('historical_rx_mapping_required');
    const aliases = mappings.map(mapping => String(mapping.alias || '').trim().toLowerCase());
    if (aliases.some(alias => !/^[a-z0-9_-]{2,48}$/.test(alias)) || new Set(aliases).size !== aliases.length) {
        throw new Error('invalid_historical_rx_mapping');
    }
    return aliases;
}

function writePrivateJson(output, payload) {
    const temporary = `${output}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, output);
}

function copySqliteFileSet(sourceDatabase, targetDatabase, snapshot) {
    const suffixes = { database: '', wal: '-wal', shm: '-shm', journal: '-journal' };
    for (const [kind, suffix] of Object.entries(suffixes)) {
        if (!snapshot[kind].exists) continue;
        fs.copyFileSync(`${sourceDatabase}${suffix}`, `${targetDatabase}${suffix}`, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(`${targetDatabase}${suffix}`, 0o600);
    }
}

function main(argv = process.argv.slice(2), {
    VaultClass = OpenFinanceLiveStagingVault,
    stdout = process.stdout
} = {}) {
    const args = parseArgs(argv);
    if (!args.confirmReadOnly) throw new Error('confirm_read_only_required');
    const stagingDb = requireFile(args.stagingDb, 'historical_rx_staging_db_required');
    const secretFile = requireFile(args.secretFile, 'historical_rx_secret_file_required');
    const mappingFile = requireFile(args.mappingFile, 'historical_rx_mapping_file_required');
    const output = requirePrivateOutput(args.output);
    const secret = fs.readFileSync(secretFile, 'utf8').trim();
    const mappings = loadJson(mappingFile, 'invalid_historical_rx_mapping_file');
    const expectedInventory = loadJson(
        requireFile(args.expectedInventoryFile, 'historical_rx_expected_inventory_file_required'),
        'invalid_historical_rx_expected_inventory_file'
    );
    validateHistoricalRxInventoryContract(expectedInventory);
    const mappingAliases = aliasList(mappings);
    validateHistoricalRxMappingAliases(mappingAliases, expectedInventory);
    const sourceLifecycles = args.sourceLifecycleFile
        ? loadJson(requireFile(args.sourceLifecycleFile, 'historical_rx_lifecycle_file_required'), 'invalid_historical_rx_lifecycle_file')
        : {};
    const beforeSqliteFiles = snapshotSqliteFileSet(stagingDb);
    if (beforeSqliteFiles.journal.exists && beforeSqliteFiles.journal.size > 0) {
        throw new Error('historical_rx_uncheckpointed_sqlite_state');
    }
    const snapshotRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-historical-rx-'));
    fs.chmodSync(snapshotRoot, 0o700);
    const snapshotDb = path.join(snapshotRoot, 'staging.sqlite');
    let records;
    try {
        copySqliteFileSet(stagingDb, snapshotDb, beforeSqliteFiles);
        if (!sqliteFileSetsEqual(beforeSqliteFiles, snapshotSqliteFileSet(snapshotDb))) {
            throw new Error('historical_rx_snapshot_copy_mismatch');
        }
        const vault = new VaultClass({ databasePath: snapshotDb, secret, readonly: true });
        try {
            records = mappingAliases.map(alias => {
                const record = vault.readItemRecordByAlias(alias);
                if (!record) throw new Error(`historical_rx_alias_snapshot_missing:${alias}`);
                return record;
            });
        } finally {
            vault.close();
        }
    } finally {
        fs.rmSync(snapshotRoot, { recursive: true, force: true });
    }
    const observationTimes = [...new Set(records.map(record => record.observed_at))];
    if (observationTimes.length !== 1) throw new Error('historical_rx_mixed_observation_times');
    const report = buildOpenFinanceHistoricalRx({
        items: records.map(record => record.item),
        historyStartDate: args.historyStart,
        observedAt: observationTimes[0],
        secret,
        sourceLifecycles,
        expectedInventory
    });
    const afterSqliteFiles = snapshotSqliteFileSet(stagingDb);
    if (!sqliteFileSetsEqual(beforeSqliteFiles, afterSqliteFiles)) {
        throw new Error('historical_rx_staging_mutated');
    }
    writePrivateJson(output, report);
    const reportHash = sha256(output);
    const outcome = report.ready_for_reconciliation ? 'GO' : 'NO_GO';
    stdout.write(`${JSON.stringify({
        gate: HISTORICAL_RX_GATE,
        outcome,
        history_start_date: report.history_start_date,
        observed_at: report.observed_at,
        sources: records.length,
        segments: report.segments.length,
        inventory_validated: report.inventory_validation?.status === 'validated',
        bank_accounts: report.inventory_validation?.bank_accounts ?? null,
        credit_cards: report.inventory_validation?.credit_cards ?? null,
        investments: report.investments.length,
        ready_for_reconciliation: report.ready_for_reconciliation,
        blockers: report.blockers,
        database_unchanged: true,
        sqlite_files_unchanged: true,
        report_sha256: reportHash,
        financial_writes: 0
    })}\n`);
    return report.ready_for_reconciliation ? 0 : 2;
}

if (require.main === module) {
    try {
        process.exitCode = main();
    } catch (error) {
        process.stderr.write(`${JSON.stringify({
            gate: HISTORICAL_RX_GATE,
            outcome: 'NO_GO',
            reason: error.message,
            financial_writes: 0
        })}\n`);
        process.exitCode = 1;
    }
}

module.exports = { copySqliteFileSet, main };
