'use strict';

require('dotenv').config();

const {
    DEFAULT_TELEMETRY_PATH,
    summarizeFinancialIterativeCanaryTelemetry
} = require('../src/agent/financialIterativeCanaryTelemetry');

function readArgument(name) {
    const prefix = `--${name}=`;
    const value = process.argv.slice(2).find(argument => argument.startsWith(prefix));
    return value ? value.slice(prefix.length) : '';
}

const telemetryPath = process.env.FINANCIAL_ITERATIVE_CANARY_TELEMETRY_PATH ||
    DEFAULT_TELEMETRY_PATH;
const summary = summarizeFinancialIterativeCanaryTelemetry({
    telemetryPath,
    since: readArgument('since') || undefined
});

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
