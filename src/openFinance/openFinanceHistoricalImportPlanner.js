const crypto = require('node:crypto');

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

function sheetRecords(sheetSnapshot, binding) {
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

function expenseWritePlan(transaction, binding, category, classification = 'expense') {
    const amount = Math.abs(Number(transaction.amount_cents)) / 100;
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
            'Não',
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

function entry(transaction, state, classification, reason, writePlan = null) {
    if (!TERMINAL_STATES.has(state)) {
        throw new Error('open_finance_historical_import_non_terminal_state');
    }
    return {
        source_ref: sourceRef(transaction),
        state,
        classification,
        reason,
        ...(writePlan ? { write_plan: writePlan } : {}),
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
    historyStartDate, historyEndDate) {
    const paired = new Map();
    const causalCandidatesByRef = new Map();
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
    accountBindings,
    pairedCounterparts,
    historyStartDate,
    historyEndDate
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
    if (String(transaction.currency || '').trim().toUpperCase() !== 'BRL') {
        return entry(transaction, 'needs_review', 'unsupported_currency',
            'unsupported_currency');
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

    if (transferRole?.role === 'counterpart' ||
        pairedCounterparts.has(sourceRef(transaction))) {
        return entry(transaction, 'excluded', 'paired_transfer_counterpart',
            'represented_by_consolidated_transfer');
    }
    if (transferRole?.role === 'origin' && Number(transaction.amount_cents) < 0) {
        pairedCounterparts.add(sourceRef(transferRole.pair));
        return entry(transaction, 'ready', 'transfer', 'strong_two_sided_pair',
            transferWritePlan(transaction, binding,
                accountBindings[transferRole.pair.account_id],
                'transfer'));
    }

    const duplicate = duplicateState(
        transaction,
        sheetRecords(override.sheetSnapshot, binding),
        binding
    );
    if (duplicate) {
        return entry(transaction, duplicate, 'already_recorded',
            duplicate === 'existing' ? 'exact_scoped_sheet_match' :
                'strong_non_identical_sheet_match');
    }

    if (override.ruleConflict) {
        return entry(transaction, 'needs_review', 'merchant_rule_conflict',
            'merchant_rule_conflict');
    }
    const classification = override.classification || rule?.classification || '';
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
        return entry(transaction, 'ready', 'reserve_transfer',
            'confirmed_reserve_principal',
            reserveWritePlan(transaction, binding, reserveDirection));
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
    if (binding.kind === 'card' && pending &&
        !(totalInstallments > 1 && installmentNumber > 1)) {
        return entry(transaction, 'excluded', 'pending_card_purchase',
            'provider_pending_not_historical_fact');
    }

    if (binding.kind === 'card' && Number(transaction.amount_cents) < 0) {
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
            rule ? 'explicit_merchant_rule' : patterns.has(
                normalizeText(transaction.description)
            ) ? 'unique_sheet_pattern' : 'established_import_rule',
            expenseWritePlan(transaction, binding, category, finalClassification));
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
    historyStartDate,
    historyEndDate
} = {}) {
    if (!pluggySnapshot || !sheetSnapshot || !historyStartDate || !historyEndDate) {
        throw new Error('open_finance_historical_import_input_required');
    }
    const transactions = flattenSnapshot(pluggySnapshot);
    const patterns = categoryPatterns(sheetSnapshot);
    const pairs = strongTransferPairs(transactions, accountBindings,
        historyStartDate, historyEndDate);
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
            accountBindings,
            pairedCounterparts,
            historyStartDate,
            historyEndDate
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
    const hashPayload = { historyStartDate, historyEndDate, entries };
    const sourceObservedAt = snapshotObservedAt(pluggySnapshot);
    const coverageComplete = Boolean(sourceObservedAt &&
        sourceObservedAt.slice(0, 10) >= historyEndDate);
    return {
        history_start_date: historyStartDate,
        history_end_date: historyEndDate,
        source_observed_at: sourceObservedAt || null,
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
