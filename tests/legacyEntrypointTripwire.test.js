const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { observeLegacyEntrypoint } = require('../src/reliability/legacyEntrypointTripwire');

async function envFor(overrides = {}) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-tripwire-'));
    return {
        LEGACY_RETIREMENT_TRIPWIRE_ENABLED: 'true',
        LEGACY_RETIREMENT_SOFT_DISABLED_CANDIDATES: '',
        LEGACY_USAGE_TELEMETRY_ENABLED: 'true',
        LEGACY_USAGE_TELEMETRY_PATH: path.join(dir, 'events.jsonl'),
        LEGACY_USAGE_TELEMETRY_HMAC_SECRET: 'test-only-hmac-secret-with-enough-entropy',
        APP_COMMIT_SHA: 'c91af84c86931254436991926b7086fc6fbb9ca2',
        ...overrides
    };
}

test('tripwire records an allowlisted runtime load with evidence type', async () => {
    const env = await envFor();
    const result = observeLegacyEntrypoint('financial_health_service', {
        env, domain: 'analytics', evidenceType: 'production_replay'
    });
    assert.equal(result.observed, true);
    await result.record;
    const entry = JSON.parse((await fs.readFile(env.LEGACY_USAGE_TELEMETRY_PATH, 'utf8')).trim());
    assert.equal(entry.event, 'tripwire');
    assert.equal(entry.candidate, 'financial_health_service');
    assert.equal(entry.evidence_type, 'production_replay');
    assert.equal(entry.reason_code, 'legacy_entrypoint_loaded');
    assert.equal(entry.write_attempted, false);
});

test('soft-disabled entrypoint fails closed and records the blocked attempt', async () => {
    const env = await envFor({
        LEGACY_RETIREMENT_SOFT_DISABLED_CANDIDATES: 'financial_health_service'
    });
    let failure;
    try {
        observeLegacyEntrypoint('financial_health_service', { env, domain: 'analytics' });
    } catch (error) {
        failure = error;
    }
    assert.equal(failure?.code, 'legacy_entrypoint_soft_disabled');
    await failure.telemetry;
    const entry = JSON.parse((await fs.readFile(env.LEGACY_USAGE_TELEMETRY_PATH, 'utf8')).trim());
    assert.equal(entry.result, 'blocked');
    assert.equal(entry.mode, 'soft_disabled');
    assert.equal(entry.reason_code, 'legacy_soft_disabled');
});

test('tripwire is inert by default and rejects unknown candidate configuration', async () => {
    assert.deepEqual(observeLegacyEntrypoint('financial_health_service', { env: {} }), {
        observed: false, blocked: false, reason: 'tripwire_disabled'
    });
    const env = await envFor({ LEGACY_RETIREMENT_SOFT_DISABLED_CANDIDATES: 'unknown_module' });
    assert.throws(() => observeLegacyEntrypoint('financial_health_service', { env }),
        /invalid_soft_disabled_legacy_candidate/);
});
