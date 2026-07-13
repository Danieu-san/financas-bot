const {
    projectLegacyPlanSheets,
    __test__: { moneyToCents, normalizeDate, stableStringify }
} = require('./projectedPlansContract');
const { ProjectedPlansStore } = require('./projectedPlansStore');
const { goalRowToObject, buildGoalIndexes, normalizeGoalStatus, GOAL_STATUS } = require('../services/goalService');
const { __test__: { normalizeDebtRow } } = require('../planning/financialCommandContextTools');

const REPORT_SCHEMA_VERSION = 'projected-plans-parity-report-v1';

function normalizeText(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function findHeaderIndex(headers = [], aliases = []) {
    const accepted = new Set(aliases.map(normalizeText));
    return headers.findIndex(header => accepted.has(normalizeText(header)));
}

function meaningfulEntries(rows = []) {
    if (!Array.isArray(rows) || rows.length < 2) return [];
    return rows.slice(1)
        .map((row, offset) => ({ row: Array.isArray(row) ? row : [], rowIndex: offset + 2 }))
        .filter(entry => entry.row.some(value => String(value ?? '').trim() !== ''));
}

function isObserved(value) {
    return String(value ?? '').trim() !== '';
}

function planStatus(value) {
    const status = normalizeText(value);
    if (status.includes('cancel')) return 'cancelled';
    if (status.includes('paus')) return 'paused';
    if (status.includes('quit') || status.includes('conclu') || status.includes('finaliz') || status.includes('atingid')) return 'completed';
    return 'active';
}

function legacyGoalStatus(value) {
    const status = normalizeGoalStatus(value);
    if (status === GOAL_STATUS.CANCELLED) return 'cancelled';
    if (status === GOAL_STATUS.PAUSED) return 'paused';
    if (status === GOAL_STATUS.COMPLETED) return 'completed';
    return 'active';
}

function debtType(value) {
    const type = normalizeText(value);
    if (type.includes('financi')) return 'financing';
    if (type.includes('consor')) return 'consortium';
    return 'debt';
}

function newComparison() {
    return { compared_field_count: 0, mismatch_count: 0, missing_projection_count: 0 };
}

function compare(comparison, actual, expected, { observed = true } = {}) {
    if (!observed) return;
    comparison.compared_field_count += 1;
    if (actual !== expected) comparison.mismatch_count += 1;
}

function compareGoalViews(metasData, plansByRef) {
    const headers = metasData[0] || [];
    const idx = buildGoalIndexes(headers);
    const comparison = newComparison();
    for (const entry of meaningfulEntries(metasData)) {
        const plan = plansByRef.get(`sheet.metas:row:${entry.rowIndex}`);
        if (!plan) {
            comparison.missing_projection_count += 1;
            continue;
        }
        const view = goalRowToObject(entry.row, entry.rowIndex, headers);
        compare(comparison, plan.amounts.target_cents, moneyToCents(view.target), { observed: isObserved(entry.row[idx.target]) });
        compare(comparison, plan.amounts.current_cents, moneyToCents(view.current), { observed: isObserved(entry.row[idx.current]) });
        compare(comparison, plan.terms.target_on, normalizeDate(view.targetDate), { observed: isObserved(entry.row[idx.targetDate]) });
        compare(comparison, plan.status, legacyGoalStatus(entry.row[idx.status]));
        compare(comparison, plan.scope, normalizeText(view.scope) === 'family' || normalizeText(view.scope) === 'familia' ? 'family' : 'personal');
        compare(comparison, plan.owner_user_id, String(view.userId || '').trim() || null);
    }
    return comparison;
}

function compareDebtViews(dividasData, plansByRef) {
    const headers = dividasData[0] || [];
    const indexes = {
        name: findHeaderIndex(headers, ['Nome', 'Nome da Dívida', 'Nome da Divida']),
        type: findHeaderIndex(headers, ['Tipo']),
        original: findHeaderIndex(headers, ['Valor Original']),
        balance: findHeaderIndex(headers, ['Saldo Atual']),
        installment: findHeaderIndex(headers, ['Parcela', 'Valor da Parcela']),
        status: findHeaderIndex(headers, ['Status']),
        userId: findHeaderIndex(headers, ['user_id', 'user id']),
        strategy: findHeaderIndex(headers, ['Estratégia', 'Estrategia']),
        lastPayment: findHeaderIndex(headers, ['Último Pagamento', 'Ultimo Pagamento'])
    };
    const comparison = newComparison();
    for (const entry of meaningfulEntries(dividasData)) {
        const view = normalizeDebtRow(entry.row, headers);
        if (!view.label && !view.creditor && !view.type) continue;
        const plan = plansByRef.get(`sheet.dividas:row:${entry.rowIndex}`);
        if (!plan) {
            comparison.missing_projection_count += 1;
            continue;
        }
        compare(comparison, plan.amounts.principal_cents, moneyToCents(view.originalAmount), { observed: isObserved(entry.row[indexes.original]) });
        compare(comparison, plan.amounts.outstanding_cents, moneyToCents(view.balanceAmount), { observed: isObserved(entry.row[indexes.balance]) });
        compare(comparison, plan.amounts.installment_cents, moneyToCents(view.installmentAmount), { observed: isObserved(entry.row[indexes.installment]) });
        compare(comparison, plan.type, debtType(entry.row[indexes.type]));
        compare(comparison, plan.status, planStatus(entry.row[indexes.status]));
        compare(comparison, plan.owner_user_id, String(entry.row[indexes.userId] || '').trim() || null);
        compare(comparison, plan.metadata.strategy, null, { observed: indexes.strategy < 0 });
        compare(comparison, plan.metadata.last_payment_on, null, { observed: indexes.lastPayment < 0 });
    }
    return comparison;
}

function compareMovementViews(movementsData, movementsByRef) {
    const headers = movementsData[0] || [];
    const indexes = {
        amount: findHeaderIndex(headers, ['Valor']),
        before: findHeaderIndex(headers, ['Valor Antes']),
        after: findHeaderIndex(headers, ['Valor Depois']),
        date: findHeaderIndex(headers, ['Data'])
    };
    const comparison = newComparison();
    for (const entry of meaningfulEntries(movementsData)) {
        const movement = movementsByRef.get(`sheet.movimentacoes_metas:row:${entry.rowIndex}`);
        if (!movement) {
            comparison.missing_projection_count += 1;
            continue;
        }
        compare(comparison, movement.amount_cents, moneyToCents(entry.row[indexes.amount]), { observed: isObserved(entry.row[indexes.amount]) });
        compare(comparison, movement.balance_before_cents, moneyToCents(entry.row[indexes.before]), { observed: isObserved(entry.row[indexes.before]) });
        compare(comparison, movement.balance_after_cents, moneyToCents(entry.row[indexes.after]), { observed: isObserved(entry.row[indexes.after]) });
        compare(comparison, movement.occurred_on, normalizeDate(entry.row[indexes.date]), { observed: isObserved(entry.row[indexes.date]) });
        compare(comparison, movement.state, 'realized');
    }
    return comparison;
}

function issueCounts(issues = []) {
    const counts = new Map();
    for (const issue of issues) {
        const code = String(issue?.code || 'unknown_issue').replace(/[^a-z0-9_:-]/gi, '_');
        counts.set(code, (counts.get(code) || 0) + 1);
    }
    return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function storageRoundTrip(projection) {
    const source = new ProjectedPlansStore({ dbPath: ':memory:', writeEnabled: true, clock: () => 'read-only-gate' });
    const target = new ProjectedPlansStore({ dbPath: ':memory:', writeEnabled: true, clock: () => 'read-only-gate' });
    try {
        const first = source.persistProjection(projection);
        const replay = source.persistProjection(projection);
        const backup = source.createBackup({ createdAt: 'read-only-gate' });
        const restored = target.restoreBackup(backup);
        const exact = stableStringify(target.readProjection()) === stableStringify(projection);
        return {
            first_write_ok: first.replayed === false,
            replay_idempotent: replay.replayed === true,
            backup_restore_exact: restored.restored === true && exact,
            readiness: source.getReadiness()
        };
    } finally {
        source.close();
        target.close();
    }
}

function sensitiveTokens({ metasData = [], dividasData = [], movimentacoesMetasData = [] } = {}) {
    const specs = [
        [metasData, [0, 8]],
        [dividasData, [0, 1, 11, 12, 17]],
        [movimentacoesMetasData, [1, 6, 7, 8, 9]]
    ];
    const tokens = new Set();
    for (const [rows, indexes] of specs) {
        for (const { row } of meaningfulEntries(rows)) {
            for (const index of indexes) {
                const value = String(row[index] ?? '').trim();
                if (value.length >= 4) tokens.add(value.toLowerCase());
            }
        }
    }
    return [...tokens];
}

function privacyScan(report, sheets) {
    const serialized = JSON.stringify(report).toLowerCase();
    const forbiddenPattern = /user_id|owner_user|plan_id|movement_id|legacy_ref|operation_key|spreadsheet_id|oauth|token|secret|whatsapp|phone/;
    const rawTokenLeak = sensitiveTokens(sheets).some(token => serialized.includes(JSON.stringify(token)));
    const leaks = [];
    if (forbiddenPattern.test(serialized)) leaks.push('internal_identifier_or_secret');
    if (rawTokenLeak) leaks.push('raw_source_label');
    return { ok: leaks.length === 0, leaks };
}

function buildProjectedPlansParityReport(sheets = {}, { runId = 'PHASE5A_READ_ONLY', generatedAt = new Date().toISOString() } = {}) {
    const metasData = sheets.metasData || [];
    const dividasData = sheets.dividasData || [];
    const movimentacoesMetasData = sheets.movimentacoesMetasData || [];
    const projection = projectLegacyPlanSheets({ metasData, dividasData, movimentacoesMetasData });
    const plansByRef = new Map(projection.plans.map(plan => [plan.source.legacy_ref, plan]));
    const movementsByRef = new Map(projection.plan_movements.map(movement => [movement.source.legacy_ref, movement]));
    const goalComparison = compareGoalViews(metasData, plansByRef);
    const debtComparison = compareDebtViews(dividasData, plansByRef);
    const movementComparison = compareMovementViews(movimentacoesMetasData, movementsByRef);
    const goalRows = meaningfulEntries(metasData).filter(entry => String(entry.row[0] || '').trim()).length;
    const debtRows = meaningfulEntries(dividasData).filter(entry => entry.row.some((value, index) => index <= 2 && isObserved(value))).length;
    const movementRows = meaningfulEntries(movimentacoesMetasData).length;
    const projectedGoalCount = projection.plans.filter(plan => plan.type === 'goal').length;
    const projectedDebtCount = projection.plans.length - projectedGoalCount;
    const provisionalCount = projection.plans.filter(plan => plan.source.identity_status === 'provisional').length;
    const issuesByCode = issueCounts(projection.issues);
    const storage = storageRoundTrip(projection);
    const totalMismatches = goalComparison.mismatch_count + debtComparison.mismatch_count + movementComparison.mismatch_count;
    const totalMissing = goalComparison.missing_projection_count + debtComparison.missing_projection_count + movementComparison.missing_projection_count;
    const countParity = goalRows === projectedGoalCount && debtRows === projectedDebtCount && movementRows === projection.plan_movements.length;
    const parityGo = countParity && totalMismatches === 0 && totalMissing === 0 && projection.issues.length === 0;
    const storageGo = storage.first_write_ok && storage.replay_idempotent && storage.backup_restore_exact;

    const report = {
        schema_version: REPORT_SCHEMA_VERSION,
        run_id: String(runId).replace(/[^A-Za-z0-9_:-]/g, '_').slice(0, 96),
        generated_at: String(generatedAt),
        source: {
            mode: 'google_sheets_read_only',
            writes_performed: 0,
            observed_rows: { goals: goalRows, debts: debtRows, goal_movements: movementRows }
        },
        projection: {
            projected_counts: { goals: projectedGoalCount, debts: projectedDebtCount, goal_movements: projection.plan_movements.length },
            provisional_identity_count: provisionalCount,
            issue_count: projection.issues.length,
            issues_by_code: issuesByCode
        },
        parity: {
            decision: parityGo ? 'GO' : 'NO-GO',
            count_parity: countParity,
            mismatch_count: totalMismatches,
            missing_projection_count: totalMissing,
            goals: goalComparison,
            debts: debtComparison,
            goal_movements: movementComparison
        },
        storage: {
            first_write_ok: storage.first_write_ok,
            replay_idempotent: storage.replay_idempotent,
            backup_restore_exact: storage.backup_restore_exact,
            cutover_ready: storage.readiness.cutover_ready
        }
    };
    report.privacy = privacyScan(report, { metasData, dividasData, movimentacoesMetasData });
    const blockers = [];
    if (!parityGo) blockers.push('parity_or_projection_gap');
    if (!storageGo) blockers.push('storage_validation_failed');
    if (provisionalCount > 0) blockers.push('provisional_identities');
    if (!report.privacy.ok) blockers.push('privacy_scan_failed');
    if (projection.plans.length === 0) blockers.push('no_observed_plans');
    report.blockers = blockers;
    report.decision = blockers.length === 0 ? 'GO' : 'NO-GO';
    return report;
}

module.exports = {
    REPORT_SCHEMA_VERSION,
    buildProjectedPlansParityReport,
    __test__: {
        meaningfulEntries,
        privacyScan,
        sensitiveTokens
    }
};
