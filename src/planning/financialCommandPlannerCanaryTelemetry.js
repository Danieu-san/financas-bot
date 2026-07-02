const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_TELEMETRY_PATH = path.resolve(process.cwd(), 'data', 'financial-command-planner-canary.jsonl');
const VALID_STAGES = new Set(['route', 'confirmation', 'completion']);
const VALID_CONFIRMATIONS = new Set(['none', 'pending', 'confirmed', 'cancelled']);
const VALID_SEVERITIES = new Set(['none', 'warning', 'critical']);
const VALID_OPERATIONS = new Set([
    'expense.create',
    'income.create',
    'bill.pay',
    'debt.pay',
    'invoice.pay',
    'transfer.create',
    'financial.query',
    'goal.create',
    'debt.create',
    'reminder.create',
    'delete.request',
    'help',
    'unknown'
]);

function recordFinancialCommandPlannerCanary(input = {}, options = {}) {
    const env = options.env || process.env;
    const telemetryPath = options.telemetryPath || env.FINANCIAL_COMMAND_PLANNER_CANARY_TELEMETRY_PATH || DEFAULT_TELEMETRY_PATH;
    const telemetry = sanitizeFinancialCommandPlannerCanaryRecord(input, options);
    fs.mkdirSync(path.dirname(telemetryPath), { recursive: true });
    fs.appendFileSync(telemetryPath, `${JSON.stringify(telemetry)}\n`, 'utf8');
    return { recorded: true, path: telemetryPath, telemetry };
}

function sanitizeFinancialCommandPlannerCanaryRecord(input = {}, options = {}) {
    const now = options.now || (() => new Date());
    const operation = sanitizeOperation(input.operation);
    const stage = sanitizeEnum(input.stage, VALID_STAGES, 'route');
    const confirmation = sanitizeEnum(input.confirmation, VALID_CONFIRMATIONS, 'none');
    const severity = sanitizeEnum(input.severity, VALID_SEVERITIES, 'none');
    return {
        ts: now().toISOString(),
        schemaVersion: 'financial-command-planner-canary-v1',
        mode: sanitizeLabel(input.mode || 'canary', 'canary'),
        operation,
        stage,
        outcome: sanitizeLabel(input.outcome || stage, 'unknown'),
        confirmation,
        severity,
        plannerOk: input.plannerOk === undefined ? null : Boolean(input.plannerOk),
        requiresConfirmation: input.requiresConfirmation === undefined ? null : Boolean(input.requiresConfirmation),
        missingFields: sanitizeStringList(input.missingFields),
        contextTools: sanitizeStringList(input.contextTools),
        routeOperations: sanitizeStringList(input.routeOperations),
        plannerLatencyMs: normalizeLatency(input.plannerLatencyMs),
        handlerLatencyMs: normalizeLatency(input.handlerLatencyMs),
        senderFingerprint: fingerprint(input.senderId),
        userFingerprint: fingerprint(input.userId),
        messageFingerprint: fingerprint(input.message),
        operationKeyFingerprint: fingerprint(input.operationKey)
    };
}

function summarizeFinancialCommandPlannerCanaryTelemetry({ telemetryPath = DEFAULT_TELEMETRY_PATH, since } = {}) {
    const summary = {
        telemetryPath,
        total: 0,
        invalid: 0,
        first: null,
        last: null,
        byOperation: {},
        byStage: {},
        byConfirmation: {},
        bySeverity: {},
        byOutcome: {}
    };
    if (!fs.existsSync(telemetryPath)) return summary;
    const sinceMs = since ? Date.parse(since) : null;
    for (const line of fs.readFileSync(telemetryPath, 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        let entry;
        try {
            entry = JSON.parse(line);
        } catch (_error) {
            summary.invalid += 1;
            continue;
        }
        const ts = entry.ts || entry.timestamp || '';
        if (sinceMs && (!ts || Date.parse(ts) < sinceMs)) continue;
        summary.total += 1;
        if (ts && (!summary.first || ts < summary.first)) summary.first = ts;
        if (ts && (!summary.last || ts > summary.last)) summary.last = ts;
        increment(summary.byOperation, entry.operation || 'unknown');
        increment(summary.byStage, entry.stage || 'unknown');
        increment(summary.byConfirmation, entry.confirmation || 'unknown');
        increment(summary.bySeverity, entry.severity || 'none');
        increment(summary.byOutcome, entry.outcome || 'unknown');
    }
    return summary;
}

function sanitizeOperation(value) {
    const operation = sanitizeLabel(value || 'unknown', 'unknown');
    return VALID_OPERATIONS.has(operation) ? operation : 'unknown';
}

function sanitizeEnum(value, allowed, fallback) {
    const normalized = sanitizeLabel(value || fallback, fallback);
    return allowed.has(normalized) ? normalized : fallback;
}

function sanitizeStringList(values) {
    if (!Array.isArray(values)) return [];
    return values
        .map(value => sanitizeLabel(value, ''))
        .filter(Boolean)
        .slice(0, 10);
}

function sanitizeLabel(value, fallback) {
    const cleaned = String(value || '')
        .replace(/[^a-zA-Z0-9_.-]/g, '')
        .slice(0, 80);
    return cleaned || fallback;
}

function normalizeLatency(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function increment(target, key) {
    target[key] = (target[key] || 0) + 1;
}

function fingerprint(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

module.exports = {
    DEFAULT_TELEMETRY_PATH,
    recordFinancialCommandPlannerCanary,
    sanitizeFinancialCommandPlannerCanaryRecord,
    summarizeFinancialCommandPlannerCanaryTelemetry,
    __test__: {
        fingerprint,
        sanitizeLabel
    }
};
