const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const {
    DEFAULT_DB_PATH
} = require('./canonicalLedgerShadowStore');
const {
    buildCanonicalLedgerRolloutPolicy
} = require('./canonicalLedgerRolloutPolicy');

function tableExists(db, tableName) {
    return Boolean(db.prepare(`
        SELECT 1
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
        LIMIT 1
    `).get(tableName));
}

function ownerFilter(ownerPersonIds = [], alias = 'e') {
    const ids = Array.from(new Set((ownerPersonIds || [])
        .map(value => String(value || '').trim())
        .filter(Boolean)));
    return {
        ids,
        clause: ids.length > 0
            ? `AND ${alias}.owner_person_id IN (${ids.map(() => '?').join(', ')})`
            : 'AND 1 = 0'
    };
}

function selectedEventsCte(filter) {
    return `
        WITH ranked_events AS (
            SELECT e.run_id, e.event_id, e.event_json,
                ROW_NUMBER() OVER (
                    PARTITION BY e.event_id
                    ORDER BY r.created_at DESC, e.updated_at DESC, e.run_id DESC
                ) AS row_rank
            FROM canonical_ledger_events e
            JOIN canonical_ledger_projection_runs r ON r.run_id = e.run_id
            WHERE r.report_type = ?
                AND r.synthetic_fixture_only = 0
                ${filter.clause}
        ),
        selected_events AS (
            SELECT run_id, event_id, event_json
            FROM ranked_events
            WHERE row_rank = 1
        )
    `;
}

function readEvents(db, filter) {
    return db.prepare(`
        ${selectedEventsCte(filter)}
        SELECT run_id, event_id, event_json
        FROM selected_events
        ORDER BY event_id
    `).all('canonical_ledger_receipt_shadow', ...filter.ids).map(row => {
        const parsed = JSON.parse(row.event_json);
        return {
            ...parsed,
            event_id: row.event_id,
            __quality_run_id: row.run_id
        };
    });
}

function readLines(db, filter) {
    return db.prepare(`
        ${selectedEventsCte(filter)}
        SELECT l.event_id, l.line_type, l.account_id
        FROM canonical_ledger_event_lines l
        JOIN selected_events e ON e.run_id = l.run_id AND e.event_id = l.event_id
        ORDER BY l.event_id, l.line_id
    `).all('canonical_ledger_receipt_shadow', ...filter.ids);
}

function readReconciliationLinks(db, filter) {
    if (!tableExists(db, 'canonical_ledger_reconciliation_links')) return [];
    return db.prepare(`
        ${selectedEventsCte(filter)}
        SELECT l.event_id, l.link_type, l.status
        FROM canonical_ledger_reconciliation_links l
        JOIN selected_events e ON e.run_id = l.run_id AND e.event_id = l.event_id
        ORDER BY l.event_id, l.link_id
    `).all('canonical_ledger_receipt_shadow', ...filter.ids);
}

function actorHash(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 32);
}

function readStatementReconciliationLinks(db, ownerPersonIds = []) {
    if (!tableExists(db, 'canonical_ledger_statement_reconciliation_links')) return [];
    const hashes = Array.from(new Set((ownerPersonIds || [])
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .map(actorHash)));
    if (hashes.length === 0) return [];
    return db.prepare(`
        SELECT decision_status, confirmed_at
        FROM canonical_ledger_statement_reconciliation_links
        WHERE actor_hash IN (${hashes.map(() => '?').join(', ')})
        ORDER BY confirmed_at, link_id
    `).all(...hashes);
}

function readCanonicalDataQualitySource({
    env = process.env,
    dbPath = env.CANONICAL_LEDGER_SHADOW_DB_PATH || DEFAULT_DB_PATH,
    ownerPersonIds = []
} = {}) {
    const policy = buildCanonicalLedgerRolloutPolicy(env);
    if (!policy.canReadDomain('transactions')) {
        return { enabled: false, reason: 'canonical_transactions_unavailable' };
    }
    const filter = ownerFilter(ownerPersonIds);
    if (filter.ids.length === 0) {
        return { enabled: false, reason: 'missing_authorized_scope' };
    }

    let db;
    try {
        db = new Database(dbPath, { readonly: true, fileMustExist: true });
        if (!tableExists(db, 'canonical_ledger_events') || !tableExists(db, 'canonical_ledger_event_lines')) {
            return { enabled: false, reason: 'canonical_quality_tables_unavailable' };
        }
        const events = readEvents(db, filter);
        return {
            enabled: true,
            source: 'canonical',
            sourceHealth: 'partial',
            events,
            lines: readLines(db, filter),
            reconciliationLinks: readReconciliationLinks(db, filter),
            statementReconciliationLinks: readStatementReconciliationLinks(db, filter.ids)
        };
    } catch (_error) {
        return { enabled: false, reason: 'canonical_quality_read_failed' };
    } finally {
        if (db) db.close();
    }
}

module.exports = {
    readCanonicalDataQualitySource,
    __test__: {
        actorHash,
        ownerFilter,
        tableExists
    }
};
