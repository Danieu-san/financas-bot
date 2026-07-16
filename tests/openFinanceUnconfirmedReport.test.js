const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { classifyOpenFinanceLifecycle } = require('../src/openFinance/openFinanceLifecycleClassifier');
const { main } = require('../scripts/reportOpenFinanceUnconfirmed');

test('unconfirmed report exposes source, recipient and reference but no financial payload', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'of-unconfirmed-'));
    const databasePath = path.join(directory, 'outbox.sqlite');
    const secretPath = path.join(directory, 'secret');
    const secret = 'unconfirmed-report-secret-at-least-32-bytes';
    fs.writeFileSync(secretPath, secret);
    const outbox = new OpenFinanceAlertOutbox({ databasePath, secret });
    const item = {
        id: 'item-cristina', alias_code: 'cristina_nubank',
        accounts: [{ id: 'card', type: 'CREDIT' }],
        transactions: [{ id: 'tx', account_id: 'card', amount_cents: 1234,
            description: 'private-description', date: '2026-07-16T19:00:00.000Z',
            status: 'POSTED', currency: 'BRL' }]
    };
    const lifecycle = classifyOpenFinanceLifecycle({ items: [item], secret });
    outbox.enqueue({
        candidates: [{ observation_ref: lifecycle.decisions[0].observation_ref,
            external_event_ref: 'external-event-ref', correlation_state: 'new_event' }],
        lifecycleDecisions: lifecycle.decisions,
        items: [item],
        policies: [{ alias: 'cristina_nubank', source_owner: 'thais', authorized_viewers: ['thais'],
            whatsapp_recipient: 'thais', family_aggregation_allowed: false,
            write_confirmation_principal: 'thais' }],
        baselineComplete: true,
        createdAt: '2026-07-16T19:00:00.000Z'
    });
    const claimed = outbox.claimNext({ canaryAlias: 'cristina_nubank', now: '2026-07-16T19:01:00.000Z' });
    outbox.acknowledgeAccepted({ alertRef: claimed.alert_ref, leaseToken: claimed.lease_token,
        acceptedAt: '2026-07-16T19:02:00.000Z' });
    outbox.close();
    const result = main({
        OPEN_FINANCE_OUTBOX_DB: databasePath,
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: secretPath
    });
    assert.equal(result.unconfirmed.length, 1);
    assert.equal(result.unconfirmed[0].source_alias, 'cristina_nubank');
    assert.equal(result.unconfirmed[0].recipient, 'thais');
    assert.equal(result.unconfirmed[0].classification, 'purchase');
    assert.match(result.unconfirmed[0].internal_reference, /^[a-f0-9]{10}$/);
    assert.equal(JSON.stringify(result).includes('private-description'), false);
    assert.equal(JSON.stringify(result).includes('1234'), false);
    assert.equal(result.financial_values_exposed, 0);
    assert.equal(result.financial_writes, 0);
});
