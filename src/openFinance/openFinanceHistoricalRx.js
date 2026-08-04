'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

const ESSENTIAL_AVAILABILITY = ['accounts', 'transactions'];
const SQLITE_FILES = Object.freeze({
    database: '',
    wal: '-wal',
    shm: '-shm',
    journal: '-journal'
});

function snapshotSqliteFileSet(databasePath) {
    return Object.freeze(Object.fromEntries(Object.entries(SQLITE_FILES).map(([kind, suffix]) => {
        const file = `${databasePath}${suffix}`;
        if (!fs.existsSync(file)) return [kind, { exists: false, size: null, sha256: null }];
        const data = fs.readFileSync(file);
        return [kind, {
            exists: true,
            size: data.length,
            sha256: crypto.createHash('sha256').update(data).digest('hex')
        }];
    })));
}

function sqliteFileSetsEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function requireSecret(secret) {
    const value = String(secret || '');
    if (value.length < 32) throw new Error('open_finance_historical_rx_secret_required');
    return value;
}

function parseDate(value, field) {
    const timestamp = Date.parse(String(value || ''));
    if (!Number.isFinite(timestamp)) throw new Error(`invalid_${field}`);
    return timestamp;
}

function requireCutoff(value) {
    const text = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('invalid_historical_rx_cutoff');
    const timestamp = parseDate(`${text}T00:00:00.000Z`, 'historical_rx_cutoff');
    if (new Date(timestamp).toISOString().slice(0, 10) !== text) throw new Error('invalid_historical_rx_cutoff');
    return text;
}

function sum(rows, selector) {
    return rows.reduce((total, row) => total + Number(selector(row) || 0), 0);
}

function uniqueSorted(values) {
    return [...new Set(values)].sort((left, right) => left - right);
}

function cents(value, field, { nullable = false } = {}) {
    if (value === null || value === undefined) {
        if (nullable) return null;
        throw new Error(`invalid_${field}`);
    }
    const amount = Number(value);
    if (!Number.isSafeInteger(amount)) throw new Error(`invalid_${field}`);
    return amount;
}

function buildOpenFinanceHistoricalRx({
    items = [],
    cutoffDate,
    observedAt,
    secret,
    sourceLifecycles = {}
} = {}) {
    const hmacSecret = requireSecret(secret);
    const cutoff = requireCutoff(cutoffDate);
    const cutoffTimestamp = parseDate(`${cutoff}T00:00:00.000Z`, 'historical_rx_cutoff');
    const observedTimestamp = parseDate(observedAt, 'historical_rx_observed_at');
    if (observedTimestamp < cutoffTimestamp) throw new Error('historical_rx_observed_before_cutoff');
    if (!Array.isArray(items) || !items.length) throw new Error('historical_rx_items_required');

    const ref = (kind, value) => crypto.createHmac('sha256', hmacSecret)
        .update(`${kind}:${String(value || '')}`).digest('hex').slice(0, 32);
    const blockers = [];
    const segments = [];
    const investments = [];
    const aliases = new Set();

    for (const item of items) {
        const alias = String(item.alias_code || '').trim().toLowerCase();
        if (!/^[a-z0-9_-]{2,48}$/.test(alias)) throw new Error('invalid_historical_rx_alias');
        if (aliases.has(alias)) throw new Error('duplicate_historical_rx_alias');
        aliases.add(alias);
        for (const key of ESSENTIAL_AVAILABILITY) {
            const status = String(item.availability?.[key] || 'unavailable').toLowerCase();
            if (status !== 'available') blockers.push(`${alias}:${key}_${status}`);
        }

        const lifecycle = sourceLifecycles[alias] || {};
        const availableFrom = lifecycle.availableFrom ? requireCutoff(lifecycle.availableFrom) : null;
        const existedAtCutoff = typeof lifecycle.existedAtCutoff === 'boolean'
            ? lifecycle.existedAtCutoff
            : null;
        if ((existedAtCutoff === false && availableFrom && availableFrom <= cutoff)
            || (existedAtCutoff === true && availableFrom && availableFrom > cutoff)) {
            throw new Error('conflicting_historical_rx_source_lifecycle');
        }
        const cutoffRelation = existedAtCutoff === false || (availableFrom && availableFrom > cutoff)
            ? 'not_applicable_before_source_start'
            : existedAtCutoff === true || (availableFrom && availableFrom <= cutoff)
                ? 'source_available_at_cutoff'
                : 'source_start_unknown';
        if (cutoffRelation === 'source_start_unknown') blockers.push(`${alias}:source_start_unknown`);
        const accounts = Array.isArray(item.accounts) ? item.accounts : [];
        const accountIds = new Set();
        const accountTypes = new Map();
        const transactionIds = new Set();

        for (const account of accounts) {
            const accountId = String(account.id || '');
            if (!accountId || accountIds.has(accountId)) throw new Error('duplicate_or_missing_historical_rx_account');
            accountIds.add(accountId);
            accountTypes.set(accountId, String(account.type || '').toUpperCase());
        }
        if (accounts.some(account => String(account.type || '').toUpperCase() === 'CREDIT')) {
            const billStatus = String(item.availability?.bills || 'unavailable').toLowerCase();
            if (billStatus !== 'available') blockers.push(`${alias}:bills_${billStatus}`);
        }
        for (const transaction of (item.transactions || [])) {
            const id = String(transaction.id || '');
            if (!id || transactionIds.has(id)) throw new Error('duplicate_or_missing_historical_rx_transaction');
            transactionIds.add(id);
            if (!accountIds.has(String(transaction.account_id || ''))) throw new Error('historical_rx_transaction_account_unknown');
            const accountType = accountTypes.get(String(transaction.account_id || ''));
            const hasInstallment = transaction.installment_number !== null
                && transaction.installment_number !== undefined;
            const hasInstallmentTotal = transaction.total_installments !== null
                && transaction.total_installments !== undefined;
            if (accountType === 'BANK' && (hasInstallment || hasInstallmentTotal)) {
                throw new Error('historical_rx_installment_requires_credit_account');
            }
            const status = String(transaction.status || '').toUpperCase();
            if (!['POSTED', 'PENDING'].includes(status)) throw new Error('invalid_historical_rx_transaction_status');
            cents(transaction.amount_cents, 'historical_rx_transaction_amount');
            parseDate(transaction.date, 'historical_rx_transaction_date');
        }
        for (const bill of (item.bills || [])) {
            if (!accountIds.has(String(bill.account_id || ''))) throw new Error('historical_rx_bill_account_unknown');
            if (accountTypes.get(String(bill.account_id || '')) !== 'CREDIT') {
                throw new Error('historical_rx_bill_requires_credit_account');
            }
            cents(bill.total_cents, 'historical_rx_bill_total');
            parseDate(bill.due_date, 'historical_rx_bill_due_date');
        }

        for (const account of accounts) {
            const accountId = String(account.id || '');
            const accountType = String(account.type || '').toUpperCase();
            if (!['BANK', 'CREDIT'].includes(accountType)) throw new Error('unsupported_historical_rx_account_type');

            const transactionStatus = String(item.availability?.transactions || 'unavailable').toLowerCase();
            const accountStatus = String(item.availability?.accounts || 'unavailable').toLowerCase();
            const accountsAvailable = accountStatus === 'available';
            const transactionsAvailable = accountsAvailable && transactionStatus === 'available';
            const rows = transactionsAvailable ? (item.transactions || []).filter(transaction => {
                if (String(transaction.account_id || '') !== accountId) return false;
                const timestamp = parseDate(transaction.date, 'historical_rx_transaction_date');
                return timestamp >= cutoffTimestamp;
            }) : [];
            const postedThroughObservation = rows.filter(transaction =>
                String(transaction.status || '').toUpperCase() === 'POSTED' &&
                parseDate(transaction.date, 'historical_rx_transaction_date') <= observedTimestamp
            );
            const pending = rows.filter(transaction => String(transaction.status || '').toUpperCase() === 'PENDING');
            const positive = rows.filter(transaction => Number(transaction.amount_cents) > 0);
            const negative = rows.filter(transaction => Number(transaction.amount_cents) < 0);
            const dates = rows.map(transaction => String(transaction.date).slice(0, 10)).sort();
            const segmentRef = ref('historical_rx_segment', `${alias}:${accountId}`);
            const isBank = accountType === 'BANK';
            const currentBalance = cents(account.balance_cents,
                'historical_rx_account_balance', { nullable: true });

            let cutoffReconstruction;
            if (!isBank) {
                cutoffReconstruction = { balance_cents: null, reason: 'credit_balance_is_not_invoice' };
            } else if (cutoffRelation === 'not_applicable_before_source_start') {
                cutoffReconstruction = { balance_cents: null, reason: 'source_not_available_at_cutoff' };
            } else if (currentBalance === null || !transactionsAvailable) {
                cutoffReconstruction = { balance_cents: null, reason: 'complete_bank_history_unavailable' };
            } else {
                cutoffReconstruction = {
                    balance_cents: currentBalance - sum(postedThroughObservation, row => row.amount_cents),
                    confidence: 'conditional_on_complete_posted_history'
                };
            }

            const billStatus = String(item.availability?.bills || 'unavailable').toLowerCase();
            const billsAvailable = accountsAvailable && billStatus === 'available';
            const accountBills = billsAvailable ? (item.bills || []).filter(bill =>
                String(bill.account_id || '') === accountId &&
                parseDate(bill.due_date, 'historical_rx_bill_due_date') >= cutoffTimestamp
            ) : [];
            const installmentRows = rows.filter(transaction =>
                Number.isInteger(Number(transaction.installment_number)) &&
                Number.isInteger(Number(transaction.total_installments)) &&
                Number(transaction.total_installments) > 1
            );
            const series = new Map();
            for (const transaction of installmentRows) {
                const installmentNumber = Number(transaction.installment_number);
                const totalInstallments = Number(transaction.total_installments);
                if (installmentNumber < 1 || installmentNumber > totalInstallments) {
                    throw new Error('invalid_historical_rx_installment_number');
                }
                const strong = transaction.provider_id || transaction.reference_number || null;
                const groupingBasis = strong
                    ? `strong:${strong}`
                    : [transaction.description, transaction.original_date || '', Math.abs(Number(transaction.amount_cents)),
                        Number(transaction.total_installments)].join(':');
                const seriesRef = ref('historical_rx_installment', `${alias}:${accountId}:${groupingBasis}`);
                if (!series.has(seriesRef)) {
                    series.set(seriesRef, {
                        series_ref: seriesRef,
                        grouping_confidence: strong ? 'provider_reference' : 'provider_metadata_heuristic',
                        total_installments: totalInstallments,
                        observed_numbers: [],
                        billing_months: []
                    });
                }
                const entry = series.get(seriesRef);
                if (entry.total_installments !== totalInstallments) {
                    throw new Error('conflicting_historical_rx_installment_total');
                }
                if (entry.observed_numbers.includes(installmentNumber)) {
                    throw new Error('duplicate_historical_rx_installment_number');
                }
                entry.observed_numbers.push(installmentNumber);
                if (transaction.bill_forecast_month) entry.billing_months.push(String(transaction.bill_forecast_month).slice(0, 7));
            }
            const installmentSeries = [...series.values()].map(entry => {
                entry.observed_numbers = uniqueSorted(entry.observed_numbers);
                entry.billing_months = [...new Set(entry.billing_months)].sort();
                entry.missing_numbers = Array.from({ length: entry.total_installments }, (_, index) => index + 1)
                    .filter(number => !entry.observed_numbers.includes(number));
                return entry;
            }).sort((left, right) => left.series_ref.localeCompare(right.series_ref));

            segments.push({
                segment_ref: segmentRef,
                source_alias: alias,
                owner_scope: String(item.owner_scope || '').toLowerCase(),
                product: isBank ? 'bank_account' : 'credit_card',
                subtype: String(account.subtype || 'UNKNOWN').toUpperCase(),
                currency: String(account.currency || 'BRL').toUpperCase(),
                cutoff_relation: cutoffRelation,
                source_available_from: availableFrom,
                source_existed_at_cutoff: existedAtCutoff,
                coverage: {
                    account_status: accountStatus,
                    status: transactionStatus,
                    first_observed_date: dates[0] || null,
                    last_observed_date: dates[dates.length - 1] || null
                },
                flows: !transactionsAvailable ? (isBank ? {
                    count: null,
                    posted_count: null,
                    pending_count: null,
                    credits_cents: null,
                    debits_cents: null,
                    posted_net_cents: null
                } : {
                    count: null,
                    posted_count: null,
                    pending_count: null,
                    charges_cents: null,
                    payments_or_credits_cents: null,
                    posted_net_cents: null
                }) : isBank ? {
                    count: rows.length,
                    posted_count: postedThroughObservation.length,
                    pending_count: pending.length,
                    credits_cents: sum(positive, row => row.amount_cents),
                    debits_cents: Math.abs(sum(negative, row => row.amount_cents)),
                    posted_net_cents: sum(postedThroughObservation, row => row.amount_cents)
                } : {
                    count: rows.length,
                    posted_count: postedThroughObservation.length,
                    pending_count: pending.length,
                    charges_cents: sum(positive, row => row.amount_cents),
                    payments_or_credits_cents: Math.abs(sum(negative, row => row.amount_cents)),
                    posted_net_cents: sum(postedThroughObservation, row => row.amount_cents)
                },
                current_snapshot: isBank ? {
                    balance_cents: accountsAvailable ? currentBalance : null,
                    observed_at: new Date(observedTimestamp).toISOString()
                } : {
                    provider_balance_cents: accountsAvailable ? currentBalance : null,
                    provider_balance_semantic: 'used_limit_not_invoice',
                    credit_limit_cents: accountsAvailable
                        ? cents(account.credit_limit_cents, 'historical_rx_credit_limit', { nullable: true })
                        : null,
                    available_credit_limit_cents: accountsAvailable
                        ? cents(account.available_credit_limit_cents,
                            'historical_rx_available_credit_limit', { nullable: true })
                        : null,
                    used_limit_cents: accountsAvailable
                        ? cents(account.used_limit_cents, 'historical_rx_used_limit', { nullable: true })
                        : null,
                    observed_at: new Date(observedTimestamp).toISOString()
                },
                cutoff_reconstruction: cutoffReconstruction,
                bills: {
                    status: billStatus,
                    count: billsAvailable ? accountBills.length : null,
                    total_cents: billsAvailable ? sum(accountBills, row => row.total_cents) : null,
                    first_due_date: accountBills.map(row => String(row.due_date).slice(0, 10)).sort()[0] || null,
                    last_due_date: accountBills.map(row => String(row.due_date).slice(0, 10)).sort().at(-1) || null
                },
                installments: {
                    status: transactionStatus,
                    series: transactionsAvailable ? installmentSeries : null,
                    series_count: transactionsAvailable ? installmentSeries.length : null,
                    incomplete_series_count: transactionsAvailable
                        ? installmentSeries.filter(entry => entry.missing_numbers.length > 0).length
                        : null,
                    observed_rows: transactionsAvailable ? installmentRows.length : null,
                    synthesized_rows: 0
                }
            });
        }

        const investmentsAvailable = String(item.availability?.investments || 'unavailable').toLowerCase()
            === 'available';
        for (const investment of (investmentsAvailable ? (item.investments || []) : [])) {
            investments.push({
                investment_ref: ref('historical_rx_investment', `${alias}:${investment.id}`),
                source_alias: alias,
                owner_scope: String(item.owner_scope || '').toLowerCase(),
                product: 'investment',
                type: String(investment.type || 'UNKNOWN').toUpperCase(),
                subtype: investment.subtype ? String(investment.subtype).toUpperCase() : null,
                currency: String(investment.currency || 'BRL').toUpperCase(),
                current_balance_cents: cents(investment.balance_cents,
                    'historical_rx_investment_balance', { nullable: true }),
                observed_at: new Date(observedTimestamp).toISOString(),
                historical_reconstruction: null
            });
        }
    }

    return Object.freeze({
        schema_version: 1,
        gate: 'RX-HIST-SEG-01',
        cutoff_date: cutoff,
        observed_at: new Date(observedTimestamp).toISOString(),
        ready_for_reconciliation: blockers.length === 0,
        blockers: blockers.sort(),
        segments: segments.sort((left, right) =>
            `${left.source_alias}:${left.product}:${left.segment_ref}`.localeCompare(
                `${right.source_alias}:${right.product}:${right.segment_ref}`
            )
        ),
        investments: investments.sort((left, right) => left.investment_ref.localeCompare(right.investment_ref)),
        financial_writes: 0
    });
}

module.exports = {
    buildOpenFinanceHistoricalRx,
    snapshotSqliteFileSet,
    sqliteFileSetsEqual
};
