const { containsForbiddenModelKey } = require('./modelDataBoundary');

const ALLOWED_DOMAINS = new Set([
    'expenses', 'income', 'cards', 'transfers', 'budget', 'goals', 'debts',
    'bills', 'forecast', 'accounts', 'quality', 'imports', 'dashboard',
    'calendar', 'help'
]);
const ALLOWED_OPERATIONS = new Set([
    'sum', 'count', 'list', 'detail', 'group', 'rank', 'compare', 'trend',
    'average', 'percentage', 'extreme', 'explain', 'search', 'detect',
    'forecast', 'recommend'
]);
const ALLOWED_SCOPES = new Set(['personal', 'family', 'member']);
const ALLOWED_TIME_BASES = new Set([
    'transaction_date', 'purchase_date', 'billing_month', 'due_date',
    'budget_cycle', 'current_state', 'none', 'context'
]);
const ALLOWED_TOP_LEVEL = new Set([
    'kind', 'domain', 'operation', 'filters', 'groupBy', 'sort', 'limit',
    'timeBasis', 'needsContext', 'answerStyle'
]);
const ALLOWED_FILTERS = new Set([
    'period', 'scope', 'member', 'category', 'categories', 'subcategory',
    'merchant', 'paymentMethod', 'card', 'goal', 'debt', 'status', 'type',
    'account', 'recurrence', 'scenario', 'value'
]);
const ALLOWED_GROUP_BY = new Set([
    'category', 'subcategory', 'member', 'merchant', 'payment_method', 'card',
    'account', 'period'
]);
const ALLOWED_SORT_BY = new Set(['value', 'date', 'name', 'count']);
const ALLOWED_SORT_DIRECTIONS = new Set(['asc', 'desc']);
const ALLOWED_ANSWER_STYLES = new Set(['short', 'detailed', 'table']);
function normalizeIdentifier(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function normalizeFinancialQueryPlan(input) {
    const errors = [];
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { ok: false, plan: null, errors: ['plan_must_be_object'] };
    }
    if (containsForbiddenModelKey(input)) {
        return { ok: false, plan: null, errors: ['caller_identity_or_internal_field_forbidden'] };
    }

    const unknownTopLevel = Object.keys(input).filter(key => !ALLOWED_TOP_LEVEL.has(key));
    if (unknownTopLevel.length > 0) errors.push('unknown_plan_field');

    const domain = normalizeIdentifier(input.domain);
    const operation = normalizeIdentifier(input.operation);
    const timeBasis = normalizeIdentifier(input.timeBasis || 'transaction_date');
    const kind = normalizeIdentifier(input.kind || 'financial_query');
    if (kind !== 'financial_query') errors.push('invalid_plan_kind');
    if (!ALLOWED_DOMAINS.has(domain)) errors.push('invalid_plan_domain');
    if (!ALLOWED_OPERATIONS.has(operation)) errors.push('invalid_plan_operation');
    if (!ALLOWED_TIME_BASES.has(timeBasis)) errors.push('invalid_time_basis');

    const filters = input.filters && typeof input.filters === 'object' && !Array.isArray(input.filters)
        ? { ...input.filters }
        : {};
    if (Object.keys(filters).some(key => !ALLOWED_FILTERS.has(key))) errors.push('unknown_filter');
    if (filters.scope !== undefined && !ALLOWED_SCOPES.has(normalizeIdentifier(filters.scope))) {
        errors.push('invalid_scope');
    }
    const groupBy = Array.isArray(input.groupBy)
        ? [...new Set(input.groupBy.map(normalizeIdentifier))]
        : [];
    if (groupBy.some(value => !ALLOWED_GROUP_BY.has(value))) errors.push('invalid_group_by');

    const sortInput = input.sort && typeof input.sort === 'object' && !Array.isArray(input.sort)
        ? input.sort
        : { by: 'value', direction: 'desc' };
    if (Object.keys(sortInput).some(key => !['by', 'direction'].includes(key))) errors.push('invalid_sort');
    const sort = {
        by: normalizeIdentifier(sortInput.by || 'value'),
        direction: normalizeIdentifier(sortInput.direction || 'desc')
    };
    if (!ALLOWED_SORT_BY.has(sort.by) || !ALLOWED_SORT_DIRECTIONS.has(sort.direction)) errors.push('invalid_sort');
    const answerStyle = normalizeIdentifier(input.answerStyle || 'short');
    if (!ALLOWED_ANSWER_STYLES.has(answerStyle)) errors.push('invalid_answer_style');
    if (errors.length > 0) return { ok: false, plan: null, errors };

    if (filters.scope !== undefined) filters.scope = normalizeIdentifier(filters.scope);
    const parsedLimit = Number.parseInt(input.limit ?? '10', 10);
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 50)
        : 10;
    return {
        ok: true,
        errors: [],
        plan: {
            kind: 'financial_query',
            domain,
            operation,
            filters,
            groupBy,
            sort,
            limit,
            timeBasis,
            needsContext: input.needsContext === true,
            answerStyle
        }
    };
}

module.exports = {
    normalizeFinancialQueryPlan
};
