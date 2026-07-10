const Database = require('better-sqlite3');

const ALLOWED_TABLES = new Set(['financial_events_public']);
const BLOCKED_SQL_PATTERNS = [
    /\b(insert|update|delete|drop|alter|create|replace|truncate|vacuum|reindex)\b/i,
    /\b(pragma|attach|detach|begin|commit|rollback|savepoint|release)\b/i,
    /\b(with|recursive|union|intersect|except|join)\b/i,
    /\b(load_extension|randomblob|zeroblob)\b/i,
    /--|\/\*|\*\//,
    /;/
];
const BLOCKED_IDENTIFIERS = [
    'user_id',
    'userid',
    'sheet_id',
    'sheetid',
    'spreadsheetid',
    'spreadsheet_id',
    'token',
    'secret',
    'prompt',
    'rawrows',
    'rawdata',
    'oauth',
    'credential',
    'password',
    'owner_hash'
];

const PUBLIC_COLUMNS = [
    'date',
    'iso_date',
    'year',
    'month',
    'weekday',
    'event_type',
    'amount',
    'description',
    'category',
    'subcategory',
    'person',
    'payment_method',
    'card',
    'billing_month',
    'due_date',
    'source'
];
const ALLOWED_SQL_KEYWORDS = new Set([
    'select',
    'from',
    'where',
    'and',
    'or',
    'not',
    'in',
    'is',
    'null',
    'between',
    'like',
    'glob',
    'group',
    'by',
    'having',
    'order',
    'asc',
    'desc',
    'limit',
    'as',
    'distinct',
    'case',
    'when',
    'then',
    'else',
    'end',
    'collate',
    'nocase'
]);
const ALLOWED_SQL_FUNCTIONS = new Set([
    'sum',
    'count',
    'avg',
    'min',
    'max',
    'round',
    'abs',
    'lower',
    'upper',
    'coalesce',
    'ifnull'
]);
function normalizeIdentifier(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9_]+/g, '');
}

function stripSqlStringLiterals(sql = '') {
    return String(sql || '').replace(/'([^']|'')*'/g, ' ');
}

function extractSelectSegment(sql = '') {
    const match = String(sql || '').match(/^select\s+([\s\S]+?)\s+from\b/i);
    return match ? match[1] : '';
}

function validatePublicColumns(sql) {
    const selectSegment = extractSelectSegment(sql);
    if (!selectSegment) return { ok: false, reason: 'missing_select_list' };
    const selectWithoutCountStar = selectSegment.replace(/\bcount\s*\(\s*\*\s*\)/gi, 'count_all');
    if (/(^|,)\s*\*/.test(selectWithoutCountStar)) {
        return { ok: false, reason: 'public_column_not_allowed' };
    }

    const withoutStrings = stripSqlStringLiterals(sql).replace(/\bcount\s*\(\s*\*\s*\)/gi, 'count');
    const aliases = new Set();
    const aliasPattern = /\bas\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    let aliasMatch;
    while ((aliasMatch = aliasPattern.exec(withoutStrings)) !== null) {
        aliases.add(normalizeIdentifier(aliasMatch[1]));
    }

    const allowedIdentifiers = new Set([
        ...PUBLIC_COLUMNS,
        ...ALLOWED_SQL_KEYWORDS,
        ...ALLOWED_SQL_FUNCTIONS,
        ...aliases,
        'financial_events_public',
        'main',
        'temp'
    ].map(normalizeIdentifier));

    const tokens = withoutStrings.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    for (const token of tokens) {
        const identifier = normalizeIdentifier(token);
        if (!allowedIdentifiers.has(identifier)) {
            return { ok: false, reason: 'public_column_not_allowed', identifier };
        }
    }
    return { ok: true };
}
function validateSafeReadonlySql(sql, { maxLimit = 100 } = {}) {
    const text = String(sql || '').trim();
    if (!text) return { ok: false, reason: 'empty_sql' };
    if (!/^select\b/i.test(text)) return { ok: false, reason: 'only_select_allowed' };
    for (const pattern of BLOCKED_SQL_PATTERNS) {
        if (pattern.test(text)) return { ok: false, reason: 'blocked_sql_token' };
    }
    for (const identifier of BLOCKED_IDENTIFIERS) {
        const pattern = new RegExp(`\\b${identifier}\\b`, 'i');
        if (pattern.test(text)) return { ok: false, reason: 'blocked_identifier' };
    }
    const referencedTables = [];
    const tablePattern = /\b(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_\.]*)/gi;
    let match;
    while ((match = tablePattern.exec(text)) !== null) {
        referencedTables.push(match[1].replace(/^main\./i, '').replace(/^temp\./i, ''));
    }
    if (referencedTables.length === 0) return { ok: false, reason: 'missing_public_table' };
    if (referencedTables.length > 1) return { ok: false, reason: 'single_public_table_only' };
    const invalidTable = referencedTables.find(table => !ALLOWED_TABLES.has(normalizeIdentifier(table)));
    if (invalidTable) return { ok: false, reason: 'table_not_allowed' };
    const publicColumns = validatePublicColumns(text);
    if (!publicColumns.ok) return publicColumns;
    const limitMatch = text.match(/\blimit\s+(\d+)\b/i);
    if (!limitMatch) return { ok: false, reason: 'limit_required' };
    const requestedLimit = Number.parseInt(limitMatch[1], 10);
    if (!Number.isFinite(requestedLimit) || requestedLimit < 1) return { ok: false, reason: 'invalid_limit' };
    if (requestedLimit > maxLimit) return { ok: false, reason: 'limit_too_high' };
    return { ok: true };
}

function createSandboxDb(rows = []) {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE financial_events_public (
            date TEXT,
            iso_date TEXT,
            year INTEGER,
            month INTEGER,
            weekday TEXT,
            event_type TEXT,
            amount REAL,
            description TEXT,
            category TEXT,
            subcategory TEXT,
            person TEXT,
            payment_method TEXT,
            card TEXT,
            billing_month TEXT,
            due_date TEXT,
            source TEXT
        );
    `);
    const stmt = db.prepare(`
        INSERT INTO financial_events_public(${PUBLIC_COLUMNS.join(', ')})
        VALUES(${PUBLIC_COLUMNS.map(column => `@${column}`).join(', ')})
    `);
    const insertMany = db.transaction((items) => {
        for (const row of items) {
            stmt.run(Object.fromEntries(PUBLIC_COLUMNS.map(column => [column, row[column] ?? ''])));
        }
    });
    insertMany(rows);
    db.pragma('query_only = ON');
    return db;
}

function runSafeReadonlySql(sql, { rows = [], maxRows = 50 } = {}) {
    const validation = validateSafeReadonlySql(sql, { maxLimit: maxRows });
    if (!validation.ok) return { ok: false, reason: validation.reason, rows: [] };
    const db = createSandboxDb(rows);
    try {
        const resultRows = db.prepare(sql).all();
        return {
            ok: true,
            rows: resultRows.slice(0, maxRows),
            rowCount: Math.min(resultRows.length, maxRows),
            truncated: resultRows.length > maxRows,
            criteria: {
                source: 'financial_events_public',
                readOnly: true
            }
        };
    } catch (error) {
        return { ok: false, reason: 'sql_execution_failed', error: error.message, rows: [] };
    } finally {
        db.close();
    }
}

module.exports = {
    PUBLIC_COLUMNS,
    validateSafeReadonlySql,
    runSafeReadonlySql,
    __test__: {
        PUBLIC_COLUMNS,
        validatePublicColumns
    }
};
