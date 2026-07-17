const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { persistShadowPreview } = require('../scripts/runOpenFinanceShadowPreview');
const { OpenFinanceRevocationJournal } = require('../src/openFinance/openFinanceRevocationJournal');
const { OpenFinanceShadowPreviewStore } = require('../src/openFinance/openFinanceShadowPreviewStore');
const { reconcileOpenFinanceShadow } = require('../src/openFinance/openFinanceShadowReconciler');

const secret = 'open-finance-shadow-script-secret-32-bytes';

function source(generation = 1) {
    return [{
        id: 'item-script',
        alias_code: 'daniel_nubank',
        generation,
        transactions: [{
            id: 'transaction-script',
            date: null,
            description: 'PRIVATE SCRIPT DESCRIPTION',
            amount_cents: -1234,
            type: 'DEBIT'
        }]
    }];
}

test('manual shadow script never persists while preview mode is off', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-shadow-script-off-'));
    const previewPath = path.join(root, 'preview.sqlite');
    const items = source();
    const decisions = reconcileOpenFinanceShadow({
        secret, openFinanceItems: items, canonicalTransactions: []
    }).decisions;
    assert.deepEqual(persistShadowPreview({
        env: { OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'off', OPEN_FINANCE_SHADOW_PREVIEW_DB: previewPath },
        secret, decisions, items, canonicalTransactions: []
    }), { inserted: 0, replayed: 0, reviewable: 0, financial_writes: 0 });
    assert.equal(fs.existsSync(previewPath), false);
});

test('manual shadow script requires the revocation journal and blocks revoked generations', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-shadow-script-revoked-'));
    const previewPath = path.join(root, 'preview.sqlite');
    const journalPath = path.join(root, 'journal.sqlite');
    new OpenFinanceShadowPreviewStore({ databasePath: previewPath, secret }).close();
    const journal = new OpenFinanceRevocationJournal({ databasePath: journalPath, secret });
    journal.recordRevocation({ alias: 'daniel_nubank', generation: 1 });
    journal.close();
    const items = source(1);
    const decisions = reconcileOpenFinanceShadow({
        secret, openFinanceItems: items, canonicalTransactions: []
    }).decisions;
    const env = {
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_SHADOW_PREVIEW_DB: previewPath,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: journalPath
    };
    assert.throws(() => persistShadowPreview({
        env, secret, decisions, items, canonicalTransactions: []
    }), /revoked_generation/);
    const preview = new OpenFinanceShadowPreviewStore({ databasePath: previewPath, secret });
    try {
        assert.equal(preview.stats().total, 0);
    } finally {
        preview.close();
    }
});
