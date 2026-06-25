const test = require('node:test');
const assert = require('node:assert');

const {
    buildCanonicalLedgerRolloutPolicy,
    canonicalLedgerRollbackEnv
} = require('../src/ledger/canonicalLedgerRolloutPolicy');

test('canonical ledger rollout defaults to no projection, no shadow writes and no canary reads', () => {
    const policy = buildCanonicalLedgerRolloutPolicy({});

    assert.strictEqual(policy.projectionMode, 'off');
    assert.strictEqual(policy.shadowWritesAllowed, false);
    assert.strictEqual(policy.canaryReadsAllowed, false);
    assert.deepStrictEqual(policy.canaryReadDomains, []);
    assert.strictEqual(policy.canReadDomain('bills'), false);
});

test('canonical ledger shadow writes require mode and explicit write consent outside production', () => {
    const missingConsent = buildCanonicalLedgerRolloutPolicy({
        NODE_ENV: 'test',
        CANONICAL_LEDGER_PROJECTION_MODE: 'shadow'
    });
    assert.strictEqual(missingConsent.shadowWritesAllowed, false);

    const allowed = buildCanonicalLedgerRolloutPolicy({
        NODE_ENV: 'test',
        CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true'
    });
    assert.strictEqual(allowed.shadowWritesAllowed, true);
});

test('canonical ledger production shadow writes require separate production approval', () => {
    const unapproved = buildCanonicalLedgerRolloutPolicy({
        NODE_ENV: 'production',
        CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true'
    });
    assert.strictEqual(unapproved.shadowWritesAllowed, false);
    assert.ok(unapproved.blockers.includes('production_shadow_not_approved'));

    const approved = buildCanonicalLedgerRolloutPolicy({
        NODE_ENV: 'production',
        CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
        CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED: 'true'
    });
    assert.strictEqual(approved.shadowWritesAllowed, true);
});

test('canonical ledger canary reads accept only known domains and require explicit production approval', () => {
    const policy = buildCanonicalLedgerRolloutPolicy({
        NODE_ENV: 'production',
        CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
        CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED: 'true',
        CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
        CANONICAL_LEDGER_CANARY_READ_APPROVED: 'true',
        CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'transactions, accounts, transfers, unknown, transactions'
    });

    assert.deepStrictEqual(policy.canaryReadDomains, ['transactions', 'accounts', 'transfers']);
    assert.strictEqual(policy.canaryReadsAllowed, true);
    assert.strictEqual(policy.canReadDomain('transactions'), true);
    assert.strictEqual(policy.canReadDomain('accounts'), true);
    assert.strictEqual(policy.canReadDomain('transfers'), true);
    assert.strictEqual(policy.canReadDomain('cards'), false);
    assert.ok(policy.blockers.includes('unknown_canary_domain:unknown'));
});

test('canonical ledger canary reads require an active authorized shadow projection', () => {
    const policy = buildCanonicalLedgerRolloutPolicy({
        NODE_ENV: 'production',
        CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
        CANONICAL_LEDGER_CANARY_READ_APPROVED: 'true',
        CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'transactions'
    });

    assert.strictEqual(policy.canaryReadsAllowed, false);
    assert.strictEqual(policy.canReadDomain('transactions'), false);
    assert.ok(policy.blockers.includes('canary_requires_shadow_projection'));
});

test('canonical ledger canary reads fail closed when enabled without domains or production approval', () => {
    const noDomains = buildCanonicalLedgerRolloutPolicy({
        NODE_ENV: 'production',
        CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
        CANONICAL_LEDGER_CANARY_READ_APPROVED: 'true'
    });
    assert.strictEqual(noDomains.canaryReadsAllowed, false);
    assert.ok(noDomains.blockers.includes('canary_domains_empty'));

    const noApproval = buildCanonicalLedgerRolloutPolicy({
        NODE_ENV: 'production',
        CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
        CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'transactions'
    });
    assert.strictEqual(noApproval.canaryReadsAllowed, false);
    assert.ok(noApproval.blockers.includes('production_canary_read_not_approved'));
});

test('canonical ledger invalid projection mode fails closed', () => {
    const policy = buildCanonicalLedgerRolloutPolicy({
        CANONICAL_LEDGER_PROJECTION_MODE: 'dual-write',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true'
    });

    assert.strictEqual(policy.projectionMode, 'off');
    assert.strictEqual(policy.shadowWritesAllowed, false);
    assert.ok(policy.blockers.includes('invalid_projection_mode'));
});

test('canonical ledger rollback contract disables every rollout surface', () => {
    assert.deepStrictEqual(canonicalLedgerRollbackEnv(), {
        CANONICAL_LEDGER_PROJECTION_MODE: 'off',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'false',
        CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED: 'false',
        CANONICAL_LEDGER_CANARY_READ_ENABLED: 'false',
        CANONICAL_LEDGER_CANARY_READ_APPROVED: 'false',
        CANONICAL_LEDGER_CANARY_READ_DOMAINS: ''
    });
});
