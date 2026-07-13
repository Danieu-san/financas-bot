require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

const { authorizeGoogle, readDataFromSheet, runWithUserSheetContext } = require('../src/services/google');
const { getUserByWhatsAppId } = require('../src/services/userService');
const { buildProjectedPlansParityReport } = require('../src/plans/projectedPlansParityReport');

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

async function runProjectedPlansReadOnlyGate({
    confirmRealRead = false,
    runId = buildRunId(),
    reportDir = path.join('data', 'qa-runs', runId),
    generatedAt = new Date().toISOString()
} = {}) {
    if (!confirmRealRead) throw new Error('projected_plans_real_read_confirmation_required');
    await authorizeGoogle();
    const admin = await getUserByWhatsAppId(onlyConfiguredAdminId());
    if (!admin?.user_id) throw new Error('projected_plans_admin_user_not_found');
    const [metasData, dividasData, movimentacoesMetasData] = await runWithUserSheetContext(admin, () => Promise.all([
        readDataFromSheet('Metas!A:K'),
        readDataFromSheet('Dívidas!A:R'),
        readDataFromSheet('Movimentações Metas!A:J')
    ]));
    const report = buildProjectedPlansParityReport(
        { metasData, dividasData, movimentacoesMetasData },
        { runId, generatedAt, sourceMode: 'authorized_owner_sheet_read_only' }
    );
    const reportPath = path.resolve(reportDir, 'projected-plans-read-only-gate.json');
    writeJson(reportPath, report);
    return { report, reportPath };
}

async function main() {
    const confirmRealRead = process.argv.includes('--confirm-real-read') || process.env.PHASE5A_REAL_READ_GATE_ENABLED === 'true';
    const result = await runProjectedPlansReadOnlyGate({ confirmRealRead });
    const report = result.report;
    console.log(`[phase5a-read-only] report=${result.reportPath}`);
    console.log(`[phase5a-read-only] decision=${report.decision} parity=${report.parity.decision} privacy=${report.privacy.ok} writes=${report.source.writes_performed}`);
    console.log(`[phase5a-read-only] observed_goals=${report.source.observed_rows.goals} observed_debts=${report.source.observed_rows.debts} observed_movements=${report.source.observed_rows.goal_movements}`);
    console.log(`[phase5a-read-only] mismatches=${report.parity.mismatch_count} missing=${report.parity.missing_projection_count} provisional=${report.projection.provisional_identity_count} issues=${report.projection.issue_count}`);
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
    buildRunId,
    runProjectedPlansReadOnlyGate,
    __test__: { onlyConfiguredAdminId }
};
