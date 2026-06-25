const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');

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
