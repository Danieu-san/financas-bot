const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { PluggySandboxAdapter } = require('../src/openFinance/pluggySandboxAdapter');
const { normalizePluggySandboxSnapshot } = require('../src/openFinance/pluggySandboxContract');
const { OpenFinanceStagingStore } = require('../src/openFinance/openFinanceStagingStore');

const fixturePath = path.join(__dirname, 'fixtures', 'pluggy-sandbox-snapshot.json');
const secret = 'sandbox-only-test-secret';

function fixture() {
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

test('contrato normaliza centavos e rejeita modo live', () => {
    const normalized = normalizePluggySandboxSnapshot(fixture());
    assert.equal(normalized.accounts[0].balance_cents, 123456);
    assert.equal(normalized.accounts[1].balance_cents, -32109);
    assert.equal(normalized.transactions[0].amount_cents, -5025);
    assert.equal(normalized.bills[0].total_cents, 32109);
    assert.throws(() => normalizePluggySandboxSnapshot({ ...fixture(), mode: 'live' }), /pluggy_live_mode_forbidden/);
});

test('contrato rejeita referencias inconsistentes antes do staging', () => {
    const payload = fixture();
    payload.transactions[0].accountId = 'sandbox-account-missing';
    assert.throws(() => normalizePluggySandboxSnapshot(payload), /unknown_transaction_account/);
});

test('ingestão é idempotente e aceita atualização de exclusão', () => {
    const store = new OpenFinanceStagingStore({ hmacSecret: secret });
    try {
        const snapshot = new PluggySandboxAdapter({ fixturePath }).readSnapshot();
        assert.deepEqual(store.ingestSnapshot(snapshot).replay, false);
        assert.deepEqual(store.ingestSnapshot(snapshot).replay, true);
        assert.deepEqual(store.stats(), { events: 1, items: 1, accounts: 2, transactions: 2, bills: 1, revocations: 0 });

        const changedPayload = fixture();
        changedPayload.eventId = 'sandbox-event-002';
        changedPayload.transactions[0].deleted = true;
        const changed = normalizePluggySandboxSnapshot(changedPayload);
        assert.equal(store.ingestSnapshot(changed).applied, true);
        assert.equal(store.stats().transactions, 1);
        assert.equal(store.stats().events, 2);
    } finally {
        store.close();
    }
});

test('revogação apaga staging e expõe apenas contagens sanitizadas', () => {
    const store = new OpenFinanceStagingStore({ hmacSecret: secret });
    try {
        const snapshot = new PluggySandboxAdapter({ fixturePath }).readSnapshot();
        store.ingestSnapshot(snapshot);
        const result = store.revokeItem(snapshot.item.id, { revokedAt: '2026-07-15T13:00:00.000Z' });
        assert.equal(result.revoked, true);
        assert.match(result.item_ref, /^[a-f0-9]{64}$/);
        const stats = store.stats();
        assert.deepEqual(stats, { events: 0, items: 0, accounts: 0, transactions: 0, bills: 0, revocations: 1 });
        assert.equal(JSON.stringify(stats).includes('sandbox-item-001'), false);
        assert.equal(JSON.stringify(stats).includes('SANDBOX MERCADO'), false);
        const delayedReplay = store.ingestSnapshot(snapshot);
        assert.deepEqual(delayedReplay, { applied: false, replay: false, blocked: true, reason: 'item_revoked' });
        assert.deepEqual(store.stats(), stats);
    } finally {
        store.close();
    }
});

test('staging falha fechado sem segredo HMAC', () => {
    const databasePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-open-finance-')), 'staging.sqlite');
    assert.throws(() => new OpenFinanceStagingStore({ databasePath }), /open_finance_hmac_secret_required/);
});

// Keep the isolated Open Finance gate in the repository-wide explicit test list
// without expanding the already long package.json command for each sandbox slice.
require('./openFinanceSandboxWebhook.test');
require('./openFinanceSandboxWebhookInbox.test');
require('./openFinanceSandboxPolling.test');
require('./openFinancePluggyReadOnly.test');
