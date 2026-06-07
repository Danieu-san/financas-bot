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
const ALLOWED_SORT_FIELDS = new Set(['value', 'date', 'count', 'name', 'interest', 'due_date', 'overdue']);
const GROUP_BY_CANONICAL = {
    paymentmethod: 'paymentMethod'
};
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
    'goal',
    'debt',
    'status',
    'source',
    'recurrence',
    'value'
]);
const BLOCKED_KEYS = new Set([
    'sheetid',
    'sheet_id',
    'spreadsheetid',
    'spreadsheet_id',
    'userid',
    'user_id',
    'tenantid',
    'tenant_id',
    'token',
    'secret',
    'refreshtoken',
    'accesstoken',
    'clientsecret',
    'prompt',
    'systemprompt',
    'instructions',
    'rawrows',
    'rawdata',
    'rows',
    'allusers',
    'admin',
    'oauth',
    'credential',
    'password'
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
        'goal',
        'debt',
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
        const normalizedEnum = normalizeEnum(item);
        const value = GROUP_BY_CANONICAL[normalizedEnum] || normalizedEnum;
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
    if (['personal', 'family', 'member'].includes(parameters.scope)) {
        baseFilters.scope = parameters.scope;
    }
    if (parameters.member) {
        baseFilters.member = String(parameters.member);
    }
    const categoryFilters = parameters.categoria ? { ...baseFilters, category: parameters.categoria } : baseFilters;
    const cardFilters = parameters.cartao ? { ...baseFilters, card: parameters.cartao } : baseFilters;
    const merchant = parameters.merchant || parameters.estabelecimento || parameters.descricao;
    const merchantFilters = merchant ? { ...cardFilters, merchant } : cardFilters;
    const debtTerm = parameters.divida || parameters.dividaNome || parameters.debt || parameters.credor || merchant;
    const debtFilters = debtTerm ? { ...baseFilters, debt: debtTerm } : baseFilters;
    const debtUpcomingFilters = parameters.dias
        ? {
            ...Object.fromEntries(Object.entries(baseFilters).filter(([key]) => key !== 'period')),
            status: 'upcoming',
            period: { type: 'relative', days: Number.parseInt(parameters.dias, 10) }
        }
        : { ...baseFilters, status: 'upcoming' };
    const originIsCard = normalizeText(parameters.origem || parameters.source || '') === 'cartao';
    const expenseDomain = originIsCard ? 'cards' : 'expenses';
    const expenseFilters = originIsCard ? cardFilters : baseFilters;
    const budgetFilters = {
        period: { type: 'cycle', label: 'ciclo atual' },
        ...(baseFilters.scope ? { scope: baseFilters.scope } : {}),
        ...(baseFilters.member ? { member: baseFilters.member } : {})
    };
    const goalFilters = {
        ...(baseFilters.scope ? { scope: baseFilters.scope } : {}),
        ...(baseFilters.member ? { member: baseFilters.member } : {}),
        ...(parameters.meta || parameters.goal ? { goal: parameters.meta || parameters.goal } : {}),
        ...(parameters.status ? { status: parameters.status } : {}),
        ...(parameters.source ? { source: parameters.source } : {})
    };
    const billTerm = parameters.conta || parameters.bill || parameters.descricao || '';
    const billFilters = {
        ...baseFilters,
        ...(billTerm ? { merchant: billTerm } : {}),
        ...(parameters.status ? { status: parameters.status } : {})
    };
    const billUpcomingFilters = {
        ...Object.fromEntries(Object.entries(baseFilters).filter(([key]) => key !== 'period')),
        status: 'upcoming',
        period: parameters.hoje ? { type: 'today', days: 1, label: 'today' } : {
            type: 'relative',
            days: Number.parseInt(parameters.dias || '7', 10) || 7,
            ...(parameters.amanha ? { label: 'tomorrow' } : {})
        }
    };

    const map = {
        total_gastos_mes: { domain: 'expenses', operation: 'sum', filters: baseFilters, timeBasis: 'billing_month' },
        total_gastos_categoria_mes: { domain: 'expenses', operation: 'sum', filters: categoryFilters, groupBy: ['category'], timeBasis: 'billing_month' },
        media_gastos_categoria_mes: { domain: 'expenses', operation: 'average', filters: categoryFilters, timeBasis: 'billing_month' },
        media_diaria_gastos_mes: { domain: 'expenses', operation: 'average', filters: baseFilters, groupBy: ['date'], timeBasis: 'billing_month' },
        total_gastos_multiplas_categorias: { domain: 'expenses', operation: 'sum', filters: { ...baseFilters, categories: parameters.categorias || [] }, groupBy: ['category'], timeBasis: 'billing_month' },
        percentual_categoria_gastos: { domain: 'expenses', operation: 'percentage', filters: categoryFilters, groupBy: ['category'], timeBasis: 'billing_month' },
        comparacao_gastos_categorias: { domain: 'expenses', operation: 'compare', filters: { ...baseFilters, categories: parameters.categorias || [] }, groupBy: ['category'], timeBasis: 'billing_month' },
        listagem_gastos_categoria: { domain: 'expenses', operation: 'list', filters: categoryFilters, answerStyle: 'detailed', timeBasis: 'billing_month' },
        contagem_ocorrencias: { domain: 'expenses', operation: 'count', filters: categoryFilters, timeBasis: 'billing_month' },
        contagem_lancamentos_saida: { domain: 'expenses', operation: 'count', filters: baseFilters, timeBasis: 'billing_month' },
        gastos_valores_duplicados: { domain: 'expenses', operation: 'detect', filters: baseFilters, timeBasis: 'billing_month' },
        maior_menor_gasto: { domain: 'expenses', operation: 'extreme', filters: baseFilters, timeBasis: 'billing_month' },
        maior_menor_gasto_categoria: { domain: 'expenses', operation: 'extreme', filters: categoryFilters, timeBasis: 'billing_month' },
        ranking_categorias_gastos: { domain: expenseDomain, operation: 'rank', filters: expenseFilters, groupBy: ['category'], timeBasis: 'billing_month' },
        tendencia_gastos_mensal: { domain: 'expenses', operation: 'trend', filters: baseFilters, groupBy: ['month'], answerStyle: 'detailed', timeBasis: 'billing_month' },
        comparacao_gastos_periodo: { domain: 'expenses', operation: 'compare', filters: baseFilters, timeBasis: 'billing_month' },
        detalhamento_gastos_mes: { domain: 'expenses', operation: 'detail', filters: baseFilters, groupBy: ['category', 'merchant'], answerStyle: 'detailed', timeBasis: 'billing_month' },
        ranking_estabelecimentos_gastos: { domain: expenseDomain, operation: 'rank', filters: expenseFilters, groupBy: ['merchant'], timeBasis: 'billing_month' },
        total_entradas_mes: { domain: 'income', operation: 'sum', filters: baseFilters, timeBasis: 'transaction_date' },
        total_entradas_categoria_mes: { domain: 'income', operation: 'sum', filters: categoryFilters, timeBasis: 'transaction_date' },
        listagem_entradas_mes: { domain: 'income', operation: 'list', filters: baseFilters, answerStyle: 'detailed', timeBasis: 'transaction_date' },
        detalhamento_entradas_mes: { domain: 'income', operation: 'detail', filters: baseFilters, groupBy: ['category', 'paymentMethod'], answerStyle: 'detailed', timeBasis: 'transaction_date' },
        ranking_fontes_entradas: { domain: 'income', operation: 'rank', filters: baseFilters, groupBy: ['category'], answerStyle: 'detailed', timeBasis: 'transaction_date' },
        ranking_formas_recebimento: { domain: 'income', operation: 'rank', filters: baseFilters, groupBy: ['paymentMethod'], answerStyle: 'detailed', timeBasis: 'transaction_date' },
        maior_menor_entrada: { domain: 'income', operation: 'extreme', filters: baseFilters, answerStyle: 'detailed', timeBasis: 'transaction_date' },
        contagem_entradas_mes: { domain: 'income', operation: 'count', filters: baseFilters, timeBasis: 'transaction_date' },
        media_entradas_mes: { domain: 'income', operation: 'average', filters: baseFilters, timeBasis: 'transaction_date' },
        percentual_categoria_entradas: { domain: 'income', operation: 'percentage', filters: categoryFilters, groupBy: ['category'], timeBasis: 'transaction_date' },
        comparacao_entradas_periodo: { domain: 'income', operation: 'compare', filters: baseFilters, timeBasis: 'transaction_date' },
        tendencia_entradas_mensal: { domain: 'income', operation: 'trend', filters: baseFilters, groupBy: ['month'], answerStyle: 'detailed', timeBasis: 'transaction_date' },
        detalhamento_cartao_mes: { domain: 'cards', operation: 'detail', filters: cardFilters, groupBy: ['card', 'category', 'merchant'], answerStyle: 'detailed' },
        total_fatura_cartao: { domain: 'cards', operation: 'sum', filters: cardFilters },
        total_faturas_por_cartao: { domain: 'cards', operation: 'group', filters: cardFilters, groupBy: ['card'] },
        total_cartoes_em_aberto: { domain: 'cards', operation: 'forecast', filters: cardFilters, groupBy: ['month'], answerStyle: 'detailed' },
        ranking_cartoes_em_aberto: { domain: 'cards', operation: 'rank', filters: baseFilters, groupBy: ['card'] },
        resumo_parcelamentos_cartao: { domain: 'cards', operation: 'list', filters: { ...cardFilters, status: 'active_installments' }, groupBy: ['card'], answerStyle: 'detailed' },
        maior_menor_compra_cartao: { domain: 'cards', operation: 'extreme', filters: { ...cardFilters, status: 'installment_purchase' }, answerStyle: 'detailed' },
        saldo_compra_parcelada_cartao: { domain: 'cards', operation: 'forecast', filters: { ...merchantFilters, status: 'active_installments' }, groupBy: ['month'], answerStyle: 'detailed' },
        total_transferencias_mes: { domain: 'transfers', operation: 'sum', filters: baseFilters, timeBasis: 'transaction_date' },
        listagem_transferencias_mes: { domain: 'transfers', operation: 'list', filters: baseFilters, answerStyle: 'detailed', timeBasis: 'transaction_date' },
        total_reserva_aplicada_mes: { domain: 'transfers', operation: 'sum', filters: { ...baseFilters, category: 'reserve_applied' }, timeBasis: 'transaction_date' },
        total_reserva_resgatada_mes: { domain: 'transfers', operation: 'sum', filters: { ...baseFilters, category: 'reserve_redeemed' }, timeBasis: 'transaction_date' },
        total_reserva_liquida_mes: { domain: 'transfers', operation: 'sum', filters: { ...baseFilters, category: 'reserve_net' }, timeBasis: 'transaction_date' },
        total_transferencias_contas_mes: { domain: 'transfers', operation: 'sum', filters: { ...baseFilters, category: 'own_transfer' }, timeBasis: 'transaction_date' },
        total_transferencias_familia_mes: { domain: 'transfers', operation: 'sum', filters: { ...baseFilters, category: 'family_transfer' }, groupBy: ['member'], timeBasis: 'transaction_date' },
        transferencia_familiar_eh_gasto: { domain: 'transfers', operation: 'explain', filters: { ...baseFilters, category: 'family_transfer' }, answerStyle: 'audit', timeBasis: 'transaction_date' },
        total_pagamentos_fatura_mes: { domain: 'transfers', operation: 'sum', filters: { ...baseFilters, category: 'invoice_payment' }, timeBasis: 'transaction_date' },
        saldo_do_mes: { domain: 'dashboard', operation: 'sum', filters: baseFilters },
        saldo_disponivel_estimado: { domain: 'transfers', operation: 'explain', filters: { ...baseFilters, category: 'availability' }, answerStyle: 'audit', timeBasis: 'transaction_date' },
        orcamento_disponivel_hoje: { domain: 'budget', operation: 'forecast', filters: budgetFilters, answerStyle: 'detailed', timeBasis: 'budget_cycle' },
        orcamento_usado_ciclo: { domain: 'budget', operation: 'sum', filters: budgetFilters, answerStyle: 'detailed', timeBasis: 'budget_cycle' },
        orcamento_explicacao: { domain: 'budget', operation: 'explain', filters: budgetFilters, answerStyle: 'audit', timeBasis: 'budget_cycle' },
        orcamento_ritmo_diario: { domain: 'budget', operation: 'forecast', filters: budgetFilters, answerStyle: 'detailed', timeBasis: 'budget_cycle' },
        orcamento_restante_ciclo: { domain: 'budget', operation: 'forecast', filters: budgetFilters, answerStyle: 'detailed', timeBasis: 'budget_cycle' },
        orcamento_escopo: { domain: 'budget', operation: 'explain', filters: budgetFilters, answerStyle: 'audit', timeBasis: 'budget_cycle' },
        resumo_metas: { domain: 'goals', operation: 'list', filters: goalFilters, answerStyle: 'detailed' },
        progresso_metas: { domain: 'goals', operation: 'explain', filters: goalFilters, answerStyle: 'detailed' },
        historico_meta: { domain: 'goals', operation: 'list', filters: { ...goalFilters, source: 'movements' }, answerStyle: 'audit', timeBasis: 'transaction_date' },
        total_aportes_meta: { domain: 'goals', operation: 'sum', filters: { ...goalFilters, source: 'contributions' }, answerStyle: 'audit', timeBasis: 'transaction_date' },
        total_retiradas_meta: { domain: 'goals', operation: 'sum', filters: { ...goalFilters, source: 'withdrawals' }, answerStyle: 'audit', timeBasis: 'transaction_date' },
        metas_por_status: { domain: 'goals', operation: 'list', filters: goalFilters, answerStyle: 'detailed' },
        ranking_metas: { domain: 'goals', operation: 'rank', filters: goalFilters, answerStyle: 'detailed' },
        media_progresso_metas: { domain: 'goals', operation: 'average', filters: goalFilters, answerStyle: 'detailed' },
        percentual_meta: { domain: 'goals', operation: 'percentage', filters: goalFilters, answerStyle: 'detailed' },
        comparacao_metas: { domain: 'goals', operation: 'compare', filters: goalFilters, answerStyle: 'detailed' },
        explicacao_meta: { domain: 'goals', operation: 'explain', filters: goalFilters, answerStyle: 'audit' },
        total_dividas: { domain: 'debts', operation: 'sum', filters: baseFilters, answerStyle: 'detailed' },
        saldo_divida: { domain: 'debts', operation: 'sum', filters: debtFilters, answerStyle: 'detailed' },
        parcelas_dividas_mes: { domain: 'debts', operation: 'list', filters: baseFilters, answerStyle: 'detailed' },
        dividas_vencendo: { domain: 'debts', operation: 'list', filters: debtUpcomingFilters, sort: { by: 'due_date', direction: 'asc' }, answerStyle: 'detailed' },
        dividas_atrasadas: { domain: 'debts', operation: 'list', filters: { ...baseFilters, status: 'overdue' }, sort: { by: 'overdue', direction: 'desc' }, answerStyle: 'detailed' },
        dividas_quitadas: { domain: 'debts', operation: 'list', filters: { ...baseFilters, status: 'paid' }, answerStyle: 'detailed' },
        ranking_dividas_juros: { domain: 'debts', operation: 'rank', filters: baseFilters, sort: { by: 'interest', direction: 'desc' }, answerStyle: 'detailed' },
        ranking_dividas_vencimento: { domain: 'debts', operation: 'rank', filters: baseFilters, sort: { by: 'due_date', direction: 'asc' }, answerStyle: 'detailed' },
        ranking_dividas_saldo: { domain: 'debts', operation: 'rank', filters: baseFilters, sort: { by: 'value', direction: 'desc' }, answerStyle: 'detailed' },
        prioridade_dividas: { domain: 'debts', operation: 'recommend', filters: baseFilters, sort: { by: 'interest', direction: 'desc' }, answerStyle: 'audit' },
        explicacao_dividas: { domain: 'debts', operation: 'explain', filters: debtFilters, answerStyle: 'audit' },
        contas_vencendo: { domain: 'bills', operation: 'list', filters: billUpcomingFilters, sort: { by: 'due_date', direction: 'asc' }, answerStyle: 'detailed', timeBasis: 'due_date' },
        resumo_contas_recorrentes: { domain: 'bills', operation: 'list', filters: billFilters, answerStyle: 'detailed', timeBasis: 'due_date' },
        status_conta_recorrente: { domain: 'bills', operation: 'explain', filters: billFilters, answerStyle: 'audit', timeBasis: 'due_date' },
        total_contas_recorrentes: { domain: 'bills', operation: 'sum', filters: billFilters, answerStyle: 'detailed', timeBasis: 'due_date' },
        comparacao_contas_realizado: { domain: 'bills', operation: 'compare', filters: billFilters, answerStyle: 'audit', timeBasis: 'due_date' },
        contas_pendentes: { domain: 'bills', operation: 'list', filters: { ...billFilters, status: 'pending' }, sort: { by: 'due_date', direction: 'asc' }, answerStyle: 'detailed', timeBasis: 'due_date' },
        explicacao_conta_recorrente: { domain: 'bills', operation: 'explain', filters: billFilters, answerStyle: 'audit', timeBasis: 'due_date' }
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
