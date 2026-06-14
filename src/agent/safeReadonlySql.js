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

function normalizeIdentifier(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9_]+/g, '');
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
    validateSafeReadonlySql,
    runSafeReadonlySql,
    __test__: {
        PUBLIC_COLUMNS
    }
};
