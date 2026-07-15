const ALLOWED_ACCOUNT_TYPES = new Set(['BANK', 'CREDIT']);
const ALLOWED_TRANSACTION_STATUSES = new Set(['POSTED', 'PENDING']);
const ALLOWED_BILL_STATUSES = new Set(['OPEN', 'CLOSED', 'PAID']);

function requiredText(value, field, maxLength = 160) {
    const text = String(value || '').trim();
    if (!text || text.length > maxLength) throw new Error(`invalid_${field}`);
    return text;
}

function opaqueId(value, field) {
    const id = requiredText(value, field, 128);
    if (!/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`invalid_${field}`);
    return id;
}

function isoDate(value, field) {
    const text = requiredText(value, field, 32);
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) throw new Error(`invalid_${field}`);
    return date.toISOString();
}

function enumValue(value, field, allowed) {
    const normalized = requiredText(value, field, 32).toUpperCase();
    if (!allowed.has(normalized)) throw new Error(`invalid_${field}`);
    return normalized;
}

function currency(value) {
    const normalized = requiredText(value || 'BRL', 'currency', 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized)) throw new Error('invalid_currency');
    return normalized;
}

function moneyToCents(value, field = 'amount') {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`invalid_${field}`);
    return Math.round(number * 100);
}

function normalizePluggySandboxSnapshot(payload = {}) {
    if (String(payload.mode || '').toLowerCase() !== 'sandbox') {
        throw new Error('pluggy_live_mode_forbidden');
    }

    const item = payload.item || {};
    const itemId = opaqueId(item.id, 'item_id');
    const eventId = opaqueId(payload.eventId || payload.event_id, 'event_id');
    const observedAt = isoDate(payload.observedAt || payload.observed_at || new Date().toISOString(), 'observed_at');

    const accounts = (payload.accounts || []).map((account) => ({
        id: opaqueId(account.id, 'account_id'),
        item_id: itemId,
        type: enumValue(account.type, 'account_type', ALLOWED_ACCOUNT_TYPES),
        subtype: requiredText(account.subtype || 'UNKNOWN', 'account_subtype', 48).toUpperCase(),
        currency: currency(account.currency),
        balance_cents: moneyToCents(account.balance, 'account_balance')
    }));
    const accountIds = new Set(accounts.map((account) => account.id));
    if (accountIds.size !== accounts.length) throw new Error('duplicate_account_id');

    const transactions = (payload.transactions || []).map((transaction) => {
        const accountId = opaqueId(transaction.accountId || transaction.account_id, 'transaction_account_id');
        if (!accountIds.has(accountId)) throw new Error('unknown_transaction_account');
        return {
            id: opaqueId(transaction.id, 'transaction_id'),
            item_id: itemId,
            account_id: accountId,
            description: requiredText(transaction.description, 'transaction_description', 256),
            amount_cents: moneyToCents(transaction.amount, 'transaction_amount'),
            currency: currency(transaction.currency),
            date: isoDate(transaction.date, 'transaction_date'),
            status: enumValue(transaction.status, 'transaction_status', ALLOWED_TRANSACTION_STATUSES),
            deleted: Boolean(transaction.deleted)
        };
    });
    if (new Set(transactions.map((transaction) => transaction.id)).size !== transactions.length) {
        throw new Error('duplicate_transaction_id');
    }

    const bills = (payload.bills || []).map((bill) => {
        const accountId = opaqueId(bill.accountId || bill.account_id, 'bill_account_id');
        if (!accountIds.has(accountId)) throw new Error('unknown_bill_account');
        return {
            id: opaqueId(bill.id, 'bill_id'),
            item_id: itemId,
            account_id: accountId,
            due_date: isoDate(bill.dueDate || bill.due_date, 'bill_due_date'),
            total_cents: moneyToCents(bill.total, 'bill_total'),
            currency: currency(bill.currency),
            status: enumValue(bill.status, 'bill_status', ALLOWED_BILL_STATUSES)
        };
    });
    if (new Set(bills.map((bill) => bill.id)).size !== bills.length) throw new Error('duplicate_bill_id');

    return {
        schema_version: 1,
        provider: 'pluggy',
        mode: 'sandbox',
        event_id: eventId,
        observed_at: observedAt,
        item: {
            id: itemId,
            connector_id: opaqueId(item.connectorId || item.connector_id, 'connector_id'),
            status: requiredText(item.status || 'UPDATED', 'item_status', 32).toUpperCase()
        },
        accounts,
        transactions,
        bills
    };
}

module.exports = {
    moneyToCents,
    normalizePluggySandboxSnapshot
};
