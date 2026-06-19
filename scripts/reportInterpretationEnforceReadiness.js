const {
    buildEnforceReadinessReport,
    DEFAULT_TELEMETRY_PATH
} = require('../src/reliability/enforceReadinessMonitor');

function hasArg(name) {
    return process.argv.includes(name);
}

function readOption(name, fallback = '') {
    const index = process.argv.indexOf(name);
    if (index === -1 || index + 1 >= process.argv.length) return fallback;
    return process.argv[index + 1];
}

function buildReport() {
    return buildEnforceReadinessReport({
        telemetryPath: readOption('--path', process.env.INTERPRETATION_RELIABILITY_TELEMETRY_PATH || DEFAULT_TELEMETRY_PATH),
        since: readOption('--since', process.env.INTERPRETATION_RELIABILITY_READINESS_SINCE || '')
    });
}

function printHumanReport(report) {
    const status = report.readyForManualReview
        ? 'READY_FOR_MANUAL_REVIEW'
        : 'KEEP_SHADOW';

    console.log(`Interpretation reliability enforce readiness: ${status}`);
    console.log(`Telemetry: ${report.telemetryPath}`);
    if (report.telemetrySince) {
        console.log(`Evaluating since: ${report.telemetrySince} (${report.ignoredEntriesBeforeSince} older shadow decision(s) kept in telemetry but excluded from readiness gate)`);
    }
    console.log(`Shadow decisions: ${report.shadowEntries}/${report.thresholds.minDecisions}`);
    console.log(`Observation window: ${report.observationWindowDays}/${report.thresholds.minObservationDays} day(s)`);
    console.log(`Critical divergences: ${report.criticalDivergences}`);
    console.log(`Recommendation: ${report.recommendedMode}`);

    if (report.blockers.length) {
        console.log(`Blockers: ${report.blockers.join(', ')}`);
    }
    if (report.warnings.length) {
        console.log(`Warnings: ${report.warnings.join(', ')}`);
    }

    console.log('By operation:');
    for (const [operation, count] of Object.entries(report.byOperation)) {
        console.log(`- ${operation}: ${count}`);
    }
}

if (require.main === module) {
    const report = buildReport();
    if (hasArg('--json')) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        printHumanReport(report);
    }
}

module.exports = {
    buildReport,
    printHumanReport
};
