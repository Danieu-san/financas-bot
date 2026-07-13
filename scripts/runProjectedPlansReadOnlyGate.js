require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

const { authorizeGoogle, readDataFromSheet, runWithUserSheetContext } = require('../src/services/google');
const { getUserByLookup } = require('../src/services/userService');
const { buildProjectedPlansParityReport } = require('../src/plans/projectedPlansParityReport');
const { projectLegacyPlanSheets } = require('../src/plans/projectedPlansContract');
const { ProjectedPlansStore } = require('../src/plans/projectedPlansStore');

const DEFAULT_IDENTITY_DB_PATH = path.resolve('data', 'projected-plans-identity.sqlite');

function buildRunId(date = new Date()) {
    return `PHASE5A_READ_ONLY_${date.toISOString().replace(/\D/g, '').slice(0, 14)}`;
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function onlyConfiguredAdminId(env = process.env) {
    const adminIds = String(env.ADMIN_IDS || '').split(',').map(value => value.trim()).filter(Boolean);
    if (adminIds.length !== 1) throw new Error('projected_plans_admin_scope_must_be_unique');
    return adminIds[0];
}

function resolveIdentityBindings({ sheets, dbPath = DEFAULT_IDENTITY_DB_PATH, bootstrap = false } = {}) {
    const provisional = projectLegacyPlanSheets(sheets);
    const plans = provisional.plans;
    if (!bootstrap && !fs.existsSync(dbPath)) return { bindings: new Map(), created: 0, active: 0 };
    const store = new ProjectedPlansStore({ dbPath, writeEnabled: bootstrap });
    try {
        const existingCount = store.countIdentityBindings();
        const bindings = new Map();
        const missing = [];
        for (const plan of plans) {
            const sourceType = plan.source.type;
            const legacyRef = plan.source.legacy_ref;
            const binding = store.resolveLegacyIdentity({ sourceType, legacyRef });
            if (binding?.state === 'active') bindings.set(legacyRef, { planId: binding.plan_id });
            else missing.push(plan);
        }
        if (bootstrap && missing.length > 0) {
            if (existingCount > 0) throw new Error('projected_plans_identity_rebind_required');
            for (const plan of missing) {
                store.bindLegacyIdentity({
                    sourceType: plan.source.type,
                    legacyRef: plan.source.legacy_ref,
                    planId: plan.plan_id,
                    identityStatus: 'stable'
                });
                bindings.set(plan.source.legacy_ref, { planId: plan.plan_id });
            }
        }
        return { bindings, created: bootstrap ? missing.length : 0, active: bindings.size };
    } finally {
        store.close();
    }
}

async function runProjectedPlansReadOnlyGate({
    confirmRealRead = false,
    runId = buildRunId(),
    reportDir = path.join('data', 'qa-runs', runId),
    generatedAt = new Date().toISOString(),
    bootstrapIdentities = false,
    identityDbPath = DEFAULT_IDENTITY_DB_PATH
} = {}) {
    if (!confirmRealRead) throw new Error('projected_plans_real_read_confirmation_required');
    await authorizeGoogle();
    const admin = await getUserByLookup(onlyConfiguredAdminId());
    if (!admin?.user_id) throw new Error('projected_plans_admin_user_not_found');
    const [metasData, dividasData, movimentacoesMetasData] = await runWithUserSheetContext(admin, () => Promise.all([
        readDataFromSheet('Metas!A:K'),
        readDataFromSheet('Dívidas!A:R'),
        readDataFromSheet('Movimentações Metas!A:J')
    ]));
    const sheets = { metasData, dividasData, movimentacoesMetasData };
    const identity = resolveIdentityBindings({ sheets, dbPath: identityDbPath, bootstrap: bootstrapIdentities });
    const report = buildProjectedPlansParityReport(
        sheets,
        { runId, generatedAt, sourceMode: 'authorized_owner_sheet_read_only', identityBindings: identity.bindings }
    );
    report.identity_registry = { active_binding_count: identity.active, bindings_created: identity.created };
    const reportPath = path.resolve(reportDir, 'projected-plans-read-only-gate.json');
    writeJson(reportPath, report);
    return { report, reportPath };
}

async function main() {
    const confirmRealRead = process.argv.includes('--confirm-real-read') || process.env.PHASE5A_REAL_READ_GATE_ENABLED === 'true';
    const bootstrapIdentities = process.argv.includes('--bootstrap-identities');
    const result = await runProjectedPlansReadOnlyGate({ confirmRealRead, bootstrapIdentities });
    const report = result.report;
    console.log(`[phase5a-read-only] report=${result.reportPath}`);
    console.log(`[phase5a-read-only] decision=${report.decision} parity=${report.parity.decision} privacy=${report.privacy.ok} writes=${report.source.writes_performed}`);
    console.log(`[phase5a-read-only] observed_goals=${report.source.observed_rows.goals} observed_debts=${report.source.observed_rows.debts} observed_movements=${report.source.observed_rows.goal_movements}`);
    console.log(`[phase5a-read-only] mismatches=${report.parity.mismatch_count} missing=${report.parity.missing_projection_count} provisional=${report.projection.provisional_identity_count} issues=${report.projection.issue_count}`);
    console.log(`[phase5a-read-only] identity_bindings=${report.identity_registry.active_binding_count} identity_created=${report.identity_registry.bindings_created}`);
    if (report.decision !== 'GO') process.exitCode = 2;
}

if (require.main === module) {
    main().catch(error => {
        const safeCode = error?.message === 'projected_plans_real_read_confirmation_required'
            ? 'confirmation_required'
            : 'read_gate_error';
        console.error(`[phase5a-read-only] failed=${safeCode}`);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_IDENTITY_DB_PATH,
    buildRunId,
    runProjectedPlansReadOnlyGate,
    __test__: { onlyConfiguredAdminId, resolveIdentityBindings }
};
