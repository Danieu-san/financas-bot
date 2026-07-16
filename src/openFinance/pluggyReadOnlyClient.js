const { normalizePluggyReadOnlySnapshot } = require('./pluggyReadOnlyContract');

const API_ORIGIN = 'https://api.pluggy.ai';

function extractList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.results)) return payload.results;
    if (Array.isArray(payload?.data)) return payload.data;
    throw new Error('pluggy_invalid_list_response');
}

function normalizeMappings(mappings) {
    if (!Array.isArray(mappings) || !mappings.length || mappings.length > 8) {
        throw new Error('pluggy_item_mapping_required');
    }
    const itemIds = new Set();
    const aliases = new Set();
    return mappings.map((mapping) => {
        const itemId = String(mapping.itemId || '').trim();
        const alias = String(mapping.alias || '').trim().toLowerCase();
        const ownerScope = String(mapping.ownerScope || '').trim().toLowerCase();
        if (!/^[A-Za-z0-9._:-]{8,128}$/.test(itemId)) throw new Error('invalid_pluggy_item_id');
        if (!/^[a-z0-9_-]{2,48}$/.test(alias)) throw new Error('invalid_pluggy_alias');
        if (!['daniel', 'thais'].includes(ownerScope)) throw new Error('invalid_pluggy_owner_scope');
        if (itemIds.has(itemId) || aliases.has(alias)) throw new Error('duplicate_pluggy_mapping');
        itemIds.add(itemId);
        aliases.add(alias);
        return Object.freeze({ itemId, alias, ownerScope });
    });
}

class PluggyReadOnlyClient {
    constructor(options = {}) {
        this.clientId = String(options.clientId || '');
        this.clientSecret = String(options.clientSecret || '');
        if (!this.clientId || !this.clientSecret) throw new Error('pluggy_credentials_required');
        this.fetch = options.fetchImpl || globalThis.fetch;
        if (typeof this.fetch !== 'function') throw new Error('pluggy_fetch_required');
        this.mappings = normalizeMappings(options.itemMappings);
        this.maxTransactionPages = Math.min(100, Math.max(1, Number(options.maxTransactionPages) || 50));
        this.maxInvestmentPages = Math.min(20, Math.max(1, Number(options.maxInvestmentPages) || 10));
        this.apiKey = null;
    }

    async #request(method, path, options = {}) {
        const allowedPost = method === 'POST' && path === '/auth';
        const allowedGet = method === 'GET' && (
            /^\/items\/[A-Za-z0-9._:-]+$/.test(path)
            || path.startsWith('/accounts?')
            || path.startsWith('/v2/transactions?')
            || path.startsWith('/investments?')
            || path.startsWith('/bills?')
        );
        if (!allowedPost && !allowedGet) throw new Error('pluggy_non_read_operation_forbidden');

        const headers = { accept: 'application/json', 'content-type': 'application/json' };
        if (method === 'GET') headers['x-api-key'] = this.apiKey;
        const response = await this.fetch(`${API_ORIGIN}${path}`, {
            method,
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
            redirect: 'error'
        });
        if (!response || typeof response.status !== 'number') throw new Error('pluggy_invalid_http_response');
        if (response.status < 200 || response.status >= 300) {
            const error = new Error(`pluggy_http_${response.status}`);
            error.code = response.status === 429 ? 'rate_limited' : `pluggy_http_${response.status}`;
            error.status = response.status;
            const retryAfter = Number(response.headers?.get?.('retry-after'));
            if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterSeconds = retryAfter;
            throw error;
        }
        if (response.status === 204) return null;
        const payload = await response.json();
        if (Array.isArray(payload?.warnings) && payload.warnings.length) {
            const error = new Error('pluggy_blocking_warning');
            error.code = 'pluggy_blocking_warning';
            throw error;
        }
        return payload;
    }

    async #authenticate() {
        const payload = await this.#request('POST', '/auth', {
            body: { clientId: this.clientId, clientSecret: this.clientSecret }
        });
        const apiKey = String(payload?.apiKey || '').trim();
        if (!apiKey) throw new Error('pluggy_api_key_missing');
        this.apiKey = apiKey;
    }

    async #optionalList(path) {
        try {
            return { rows: extractList(await this.#request('GET', path)), availability: 'available' };
        } catch (error) {
            if ([403, 404].includes(error.status)) return { rows: [], availability: 'unavailable' };
            throw error;
        }
    }

    async #transactions(accountId) {
        const rows = [];
        let path = `/v2/transactions?accountId=${encodeURIComponent(accountId)}`;
        for (let page = 0; page < this.maxTransactionPages; page += 1) {
            const payload = await this.#request('GET', path);
            rows.push(...extractList(payload));
            if (!payload?.next) return { rows, pages: page + 1 };
            const next = String(payload.next);
            if (next.startsWith('?')) path = `/v2/transactions${next}`;
            else if (next.startsWith('/v2/transactions?')) path = next;
            else throw new Error('pluggy_untrusted_pagination_link');
        }
        throw new Error('pluggy_transaction_page_limit');
    }

    async #investments(itemId) {
        const rows = [];
        for (let page = 1; page <= this.maxInvestmentPages; page += 1) {
            const payload = await this.#optionalList(`/investments?itemId=${encodeURIComponent(itemId)}&pageSize=500&page=${page}`);
            rows.push(...payload.rows);
            if (payload.availability === 'unavailable' || payload.rows.length < 500) {
                return { rows, availability: payload.availability, pages: page };
            }
        }
        throw new Error('pluggy_investment_page_limit');
    }

    async readSnapshot(options = {}) {
        await this.#authenticate();
        const entries = [];
        let transactionPages = 0;
        let investmentPages = 0;
        for (const mapping of this.mappings) {
            const itemPayload = await this.#request('GET', `/items/${encodeURIComponent(mapping.itemId)}`);
            const item = itemPayload?.data || itemPayload;
            const accountsPayload = await this.#request('GET', `/accounts?itemId=${encodeURIComponent(mapping.itemId)}`);
            const accounts = extractList(accountsPayload);
            const transactions = [];
            let transactionAvailability = 'available';
            for (const account of accounts) {
                try {
                    const result = await this.#transactions(account.id);
                    transactions.push(...result.rows);
                    transactionPages += result.pages;
                } catch (error) {
                    if ([403, 404].includes(error.status)) transactionAvailability = 'partial';
                    else throw error;
                }
            }
            const bills = [];
            let billAvailability = 'available';
            for (const account of accounts.filter((account) => account.type === 'CREDIT')) {
                const result = await this.#optionalList(`/bills?accountId=${encodeURIComponent(account.id)}`);
                bills.push(...result.rows.map((bill) => ({ ...bill, accountId: bill.accountId || account.id })));
                if (result.availability === 'unavailable') billAvailability = 'unavailable';
            }
            const investments = await this.#investments(mapping.itemId);
            investmentPages += investments.pages;
            entries.push({
                mapping,
                item,
                accounts,
                transactions,
                bills,
                investments: investments.rows,
                availability: {
                    accounts: 'available',
                    transactions: transactionAvailability,
                    bills: billAvailability,
                    investments: investments.availability
                }
            });
        }
        const snapshot = normalizePluggyReadOnlySnapshot({
            mode: 'live_readonly_staging',
            eventId: options.eventId || `live-read-${Date.now()}`,
            observedAt: options.observedAt || new Date().toISOString(),
            items: entries,
            collectionHealth: {
                complete: true,
                warningCount: 0,
                transactionPages,
                investmentPages
            }
        });
        if (snapshot.items.some(item => !['UPDATED', 'SUCCESS'].includes(item.status))) {
            const error = new Error('pluggy_item_status_unhealthy');
            error.code = 'pluggy_item_status_unhealthy';
            throw error;
        }
        return snapshot;
    }
}

module.exports = { PluggyReadOnlyClient, extractList, normalizeMappings };
