const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');

const SECRET = 'dashboard-financial-truth-test-secret-32-chars';

function snapshot(observedAt = '2026-07-30T12:00:00.000Z') {
    return {
        provider: 'pluggy',
        mode: 'live_readonly_staging',
        event_id: 'dashboard-truth-event-1',
        observed_at: observedAt,
        items: [
            {
                id: 'item-daniel',
                alias_code: 'daniel_nubank',
                owner_scope: 'daniel',
                connector_id: 'connector-200',
                status: 'UPDATED',
                availability: {
                    accounts: 'available',
                    transactions: 'available',
                    bills: 'available',
                    investments: 'available'
                },
                accounts: [
                    {
                        id: 'account-daniel-bank',
                        item_id: 'item-daniel',
                        type: 'BANK',
                        subtype: 'CHECKING_ACCOUNT',
                        currency: 'BRL',
                        balance_cents: 1234,
                        credit_limit_cents: null,
                        available_credit_limit_cents: null,
                        used_limit_cents: null,
                        balance_due_date: null,
                        balance_close_date: null
                    },
                    {
                        id: 'account-daniel-card',
                        item_id: 'item-daniel',
                        type: 'CREDIT',
                        subtype: 'CREDIT_CARD',
                        currency: 'BRL',
                        balance_cents: 276544,
                        credit_limit_cents: 400000,
                        available_credit_limit_cents: 123456,
                        used_limit_cents: 276544,
                        balance_due_date: '2026-08-07T00:00:00.000Z',
                        balance_close_date: '2026-07-30T00:00:00.000Z'
                    }
                ],
                transactions: [],
                bills: [
                    {
                        id: 'bill-daniel-current',
                        item_id: 'item-daniel',
                        account_id: 'account-daniel-card',
                        due_date: '2026-08-07T00:00:00.000Z',
                        total_cents: 45678,
                        currency: 'BRL',
                        minimum_payment_cents: null
                    }
                ],
                investments: []
            },
            {
                id: 'item-thais',
                alias_code: 'thais_nubank',
                owner_scope: 'thais',
                connector_id: 'connector-200',
                status: 'UPDATED',
                availability: {
                    accounts: 'available',
                    transactions: 'available',
                    bills: 'available',
                    investments: 'available'
                },
                accounts: [
                    {
                        id: 'account-thais-bank',
                        item_id: 'item-thais',
                        type: 'BANK',
                        subtype: 'CHECKING_ACCOUNT',
                        currency: 'BRL',
                        balance_cents: 5678,
                        credit_limit_cents: null,
                        available_credit_limit_cents: null,
                        used_limit_cents: null,
                        balance_due_date: null,
                        balance_close_date: null
                    },
                    {
                        id: 'account-thais-card',
                        item_id: 'item-thais',
                        type: 'CREDIT',
                        subtype: 'CREDIT_CARD',
                        currency: 'BRL',
                        balance_cents: 151235,
                        credit_limit_cents: 250000,
                        available_credit_limit_cents: 98765,
                        used_limit_cents: 151235,
                        balance_due_date: '2026-08-10T00:00:00.000Z',
                        balance_close_date: '2026-08-02T00:00:00.000Z'
                    }
                ],
                transactions: [],
                bills: [
                    {
                        id: 'bill-thais-current',
                        item_id: 'item-thais',
                        account_id: 'account-thais-card',
                        due_date: '2026-08-10T00:00:00.000Z',
                        total_cents: 32109,
                        currency: 'BRL',
                        minimum_payment_cents: null
                    }
                ],
                investments: []
            }
        ]
    };
}

function fixture(snapshotValue = snapshot()) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-financial-truth-'));
    const databasePath = path.join(root, 'staging.sqlite');
    const secretPath = path.join(root, 'secret.txt');
    const mappingPath = path.join(root, 'mappings.json');
    fs.writeFileSync(secretPath, SECRET);
    fs.writeFileSync(mappingPath, JSON.stringify([
        { itemId: 'item-daniel', alias: 'daniel_nubank', ownerScope: 'daniel' },
        { itemId: 'item-thais', alias: 'thais_nubank', ownerScope: 'thais' }
    ]));
    const vault = new OpenFinanceLiveStagingVault({ databasePath, secret: SECRET });
    vault.ingestSnapshot(snapshotValue);
    vault.close();
    return {
        root,
        env: {
            OPEN_FINANCE_LIVE_STAGING_DB: databasePath,
            OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: secretPath,
            PLUGGY_ITEM_MAP_FILE: mappingPath,
            OPEN_FINANCE_DASHBOARD_MAX_AGE_MS: String(8 * 60 * 60 * 1000)
        },
        cleanup: () => fs.rmSync(root, { recursive: true, force: true })
    };
}

test('dashboard financial truth stays partial when an authorized mapping has no staged record', () => {
    const partialSnapshot = snapshot();
    partialSnapshot.items = partialSnapshot.items.filter(item => item.alias_code === 'daniel_nubank');
    const files = fixture(partialSnapshot);
    try {
        const { loadOpenFinanceDashboardSnapshot } = require('../src/services/dashboardFinancialTruthService');
        const truth = loadOpenFinanceDashboardSnapshot({
            userIds: ['user-daniel', 'user-thais'],
            users: [
                { user_id: 'user-daniel', display_name: 'Daniel Santos' },
                { user_id: 'user-thais', display_name: 'Thais Santos' }
            ],
            env: files.env,
            now: '2026-07-30T16:00:00.000Z'
        });

        assert.equal(truth.status, 'partial');
        assert.equal(truth.bankAccounts.status, 'partial');
        assert.equal(truth.creditCards.status, 'partial');
    } finally {
        files.cleanup();
    }
});

test('dashboard financial truth marks card data partial when used limit is absent', () => {
    const partialSnapshot = snapshot();
    partialSnapshot.items[0].accounts
        .find(account => account.type === 'CREDIT').used_limit_cents = null;
    const files = fixture(partialSnapshot);
    try {
        const { loadOpenFinanceDashboardSnapshot } = require('../src/services/dashboardFinancialTruthService');
        const truth = loadOpenFinanceDashboardSnapshot({
            userIds: ['user-daniel'],
            users: [{ user_id: 'user-daniel', display_name: 'Daniel Santos' }],
            env: files.env,
            now: '2026-07-30T16:00:00.000Z'
        });

        assert.equal(truth.creditCards.status, 'partial');
        assert.equal(truth.creditCards.items[0].usedLimit, null);
    } finally {
        files.cleanup();
    }
});

test('dashboard financial truth separates bank balance, current bill and card limits for the authorized family', () => {
    const files = fixture();
    try {
        const {
            loadOpenFinanceDashboardSnapshot,
            applyDashboardFinancialTruth
        } = require('../src/services/dashboardFinancialTruthService');
        const truth = loadOpenFinanceDashboardSnapshot({
            userIds: ['user-daniel', 'user-thais'],
            users: [
                { user_id: 'user-daniel', display_name: 'Daniel Santos' },
                { user_id: 'user-thais', display_name: 'Thaís Santos' }
            ],
            env: files.env,
            now: '2026-07-30T16:00:00.000Z'
        });

        assert.equal(truth.status, 'available');
        assert.equal(truth.bankAccounts.totalBalance, 69.12);
        assert.deepEqual(truth.bankAccounts.items.map(item => item.balance), [12.34, 56.78]);
        assert.equal(truth.creditCards.totalCurrentInvoice, 777.87);
        assert.deepEqual(
            truth.creditCards.items.map(card => [
                card.currentInvoice,
                card.totalLimit,
                card.availableLimit,
                card.usedLimit
            ]),
            [
                [456.78, 4000, 1234.56, 2765.44],
                [321.09, 2500, 987.65, 1512.35]
            ]
        );
        assert.notEqual(
            truth.creditCards.items[0].currentInvoice,
            truth.creditCards.items[0].usedLimit,
            'used limit must never be relabeled as the current bill'
        );

        const merged = applyDashboardFinancialTruth({
            financialAccounts: {
                totalBalance: 9999,
                items: [{ name: 'estimativa', balance: 9999 }]
            }
        }, truth);
        assert.equal(merged.financialAccounts.totalBalance, 69.12);
        assert.equal(merged.financialAccounts.source, 'open_finance');
        assert.equal(merged.creditCards.totalCurrentInvoice, 777.87);
    } finally {
        files.cleanup();
    }
});

test('dashboard financial truth is user scoped and marks an old observation as partial', () => {
    const files = fixture();
    try {
        const { loadOpenFinanceDashboardSnapshot } = require('../src/services/dashboardFinancialTruthService');
        const truth = loadOpenFinanceDashboardSnapshot({
            userIds: ['user-daniel'],
            users: [
                { user_id: 'user-daniel', display_name: 'Daniel Santos' },
                { user_id: 'user-thais', display_name: 'Thaís Santos' }
            ],
            env: files.env,
            now: '2026-07-31T12:01:00.000Z'
        });

        assert.equal(truth.status, 'partial');
        assert.equal(truth.stale, true);
        assert.deepEqual(truth.bankAccounts.items.map(item => item.owner), ['Daniel']);
        assert.deepEqual(truth.creditCards.items.map(item => item.owner), ['Daniel']);
    } finally {
        files.cleanup();
    }
});

test('dashboard financial truth fails closed when its encrypted source is unavailable', () => {
    const { loadOpenFinanceDashboardSnapshot, applyDashboardFinancialTruth } =
        require('../src/services/dashboardFinancialTruthService');
    const truth = loadOpenFinanceDashboardSnapshot({
        userIds: ['user-daniel'],
        users: [{ user_id: 'user-daniel', display_name: 'Daniel' }],
        env: {}
    });
    assert.equal(truth.status, 'unavailable');
    assert.equal(truth.bankAccounts.totalBalance, null);
    assert.equal(truth.creditCards.totalCurrentInvoice, null);

    const merged = applyDashboardFinancialTruth({
        financialAccounts: {
            totalBalance: 10,
            items: [{ name: 'Conta estimada', balance: 10 }]
        }
    }, truth);
    assert.equal(merged.financialAccounts.status, 'fallback');
    assert.equal(merged.financialAccounts.timeBasis, 'ledger_estimate');
    assert.equal(merged.financialAccounts.totalBalance, 10);
});
