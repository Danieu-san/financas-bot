require('dotenv').config();

const { getFilePath } = require('../src/telemetry/legacyUsageTelemetry');
const {
    loadDashboardTelemetryEntries,
    summarizeDashboardAdoptionEntries
} = require('../src/telemetry/dashboardAdoptionReport');

function readArg(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] || '' : '';
}

function main() {
    const filePath = getFilePath();
    const loaded = loadDashboardTelemetryEntries(filePath, {
        maxBackups: Number.parseInt(process.env.LEGACY_USAGE_TELEMETRY_MAX_BACKUPS || '4', 10)
    });
    const report = summarizeDashboardAdoptionEntries(loaded.entries, {
        since: readArg('--since')
    });
    report.instrumentation.invalid_lines = loaded.invalidLines;
    report.instrumentation.files_read = loaded.filesRead;
    if (loaded.invalidLines > 0) report.verdict = 'NO_GO_INSTRUMENTATION';
    console.log(JSON.stringify(report, null, 2));
    if (report.verdict === 'NO_GO_INSTRUMENTATION') process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { main, readArg };
