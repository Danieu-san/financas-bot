'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

const ESSENTIAL_AVAILABILITY = ['accounts', 'transactions'];
const HISTORICAL_RX_GATE = 'RX-HIST-INVESTMENT-LINKAGE-01';
const INVESTMENT_TRANSACTION_TYPES = new Set([
    'BUY', 'SELL', 'TAX', 'TRANSFER', 'INTEREST', 'AMORTIZATION'
]);
const CANONICAL_HISTORICAL_RX_INVENTORY = Object.freeze([
    Object.freeze({ alias: 'daniel_nubank', ownerScope: 'daniel', accounts: Object.freeze({ BANK: 1, CREDIT: 1 }) }),
    Object.freeze({ alias: 'thais_nubank', ownerScope: 'thais', accounts: Object.freeze({ BANK: 1, CREDIT: 1 }) }),
    Object.freeze({ alias: 'thais_itau', ownerScope: 'thais', accounts: Object.freeze({ BANK: 2, CREDIT: 1 }) }),
    Object.freeze({ alias: 'cristina_nubank', ownerScope: 'thais', accounts: Object.freeze({ BANK: 1, CREDIT: 1 }) })
]);
const CANONICAL_HISTORICAL_RX_ACCOUNT_SUBTYPES = Object.freeze({
    daniel_nubank: Object.freeze(['BANK:CHECKING_ACCOUNT', 'CREDIT:CREDIT_CARD']),
    thais_nubank: Object.freeze(['BANK:CHECKING_ACCOUNT', 'CREDIT:CREDIT_CARD']),
    thais_itau: Object.freeze(['BANK:CHECKING_ACCOUNT', 'BANK:SAVINGS_ACCOUNT', 'CREDIT:CREDIT_CARD']),
    cristina_nubank: Object.freeze(['BANK:CHECKING_ACCOUNT', 'CREDIT:CREDIT_CARD'])
});
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

function requireCalendarDate(value, code) {
    const text = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(code);
    const timestamp = parseDate(`${text}T00:00:00.000Z`, 'historical_rx_calendar_date');
    if (new Date(timestamp).toISOString().slice(0, 10) !== text) throw new Error(code);
    return text;
}

function resolveAccountLifecycle(definition, historyStart) {
    const lifecycle = definition && typeof definition === 'object' && !Array.isArray(definition)
        ? definition
        : {};
    const availableFrom = lifecycle.availableFrom
        ? requireCalendarDate(lifecycle.availableFrom, 'invalid_historical_rx_lifecycle_date')
        : null;
    const existedAtHistoryStart = typeof lifecycle.existedAtHistoryStart === 'boolean'
        ? lifecycle.existedAtHistoryStart
        : null;
    if ((existedAtHistoryStart === false && availableFrom && availableFrom <= historyStart)
        || (existedAtHistoryStart === true && availableFrom && availableFrom > historyStart)) {
        throw new Error('conflicting_historical_rx_account_lifecycle');
    }
    const historyStartRelation = existedAtHistoryStart === false || (availableFrom && availableFrom > historyStart)
        ? 'not_applicable_before_account_start'
        : existedAtHistoryStart === true || (availableFrom && availableFrom <= historyStart)
            ? 'account_available_at_history_start'
            : 'account_start_unknown';
    return { availableFrom, existedAtHistoryStart, historyStartRelation };
}

function validateHistoricalRxInventoryContract(expectedInventory) {
    if (!Array.isArray(expectedInventory) || !expectedInventory.length) {
        throw new Error('historical_rx_expected_inventory_required');
    }
    const expectedAliases = new Set();
    const normalized = [];
    for (const expected of expectedInventory) {
        const alias = String(expected?.alias || '').trim().toLowerCase();
        const ownerScope = String(expected?.ownerScope || '').trim().toLowerCase();
        const accounts = expected?.accounts;
        if (!/^[a-z0-9_-]{2,48}$/.test(alias) || !ownerScope || expectedAliases.has(alias)
            || Object.keys(expected || {}).sort().join(',') !== 'accounts,alias,ownerScope'
            || !accounts || typeof accounts !== 'object' || Array.isArray(accounts)
            || Object.keys(accounts).sort().join(',') !== 'BANK,CREDIT'
            || !Number.isSafeInteger(accounts.BANK) || accounts.BANK < 0
            || !Number.isSafeInteger(accounts.CREDIT) || accounts.CREDIT < 0) {
            throw new Error('invalid_historical_rx_expected_inventory');
        }
        expectedAliases.add(alias);
        normalized.push({ alias, ownerScope, accounts: { BANK: accounts.BANK, CREDIT: accounts.CREDIT } });
    }
    const sortInventory = inventory => [...inventory].sort((left, right) => left.alias.localeCompare(right.alias));
    if (JSON.stringify(sortInventory(normalized)) !== JSON.stringify(sortInventory(CANONICAL_HISTORICAL_RX_INVENTORY))) {
        throw new Error('historical_rx_noncanonical_inventory');
    }
    return CANONICAL_HISTORICAL_RX_INVENTORY;
}

function validateHistoricalRxMappingAliases(aliases, expectedInventory) {
    const canonical = validateHistoricalRxInventoryContract(expectedInventory);
    if (!Array.isArray(aliases)
        || aliases.length !== new Set(aliases).size
        || JSON.stringify([...aliases].map(alias => String(alias || '').trim().toLowerCase()).sort())
            !== JSON.stringify(canonical.map(entry => entry.alias).sort())) {
        throw new Error('historical_rx_mapping_inventory_mismatch');
    }
    return true;
}

function validateHistoricalRxInventory(items, expectedInventory) {
    const canonicalInventory = validateHistoricalRxInventoryContract(expectedInventory);
    const actualByAlias = new Map(items.map(item => [String(item.alias_code || '').trim().toLowerCase(), item]));
    if (actualByAlias.size !== items.length || canonicalInventory.length !== items.length) {
        throw new Error('historical_rx_inventory_source_mismatch');
    }
    const ownerCounts = {};
    let bankAccounts = 0;
    let creditCards = 0;
    for (const expected of canonicalInventory) {
        const alias = expected.alias;
        const ownerScope = expected.ownerScope;
        const accounts = expected.accounts;
        const actual = actualByAlias.get(alias);
        if (!actual) throw new Error('historical_rx_inventory_source_mismatch');
        if (String(actual.owner_scope || '').trim().toLowerCase() !== ownerScope) {
            throw new Error('historical_rx_inventory_owner_mismatch');
        }
        const actualCounts = { BANK: 0, CREDIT: 0 };
        for (const account of (Array.isArray(actual.accounts) ? actual.accounts : [])) {
            const type = String(account.type || '').toUpperCase();
            if (!Object.hasOwn(actualCounts, type)) throw new Error('historical_rx_inventory_account_type_mismatch');
            actualCounts[type] += 1;
        }
        if (actualCounts.BANK !== accounts.BANK || actualCounts.CREDIT !== accounts.CREDIT) {
            throw new Error('historical_rx_inventory_account_count_mismatch');
        }
        const actualSubtypes = (Array.isArray(actual.accounts) ? actual.accounts : [])
            .map(account => `${String(account.type || '').toUpperCase()}:${String(account.subtype || 'UNKNOWN').toUpperCase()}`)
            .sort();
        const expectedSubtypes = [...CANONICAL_HISTORICAL_RX_ACCOUNT_SUBTYPES[alias]].sort();
        if (JSON.stringify(actualSubtypes) !== JSON.stringify(expectedSubtypes)) {
            throw new Error('historical_rx_inventory_account_subtype_mismatch');
        }
        ownerCounts[ownerScope] = (ownerCounts[ownerScope] || 0) + actualCounts.BANK + actualCounts.CREDIT;
        bankAccounts += actualCounts.BANK;
        creditCards += actualCounts.CREDIT;
    }
    return Object.freeze({
        status: 'validated',
        sources: canonicalInventory.length,
        accounts: bankAccounts + creditCards,
        bank_accounts: bankAccounts,
        credit_cards: creditCards,
        owner_segment_counts: Object.freeze(Object.fromEntries(Object.entries(ownerCounts).sort()))
    });
}

function sum(rows, selector) {
    return rows.reduce((total, row) => total + Number(selector(row) || 0), 0);
}

function uniqueSorted(values) {
    return [...new Set(values)].sort((left, right) => left - right);
}

function providerInvestmentOperation(value) {
    const operationType = String(value || '').trim().toUpperCase();
    let semantic = null;
    if (/^APLIC(?:ACAO)?_FINANCEIRA(?:_|$)/.test(operationType)) semantic = 'reserve_application';
    else if (/^RESGATE_APLIC_FINANCEIRA(?:_|$)/.test(operationType)) semantic = 'reserve_redemption';
    else if (/^RENDIMENTO_APLIC_FINANCEIRA(?:_|$)/.test(operationType)) semantic = 'investment_income';
    else if (/^INVESTIMENTO(?:_|$)/.test(operationType)) semantic = 'investment_related_unknown';
    return semantic ? { operationType, semantic } : null;
}

function historicalRxInstallmentGrouping(transaction = {}) {
    const strongReference = transaction.provider_id || transaction.reference_number || null;
    return {
        confidence: strongReference ? 'provider_reference' : 'provider_metadata_heuristic',
        basis: strongReference
            ? `strong:${strongReference}`
            : [transaction.description, transaction.original_date || '',
                Math.abs(Number(transaction.amount_cents)),
                Number(transaction.total_installments)].join(':')
    };
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

function validateAmbiguityResolutionPlan(plan) {
    if (plan === undefined || plan === null) {
        return {
            excluded: new Set(), distinct: new Set(), investment: new Map(), targeted: new Set()
        };
    }
    const refsAreValid = values => Array.isArray(values)
        && values.every(value => /^[a-f0-9]{32}$/.test(String(value || '')))
        && new Set(values).size === values.length;
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)
        || plan.schema_version !== 1 || plan.financial_writes !== 0
        || !/^[a-f0-9]{32}$/.test(String(plan.review_ref || ''))
        || !refsAreValid(plan.excluded_candidate_refs)
        || !refsAreValid(plan.distinct_candidate_refs)
        || !Array.isArray(plan.investment_semantics)) {
        throw new Error('invalid_historical_rx_ambiguity_resolution_plan');
    }
    const excluded = new Set(plan.excluded_candidate_refs);
    const distinct = new Set(plan.distinct_candidate_refs);
    const investment = new Map();
    for (const entry of plan.investment_semantics) {
        const candidateRef = String(entry?.candidate_ref || '');
        const semantic = String(entry?.semantic || '');
        if (!/^[a-f0-9]{32}$/.test(candidateRef) || investment.has(candidateRef)
            || !['reserve_application', 'reserve_redemption', 'investment_income',
                'not_investment_movement'].includes(semantic)) {
            throw new Error('invalid_historical_rx_ambiguity_resolution_plan');
        }
        investment.set(candidateRef, semantic);
    }
    const targeted = [...excluded, ...distinct, ...investment.keys()];
    if (new Set(targeted).size !== targeted.length) {
        throw new Error('invalid_historical_rx_ambiguity_resolution_plan');
    }
    return { excluded, distinct, investment, targeted: new Set(targeted) };
}

function summarizeInvestmentTransactionHistory(investment, historyStartTimestamp, observedTimestamp) {
    const history = investment?.transaction_history || {};
    const status = String(history.availability || 'unavailable').toLowerCase();
    if (!['available', 'partial', 'unavailable'].includes(status)) {
        throw new Error('invalid_historical_rx_investment_transaction_availability');
    }
    const rows = Array.isArray(history.transactions) ? history.transactions : [];
    if (status !== 'available') {
        if (rows.length) throw new Error('historical_rx_unavailable_investment_transactions_present');
        return {
            linked: false,
            summary: {
                status,
                count: null,
                first_observed_date: null,
                last_observed_date: null,
                type_totals: null
            }
        };
    }
    const observedRows = rows.map((transaction) => {
        const type = String(transaction?.type || '').toUpperCase();
        if (!INVESTMENT_TRANSACTION_TYPES.has(type)) {
            throw new Error('invalid_historical_rx_investment_transaction_type');
        }
        const dateTimestamp = parseDate(transaction.date, 'historical_rx_investment_transaction_date');
        parseDate(transaction.trade_date, 'historical_rx_investment_transaction_trade_date');
        const amountCents = cents(transaction.amount_cents, 'historical_rx_investment_transaction_amount');
        const netAmountCents = cents(transaction.net_amount_cents,
            'historical_rx_investment_transaction_net_amount', { nullable: true });
        return { type, dateTimestamp, amountCents, netAmountCents };
    }).filter(transaction => transaction.dateTimestamp >= historyStartTimestamp
        && transaction.dateTimestamp <= observedTimestamp);
    const byType = new Map();
    for (const transaction of observedRows) {
        const current = byType.get(transaction.type) || {
            type: transaction.type,
            count: 0,
            amount_cents: 0,
            net_amount_cents: 0,
            net_complete: true
        };
        current.count += 1;
        current.amount_cents += transaction.amountCents;
        if (transaction.netAmountCents === null) current.net_complete = false;
        else current.net_amount_cents += transaction.netAmountCents;
        byType.set(transaction.type, current);
    }
    const dates = observedRows.map(transaction => transaction.dateTimestamp);
    return {
        linked: true,
        summary: {
            status: 'available',
            count: observedRows.length,
            first_observed_date: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
            last_observed_date: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
            type_totals: [...byType.values()]
                .sort((left, right) => left.type.localeCompare(right.type))
                .map(({ type, count, amount_cents, net_amount_cents, net_complete }) => ({
                    type,
                    count,
                    amount_cents,
                    net_amount_cents: net_complete ? net_amount_cents : null
                }))
        }
    };
}

function buildOpenFinanceHistoricalRx({
    items = [],
    historyStartDate,
    observedAt,
    secret,
    sourceLifecycles = {},
    expectedInventory,
    ambiguityResolutionPlan
} = {}) {
    const hmacSecret = requireSecret(secret);
    const historyStart = requireCalendarDate(historyStartDate, 'invalid_historical_rx_history_start');
    const historyStartTimestamp = parseDate(`${historyStart}T00:00:00.000Z`, 'historical_rx_history_start');
    const observedTimestamp = parseDate(observedAt, 'historical_rx_observed_at');
    if (observedTimestamp < historyStartTimestamp) throw new Error('historical_rx_observed_before_history_start');
    if (!Array.isArray(items) || !items.length) throw new Error('historical_rx_items_required');
    const inventoryValidation = validateHistoricalRxInventory(items, expectedInventory);

    const ref = (kind, value) => crypto.createHmac('sha256', hmacSecret)
        .update(`${kind}:${String(value || '')}`).digest('hex').slice(0, 32);
    const ambiguityResolution = validateAmbiguityResolutionPlan(ambiguityResolutionPlan);
    const consumedResolutionRefs = new Set();
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

        const sourceLifecycle = sourceLifecycles[alias] || {};
        const accountLifecycles = sourceLifecycle.accounts === undefined
            ? {}
            : sourceLifecycle.accounts;
        if (!accountLifecycles || typeof accountLifecycles !== 'object' || Array.isArray(accountLifecycles)) {
            throw new Error('invalid_historical_rx_account_lifecycles');
        }
        const hasSourceLifecycleDefault = typeof sourceLifecycle.existedAtHistoryStart === 'boolean'
            || Boolean(sourceLifecycle.availableFrom);
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
        for (const accountId of Object.keys(accountLifecycles)) {
            if (!accountIds.has(accountId)) throw new Error('historical_rx_lifecycle_account_unknown');
        }
        if (Object.keys(accountLifecycles).length && !hasSourceLifecycleDefault
            && accounts.some(account => !Object.hasOwn(accountLifecycles, String(account.id || '')))) {
            throw new Error('historical_rx_account_lifecycle_required');
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
            const accountLifecycleDefinition = Object.hasOwn(accountLifecycles, accountId)
                ? accountLifecycles[accountId]
                : sourceLifecycle;
            const {
                availableFrom: accountAvailableFrom,
                existedAtHistoryStart: accountExistedAtHistoryStart,
                historyStartRelation
            } = resolveAccountLifecycle(accountLifecycleDefinition, historyStart);
            if (historyStartRelation === 'account_start_unknown'
                && !blockers.includes(`${alias}:account_start_unknown`)) {
                blockers.push(`${alias}:account_start_unknown`);
            }

            const transactionStatus = String(item.availability?.transactions || 'unavailable').toLowerCase();
            const accountStatus = String(item.availability?.accounts || 'unavailable').toLowerCase();
            const accountsAvailable = accountStatus === 'available';
            const transactionsAvailable = accountsAvailable && transactionStatus === 'available';
            const accountAvailableTimestamp = accountAvailableFrom
                ? parseDate(`${accountAvailableFrom}T00:00:00.000Z`, 'historical_rx_account_available_from')
                : null;
            const historicalRows = transactionsAvailable ? (item.transactions || []).filter(transaction => {
                if (String(transaction.account_id || '') !== accountId) return false;
                const timestamp = parseDate(transaction.date, 'historical_rx_transaction_date');
                if (timestamp < historyStartTimestamp) return false;
                const candidateRef = ref('historical-ambiguity-transaction', transaction.id);
                if (ambiguityResolution.targeted.has(candidateRef)) {
                    if (consumedResolutionRefs.has(candidateRef)) {
                        throw new Error('invalid_historical_rx_ambiguity_resolution_plan');
                    }
                    consumedResolutionRefs.add(candidateRef);
                }
                return !ambiguityResolution.excluded.has(candidateRef);
            }) : [];
            const rowsBeforeAvailability = accountAvailableTimestamp === null ? [] : historicalRows.filter(transaction =>
                parseDate(transaction.date, 'historical_rx_transaction_date') < accountAvailableTimestamp
            );
            if (rowsBeforeAvailability.length > 0
                && !blockers.includes(`${alias}:activity_before_account_start`)) {
                blockers.push(`${alias}:activity_before_account_start`);
            }
            const rows = accountAvailableTimestamp === null ? historicalRows : historicalRows.filter(transaction =>
                parseDate(transaction.date, 'historical_rx_transaction_date') >= accountAvailableTimestamp
            );
            const postedThroughObservation = rows.filter(transaction =>
                String(transaction.status || '').toUpperCase() === 'POSTED' &&
                parseDate(transaction.date, 'historical_rx_transaction_date') <= observedTimestamp
            );
            const pending = rows.filter(transaction => String(transaction.status || '').toUpperCase() === 'PENDING');
            const positive = rows.filter(transaction => Number(transaction.amount_cents) > 0);
            const negative = rows.filter(transaction => Number(transaction.amount_cents) < 0);
            const providerInvestmentOperations = rows.map(transaction => {
                const candidateRef = ref('historical-ambiguity-transaction', transaction.id);
                const resolvedSemantic = ambiguityResolution.investment.get(candidateRef);
                if (resolvedSemantic === 'not_investment_movement') {
                    return { transaction, operation: null };
                }
                if (resolvedSemantic) {
                    const amountCents = Number(transaction.amount_cents);
                    const directionValid = (resolvedSemantic === 'reserve_application' && amountCents < 0)
                        || (['reserve_redemption', 'investment_income'].includes(resolvedSemantic)
                            && amountCents > 0);
                    if (!directionValid) {
                        throw new Error('invalid_historical_rx_ambiguity_resolution_plan');
                    }
                    return {
                        transaction,
                        operation: {
                            operationType: `FAMILY_REVIEW_${resolvedSemantic.toUpperCase()}`,
                            semantic: resolvedSemantic
                        }
                    };
                }
                return { transaction, operation: providerInvestmentOperation(transaction.operation_type) };
            }).filter(entry => entry.operation);
            const providerLabeledInvestmentRows = providerInvestmentOperations.map(entry => entry.transaction);
            const reserveApplicationRows = providerInvestmentOperations
                .filter(entry => entry.operation.semantic === 'reserve_application')
                .map(entry => entry.transaction);
            const reserveRedemptionRows = providerInvestmentOperations
                .filter(entry => entry.operation.semantic === 'reserve_redemption')
                .map(entry => entry.transaction);
            const investmentIncomeRows = providerInvestmentOperations
                .filter(entry => entry.operation.semantic === 'investment_income')
                .map(entry => entry.transaction);
            const semanticallyAmbiguousInvestmentRows = providerInvestmentOperations.filter(entry =>
                entry.operation.semantic === 'investment_related_unknown'
                || (entry.operation.semantic === 'reserve_application'
                    && Number(entry.transaction.amount_cents) >= 0)
                || (entry.operation.semantic === 'reserve_redemption'
                    && Number(entry.transaction.amount_cents) <= 0)
                || (entry.operation.semantic === 'investment_income'
                    && Number(entry.transaction.amount_cents) <= 0)
            );
            if (semanticallyAmbiguousInvestmentRows.length > 0
                && !blockers.includes(`${alias}:investment_movement_semantics_ambiguous`)) {
                blockers.push(`${alias}:investment_movement_semantics_ambiguous`);
            }
            const semanticallyAmbiguousTransactions = new Set(
                semanticallyAmbiguousInvestmentRows.map(entry => entry.transaction)
            );
            const validReserveApplicationRows = reserveApplicationRows.filter(transaction =>
                !semanticallyAmbiguousTransactions.has(transaction)
            );
            const validReserveRedemptionRows = reserveRedemptionRows.filter(transaction =>
                !semanticallyAmbiguousTransactions.has(transaction)
            );
            const validInvestmentIncomeRows = investmentIncomeRows.filter(transaction =>
                !semanticallyAmbiguousTransactions.has(transaction)
            );
            const reservePrincipalRows = new Set([
                ...validReserveApplicationRows,
                ...validReserveRedemptionRows
            ]);
            const nonReservePrincipalRows = rows.filter(transaction => !reservePrincipalRows.has(transaction));
            const postedInvestmentRows = providerLabeledInvestmentRows.filter(transaction =>
                String(transaction.status || '').toUpperCase() === 'POSTED'
                && parseDate(transaction.date, 'historical_rx_transaction_date') <= observedTimestamp
            );
            const pendingInvestmentRows = providerLabeledInvestmentRows.filter(transaction =>
                String(transaction.status || '').toUpperCase() === 'PENDING'
            );
            const dates = rows.map(transaction => String(transaction.date).slice(0, 10)).sort();
            const segmentRef = ref('historical_rx_segment', `${alias}:${accountId}`);
            const isBank = accountType === 'BANK';
            const currentBalance = cents(account.balance_cents,
                'historical_rx_account_balance', { nullable: true });

            let historyStartReconstruction;
            if (historyStartRelation === 'not_applicable_before_account_start') {
                historyStartReconstruction = { balance_cents: null, reason: 'account_not_available_at_history_start' };
            } else if (!isBank) {
                historyStartReconstruction = { balance_cents: null, reason: 'credit_balance_is_not_invoice' };
            } else if (currentBalance === null || !transactionsAvailable) {
                historyStartReconstruction = { balance_cents: null, reason: 'complete_bank_history_unavailable' };
            } else {
                historyStartReconstruction = {
                    balance_cents: currentBalance - sum(postedThroughObservation, row => row.amount_cents),
                    confidence: 'conditional_on_complete_posted_history'
                };
            }

            const billStatus = String(item.availability?.bills || 'unavailable').toLowerCase();
            const billsAvailable = accountsAvailable && billStatus === 'available';
            const historicalBills = billsAvailable ? (item.bills || []).filter(bill =>
                String(bill.account_id || '') === accountId
                && parseDate(bill.due_date, 'historical_rx_bill_due_date') >= historyStartTimestamp
            ) : [];
            const billsBeforeAvailability = accountAvailableTimestamp === null ? [] : historicalBills.filter(bill =>
                parseDate(bill.due_date, 'historical_rx_bill_due_date') < accountAvailableTimestamp
            );
            if (billsBeforeAvailability.length > 0
                && !blockers.includes(`${alias}:activity_before_account_start`)) {
                blockers.push(`${alias}:activity_before_account_start`);
            }
            const accountBills = accountAvailableTimestamp === null ? historicalBills : historicalBills.filter(bill =>
                parseDate(bill.due_date, 'historical_rx_bill_due_date') >= accountAvailableTimestamp
            );
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
                const candidateRef = ref('historical-ambiguity-transaction', transaction.id);
                const resolvedDistinct = ambiguityResolution.distinct.has(candidateRef);
                const grouping = resolvedDistinct
                    ? { confidence: 'family_review_distinct', basis: `resolved:${candidateRef}` }
                    : historicalRxInstallmentGrouping(transaction);
                const seriesRef = ref('historical_rx_installment', `${alias}:${accountId}:${grouping.basis}`);
                if (!series.has(seriesRef)) {
                    series.set(seriesRef, {
                        series_ref: seriesRef,
                        grouping_confidence: grouping.confidence,
                        total_installments: totalInstallments,
                        observed_numbers: [],
                        observed_rows: 0,
                        duplicate_numbers: [],
                        billing_months: []
                    });
                }
                const entry = series.get(seriesRef);
                if (entry.total_installments !== totalInstallments) {
                    throw new Error('conflicting_historical_rx_installment_total');
                }
                entry.observed_rows += 1;
                if (entry.observed_numbers.includes(installmentNumber)) {
                    entry.duplicate_numbers.push(installmentNumber);
                } else {
                    entry.observed_numbers.push(installmentNumber);
                }
                if (transaction.bill_forecast_month) entry.billing_months.push(String(transaction.bill_forecast_month).slice(0, 7));
            }
            const installmentSeries = [...series.values()].map(entry => {
                entry.observed_numbers = uniqueSorted(entry.observed_numbers);
                entry.duplicate_numbers = uniqueSorted(entry.duplicate_numbers);
                entry.billing_months = [...new Set(entry.billing_months)].sort();
                const ambiguous = entry.duplicate_numbers.length > 0;
                entry.identity_status = ambiguous
                    ? 'ambiguous_duplicate_installment_number'
                    : 'unique_within_group';
                entry.save_eligibility = ambiguous
                    ? 'blocked_pending_identity_resolution'
                    : 'not_authorized_by_read_only_rx';
                entry.missing_numbers = ambiguous
                    ? null
                    : Array.from({ length: entry.total_installments }, (_, index) => index + 1)
                        .filter(number => !entry.observed_numbers.includes(number));
                if (ambiguous && !blockers.includes(`${alias}:installment_series_ambiguous`)) {
                    blockers.push(`${alias}:installment_series_ambiguous`);
                }
                return entry;
            }).sort((left, right) => left.series_ref.localeCompare(right.series_ref));
            const hasAmbiguousInstallments = installmentSeries.some(entry =>
                entry.identity_status === 'ambiguous_duplicate_installment_number');

            segments.push({
                segment_ref: segmentRef,
                source_alias: alias,
                owner_scope: String(item.owner_scope || '').toLowerCase(),
                product: isBank ? 'bank_account' : 'credit_card',
                subtype: String(account.subtype || 'UNKNOWN').toUpperCase(),
                currency: String(account.currency || 'BRL').toUpperCase(),
                history_start_relation: historyStartRelation,
                account_available_from: accountAvailableFrom,
                account_existed_at_history_start: accountExistedAtHistoryStart,
                coverage: {
                    account_status: accountStatus,
                    status: transactionStatus,
                    first_observed_date: dates[0] || null,
                    last_observed_date: dates[dates.length - 1] || null
                },
                flows: !transactionsAvailable ? (isBank ? {
                    semantic: 'raw_account_movement_not_income_expense',
                    reserve_principal_exclusion_scope: 'unavailable',
                    count: null,
                    posted_count: null,
                    pending_count: null,
                    credits_cents: null,
                    debits_cents: null,
                    non_reserve_principal_credits_cents: null,
                    non_reserve_principal_debits_cents: null,
                    posted_net_cents: null
                } : {
                    identity_status: 'unavailable',
                    count: null,
                    posted_count: null,
                    pending_count: null,
                    charges_cents: null,
                    payments_or_credits_cents: null,
                    posted_net_cents: null
                }) : isBank ? {
                    semantic: 'raw_account_movement_not_income_expense',
                    reserve_principal_exclusion_scope: semanticallyAmbiguousInvestmentRows.length > 0
                        ? 'provider_labeled_with_ambiguous_semantics'
                        : 'provider_labeled_only',
                    count: rows.length,
                    posted_count: postedThroughObservation.length,
                    pending_count: pending.length,
                    credits_cents: sum(positive, row => row.amount_cents),
                    debits_cents: Math.abs(sum(negative, row => row.amount_cents)),
                    non_reserve_principal_credits_cents: sum(
                        nonReservePrincipalRows.filter(row => Number(row.amount_cents) > 0),
                        row => row.amount_cents
                    ),
                    non_reserve_principal_debits_cents: Math.abs(sum(
                        nonReservePrincipalRows.filter(row => Number(row.amount_cents) < 0),
                        row => row.amount_cents
                    )),
                    posted_net_cents: sum(postedThroughObservation, row => row.amount_cents)
                } : {
                    identity_status: hasAmbiguousInstallments
                        ? 'ambiguous_raw_provider_rows'
                        : 'observed_provider_rows',
                    count: rows.length,
                    posted_count: postedThroughObservation.length,
                    pending_count: pending.length,
                    charges_cents: sum(positive, row => row.amount_cents),
                    payments_or_credits_cents: Math.abs(sum(negative, row => row.amount_cents)),
                    posted_net_cents: sum(postedThroughObservation, row => row.amount_cents)
                },
                investment_movements: !isBank ? {
                    status: 'not_applicable',
                    unlabeled_movements_inferred: false,
                    principal_transfers_treated_as_income: false,
                    principal_transfers_treated_as_expense: false,
                    count: null,
                    posted_count: null,
                    pending_count: null,
                    credits_cents: null,
                    debits_cents: null,
                    applications_cents: null,
                    redemptions_cents: null,
                    investment_income_cents: null,
                    semantically_ambiguous_count: null,
                    operation_types: null
                } : !transactionsAvailable ? {
                    status: 'unavailable',
                    unlabeled_movements_inferred: false,
                    principal_transfers_treated_as_income: false,
                    principal_transfers_treated_as_expense: false,
                    count: null,
                    posted_count: null,
                    pending_count: null,
                    credits_cents: null,
                    debits_cents: null,
                    applications_cents: null,
                    redemptions_cents: null,
                    investment_income_cents: null,
                    semantically_ambiguous_count: null,
                    operation_types: null
                } : {
                    status: semanticallyAmbiguousInvestmentRows.length > 0
                        ? 'provider_labeled_with_ambiguous_semantics'
                        : 'provider_labeled_only',
                    unlabeled_movements_inferred: false,
                    principal_transfers_treated_as_income: false,
                    principal_transfers_treated_as_expense: false,
                    count: providerLabeledInvestmentRows.length,
                    posted_count: postedInvestmentRows.length,
                    pending_count: pendingInvestmentRows.length,
                    credits_cents: sum(providerLabeledInvestmentRows.filter(row => Number(row.amount_cents) > 0),
                        row => row.amount_cents),
                    debits_cents: Math.abs(sum(providerLabeledInvestmentRows.filter(row => Number(row.amount_cents) < 0),
                        row => row.amount_cents)),
                    applications_cents: Math.abs(sum(validReserveApplicationRows, row => row.amount_cents)),
                    redemptions_cents: Math.abs(sum(validReserveRedemptionRows, row => row.amount_cents)),
                    investment_income_cents: sum(validInvestmentIncomeRows, row => row.amount_cents),
                    semantically_ambiguous_count: semanticallyAmbiguousInvestmentRows.length,
                    operation_types: [...new Set(providerInvestmentOperations
                        .map(entry => entry.operation.operationType))].sort()
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
                history_start_reconstruction: historyStartReconstruction,
                bills: {
                    status: billStatus,
                    count: billsAvailable ? accountBills.length : null,
                    total_cents: billsAvailable ? sum(accountBills, row => row.total_cents) : null,
                    first_due_date: accountBills.map(row => String(row.due_date).slice(0, 10)).sort()[0] || null,
                    last_due_date: accountBills.map(row => String(row.due_date).slice(0, 10)).sort().at(-1) || null
                },
                installments: {
                    status: transactionStatus,
                    write_mode: 'read_only',
                    series: transactionsAvailable ? installmentSeries : null,
                    series_count: transactionsAvailable ? installmentSeries.length : null,
                    incomplete_series_count: transactionsAvailable
                        ? installmentSeries.filter(entry => entry.missing_numbers === null
                            || entry.missing_numbers.length > 0).length
                        : null,
                    ambiguous_series_count: transactionsAvailable
                        ? installmentSeries.filter(entry => entry.identity_status
                            === 'ambiguous_duplicate_installment_number').length
                        : null,
                    observed_rows: transactionsAvailable ? installmentRows.length : null,
                    synthesized_rows: 0
                }
            });
        }

        const investmentsAvailable = String(item.availability?.investments || 'unavailable').toLowerCase()
            === 'available';
        const availableInvestments = investmentsAvailable ? (item.investments || []) : [];
        const investmentsWithHistory = availableInvestments.map(investment => ({
            investment,
            transactionHistory: summarizeInvestmentTransactionHistory(
                investment, historyStartTimestamp, observedTimestamp
            )
        }));
        const derivedInvestmentTransactionsAvailability = investmentsAvailable
            ? investmentsWithHistory.length === 0
                ? 'available'
                : investmentsWithHistory.every(entry => entry.transactionHistory.summary.status === 'available')
                    ? 'available'
                    : investmentsWithHistory.every(entry => entry.transactionHistory.summary.status === 'unavailable')
                        ? 'unavailable'
                        : 'partial'
            : 'unavailable';
        if (investmentsWithHistory.length > 0
            && item.availability?.investment_transactions !== undefined
            && String(item.availability.investment_transactions).toLowerCase()
                !== derivedInvestmentTransactionsAvailability) {
            throw new Error('historical_rx_inconsistent_investment_transaction_availability');
        }
        for (const { investment, transactionHistory } of investmentsWithHistory) {
            if (!transactionHistory.linked
                && !blockers.includes(`${alias}:investment_history_unlinked`)) {
                blockers.push(`${alias}:investment_history_unlinked`);
            }
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
                movement_linkage: transactionHistory.linked
                    ? 'provider_position_transactions'
                    : 'not_provided_by_provider',
                historical_reconstruction: null,
                transaction_history: transactionHistory.summary
            });
        }
    }

    if (consumedResolutionRefs.size !== ambiguityResolution.targeted.size) {
        throw new Error('invalid_historical_rx_ambiguity_resolution_plan');
    }
    return Object.freeze({
        schema_version: 2,
        gate: HISTORICAL_RX_GATE,
        history_start_date: historyStart,
        observed_at: new Date(observedTimestamp).toISOString(),
        ready_for_reconciliation: blockers.length === 0,
        blockers: blockers.sort(),
        inventory_validation: inventoryValidation,
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
    CANONICAL_HISTORICAL_RX_INVENTORY,
    HISTORICAL_RX_GATE,
    buildOpenFinanceHistoricalRx,
    classifyHistoricalRxInvestmentOperation: providerInvestmentOperation,
    historicalRxInstallmentGrouping,
    validateHistoricalRxInventory,
    validateHistoricalRxInventoryContract,
    validateHistoricalRxMappingAliases,
    snapshotSqliteFileSet,
    sqliteFileSetsEqual
};
