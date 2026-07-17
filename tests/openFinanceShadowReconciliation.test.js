const assert = require('node:assert/strict');
const test = require('node:test');
const { reconcileOpenFinanceShadow } = require('../src/openFinance/openFinanceShadowReconciler');
const { OpenFinanceShadowPreviewStore } = require('../src/openFinance/openFinanceShadowPreviewStore');
const { OpenFinanceRevocationJournal } = require('../src/openFinance/openFinanceRevocationJournal');

const secret = 'open-finance-shadow-test-secret-32-bytes';
const danielWhatsapp = '5511999999999@c.us';
const thaisWhatsapp = '5511888888888@c.us';
const authorizedWhatsAppIds = [danielWhatsapp, thaisWhatsapp];
function item(transactions) { return { id: 'item-1', alias_code: 'daniel_nubank', transactions }; }

test('9D matches exact amount date direction and description without writes', () => {
    const result = reconcileOpenFinanceShadow({ secret, openFinanceItems: [item([{ id: 'p1', date: '2026-07-15', description: 'Mercado Central', amount_cents: -12500, type: 'DEBIT' }])], canonicalTransactions: [{ id: 'c1', date: '15/07/2026', description: 'Mercado Central', amountCents: 12500, direction: 'debit' }] });
    assert.equal(result.decisions[0].status, 'matched');
    assert.equal(result.phase3g_links.length, 1);
    assert.equal(result.financial_writes, 0);
});

test('9D marks reused canonical candidate as possible duplicate', () => {
    const source = { date: '2026-07-15', description: 'Loja A', amount_cents: -5000, type: 'DEBIT' };
    const result = reconcileOpenFinanceShadow({ secret, openFinanceItems: [item([{ ...source, id: 'p1' }, { ...source, id: 'p2' }])], canonicalTransactions: [{ id: 'c1', date: '15/07/2026', description: 'Loja A', amountCents: 5000, direction: 'debit' }] });
    assert.deepEqual(result.decisions.map(row => row.status), ['possible_duplicate', 'possible_duplicate']);
});

test('9D keeps amount and date match with different text as possible duplicate', () => {
    const result = reconcileOpenFinanceShadow({ secret, openFinanceItems: [item([{ id: 'p1', date: '2026-07-15', description: 'PAGAMENTO TRANSACAO', amount_cents: -5000, type: 'DEBIT' }])], canonicalTransactions: [{ id: 'c1', date: '15/07/2026', description: 'Descricao manual diferente', amountCents: 5000, direction: 'debit' }] });
    assert.equal(result.decisions[0].status, 'possible_duplicate');
    assert.equal(result.decisions[0].rule, 'weak_candidate');
});

test('9D never matches unavailable date or different direction', () => {
    const result = reconcileOpenFinanceShadow({ secret, openFinanceItems: [item([{ id: 'p1', date: null, description: 'Salario', amount_cents: 100000, type: 'CREDIT' }, { id: 'p2', date: '2026-07-15', description: 'Salario', amount_cents: 100000, type: 'CREDIT' }])], canonicalTransactions: [{ id: 'c1', date: '15/07/2026', description: 'Salario', amountCents: 100000, direction: 'debit' }] });
    assert.equal(result.decisions[0].status, 'uncertain');
    assert.equal(result.decisions[1].status, 'new');
});

test('9D output uses refs and does not expose descriptions', () => {
    const result = reconcileOpenFinanceShadow({ secret, openFinanceItems: [item([{ id: 'private-id', date: '2026-07-15', description: 'DESCRICAO PRIVADA', amount_cents: -100, type: 'DEBIT' }])], canonicalTransactions: [] });
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('DESCRICAO PRIVADA'), false);
    assert.equal(serialized.includes('private-id'), false);
});

test('9D.1 persists only reviewable previews encrypted and idempotent', () => {
    const openFinanceItems = [item([{ id: 'private-id', date: '2026-07-15', description: 'DESCRICAO PRIVADA', amount_cents: -5000, type: 'DEBIT' }])];
    const canonicalTransactions = [{ id: 'c1', date: '15/07/2026', description: 'Texto manual', amountCents: 5000, direction: 'debit' }];
    const reconciliation = reconcileOpenFinanceShadow({ secret, openFinanceItems, canonicalTransactions });
    const store = new OpenFinanceShadowPreviewStore({ secret, authorizedWhatsAppIds });
    try {
        assert.deepEqual(store.ingest({ decisions: reconciliation.decisions, openFinanceItems, canonicalTransactions }), {
            inserted: 1, replayed: 0, reviewable: 1, financial_writes: 0
        });
        assert.equal(store.ingest({ decisions: reconciliation.decisions, openFinanceItems, canonicalTransactions }).replayed, 1);
        const pending = store.listPending({ actorWhatsappId: danielWhatsapp });
        assert.equal(pending.length, 1);
        assert.equal(JSON.stringify(pending).includes('DESCRICAO PRIVADA'), false);
        assert.equal(store.readPrivate(pending[0].preview_ref, {
            actorWhatsappId: danielWhatsapp
        }).source.description, 'DESCRICAO PRIVADA');
    } finally { store.close(); }
});

test('9D.1 review is idempotent and never writes financial data', () => {
    const openFinanceItems = [item([{ id: 'p1', date: null, description: 'Privado', amount_cents: -100, type: 'DEBIT' }])];
    const reconciliation = reconcileOpenFinanceShadow({ secret, openFinanceItems, canonicalTransactions: [] });
    const store = new OpenFinanceShadowPreviewStore({ secret, authorizedWhatsAppIds });
    try {
        store.ingest({ decisions: reconciliation.decisions, openFinanceItems, canonicalTransactions: [] });
        const ref = store.listPending({ actorWhatsappId: danielWhatsapp })[0].preview_ref;
        assert.deepEqual(store.review(ref, 'ignore', { actorWhatsappId: thaisWhatsapp }),
            { applied: true, replay: false, financial_writes: 0 });
        assert.deepEqual(store.review(ref, 'ignore', { actorWhatsappId: danielWhatsapp }),
            { applied: false, replay: true, financial_writes: 0 });
        assert.throws(() => store.review(ref, 'not_duplicate', {
            actorWhatsappId: danielWhatsapp
        }), /review_conflict/);
    } finally { store.close(); }
});

test('9D.1 family preview refreshes pending payload and expires after retention', () => {
    let now = '2026-07-17T12:00:00.000Z';
    const canonicalTransactions = [{
        id: 'c1', date: '17/07/2026', description: 'Texto manual', amountCents: 5000, direction: 'debit'
    }];
    const firstItems = [item([{
        id: 'p-refresh', date: '2026-07-17', description: 'PRIMEIRO TEXTO',
        amount_cents: -5000, type: 'DEBIT'
    }])];
    const first = reconcileOpenFinanceShadow({ secret, openFinanceItems: firstItems, canonicalTransactions });
    const store = new OpenFinanceShadowPreviewStore({
        secret,
        authorizedWhatsAppIds,
        clock: () => now
    });
    try {
        store.ingest({ decisions: first.decisions, openFinanceItems: firstItems, canonicalTransactions,
            observedAt: now });
        const previewRef = store.listPending({ actorWhatsappId: danielWhatsapp })[0].preview_ref;
        const refreshedItems = [item([{
            ...firstItems[0].transactions[0],
            description: 'TEXTO ATUALIZADO'
        }])];
        const refreshed = reconcileOpenFinanceShadow({
            secret, openFinanceItems: refreshedItems, canonicalTransactions
        });
        now = '2026-07-18T12:00:00.000Z';
        assert.equal(store.ingest({ decisions: refreshed.decisions, openFinanceItems: refreshedItems,
            canonicalTransactions, observedAt: '2026-07-18T12:00:00.000Z' }).replayed, 1);
        assert.equal(store.readPrivate(previewRef, {
            actorWhatsappId: thaisWhatsapp
        }).source.description, 'TEXTO ATUALIZADO');

        now = '2026-08-16T12:00:00.000Z';
        assert.equal(store.listPending({ actorWhatsappId: danielWhatsapp }).length, 0);
        assert.equal(store.stats().total, 0);
    } finally { store.close(); }
});

test('9D.1 preview rejects a revoked connection generation', () => {
    const journal = new OpenFinanceRevocationJournal({ secret });
    journal.recordRevocation({ alias: 'daniel_nubank', generation: 1 });
    const openFinanceItems = [{ ...item([{
        id: 'p-revoked', date: null, description: 'Privado', amount_cents: -100, type: 'DEBIT'
    }]), generation: 1 }];
    const reconciliation = reconcileOpenFinanceShadow({ secret, openFinanceItems, canonicalTransactions: [] });
    const store = new OpenFinanceShadowPreviewStore({ secret, revocationJournal: journal });
    try {
        assert.throws(() => store.ingest({
            decisions: reconciliation.decisions,
            openFinanceItems,
            canonicalTransactions: []
        }), /revoked_generation/);
        assert.equal(store.stats().total, 0);
    } finally { store.close(); journal.close(); }
});

test('family review requires Daniel or Thais WhatsApp in addition to the preview reference', () => {
    const openFinanceItems = [item([{
        id: 'p-auth', date: null, description: 'Privado', amount_cents: -100, type: 'DEBIT'
    }])];
    const reconciliation = reconcileOpenFinanceShadow({ secret, openFinanceItems, canonicalTransactions: [] });
    const store = new OpenFinanceShadowPreviewStore({ secret, authorizedWhatsAppIds });
    try {
        store.ingest({ decisions: reconciliation.decisions, openFinanceItems, canonicalTransactions: [] });
        assert.throws(() => store.listPending(), /actor_required/);
        const previewRef = store.listPending({ actorWhatsappId: danielWhatsapp })[0].preview_ref;
        assert.throws(() => store.readPrivate(previewRef), /actor_required/);
        assert.throws(() => store.readPrivate(previewRef, {
            actorWhatsappId: '5511777777777@c.us'
        }), /actor_unauthorized/);
        assert.throws(() => store.review(previewRef, 'ignore', {
            actorWhatsappId: '5511777777777@c.us'
        }), /actor_unauthorized/);
        assert.equal(store.readPrivate(previewRef, {
            actorWhatsappId: thaisWhatsapp
        }).source.description, 'Privado');
    } finally { store.close(); }
});

test('preview rejects future observations and keeps generations separate', () => {
    const now = '2026-07-17T12:00:00.000Z';
    const baseItem = item([{
        id: 'p-generation', date: null, description: 'Privado', amount_cents: -100, type: 'DEBIT'
    }]);
    const decisions = reconcileOpenFinanceShadow({
        secret,
        openFinanceItems: [baseItem],
        canonicalTransactions: []
    }).decisions;
    const store = new OpenFinanceShadowPreviewStore({
        secret,
        authorizedWhatsAppIds,
        clock: () => now
    });
    try {
        assert.throws(() => store.ingest({
            decisions,
            openFinanceItems: [{ ...baseItem, generation: 1 }],
            observedAt: '2026-07-17T12:06:00.000Z'
        }), /future_observation/);
        store.ingest({ decisions, openFinanceItems: [{ ...baseItem, generation: 1 }], observedAt: now });
        store.ingest({ decisions, openFinanceItems: [{ ...baseItem, generation: 2 }], observedAt: now });
        assert.equal(store.listPending({ actorWhatsappId: danielWhatsapp }).length, 2);
    } finally { store.close(); }
});

test('replay of a reviewed preview stays closed and is not counted as reviewable', () => {
    const openFinanceItems = [item([{
        id: 'p-reviewed', date: null, description: 'Privado', amount_cents: -100, type: 'DEBIT'
    }])];
    const reconciliation = reconcileOpenFinanceShadow({ secret, openFinanceItems, canonicalTransactions: [] });
    const store = new OpenFinanceShadowPreviewStore({ secret, authorizedWhatsAppIds });
    try {
        store.ingest({ decisions: reconciliation.decisions, openFinanceItems, canonicalTransactions: [] });
        const previewRef = store.listPending({ actorWhatsappId: danielWhatsapp })[0].preview_ref;
        store.review(previewRef, 'ignore', { actorWhatsappId: danielWhatsapp });
        assert.deepEqual(store.ingest({
            decisions: reconciliation.decisions,
            openFinanceItems,
            canonicalTransactions: []
        }), { inserted: 0, replayed: 0, reviewable: 0, financial_writes: 0 });
        assert.equal(store.listPending({ actorWhatsappId: thaisWhatsapp }).length, 0);
        assert.equal(store.stats().reviewed, 1);
    } finally { store.close(); }
});
