const crypto = require('node:crypto');

const { normalizeText } = require('../utils/helpers');
const {
    getBudgetCycleForDate,
    dateIsWithinCycle
} = require('../utils/budgetCycle');

const ALLOWED_SCOPE_TYPES = new Set(['family', 'personal']);
const ALLOWED_ALLOCATION_STATUSES = new Set(['active', 'inactive']);
const SPENDING_KINDS = new Set(['expense', 'card_purchase', 'reimbursement', 'refund', 'chargeback']);
const COMPENSATION_KINDS = new Set(['reimbursement', 'refund', 'chargeback']);

function fail(code) {
    const error = new Error(code);
    error.code = code;
    throw error;
}

function normalizeKey(value) {
    return normalizeText(String(value || '').trim()).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseIsoDate(value, field) {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) fail(`${field}_invalid`);
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
    if (
        date.getFullYear() !== Number(match[1]) ||
        date.getMonth() !== Number(match[2]) - 1 ||
        date.getDate() !== Number(match[3])
    ) fail(`${field}_invalid`);
    return date;
}

function formatIsoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function categoryCatalog(categories = []) {
    const catalog = new Map();
    for (const item of categories) {
        const category = String(item?.category || '').trim();
        const categoryKey = normalizeKey(category);
        if (!categoryKey) continue;
        const subcategories = new Map();
        for (const subcategoryValue of item.subcategories || []) {
            const subcategory = String(subcategoryValue || '').trim();
            const subcategoryKey = normalizeKey(subcategory);
            if (subcategoryKey) subcategories.set(subcategoryKey, subcategory);
        }
        catalog.set(categoryKey, { category, subcategories });
    }
    return catalog;
}

function allocationIdentity(input) {
    return [
        input.householdId,
        input.scopeType,
        input.scopeId,
        input.cycleStart,
        input.categoryKey,
        input.subcategoryKey
    ].join('|');
}

function buildBudgetAllocation(input = {}, { categories = [] } = {}) {
    const householdId = String(input.householdId || '').trim();
    const scopeType = normalizeKey(input.scopeType);
    const scopeId = String(input.scopeId || '').trim();
    const cycleStart = String(input.cycleStart || '').trim();
    const cycleEnd = String(input.cycleEnd || '').trim();
    const requestedCategoryKey = normalizeKey(input.category);
    const requestedSubcategoryKey = normalizeKey(input.subcategory);
    const status = normalizeKey(input.status || 'active');
    const plannedAmountCents = Number(input.plannedAmountCents);

    if (!householdId) fail('household_id_required');
    if (!ALLOWED_SCOPE_TYPES.has(scopeType)) fail('scope_type_invalid');
    if (!scopeId) fail('scope_id_required');
    const startDate = parseIsoDate(cycleStart, 'cycle_start');
    const endDate = parseIsoDate(cycleEnd, 'cycle_end');
    if (startDate > endDate) fail('cycle_range_invalid');
    if (!Number.isInteger(plannedAmountCents) || plannedAmountCents < 0) fail('planned_amount_cents_invalid');
    if (!ALLOWED_ALLOCATION_STATUSES.has(status)) fail('allocation_status_invalid');

    const catalog = categoryCatalog(categories);
    const categoryEntry = catalog.get(requestedCategoryKey);
    if (!categoryEntry) fail('category_not_found');
    let subcategory = '';
    if (requestedSubcategoryKey) {
        subcategory = categoryEntry.subcategories.get(requestedSubcategoryKey) || '';
        if (!subcategory) fail('subcategory_not_found');
    }

    const normalized = {
        householdId,
        scopeType,
        scopeId,
        cycleStart,
        cycleEnd,
        categoryKey: requestedCategoryKey,
        category: categoryEntry.category,
        subcategoryKey: requestedSubcategoryKey,
        subcategory,
        plannedAmountCents,
        status
    };
    const stableId = crypto.createHash('sha256').update(allocationIdentity(normalized)).digest('hex').slice(0, 24);
    return {
        allocationId: `budget_allocation_${stableId}`,
        ...normalized
    };
}

function scopeMatches(value = {}, scope = {}) {
    if (String(value.household_id || value.householdId || '') !== String(scope.householdId || '')) return false;
    if (scope.type === 'personal') {
        return String(value.owner_person_id || value.personId || '') === String(scope.personId || '');
    }
    const members = new Set((scope.memberIds || []).map(item => String(item || '')));
    const owner = String(value.owner_person_id || value.personId || '');
    return members.size === 0 || !owner || members.has(owner);
}

function allocationMatchesScope(allocation = {}, scope = {}) {
    return allocation.householdId === scope.householdId &&
        allocation.scopeType === scope.type &&
        allocation.scopeId === (scope.type === 'family' ? scope.householdId : scope.personId);
}

function eventImpactDate(event = {}) {
    const value = event.budget_impact_on || event.budgetImpactOn || event.due_on || event.dueOn ||
        event.effective_on || event.effectiveOn || event.date;
    try {
        return parseIsoDate(value, 'event_date');
    } catch (error) {
        return null;
    }
}

function eventBudgetImpactCents(event = {}) {
    const explicit = Number(event.net_income_expense_impact ?? event.netIncomeExpenseImpact);
    if (Number.isFinite(explicit)) return Math.round(explicit);
    const amount = Math.round(Number(event.amount_cents ?? event.amountCents ?? 0));
    return COMPENSATION_KINDS.has(String(event.kind || '')) ? -Math.abs(amount) : Math.abs(amount);
}

function eventCountsInBudget(event = {}, cycle = {}, scope = {}) {
    if (!scopeMatches(event, scope)) return false;
    if (!SPENDING_KINDS.has(String(event.kind || ''))) return false;
    if (!(event.free_budget_eligible === true || event.free_budget_eligible === 1 || event.freeBudgetEligible === true)) return false;
    if (
        String(event.source_type || event.sourceType || '') === 'import' &&
        String(event.reconciliation_status || event.reconciliationStatus || '') === 'matched'
    ) return false;
    const date = eventImpactDate(event);
    return Boolean(date && dateIsWithinCycle(date, cycle));
}

function unavailableResult({ sourceHealth, cycle, scope }) {
    return {
        status: sourceHealth === 'unavailable' ? 'unavailable' : 'partial',
        sourceHealth,
        scope: { ...scope },
        cycle: { start: formatIsoDate(cycle.start), end: formatIsoDate(cycle.end) },
        globalBudgetCents: null,
        allocatedBudgetCents: null,
        unallocatedBudgetCents: null,
        overallocatedBudgetCents: null,
        actualBudgetCents: null,
        remainingBudgetCents: null,
        categories: []
    };
}

function calculateCategoryBudget({
    globalBudget = {},
    referenceDate,
    cycleStartDay = 1,
    scope = {},
    categories = [],
    allocations = [],
    events = []
} = {}) {
    if (!ALLOWED_SCOPE_TYPES.has(scope.type)) fail('scope_type_invalid');
    if (!scope.householdId) fail('household_id_required');
    if (scope.type === 'personal' && !scope.personId) fail('person_id_required');
    const reference = parseIsoDate(referenceDate, 'reference_date');
    const cycle = getBudgetCycleForDate({
        year: reference.getFullYear(),
        month: reference.getMonth(),
        day: reference.getDate()
    }, cycleStartDay);
    const sourceHealth = String(globalBudget.sourceHealth || 'unavailable');
    if (!globalBudget.active || !Number.isInteger(globalBudget.amountCents) || !['available', 'partial'].includes(sourceHealth)) {
        return unavailableResult({ sourceHealth, cycle, scope });
    }

    const catalog = categoryCatalog(categories);
    const cycleStart = formatIsoDate(cycle.start);
    const cycleEnd = formatIsoDate(cycle.end);
    const activeAllocations = allocations.filter(item =>
        item.status === 'active' &&
        item.cycleStart === cycleStart &&
        item.cycleEnd === cycleEnd &&
        allocationMatchesScope(item, scope)
    );
    for (const item of activeAllocations) {
        const categoryEntry = catalog.get(item.categoryKey);
        if (!categoryEntry) fail('category_not_found');
        if (item.subcategoryKey && !categoryEntry.subcategories.has(item.subcategoryKey)) fail('subcategory_not_found');
    }

    const rowsByKey = new Map();
    const categoryLevelKeys = new Set(activeAllocations.filter(item => !item.subcategoryKey).map(item => item.categoryKey));
    for (const item of activeAllocations) {
        const key = `${item.categoryKey}|${item.subcategoryKey}`;
        rowsByKey.set(key, {
            categoryKey: item.categoryKey,
            category: item.category,
            subcategoryKey: item.subcategoryKey,
            subcategory: item.subcategory,
            allocationStatus: 'allocated',
            plannedAmountCents: item.plannedAmountCents,
            actualAmountCents: 0,
            remainingAmountCents: item.plannedAmountCents,
            status: item.status
        });
    }

    const countedEvents = events.filter(item => eventCountsInBudget(item, cycle, scope));
    for (const item of countedEvents) {
        const categoryKey = normalizeKey(item.category);
        const subcategoryKey = normalizeKey(item.subcategory);
        const targetSubcategoryKey = categoryLevelKeys.has(categoryKey) ? '' : subcategoryKey;
        const key = `${categoryKey}|${targetSubcategoryKey}`;
        const catalogEntry = catalog.get(categoryKey);
        const row = rowsByKey.get(key) || {
            categoryKey,
            category: catalogEntry?.category || String(item.category || '').trim() || 'Sem categoria',
            subcategoryKey: targetSubcategoryKey,
            subcategory: targetSubcategoryKey ? catalogEntry?.subcategories.get(targetSubcategoryKey) || String(item.subcategory || '').trim() : '',
            allocationStatus: 'unallocated',
            plannedAmountCents: null,
            actualAmountCents: 0,
            remainingAmountCents: null,
            status: 'active'
        };
        row.actualAmountCents += eventBudgetImpactCents(item);
        if (row.plannedAmountCents !== null) row.remainingAmountCents = row.plannedAmountCents - row.actualAmountCents;
        rowsByKey.set(key, row);
    }

    const allocatedBudgetCents = activeAllocations.reduce((sum, item) => sum + item.plannedAmountCents, 0);
    const actualBudgetCents = countedEvents.reduce((sum, item) => sum + eventBudgetImpactCents(item), 0);
    const globalBudgetCents = globalBudget.amountCents;
    return {
        status: sourceHealth,
        sourceHealth,
        scope: { ...scope },
        cycle: { start: cycleStart, end: cycleEnd },
        globalBudgetCents,
        allocatedBudgetCents,
        unallocatedBudgetCents: Math.max(0, globalBudgetCents - allocatedBudgetCents),
        overallocatedBudgetCents: Math.max(0, allocatedBudgetCents - globalBudgetCents),
        actualBudgetCents,
        remainingBudgetCents: globalBudgetCents - actualBudgetCents,
        categories: Array.from(rowsByKey.values()).sort((left, right) =>
            left.category.localeCompare(right.category, 'pt-BR') || left.subcategory.localeCompare(right.subcategory, 'pt-BR')
        )
    };
}

module.exports = {
    buildBudgetAllocation,
    calculateCategoryBudget,
    __test__: {
        eventBudgetImpactCents,
        eventCountsInBudget,
        normalizeKey
    }
};
