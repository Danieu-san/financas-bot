const ALLOWED_ACCOUNT_TYPES = new Set(['BANK', 'CREDIT']);
const ALLOWED_TRANSACTION_STATUSES = new Set(['POSTED', 'PENDING']);
const ALLOWED_OWNER_SCOPES = new Set(['daniel', 'thais']);
const ALLOWED_AVAILABILITY = new Set(['available', 'partial', 'unavailable']);

function requiredText(value, field, maxLength = 256) {
    const text = String(value || '').trim();
    if (!text || text.length > maxLength) throw new Error(`invalid_${field}`);
    return text;
}

function optionalText(value, maxLength = 256) {
    if (value === null || value === undefined || value === '') return null;
    const text = String(value).trim();
    return text && text.length <= maxLength ? text : null;
}

function opaqueId(value, field) {
    const id = requiredText(value, field, 128);
    if (!/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`invalid_${field}`);
    return id;
}

function aliasCode(value) {
    const alias = requiredText(value, 'alias_code', 48).toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(alias)) throw new Error('invalid_alias_code');
    return alias;
}

function isoDate(value, field) {
    const text = requiredText(value, field, 40);
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) throw new Error(`invalid_${field}`);
    return parsed.toISOString();
}

function optionalIsoDate(value) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function cents(value, field, options = {}) {
    if ((value === null || value === undefined || value === '') && options.nullable) return null;
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`invalid_${field}`);
    return Math.round(number * 100);
}

function currency(value) {
    const normalized = requiredText(value || 'BRL', 'currency', 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized)) throw new Error('invalid_currency');
    return normalized;
}

function availability(value) {
    const normalized = String(value || 'available').toLowerCase();
    if (!ALLOWED_AVAILABILITY.has(normalized)) throw new Error('invalid_product_availability');
    return normalized;
}

function normalizeAccount(account, itemId) {
    const type = requiredText(account.type, 'account_type', 16).toUpperCase();
    if (!ALLOWED_ACCOUNT_TYPES.has(type)) throw new Error('invalid_account_type');
    const creditData = account.creditData || {};
    const creditLimit = cents(creditData.creditLimit, 'credit_limit', { nullable: true });
    const availableLimit = cents(creditData.availableCreditLimit, 'available_credit_limit', { nullable: true });
    const usedLimit = creditLimit === null || availableLimit === null
        ? null
        : creditLimit - availableLimit;
    return {
        id: opaqueId(account.id, 'account_id'),
        item_id: itemId,
        type,
        subtype: requiredText(account.subtype || 'UNKNOWN', 'account_subtype', 48).toUpperCase(),
        currency: currency(account.currencyCode),
        balance_cents: cents(account.balance, 'account_balance', { nullable: true }),
        credit_limit_cents: type === 'CREDIT' ? creditLimit : null,
        available_credit_limit_cents: type === 'CREDIT' ? availableLimit : null,
        used_limit_cents: type === 'CREDIT' ? usedLimit : null,
        balance_due_date: type === 'CREDIT' ? optionalIsoDate(creditData.balanceDueDate) : null,
        balance_close_date: type === 'CREDIT' ? optionalIsoDate(creditData.balanceCloseDate) : null
    };
}

function normalizeTransaction(transaction, itemId, accountIds) {
    const accountId = opaqueId(transaction.accountId || transaction.account_id, 'transaction_account_id');
    if (!accountIds.has(accountId)) throw new Error('unknown_transaction_account');
    const status = requiredText(transaction.status, 'transaction_status', 16).toUpperCase();
    if (!ALLOWED_TRANSACTION_STATUSES.has(status)) throw new Error('invalid_transaction_status');
    return {
        id: opaqueId(transaction.id, 'transaction_id'),
        item_id: itemId,
        account_id: accountId,
        description: requiredText(transaction.description, 'transaction_description', 512),
        amount_cents: cents(transaction.amount, 'transaction_amount'),
        currency: currency(transaction.currencyCode),
        date: isoDate(transaction.date, 'transaction_date'),
        status,
        type: optionalText(transaction.type, 16)?.toUpperCase() || null,
        provider_id: optionalText(transaction.providerId, 128),
        reference_number: optionalText(transaction.paymentData?.referenceNumber, 128),
        receiver_reference_id: optionalText(transaction.paymentData?.receiverReferenceId, 128),
        operation_type: optionalText(transaction.operationType, 64)?.toUpperCase() || null,
        original_date: optionalIsoDate(transaction.originalDate),
        bill_id: transaction.creditCardMetadata?.billId
            ? opaqueId(transaction.creditCardMetadata.billId, 'transaction_bill_id')
            : null,
        bill_forecast_month: optionalText(transaction.creditCardMetadata?.billForecastDate, 16),
        installment_number: Number.isInteger(transaction.creditCardMetadata?.installmentNumber)
            ? transaction.creditCardMetadata.installmentNumber
            : null,
        total_installments: Number.isInteger(transaction.creditCardMetadata?.totalInstallments)
            ? transaction.creditCardMetadata.totalInstallments
            : null
    };
}

function normalizeBill(bill, itemId, accountIds) {
    const accountId = opaqueId(bill.accountId || bill.account_id, 'bill_account_id');
    if (!accountIds.has(accountId)) throw new Error('unknown_bill_account');
    return {
        id: opaqueId(bill.id, 'bill_id'),
        item_id: itemId,
        account_id: accountId,
        due_date: isoDate(bill.dueDate, 'bill_due_date'),
        total_cents: cents(bill.totalAmount, 'bill_total'),
        currency: currency(bill.totalAmountCurrencyCode),
        minimum_payment_cents: cents(bill.minimumPaymentAmount, 'bill_minimum_payment', { nullable: true })
    };
}

function normalizeInvestment(investment, itemId) {
    return {
        id: opaqueId(investment.id, 'investment_id'),
        item_id: itemId,
        name: requiredText(investment.name, 'investment_name', 256),
        type: requiredText(investment.type, 'investment_type', 48).toUpperCase(),
        subtype: optionalText(investment.subtype, 64)?.toUpperCase() || null,
        balance_cents: cents(investment.balance, 'investment_balance', { nullable: true }),
        currency: currency(investment.currencyCode),
        status: optionalText(investment.status, 32)?.toUpperCase() || null,
        date: optionalIsoDate(investment.date)
    };
}

function normalizePluggyReadOnlySnapshot(payload = {}) {
    if (payload.mode !== 'live_readonly_staging') throw new Error('live_readonly_staging_required');
    const observedAt = isoDate(payload.observedAt || payload.observed_at, 'observed_at');
    const eventId = opaqueId(payload.eventId || payload.event_id, 'event_id');
    const aliases = new Set();
    const items = (payload.items || []).map((entry) => {
        const itemId = opaqueId(entry.item?.id, 'item_id');
        const alias = aliasCode(entry.mapping?.alias);
        if (aliases.has(alias)) throw new Error('duplicate_alias_code');
        aliases.add(alias);
        const ownerScope = requiredText(entry.mapping?.ownerScope, 'owner_scope', 16).toLowerCase();
        if (!ALLOWED_OWNER_SCOPES.has(ownerScope)) throw new Error('invalid_owner_scope');
        const accounts = (entry.accounts || []).map((account) => normalizeAccount(account, itemId));
        const accountIds = new Set(accounts.map((account) => account.id));
        if (accountIds.size !== accounts.length) throw new Error('duplicate_account_id');
        const transactions = (entry.transactions || []).map((transaction) => (
            normalizeTransaction(transaction, itemId, accountIds)
        ));
        const bills = (entry.bills || []).map((bill) => normalizeBill(bill, itemId, accountIds));
        const investments = (entry.investments || []).map((investment) => normalizeInvestment(investment, itemId));
        return {
            id: itemId,
            alias_code: alias,
            owner_scope: ownerScope,
            connector_id: opaqueId(entry.item?.connector?.id || entry.item?.connectorId || 'connector-unknown', 'connector_id'),
            status: requiredText(
                entry.item?.status || entry.item?.executionStatus || 'UPDATED',
                'item_status',
                48
            ).toUpperCase(),
            availability: {
                accounts: availability(entry.availability?.accounts),
                transactions: availability(entry.availability?.transactions),
                bills: availability(entry.availability?.bills),
                investments: availability(entry.availability?.investments)
            },
            accounts,
            transactions,
            bills,
            investments
        };
    });
    if (!items.length) throw new Error('pluggy_item_mapping_required');
    const collectionHealth = payload.collectionHealth || payload.collection_health || {};
    return {
        schema_version: 1,
        provider: 'pluggy',
        mode: 'live_readonly_staging',
        event_id: eventId,
        observed_at: observedAt,
        collection_health: {
            complete: collectionHealth.complete === true,
            warning_count: Math.max(0, Number(collectionHealth.warningCount ?? collectionHealth.warning_count) || 0),
            transaction_pages: Math.max(0, Number(collectionHealth.transactionPages ?? collectionHealth.transaction_pages) || 0),
            investment_pages: Math.max(0, Number(collectionHealth.investmentPages ?? collectionHealth.investment_pages) || 0)
        },
        items
    };
}

module.exports = { normalizePluggyReadOnlySnapshot };
