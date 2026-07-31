const fs = require('node:fs');
const { OpenFinanceLiveStagingVault } = require('../openFinance/openFinanceLiveStagingVault');

const DEFAULT_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const SOURCE = 'open_finance';

function normalizePerson(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .split(/\s+/)[0];
}

function money(cents) {
    if (!Number.isInteger(cents)) return null;
    return Math.round((cents / 100 + Number.EPSILON) * 100) / 100;
}

function unavailable(reason = 'source_unavailable') {
    return Object.freeze({
        status: 'unavailable',
        reason,
        stale: false,
        observedAt: null,
        bankAccounts: { status: 'unavailable', totalBalance: null, count: null, items: [] },
        creditCards: { status: 'unavailable', totalCurrentInvoice: null, count: null, items: [] }
    });
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function currentBillForAccount(bills = [], accountId, observedAt) {
    const observationDate = String(observedAt || '').slice(0, 10);
    const future = bills
        .filter(bill => bill.account_id === accountId)
        .map(bill => ({ ...bill, dueTime: Date.parse(bill.due_date) }))
        .filter(bill => Number.isFinite(bill.dueTime))
        .filter(bill => !/^\d{4}-\d{2}-\d{2}$/.test(observationDate) ||
            String(bill.due_date || '').slice(0, 10) >= observationDate)
        .sort((left, right) => left.dueTime - right.dueTime);
    return future[0] || null;
}

function publicAliasLabel(alias) {
    return String(alias || '')
        .split('_')
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function authorizedOwnerScopes(userIds = [], users = []) {
    const allowedIds = new Set((userIds || []).map(value => String(value || '').trim()).filter(Boolean));
    return new Set((users || [])
        .filter(user => allowedIds.has(String(user.user_id || '').trim()))
        .map(user => normalizePerson(user.display_name))
        .filter(owner => ['daniel', 'thais'].includes(owner)));
}

function blockStatus({ stale, partial }) {
    return stale || partial ? 'partial' : 'available';
}

function loadOpenFinanceDashboardSnapshot({
    userIds = [],
    users = [],
    env = process.env,
    now = new Date()
} = {}) {
    const databasePath = String(env.OPEN_FINANCE_LIVE_STAGING_DB || '').trim();
    const secretPath = String(env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE || '').trim();
    const mappingPath = String(env.PLUGGY_ITEM_MAP_FILE || '').trim();
    if (![databasePath, secretPath, mappingPath].every(file => file && fs.existsSync(file))) {
        return unavailable('source_unavailable');
    }
    const owners = authorizedOwnerScopes(userIds, users);
    if (!owners.size) return unavailable('scope_unavailable');

    let vault;
    try {
        const secret = fs.readFileSync(secretPath, 'utf8').trim();
        const mappings = readJson(mappingPath)
            .filter(mapping => owners.has(normalizePerson(mapping.ownerScope)));
        if (!mappings.length) return unavailable('scope_unavailable');
        vault = new OpenFinanceLiveStagingVault({ databasePath, secret, readonly: true });
        const records = mappings
            .map(mapping => ({ mapping, record: vault.readItemRecordByAlias(mapping.alias) }))
            .filter(entry => entry.record?.item);
        if (!records.length) return unavailable('source_unavailable');

        const observedTimes = records
            .map(entry => Date.parse(entry.record.observed_at))
            .filter(Number.isFinite);
        if (!observedTimes.length) return unavailable('source_unavailable');
        const observedAt = new Date(Math.min(...observedTimes)).toISOString();
        const referenceTime = Date.parse(now instanceof Date ? now.toISOString() : now);
        const maxAgeMs = Math.max(
            6 * 60 * 60 * 1000,
            Number(env.OPEN_FINANCE_DASHBOARD_MAX_AGE_MS) || DEFAULT_MAX_AGE_MS
        );
        const stale = !Number.isFinite(referenceTime) ||
            records.some(entry => referenceTime - Date.parse(entry.record.observed_at) > maxAgeMs);

        const bankAccounts = [];
        const creditCards = [];
        let partialAccounts = false;
        let partialBills = false;
        for (const { mapping, record } of records) {
            const item = record.item;
            const owner = normalizePerson(mapping.ownerScope);
            const ownerLabel = owner.charAt(0).toUpperCase() + owner.slice(1);
            const sourceLabel = publicAliasLabel(mapping.alias);
            if (item.availability?.accounts !== 'available') partialAccounts = true;
            if (item.availability?.bills !== 'available') partialBills = true;
            for (const account of item.accounts || []) {
                if (account.type === 'BANK') {
                    bankAccounts.push({
                        name: sourceLabel,
                        accountType: account.subtype,
                        owner: ownerLabel,
                        responsible: ownerLabel,
                        currency: account.currency,
                        balance: money(account.balance_cents),
                        observedAt: record.observed_at,
                        source: SOURCE
                    });
                    if (!Number.isInteger(account.balance_cents)) partialAccounts = true;
                    continue;
                }
                if (account.type !== 'CREDIT') continue;
                const currentBill = currentBillForAccount(item.bills, account.id, record.observed_at);
                creditCards.push({
                    name: sourceLabel,
                    accountType: account.subtype,
                    owner: ownerLabel,
                    currency: account.currency,
                    currentInvoice: currentBill ? money(currentBill.total_cents) : null,
                    currentInvoiceDueDate: currentBill?.due_date || null,
                    totalLimit: money(account.credit_limit_cents),
                    availableLimit: money(account.available_credit_limit_cents),
                    usedLimit: money(account.used_limit_cents),
                    observedAt: record.observed_at,
                    source: SOURCE
                });
                if (!currentBill || !Number.isInteger(account.credit_limit_cents) ||
                    !Number.isInteger(account.available_credit_limit_cents)) {
                    partialBills = true;
                }
            }
        }

        const availableBankBalances = bankAccounts.map(account => account.balance).filter(value => value !== null);
        const availableInvoices = creditCards.map(card => card.currentInvoice).filter(value => value !== null);
        const status = blockStatus({
            stale,
            partial: partialAccounts || partialBills ||
                availableBankBalances.length !== bankAccounts.length ||
                availableInvoices.length !== creditCards.length
        });
        return Object.freeze({
            status,
            stale,
            observedAt,
            source: SOURCE,
            bankAccounts: {
                status: blockStatus({ stale, partial: partialAccounts }),
                totalBalance: availableBankBalances.length === bankAccounts.length && bankAccounts.length
                    ? Math.round((availableBankBalances.reduce((sum, value) => sum + value, 0) + Number.EPSILON) * 100) / 100
                    : null,
                count: bankAccounts.length,
                items: bankAccounts
            },
            creditCards: {
                status: blockStatus({ stale, partial: partialBills }),
                totalCurrentInvoice: availableInvoices.length === creditCards.length && creditCards.length
                    ? Math.round((availableInvoices.reduce((sum, value) => sum + value, 0) + Number.EPSILON) * 100) / 100
                    : null,
                count: creditCards.length,
                items: creditCards
            }
        });
    } catch (_error) {
        return unavailable('source_unavailable');
    } finally {
        vault?.close();
    }
}

function applyDashboardFinancialTruth(snapshot = {}, truth = unavailable()) {
    const next = { ...snapshot, openFinance: truth };
    if (truth.status !== 'unavailable' && Array.isArray(truth.bankAccounts?.items)) {
        next.financialAccounts = {
            ...truth.bankAccounts,
            timeBasis: 'observed_state',
            observedAt: truth.observedAt,
            stale: truth.stale,
            source: SOURCE,
            criteria: truth.stale
                ? 'Última posição observada pelo Open Finance; a leitura está antiga e não representa um saldo atual confirmado.'
                : 'Saldo observado pelo Open Finance, separado do resultado econômico do período.'
        };
        next.creditCards = {
            ...truth.creditCards,
            timeBasis: 'observed_state',
            observedAt: truth.observedAt,
            stale: truth.stale,
            source: SOURCE,
            criteria: truth.stale
                ? 'Última posição observada pelo Open Finance; fatura e limites podem ter mudado.'
                : 'Fatura formal e limites observados pelo Open Finance; limite usado não é tratado como fatura.'
        };
        return next;
    }
    if (next.financialAccounts && Array.isArray(next.financialAccounts.items)) {
        next.financialAccounts = {
            ...next.financialAccounts,
            status: 'fallback',
            timeBasis: 'ledger_estimate',
            source: 'ledger_estimate',
            criteria: 'Estimativa por saldo inicial e lançamentos com conta identificada; não é saldo bancário ao vivo.'
        };
    }
    next.creditCards = {
        status: 'unavailable',
        totalCurrentInvoice: null,
        count: null,
        items: [],
        timeBasis: 'current_bill',
        source: 'unavailable',
        criteria: 'Fonte Open Finance indisponível; ausência de fatura ou limite não equivale a zero.'
    };
    return next;
}

module.exports = {
    loadOpenFinanceDashboardSnapshot,
    applyDashboardFinancialTruth,
    __test__: { normalizePerson, currentBillForAccount, authorizedOwnerScopes }
};
