'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4318;
const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;
const SAFE_EVENT_NAME = /^codex\.[a-z0-9_.-]{1,120}$/i;
const SAFE_IDENTIFIER = /^[a-zA-Z0-9_.:-]{1,128}$/;
const SAFE_ATTRIBUTE_KEYS = new Set([
    'service.name',
    'service.version',
    'deployment.environment.name',
    'app.version',
    'auth_mode',
    'originator',
    'session_source',
    'model',
    'reasoning_effort',
    'model_reasoning_effort',
    'conversation.id',
    'conversation_id',
    'thread.id',
    'thread_id',
    'turn.id',
    'turn_id',
    'task.id',
    'task_id',
    'event.name',
    'event_name',
    'event.kind',
    'kind',
    'status',
    'success',
    'tool',
    'token_type',
    'tmp_mem_enabled',
    'role',
    'source',
    'type',
    'is_git',
    'approved',
    'duration_ms',
    'attempt',
    'status_code',
    'failure_reason',
    'input_token_count',
    'cached_input_token_count',
    'output_token_count',
    'reasoning_output_token_count',
    'total_token_count',
    'input_tokens',
    'cached_input_tokens',
    'output_tokens',
    'reasoning_output_tokens',
    'total_tokens'
]);

function parseScalar(value) {
    if (!value || typeof value !== 'object') return undefined;
    if (Object.hasOwn(value, 'stringValue')) return String(value.stringValue);
    if (Object.hasOwn(value, 'boolValue')) return Boolean(value.boolValue);
    if (Object.hasOwn(value, 'intValue')) {
        const parsed = Number(value.intValue);
        return Number.isSafeInteger(parsed) ? parsed : undefined;
    }
    if (Object.hasOwn(value, 'doubleValue')) {
        const parsed = Number(value.doubleValue);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

function isSafeAttributeValue(key, value) {
    if (typeof value === 'number' || typeof value === 'boolean') return true;
    if (typeof value !== 'string') return false;
    return SAFE_IDENTIFIER.test(value);
}

function extractSafeAttributes(...attributeLists) {
    const output = {};
    for (const list of attributeLists) {
        if (!Array.isArray(list)) continue;
        for (const attribute of list) {
            const key = typeof attribute?.key === 'string' ? attribute.key : '';
            if (!SAFE_ATTRIBUTE_KEYS.has(key)) continue;
            const value = parseScalar(attribute.value);
            if (!isSafeAttributeValue(key, value)) continue;
            output[key] = value;
        }
    }
    return output;
}

function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.keys(value).sort().map(key => [key, canonicalize(value[key])])
    );
}

function createEventId(record) {
    const identity = { ...record };
    delete identity.event_id;
    delete identity.received_at;
    return crypto
        .createHash('sha256')
        .update(JSON.stringify(canonicalize(identity)))
        .digest('hex');
}

function safeEventName(body, attributes, fallback) {
    const fromAttributes = attributes['event.name'] || attributes.event_name;
    if (typeof fromAttributes === 'string' && SAFE_EVENT_NAME.test(fromAttributes)) {
        return fromAttributes;
    }
    const fromBody = parseScalar(body);
    if (typeof fromBody === 'string' && SAFE_EVENT_NAME.test(fromBody)) return fromBody;
    return fallback;
}

function buildRecord({ kind, eventName, timestamp, attributes, value, objectiveId, receivedAt }) {
    const record = {
        schema_version: 1,
        telemetry_kind: kind,
        event_name: eventName,
        observed_time_unix_nano: timestamp || null,
        objective_id: objectiveId || null,
        attributes: canonicalize(attributes),
        received_at: receivedAt
    };
    if (value !== undefined) record.value = value;
    record.event_id = createEventId(record);
    return record;
}

function extractMetricValue(point) {
    if (Object.hasOwn(point || {}, 'asInt')) {
        const value = Number(point.asInt);
        return Number.isSafeInteger(value) ? value : undefined;
    }
    if (Object.hasOwn(point || {}, 'asDouble')) {
        const value = Number(point.asDouble);
        return Number.isFinite(value) ? value : undefined;
    }
    const summary = {};
    for (const key of ['count', 'sum', 'min', 'max']) {
        if (!Object.hasOwn(point || {}, key)) continue;
        const value = Number(point[key]);
        if (Number.isFinite(value)) summary[key] = value;
    }
    return Object.keys(summary).length ? summary : undefined;
}

function sanitizeLogs(payload, context) {
    const records = [];
    for (const resourceLog of payload?.resourceLogs || []) {
        const resourceAttributes = resourceLog?.resource?.attributes;
        for (const scopeLog of resourceLog?.scopeLogs || []) {
            for (const logRecord of scopeLog?.logRecords || []) {
                const attributes = extractSafeAttributes(resourceAttributes, logRecord.attributes);
                const eventName = safeEventName(logRecord.body, attributes, 'codex.unknown_log');
                records.push(buildRecord({
                    kind: 'logs',
                    eventName,
                    timestamp: logRecord.timeUnixNano || logRecord.observedTimeUnixNano,
                    attributes,
                    objectiveId: context.objectiveId,
                    receivedAt: context.receivedAt
                }));
            }
        }
    }
    return records;
}

function metricDataPoints(metric) {
    for (const type of ['gauge', 'sum', 'histogram', 'exponentialHistogram', 'summary']) {
        if (Array.isArray(metric?.[type]?.dataPoints)) return metric[type].dataPoints;
    }
    return [];
}

function sanitizeMetrics(payload, context) {
    const records = [];
    for (const resourceMetric of payload?.resourceMetrics || []) {
        const resourceAttributes = resourceMetric?.resource?.attributes;
        for (const scopeMetric of resourceMetric?.scopeMetrics || []) {
            for (const metric of scopeMetric?.metrics || []) {
                if (!SAFE_EVENT_NAME.test(metric?.name || '')) continue;
                for (const point of metricDataPoints(metric)) {
                    const attributes = extractSafeAttributes(resourceAttributes, point.attributes);
                    records.push(buildRecord({
                        kind: 'metrics',
                        eventName: metric.name,
                        timestamp: point.timeUnixNano || point.startTimeUnixNano,
                        attributes,
                        value: extractMetricValue(point),
                        objectiveId: context.objectiveId,
                        receivedAt: context.receivedAt
                    }));
                }
            }
        }
    }
    return records;
}

function sanitizeOtlpEnvelope(payload, context) {
    if (!context || !['logs', 'metrics'].includes(context.kind)) return [];
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
    return context.kind === 'logs'
        ? sanitizeLogs(payload, context)
        : sanitizeMetrics(payload, context);
}

function validateObjectiveState(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
        throw new TypeError('objective state invalido');
    }
    const allowedKeys = new Set([
        'objective_id',
        'category',
        'risk',
        'authorized_outcome_scope',
        'status',
        'native_usage_status',
        'started_at',
        'stopped_at'
    ]);
    const sanitized = {};
    for (const [key, value] of Object.entries(state)) {
        if (!allowedKeys.has(key)) continue;
        if (value === null) {
            sanitized[key] = null;
            continue;
        }
        if (typeof value !== 'string' || !SAFE_IDENTIFIER.test(value)) {
            throw new TypeError(`objective state inseguro: ${key}`);
        }
        sanitized[key] = value;
    }
    if (!Object.hasOwn(sanitized, 'objective_id')) {
        throw new TypeError('objective_id ausente');
    }
    return sanitized;
}

function writeObjectiveState(statePath, state) {
    const sanitized = validateObjectiveState(state);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const temporaryPath = `${statePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(sanitized, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600
    });
    fs.renameSync(temporaryPath, statePath);
    return sanitized;
}

function readObjectiveId(statePath) {
    try {
        const state = validateObjectiveState(JSON.parse(fs.readFileSync(statePath, 'utf8')));
        return state.status === 'active' && typeof state.objective_id === 'string'
            ? state.objective_id
            : null;
    } catch {
        return null;
    }
}

function isLoopback(address) {
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function loadKnownEventIds(outputPath) {
    const ids = new Set();
    if (!fs.existsSync(outputPath)) return ids;
    for (const line of fs.readFileSync(outputPath, 'utf8').split(/\r?\n/)) {
        if (!line) continue;
        try {
            const parsed = JSON.parse(line);
            if (/^[a-f0-9]{64}$/.test(parsed.event_id || '')) ids.add(parsed.event_id);
        } catch {
            // An invalid historical line is ignored, never rewritten or trusted.
        }
    }
    return ids;
}

function readJsonBody(request, maxBodyBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let bytes = 0;
        let tooLarge = false;
        request.on('data', chunk => {
            bytes += chunk.length;
            if (bytes > maxBodyBytes) {
                tooLarge = true;
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => {
            if (tooLarge) {
                const error = new Error('payload_too_large');
                error.statusCode = 413;
                reject(error);
                return;
            }
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
                const error = new Error('invalid_json');
                error.statusCode = 400;
                reject(error);
            }
        });
        request.on('error', reject);
    });
}

function createCollector(options = {}) {
    const host = options.host || DEFAULT_HOST;
    if (!isLoopback(host)) throw new Error('collector_host_deve_ser_loopback');
    const port = Number.isInteger(options.port) ? options.port : DEFAULT_PORT;
    const outputPath = path.resolve(options.outputPath);
    const statePath = path.resolve(options.statePath);
    const maxBodyBytes = options.maxBodyBytes || DEFAULT_MAX_BODY_BYTES;
    const knownEventIds = loadKnownEventIds(outputPath);
    let server;

    function persist(records) {
        const newRecords = records.filter(record => {
            if (knownEventIds.has(record.event_id)) return false;
            knownEventIds.add(record.event_id);
            return true;
        });
        if (!newRecords.length) return 0;
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        const content = newRecords.map(record => JSON.stringify(record)).join('\n');
        fs.appendFileSync(outputPath, `${content}\n`, { encoding: 'utf8', mode: 0o600 });
        return newRecords.length;
    }

    async function handler(request, response) {
        if (!isLoopback(request.socket.remoteAddress)) {
            response.writeHead(403).end();
            return;
        }
        if (request.method === 'GET' && request.url === '/health') {
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ ok: true }));
            return;
        }
        const kind = request.url === '/v1/logs'
            ? 'logs'
            : request.url === '/v1/metrics'
                ? 'metrics'
                : null;
        if (request.method !== 'POST' || !kind) {
            response.writeHead(404).end();
            return;
        }
        if (!String(request.headers['content-type'] || '').toLowerCase().includes('application/json')) {
            response.writeHead(415).end();
            return;
        }
        try {
            const payload = await readJsonBody(request, maxBodyBytes);
            const records = sanitizeOtlpEnvelope(payload, {
                kind,
                objectiveId: readObjectiveId(statePath),
                receivedAt: new Date().toISOString()
            });
            persist(records);
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ partialSuccess: {} }));
        } catch (error) {
            response.writeHead(error.statusCode || 500).end();
        }
    }

    return {
        async start() {
            if (server) throw new Error('collector_already_started');
            server = http.createServer((request, response) => {
                handler(request, response).catch(() => response.writeHead(500).end());
            });
            await new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(port, host, resolve);
            });
        },
        address() {
            return server?.address();
        },
        async stop() {
            if (!server) return;
            await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
            server = undefined;
        }
    };
}

module.exports = {
    createCollector,
    createEventId,
    sanitizeOtlpEnvelope,
    writeObjectiveState
};

function parseArguments(argv) {
    const [command = 'help'] = argv;
    const subcommand = argv[1] && !argv[1].startsWith('--') ? argv[1] : undefined;
    const values = {};
    for (let index = subcommand ? 2 : 1; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) continue;
        const key = token.slice(2);
        const next = argv[index + 1];
        if (next && !next.startsWith('--')) {
            values[key] = next;
            index += 1;
        } else {
            values[key] = true;
        }
    }
    return { command, subcommand, values };
}

function localStorageRoot() {
    const base = process.env.LOCALAPPDATA || process.env.TEMP || process.cwd();
    return path.join(base, 'FinancasBot', 'codex-usage-calibration');
}

function assertOutsideRepository(...candidatePaths) {
    const repositoryRoot = path.resolve(__dirname, '..', '..');
    const repositoryPrefix = `${repositoryRoot}${path.sep}`.toLowerCase();
    for (const candidatePath of candidatePaths) {
        const absolute = path.resolve(candidatePath).toLowerCase();
        if (absolute === repositoryRoot.toLowerCase() || absolute.startsWith(repositoryPrefix)) {
            throw new Error('telemetry_storage_deve_ficar_fora_do_repositorio');
        }
    }
}

function objectiveCommand(subcommand, values) {
    const statePath = path.resolve(values.state || path.join(localStorageRoot(), 'active-objective.json'));
    const timestamp = new Date().toISOString();
    if (subcommand === 'start') {
        const state = writeObjectiveState(statePath, {
            objective_id: values['objective-id'],
            category: values.category,
            risk: values.risk,
            authorized_outcome_scope: values['authorized-outcome-scope'],
            status: 'active',
            native_usage_status: 'PENDING_OTEL_OBSERVATION',
            started_at: timestamp
        });
        process.stdout.write(`${JSON.stringify({ ok: true, state })}\n`);
        return;
    }
    if (subcommand === 'stop') {
        const state = writeObjectiveState(statePath, {
            objective_id: null,
            status: 'stopped',
            native_usage_status: values['native-usage-status'] || 'PENDING_OTEL_OBSERVATION',
            stopped_at: timestamp
        });
        process.stdout.write(`${JSON.stringify({ ok: true, state })}\n`);
        return;
    }
    throw new Error('objective subcommand deve ser start ou stop');
}

function summarize(outputPath) {
    const summary = { events: 0, attributed: 0, unattributed: 0, by_objective: {} };
    if (!fs.existsSync(outputPath)) return summary;
    for (const line of fs.readFileSync(outputPath, 'utf8').split(/\r?\n/)) {
        if (!line) continue;
        let record;
        try {
            record = JSON.parse(line);
        } catch {
            continue;
        }
        summary.events += 1;
        if (!record.objective_id) {
            summary.unattributed += 1;
            continue;
        }
        summary.attributed += 1;
        const objective = summary.by_objective[record.objective_id] ||= {
            events: 0,
            logs: 0,
            metrics: 0,
            token_metrics: 0,
            tool_events: 0
        };
        objective.events += 1;
        objective[record.telemetry_kind] = (objective[record.telemetry_kind] || 0) + 1;
        if (/token_usage|token_count/i.test(record.event_name)) objective.token_metrics += 1;
        if (/tool/i.test(record.event_name)) objective.tool_events += 1;
    }
    return summary;
}

async function runCli() {
    const { command, subcommand, values } = parseArguments(process.argv.slice(2));
    const root = localStorageRoot();
    const outputPath = path.resolve(values.output || path.join(root, 'events.jsonl'));
    const statePath = path.resolve(values.state || path.join(root, 'active-objective.json'));
    assertOutsideRepository(outputPath, statePath);
    if (command === 'objective') {
        objectiveCommand(subcommand, values);
        return;
    }
    if (command === 'summary') {
        process.stdout.write(`${JSON.stringify(summarize(outputPath), null, 2)}\n`);
        return;
    }
    if (command !== 'serve') {
        throw new Error('uso: serve | objective start|stop | summary');
    }
    const collector = createCollector({
        host: values.host || DEFAULT_HOST,
        port: values.port ? Number(values.port) : DEFAULT_PORT,
        outputPath,
        statePath,
        maxBodyBytes: values['max-body-bytes']
            ? Number(values['max-body-bytes'])
            : DEFAULT_MAX_BODY_BYTES
    });
    await collector.start();
    if (values['pid-file']) {
        fs.mkdirSync(path.dirname(path.resolve(values['pid-file'])), { recursive: true });
        fs.writeFileSync(path.resolve(values['pid-file']), `${process.pid}\n`, { mode: 0o600 });
    }
    process.stdout.write(`${JSON.stringify({
        ok: true,
        host: values.host || DEFAULT_HOST,
        port: values.port ? Number(values.port) : DEFAULT_PORT,
        output_path: outputPath,
        state_path: statePath
    })}\n`);
    const shutdown = async () => {
        await collector.stop();
        process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
}

if (require.main === module) {
    runCli().catch(error => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    });
}
