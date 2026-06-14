const { runInterpretationReliabilityAcceptance } = require('../src/reliability/interpretationReliabilityAcceptance');
const messageHandler = require('../src/handlers/messageHandler');

function main() {
    const report = runInterpretationReliabilityAcceptance({
        securityDetector: messageHandler.__test__.detectSecuritySensitiveRequest
    });

    console.log(JSON.stringify(report, null, 2));
    if (report.mismatches.length > 0) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };
