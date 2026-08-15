const crypto = require('node:crypto');
const {
    classifyInitialOpenFinanceTransaction
} = require('./openFinanceLifecycleClassifier');
const {
    isReviewableCreditPurchase
} = require('./openFinancePurchaseProposalEligibility');

const TERMINAL_STATES = new Set([
    'ready',
    'existing',
    'possible_duplicate',
    'excluded',
    'needs_review',
    'outside_window'
]);

const MONTH_NAMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

function stableSerialize(value) {
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key =>
            `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function normalizeText(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function parseDate(value) {
    const text = String(value || '').trim();
    let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (match) {
        return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1,
            Number(match[3])));
    }
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (match) {
        return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1,
            Number(match[1])));
    }
    return null;
}

function isoDate(value) {
    const date = parseDate(value);
    return date ? date.toISOString().slice(0, 10) : '';
}

function sheetDate(value) {
    const date = parseDate(value);
    if (!date) throw new Error('open_finance_historical_import_invalid_date');
    return [
        String(date.getUTCDate()).padStart(2, '0'),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        date.getUTCFullYear()
    ].join('/');
}

function dayDistance(left, right) {
    const a = parseDate(left);
    const b = parseDate(right);
    if (!a || !b) return Number.POSITIVE_INFINITY;
    return Math.abs(a.getTime() - b.getTime()) / 86400000;
}

function parseMoney(value) {
    if (typeof value === 'number') return Math.round(value * 100);
    let text = String(value ?? '').trim().replace(/[^0-9,.-]/g, '');
    if (!text) return NaN;
    if (text.includes(',') && text.includes('.')) {
        text = text.lastIndexOf(',') > text.lastIndexOf('.')
            ? text.replace(/\./g, '').replace(',', '.')
            : text.replace(/,/g, '');
    } else if (text.includes(',')) {
        text = text.replace(',', '.');
    }
    const amount = Number(text);
    return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
}

function tokens(value) {
    return new Set(normalizeText(value).split(' ').filter(token => token.length > 1));
}

function tokenSimilarity(left, right) {
    const a = tokens(left);
    const b = tokens(right);
    if (!a.size || !b.size) return 0;
    const intersection = [...a].filter(token => b.has(token)).length;
    return intersection / new Set([...a, ...b]).size;
}

function sourceRef(transaction) {
    const stableId = [
        transaction.item_id,
        transaction.account_id,
        transaction.provider_id || transaction.id,
        transaction.date,
        transaction.amount_cents
    ].join('|');
    return crypto.createHash('sha256').update(stableId).digest('hex').slice(0, 24);
}

function preciseTimestamp(value) {
    const text = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(text)) return NaN;
    const timestamp = Date.parse(text);
    return Number.isFinite(timestamp) ? timestamp : NaN;
}

const CARD_PAYMENT_CREDIT_DESCRIPTIONS = new Set([
    'pagamento recebido',
    'pagamento com saldo'
]);

const CARD_BALANCE_CARRYOVER_DESCRIPTIONS = new Set([
    'saldo em atraso',
    'saldo em rotativo'
]);

const CARD_FINANCING_ADJUSTMENT_DESCRIPTIONS = new Set([
    'credito de atraso',
    'credito de rotativo',
    'encerramento de divida'
]);

function explicitCardStatementRole(transaction, binding) {
    if (binding?.kind !== 'card' ||
        transaction.account_type !== 'CREDIT' ||
        normalizeText(transaction.status).toUpperCase() !== 'POSTED') {
        return null;
    }
    const description = normalizeText(transaction.description);
    const amount = Number(transaction.amount_cents);
    if (amount < 0 && transaction.type === 'CREDIT' &&
        CARD_PAYMENT_CREDIT_DESCRIPTIONS.has(description)) {
        return {
            classification: 'card_bill_payment_counterpart',
            reason: 'explicit_card_payment_credit'
        };
    }
    if (amount > 0 && transaction.type === 'DEBIT' &&
        CARD_BALANCE_CARRYOVER_DESCRIPTIONS.has(description)) {
        return {
            classification: 'card_balance_carryover',
            reason: 'explicit_card_statement_balance'
        };
    }
    if (amount < 0 && transaction.type === 'CREDIT' &&
        CARD_FINANCING_ADJUSTMENT_DESCRIPTIONS.has(description)) {
        return {
            classification: 'card_financing_adjustment',
            reason: 'explicit_card_financing_adjustment'
        };
    }
    return null;
}

function providerIdentity(transaction) {
    return String(transaction.provider_id || transaction.id || '').trim();
}

function snapshotObservedAt(snapshot) {
    const values = Array.isArray(snapshot?.observed_at)
        ? snapshot.observed_at
        : [snapshot?.observed_at];
    return values.map(String).filter(Boolean).sort().at(-1) || '';
}

function rangeSheetName(rangeName) {
    return String(rangeName || '')
        .split('!')[0]
        .replace(/^'|'$/g, '');
}

function findRange(ranges, wantedName) {
    const wanted = normalizeText(wantedName);
    const match = Object.entries(ranges || {}).find(([key]) =>
        normalizeText(rangeSheetName(key)) === wanted);
    return match ? match[1] : [];
}

function rowsWithoutHeader(rows) {
    return Array.isArray(rows) && rows.length > 1 ? rows.slice(1) : [];
}

function sheetRecords(sheetSnapshot, binding, transaction = null) {
    const ranges = sheetSnapshot?.ranges || {};
    if (binding.kind === 'card') {
        if (binding.cardId) {
            return rowsWithoutHeader(findRange(ranges, 'Lançamentos Cartão'))
                .map(row => ({
                    date: row[0],
                    description: row[1],
                    category: row[2],
                    subcategory: '',
                    amount_cents: parseMoney(row[3]),
                    installment: row[4],
                    user_id: row[9],
                    account: row[6],
                    scope_known: Boolean(String(row[9] || '').trim() &&
                        String(row[6] || '').trim())
                }));
        }
        return rowsWithoutHeader(findRange(ranges, binding.sheetName)).map(row => ({
            date: row[0],
            description: row[1],
            category: row[2],
            subcategory: '',
            amount_cents: parseMoney(row[3]),
            installment: row[4],
            user_id: row[6],
            account: binding.sheetName,
            scope_known: Boolean(String(row[6] || '').trim())
        }));
    }
    if (Number(transaction?.amount_cents) > 0) {
        return rowsWithoutHeader(findRange(ranges, 'Entradas')).map(row => ({
            date: row[0],
            description: row[1],
            category: row[2],
            subcategory: '',
            amount_cents: parseMoney(row[3]),
            user_id: row[8],
            account: row[9],
            scope_known: Boolean(String(row[8] || '').trim() &&
                String(row[9] || '').trim())
        }));
    }
    return rowsWithoutHeader(findRange(ranges, 'Saídas')).map(row => ({
        date: row[0],
        description: row[1],
        category: row[2],
        subcategory: row[3],
        amount_cents: parseMoney(row[4]),
        user_id: row[9],
        account: row[10],
        scope_known: Boolean(String(row[9] || '').trim() &&
            String(row[10] || '').trim())
    }));
}

function scopeRelation(record, binding) {
    if (!record.scope_known) return 'unknown';
    if (String(record.user_id || '').trim() !== String(binding.ownerUserId || '').trim()) {
        return 'different';
    }
    if (binding.kind === 'card') {
        if (!binding.cardId) return 'same';
        return normalizeText(record.account) === normalizeText(binding.cardId)
            ? 'same'
            : 'different';
    }
    return normalizeText(record.account) === normalizeText(binding.financialAccount)
        ? 'same'
        : 'different';
}

function duplicateState(transaction, records, binding) {
    const description = normalizeText(transaction.description);
    const amount = Math.abs(Number(transaction.amount_cents));
    let probable = false;
    for (const record of records) {
        if (!Number.isFinite(record.amount_cents) ||
            Math.abs(record.amount_cents) !== amount ||
            dayDistance(transaction.date, record.date) > 2) {
            continue;
        }
        const scope = scopeRelation(record, binding);
        if (scope === 'different') continue;
        const candidate = normalizeText(record.description);
        if (description && description === candidate &&
            isoDate(transaction.date) === isoDate(record.date) && scope === 'same') {
            return 'existing';
        }
        if (isoDate(transaction.date) === isoDate(record.date) ||
            tokenSimilarity(transaction.description, record.description) >= 0.7) {
            probable = true;
        }
    }
    return probable ? 'possible_duplicate' : null;
}

function categoryPatterns(sheetSnapshot) {
    const candidates = [];
    for (const [range, rows] of Object.entries(sheetSnapshot?.ranges || {})) {
        const name = normalizeText(rangeSheetName(range));
        if (name === normalizeText('Saídas')) {
            for (const row of rowsWithoutHeader(rows)) {
                candidates.push({
                    description: row[1],
                    category: row[2],
                    subcategory: row[3] || ''
                });
            }
        } else if (name.startsWith(normalizeText('Cartão ')) ||
            name === normalizeText('Lançamentos Cartão')) {
            for (const row of rowsWithoutHeader(rows)) {
                candidates.push({
                    description: row[1],
                    category: row[2],
                    subcategory: ''
                });
            }
        }
    }
    const grouped = new Map();
    for (const candidate of candidates) {
        const key = normalizeText(candidate.description);
        if (!key || !String(candidate.category || '').trim()) continue;
        const label = `${normalizeText(candidate.category)}|${normalizeText(candidate.subcategory)}`;
        if (!grouped.has(key)) grouped.set(key, new Map());
        grouped.get(key).set(label, candidate);
    }
    const patterns = new Map();
    for (const [key, values] of grouped) {
        if (values.size === 1) patterns.set(key, [...values.values()][0]);
    }
    return patterns;
}

function selectRule(transaction, merchantRules) {
    const description = normalizeText(transaction.description);
    const matches = (merchantRules || []).filter(rule => {
        const expected = normalizeText(rule?.match?.value);
        if (!expected) return false;
        if (rule.match.mode === 'exact') return description === expected;
        if (rule.match.mode === 'contains') return description.includes(expected);
        return false;
    });
    const decisions = new Set(matches.map(rule => [
        normalizeText(rule.classification),
        normalizeText(rule.category),
        normalizeText(rule.subcategory)
    ].join('|')));
    return {
        rule: matches.length && decisions.size === 1 ? matches[0] : null,
        conflict: decisions.size > 1
    };
}

function explicitExistingRowProven(transaction, records, binding, expectedDescription) {
    const expected = normalizeText(expectedDescription);
    if (!expected) return false;
    const matches = records.filter(record => {
        const sameUser = String(record.user_id || '').trim() &&
            String(record.user_id || '').trim() ===
                String(binding.ownerUserId || '').trim();
        const account = String(record.account || '').trim();
        const accountCompatible = !account || scopeRelation(record, binding) === 'same';
        return normalizeText(record.description) === expected &&
            Math.abs(Number(record.amount_cents)) ===
                Math.abs(Number(transaction.amount_cents)) &&
            dayDistance(transaction.date, record.date) <= 2 &&
            sameUser && accountCompatible;
    });
    return matches.length === 1;
}

function billingMonth(transaction, binding) {
    const forecast = /^(\d{4})-(\d{2})/.exec(
        String(transaction.bill_forecast_month || '').trim()
    );
    if (forecast) {
        return `${MONTH_NAMES[Number(forecast[2]) - 1]} de ${forecast[1]}`;
    }
    const date = parseDate(transaction.date);
    if (!date) throw new Error('open_finance_historical_import_invalid_date');
    let month = date.getUTCMonth();
    let year = date.getUTCFullYear();
    if (Number(binding.closingDay) > 0 && date.getUTCDate() >= Number(binding.closingDay)) {
        month += 1;
        if (month > 11) {
            month = 0;
            year += 1;
        }
    }
    return `${MONTH_NAMES[month]} de ${year}`;
}

function expenseWritePlan(transaction, binding, category, classification = 'expense',
    recurring = false, reviewedAmountCents = null) {
    const amountCents = reviewedAmountCents === null
        ? Math.abs(Number(transaction.amount_cents))
        : Number(reviewedAmountCents);
    const amount = amountCents / 100;
    if (binding.kind === 'card') {
        const number = Number(transaction.installment_number) || 1;
        const total = Number(transaction.total_installments) || 1;
        if (binding.cardId) {
            return {
                operation: 'expense.create',
                sheet_name: 'Lançamentos Cartão',
                row: [
                    sheetDate(transaction.date),
                    transaction.description,
                    category.category,
                    amount,
                    `${number}/${total}`,
                    billingMonth(transaction, binding),
                    binding.cardId,
                    binding.cardName,
                    'Importação histórica Open Finance revisada.',
                    binding.ownerUserId
                ],
                account_context: {
                    kind: 'card',
                    card_id: binding.cardId,
                    card_name: binding.cardName,
                    owner_user_id: binding.ownerUserId
                },
                classification,
                financial_writes: 0
            };
        }
        return {
            operation: 'expense.create',
            sheet_name: binding.sheetName,
            row: [
                sheetDate(transaction.date),
                transaction.description,
                category.category,
                amount,
                `${number}/${total}`,
                billingMonth(transaction, binding),
                binding.ownerUserId
            ],
            classification,
            financial_writes: 0
        };
    }
    return {
        operation: 'expense.create',
        sheet_name: 'Saídas',
        row: [
            sheetDate(transaction.date),
            transaction.description,
            category.category,
            category.subcategory || '',
            amount,
            binding.ownerLabel,
            binding.paymentMethod || 'Débito',
            recurring ? 'Sim' : 'Não',
            'Importação histórica Open Finance revisada.',
            binding.ownerUserId,
            binding.financialAccount
        ],
        account_context: {
            kind: 'bank',
            financial_account: binding.financialAccount,
            owner_user_id: binding.ownerUserId
        },
        classification,
        financial_writes: 0
    };
}

function transferWritePlan(transaction, origin, destination, classification) {
    return {
        operation: 'transfer.create',
        sheet_name: 'Transferências',
        row: [
            sheetDate(transaction.date),
            transaction.description,
            Math.abs(Number(transaction.amount_cents)) / 100,
            origin.financialAccount,
            destination.financialAccount,
            'Transferência',
            'Importação histórica Open Finance revisada.',
            'Conferida',
            origin.ownerUserId
        ],
        classification,
        financial_writes: 0
    };
}

function transferWritePlanExists(sheetSnapshot, writePlan) {
    const expected = writePlan?.row;
    if (!Array.isArray(expected) || expected.length !== 9) return false;
    return rowsWithoutHeader(findRange(sheetSnapshot?.ranges || {}, 'Transferências'))
        .some(row => (
            isoDate(row[0]) === isoDate(expected[0]) &&
            normalizeText(row[1]) === normalizeText(expected[1]) &&
            parseMoney(row[2]) === parseMoney(expected[2]) &&
            normalizeText(row[3]) === normalizeText(expected[3]) &&
            normalizeText(row[4]) === normalizeText(expected[4]) &&
            normalizeText(row[5]) === normalizeText(expected[5]) &&
            normalizeText(row[6]) === normalizeText(expected[6]) &&
            normalizeText(row[7]) === normalizeText(expected[7]) &&
            String(row[8] || '').trim() === String(expected[8] || '').trim()
        ));
}

function reviewedTransferEntry(transaction, writePlan, sheetSnapshot, reason) {
    if (transferWritePlanExists(sheetSnapshot, writePlan)) {
        return entry(transaction, 'existing', 'already_recorded',
            'exact_scoped_transfer_match');
    }
    return entry(transaction, 'ready', writePlan.classification, reason, writePlan);
}

function reserveWritePlan(transaction, binding, direction) {
    const application = direction === 'reserve_application';
    const reserve = {
        financialAccount: binding.reserveAccount,
        ownerUserId: binding.ownerUserId
    };
    const bank = {
        financialAccount: binding.financialAccount,
        ownerUserId: binding.ownerUserId
    };
    return transferWritePlan(
        transaction,
        application ? bank : reserve,
        application ? reserve : bank,
        'reserve_transfer'
    );
}

function entry(transaction, state, classification, reason, writePlan = null,
    reviewContext = null) {
    if (!TERMINAL_STATES.has(state)) {
        throw new Error('open_finance_historical_import_non_terminal_state');
    }
    return {
        source_ref: sourceRef(transaction),
        state,
        classification,
        reason,
        ...(writePlan ? { write_plan: writePlan } : {}),
        ...(reviewContext ? { review_context: reviewContext } : {}),
        financial_writes: 0
    };
}

function flattenSnapshot(pluggySnapshot) {
    const accountTypes = new Map();
    const transactions = [];
    for (const item of pluggySnapshot?.items || []) {
        const billForecastMonths = new Map(
            (item.bills || []).map(bill => [
                `${String(bill.account_id || '')}|${String(bill.id || '')}`,
                /^\d{4}-\d{2}/.exec(String(bill.due_date || ''))?.[0] || ''
            ]).filter(([identity, month]) => !identity.startsWith('|') && month)
        );
        for (const account of item.accounts || []) {
            accountTypes.set(String(account.id), normalizeText(account.type).toUpperCase());
        }
        for (const transaction of item.transactions || []) {
            transactions.push({
                ...transaction,
                item_id: transaction.item_id || item.id,
                account_type: accountTypes.get(String(transaction.account_id)) || '',
                bill_forecast_month: transaction.bill_forecast_month ||
                    billForecastMonths.get(
                        `${String(transaction.account_id || '')}|${String(transaction.bill_id || '')}`
                    ) || null
            });
        }
    }
    return transactions;
}

function strongTransferPairs(transactions, accountBindings,
    historyStartDate, historyEndDate, decisionOverrides = {}) {
    const paired = new Map();
    const causalCandidatesByRef = new Map();
    const transactionsByRef = new Map(transactions.map(transaction => [
        sourceRef(transaction), transaction
    ]));
    const providerCounts = transactions.reduce((counts, transaction) => {
        const identity = providerIdentity(transaction);
        if (identity) counts.set(identity, (counts.get(identity) || 0) + 1);
        return counts;
    }, new Map());
    const isInsideWindow = transaction => {
        const date = isoDate(transaction.date);
        return date >= historyStartDate && date <= historyEndDate;
    };
    const isStableReviewedPairSide = transaction => {
        const binding = accountBindings[transaction?.account_id];
        const identity = providerIdentity(transaction || {});
        return binding?.kind === 'bank' && transaction.account_type === 'BANK' &&
            normalizeText(transaction.status).toUpperCase() === 'POSTED' &&
            String(transaction.currency || '').trim().toUpperCase() === 'BRL' &&
            Number.isFinite(Number(transaction.amount_cents)) &&
            Number(transaction.amount_cents) !== 0 && identity &&
            providerCounts.get(identity) === 1 && isInsideWindow(transaction);
    };
    for (const transaction of transactions) {
        const ref = sourceRef(transaction);
        if (paired.has(ref)) continue;
        const decision = decisionOverrides[ref] ||
            decisionOverrides[transaction.id] || {};
        if (decision.classification !== 'internal_transfer_pair') continue;
        const counterpartRef = String(decision.counterpartSourceRef || '').trim();
        const counterpart = transactionsByRef.get(counterpartRef);
        const reciprocal = counterpart && (decisionOverrides[counterpartRef] ||
            decisionOverrides[counterpart.id] || {});
        if (reciprocal?.classification !== 'internal_transfer_pair' ||
            reciprocal.counterpartSourceRef !== ref ||
            !isStableReviewedPairSide(transaction) ||
            !isStableReviewedPairSide(counterpart) ||
            transaction.account_id === counterpart.account_id ||
            Number(transaction.amount_cents) !== -Number(counterpart.amount_cents) ||
            dayDistance(transaction.date, counterpart.date) > 1) {
            continue;
        }
        const origin = Number(transaction.amount_cents) < 0
            ? transaction : counterpart;
        const credit = origin === transaction ? counterpart : transaction;
        paired.set(sourceRef(origin), { role: 'origin', pair: credit });
        paired.set(sourceRef(credit), { role: 'counterpart', pair: origin });
    }
    const identityTokens = binding => {
        const accountIdentity = normalizeText(binding?.financialAccount)
            .split(' ').filter(token => token.length >= 4 &&
                !['conta', 'corrente', 'nubank', 'itau', 'banco'].includes(token));
        const ownerTokens = normalizeText(binding?.ownerLabel).split(' ')
            .filter(token => token.length >= 4);
        return accountIdentity.length ? accountIdentity : ownerTokens;
    };
    const identifiesBinding = (description, binding) => {
        const normalizedDescription = normalizeText(description);
        return identityTokens(binding).some(token =>
            normalizedDescription.split(' ').includes(token));
    };
    const causalCandidates = left => {
        const ref = sourceRef(left);
        if (causalCandidatesByRef.has(ref)) return causalCandidatesByRef.get(ref);
        const candidates = transactions.filter(right => {
            const leftBinding = accountBindings[left.account_id];
            const rightBinding = accountBindings[right.account_id];
            const leftDate = isoDate(left.date);
            const rightDate = isoDate(right.date);
            return Number(right.amount_cents) === -Number(left.amount_cents) &&
                right.account_id !== left.account_id &&
                leftDate >= historyStartDate && leftDate <= historyEndDate &&
                rightDate >= historyStartDate && rightDate <= historyEndDate &&
                !String(left.reference_number || '').trim() &&
                !String(right.reference_number || '').trim() &&
                dayDistance(left.date, right.date) <= 1 &&
                leftBinding?.kind === 'bank' && rightBinding?.kind === 'bank' &&
                identifiesBinding(left.description, rightBinding) &&
                identifiesBinding(right.description, leftBinding);
        });
        causalCandidatesByRef.set(ref, candidates);
        return candidates;
    };
    for (let i = 0; i < transactions.length; i += 1) {
        const left = transactions[i];
        if (paired.has(sourceRef(left))) continue;
        if (Number(left.amount_cents) >= 0 || !accountBindings[left.account_id] ||
            accountBindings[left.account_id].kind !== 'bank') continue;
        const reference = String(left.reference_number || '').trim();
        const candidates = reference
            ? transactions.filter((right, index) =>
                index !== i && Number(right.amount_cents) === -Number(left.amount_cents) &&
                right.account_id !== left.account_id &&
                String(right.reference_number || '').trim() === reference &&
                dayDistance(left.date, right.date) <= 1 &&
                accountBindings[right.account_id]?.kind === 'bank')
            : causalCandidates(left).filter(right =>
                causalCandidates(right).length === 1);
        if (candidates.length === 1) {
            if (paired.has(sourceRef(candidates[0]))) continue;
            paired.set(sourceRef(left), {
                role: 'origin',
                pair: candidates[0]
            });
            paired.set(sourceRef(candidates[0]), {
                role: 'counterpart',
                pair: left
            });
        }
    }
    return paired;
}

function strongUnwrittenRefundPairs(transactions, accountBindings, sheetSnapshot,
    historyStartDate, historyEndDate, decisionOverrides = {}) {
    const paired = new Map();
    const providerCounts = transactions.reduce((counts, transaction) => {
        const identity = providerIdentity(transaction);
        if (identity) counts.set(identity, (counts.get(identity) || 0) + 1);
        return counts;
    }, new Map());
    const isInsideWindow = transaction => {
        const date = isoDate(transaction.date);
        return date >= historyStartDate && date <= historyEndDate;
    };
    const isStableTransaction = transaction => {
        const binding = accountBindings[transaction.account_id];
        const identity = providerIdentity(transaction);
        const expectedType = binding?.kind === 'card' ? 'CREDIT' :
            binding?.kind === 'bank' ? 'BANK' : '';
        return expectedType && transaction.account_type === expectedType &&
            Number.isFinite(Number(transaction.amount_cents)) &&
            Number(transaction.amount_cents) !== 0 &&
            String(transaction.currency || '').trim().toUpperCase() === 'BRL' &&
            identity && providerCounts.get(identity) === 1 && isInsideWindow(transaction) &&
            !duplicateState(transaction,
                sheetRecords(sheetSnapshot, binding, transaction), binding);
    };
    const isExplicitRefund = transaction => {
        const words = new Set(normalizeText([
            transaction.description,
            transaction.operation_type
        ].join(' ')).split(' '));
        return ['estorno', 'reembolso', 'devolucao'].some(word => words.has(word));
    };
    const transactionsByRef = new Map(transactions.map(transaction => [
        sourceRef(transaction), transaction
    ]));
    for (const transaction of transactions) {
        const ref = sourceRef(transaction);
        if (paired.has(ref)) continue;
        const decision = decisionOverrides[ref] ||
            decisionOverrides[transaction.id] || {};
        if (decision.classification !== 'card_refund_pair') continue;
        const counterpartRef = String(decision.counterpartSourceRef || '').trim();
        const counterpart = transactionsByRef.get(counterpartRef);
        const reciprocal = counterpart && (decisionOverrides[counterpartRef] ||
            decisionOverrides[counterpart.id] || {});
        const debit = Number(transaction.amount_cents) > 0
            ? transaction : counterpart;
        const refund = debit === transaction ? counterpart : transaction;
        if (reciprocal?.classification !== 'card_refund_pair' ||
            reciprocal.counterpartSourceRef !== ref || !debit || !refund ||
            accountBindings[debit.account_id]?.kind !== 'card' ||
            debit.account_id !== refund.account_id ||
            debit.account_type !== 'CREDIT' || refund.account_type !== 'CREDIT' ||
            debit.type !== 'DEBIT' || refund.type !== 'CREDIT' ||
            normalizeText(debit.status).toUpperCase() !== 'POSTED' ||
            normalizeText(refund.status).toUpperCase() !== 'POSTED' ||
            Number(debit.amount_cents) !== -Number(refund.amount_cents) ||
            parseDate(debit.date) > parseDate(refund.date) ||
            dayDistance(debit.date, refund.date) > 30 ||
            !isStableTransaction(debit) || !isStableTransaction(refund)) {
            continue;
        }
        paired.set(sourceRef(debit), { role: 'debit', pair: refund });
        paired.set(sourceRef(refund), { role: 'refund', pair: debit });
    }
    const candidatesByRef = new Map();
    const candidates = refund => {
        const ref = sourceRef(refund);
        if (candidatesByRef.has(ref)) return candidatesByRef.get(ref);
        const refundDate = parseDate(refund.date);
        const binding = accountBindings[refund.account_id];
        const refundAmount = Number(refund.amount_cents);
        const expectedPurchaseAmount = -refundAmount;
        const matches = transactions.filter(debit => {
            const debitDate = parseDate(debit.date);
            const debitAmount = Number(debit.amount_cents);
            const directionMatches = binding?.kind === 'bank'
                ? refundAmount > 0 && debitAmount < 0
                : binding?.kind === 'card'
                    ? refundAmount < 0 && refund.type === 'CREDIT' &&
                        debitAmount > 0 && debit.type === 'DEBIT' &&
                        normalizeText(refund.status).toUpperCase() === 'POSTED' &&
                        normalizeText(debit.status).toUpperCase() === 'POSTED'
                    : false;
            return directionMatches &&
                debit.account_id === refund.account_id && debit !== refund &&
                debitAmount === expectedPurchaseAmount &&
                isStableTransaction(refund) && isStableTransaction(debit) &&
                debitDate && refundDate && debitDate <= refundDate &&
                dayDistance(debit.date, refund.date) <= 30;
        });
        candidatesByRef.set(ref, matches);
        return matches;
    };
    const refundsByDebit = new Map();
    const eligibleRefunds = transactions.filter(transaction => {
        const binding = accountBindings[transaction.account_id];
        const amount = Number(transaction.amount_cents);
        return isExplicitRefund(transaction) &&
            (binding?.kind === 'bank' && amount > 0 ||
                binding?.kind === 'card' && amount < 0 &&
                transaction.type === 'CREDIT');
    });
    for (const refund of eligibleRefunds) {
        for (const debit of candidates(refund)) {
            const debitRef = sourceRef(debit);
            if (!refundsByDebit.has(debitRef)) refundsByDebit.set(debitRef, []);
            refundsByDebit.get(debitRef).push(refund);
        }
    }
    for (const refund of eligibleRefunds) {
        const matches = candidates(refund);
        if (matches.length !== 1) continue;
        const debit = matches[0];
        if (refundsByDebit.get(sourceRef(debit))?.length !== 1) continue;
        paired.set(sourceRef(debit), { role: 'debit', pair: refund });
        paired.set(sourceRef(refund), { role: 'refund', pair: debit });
    }
    return paired;
}

function strongCardBillPaymentPairs(transactions, accountBindings, merchantRules,
    decisionOverrides, sheetSnapshot, historyStartDate, historyEndDate) {
    const paired = new Map();
    const providerCounts = transactions.reduce((counts, transaction) => {
        const identity = providerIdentity(transaction);
        if (identity) counts.set(identity, (counts.get(identity) || 0) + 1);
        return counts;
    }, new Map());
    const isInsideWindow = transaction => {
        const date = isoDate(transaction.date);
        return date >= historyStartDate && date <= historyEndDate;
    };
    const isStable = (transaction, kind, accountType) => {
        const binding = accountBindings[transaction.account_id];
        const identity = providerIdentity(transaction);
        return binding?.kind === kind && transaction.account_type === accountType &&
            Number.isFinite(Number(transaction.amount_cents)) &&
            Number(transaction.amount_cents) !== 0 &&
            String(transaction.currency || '').trim().toUpperCase() === 'BRL' &&
            identity && providerCounts.get(identity) === 1 && isInsideWindow(transaction) &&
            !duplicateState(transaction,
                sheetRecords(sheetSnapshot, binding, transaction), binding);
    };
    const isConfirmedBankPayment = transaction => {
        if (!isStable(transaction, 'bank', 'BANK') ||
            Number(transaction.amount_cents) >= 0) return false;
        const selection = selectRule(transaction, merchantRules);
        const override = decisionOverrides[sourceRef(transaction)] ||
            decisionOverrides[transaction.id] || {};
        return !selection.conflict &&
            (override.classification || selection.rule?.classification) ===
                'card_payment';
    };
    const isCardPaymentCredit = transaction => {
        const description = normalizeText(transaction.description);
        return isStable(transaction, 'card', 'CREDIT') &&
            Number(transaction.amount_cents) < 0 && transaction.type === 'CREDIT' &&
            normalizeText(transaction.status).toUpperCase() === 'POSTED' &&
            ['pagamento recebido', 'pagamento com saldo'].includes(description);
    };
    const bankPayments = transactions.filter(isConfirmedBankPayment);
    const cardCredits = transactions.filter(isCardPaymentCredit);
    const candidatesByCredit = new Map(cardCredits.map(credit => [
        sourceRef(credit),
        bankPayments.filter(debit =>
            Math.abs(Number(debit.amount_cents)) ===
                Math.abs(Number(credit.amount_cents)) &&
            dayDistance(debit.date, credit.date) <= 3)
    ]));
    const creditsByDebit = new Map();
    for (const credit of cardCredits) {
        for (const debit of candidatesByCredit.get(sourceRef(credit)) || []) {
            const debitRef = sourceRef(debit);
            if (!creditsByDebit.has(debitRef)) creditsByDebit.set(debitRef, []);
            creditsByDebit.get(debitRef).push(credit);
        }
    }
    for (const credit of cardCredits) {
        const candidates = candidatesByCredit.get(sourceRef(credit)) || [];
        if (candidates.length !== 1) continue;
        const debit = candidates[0];
        if (creditsByDebit.get(sourceRef(debit))?.length !== 1) continue;
        paired.set(sourceRef(debit), { role: 'bank_payment', pair: credit });
        paired.set(sourceRef(credit), { role: 'card_credit', pair: debit });
    }
    return paired;
}

function strongCardPaymentReversals(transactions, accountBindings,
    decisionOverrides, sheetSnapshot, historyStartDate, historyEndDate,
    cardPaymentPairs) {
    const roles = new Map();
    const providerCounts = transactions.reduce((counts, transaction) => {
        const identity = providerIdentity(transaction);
        if (identity) counts.set(identity, (counts.get(identity) || 0) + 1);
        return counts;
    }, new Map());
    const isInsideWindow = transaction => {
        const date = isoDate(transaction.date);
        return date >= historyStartDate && date <= historyEndDate;
    };
    const isReviewedReversal = transaction => {
        const binding = accountBindings[transaction.account_id];
        const identity = providerIdentity(transaction);
        const decision = decisionOverrides[sourceRef(transaction)] ||
            decisionOverrides[transaction.id] || {};
        return decision.classification === 'card_payment_reversal' &&
            binding?.kind === 'bank' && transaction.account_type === 'BANK' &&
            transaction.type === 'CREDIT' && Number(transaction.amount_cents) > 0 &&
            normalizeText(transaction.status).toUpperCase() === 'POSTED' &&
            String(transaction.currency || '').trim().toUpperCase() === 'BRL' &&
            identity && providerCounts.get(identity) === 1 && isInsideWindow(transaction) &&
            Number.isFinite(preciseTimestamp(transaction.date)) &&
            !duplicateState(transaction,
                sheetRecords(sheetSnapshot, binding, transaction), binding);
    };
    const payments = transactions.filter(transaction =>
        cardPaymentPairs.get(sourceRef(transaction))?.role === 'bank_payment');
    const reversals = transactions.filter(isReviewedReversal);
    const candidatesByReversal = new Map(reversals.map(reversal => [
        sourceRef(reversal),
        payments.filter(payment => {
            const paymentRole = cardPaymentPairs.get(sourceRef(payment));
            const cardCredit = paymentRole?.pair;
            const reversalBinding = accountBindings[reversal.account_id];
            const cardBinding = accountBindings[cardCredit?.account_id];
            const reversalOwner = String(reversalBinding?.ownerUserId || '').trim();
            const cardOwner = String(cardBinding?.ownerUserId || '').trim();
            const reversalItem = String(reversal.item_id || '').trim();
            const cardItem = String(cardCredit?.item_id || '').trim();
            const paymentTime = preciseTimestamp(payment.date);
            const reversalTime = preciseTimestamp(reversal.date);
            return cardCredit && reversalOwner && cardOwner &&
                reversalOwner === cardOwner && reversalItem && cardItem &&
                reversalItem === cardItem &&
                Number(reversal.amount_cents) ===
                    Math.abs(Number(payment.amount_cents)) &&
                Number.isFinite(paymentTime) && paymentTime <= reversalTime &&
                reversalTime - paymentTime <= 3 * 86400000;
        })
    ]));
    const reversalsByPayment = new Map();
    for (const reversal of reversals) {
        for (const payment of candidatesByReversal.get(sourceRef(reversal)) || []) {
            const paymentRef = sourceRef(payment);
            if (!reversalsByPayment.has(paymentRef)) {
                reversalsByPayment.set(paymentRef, []);
            }
            reversalsByPayment.get(paymentRef).push(reversal);
        }
    }
    for (const reversal of reversals) {
        const candidates = candidatesByReversal.get(sourceRef(reversal)) || [];
        if (candidates.length !== 1) continue;
        const payment = candidates[0];
        if (reversalsByPayment.get(sourceRef(payment))?.length !== 1) continue;
        const cardCredit = cardPaymentPairs.get(sourceRef(payment)).pair;
        roles.set(sourceRef(reversal), {
            role: 'reversal', payment, cardCredit
        });
    }
    return roles;
}

function strongCardFundedPixTriples(transactions, accountBindings, sheetSnapshot,
    historyStartDate, historyEndDate) {
    const roles = new Map();
    const providerCounts = transactions.reduce((counts, transaction) => {
        const identity = providerIdentity(transaction);
        if (identity) counts.set(identity, (counts.get(identity) || 0) + 1);
        return counts;
    }, new Map());
    const isInsideWindow = transaction => {
        const date = isoDate(transaction.date);
        return date >= historyStartDate && date <= historyEndDate;
    };
    const isStable = (transaction, kind, accountType) => {
        const binding = accountBindings[transaction.account_id];
        const identity = providerIdentity(transaction);
        return binding?.kind === kind && transaction.account_type === accountType &&
            normalizeText(transaction.status).toUpperCase() === 'POSTED' &&
            Number.isFinite(Number(transaction.amount_cents)) &&
            Number(transaction.amount_cents) !== 0 &&
            String(transaction.currency || '').trim().toUpperCase() === 'BRL' &&
            identity && providerCounts.get(identity) === 1 &&
            isInsideWindow(transaction) &&
            Number.isFinite(preciseTimestamp(transaction.date)) &&
            !duplicateState(transaction,
                sheetRecords(sheetSnapshot, binding, transaction), binding);
    };
    const recipient = transaction => {
        const parts = String(transaction.description || '').split('|');
        if (parts.length < 2 || normalizeText(parts.shift()) !==
            'transferencia enviada') return '';
        return normalizeText(parts.join('|'));
    };
    const exactCreditDescription =
        'valor adicionado na conta por cartao de credito valor adicionado para pix no credito';
    const credits = transactions.filter(transaction =>
        isStable(transaction, 'bank', 'BANK') &&
        Number(transaction.amount_cents) > 0 && transaction.type === 'CREDIT' &&
        normalizeText(transaction.description) === exactCreditDescription &&
        normalizeText(transaction.operation_type).toUpperCase() ===
            'TRANSFERENCIA MESMA INSTITUICAO');
    const triples = [];
    for (const credit of credits) {
        const creditTime = preciseTimestamp(credit.date);
        const principal = Number(credit.amount_cents);
        const bankBinding = accountBindings[credit.account_id];
        const bankOwnerUserId = String(bankBinding?.ownerUserId || '').trim();
        if (!bankOwnerUserId) continue;
        const debits = transactions.filter(debit => {
            const debitTime = preciseTimestamp(debit.date);
            return isStable(debit, 'bank', 'BANK') &&
                debit.item_id === credit.item_id &&
                debit.account_id === credit.account_id &&
                debit.type === 'DEBIT' && Number(debit.amount_cents) === -principal &&
                recipient(debit) && debitTime <= creditTime &&
                creditTime - debitTime <= 5000;
        });
        for (const debit of debits) {
            const expectedRecipient = recipient(debit);
            const cards = transactions.filter(card => {
                const cardTime = preciseTimestamp(card.date);
                const cardBinding = accountBindings[card.account_id];
                const cardOwnerUserId = String(cardBinding?.ownerUserId || '').trim();
                const description = normalizeText(card.description);
                return isStable(card, 'card', 'CREDIT') &&
                    card.item_id === credit.item_id &&
                    card.account_id !== credit.account_id &&
                    cardOwnerUserId && cardOwnerUserId === bankOwnerUserId &&
                    card.type === 'DEBIT' && Number(card.amount_cents) > principal &&
                    (description === 'pagamento de pix' ||
                        description === expectedRecipient) &&
                    cardTime >= creditTime && cardTime - creditTime <= 5000;
            });
            for (const card of cards) triples.push({ credit, debit, card });
        }
    }
    const componentCounts = new Map();
    for (const triple of triples) {
        for (const transaction of [triple.credit, triple.debit, triple.card]) {
            const ref = sourceRef(transaction);
            componentCounts.set(ref, (componentCounts.get(ref) || 0) + 1);
        }
    }
    for (const triple of triples) {
        if ([triple.credit, triple.debit, triple.card].some(transaction =>
            componentCounts.get(sourceRef(transaction)) !== 1)) continue;
        const principalAmount = Number(triple.credit.amount_cents);
        const feeAmount = Number(triple.card.amount_cents) - principalAmount;
        const context = {
            principal_amount_cents: principalAmount,
            fee_amount_cents: feeAmount,
            bank_debit_ref: sourceRef(triple.debit),
            bank_credit_ref: sourceRef(triple.credit)
        };
        roles.set(sourceRef(triple.credit), {
            role: 'bank_credit',
            context
        });
        roles.set(sourceRef(triple.card), {
            role: 'card_debit',
            context
        });
    }
    return roles;
}

function resolveCategory(transaction, rule, patterns) {
    if (String(rule?.category || '').trim()) {
        return {
            category: String(rule.category).trim(),
            subcategory: String(rule.subcategory || '').trim()
        };
    }
    const pattern = patterns.get(normalizeText(transaction.description));
    return pattern ? {
        category: String(pattern.category).trim(),
        subcategory: String(pattern.subcategory || '').trim()
    } : null;
}

function classifyTransaction({
    transaction,
    binding,
    rule,
    override,
    patterns,
    duplicates,
    transferRole,
    refundRole,
    cardPaymentRole,
    cardPaymentReversalRole,
    cardFundedPixRole,
    accountBindings,
    pairedCounterparts,
    historyStartDate,
    historyEndDate,
    sourceObservedAt,
    includeOpenInvoiceCurrentPurchases
}) {
    const date = isoDate(transaction.date);
    const originalDate = isoDate(transaction.original_date);
    const projectedInstallment = date > historyEndDate &&
        originalDate >= historyStartDate && originalDate <= historyEndDate &&
        Number(transaction.total_installments) > 1 &&
        Number(transaction.installment_number) > 1;
    if (!date || date < historyStartDate ||
        (date > historyEndDate && !projectedInstallment)) {
        return entry(transaction, 'outside_window', 'outside_history_window',
            'outside_history_window');
    }
    if (!binding) {
        return entry(transaction, 'needs_review', 'unbound_source',
            'account_binding_required');
    }
    const expectedType = binding.kind === 'card' ? 'CREDIT' :
        binding.kind === 'bank' ? 'BANK' : '';
    if (!expectedType || transaction.account_type !== expectedType) {
        return entry(transaction, 'needs_review', 'source_binding_mismatch',
            'account_binding_type_mismatch');
    }
    if (!Number.isFinite(Number(transaction.amount_cents)) ||
        Number(transaction.amount_cents) === 0) {
        return entry(transaction, 'needs_review', 'invalid_amount',
            'non_positive_absolute_amount');
    }
    const sourceKey = providerIdentity(transaction);
    if (!sourceKey) {
        return entry(transaction, 'needs_review', 'unstable_source_identity',
            'provider_identity_required');
    }
    if (duplicates.has(sourceKey)) {
        return entry(transaction, 'excluded', 'duplicate_provider_source',
            'provider_identity_repeated');
    }
    duplicates.add(sourceKey);

    const transactionCurrency = String(transaction.currency || '').trim().toUpperCase();
    if (transactionCurrency !== 'BRL') {
        const pendingForeignCard = binding.kind === 'card' &&
            normalizeText(transaction.status).toUpperCase() === 'PENDING' &&
            !(Number(transaction.total_installments) > 1 &&
                Number(transaction.installment_number) > 1);
        if (pendingForeignCard) {
            return entry(transaction, 'excluded', 'pending_card_purchase',
                'provider_pending_not_historical_fact');
        }
        const reviewedBrlAmount = Number(override.brlAmountCents);
        const explicitForeignExpense =
            override.classification === 'foreign_card_expense' &&
            binding.kind === 'card' && transaction.account_type === 'CREDIT' &&
            transaction.type === 'DEBIT' &&
            normalizeText(transaction.status).toUpperCase() === 'POSTED' &&
            Number(transaction.amount_cents) > 0 &&
            Number.isSafeInteger(reviewedBrlAmount) && reviewedBrlAmount > 0 &&
            String(transaction.bill_forecast_month || '').trim() &&
            String(override.category || '').trim();
        if (!explicitForeignExpense) {
            return entry(transaction, 'needs_review', 'unsupported_currency',
                'unsupported_currency');
        }
        const category = {
            category: override.category,
            subcategory: override.subcategory || ''
        };
        return entry(transaction, 'ready', 'foreign_card_expense',
            'explicit_reviewed_brl_conversion',
            expenseWritePlan(transaction, binding, category,
                'foreign_card_expense', false, reviewedBrlAmount), {
                original_amount_cents: Number(transaction.amount_cents),
                original_currency: transactionCurrency,
                reviewed_brl_amount_cents: reviewedBrlAmount
            });
    }

    if (transferRole?.role === 'counterpart' ||
        pairedCounterparts.has(sourceRef(transaction))) {
        return entry(transaction, 'excluded', 'paired_transfer_counterpart',
            'represented_by_consolidated_transfer');
    }
    if (transferRole?.role === 'origin' && Number(transaction.amount_cents) < 0) {
        pairedCounterparts.add(sourceRef(transferRole.pair));
        const writePlan = transferWritePlan(transaction, binding,
            accountBindings[transferRole.pair.account_id], 'transfer');
        return reviewedTransferEntry(transaction, writePlan,
            override.sheetSnapshot, 'strong_two_sided_pair');
    }

    if (refundRole?.role === 'debit') {
        return entry(transaction, 'excluded', 'paired_refund_purchase',
            'pre_save_refund_pair_neutralized');
    }
    if (refundRole?.role === 'refund') {
        return entry(transaction, 'excluded', 'paired_refund',
            'pre_save_refund_pair_neutralized');
    }

    if (cardPaymentRole?.role === 'bank_payment') {
        return entry(transaction, 'excluded', 'card_bill_payment',
            'strong_two_sided_card_payment');
    }
    if (cardPaymentRole?.role === 'card_credit') {
        return entry(transaction, 'excluded', 'card_bill_payment_counterpart',
            'strong_two_sided_card_payment');
    }
    if (cardPaymentReversalRole?.role === 'reversal') {
        return entry(transaction, 'excluded', 'card_payment_reversal',
            'strong_linked_card_payment_reversal');
    }

    if (cardFundedPixRole?.role === 'bank_credit') {
        return entry(transaction, 'excluded', 'card_funded_pix_principal',
            'represented_by_card_funded_pix_flow', null,
            cardFundedPixRole.context);
    }
    if (cardFundedPixRole?.role === 'card_debit') {
        const feeAmount = Number(cardFundedPixRole.context?.fee_amount_cents);
        if (override.classification === 'expense' &&
            String(override.category || '').trim() &&
            Number.isSafeInteger(feeAmount) && feeAmount > 0) {
            return entry(transaction, 'ready', 'card_funded_pix_fee',
                'explicit_reviewed_card_funded_pix_fee',
                expenseWritePlan(transaction, binding, {
                    category: override.category,
                    subcategory: override.subcategory || ''
                }, 'card_funded_pix_fee', false, feeAmount),
                cardFundedPixRole.context);
        }
        return entry(transaction, 'needs_review', 'card_funded_pix_fee',
            'card_funded_pix_fee_category_required', null,
            cardFundedPixRole.context);
    }

    const scopedSheetRecords = sheetRecords(override.sheetSnapshot, binding, transaction);
    if (override.classification === 'existing_sheet_match') {
        if (explicitExistingRowProven(transaction, scopedSheetRecords, binding,
            override.existingDescription)) {
            return entry(transaction, 'existing', 'already_recorded',
                'explicit_reviewed_sheet_match');
        }
        return entry(transaction, 'needs_review', 'existing_sheet_match',
            'explicit_sheet_match_not_proven');
    }

    const duplicate = duplicateState(transaction, scopedSheetRecords, binding);
    if (duplicate) {
        return entry(transaction, duplicate, 'already_recorded',
            duplicate === 'existing' ? 'exact_scoped_sheet_match' :
                'strong_non_identical_sheet_match');
    }

    const cardStatementRole = explicitCardStatementRole(transaction, binding);
    if (cardStatementRole) {
        return entry(transaction, 'excluded', cardStatementRole.classification,
            cardStatementRole.reason);
    }

    if (override.ruleConflict) {
        return entry(transaction, 'needs_review', 'merchant_rule_conflict',
            'merchant_rule_conflict');
    }
    const classification = override.classification || rule?.classification || '';
    if (classification === 'internal_transfer_pair') {
        return entry(transaction, 'needs_review', 'transfer',
            'explicit_transfer_pair_not_proven');
    }
    if (classification === 'internal_transfer') {
        const destination = String(override.destinationFinancialAccount || '').trim();
        const origin = String(override.originFinancialAccount || '').trim();
        const amount = Number(transaction.amount_cents);
        const outgoing = amount < 0 && destination && !origin &&
            normalizeText(destination) !== normalizeText(binding.financialAccount);
        const incoming = amount > 0 && origin && !destination &&
            normalizeText(origin) !== normalizeText(binding.financialAccount);
        if (binding.kind !== 'bank' || (!outgoing && !incoming)) {
            return entry(transaction, 'needs_review', 'transfer',
                destination && !origin
                    ? 'explicit_transfer_requires_bank_debit'
                    : origin && !destination
                        ? 'explicit_transfer_requires_bank_credit'
                        : 'explicit_transfer_requires_directional_bank_movement');
        }
        const writePlan = transferWritePlan(
            transaction,
            outgoing ? binding : {
                financialAccount: origin,
                ownerUserId: binding.ownerUserId
            },
            outgoing ? {
                financialAccount: destination,
                ownerUserId: binding.ownerUserId
            } : binding,
            'transfer'
        );
        return reviewedTransferEntry(transaction, writePlan,
            override.sheetSnapshot, 'explicit_one_sided_internal_transfer');
    }
    if (classification === 'loan_proceeds') {
        if (binding.kind !== 'bank' || Number(transaction.amount_cents) <= 0 ||
            transaction.type !== 'CREDIT' ||
            normalizeText(transaction.status).toUpperCase() !== 'POSTED') {
            return entry(transaction, 'needs_review', 'loan_proceeds',
                'explicit_loan_proceeds_requires_posted_bank_credit');
        }
        return entry(transaction, 'excluded', 'loan_proceeds',
            'explicit_loan_proceeds_not_income');
    }
    const operation = normalizeText(transaction.operation_type).toUpperCase();
    const reserveDirection = classification === 'reserve_application' ||
        classification === 'reserve_redemption'
        ? classification
        : operation.includes('RESGATE APLIC')
            ? 'reserve_redemption'
            : '';
    if (reserveDirection) {
        if (binding.kind !== 'bank' || !String(binding.reserveAccount || '').trim()) {
            return entry(transaction, 'needs_review', 'reserve_transfer',
                'reserve_binding_required');
        }
        return reviewedTransferEntry(transaction,
            reserveWritePlan(transaction, binding, reserveDirection),
            override.sheetSnapshot, 'confirmed_reserve_principal');
    }

    const pending = normalizeText(transaction.status).toUpperCase() === 'PENDING';
    const installmentNumber = Number(transaction.installment_number);
    const totalInstallments = Number(transaction.total_installments);
    const hasInstallmentMetadata = transaction.installment_number != null ||
        transaction.total_installments != null;
    if (hasInstallmentMetadata && (!Number.isInteger(installmentNumber) ||
        !Number.isInteger(totalInstallments) || installmentNumber < 1 ||
        totalInstallments < 1 || installmentNumber > totalInstallments)) {
        return entry(transaction, 'needs_review', 'invalid_installment',
            'invalid_installment_metadata');
    }
    const sourceClassification = binding.kind === 'card' && pending
        ? classifyInitialOpenFinanceTransaction(
            transaction,
            { type: transaction.account_type },
            sourceObservedAt || historyEndDate
        ).classification
        : '';
    const reviewableOpenInvoicePurchase = includeOpenInvoiceCurrentPurchases === true &&
        isReviewableCreditPurchase({
            classification: sourceClassification,
            providerState: transaction.status,
            accountType: transaction.account_type,
            transaction
        });
    if (binding.kind === 'card' && pending && !reviewableOpenInvoicePurchase &&
        !(totalInstallments > 1 && installmentNumber > 1)) {
        return entry(transaction, 'excluded', 'pending_card_purchase',
            'provider_pending_not_historical_fact');
    }

    if (binding.kind === 'card' && Number(transaction.amount_cents) < 0) {
        if (override.classification === 'card_credit_adjustment' &&
            transaction.type === 'CREDIT' &&
            normalizeText(transaction.status).toUpperCase() === 'POSTED' &&
            String(override.category || '').trim()) {
            return entry(transaction, 'ready', 'card_credit_adjustment',
                'explicit_reviewed_card_credit_adjustment',
                expenseWritePlan(transaction, binding, {
                    category: override.category,
                    subcategory: override.subcategory || ''
                }, 'card_credit_adjustment', false,
                Number(transaction.amount_cents)));
        }
        return entry(transaction, 'needs_review', 'card_credit_or_payment',
            'refund_or_card_payment_requires_link');
    }

    if (binding.kind === 'bank' && classification === 'card_payment' &&
        Number(transaction.amount_cents) < 0) {
        return entry(transaction, 'excluded', 'card_bill_payment',
            'confirmed_card_bill_payment');
    }

    if (binding.kind === 'card' && !String(transaction.bill_forecast_month || '').trim() &&
        !binding.billingFallbackAuthorized) {
        return entry(transaction, 'needs_review', 'card_expense',
            'billing_month_required');
    }

    const category = (override.category ? {
            category: override.category,
            subcategory: override.subcategory || ''
        } : null) || resolveCategory(transaction, rule, patterns) ||
        (override.suggestedCategory ? {
            category: override.suggestedCategory,
            subcategory: override.suggestedSubcategory || ''
        } : null);
    if (binding.kind === 'card' || Number(transaction.amount_cents) < 0) {
        if (!category) {
            return entry(transaction, 'needs_review', binding.kind === 'card'
                ? 'card_expense'
                : 'expense', 'category_required');
        }
        const planned = binding.kind === 'card' && pending && totalInstallments > 1;
        const finalClassification = planned ? 'planned_card_installment' :
            binding.kind === 'card' ? 'card_expense' : 'expense';
        return entry(transaction, 'ready', finalClassification,
            reviewableOpenInvoicePurchase ? 'reviewable_open_invoice_purchase' :
                rule ? 'explicit_merchant_rule' : patterns.has(
                normalizeText(transaction.description)
            ) ? 'unique_sheet_pattern' : 'established_import_rule',
            expenseWritePlan(transaction, binding, category, finalClassification,
                override.suggestedRecurring === true),
            reviewableOpenInvoicePurchase ? {
                provider_state: normalizeText(transaction.status).toUpperCase(),
                source_classification: sourceClassification
            } : null);
    }

    if (classification === 'income' && category) {
        return entry(transaction, 'ready', 'income', 'explicit_income_rule', {
            operation: 'income.create',
            sheet_name: 'Entradas',
            row: [
                sheetDate(transaction.date), transaction.description,
                category.category, Math.abs(Number(transaction.amount_cents)) / 100,
                binding.ownerLabel, 'Conta Corrente', 'Não',
                'Importação histórica Open Finance revisada.',
                binding.ownerUserId, binding.financialAccount
            ],
            financial_writes: 0
        });
    }
    return entry(transaction, 'needs_review', 'income_or_refund',
        'positive_bank_movement_requires_semantic_decision');
}

function planOpenFinanceHistoricalImport({
    pluggySnapshot,
    sheetSnapshot,
    accountBindings = {},
    merchantRules = [],
    decisionOverrides = {},
    includeOpenInvoiceCurrentPurchases = false,
    historyStartDate,
    historyEndDate
} = {}) {
    if (!pluggySnapshot || !sheetSnapshot || !historyStartDate || !historyEndDate) {
        throw new Error('open_finance_historical_import_input_required');
    }
    const transactions = flattenSnapshot(pluggySnapshot);
    const sourceObservedAt = snapshotObservedAt(pluggySnapshot);
    const patterns = categoryPatterns(sheetSnapshot);
    const pairs = strongTransferPairs(transactions, accountBindings,
        historyStartDate, historyEndDate, decisionOverrides);
    const refundPairs = strongUnwrittenRefundPairs(transactions, accountBindings,
        sheetSnapshot, historyStartDate, historyEndDate, decisionOverrides);
    const cardPaymentPairs = strongCardBillPaymentPairs(transactions, accountBindings,
        merchantRules, decisionOverrides, sheetSnapshot, historyStartDate,
        historyEndDate);
    const cardPaymentReversalRoles = strongCardPaymentReversals(transactions,
        accountBindings, decisionOverrides, sheetSnapshot, historyStartDate,
        historyEndDate, cardPaymentPairs);
    const cardFundedPixRoles = strongCardFundedPixTriples(transactions,
        accountBindings, sheetSnapshot, historyStartDate, historyEndDate);
    const pairedCounterparts = new Set();
    const duplicates = new Set();
    const entries = transactions.map(transaction => {
        const ref = sourceRef(transaction);
        const selection = selectRule(transaction, merchantRules);
        return classifyTransaction({
            transaction,
            binding: accountBindings[transaction.account_id],
            rule: selection.rule,
            override: {
                ...(decisionOverrides[ref] || decisionOverrides[transaction.id] || {}),
                ruleConflict: selection.conflict,
                sheetSnapshot
            },
            patterns,
            duplicates,
            transferRole: pairs.get(ref),
            refundRole: refundPairs.get(ref),
            cardPaymentRole: cardPaymentPairs.get(ref),
            cardPaymentReversalRole: cardPaymentReversalRoles.get(ref),
            cardFundedPixRole: cardFundedPixRoles.get(ref),
            accountBindings,
            pairedCounterparts,
            historyStartDate,
            historyEndDate,
            sourceObservedAt,
            includeOpenInvoiceCurrentPurchases
        });
    });
    const summary = entries.reduce((counts, current) => {
        counts[current.state] = (counts[current.state] || 0) + 1;
        return counts;
    }, {
        ready: 0,
        existing: 0,
        possible_duplicate: 0,
        excluded: 0,
        needs_review: 0,
        outside_window: 0
    });
    const hashPayload = {
        historyStartDate,
        historyEndDate,
        includeOpenInvoiceCurrentPurchases: includeOpenInvoiceCurrentPurchases === true,
        entries
    };
    const coverageComplete = Boolean(sourceObservedAt &&
        sourceObservedAt.slice(0, 10) >= historyEndDate);
    return {
        history_start_date: historyStartDate,
        history_end_date: historyEndDate,
        source_observed_at: sourceObservedAt || null,
        include_open_invoice_current_purchases:
            includeOpenInvoiceCurrentPurchases === true,
        coverage_complete: coverageComplete,
        plan_status: coverageComplete ? 'REVIEW_REQUIRED' : 'PARTIAL_NO_GO',
        writable: false,
        summary,
        entries,
        plan_hash: crypto.createHash('sha256')
            .update(stableSerialize(hashPayload))
            .digest('hex'),
        financial_writes: 0
    };
}

module.exports = {
    planOpenFinanceHistoricalImport,
    __test__: {
        normalizeText,
        parseMoney,
        tokenSimilarity,
        sourceRef,
        providerIdentity,
        snapshotObservedAt,
        categoryPatterns,
        duplicateState
    }
};
