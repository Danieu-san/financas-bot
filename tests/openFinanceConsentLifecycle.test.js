const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');
const { OpenFinanceBaselineStore } = require('../src/openFinance/openFinanceBaselineStore');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { OpenFinanceRevocationJournal } = require('../src/openFinance/openFinanceRevocationJournal');
const { OpenFinanceShadowPreviewStore } = require('../src/openFinance/openFinanceShadowPreviewStore');
const { classifyOpenFinanceLifecycle } = require('../src/openFinance/openFinanceLifecycleClassifier');
const { revokeOpenFinanceConsent, reinstateOpenFinanceConsent } = require('../src/openFinance/openFinanceConsentLifecycle');

const secret = 'open-finance-consent-test-secret-32-bytes';
const policy = [{
    alias: 'daniel_nubank', source_owner: 'daniel', authorized_viewers: ['daniel'],
    whatsapp_recipient: 'daniel', family_aggregation_allowed: false,
    write_confirmation_principal: 'daniel'
}];

function transaction(id, amount, description) {
    return { id, provider_id: `provider-${id}`, account_id: 'account-credit-1',
        amount_cents: amount, description, date: '2026-07-16T09:00:00.000Z',
        status: 'POSTED', currency: 'BRL' };
}

function snapshot(eventId, transactions) {
    return {
        provider: 'pluggy', mode: 'live_readonly_staging', event_id: eventId,
        observed_at: '2026-07-16T12:00:00.000Z',
        collection_health: { complete: true, warning_count: 0 },
        items: [{
            id: 'item-daniel-1', alias_code: 'daniel_nubank', owner_scope: 'daniel',
            availability: { accounts: 'available', transactions: 'available', bills: 'available', investments: 'available' },
            accounts: [{ id: 'account-credit-1', type: 'CREDIT', name: 'credit', balance_cents: 0 }],
            transactions, bills: [], investments: []
        }]
    };
}

test('9F local consent revocation purges all stores and blocks delayed replay', () => {
    const vault = new OpenFinanceLiveStagingVault({ secret });
    const baseline = new OpenFinanceBaselineStore({ secret });
    const outbox = new OpenFinanceAlertOutbox({ secret });
    const journal = new OpenFinanceRevocationJournal({ secret });
    const preview = new OpenFinanceShadowPreviewStore({ secret, revocationJournal: journal });
    try {
        const oldTransaction = transaction('old', 500, 'old private data');
        const first = snapshot('event-1', [oldTransaction]);
        vault.ingestSnapshot(first);
        baseline.ingestSnapshot(first);

        const newTransaction = transaction('new', 1193, 'new private data');
        const changed = snapshot('event-2', [oldTransaction, newTransaction]);
        vault.ingestSnapshot(changed);
        baseline.ingestSnapshot(changed);
        const staleCandidates = baseline.listCandidates();
        const lifecycle = classifyOpenFinanceLifecycle({ items: changed.items, secret });
        assert.equal(outbox.enqueue({ candidates: staleCandidates, lifecycleDecisions: lifecycle.decisions,
            items: changed.items, policies: policy, baselineComplete: true }).inserted, 1);
        const transactionRef = crypto.createHmac('sha256', secret)
            .update('item-daniel-1:new').digest('hex').slice(0, 32);
        preview.ingest({
            decisions: [{ transaction_ref: transactionRef, status: 'uncertain',
                rule: 'manual_review', confidence_band: 'low' }],
            openFinanceItems: [{ ...changed.items[0], generation: 1 }],
            canonicalTransactions: []
        });

        const revoked = revokeOpenFinanceConsent({
            alias: 'daniel_nubank', itemId: 'item-daniel-1', vault, baseline, outbox, journal, preview, generation: 1,
            revokedAt: '2026-07-16T13:00:00.000Z'
        });
        assert.equal(revoked.revoked, true);
        assert.equal(revoked.provider_consent_revoked, false);
        assert.equal(revoked.financial_writes, 0);
        assert.equal(revoked.journal.recorded, true);
        assert.equal(revoked.reviews.removed_previews, 1);
        assert.equal(journal.isGenerationRevoked('daniel_nubank', 1), true);
        assert.equal(vault.readItemByAlias('daniel_nubank'), null);
        assert.deepEqual(baseline.stats(), { connections: 0, events: 0, observations: 0,
            candidates: 0, completed_baselines: 0, financial_writes: 0 });
        assert.equal(outbox.stats().total, 0);
        assert.equal(preview.stats().total, 0);
        assert.equal(baseline.isConnectionRevoked('daniel_nubank'), true);
        assert.equal(outbox.isSourceRevoked('daniel_nubank'), true);

        const delayed = snapshot('event-3', [oldTransaction, newTransaction]);
        assert.equal(vault.ingestSnapshot(delayed).blocked_items, 1);
        assert.equal(baseline.ingestSnapshot(delayed).revoked_items, 1);
        assert.equal(outbox.enqueue({ candidates: staleCandidates, lifecycleDecisions: lifecycle.decisions,
            items: delayed.items, policies: policy, baselineComplete: true }).blocked, 1);
        assert.equal(outbox.stats().total, 0);

        const replay = revokeOpenFinanceConsent({
            alias: 'daniel_nubank', itemId: 'item-daniel-1', vault, baseline, outbox, journal, preview, generation: 1,
            revokedAt: '2026-07-16T13:00:00.000Z'
        });
        assert.equal(replay.alerts.removed_alerts, 0);
        assert.equal(replay.journal.replay, true);
        assert.deepEqual(replay.history.removed, { connections: 0, events: 0, observations: 0, candidates: 0 });
    } finally {
        preview.close();
        outbox.close();
        baseline.close();
        vault.close();
        journal.close();
    }
});

test('9F re-consent requires explicit tombstone removal and a new silent baseline', () => {
    const vault = new OpenFinanceLiveStagingVault({ secret });
    const baseline = new OpenFinanceBaselineStore({ secret });
    const outbox = new OpenFinanceAlertOutbox({ secret });
    const journal = new OpenFinanceRevocationJournal({ secret });
    try {
        revokeOpenFinanceConsent({ alias: 'daniel_nubank', itemId: 'item-daniel-1', vault, baseline, outbox, journal, generation: 1 });
        assert.throws(() => reinstateOpenFinanceConsent({ alias: 'daniel_nubank', itemId: 'item-daniel-1',
            ownerScope: 'daniel', vault, baseline, outbox, journal, newGeneration: 1 }), /new_generation/);
        const reinstated = reinstateOpenFinanceConsent({ alias: 'daniel_nubank', itemId: 'item-daniel-1',
            ownerScope: 'daniel', vault, baseline, outbox, journal, newGeneration: 2 });
        assert.equal(reinstated.baseline_required, true);
        assert.equal(reinstated.staging.reinstated, true);
        assert.equal(journal.isGenerationRevoked('daniel_nubank', 2), false);
        assert.equal(baseline.connectionGeneration('daniel_nubank'), 2);
        const newSnapshot = snapshot('event-reconsent', [transaction('new-generation', 700, 'private')]);
        assert.equal(vault.ingestSnapshot(newSnapshot).staged_items, 1);
        const result = baseline.ingestSnapshot(newSnapshot);
        assert.equal(result.baselined_observations, 1);
        assert.equal(result.new_observations, 0);
    } finally {
        outbox.close();
        baseline.close();
        vault.close();
        journal.close();
    }
});

test('active preview canary makes the review store mandatory during revocation', () => {
    const vault = new OpenFinanceLiveStagingVault({ secret });
    const baseline = new OpenFinanceBaselineStore({ secret });
    const outbox = new OpenFinanceAlertOutbox({ secret });
    const journal = new OpenFinanceRevocationJournal({ secret });
    try {
        assert.throws(() => revokeOpenFinanceConsent({
            alias: 'daniel_nubank',
            itemId: 'item-daniel-1',
            vault,
            baseline,
            outbox,
            journal,
            previewMode: 'canary'
        }), /shadow_preview_required/);
        assert.equal(journal.revokedGeneration('daniel_nubank'), 0);
    } finally {
        outbox.close();
        baseline.close();
        vault.close();
        journal.close();
    }
});
