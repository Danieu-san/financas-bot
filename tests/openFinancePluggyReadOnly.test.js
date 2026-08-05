const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { PluggyReadOnlyClient } = require('../src/openFinance/pluggyReadOnlyClient');
const { normalizePluggyReadOnlySnapshot } = require('../src/openFinance/pluggyReadOnlyContract');
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');

function response(status, payload, headers = {}) {
    return {
        status,
        headers: { get: (name) => headers[String(name).toLowerCase()] || null },
        json: async () => payload
    };
}

function mapping(itemId = 'item-daniel-001') {
    return [{ itemId, alias: 'daniel_nubank', ownerScope: 'daniel' }];
}

function rawSnapshot() {
    return {
        mode: 'live_readonly_staging',
        eventId: 'event-live-001',
        observedAt: '2026-07-15T20:00:00.000Z',
        items: [{
            mapping: mapping()[0],
            item: { id: 'item-daniel-001', connectorId: '200', status: 'UPDATED' },
            availability: { accounts: 'available', transactions: 'available', bills: 'available', investments: 'available' },
            accounts: [{
                id: 'account-card-001', type: 'CREDIT', subtype: 'CREDIT_CARD',
                currencyCode: 'BRL', balance: 1737.92,
                creditData: { creditLimit: 4150, availableCreditLimit: 2412.08 }
            }],
            transactions: [{
                id: 'transaction-001', accountId: 'account-card-001', description: 'COMPRA PRIVADA',
                amount: 100, currencyCode: 'BRL', date: '2026-07-15T10:00:00.000Z', status: 'PENDING', type: 'DEBIT'
            }],
            bills: [{
                id: 'bill-001', accountId: 'account-card-001', dueDate: '2026-07-15T00:00:00.000Z',
                totalAmount: 928.39, totalAmountCurrencyCode: 'BRL'
            }],
            investments: [{
                id: 'investment-001', name: 'CAIXINHA PRIVADA', type: 'FIXED_INCOME', subtype: 'CDB',
                balance: 500, currencyCode: 'BRL', status: 'ACTIVE'
            }]
        }]
    };
}

test('contrato separa limite utilizado, balance do cartao e fatura formal', () => {
    const payload = rawSnapshot();
    delete payload.items[0].item.status;
    payload.items[0].item.executionStatus = 'SUCCESS';
    const snapshot = normalizePluggyReadOnlySnapshot(payload);
    const account = snapshot.items[0].accounts[0];
    assert.equal(account.balance_cents, 173792);
    assert.equal(account.used_limit_cents, 173792);
    assert.equal(snapshot.items[0].bills[0].total_cents, 92839);
    assert.notEqual(account.used_limit_cents, snapshot.items[0].bills[0].total_cents);
    assert.equal(snapshot.items[0].investments[0].subtype, 'CDB');
    assert.equal(snapshot.items[0].status, 'SUCCESS');
    assert.equal(snapshot.items[0].availability.investment_transactions, 'unavailable');
    assert.equal(snapshot.items[0].investments[0].transaction_history.availability, 'unavailable');
});

test('contrato normaliza historico minimo por posicao sem carregar descricao privada', () => {
    const payload = rawSnapshot();
    payload.items[0].availability.investment_transactions = 'available';
    payload.items[0].investments[0].transactionAvailability = 'available';
    payload.items[0].investments[0].transactions = [{
        type: 'BUY', description: 'APLICACAO PRIVADA', quantity: 1.25, value: 2,
        amount: 5, netAmount: 4.9,
        date: '2026-07-14T10:00:00.000Z', tradeDate: '2026-07-15T10:00:00.000Z'
    }];

    const snapshot = normalizePluggyReadOnlySnapshot(payload);
    const investment = snapshot.items[0].investments[0];
    assert.equal(snapshot.schema_version, 2);
    assert.equal(snapshot.items[0].availability.investment_transactions, 'available');
    assert.deepEqual(investment.transaction_history, {
        availability: 'available',
        transactions: [{
            type: 'BUY', amount_cents: 500, net_amount_cents: 490,
            date: '2026-07-14T10:00:00.000Z', trade_date: '2026-07-15T10:00:00.000Z'
        }]
    });
    assert.doesNotMatch(JSON.stringify(investment), /APLICACAO PRIVADA/);

    payload.items[0].investments[0].transactions[0].type = 'UNKNOWN';
    assert.throws(() => normalizePluggyReadOnlySnapshot(payload), /invalid_investment_transaction_type/);
    payload.items[0].investments[0].transactions[0].type = 'BUY';
    delete payload.items[0].investments[0].transactions[0].quantity;
    assert.throws(() => normalizePluggyReadOnlySnapshot(payload), /invalid_investment_transaction_quantity/);
    payload.items[0].investments[0].transactions[0].quantity = null;
    assert.throws(() => normalizePluggyReadOnlySnapshot(payload), /invalid_investment_transaction_quantity/);
});

test('cliente usa apenas auth e endpoints GET read-only com paginacao v2', async () => {
    const calls = [];
    const mockFetch = async (url, options) => {
        const parsed = new URL(url);
        calls.push({ method: options.method, path: `${parsed.pathname}${parsed.search}` });
        if (parsed.pathname === '/auth') return response(200, { apiKey: 'ephemeral-api-key' });
        if (parsed.pathname.startsWith('/items/')) return response(200, { id: 'item-daniel-001', connectorId: '200', status: 'UPDATED' });
        if (parsed.pathname === '/accounts') return response(200, { results: rawSnapshot().items[0].accounts });
        if (parsed.pathname === '/v2/transactions' && !parsed.searchParams.has('after')) {
            return response(200, { results: rawSnapshot().items[0].transactions, next: '?accountId=account-card-001&after=cursor-1' });
        }
        if (parsed.pathname === '/v2/transactions') return response(200, { results: [], next: null });
        if (parsed.pathname === '/bills') return response(200, { results: rawSnapshot().items[0].bills });
        if (parsed.pathname === '/investments') return response(200, { results: rawSnapshot().items[0].investments });
        if (parsed.pathname === '/investments/investment-001/transactions') {
            return response(200, { total: 0, totalPages: 0, page: 1, results: [] });
        }
        return response(500, {});
    };
    const client = new PluggyReadOnlyClient({
        clientId: 'client-id', clientSecret: 'client-secret', itemMappings: mapping(), fetchImpl: mockFetch
    });
    const snapshot = await client.readSnapshot({ eventId: 'event-client-001', observedAt: '2026-07-15T20:00:00.000Z' });
    assert.equal(snapshot.items[0].transactions.length, 1);
    assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
    assert.equal(calls[0].path, '/auth');
    assert.equal(calls.slice(1).every((call) => call.method === 'GET'), true);
    assert.equal(calls.some((call) => call.path.startsWith('/v2/transactions?')), true);
    assert.equal(calls.some((call) => call.path.startsWith('/investments/investment-001/transactions?')), true);
});

test('cliente pagina historico por posicao e distingue indisponibilidade de lista vazia', async () => {
    const calls = [];
    const mockFetch = async (url) => {
        const parsed = new URL(url);
        calls.push(`${parsed.pathname}${parsed.search}`);
        if (parsed.pathname === '/auth') return response(200, { apiKey: 'ephemeral-api-key' });
        if (parsed.pathname.startsWith('/items/')) return response(200, {
            id: 'item-daniel-001', connectorId: '200', status: 'UPDATED'
        });
        if (parsed.pathname === '/accounts') return response(200, { results: rawSnapshot().items[0].accounts });
        if (parsed.pathname === '/v2/transactions') return response(200, { results: [], next: null });
        if (parsed.pathname === '/bills') return response(200, { results: [] });
        if (parsed.pathname === '/investments') return response(200, { results: rawSnapshot().items[0].investments });
        if (parsed.pathname === '/investments/investment-001/transactions') {
            const page = Number(parsed.searchParams.get('page'));
            if (page === 1) return response(200, {
                total: 2, totalPages: 2, page: 1, results: [{
                    type: 'BUY', quantity: 1, value: 10, amount: 10,
                    date: '2026-07-10T00:00:00.000Z', tradeDate: '2026-07-10T00:00:00.000Z'
                }]
            });
            return response(200, { total: 2, totalPages: 2, page: 2, results: [{
                type: 'INTEREST', quantity: 0, value: 0, amount: 1,
                date: '2026-07-11T00:00:00.000Z', tradeDate: '2026-07-11T00:00:00.000Z'
            }] });
        }
        return response(500, {});
    };
    const client = new PluggyReadOnlyClient({
        clientId: 'client-id', clientSecret: 'client-secret', itemMappings: mapping(), fetchImpl: mockFetch
    });
    const snapshot = await client.readSnapshot({ eventId: 'event-investment-pages' });
    assert.equal(snapshot.items[0].availability.investment_transactions, 'available');
    assert.equal(snapshot.items[0].investments[0].transaction_history.transactions.length, 2);
    assert.equal(snapshot.collection_health.investment_transaction_pages, 2);
    assert.equal(calls.filter(path => path.startsWith('/investments/investment-001/transactions?')).length, 2);

    const unavailableClient = new PluggyReadOnlyClient({
        clientId: 'client-id', clientSecret: 'client-secret', itemMappings: mapping(),
        fetchImpl: async (url) => {
            const parsed = new URL(url);
            if (parsed.pathname === '/auth') return response(200, { apiKey: 'ephemeral-api-key' });
            if (parsed.pathname.startsWith('/items/')) return response(200, {
                id: 'item-daniel-001', connectorId: '200', status: 'UPDATED'
            });
            if (parsed.pathname === '/accounts') return response(200, { results: rawSnapshot().items[0].accounts });
            if (parsed.pathname === '/v2/transactions') return response(200, { results: [], next: null });
            if (parsed.pathname === '/bills') return response(200, { results: [] });
            if (parsed.pathname === '/investments') return response(200, { results: rawSnapshot().items[0].investments });
            if (parsed.pathname === '/investments/investment-001/transactions') return response(404, {});
            return response(500, {});
        }
    });
    const unavailable = await unavailableClient.readSnapshot({ eventId: 'event-investment-unavailable' });
    assert.equal(unavailable.items[0].availability.investment_transactions, 'unavailable');
    assert.deepEqual(unavailable.items[0].investments[0].transaction_history, {
        availability: 'unavailable', transactions: []
    });
});

test('erro nao opcional no historico por posicao rejeita o snapshot inteiro', async () => {
    const client = new PluggyReadOnlyClient({
        clientId: 'client-id', clientSecret: 'client-secret', itemMappings: mapping(),
        fetchImpl: async (url) => {
            const parsed = new URL(url);
            if (parsed.pathname === '/auth') return response(200, { apiKey: 'ephemeral-api-key' });
            if (parsed.pathname.startsWith('/items/')) return response(200, {
                id: 'item-daniel-001', connectorId: '200', status: 'UPDATED'
            });
            if (parsed.pathname === '/accounts') return response(200, { results: rawSnapshot().items[0].accounts });
            if (parsed.pathname === '/v2/transactions') return response(200, { results: [], next: null });
            if (parsed.pathname === '/bills') return response(200, { results: [] });
            if (parsed.pathname === '/investments') return response(200, { results: rawSnapshot().items[0].investments });
            if (parsed.pathname === '/investments/investment-001/transactions') return response(500, {});
            return response(500, {});
        }
    });
    await assert.rejects(() => client.readSnapshot({ eventId: 'event-investment-error' }), /pluggy_http_500/);
});

test('cliente agrega cobertura mista como parcial e limita paginacao por posicao', async () => {
    const investments = [
        rawSnapshot().items[0].investments[0],
        { ...rawSnapshot().items[0].investments[0], id: 'investment-002', name: 'OUTRA POSICAO' }
    ];
    const makeFetch = ({ forceTwoPages = false } = {}) => async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname === '/auth') return response(200, { apiKey: 'ephemeral-api-key' });
        if (parsed.pathname.startsWith('/items/')) return response(200, {
            id: 'item-daniel-001', connectorId: '200', status: 'UPDATED'
        });
        if (parsed.pathname === '/accounts') return response(200, { results: rawSnapshot().items[0].accounts });
        if (parsed.pathname === '/v2/transactions') return response(200, { results: [], next: null });
        if (parsed.pathname === '/bills') return response(200, { results: [] });
        if (parsed.pathname === '/investments') return response(200, {
            results: forceTwoPages ? investments.slice(0, 1) : investments
        });
        if (parsed.pathname === '/investments/investment-001/transactions') {
            return response(200, { totalPages: forceTwoPages ? 2 : 1, page: 1, results: [] });
        }
        if (parsed.pathname === '/investments/investment-002/transactions') return response(403, {});
        return response(500, {});
    };
    const mixedClient = new PluggyReadOnlyClient({
        clientId: 'client-id', clientSecret: 'client-secret', itemMappings: mapping(), fetchImpl: makeFetch()
    });
    const mixed = await mixedClient.readSnapshot({ eventId: 'event-investment-mixed' });
    assert.equal(mixed.items[0].availability.investment_transactions, 'partial');
    assert.deepEqual(mixed.items[0].investments.map(row => row.transaction_history.availability),
        ['available', 'unavailable']);

    const limitedClient = new PluggyReadOnlyClient({
        clientId: 'client-id', clientSecret: 'client-secret', itemMappings: mapping(),
        fetchImpl: makeFetch({ forceTwoPages: true }), maxInvestmentTransactionPages: 1
    });
    await assert.rejects(() => limitedClient.readSnapshot({ eventId: 'event-investment-page-limit' }),
        /pluggy_investment_transaction_page_limit/);
});

test('cliente conclui cinco paginas antes de declarar collection health completa', async () => {
    const mockFetch = async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname === '/auth') return response(200, { apiKey: 'ephemeral-api-key' });
        if (parsed.pathname.startsWith('/items/')) return response(200, { id: 'item-daniel-001', connectorId: '200', status: 'UPDATED' });
        if (parsed.pathname === '/accounts') return response(200, { results: rawSnapshot().items[0].accounts });
        if (parsed.pathname === '/v2/transactions') {
            const page = Number(parsed.searchParams.get('page') || 1);
            const size = page < 5 ? 500 : 205;
            return response(200, {
                results: Array.from({ length: size }, (_, index) => ({ ...rawSnapshot().items[0].transactions[0], id: `tx-${page}-${index}` })),
                next: page < 5 ? `?accountId=account-card-001&page=${page + 1}` : null
            });
        }
        if (parsed.pathname === '/bills') return response(200, { results: [] });
        if (parsed.pathname === '/investments') return response(200, { results: [] });
        return response(500, {});
    };
    const client = new PluggyReadOnlyClient({ clientId: 'client-id', clientSecret: 'client-secret', itemMappings: mapping(), fetchImpl: mockFetch });
    const snapshot = await client.readSnapshot({ eventId: 'event-five-pages', observedAt: '2026-07-16T10:00:00.000Z' });
    assert.equal(snapshot.items[0].transactions.length, 2205);
    assert.deepEqual(snapshot.collection_health, {
        complete: true, warning_count: 0, transaction_pages: 5,
        investment_pages: 1, investment_transaction_pages: 0
    });
});

test('warning bloqueador no meio da paginacao rejeita o snapshot inteiro', async () => {
    const mockFetch = async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname === '/auth') return response(200, { apiKey: 'ephemeral-api-key' });
        if (parsed.pathname.startsWith('/items/')) return response(200, { id: 'item-daniel-001', connectorId: '200', status: 'UPDATED' });
        if (parsed.pathname === '/accounts') return response(200, { results: rawSnapshot().items[0].accounts });
        if (parsed.pathname === '/v2/transactions') {
            if (parsed.searchParams.has('after')) return response(200, { results: [], warnings: [{ code: 'permission_partial' }] });
            return response(200, { results: rawSnapshot().items[0].transactions, next: '?accountId=account-card-001&after=cursor-1' });
        }
        return response(200, { results: [] });
    };
    const client = new PluggyReadOnlyClient({ clientId: 'client-id', clientSecret: 'client-secret', itemMappings: mapping(), fetchImpl: mockFetch });
    await assert.rejects(() => client.readSnapshot({ eventId: 'event-warning' }), /pluggy_blocking_warning/);
});

test('Bills indisponivel permanece indisponivel e nao vira balance ou zero', async () => {
    const mockFetch = async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname === '/auth') return response(200, { apiKey: 'ephemeral-api-key' });
        if (parsed.pathname.startsWith('/items/')) return response(200, { id: 'item-daniel-001', connectorId: '200', status: 'UPDATED' });
        if (parsed.pathname === '/accounts') return response(200, { results: rawSnapshot().items[0].accounts });
        if (parsed.pathname === '/v2/transactions') return response(200, { results: [], next: null });
        if (parsed.pathname === '/bills') return response(403, {});
        if (parsed.pathname === '/investments') return response(200, { results: [] });
        return response(500, {});
    };
    const client = new PluggyReadOnlyClient({
        clientId: 'client-id', clientSecret: 'client-secret', itemMappings: mapping(), fetchImpl: mockFetch
    });
    const snapshot = await client.readSnapshot({ eventId: 'event-client-002', observedAt: '2026-07-15T20:00:00.000Z' });
    assert.equal(snapshot.items[0].availability.bills, 'unavailable');
    assert.equal(snapshot.items[0].bills.length, 0);
    assert.equal(snapshot.items[0].accounts[0].balance_cents, 173792);
});

test('9F 401 and 403 on required sources fail closed without a snapshot', async () => {
    const authDenied = new PluggyReadOnlyClient({ clientId: 'client-id', clientSecret: 'client-secret',
        itemMappings: mapping(), fetchImpl: async () => response(401, {}) });
    await assert.rejects(() => authDenied.readSnapshot({ eventId: 'event-401' }), /pluggy_http_401/);

    const accountDenied = new PluggyReadOnlyClient({ clientId: 'client-id', clientSecret: 'client-secret',
        itemMappings: mapping(), fetchImpl: async (url) => {
            const parsed = new URL(url);
            if (parsed.pathname === '/auth') return response(200, { apiKey: 'ephemeral-api-key' });
            if (parsed.pathname.startsWith('/items/')) return response(200, { id: 'item-daniel-001', connectorId: '200', status: 'UPDATED' });
            if (parsed.pathname === '/accounts') return response(403, {});
            return response(500, {});
        } });
    await assert.rejects(() => accountDenied.readSnapshot({ eventId: 'event-403' }), /pluggy_http_403/);
});

test('9F OUTDATED item fails closed instead of emitting stale financial alerts', async () => {
    const client = new PluggyReadOnlyClient({ clientId: 'client-id', clientSecret: 'client-secret',
        itemMappings: mapping(), fetchImpl: async (url) => {
            const parsed = new URL(url);
            if (parsed.pathname === '/auth') return response(200, { apiKey: 'ephemeral-api-key' });
            if (parsed.pathname.startsWith('/items/')) return response(200, { id: 'item-daniel-001', connectorId: '200', status: 'OUTDATED' });
            if (parsed.pathname === '/accounts') return response(200, { results: rawSnapshot().items[0].accounts });
            if (parsed.pathname === '/v2/transactions') return response(200, { results: [], next: null });
            return response(200, { results: [] });
        } });
    await assert.rejects(() => client.readSnapshot({ eventId: 'event-outdated' }), /item_status_unhealthy/);
});

test('vault cifra dados financeiros e preserva itens separados por alias', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-pluggy-live-vault-'));
    const databasePath = path.join(temp, 'live.sqlite');
    const vault = new OpenFinanceLiveStagingVault({ databasePath, secret: 'live-staging-test-secret-with-32-characters' });
    const payload = rawSnapshot();
    payload.items[0].availability.investment_transactions = 'available';
    payload.items[0].investments[0].transactionAvailability = 'available';
    payload.items[0].investments[0].transactions = [{
        type: 'BUY', description: 'MOVIMENTO INVESTIMENTO PRIVADO', quantity: 1, value: 25, amount: 25,
        date: '2026-07-14T10:00:00.000Z', tradeDate: '2026-07-15T10:00:00.000Z'
    }];
    payload.items.push({
        ...payload.items[0],
        mapping: { itemId: 'item-thais-001', alias: 'thais_nubank', ownerScope: 'thais' },
        item: { id: 'item-thais-001', connectorId: '200', status: 'UPDATED' }
    });
    const snapshot = normalizePluggyReadOnlySnapshot(payload);
    try {
        assert.deepEqual(vault.ingestSnapshot(snapshot), {
            applied: true, replay: false, staged_items: 2, blocked_items: 0, financial_writes: 0
        });
        assert.equal(vault.stats().items, 2);
        assert.equal(vault.readItemByAlias('daniel_nubank').id, 'item-daniel-001');
        assert.equal(vault.readItemByAlias('thais_nubank').id, 'item-thais-001');
        assert.equal(vault.readItemByAlias('daniel_nubank').investments[0]
            .transaction_history.availability, 'available');
        assert.equal(vault.readItemByAlias('daniel_nubank').investments[0]
            .transaction_history.transactions[0].amount_cents, 2500);
    } finally {
        vault.close();
    }
    const databaseBytes = fs.readFileSync(databasePath).toString('latin1');
    for (const forbidden of [
        'item-daniel-001', 'item-thais-001', 'COMPRA PRIVADA', 'CAIXINHA PRIVADA',
        'MOVIMENTO INVESTIMENTO PRIVADO'
    ]) {
        assert.equal(databaseBytes.includes(forbidden), false);
    }
});

test('revogacao remove payload e bloqueia replay do item', () => {
    const vault = new OpenFinanceLiveStagingVault({ secret: 'live-staging-test-secret-with-32-characters' });
    const snapshot = normalizePluggyReadOnlySnapshot(rawSnapshot());
    try {
        vault.ingestSnapshot(snapshot);
        assert.equal(vault.revokeItem('item-daniel-001').financial_writes, 0);
        assert.equal(vault.readItemByAlias('daniel_nubank'), null);
        const replay = { ...snapshot, event_id: 'event-live-002' };
        assert.equal(vault.ingestSnapshot(replay).blocked_items, 1);
        assert.equal(vault.stats().items, 0);
    } finally {
        vault.close();
    }
});
