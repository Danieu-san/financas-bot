const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { classifyOpenFinanceLifecycle } = require('../src/openFinance/openFinanceLifecycleClassifier');
const {
    main,
    parseArgs,
    safeErrorCode
} = require('../scripts/acknowledgeOpenFinanceAlertDelivery');

function createAcceptedUnconfirmedAlert() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'of-delivery-confirmation-'));
    const databasePath = path.join(directory, 'outbox.sqlite');
    const secretPath = path.join(directory, 'secret');
    const secret = 'delivery-confirmation-secret-at-least-32-bytes';
    fs.writeFileSync(secretPath, secret);
    const outbox = new OpenFinanceAlertOutbox({ databasePath, secret });
    const item = {
        id: 'item-cristina', alias_code: 'cristina_nubank',
        accounts: [{ id: 'card', type: 'CREDIT' }],
        transactions: [{ id: 'private-transaction-id', account_id: 'card', amount_cents: 2320,
            description: 'private-description', date: '2026-07-16T19:00:00.000Z',
            status: 'POSTED', currency: 'BRL' }]
    };
    const lifecycle = classifyOpenFinanceLifecycle({ items: [item], secret });
    outbox.enqueue({
        candidates: [{ observation_ref: lifecycle.decisions[0].observation_ref,
            external_event_ref: 'private-external-event-ref', correlation_state: 'new_event' }],
        lifecycleDecisions: lifecycle.decisions,
        items: [item],
        policies: [{ alias: 'cristina_nubank', source_owner: 'thais', authorized_viewers: ['thais'],
            whatsapp_recipient: 'thais', family_aggregation_allowed: false,
            write_confirmation_principal: 'thais' }],
        baselineComplete: true,
        createdAt: '2026-07-16T19:00:00.000Z'
    });
    const claimed = outbox.claimNext({
        canaryAlias: 'cristina_nubank',
        now: '2026-07-16T19:01:00.000Z'
    });
    outbox.acknowledgeAccepted({
        alertRef: claimed.alert_ref,
        leaseToken: claimed.lease_token,
        acceptedAt: '2026-07-16T19:02:00.000Z'
    });
    outbox.close();
    return {
        directory,
        databasePath,
        secretPath,
        secret,
        reference: claimed.internal_reference
    };
}

test('delivery confirmation requires the explicit flag and a ten-hex reference', () => {
    assert.deepEqual(parseArgs(['--reference', '08AA505FB3', '--confirm-delivered']), {
        confirmDelivered: true,
        reference: '08aa505fb3'
    });
    assert.throws(() => parseArgs(['--reference', '08aa505fb3']), /explicit_confirm_delivered_required/);
    assert.throws(() => parseArgs(['--confirm-delivered']), /valid_internal_reference_required/);
    assert.throws(() => parseArgs(['--confirm-delivered', '--reference', 'not-a-ref']),
        /valid_internal_reference_required/);
    assert.throws(() => parseArgs(['--confirm-delivered', '--reference', '08aa505fb3', '--force']),
        /unsupported_delivery_confirmation_argument/);
});

test('delivery confirmation acknowledges exactly one ambiguous alert without financial writes', () => {
    const fixture = createAcceptedUnconfirmedAlert();
    try {
        const result = main({
            argv: ['--confirm-delivered', '--reference', fixture.reference],
            env: {
                OPEN_FINANCE_OUTBOX_DB: fixture.databasePath,
                OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: fixture.secretPath
            },
            confirmedAt: '2026-07-16T19:05:00.000Z'
        });
        assert.deepEqual(result, {
            schema_version: 1,
            action: 'open_finance_alert_delivery_confirmation',
            status: 'delivered_confirmed',
            internal_reference: fixture.reference,
            financial_values_exposed: 0,
            descriptions_exposed: 0,
            private_ids_exposed: 0,
            financial_writes: 0,
            transport_calls: 0
        });
        const serialized = JSON.stringify(result);
        assert.equal(serialized.includes('private-description'), false);
        assert.equal(serialized.includes('2320'), false);
        assert.equal(serialized.includes('private-transaction-id'), false);
        assert.equal(serialized.includes('private-external-event-ref'), false);

        const verified = new OpenFinanceAlertOutbox({
            databasePath: fixture.databasePath,
            secret: fixture.secret
        });
        assert.equal(verified.stats().accepted_unconfirmed, 0);
        assert.equal(verified.stats().delivered_confirmed, 1);
        verified.close();

        assert.throws(() => main({
            argv: ['--confirm-delivered', '--reference', fixture.reference],
            env: {
                OPEN_FINANCE_OUTBOX_DB: fixture.databasePath,
                OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: fixture.secretPath
            }
        }), /ambiguous_user_confirmation/);
    } finally {
        fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
});

test('delivery confirmation fails closed for unavailable state and sanitizes unexpected errors', () => {
    assert.throws(() => main({
        argv: ['--confirm-delivered', '--reference', '08aa505fb3'],
        env: {}
    }), /open_finance_outbox_unavailable/);
    assert.equal(safeErrorCode(new Error('C:\\private\\outbox.sqlite could not be opened')),
        'open_finance_delivery_confirmation_failed');
    assert.equal(safeErrorCode(new Error('ambiguous_user_confirmation')), 'ambiguous_user_confirmation');
});
