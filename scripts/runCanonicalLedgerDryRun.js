const fs = require('node:fs');
const path = require('node:path');

const {
    buildCanonicalLedgerParityReport
} = require('../src/ledger/canonicalLedgerParityReport');
const {
    projectLegacyRowsToCanonicalLedger,
    buildCanonicalPublicProjection
} = require('../src/ledger/canonicalLedgerProjector');
const {
    CanonicalLedgerShadowStore
} = require('../src/ledger/canonicalLedgerShadowStore');

const DEFAULT_FIXTURE_PATH = path.resolve(__dirname, '..', 'tests', 'fixtures', 'ledger', 'canonical-ledger-phase1.json');

function buildRunId(date = new Date()) {
    return `LEDGER_DRY_RUN_${date.toISOString().replace(/\D/g, '').slice(0, 14)}`;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function runCanonicalLedgerDryRun(options = {}) {
    const startedAt = options.startedAt || new Date().toISOString();
    const runId = options.runId || buildRunId(new Date(startedAt));
    const fixturePath = path.resolve(options.fixturePath || DEFAULT_FIXTURE_PATH);
    const reportDir = path.resolve(options.reportDir || path.join('data', 'qa-runs', runId));
    const fixture = readJson(fixturePath);
    const report = buildCanonicalLedgerParityReport(fixture, {
        runId,
        startedAt,
        finishedAt: options.finishedAt
    });
    const projected = projectLegacyRowsToCanonicalLedger(fixture);
    const publicProjection = buildCanonicalPublicProjection(projected, fixture);
    const reportPath = path.join(reportDir, 'canonical-ledger-dry-run-report.json');
    const publicProjectionPath = path.join(reportDir, 'canonical-ledger-public-projection.json');
    let shadowDbPath = null;
    let shadowReceipt = null;

    writeJson(reportPath, report);
    writeJson(publicProjectionPath, publicProjection);

    if (options.writeShadow) {
        const shadowStore = new CanonicalLedgerShadowStore({
            dbPath: options.shadowDbPath,
            writesEnabled: true
        });
        try {
            shadowReceipt = shadowStore.persistProjection({
                runId,
                projected,
                publicProjection,
                report
            });
            shadowDbPath = shadowStore.dbPath;
        } finally {
            shadowStore.close();
        }
    }

    return {
        report,
        reportDir,
        reportPath,
        publicProjectionPath,
        shadowDbPath,
        shadowReceipt
    };
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
    const result = runCanonicalLedgerDryRun({
        fixturePath: argValue('--fixture'),
        reportDir: argValue('--report-dir'),
        runId: argValue('--run-id'),
        shadowDbPath: argValue('--shadow-db'),
        writeShadow: argFlag('--write-shadow')
    });
    console.log(`[canonical-ledger-dry-run] report=${result.reportPath}`);
    console.log(`[canonical-ledger-dry-run] public_projection=${result.publicProjectionPath}`);
    if (result.shadowDbPath) {
        console.log(`[canonical-ledger-dry-run] shadow_db=${result.shadowDbPath}`);
    }
    console.log(`[canonical-ledger-dry-run] events=${result.report.canonical_counts.events} differences=${result.report.unexplained_differences.length} privacy_ok=${result.report.privacy_scan.ok}`);
    if (result.report.unexplained_differences.length > 0 || !result.report.privacy_scan.ok) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

module.exports = {
    DEFAULT_FIXTURE_PATH,
    buildRunId,
    runCanonicalLedgerDryRun
};
