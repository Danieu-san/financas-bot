const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const {
    readCanonicalLedgerCanaryWithFallback
} = require('../src/ledger/canonicalLedgerCanaryRouter');

test('canonical canary router falls back to legacy when disabled or unavailable', async () => {
    let legacyCalls = 0;
    const legacyReader = async () => {
        legacyCalls += 1;
        return [{ source: 'legacy' }];
    };

    const disabled = await readCanonicalLedgerCanaryWithFallback({
        env: {},
        domain: 'transactions',
        legacyReader
    });
    const unavailable = await readCanonicalLedgerCanaryWithFallback({
        env: {
            NODE_ENV: 'test',
            CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
            CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
            CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
            CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'transactions'
        },
        dbPath: path.join(os.tmpdir(), 'missing-canonical-ledger', 'missing.sqlite'),
        domain: 'transactions',
        legacyReader
    });

    assert.deepStrictEqual(disabled, {
        source: 'legacy',
        rows: [{ source: 'legacy' }],
        fallbackReason: 'canary_domain_disabled'
    });
    assert.strictEqual(unavailable.source, 'legacy');
    assert.strictEqual(unavailable.fallbackReason, 'canonical_read_failed');
    assert.strictEqual(legacyCalls, 2);
});

test('canonical canary router records a sanitized durable source decision when enabled', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'canonical-router-telemetry-'));
    const telemetryPath = path.join(tempDir, 'legacy-usage.jsonl');
    const result = await readCanonicalLedgerCanaryWithFallback({
        env: {
            LEGACY_USAGE_TELEMETRY_ENABLED: 'true',
            LEGACY_USAGE_TELEMETRY_PATH: telemetryPath,
            LEGACY_USAGE_TELEMETRY_HMAC_SECRET: 'test-only-canonical-router-secret'
        },
        domain: 'transactions',
        legacyReader: async () => [{ description: 'must-not-be-logged', value: 987.65 }]
    });

    assert.strictEqual(result.source, 'legacy');
    const event = JSON.parse((await fs.readFile(telemetryPath, 'utf8')).trim());
    assert.strictEqual(event.surface, 'canonical_ledger');
    assert.strictEqual(event.domain, 'transactions');
    assert.strictEqual(event.operation, 'fallback');
    assert.strictEqual(event.source, 'legacy');
    assert.strictEqual(event.reason_code, 'canary_domain_disabled');
    const serialized = JSON.stringify(event);
    assert.ok(!serialized.includes('must-not-be-logged'));
    assert.ok(!serialized.includes('987.65'));
});
