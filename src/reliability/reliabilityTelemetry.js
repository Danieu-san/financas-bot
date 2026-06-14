const fs = require('node:fs');
const path = require('node:path');
const { sanitizeReliabilityTelemetry } = require('./interpretationReliability');

const DEFAULT_TELEMETRY_PATH = path.resolve(process.cwd(), 'data', 'interpretation-reliability-shadow.jsonl');
const VALID_MODES = new Set(['shadow', 'enforce']);

function getReliabilityMode(env = process.env) {
    const mode = String(env.INTERPRETATION_RELIABILITY_MODE || 'off').toLowerCase();
    return VALID_MODES.has(mode) ? mode : 'off';
}

function parseOperationAllowlist(env = process.env) {
    const raw = String(env.INTERPRETATION_RELIABILITY_OPERATIONS || '').trim();
    if (!raw) return null;
    return new Set(raw.split(',').map(item => item.trim()).filter(Boolean));
}

function operationIsAllowed(operation, env = process.env, { requireExplicitAllowlist = false } = {}) {
    const allowlist = parseOperationAllowlist(env);
    if (!allowlist) return !requireExplicitAllowlist;
    return allowlist.has(operation);
}

function recordInterpretationReliabilityShadow(input = {}, options = {}) {
    const env = options.env || process.env;
    const mode = getReliabilityMode(env);
    const operation = input.candidate?.operation || '';

    if (mode === 'off') {
        return { recorded: false, reason: 'disabled' };
    }

    if (!operationIsAllowed(operation, env)) {
        return { recorded: false, reason: 'operation_not_allowlisted' };
    }

    const telemetryPath = options.telemetryPath || env.INTERPRETATION_RELIABILITY_TELEMETRY_PATH || DEFAULT_TELEMETRY_PATH;
    const telemetry = {
        ...sanitizeReliabilityTelemetry(input),
        mode
    };

    fs.mkdirSync(path.dirname(telemetryPath), { recursive: true });
    fs.appendFileSync(telemetryPath, `${JSON.stringify(telemetry)}\n`, 'utf8');
    return { recorded: true, path: telemetryPath };
}

module.exports = {
    getReliabilityMode,
    operationIsAllowed,
    recordInterpretationReliabilityShadow,
    __test__: {
        getReliabilityMode,
        operationIsAllowed,
        parseOperationAllowlist
    }
};
