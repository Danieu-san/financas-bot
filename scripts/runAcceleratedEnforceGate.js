require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

const { runInterpretationReliabilityAcceptance } = require('../src/reliability/interpretationReliabilityAcceptance');
const { buildEnforceReadinessReport, DEFAULT_TELEMETRY_PATH } = require('../src/reliability/enforceReadinessMonitor');
const { buildAcceleratedEnforceGateReport } = require('../src/reliability/acceleratedEnforceGate');
const messageHandler = require('../src/handlers/messageHandler');

function hasArg(name) {
    return process.argv.includes(name);
}

function readOption(name, fallback = '') {
    const index = process.argv.indexOf(name);
    if (index === -1 || index + 1 >= process.argv.length) return fallback;
    return process.argv[index + 1];
}

function buildReport() {
    const acceptanceReport = runInterpretationReliabilityAcceptance({
        securityDetector: messageHandler.__test__.detectSecuritySensitiveRequest
    });
    const readinessReport = buildEnforceReadinessReport({
        telemetryPath: readOption('--path', process.env.INTERPRETATION_RELIABILITY_TELEMETRY_PATH || DEFAULT_TELEMETRY_PATH),
        since: readOption('--since', process.env.INTERPRETATION_RELIABILITY_READINESS_SINCE || '')
    });

    return buildAcceleratedEnforceGateReport({
        acceptanceReport,
        readinessReport,
        e2eVerified: hasArg('--e2e-verified'),
        rollbackVerified: hasArg('--rollback-verified'),
        logsVerified: hasArg('--logs-verified')
    });
}

function printHumanReport(report) {
    const status = report.readyForAltissimaAudit
        ? 'READY_FOR_ALTISSIMA_AUDIT'
        : 'KEEP_SHADOW';
    console.log(`Accelerated enforce gate: ${status}`);
    console.log(`Recommendation: ${report.recommendedNextStep}`);
    console.log(`Offline: ${report.offline.matched}/${report.offline.total} matched`);
    console.log(`Target expense cases: ${report.offline.targetOperations['expense.create']?.matched || 0}/${report.offline.targetOperations['expense.create']?.total || 0}`);
    console.log(`Target income cases: ${report.offline.targetOperations['income.create']?.matched || 0}/${report.offline.targetOperations['income.create']?.total || 0}`);
    console.log(`Adversarial blocks: ${report.offline.adversarial.blocked}/${report.offline.adversarial.total}`);
    console.log(`Shadow cutoff: ${report.shadow.telemetrySince || '(not configured)'}`);
    console.log(`Shadow critical divergences: ${report.shadow.criticalDivergences}`);
    console.log(`Real E2E verified: ${report.gates.e2eVerified}`);
    console.log(`Rollback verified: ${report.gates.rollbackVerified}`);
    console.log(`Logs verified: ${report.gates.logsVerified}`);
    if (report.blockers.length) {
        console.log(`Blockers: ${report.blockers.join(', ')}`);
    }
}

function writeReport(report) {
    const outPath = readOption('--out', '');
    if (!outPath) return '';
    const resolved = path.resolve(process.cwd(), outPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`);
    return resolved;
}

function main() {
    const report = buildReport();
    const written = writeReport(report);
    if (hasArg('--json')) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        printHumanReport(report);
        if (written) console.log(`Report written: ${written}`);
    }
    if (hasArg('--require-ready') && !report.readyForAltissimaAudit) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    buildReport,
    printHumanReport
};
