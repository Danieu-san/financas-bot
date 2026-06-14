const { queryFinancialEventsPublicRows } = require('../services/sqliteReadModelService');
const { runSafeReadonlySql } = require('./safeReadonlySql');

const DEFAULT_EVENT_TYPES = [
    'expense',
    'card_expense',
    'income',
    'transfer',
    'goal',
    'debt',
    'bill'
];

function getScopedPublicRows({ userIds = [], personByUserId = {} } = {}) {
    return queryFinancialEventsPublicRows({ userIds, personByUserId });
}

function compareRecent(a, b) {
    const aKey = `${a.iso_date || ''} ${a.date || ''}`;
    const bKey = `${b.iso_date || ''} ${b.date || ''}`;
    return bKey.localeCompare(aKey);
}

async function listRecentTransactions({
    userIds = [],
    personByUserId = {},
    eventTypes = DEFAULT_EVENT_TYPES,
    limit = 5
} = {}) {
    const allowedTypes = new Set((eventTypes || DEFAULT_EVENT_TYPES).map(String));
    const rows = getScopedPublicRows({ userIds, personByUserId })
        .filter(row => allowedTypes.has(row.event_type))
        .sort(compareRecent)
        .slice(0, Math.max(1, Math.min(20, Number.parseInt(limit, 10) || 5)));
    return {
        ok: true,
        tool: 'list_recent_transactions',
        rows,
        metrics: rows.length === 1 ? { amount: rows[0].amount } : {},
        criteria: {
            sort: 'iso_date desc',
            limit: rows.length,
            eventTypes: Array.from(allowedTypes)
        }
    };
}

async function runSafeReadonlySqlTool({ sql, userIds = [], personByUserId = {}, limit = 50 } = {}) {
    const rows = getScopedPublicRows({ userIds, personByUserId });
    const result = runSafeReadonlySql(sql, { rows, maxRows: limit });
    return {
        ...result,
        tool: 'run_safe_readonly_sql'
    };
}

module.exports = {
    DEFAULT_EVENT_TYPES,
    getScopedPublicRows,
    listRecentTransactions,
    runSafeReadonlySqlTool
};
