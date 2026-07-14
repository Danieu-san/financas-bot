const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const logger = require('../utils/logger');

const DEFAULT_FILE_PATH = path.resolve(process.cwd(), 'data', 'legacy-usage-telemetry.jsonl');
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_BACKUPS = 4;

const ALLOWED = Object.freeze({
    event: new Set(['usage', 'heartbeat']),
    surface: new Set([
        'telemetry', 'analytics', 'read_model', 'canonical_ledger', 'dashboard',
        'cards', 'phase6', 'projected_plans', 'scheduler'
    ]),
    consumer: new Set([
        'scheduler', 'read_model_service', 'canonical_canary_router',
        'financial_agent', 'message_handler', 'query_engine', 'dashboard_v1',
        'dashboard_v2', 'phase6_handler', 'projected_plan_runtime'
    ]),
    handler: new Set([
        'operational_heartbeat', 'read_model_service', 'canonical_canary_router',
        'financial_agent', 'message_handler', 'dashboard_server', 'phase6_handler',
        'projected_plan_runtime'
    ]),
    route: new Set([
        'operational_heartbeat', 'analytical_intent', 'financial_query_plan',
        'canonical_canary_read', 'dashboard_api_v1', 'dashboard_api_v2',
        'card_sheet_access', 'phase6_command', 'projected_plan_access'
    ]),
    domain: new Set([
        'none', 'analytics', 'transactions', 'transfers', 'accounts', 'forecast',
        'bills', 'debts', 'goals', 'cards', 'budget', 'income', 'expenses'
    ]),
    operation: new Set(['heartbeat', 'read', 'fallback', 'answer', 'query', 'route', 'write']),
    source: new Set([
        'none', 'runtime', 'canonical', 'sqlite', 'memory_fallback', 'sheets',
        'legacy', 'financial_agent', 'query_engine'
    ]),
    mode: new Set(['off', 'shadow', 'canary', 'answer', 'enforce']),
    result: new Set(['success', 'partial', 'unavailable', 'blocked', 'error']),
    reasonCode: new Set([
        'none', 'self_check', 'sqlite_miss', 'canonical_empty',
        'canonical_read_failed', 'canonical_no_matching_rows',
        'canonical_partial_window', 'canary_domain_disabled',
        'canonical_transactions_unavailable', 'canonical_budget_tables_unavailable',
        'canonical_household_ambiguous', 'canonical_household_unavailable',
        'canonical_budget_read_failed', 'canonical_accounts_opening_balances_unavailable',
        'canonical_forecast_unavailable', 'missing_authorized_scope',
        'source_unavailable', 'not_applicable', 'engine_gap', 'unsafe_request',
        'ambiguous_period', 'ambiguous_scope', 'unsupported_filter', 'response_gap',
        'agent_disabled', 'agent_error', 'answer_not_selected',
        'canary_user_not_allowed', 'personal_sheet_source'
    ]),
    writeResult: new Set(['not_attempted', 'success', 'blocked', 'error'])
});

let writeQueue = Promise.resolve();

function allowlisted(value, allowed, fallback = 'unknown') {
    const normalized = String(value || '').trim().toLowerCase();
    return allowed.has(normalized) ? normalized : fallback;
}

function isEnabled(env = process.env) {
    return String(env.LEGACY_USAGE_TELEMETRY_ENABLED || '').trim().toLowerCase() === 'true';
}

function getFilePath(env = process.env) {
    return env.LEGACY_USAGE_TELEMETRY_PATH || DEFAULT_FILE_PATH;
}

function boundedInteger(value, fallback, { min, max }) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function getMaxBytes(env = process.env, override) {
    return boundedInteger(
        override ?? env.LEGACY_USAGE_TELEMETRY_MAX_BYTES,
        DEFAULT_MAX_BYTES,
        { min: 256, max: 100 * 1024 * 1024 }
    );
}

function getMaxBackups(env = process.env, override) {
    return boundedInteger(
        override ?? env.LEGACY_USAGE_TELEMETRY_MAX_BACKUPS,
        DEFAULT_MAX_BACKUPS,
        { min: 1, max: 20 }
    );
}

function normalizeCommit(value) {
    const commit = String(value || '').trim().toLowerCase();
    return /^[a-f0-9]{7,40}$/.test(commit) ? commit : 'unknown';
}

function normalizeEventId(value) {
    const eventId = String(value || '').trim().toLowerCase();
    return /^[a-z0-9-]{8,64}$/.test(eventId) ? eventId : crypto.randomUUID();
}

function latencyBucket(value) {
    const durationMs = Number(value);
    if (!Number.isFinite(durationMs) || durationMs < 0) return 'unknown';
    if (durationMs < 25) return 'lt_25ms';
    if (durationMs < 100) return '25_99ms';
    if (durationMs < 500) return '100_499ms';
    if (durationMs < 2000) return '500_1999ms';
    return 'gte_2000ms';
}

function hmacRef(value, kind, rotationDay, env = process.env) {
    const raw = String(value || '').trim();
    const secret = String(env.LEGACY_USAGE_TELEMETRY_HMAC_SECRET || '');
    if (!raw || secret.length < 16) return '';
    return crypto
        .createHmac('sha256', secret)
        .update(`${kind}:${rotationDay}:${raw}`)
        .digest('hex')
        .slice(0, 16);
}

function buildLegacyUsageEntry(input = {}, options = {}) {
    const env = options.env || process.env;
    const now = options.now instanceof Date ? options.now : new Date();
    const loggedAt = now.toISOString();
    const rotationDay = loggedAt.slice(0, 10);
    return {
        schema_version: 1,
        event_id: normalizeEventId(options.eventId),
        logged_at: loggedAt,
        rotation_day: rotationDay,
        app_commit: normalizeCommit(env.APP_COMMIT_SHA || env.GIT_COMMIT_SHA),
        event: allowlisted(input.event, ALLOWED.event),
        surface: allowlisted(input.surface, ALLOWED.surface),
        consumer: allowlisted(input.consumer, ALLOWED.consumer),
        handler: allowlisted(input.handler, ALLOWED.handler),
        route: allowlisted(input.route, ALLOWED.route),
        domain: allowlisted(input.domain, ALLOWED.domain),
        operation: allowlisted(input.operation, ALLOWED.operation),
        source: allowlisted(input.source, ALLOWED.source),
        fallback_from: allowlisted(input.fallbackFrom, ALLOWED.source, 'none'),
        fallback_to: allowlisted(input.fallbackTo, ALLOWED.source, 'none'),
        mode: allowlisted(input.mode, ALLOWED.mode),
        result: allowlisted(input.result, ALLOWED.result),
        reason_code: allowlisted(input.reasonCode, ALLOWED.reasonCode),
        latency_bucket: latencyBucket(input.latencyMs),
        write_attempted: Boolean(input.writeAttempted),
        write_result: allowlisted(input.writeResult, ALLOWED.writeResult, 'not_attempted'),
        actor_ref: hmacRef(input.actorId, 'actor', rotationDay, env),
        session_ref: hmacRef(input.sessionId, 'session', rotationDay, env)
    };
}

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch (_) {
        return false;
    }
}

async function rotateIfNeeded(filePath, incomingBytes, maxBytes, maxBackups) {
    let currentSize = 0;
    try {
        currentSize = (await fs.stat(filePath)).size;
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    if (currentSize === 0 || currentSize + incomingBytes <= maxBytes) return;

    await fs.rm(`${filePath}.${maxBackups}`, { force: true });
    for (let index = maxBackups - 1; index >= 1; index -= 1) {
        const source = `${filePath}.${index}`;
        const destination = `${filePath}.${index + 1}`;
        if (await fileExists(source)) {
            await fs.rm(destination, { force: true });
            await fs.rename(source, destination);
        }
    }
    await fs.rename(filePath, `${filePath}.1`);
}

async function appendDurably(filePath, line, options = {}) {
    const env = options.env || process.env;
    const maxBytes = getMaxBytes(env, options.maxBytes);
    const maxBackups = getMaxBackups(env, options.maxBackups);
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    await rotateIfNeeded(filePath, Buffer.byteLength(line), maxBytes, maxBackups);

    const handle = await fs.open(filePath, 'a', 0o600);
    try {
        await handle.writeFile(line, 'utf8');
        if (options.sync === true) await handle.sync();
    } finally {
        await handle.close();
    }
    await fs.chmod(filePath, 0o600).catch(() => {});
}

async function recordLegacyUsageEvent(input = {}, options = {}) {
    const env = options.env || process.env;
    if (!isEnabled(env)) return { recorded: false, reason: 'disabled' };

    const entry = buildLegacyUsageEntry(input, options);
    const filePath = getFilePath(env);
    const line = `${JSON.stringify(entry)}\n`;
    const task = writeQueue.then(() => appendDurably(filePath, line, options));
    writeQueue = task.catch(() => {});

    try {
        await task;
        return { recorded: true, entry };
    } catch (error) {
        logger.warn(`legacy-usage-telemetry: write_failed code=${error?.code || 'unknown'}`);
        return { recorded: false, reason: 'write_failed' };
    }
}

function recordLegacyUsageHeartbeat(options = {}) {
    return recordLegacyUsageEvent({
        event: 'heartbeat',
        surface: 'telemetry',
        consumer: 'scheduler',
        handler: 'operational_heartbeat',
        route: 'operational_heartbeat',
        domain: 'none',
        operation: 'heartbeat',
        source: 'runtime',
        mode: 'shadow',
        result: 'success',
        reasonCode: 'self_check',
        writeAttempted: false,
        writeResult: 'not_attempted'
    }, { ...options, sync: true });
}

module.exports = {
    buildLegacyUsageEntry,
    recordLegacyUsageEvent,
    recordLegacyUsageHeartbeat,
    isEnabled,
    getFilePath,
    __test__: {
        latencyBucket,
        hmacRef,
        rotateIfNeeded,
        getMaxBytes,
        getMaxBackups
    }
};
