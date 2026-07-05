const {
    projectLegacyRowsToCanonicalLedger,
    buildCanonicalPublicProjection
} = require('./canonicalLedgerProjector');

const SCHEMA_VERSION = 'canonical-ledger-v1';
const REPORT_TYPE = 'canonical_ledger_dry_run';
const PRIVACY_PATTERN = /\b(user_id|sheet_id|spreadsheet|token|oauth|prompt|rawRows|raw_rows|source_row_hash|source_id_hash|idempotency_key|person-[a-z0-9-]+)\b/i;

function countLegacyRows(legacyRows = {}) {
    const keys = [
        'contas',
        'saidas',
        'entradas',
        'transferencias',
        'lancamentosCartao',
        'dividas',
        'pagamentosDividas',
        'metas',
        'movimentacoesMetas',
        'importedTransactions'
    ];
    const counts = {};
    for (const key of keys) {
        counts[key] = Array.isArray(legacyRows[key]) ? legacyRows[key].length : 0;
    }
    counts.total_rows = keys.reduce((sum, key) => sum + counts[key], 0);
    return counts;
}

function emptyBucket() {
    return {
        count: 0,
        amount_cents: 0,
        net_income_expense_impact_cents: 0
    };
}

function addToBucket(map, key, event) {
    const safeKey = key || 'unknown';
    if (!map[safeKey]) map[safeKey] = emptyBucket();
    map[safeKey].count += 1;
    map[safeKey].amount_cents += event.amount_cents || 0;
    map[safeKey].net_income_expense_impact_cents += event.net_income_expense_impact || 0;
}

function summarizeEvents(events = []) {
    return events.reduce((acc, event) => {
        addToBucket(acc.byKind, event.kind, event);
        addToBucket(acc.byStatus, event.status, event);
        addToBucket(acc.byCompetence, event.competence_month, event);
        return acc;
    }, {
        byKind: {},
        byStatus: {},
        byCompetence: {}
    });
}

function summarizeWarnings(warnings = []) {
    return warnings.reduce((acc, warning) => {
        const key = warning.code || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
}

function sourceCoverage(projected = {}, sourceCounts = {}) {
    const sourceRefs = new Set((projected.events || []).map(event => event.source_row_ref).filter(Boolean));
    const missingCount = Math.max(0, sourceCounts.total_rows - sourceRefs.size);
    const duplicateCount = Math.max(0, (projected.events || []).length - sourceRefs.size);
    const differences = [];
    if (missingCount > 0) {
        differences.push({
            code: 'source_rows_without_event',
            count: missingCount
        });
    }
    if (duplicateCount > 0) {
        differences.push({
            code: 'duplicate_events_for_source',
            count: duplicateCount
        });
    }
    return differences;
}

function scanPublicProjection(publicProjection = []) {
    const leaks = [];
    publicProjection.forEach((row, index) => {
        const serialized = JSON.stringify(row);
        const match = serialized.match(PRIVACY_PATTERN);
        if (match) {
            leaks.push({
                row: index,
                pattern: match[1]
            });
        }
    });
    return {
        ok: leaks.length === 0,
        rows_scanned: publicProjection.length,
        leaks
    };
}

function buildCanonicalLedgerParityReport(input = {}, options = {}) {
    const startedAt = options.startedAt || new Date().toISOString();
    const projected = projectLegacyRowsToCanonicalLedger(input);
    const publicProjection = buildCanonicalPublicProjection(projected, input);
    const finishedAt = options.finishedAt || new Date().toISOString();
    const sourceCounts = countLegacyRows(input.legacyRows || {});
    const summaries = summarizeEvents(projected.events);

    return {
        report_type: REPORT_TYPE,
        schema_version: SCHEMA_VERSION,
        run_id: options.runId || `LEDGER_DRY_RUN_${startedAt.replace(/\D/g, '').slice(0, 14)}`,
        started_at: startedAt,
        finished_at: finishedAt,
        synthetic_fixture_only: true,
        source_counts: sourceCounts,
        canonical_counts: {
            events: projected.events.length,
            lines: projected.lines.length,
            schedules: projected.schedules.length,
            recurrence_rules: (projected.recurrenceRules || []).length,
            recurrence_occurrences: (projected.recurrenceOccurrences || []).length,
            reconciliation_links: projected.reconciliationLinks.length,
            warnings: projected.warnings.length,
            public_projection_rows: publicProjection.length
        },
        totals_by_kind: summaries.byKind,
        totals_by_status: summaries.byStatus,
        totals_by_competence: summaries.byCompetence,
        warning_summary: summarizeWarnings(projected.warnings),
        unexplained_differences: sourceCoverage(projected, sourceCounts),
        privacy_scan: scanPublicProjection(publicProjection)
    };
}

module.exports = {
    REPORT_TYPE,
    SCHEMA_VERSION,
    buildCanonicalLedgerParityReport,
    scanPublicProjection
};
