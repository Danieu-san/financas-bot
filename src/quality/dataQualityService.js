const { normalizeText } = require('../utils/helpers');

const ISSUE_ORDER = [
    'missing_category',
    'uncertain',
    'pending',
    'unreconciled',
    'missing_financial_account',
    'missing_required_receipt'
];

const CATEGORY_REQUIRED_KINDS = new Set([
    'expense',
    'card_purchase',
    'income',
    'bill_expected',
    'bill_payment',
    'reimbursement',
    'refund',
    'chargeback'
]);

const SINGLE_ACCOUNT_KINDS = new Set([
    'expense',
    'income',
    'bill_payment',
    'debt_payment',
    'reimbursement',
    'refund',
    'goal_contribution',
    'goal_withdrawal'
]);

const TWO_ACCOUNT_KINDS = new Set(['transfer', 'invoice_payment']);

const SOURCE_LABELS = {
    'sheet.saidas': 'Saídas',
    'sheet.entradas': 'Entradas',
    'sheet.transferencias': 'Transferências',
    'sheet.lancamentos_cartao': 'Cartão',
    'sheet.contas': 'Contas',
    'sheet.dividas': 'Dívidas',
    'sheet.pagamentos_dividas': 'Dívidas',
    'sheet.metas': 'Metas',
    'sheet.movimentacoes_metas': 'Metas',
    'import.statement': 'Importação'
};

const SOURCE_ALIASES = {
    saida: 'Saídas',
    saidas: 'Saídas',
    entrada: 'Entradas',
    entradas: 'Entradas',
    transferencia: 'Transferências',
    transferencias: 'Transferências',
    cartao: 'Cartão',
    cartoes: 'Cartão',
    conta: 'Contas',
    contas: 'Contas',
    divida: 'Dívidas',
    dividas: 'Dívidas',
    meta: 'Metas',
    metas: 'Metas',
    importacao: 'Importação',
    importacoes: 'Importação',
    extrato: 'Importação'
};

const STATUS_TO_ISSUE = {
    missing_category: 'missing_category',
    sem_categoria: 'missing_category',
    uncertain: 'uncertain',
    incerto: 'uncertain',
    incertos: 'uncertain',
    pending: 'pending',
    pendente: 'pending',
    pendentes: 'pending',
    unreconciled: 'unreconciled',
    nao_conciliado: 'unreconciled',
    nao_conciliados: 'unreconciled',
    missing_financial_account: 'missing_financial_account',
    sem_conta_financeira: 'missing_financial_account',
    missing_required_receipt: 'missing_required_receipt',
    sem_comprovante: 'missing_required_receipt'
};

function roundPct(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 10) / 10;
}

function normalizedKey(value) {
    return normalizeText(String(value || ''))
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function sourceLabel(value) {
    const raw = String(value || '').trim();
    if (SOURCE_LABELS[raw]) return SOURCE_LABELS[raw];
    const normalized = normalizedKey(raw.replace(/^sheet\./, ''));
    if (SOURCE_ALIASES[normalized]) return SOURCE_ALIASES[normalized];
    if (!raw) return 'Outra origem';
    return raw.replace(/^sheet\./, '').replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, letter => letter.toUpperCase())
        .slice(0, 60);
}

function requestedSourceLabel(value) {
    const normalized = normalizedKey(value);
    return SOURCE_ALIASES[normalized] || sourceLabel(value);
}

function issueFromStatus(value) {
    return STATUS_TO_ISSUE[normalizedKey(value)] || '';
}

function isoDate(value) {
    const raw = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

function monthBounds(year, month) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) return null;
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { from, to };
}

function periodBounds(period = {}, currentDate = '') {
    const type = normalizedKey(period.type || '');
    if (type === 'month') {
        return monthBounds(Number(period.year), Number(period.month));
    }
    if (type === 'date_range') {
        const from = isoDate(period.from);
        const to = isoDate(period.to);
        return from && to ? { from, to } : null;
    }
    if (type === 'today') {
        const today = isoDate(currentDate);
        return today ? { from: today, to: today } : null;
    }
    const reference = isoDate(currentDate);
    if (reference) {
        const [year, month] = reference.split('-').map(Number);
        return monthBounds(year, month - 1);
    }
    return null;
}

function dateInBounds(value, bounds) {
    if (!bounds) return true;
    const date = isoDate(value);
    return Boolean(date && date >= bounds.from && date <= bounds.to);
}

function eventDate(event = {}) {
    return isoDate(event.occurred_on || event.effective_on || event.due_on || event.created_at);
}

function categoryRequired(event = {}) {
    return CATEGORY_REQUIRED_KINDS.has(String(event.kind || '').trim());
}

function categoryMissing(event = {}) {
    if (!categoryRequired(event)) return false;
    const category = normalizedKey(event.category);
    const status = normalizedKey(event.category_status);
    return !category || ['outro', 'outros', 'outra', 'outras', 'sem_categoria'].includes(category) || status === 'unresolved';
}

function receiptRequired(event = {}) {
    return event.receipt_required === true || normalizedKey(event.receipt_required) === 'true';
}

function receiptAttached(event = {}) {
    if (event.receipt_attached === true) return true;
    return ['attached', 'verified', 'available'].includes(normalizedKey(event.receipt_status));
}

function linesByEvent(lines = []) {
    const grouped = new Map();
    for (const line of lines || []) {
        const key = String(line?.event_id || '').trim();
        if (!key) continue;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(line);
    }
    return grouped;
}

function missingFinancialAccount(event = {}, eventLines = []) {
    const kind = String(event.kind || '').trim();
    if (TWO_ACCOUNT_KINDS.has(kind)) {
        const cash = eventLines.find(line => line.line_type === 'cash');
        const clearing = eventLines.find(line => line.line_type === 'clearing');
        return !String(cash?.account_id || '').trim() || !String(clearing?.account_id || '').trim();
    }
    if (SINGLE_ACCOUNT_KINDS.has(kind)) {
        const cash = eventLines.find(line => line.line_type === 'cash');
        return !String(cash?.account_id || '').trim();
    }
    return false;
}

function activeReconciledEventIds(links = []) {
    return new Set((links || [])
        .filter(link => normalizedKey(link.status || 'active') === 'active')
        .filter(link => ['import_match', 'refund_pair', 'payment', 'recurrence_occurrence_payment'].includes(String(link.link_type || '')))
        .map(link => String(link.event_id || '').trim())
        .filter(Boolean));
}

function eventIssues(event, eventLines, reconciledEventIds) {
    const issues = [];
    if (categoryMissing(event)) issues.push('missing_category');
    if (normalizedKey(event.status) === 'uncertain') issues.push('uncertain');
    if (normalizedKey(event.status) === 'pending') issues.push('pending');
    if (String(event.source_type || '') === 'import.statement' && !reconciledEventIds.has(String(event.event_id || ''))) {
        issues.push('unreconciled');
    }
    if (missingFinancialAccount(event, eventLines)) issues.push('missing_financial_account');
    if (receiptRequired(event) && !receiptAttached(event)) issues.push('missing_required_receipt');
    return ISSUE_ORDER.filter(issue => issues.includes(issue));
}

function eventRecord(event, eventLines, reconciledEventIds, personByUserId = {}) {
    const issues = eventIssues(event, eventLines, reconciledEventIds);
    return {
        date: eventDate(event),
        description: String(event.description || 'Item sem descrição').trim().slice(0, 140),
        type: String(event.kind || 'transaction').trim().slice(0, 60),
        status: String(event.status || '').trim().slice(0, 40),
        category: String(event.category || '').trim().slice(0, 80),
        source: sourceLabel(event.source_type),
        responsible: String(personByUserId[event.owner_person_id] || 'Pessoa').trim().slice(0, 80),
        categoryApplicable: categoryRequired(event),
        classified: categoryRequired(event) && !categoryMissing(event),
        receiptRequired: receiptRequired(event),
        issues
    };
}

function statementRecord(link = {}) {
    const status = normalizedKey(link.decision_status || link.decisionStatus);
    const issues = [];
    if (status === 'possible_duplicate' || status === 'uncertain') {
        issues.push('uncertain', 'unreconciled');
    }
    return {
        date: isoDate(link.confirmed_at || link.confirmedAt),
        description: 'Item de importação',
        type: 'statement_import',
        status,
        category: '',
        source: 'Importação',
        responsible: 'Pessoa',
        categoryApplicable: false,
        classified: false,
        receiptRequired: false,
        issues: ISSUE_ORDER.filter(issue => issues.includes(issue))
    };
}

function summarizeRecords(records = [], sourceHealth = 'available') {
    const classificationApplicableCount = records.filter(item => item.categoryApplicable).length;
    const classifiedCount = records.filter(item => item.classified).length;
    const receiptRequiredCount = records.filter(item => item.receiptRequired).length;
    const pendingItems = records.filter(item => item.issues.length > 0);
    const countIssue = issue => records.filter(item => item.issues.includes(issue)).length;
    const totalCount = records.length;
    const cleanCount = totalCount - pendingItems.length;
    return {
        status: sourceHealth === 'available' ? 'available' : 'partial',
        totalCount,
        cleanCount,
        classificationApplicableCount,
        classifiedCount,
        missingCategoryCount: countIssue('missing_category'),
        uncertainCount: countIssue('uncertain'),
        pendingStatusCount: countIssue('pending'),
        unreconciledCount: countIssue('unreconciled'),
        missingFinancialAccountCount: countIssue('missing_financial_account'),
        receiptRequiredCount,
        missingRequiredReceiptCount: countIssue('missing_required_receipt'),
        receiptIndicatorStatus: receiptRequiredCount > 0 ? 'applicable' : 'not_applicable',
        pendingCount: pendingItems.length,
        coveragePct: classificationApplicableCount > 0
            ? roundPct(classifiedCount * 100 / classificationApplicableCount)
            : null,
        qualityCoveragePct: totalCount > 0 ? roundPct(cleanCount * 100 / totalCount) : null
    };
}

function sourceGroups(records = [], sourceHealth = 'available') {
    const grouped = new Map();
    for (const record of records) {
        if (!grouped.has(record.source)) grouped.set(record.source, []);
        grouped.get(record.source).push(record);
    }
    return Array.from(grouped.entries())
        .map(([source, items]) => ({ source, ...summarizeRecords(items, sourceHealth) }))
        .sort((left, right) => right.pendingCount - left.pendingCount || left.source.localeCompare(right.source, 'pt-BR'));
}

function publicItem(record = {}) {
    return {
        date: record.date,
        description: record.description,
        type: record.type,
        status: record.status,
        category: record.category,
        source: record.source,
        responsible: record.responsible,
        issues: [...record.issues]
    };
}

function buildDataQualityCoverage(source = {}, {
    period = {},
    source: sourceFilter = '',
    currentDate = '',
    personByUserId = {}
} = {}) {
    const bounds = periodBounds(period, currentDate);
    const eventLines = linesByEvent(source.lines);
    const reconciledEventIds = activeReconciledEventIds(source.reconciliationLinks);
    const requestedSource = String(sourceFilter || '').trim() ? requestedSourceLabel(sourceFilter) : '';
    const eventRecords = (source.events || [])
        .filter(item => dateInBounds(eventDate(item), bounds))
        .map(item => eventRecord(item, eventLines.get(String(item.event_id || '')) || [], reconciledEventIds, personByUserId));
    const statementRecords = (source.statementReconciliationLinks || [])
        .filter(item => dateInBounds(item.confirmed_at || item.confirmedAt, bounds))
        .map(statementRecord);
    const records = [...eventRecords, ...statementRecords]
        .filter(item => !requestedSource || item.source === requestedSource);
    const sourceHealth = String(source.sourceHealth || 'partial').trim().toLowerCase();
    const summary = summarizeRecords(records, sourceHealth);
    const items = records
        .filter(item => item.issues.length > 0)
        .sort((left, right) => String(right.date).localeCompare(String(left.date)) || left.description.localeCompare(right.description, 'pt-BR'))
        .map(publicItem);
    return {
        ...summary,
        timeBasis: 'transaction_date',
        period: bounds,
        sourceHealth,
        bySource: sourceGroups(records, sourceHealth),
        items,
        criteria: 'Cobertura calculada somente sobre eventos observados no ledger canônico no período e decisões sanitizadas de importação. Eventos usam a data da transação; decisões de importação sem data financeira pública usam a data de confirmação. Pendências não são removidas nem alteram os totais financeiros; ausência de fonte não vira zero.'
    };
}

async function executeDataQualityQuery(plan = {}, source = {}, context = {}) {
    const coverage = buildDataQualityCoverage(source, {
        period: plan.filters?.period || {},
        source: plan.filters?.source || '',
        currentDate: context.currentDate || source.currentDate || '',
        personByUserId: context.personByUserId || source.personByUserId || {}
    });
    const requestedIssue = issueFromStatus(plan.filters?.status || '');
    const selectedItems = requestedIssue
        ? coverage.items.filter(item => item.issues.includes(requestedIssue))
        : coverage.items;
    const limitedItems = selectedItems.slice(0, Math.max(1, Math.min(50, Number(plan.limit || 10))));
    const details = {
        ...coverage,
        items: undefined
    };

    if (plan.operation === 'count') {
        return { ok: true, plan, result: { value: selectedItems.length, details } };
    }
    if (plan.operation === 'list') {
        return {
            ok: true,
            plan,
            result: {
                value: {
                    ...coverage,
                    pendingCount: selectedItems.length,
                    items: limitedItems
                },
                details
            }
        };
    }
    if (plan.operation === 'group') {
        return { ok: true, plan, result: { value: coverage.bySource, details } };
    }
    if (['detail', 'detect', 'explain'].includes(plan.operation)) {
        return {
            ok: true,
            plan,
            result: {
                value: {
                    ...coverage,
                    items: limitedItems
                },
                details
            }
        };
    }
    return {
        ok: false,
        plan,
        errors: [`operacao ainda nao implementada para qualidade: ${plan.operation}`],
        result: null
    };
}

module.exports = {
    buildDataQualityCoverage,
    executeDataQualityQuery,
    __test__: {
        ISSUE_ORDER,
        issueFromStatus,
        periodBounds,
        sourceLabel
    }
};
