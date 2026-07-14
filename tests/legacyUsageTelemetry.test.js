const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
    buildLegacyUsageEntry,
    recordLegacyUsageEvent,
    recordLegacyUsageHeartbeat
} = require('../src/telemetry/legacyUsageTelemetry');

function testEnv(filePath, overrides = {}) {
    return {
        LEGACY_USAGE_TELEMETRY_ENABLED: 'true',
        LEGACY_USAGE_TELEMETRY_PATH: filePath,
        LEGACY_USAGE_TELEMETRY_HMAC_SECRET: 'test-only-hmac-secret-with-enough-entropy',
        APP_COMMIT_SHA: 'd6af26042c5b90c9f6c9f5c17df8bbc89236d4c0',
        ...overrides
    };
}

async function makeTempDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'legacy-usage-telemetry-'));
}

test('legacy usage telemetry builds a fixed allowlisted schema and drops arbitrary input', () => {
    const entry = buildLegacyUsageEntry({
        event: 'usage',
        surface: 'analytics',
        consumer: 'read_model_service',
        handler: 'read_model_service',
        route: 'analytical_intent',
        domain: 'cards',
        operation: 'fallback',
        source: 'memory_fallback',
        fallbackFrom: 'sqlite',
        fallbackTo: 'memory_fallback',
        mode: 'answer',
        result: 'success',
        reasonCode: 'sqlite_miss',
        latencyMs: 18,
        writeAttempted: false,
        writeResult: 'not_attempted',
        actorId: '5511999999999@c.us',
        sessionId: 'raw-session-id',
        message: 'paguei R$ 123,45 no cartao',
        metadata: { spreadsheetId: 'raw-sheet-id', token: 'raw-token' },
        value: 123.45
    }, {
        env: testEnv('unused.jsonl'),
        now: new Date('2026-07-14T12:00:00.000Z'),
        eventId: 'fixed-event-id'
    });

    assert.deepStrictEqual(Object.keys(entry), [
        'schema_version', 'event_id', 'logged_at', 'rotation_day', 'app_commit',
        'event', 'surface', 'consumer', 'handler', 'route', 'domain', 'operation',
        'source', 'fallback_from', 'fallback_to', 'mode', 'result', 'reason_code',
        'latency_bucket', 'write_attempted', 'write_result', 'actor_ref', 'session_ref'
    ]);
    assert.strictEqual(entry.schema_version, 1);
    assert.strictEqual(entry.event_id, 'fixed-event-id');
    assert.strictEqual(entry.domain, 'cards');
    assert.strictEqual(entry.latency_bucket, 'lt_25ms');
    assert.match(entry.actor_ref, /^[a-f0-9]{16}$/);
    assert.match(entry.session_ref, /^[a-f0-9]{16}$/);
    const serialized = JSON.stringify(entry);
    for (const forbidden of ['5511999999999', 'raw-session-id', '123,45', 'raw-sheet-id', 'raw-token']) {
        assert.ok(!serialized.includes(forbidden), `forbidden value leaked: ${forbidden}`);
    }

    const rejected = buildLegacyUsageEntry({
        event: 'mensagem do usuario',
        surface: 'segredo',
        reasonCode: 'telefone 5511999999999'
    }, { env: testEnv('unused.jsonl'), now: new Date('2026-07-14T12:00:00.000Z') });
    assert.strictEqual(rejected.event, 'unknown');
    assert.strictEqual(rejected.surface, 'unknown');
    assert.strictEqual(rejected.reason_code, 'unknown');
});

test('legacy usage telemetry rotates actor references by UTC day using HMAC', () => {
    const input = { actorId: 'same-actor', sessionId: 'same-session' };
    const dayOne = buildLegacyUsageEntry(input, {
        env: testEnv('unused.jsonl'),
        now: new Date('2026-07-14T23:59:59.000Z')
    });
    const dayTwo = buildLegacyUsageEntry(input, {
        env: testEnv('unused.jsonl'),
        now: new Date('2026-07-15T00:00:01.000Z')
    });
    assert.notStrictEqual(dayOne.actor_ref, dayTwo.actor_ref);
    assert.notStrictEqual(dayOne.session_ref, dayTwo.session_ref);

    const withoutSecret = buildLegacyUsageEntry(input, {
        env: testEnv('unused.jsonl', { LEGACY_USAGE_TELEMETRY_HMAC_SECRET: '' }),
        now: new Date('2026-07-14T12:00:00.000Z')
    });
    assert.strictEqual(withoutSecret.actor_ref, '');
    assert.strictEqual(withoutSecret.session_ref, '');
});

test('legacy usage telemetry is opt-in and does not create a file while disabled', async () => {
    const tempDir = await makeTempDir();
    const filePath = path.join(tempDir, 'events.jsonl');
    const result = await recordLegacyUsageEvent({ event: 'usage' }, {
        env: testEnv(filePath, { LEGACY_USAGE_TELEMETRY_ENABLED: 'false' })
    });
    assert.deepStrictEqual(result, { recorded: false, reason: 'disabled' });
    await assert.rejects(fs.access(filePath));
});

test('legacy usage telemetry persists append-only events and heartbeat across calls', async () => {
    const tempDir = await makeTempDir();
    const filePath = path.join(tempDir, 'events.jsonl');
    const env = testEnv(filePath);

    const usage = await recordLegacyUsageEvent({
        event: 'usage',
        surface: 'analytics',
        consumer: 'read_model_service',
        handler: 'read_model_service',
        route: 'analytical_intent',
        domain: 'analytics',
        operation: 'read',
        source: 'sqlite',
        result: 'success'
    }, { env });
    const heartbeat = await recordLegacyUsageHeartbeat({ env });

    assert.strictEqual(usage.recorded, true);
    assert.strictEqual(heartbeat.recorded, true);
    const lines = (await fs.readFile(filePath, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(lines[0].event, 'usage');
    assert.strictEqual(lines[1].event, 'heartbeat');
    assert.strictEqual(lines[1].surface, 'telemetry');
    assert.strictEqual(lines[1].reason_code, 'self_check');
});

test('legacy usage telemetry rotates bounded JSONL files', async () => {
    const tempDir = await makeTempDir();
    const filePath = path.join(tempDir, 'events.jsonl');
    const env = testEnv(filePath);
    const largeButAllowlisted = {
        event: 'usage',
        surface: 'analytics',
        consumer: 'read_model_service',
        handler: 'read_model_service',
        route: 'analytical_intent',
        domain: 'analytics',
        operation: 'fallback',
        source: 'memory_fallback',
        fallbackFrom: 'sqlite',
        fallbackTo: 'memory_fallback',
        result: 'success',
        reasonCode: 'sqlite_miss'
    };

    await recordLegacyUsageEvent(largeButAllowlisted, { env, maxBytes: 400, maxBackups: 2 });
    await recordLegacyUsageEvent(largeButAllowlisted, { env, maxBytes: 400, maxBackups: 2 });

    await fs.access(filePath);
    await fs.access(`${filePath}.1`);
    const current = (await fs.readFile(filePath, 'utf8')).trim().split('\n');
    const previous = (await fs.readFile(`${filePath}.1`, 'utf8')).trim().split('\n');
    assert.strictEqual(current.length, 1);
    assert.strictEqual(previous.length, 1);
});

test('legacy usage telemetry fails open for product behavior without leaking the path', async () => {
    const tempDir = await makeTempDir();
    const blocker = path.join(tempDir, 'not-a-directory');
    await fs.writeFile(blocker, 'block', 'utf8');
    const result = await recordLegacyUsageEvent({ event: 'usage' }, {
        env: testEnv(path.join(blocker, 'events.jsonl'))
    });
    assert.deepStrictEqual(result, { recorded: false, reason: 'write_failed' });
});
