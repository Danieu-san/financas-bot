const crypto = require('node:crypto');
const { readDataFromSheet, runWithUserSheetContext, hasUserSpreadsheetContext } = require('../services/google');
const { getFinancialScopeUserIds } = require('../services/oauthTokenStore');
const { parseValue } = require('../utils/helpers');
const { reconcileOpenFinanceShadow } = require('./openFinanceShadowReconciler');
const { OpenFinanceShadowPreviewStore } = require('./openFinanceShadowPreviewStore');

const RESOLUTION_BY_STATUS = Object.freeze({
    matched: 'internal_matched',
    possible_duplicate: 'internal_review',
    uncertain: 'internal_uncertain'
});

function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function reconciliationMode(env = process.env) {
    const mode = String(env.OPEN_FINANCE_RECONCILIATION_MODE || 'off').trim().toLowerCase();
    if (!['off', 'canary'].includes(mode)) throw new Error('invalid_open_finance_reconciliation_mode');
    return mode;
}

function observationRef(secret, itemId, accountId, transactionId) {
    return crypto.createHmac('sha256', String(secret || ''))
        .update(`observation:${itemId}:${accountId}:${transactionId}`).digest('hex').slice(0, 32);
}

function unavailable(reason) {
    return { available: false, source_health: reason, transactions: [], financial_writes: 0 };
}

function stableTransactionId(sourceType, row) {
    return `${sourceType}:${crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex').slice(0, 40)}`;
}

function rowHasContent(row) {
    return Array.isArray(row) && row.some(value => String(value || '').trim());
}

function hasHeader(rows) {
    return Array.isArray(rows) && rowHasContent(rows[0]);
}

function aliasScopeCoverage(aliases, cardRows, accountRows) {
    const matches = (rows, tokens) => (rows || []).slice(1).some(row => {
        const text = normalize((row || []).join(' '));
        return text && tokens.every(token => text.includes(token));
    });
    return Object.fromEntries([...new Set((aliases || []).map(value => String(value || '').trim()).filter(Boolean))]
        .map(alias => {
            const tokens = normalize(alias).split(/\s+/).filter(Boolean);
            return [alias, { card: matches(cardRows, tokens), account: matches(accountRows, tokens) }];
        }));
}

function mapSheetTransactions(rows, sourceType, userIndex, mapper, allowedIds) {
    const transactions = [];
    let unscopedRows = 0;
    for (const row of (rows || []).slice(1)) {
        if (!rowHasContent(row)) continue;
        const userId = String(row[userIndex] || '').trim();
        if (!userId || !allowedIds.has(userId)) {
            unscopedRows += 1;
            continue;
        }
        const value = parseValue(mapper.value(row));
        transactions.push({
            id: stableTransactionId(sourceType, row),
            user_id: userId,
            source_type: sourceType,
            date: row[0] || '',
            description: row[1] || '',
            amountCents: Math.round(value * 100),
            ...mapper.fields(row, value)
        });
    }
    return { transactions, unscopedRows };
}

async function readOpenFinanceInternalSource({
    users = [],
    userIds = [],
    aliases = [],
    dependencies = {}
} = {}) {
    const ids = [...new Set(userIds.map(value => String(value || '').trim()).filter(Boolean))];
    if (!ids.length) return unavailable('internal_scope_unavailable');
    const allowedIds = new Set(ids);
    const hasContext = dependencies.hasUserSpreadsheetContext || hasUserSpreadsheetContext;
    const financialScope = dependencies.getFinancialScopeUserIds || getFinancialScopeUserIds;
    const runInContext = dependencies.runWithUserSheetContext || runWithUserSheetContext;
    const read = dependencies.readDataFromSheet || readDataFromSheet;

    try {
        let selectedUser = null;
        for (const user of users) {
            const userId = String(user?.user_id || '').trim();
            if (!allowedIds.has(userId)) continue;
            const contextAvailable = await hasContext({
                userId,
                displayName: String(user?.display_name || '').trim()
            });
            const scopedIds = new Set(await financialScope(userId));
            if (contextAvailable && ids.every(id => scopedIds.has(id))) {
                selectedUser = user;
                break;
            }
        }
        if (!selectedUser) return unavailable('internal_family_source_unavailable');

        const rows = await runInContext({ ...selectedUser, telemetryConsumer: 'open_finance_reconciliation' }, () => (
            Promise.all([
                read('Saídas!A:K', { requireUserScoped: true, telemetryConsumer: 'open_finance_reconciliation' }),
                read('Entradas!A:J', { requireUserScoped: true, telemetryConsumer: 'open_finance_reconciliation' }),
                read('Transferências!A:I', { requireUserScoped: true, telemetryConsumer: 'open_finance_reconciliation' }),
                read('Lançamentos Cartão!A:J', { requireUserScoped: true, telemetryConsumer: 'open_finance_reconciliation' }),
                read('Cartões!A:G', { requireUserScoped: true, suppressMissingSheetError: true,
                    telemetryConsumer: 'open_finance_reconciliation' }),
                read('Contas Financeiras!A:I', { requireUserScoped: true, suppressMissingSheetError: true,
                    telemetryConsumer: 'open_finance_reconciliation' })
            ])
        ));
        const [expenseRows, entryRows, transferRows, cardRows, cardConfigRows, accountRows] = rows;
        if (![expenseRows, entryRows, transferRows, cardRows].every(hasHeader)) {
            return unavailable('internal_family_source_incomplete');
        }

        const mapped = [
            mapSheetTransactions(expenseRows, 'saida', 9, {
                value: row => row[4],
                fields: (row, value) => ({
                    direction: value < 0 ? 'credit' : 'debit',
                    financial_account: row[10] || ''
                })
            }, allowedIds),
            mapSheetTransactions(entryRows, 'entrada', 8, {
                value: row => row[3],
                fields: (row, value) => ({
                    direction: value < 0 ? 'debit' : 'credit',
                    financial_account: row[9] || ''
                })
            }, allowedIds),
            mapSheetTransactions(transferRows, 'transferencia', 8, {
                value: row => row[2],
                fields: row => ({ direction: 'transfer', origin: row[3] || '', destination: row[4] || '' })
            }, allowedIds),
            mapSheetTransactions(cardRows, 'cartao', 9, {
                value: row => row[3],
                fields: (row, value) => ({
                    direction: value < 0 ? 'credit' : 'debit',
                    card_id: row[6] || '',
                    card_name: row[7] || ''
                })
            }, allowedIds)
        ];
        return {
            available: true,
            source_health: 'available',
            source_kind: 'family_sheet',
            transactions: mapped.flatMap(result => result.transactions),
            scope_coverage: aliasScopeCoverage(aliases, cardConfigRows, accountRows),
            unscoped_rows: mapped.reduce((total, result) => total + result.unscopedRows, 0),
            financial_writes: 0
        };
    } catch (error) {
        return unavailable('internal_family_source_unavailable');
    }
}

function sourceDirection(account, transaction) {
    const amount = Number(transaction.amount_cents);
    if (!Number.isFinite(amount) || amount === 0) return null;
    if (account?.type === 'CREDIT') return amount > 0 ? 'debit' : 'credit';
    if (account?.type === 'BANK') return amount < 0 ? 'debit' : 'credit';
    return null;
}

function scopeText(row) {
    if (row.source_type === 'cartao') return [row.card_id, row.card_name, row.source_name].filter(Boolean).join(' ');
    if (row.source_type === 'transferencia') return [row.origin, row.destination].filter(Boolean).join(' ');
    return String(row.financial_account || '');
}

function scopeInternalTransactions(item, transaction, internalTransactions) {
    const account = (item.accounts || []).find(row => row.id === transaction.account_id);
    if (!account) return [];
    const direction = sourceDirection(account, transaction);
    const tokens = normalize(item.alias_code).split(/\s+/).filter(Boolean);
    const allowedTypes = account.type === 'CREDIT'
        ? new Set(direction === 'credit' ? ['cartao', 'entrada'] : ['cartao'])
        : new Set(direction === 'credit' ? ['entrada', 'transferencia'] : ['saida', 'transferencia']);

    return internalTransactions.flatMap(row => {
        if (!allowedTypes.has(row.source_type)) return [];
        const identity = normalize(scopeText(row));
        const matchesIdentity = identity && tokens.every(token => identity.includes(token));
        if (identity && !matchesIdentity) return [];
        const exactScope = matchesIdentity && !(account.type === 'CREDIT' && row.source_type === 'entrada');
        return [{ ...row, reconciliation_scope: exactScope ? 'verified' : 'unverified' }];
    });
}

function annotateTransaction(account, transaction, sameTypeAccountCount = 1, scopeAvailable = true) {
    const totalInstallments = Number(transaction.total_installments);
    const installmentNumber = Number(transaction.installment_number);
    return {
        ...transaction,
        reconciliation_direction: sourceDirection(account, transaction),
        ...((Number.isInteger(totalInstallments) && totalInstallments > 1)
            || (Number.isInteger(installmentNumber) && installmentNumber > 1)
            ? { reconciliation_unsupported_reason: 'installment_reconciliation_unsupported' }
            : sameTypeAccountCount > 1
                ? { reconciliation_unsupported_reason: 'ambiguous_provider_account_scope' }
                : !scopeAvailable
                    ? { reconciliation_unsupported_reason: 'internal_account_scope_unavailable' }
                    : {})
    };
}

function reconcileOpenFinanceRuntimeCandidates({
    items = [],
    candidates = [],
    internalTransactions = [],
    scopeCoverage = null,
    secret,
    previewDatabasePath,
    revocationJournal
} = {}) {
    const summary = {
        matched: 0,
        new: 0,
        possible_duplicate: 0,
        uncertain: 0,
        lifecycle_replayed: 0,
        possible_replacement: 0,
        resolved_replay: 0,
        source_missing: 0
    };
    const candidateByRef = new Map();
    for (const candidate of candidates) {
        if (candidate.correlation_state === 'new_event') candidateByRef.set(candidate.observation_ref, candidate);
        else if (candidate.correlation_state === 'alias_confirmed') summary.lifecycle_replayed += 1;
        else if (candidate.correlation_state === 'possible_replacement') summary.possible_replacement += 1;
        else summary.resolved_replay += 1;
    }

    const decisions = [];
    const previewItems = [];
    const seenCandidateRefs = new Set();
    for (const item of items) {
        const accounts = new Map((item.accounts || []).map(account => [account.id, account]));
        const accountTypeCounts = (item.accounts || []).reduce((counts, account) => {
            counts.set(account.type, (counts.get(account.type) || 0) + 1);
            return counts;
        }, new Map());
        const grouped = new Map();
        for (const transaction of item.transactions || []) {
            const ref = observationRef(secret, item.id, transaction.account_id, transaction.id);
            if (!candidateByRef.has(ref)) continue;
            seenCandidateRefs.add(ref);
            const account = accounts.get(transaction.account_id);
            const coverage = scopeCoverage?.[item.alias_code];
            const scopeAvailable = !coverage
                || (account?.type === 'CREDIT' ? coverage.card === true : coverage.account === true);
            const annotated = annotateTransaction(account, transaction, accountTypeCounts.get(account?.type) || 0,
                scopeAvailable);
            const group = grouped.get(transaction.account_id) || [];
            group.push(annotated);
            grouped.set(transaction.account_id, group);
        }
        const selectedTransactions = [...grouped.values()].flat();
        if (selectedTransactions.length) previewItems.push({ ...item, transactions: selectedTransactions });
        for (const group of grouped.values()) {
            const scopedById = new Map();
            for (const transaction of group) {
                for (const row of scopeInternalTransactions(item, transaction, internalTransactions)) {
                    const current = scopedById.get(row.id);
                    if (!current || (current.reconciliation_scope === 'unverified'
                        && row.reconciliation_scope === 'verified')) scopedById.set(row.id, row);
                }
            }
            const result = reconcileOpenFinanceShadow({
                openFinanceItems: [{ ...item, transactions: group }],
                canonicalTransactions: [...scopedById.values()],
                secret
            });
            decisions.push(...result.decisions);
        }
    }
    summary.source_missing = candidateByRef.size - seenCandidateRefs.size;
    for (const decision of decisions) summary[decision.status] += 1;

    const reviewable = decisions.filter(decision => ['possible_duplicate', 'uncertain'].includes(decision.status));
    let review = { available: true, inserted: 0, replayed: 0, reviewable: 0, financial_writes: 0 };
    if (reviewable.length) {
        if (!previewDatabasePath) {
            review = { available: false, reason: 'review_store_unavailable', financial_writes: 0 };
        } else {
            let store;
            try {
                store = new OpenFinanceShadowPreviewStore({
                    databasePath: previewDatabasePath,
                    secret,
                    revocationJournal
                });
                review = { available: true, ...store.ingest({
                    decisions,
                    openFinanceItems: previewItems,
                    canonicalTransactions: internalTransactions
                }) };
            } catch (error) {
                review = { available: false, reason: 'review_store_unavailable', financial_writes: 0 };
            } finally {
                store?.close();
            }
        }
    }

    const decisionByObservation = new Map(decisions.map(decision => [decision.observation_ref, decision]));
    const eligibleCandidates = candidates.filter(candidate => (
        candidate.correlation_state === 'new_event'
        && decisionByObservation.get(candidate.observation_ref)?.status === 'new'
    )).map(candidate => ({ ...candidate, reconciliation_status: 'new' }));
    const resolutions = decisions.filter(decision => (
        decision.status === 'matched'
        || (review.available && ['possible_duplicate', 'uncertain'].includes(decision.status))
    )).map(decision => ({
        observation_ref: decision.observation_ref,
        correlation_state: RESOLUTION_BY_STATUS[decision.status]
    }));

    return {
        decisions,
        summary,
        eligibleCandidates,
        resolutions,
        review,
        financial_writes: 0
    };
}

module.exports = {
    readOpenFinanceInternalSource,
    reconcileOpenFinanceRuntimeCandidates,
    reconciliationMode,
    observationRef,
    __test__: { normalize, scopeInternalTransactions, sourceDirection }
};
