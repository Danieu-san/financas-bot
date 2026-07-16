const SPEC_VERSION = 'financial-query-spec-v1';

const ALLOWED_SOURCE_HEALTH = new Set(['available', 'partial', 'stale', 'unavailable']);
const ALLOWED_SCOPES = new Set(['personal', 'family', 'member', 'context', 'none']);
const ALLOWED_TIME_BASIS = new Set([
    'transaction_date',
    'purchase_date',
    'billing_month',
    'due_date',
    'budget_cycle',
    'current_state',
    'context',
    'none'
]);
const ALLOWED_PERIOD_TYPES = new Set([
    'current_state',
    'transaction_date',
    'purchase_date',
    'billing_month',
    'due_date',
    'budget_cycle',
    'context',
    'none',
    'today',
    'yesterday',
    'month',
    'date_range',
    'relative',
    'cycle'
]);
const ALLOWED_DIMENSIONS = new Set([
    'bill',
    'card',
    'category',
    'cycle',
    'date',
    'debt',
    'due_date',
    'goal',
    'installment',
    'metric',
    'period',
    'person',
    'surface',
    'source',
    'status',
    'transaction'
]);
const BLOCKED_KEYS = new Set([
    'allusers',
    'admin',
    'oauth',
    'password',
    'rawdata',
    'rawrows',
    'rows',
    'secret',
    'sheetid',
    'sheet_id',
    'spreadsheetid',
    'spreadsheet_id',
    'token',
    'userid',
    'user_id'
]);
const ALLOWED_TOP_LEVEL_KEYS = new Set([
    'version',
    'objective',
    'domain',
    'metric',
    'operation',
    'dimensions',
    'filters',
    'entity',
    'period',
    'timeBasis',
    'scope',
    'sourceHealth',
    'source_health',
    'evidence',
    'clarificationReason'
]);

const METRIC_CATALOG = {
    accounts: ['available_balance'],
    bills: ['bills_due', 'bills_expected_vs_actual'],
    budget: [
        'budget_composition',
        'budget_categories_over_limit',
        'budget_category_daily_pace',
        'budget_category_remaining',
        'budget_cycle_comparison',
        'budget_daily_available',
        'budget_pace_variance',
        'budget_remaining',
        'budget_used'
    ],
    cards: [
        'card_expenses_detail',
        'card_expenses_list',
        'card_expenses_total',
        'installments_remaining',
        'invoice_forecast',
        'invoice_total'
    ],
    dashboard: [
        'available_balance',
        'balance_explanation',
        'cross_surface_parity',
        'data_quality',
        'monthly_comparison',
        'monthly_snapshot'
    ],
    debts: ['debt_simulation', 'debts_due', 'debts_overview'],
    expenses: [
        'expenses_comparison',
        'expenses_detail',
        'expenses_total',
        'expenses_trend',
        'net_expenses_after_refunds'
    ],
    goals: [
        'goal_balance',
        'goal_monthly_required',
        'goal_movements',
        'goal_progress',
        'goal_remaining',
        'goals_overview',
        'goals_remaining'
    ],
    income: ['income_comparison', 'income_total', 'income_trend'],
    quality: [
        'data_quality_coverage',
        'data_quality_pending',
        'missing_category',
        'missing_financial_account',
        'missing_required_receipt',
        'pending_status',
        'uncertain_status',
        'unreconciled_status'
    ],
    security: ['none'],
    transfers: ['available_balance', 'reserve_net_flow', 'transfer_classification', 'transfers_total']
};

const OPERATION_CATALOG = {
    accounts: ['sum', 'explain'],
    bills: ['compare', 'list', 'sum'],
    budget: ['compare', 'detail', 'detect', 'explain', 'forecast', 'rank', 'recommend', 'sum'],
    cards: ['detail', 'forecast', 'list', 'sum'],
    dashboard: ['compare', 'detect', 'detail', 'explain'],
    debts: ['forecast', 'list', 'sum'],
    expenses: ['compare', 'detail', 'list', 'rank', 'sum', 'trend'],
    goals: ['detail', 'explain', 'forecast', 'list', 'rank', 'sum'],
    income: ['compare', 'sum', 'trend'],
    quality: ['count', 'detail', 'detect', 'explain', 'group', 'list'],
    security: ['block'],
    transfers: ['explain', 'sum']
};

const TIME_BASIS_BY_DOMAIN = {
    accounts: ['current_state'],
    bills: ['due_date', 'current_state'],
    budget: ['budget_cycle'],
    cards: ['billing_month', 'context', 'purchase_date', 'transaction_date'],
    dashboard: ['billing_month', 'context', 'transaction_date', 'none'],
    debts: ['due_date', 'current_state', 'transaction_date'],
    expenses: ['billing_month', 'transaction_date', 'context'],
    goals: ['current_state', 'transaction_date'],
    income: ['transaction_date'],
    quality: ['transaction_date'],
    security: ['none'],
    transfers: ['transaction_date']
};

const DOMAIN_SYNONYMS = {
    contas: 'bills',
    dividas: 'debts',
    entradas: 'income',
    fatura: 'cards',
    gastos: 'expenses',
    metas: 'goals',
    orcamento: 'budget',
    pendencias: 'quality',
    qualidade: 'quality',
    saldo: 'dashboard',
    transferencias: 'transfers'
};

function normalizeEnum(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function hasBlockedKey(value) {
    if (!value || typeof value !== 'object') return false;
    return Object.keys(value).some((key) => {
        if (BLOCKED_KEYS.has(normalizeEnum(key))) return true;
        return hasBlockedKey(value[key]);
    });
}

function normalizeList(value) {
    return Array.isArray(value)
        ? value.map(normalizeEnum).filter(Boolean)
        : [];
}

function normalizePeriod(value) {
    if (typeof value === 'string') {
        const type = normalizeEnum(value);
        return { type };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { type: 'none' };
    }
    return {
        ...value,
        type: normalizeEnum(value.type || value.timeBasis || 'none')
    };
}

function normalizeSourceHealth(value) {
    if (Array.isArray(value)) {
        return value.map(item => ({
            source: normalizeEnum(item.source || ''),
            status: normalizeEnum(item.status || item.health || '')
        }));
    }
    if (typeof value === 'string') {
        return [{ source: 'primary', status: normalizeEnum(value) }];
    }
    if (value && typeof value === 'object') {
        return Object.entries(value).map(([source, status]) => ({
            source: normalizeEnum(source),
            status: normalizeEnum(status)
        }));
    }
    return [];
}

function validateFinancialQuerySpec(input) {
    const errors = [];
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { ok: false, spec: null, errors: ['spec deve ser um objeto'] };
    }
    if (hasBlockedKey(input)) {
        return { ok: false, spec: null, errors: ['spec contem campos sensiveis ou internos bloqueados'] };
    }
    const unknownTopLevel = Object.keys(input).filter(key => !ALLOWED_TOP_LEVEL_KEYS.has(key));
    if (unknownTopLevel.length > 0) {
        errors.push(`spec contem campos nao permitidos: ${unknownTopLevel.join(', ')}`);
    }

    const spec = {
        version: input.version || SPEC_VERSION,
        objective: String(input.objective || '').trim(),
        domain: normalizeEnum(DOMAIN_SYNONYMS[input.domain] || input.domain),
        metric: normalizeEnum(input.metric),
        operation: normalizeEnum(input.operation),
        dimensions: normalizeList(input.dimensions),
        filters: Array.isArray(input.filters) ? input.filters.slice(0, 20) : [],
        entity: String(input.entity || '').trim(),
        period: normalizePeriod(input.period),
        timeBasis: normalizeEnum(input.timeBasis),
        scope: normalizeEnum(input.scope?.type || input.scope),
        sourceHealth: normalizeSourceHealth(input.sourceHealth || input.source_health),
        evidence: Array.isArray(input.evidence) ? input.evidence.slice(0, 20) : [],
        clarificationReason: String(input.clarificationReason || '').trim()
    };

    if (spec.version !== SPEC_VERSION) errors.push(`version invalida: ${input.version}`);
    if (!spec.objective) errors.push('objective obrigatorio');
    if (!METRIC_CATALOG[spec.domain]) errors.push(`domain invalido: ${input.domain}`);
    if (!METRIC_CATALOG[spec.domain]?.includes(spec.metric)) {
        errors.push(`metric invalida para ${spec.domain}: ${input.metric}`);
    }
    if (!OPERATION_CATALOG[spec.domain]?.includes(spec.operation)) {
        errors.push(`operation invalida para ${spec.domain}: ${input.operation}`);
    }
    for (const dimension of spec.dimensions) {
        if (!ALLOWED_DIMENSIONS.has(dimension)) errors.push(`dimension invalida: ${dimension}`);
    }
    if (!spec.entity) errors.push('entity obrigatoria');
    if (!ALLOWED_TIME_BASIS.has(spec.timeBasis)) errors.push(`timeBasis invalido: ${input.timeBasis}`);
    if (!TIME_BASIS_BY_DOMAIN[spec.domain]?.includes(spec.timeBasis)) {
        errors.push(`timeBasis ${spec.timeBasis} nao pertence ao dominio ${spec.domain}`);
    }
    if (!ALLOWED_PERIOD_TYPES.has(spec.period.type)) errors.push(`period.type invalido: ${spec.period.type}`);
    if (!ALLOWED_SCOPES.has(spec.scope)) errors.push(`scope invalido: ${input.scope}`);
    if (spec.domain !== 'security' && spec.scope === 'none') errors.push('scope none permitido apenas para security');
    if (spec.sourceHealth.length === 0) errors.push('sourceHealth obrigatorio');
    for (const source of spec.sourceHealth) {
        if (!source.source) errors.push('sourceHealth.source obrigatorio');
        if (!ALLOWED_SOURCE_HEALTH.has(source.status)) {
            errors.push(`sourceHealth.status invalido: ${source.status}`);
        }
    }

    return {
        ok: errors.length === 0,
        spec: errors.length === 0 ? spec : null,
        errors
    };
}

function buildSpecFromGoldenCase(testCase) {
    const expected = testCase.expected || {};
    return validateFinancialQuerySpec({
        version: SPEC_VERSION,
        objective: testCase.question,
        domain: expected.domain,
        metric: expected.metric,
        operation: expected.operation,
        dimensions: expected.dimensions,
        filters: expected.filters,
        entity: expected.entity,
        period: { type: expected.period },
        timeBasis: expected.timeBasis,
        scope: { type: expected.scope },
        sourceHealth: [{ source: expected.domain, status: expected.sourceHealth }],
        evidence: [{ kind: 'golden_case', id: testCase.id }]
    });
}

function getMetricCatalog() {
    return JSON.parse(JSON.stringify(METRIC_CATALOG));
}

module.exports = {
    SPEC_VERSION,
    buildSpecFromGoldenCase,
    getMetricCatalog,
    validateFinancialQuerySpec,
    __test__: {
        ALLOWED_DIMENSIONS,
        ALLOWED_SOURCE_HEALTH,
        DOMAIN_SYNONYMS,
        OPERATION_CATALOG,
        TIME_BASIS_BY_DOMAIN,
        hasBlockedKey,
        normalizeEnum
    }
};
require('../reliability/legacyEntrypointTripwire').observeLegacyEntrypoint(
    'financial_query_spec', { domain: 'analytics' }
);
