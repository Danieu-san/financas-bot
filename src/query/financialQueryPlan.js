const { normalizeText } = require('../utils/helpers');

const ALLOWED_DOMAINS = new Set([
    'expenses',
    'income',
    'cards',
    'transfers',
    'budget',
    'goals',
    'debts',
    'bills',
    'imports',
    'dashboard',
    'calendar',
    'help'
]);

const ALLOWED_OPERATIONS = new Set([
    'sum',
    'count',
    'list',
    'detail',
    'group',
    'rank',
    'compare',
    'trend',
    'average',
    'percentage',
    'extreme',
    'explain',
    'search',
    'detect',
    'forecast',
    'recommend'
]);

const ALLOWED_SCOPES = new Set(['personal', 'family', 'member']);
const ALLOWED_TIME_BASIS = new Set(['transaction_date', 'billing_month', 'due_date', 'budget_cycle']);
const ALLOWED_ANSWER_STYLES = new Set(['short', 'detailed', 'audit']);
const ALLOWED_GROUP_BY = new Set([
    'category',
    'categories',
    'subcategory',
    'merchant',
    'paymentMethod',
    'card',
    'member',
    'date',
    'month',
    'status',
    'source'
]);
const ALLOWED_SORT_FIELDS = new Set(['value', 'date', 'count', 'name']);
const ALLOWED_FILTER_KEYS = new Set([
    'period',
    'scope',
    'member',
    'category',
    'categories',
    'subcategory',
    'merchant',
    'paymentMethod',
    'card',
    'status',
    'source',
    'recurrence',
    'value'
]);
const BLOCKED_KEYS = new Set([
    'sheetid',
    'spreadsheetid',
    'userid',
    'user_id',
    'tenantid',
    'token',
    'secret',
    'rawrows',
    'allusers',
    'admin'
]);

const DEFAULT_TIME_BASIS_BY_DOMAIN = {
    cards: 'billing_month',
    budget: 'budget_cycle',
    bills: 'due_date',
    debts: 'due_date',
    calendar: 'due_date'
};

function normalizeEnum(value) {
    return normalizeText(String(value || '')).replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

function hasBlockedKey(value) {
    if (!value || typeof value !== 'object') return false;
    return Object.keys(value).some((key) => {
        const normalized = normalizeEnum(key);
        if (BLOCKED_KEYS.has(normalized)) return true;
        return hasBlockedKey(value[key]);
    });
}

function normalizePeriod(period) {
    if (!period || typeof period !== 'object' || Array.isArray(period)) return null;
    const allowed = new Set(['type', 'month', 'year', 'from', 'to', 'days', 'label']);
    const unknown = Object.keys(period).filter(key => !allowed.has(key));
    if (unknown.length > 0) {
        return { error: `periodo contem campos nao permitidos: ${unknown.join(', ')}` };
    }
    const normalized = {};
    if (period.type) normalized.type = normalizeEnum(period.type);
    if (period.month !== undefined) {
        const month = Number.parseInt(period.month, 10);
        if (!Number.isInteger(month) || month < 0 || month > 11) {
            return { error: 'period.month deve ser um numero entre 0 e 11' };
        }
        normalized.month = month;
    }
    if (period.year !== undefined) {
        const year = Number.parseInt(period.year, 10);
        if (!Number.isInteger(year) || year < 2000 || year > 2100) {
            return { error: 'period.year deve ser um ano valido' };
        }
        normalized.year = year;
    }
    ['from', 'to', 'label'].forEach((key) => {
        if (period[key] !== undefined) normalized[key] = String(period[key]).trim();
    });
    if (period.days !== undefined) {
        const days = Number.parseInt(period.days, 10);
        if (!Number.isInteger(days) || days < 1 || days > 366) {
            return { error: 'period.days deve ficar entre 1 e 366' };
        }
        normalized.days = days;
    }
    return normalized;
}

function normalizeFilters(filters = {}) {
    if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
        return { value: {}, errors: ['filters deve ser um objeto'] };
    }

    const errors = [];
    const unknown = Object.keys(filters).filter(key => !ALLOWED_FILTER_KEYS.has(key));
    if (unknown.length > 0) {
        errors.push(`filters contem campos nao permitidos: ${unknown.join(', ')}`);
    }

    const normalized = {};
    if (filters.period !== undefined) {
        const period = normalizePeriod(filters.period);
        if (period?.error) errors.push(period.error);
        else if (period) normalized.period = period;
    }
    if (filters.scope !== undefined) {
        const scope = normalizeEnum(filters.scope);
        if (!ALLOWED_SCOPES.has(scope)) errors.push(`scope invalido: ${filters.scope}`);
        else normalized.scope = scope;
    }

    [
        'member',
        'category',
        'categories',
        'subcategory',
        'merchant',
        'paymentMethod',
        'card',
        'status',
        'source',
        'recurrence'
    ].forEach((key) => {
        if (filters[key] !== undefined) normalized[key] = String(filters[key]).trim();
    });

    if (filters.categories !== undefined) {
        if (!Array.isArray(filters.categories)) {
            errors.push('filters.categories deve ser uma lista');
        } else {
            normalized.categories = filters.categories.map(value => String(value || '').trim()).filter(Boolean).slice(0, 10);
        }
    }

    if (filters.value !== undefined) {
        if (!filters.value || typeof filters.value !== 'object' || Array.isArray(filters.value)) {
            errors.push('filters.value deve ser um objeto');
        } else {
            const allowedValueKeys = new Set(['min', 'max', 'equals']);
            const unknownValue = Object.keys(filters.value).filter(key => !allowedValueKeys.has(key));
            if (unknownValue.length > 0) errors.push(`filters.value contem campos nao permitidos: ${unknownValue.join(', ')}`);
            normalized.value = {};
            ['min', 'max', 'equals'].forEach((key) => {
                if (filters.value[key] !== undefined) {
                    const parsed = Number(filters.value[key]);
                    if (!Number.isFinite(parsed)) errors.push(`filters.value.${key} deve ser numerico`);
                    else normalized.value[key] = parsed;
                }
            });
        }
    }

    return { value: normalized, errors };
}

function normalizeGroupBy(groupBy) {
    const list = Array.isArray(groupBy) ? groupBy : [];
    const errors = [];
    const normalized = [];
    list.forEach((item) => {
        const value = normalizeEnum(item);
        if (!ALLOWED_GROUP_BY.has(value)) {
            errors.push(`groupBy invalido: ${item}`);
            return;
        }
        if (!normalized.includes(value)) normalized.push(value);
    });
    return { value: normalized, errors };
}

function normalizeSort(sort) {
    if (!sort) return { value: { by: 'value', direction: 'desc' }, errors: [] };
    if (typeof sort !== 'object' || Array.isArray(sort)) {
        return { value: null, errors: ['sort deve ser um objeto'] };
    }
    const by = normalizeEnum(sort.by || 'value');
    const direction = normalizeEnum(sort.direction || 'desc');
    const errors = [];
    if (!ALLOWED_SORT_FIELDS.has(by)) errors.push(`sort.by invalido: ${sort.by}`);
    if (!['asc', 'desc'].includes(direction)) errors.push(`sort.direction invalido: ${sort.direction}`);
    return { value: { by, direction }, errors };
}

function normalizeFinancialQueryPlan(input) {
    const errors = [];
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { ok: false, plan: null, errors: ['plano deve ser um objeto'] };
    }
    if (hasBlockedKey(input)) {
        return { ok: false, plan: null, errors: ['plano contem campos sensiveis ou internos bloqueados'] };
    }

    const allowedTopLevel = new Set([
        'kind',
        'domain',
        'operation',
        'filters',
        'groupBy',
        'sort',
        'limit',
        'timeBasis',
        'needsContext',
        'answerStyle'
    ]);
    const unknownTopLevel = Object.keys(input).filter(key => !allowedTopLevel.has(key));
    if (unknownTopLevel.length > 0) {
        errors.push(`plano contem campos nao permitidos: ${unknownTopLevel.join(', ')}`);
    }

    const kind = input.kind ? normalizeEnum(input.kind) : 'financial_query';
    if (kind !== 'financial_query') errors.push(`kind invalido: ${input.kind}`);

    const domain = normalizeEnum(input.domain);
    if (!ALLOWED_DOMAINS.has(domain)) errors.push(`domain invalido: ${input.domain}`);

    const operation = normalizeEnum(input.operation);
    if (!ALLOWED_OPERATIONS.has(operation)) errors.push(`operation invalida: ${input.operation}`);

    const filters = normalizeFilters(input.filters || {});
    errors.push(...filters.errors);

    const groupBy = normalizeGroupBy(input.groupBy);
    errors.push(...groupBy.errors);

    const sort = normalizeSort(input.sort);
    errors.push(...sort.errors);

    let limit = Number.parseInt(input.limit ?? '10', 10);
    if (!Number.isInteger(limit) || limit < 1) limit = 10;
    limit = Math.min(limit, 50);

    const timeBasis = normalizeEnum(input.timeBasis || DEFAULT_TIME_BASIS_BY_DOMAIN[domain] || 'transaction_date');
    if (!ALLOWED_TIME_BASIS.has(timeBasis)) errors.push(`timeBasis invalido: ${input.timeBasis}`);

    const answerStyle = normalizeEnum(input.answerStyle || 'short');
    if (!ALLOWED_ANSWER_STYLES.has(answerStyle)) errors.push(`answerStyle invalido: ${input.answerStyle}`);

    if (errors.length > 0) {
        return { ok: false, plan: null, errors };
    }

    return {
        ok: true,
        errors: [],
        plan: {
            kind,
            domain,
            operation,
            filters: filters.value,
            groupBy: groupBy.value,
            sort: sort.value,
            limit,
            timeBasis,
            needsContext: Boolean(input.needsContext),
            answerStyle
        }
    };
}

function legacyIntentToQueryPlan(intent, parameters = {}) {
    const mes = parameters.mes;
    const ano = parameters.ano;
    const period = {};
    if (mes !== undefined && mes !== null && mes !== '') period.month = Number.parseInt(mes, 10);
    if (ano !== undefined && ano !== null && ano !== '') period.year = Number.parseInt(ano, 10);
    if (period.month !== undefined || period.year !== undefined) period.type = 'month';

    const baseFilters = Object.keys(period).length > 0 ? { period } : {};
    const categoryFilters = parameters.categoria ? { ...baseFilters, category: parameters.categoria } : baseFilters;
    const cardFilters = parameters.cartao ? { ...baseFilters, card: parameters.cartao } : baseFilters;

    const map = {
        total_gastos_mes: { domain: 'expenses', operation: 'sum', filters: baseFilters },
        total_gastos_categoria_mes: { domain: 'expenses', operation: 'sum', filters: categoryFilters, groupBy: ['category'] },
        media_gastos_categoria_mes: { domain: 'expenses', operation: 'average', filters: categoryFilters },
        media_diaria_gastos_mes: { domain: 'expenses', operation: 'average', filters: baseFilters, groupBy: ['date'] },
        total_gastos_multiplas_categorias: { domain: 'expenses', operation: 'sum', filters: { ...baseFilters, categories: parameters.categorias || [] }, groupBy: ['category'] },
        percentual_categoria_gastos: { domain: 'expenses', operation: 'percentage', filters: categoryFilters, groupBy: ['category'] },
        comparacao_gastos_categorias: { domain: 'expenses', operation: 'compare', filters: { ...baseFilters, categories: parameters.categorias || [] }, groupBy: ['category'] },
        listagem_gastos_categoria: { domain: 'expenses', operation: 'list', filters: categoryFilters, answerStyle: 'detailed' },
        contagem_ocorrencias: { domain: 'expenses', operation: 'count', filters: categoryFilters },
        contagem_lancamentos_saida: { domain: 'expenses', operation: 'count', filters: baseFilters },
        gastos_valores_duplicados: { domain: 'expenses', operation: 'detect', filters: baseFilters },
        maior_menor_gasto: { domain: 'expenses', operation: 'extreme', filters: baseFilters },
        maior_menor_gasto_categoria: { domain: 'expenses', operation: 'extreme', filters: categoryFilters },
        ranking_categorias_gastos: { domain: 'expenses', operation: 'rank', filters: baseFilters, groupBy: ['category'] },
        comparacao_gastos_periodo: { domain: 'expenses', operation: 'compare', filters: baseFilters },
        detalhamento_gastos_mes: { domain: 'expenses', operation: 'detail', filters: baseFilters, groupBy: ['category', 'merchant'], answerStyle: 'detailed' },
        ranking_estabelecimentos_gastos: { domain: 'expenses', operation: 'rank', filters: baseFilters, groupBy: ['merchant'] },
        detalhamento_cartao_mes: { domain: 'cards', operation: 'detail', filters: cardFilters, groupBy: ['card', 'category', 'merchant'], answerStyle: 'detailed' },
        total_fatura_cartao: { domain: 'cards', operation: 'sum', filters: cardFilters },
        total_faturas_por_cartao: { domain: 'cards', operation: 'group', filters: cardFilters, groupBy: ['card'] },
        total_cartoes_em_aberto: { domain: 'cards', operation: 'forecast', filters: cardFilters, groupBy: ['card'], answerStyle: 'detailed' },
        ranking_cartoes_em_aberto: { domain: 'cards', operation: 'rank', filters: baseFilters, groupBy: ['card'] },
        resumo_parcelamentos_cartao: { domain: 'cards', operation: 'list', filters: cardFilters, groupBy: ['card'], answerStyle: 'detailed' },
        total_pagamentos_fatura_mes: { domain: 'transfers', operation: 'sum', filters: { ...baseFilters, category: 'pagamento de fatura' } },
        saldo_do_mes: { domain: 'dashboard', operation: 'sum', filters: baseFilters },
        saldo_disponivel_estimado: { domain: 'dashboard', operation: 'explain', filters: baseFilters, answerStyle: 'detailed' },
        resumo_metas: { domain: 'goals', operation: 'list', filters: {}, answerStyle: 'detailed' },
        progresso_metas: { domain: 'goals', operation: 'explain', filters: {}, answerStyle: 'detailed' },
        contas_vencendo: { domain: 'bills', operation: 'list', filters: { period: { type: parameters.amanha ? 'relative' : 'today', days: parameters.dias || 7 } } },
        resumo_contas_recorrentes: { domain: 'bills', operation: 'list', filters: {}, answerStyle: 'detailed' }
    };

    const draft = map[intent];
    if (!draft) return { ok: false, plan: null, errors: [`intent legado nao mapeado: ${intent}`] };
    return normalizeFinancialQueryPlan({ kind: 'financial_query', limit: 10, ...draft });
}

module.exports = {
    normalizeFinancialQueryPlan,
    legacyIntentToQueryPlan,
    __test__: {
        ALLOWED_DOMAINS,
        ALLOWED_OPERATIONS,
        ALLOWED_GROUP_BY,
        hasBlockedKey,
        normalizePeriod
    }
};
