const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { OpenFinanceBaselineStore } = require('../src/openFinance/openFinanceBaselineStore');
const { OpenFinanceShadowPreviewStore } = require('../src/openFinance/openFinanceShadowPreviewStore');
const {
    readOpenFinanceInternalSource,
    reconcileOpenFinanceRuntimeCandidates,
    observationRef
} = require('../src/openFinance/openFinanceRuntimeReconciliation');

const secret = 'open-finance-runtime-reconciliation-secret';

function createSheetDependencies({ shared = true, complete = true } = {}) {
    const rowsByRange = {
        'Saídas!A:K': [['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', '', '', '', '', 'User ID', 'Conta']],
        'Entradas!A:J': [['Data', 'Descrição', 'Categoria', 'Valor', '', '', '', '', 'User ID', 'Conta']],
        'Transferências!A:I': [['Data', 'Descrição', 'Valor', 'Origem', 'Destino', '', '', '', 'User ID']],
        'Lançamentos Cartão!A:J': complete ? [
            ['Data', 'Descrição', 'Categoria', 'Valor', 'Parcela', 'Fatura', 'Card ID', 'Cartão', '', 'User ID'],
            ['17/07/2026', 'Mercado', 'Alimentação', '10,00', '1/1', '07/2026',
                'nubank-daniel', 'Nubank Daniel', '', 'user-daniel'],
            ['17/07/2026', 'Privado', 'Outros', '999,00', '1/1', '07/2026',
                'nubank-outsider', 'Nubank Outsider', '', 'user-outsider']
        ] : [],
        'Cartões!A:G': [
            ['Card ID', 'Nome', '', '', '', '', 'Responsável'],
            ['nubank-daniel', 'Nubank Daniel', '', '', '', 'SIM', 'Daniel']
        ],
        'Contas Financeiras!A:I': [
            ['Nome', 'Tipo', '', '', '', '', 'Responsável', 'User ID', ''],
            ['Daniel - Nubank', 'Conta corrente', '', '', '', '', 'Daniel', 'user-daniel', '']
        ]
    };
    return {
        hasUserSpreadsheetContext: async () => shared,
        getFinancialScopeUserIds: () => ['user-daniel', 'user-thais'],
        runWithUserSheetContext: async (user, fn) => {
            assert.equal(user.user_id, 'user-daniel');
            return fn();
        },
        readDataFromSheet: async (range, options) => {
            assert.equal(options.requireUserScoped, true);
            return rowsByRange[range] || [];
        }
    };
}

function creditItem(transactions) {
    return {
        id: 'item-daniel-0001',
        alias_code: 'daniel_nubank',
        owner_scope: 'daniel',
        availability: { accounts: 'available', transactions: 'available' },
        accounts: [{ id: 'credit-account', type: 'CREDIT' }],
        transactions
    };
}

function providerTransaction(id, amount, description, extra = {}) {
    return {
        id,
        account_id: 'credit-account',
        amount_cents: amount,
        description,
        date: '2026-07-17T10:00:00.000Z',
        status: 'POSTED',
        ...extra
    };
}

function candidateFor(item, transaction, correlationState = 'new_event') {
    return {
        observation_ref: observationRef(secret, item.id, transaction.account_id, transaction.id),
        external_event_ref: `external-${transaction.id}`,
        correlation_state: correlationState,
        provider_status: transaction.status,
        created_at: '2026-07-17T12:00:00.000Z'
    };
}

test('post-9F internal source requires a shared family sheet and scopes rows to allowed users', async () => {
    const result = await readOpenFinanceInternalSource({
        users: [
            { user_id: 'user-daniel', display_name: 'Daniel' },
            { user_id: 'user-thais', display_name: 'Thaís' }
        ],
        userIds: ['user-daniel', 'user-thais'],
        aliases: ['daniel_nubank'],
        dependencies: createSheetDependencies()
    });
    assert.equal(result.available, true);
    assert.equal(result.source_health, 'available');
    assert.equal(result.source_kind, 'family_sheet');
    assert.equal(result.transactions.length, 1);
    assert.match(result.transactions[0].id, /^cartao:[a-f0-9]{40}$/);
    assert.deepEqual(result.scope_coverage.daniel_nubank, { card: true, account: true });
    assert.equal(result.unscoped_rows, 1);
    assert.doesNotMatch(JSON.stringify(result), /Privado|user-outsider/);
});

test('post-9F internal source fails closed without shared scope or a complete family sheet', async () => {
    const options = {
        users: [{ user_id: 'user-daniel', display_name: 'Daniel' }],
        userIds: ['user-daniel', 'user-thais'],
        aliases: ['daniel_nubank']
    };
    const unavailable = await readOpenFinanceInternalSource({
        ...options,
        dependencies: createSheetDependencies({ shared: false })
    });
    const incomplete = await readOpenFinanceInternalSource({
        ...options,
        dependencies: createSheetDependencies({ complete: false })
    });
    assert.equal(unavailable.source_health, 'internal_family_source_unavailable');
    assert.equal(incomplete.source_health, 'internal_family_source_incomplete');
    assert.equal(unavailable.transactions.length + incomplete.transactions.length, 0);
});

test('post-9F runtime reconciliation silences matches, reviews uncertainty and enqueues only scoped new events', () => {
    const transactions = [
        providerTransaction('matched', 1000, 'Mercado Central'),
        providerTransaction('review', 2000, 'Farmacia Central'),
        providerTransaction('new', 3000, 'Compra Nova'),
        providerTransaction('installment', 4000, 'Compra Parcelada', { total_installments: 3 })
    ];
    const item = creditItem(transactions);
    const candidates = transactions.map(transaction => candidateFor(item, transaction));
    const internalTransactions = [
        { id: 'manual-match', user_id: 'user-thais', source_type: 'cartao', date: '17/07/2026',
            description: 'Mercado Central', amountCents: 1000, direction: 'debit',
            card_id: 'nubank-daniel', card_name: 'Nubank - Daniel' },
        { id: 'manual-unscoped', user_id: 'user-daniel', source_type: 'cartao', date: '17/07/2026',
            description: 'Farmacia Central', amountCents: 2000, direction: 'debit' },
        { id: 'other-card', user_id: 'user-daniel', source_type: 'cartao', date: '17/07/2026',
            description: 'Compra Nova', amountCents: 3000, direction: 'debit',
            card_id: 'nubank-thais', card_name: 'Nubank - Thais' }
    ];
    const previewDatabasePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-open-preview-')), 'preview.sqlite');
    const result = reconcileOpenFinanceRuntimeCandidates({
        items: [item], candidates, internalTransactions, secret, previewDatabasePath
    });

    assert.deepEqual(result.decisions.map(row => row.status), [
        'matched', 'possible_duplicate', 'new', 'uncertain'
    ]);
    assert.deepEqual(result.eligibleCandidates.map(row => row.observation_ref), [candidates[2].observation_ref]);
    assert.deepEqual(result.resolutions.map(row => row.correlation_state), [
        'internal_matched', 'internal_review', 'internal_uncertain'
    ]);
    assert.equal(result.review.available, true);
    assert.equal(result.review.reviewable, 2);
    assert.equal(result.financial_writes, 0);
    assert.doesNotMatch(JSON.stringify(result), /Mercado Central|Farmacia Central|Compra Nova|Compra Parcelada/);

    const actorWhatsappId = '5511999999999@c.us';
    const preview = new OpenFinanceShadowPreviewStore({
        databasePath: previewDatabasePath,
        secret,
        authorizedWhatsAppIds: [actorWhatsappId]
    });
    try {
        assert.equal(preview.listPending({ actorWhatsappId }).length, 2);
    } finally {
        preview.close();
    }
});

test('post-9F runtime reconciliation suppresses provider lifecycle replay PENDING to POSTED', () => {
    const posted = providerTransaction('posted-version', 1000, 'Mercado', { provider_id: 'same-economic-event' });
    const item = creditItem([posted]);
    const result = reconcileOpenFinanceRuntimeCandidates({
        items: [item],
        candidates: [candidateFor(item, posted, 'alias_confirmed')],
        internalTransactions: [],
        secret
    });
    assert.equal(result.summary.lifecycle_replayed, 1);
    assert.equal(result.decisions.length, 0);
    assert.equal(result.eligibleCandidates.length, 0);
    assert.equal(result.financial_writes, 0);
});

test('post-9F runtime reconciliation fails closed for ambiguous provider account scope', () => {
    const transaction = providerTransaction('ambiguous-account', 1000, 'Mercado');
    const item = {
        ...creditItem([transaction]),
        accounts: [
            { id: 'credit-account', type: 'CREDIT' },
            { id: 'second-credit-account', type: 'CREDIT' }
        ]
    };
    const result = reconcileOpenFinanceRuntimeCandidates({
        items: [item],
        candidates: [candidateFor(item, transaction)],
        internalTransactions: [],
        secret
    });
    assert.equal(result.decisions[0].status, 'uncertain');
    assert.equal(result.decisions[0].rule, 'ambiguous_provider_account_scope');
    assert.equal(result.eligibleCandidates.length, 0);
});

test('post-9F runtime reconciliation fails closed when the internal account scope is absent', () => {
    const transaction = providerTransaction('missing-scope', 1000, 'Mercado');
    const item = creditItem([transaction]);
    const result = reconcileOpenFinanceRuntimeCandidates({
        items: [item],
        candidates: [candidateFor(item, transaction)],
        internalTransactions: [],
        scopeCoverage: { daniel_nubank: { card: false, account: true } },
        secret
    });
    assert.equal(result.decisions[0].status, 'uncertain');
    assert.equal(result.decisions[0].rule, 'internal_account_scope_unavailable');
    assert.equal(result.eligibleCandidates.length, 0);
});

test('post-9F baseline keeps sanitized reconciliation resolution durable and idempotent', () => {
    const store = new OpenFinanceBaselineStore({ secret });
    const baseItem = creditItem([providerTransaction('old', 500, 'Antiga')]);
    const first = { provider: 'pluggy', mode: 'live_readonly_staging', observed_at: '2026-07-17T10:00:00.000Z',
        collection_health: { complete: true, warning_count: 0 }, items: [baseItem] };
    const changedItem = creditItem([...baseItem.transactions, providerTransaction('candidate', 1000, 'Nova')]);
    const second = { ...first, observed_at: '2026-07-17T11:00:00.000Z', items: [changedItem] };
    try {
        store.ingestSnapshot(first);
        store.ingestSnapshot(second);
        const candidate = store.listCandidates()[0];
        const resolution = { observation_ref: candidate.observation_ref, correlation_state: 'internal_matched' };
        assert.equal(store.markCandidateResolutions([resolution]).updated, 1);
        assert.equal(store.markCandidateResolutions([resolution]).updated, 0);
        assert.equal(store.listCandidates()[0].correlation_state, 'internal_matched');
    } finally {
        store.close();
    }
});
