require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

const { runFinancialAgentAcceptanceBattery } = require('./runFinancialAgentAcceptanceBattery');
const { runFinancialAgentMigrationGapBattery } = require('./runFinancialAgentMigrationGapBattery');

function buildRunId(date = new Date()) {
    return `ANALYTICAL_LEGACY_GATE_${date.toISOString().replace(/\D/g, '').slice(0, 14)}`;
}

function buildAnalyticalLegacyReductionDecision({ acceptanceSummary = {}, migrationGapSummary = {} } = {}) {
    const blockers = [];
    if ((acceptanceSummary.gaps || 0) > 0) blockers.push('financial_agent_acceptance_gaps');
    if ((migrationGapSummary.gaps || 0) > 0) blockers.push('migration_gap_battery_gaps');
    if ((migrationGapSummary.missingMigrationGap || 0) > 0) blockers.push('missing_migration_gap_telemetry');
    if ((migrationGapSummary.unsafeTelemetry || 0) > 0) blockers.push('unsafe_migration_gap_telemetry');
    return {
        status: blockers.length > 0 ? 'NO_GO' : 'GO',
        blockers
    };
}

function parseIntegerOption(args = [], name) {
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    const value = Number.parseInt(args[index + 1], 10);
    return Number.isInteger(value) ? value : undefined;
}

function restoreEnvFlag(name, value) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}

async function runAnalyticalLegacyReductionGate(options = {}) {
    const startedAt = new Date();
    const runId = options.runId || buildRunId(startedAt);
    const reportDir = path.resolve(options.reportDir || path.join('data', 'qa-runs', runId));
    fs.mkdirSync(reportDir, { recursive: true });

    const originalPlannerFlag = process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED;
    const originalContextualFlag = process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE;
    process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED = 'false';
    process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE = 'off';

    try {
        const acceptance = await runFinancialAgentAcceptanceBattery({
            runId: `${runId}_ACCEPTANCE`,
            reportDir: path.join(reportDir, 'financial-agent-acceptance'),
            limit: options.acceptanceLimit
        });
        const migrationGaps = await runFinancialAgentMigrationGapBattery({
            runId: `${runId}_MIGRATION_GAPS`,
            reportDir: path.join(reportDir, 'financial-agent-migration-gaps'),
            limit: options.migrationGapLimit
        });

        const decision = buildAnalyticalLegacyReductionDecision({
            acceptanceSummary: acceptance.report.summary,
            migrationGapSummary: migrationGaps.report.summary
        });

        const report = {
            run_id: runId,
            started_at: startedAt.toISOString(),
            finished_at: new Date().toISOString(),
            synthetic_user_only: true,
            llm_planner_enabled: false,
            contextual_analyst_enabled: false,
            gemini_calls: (acceptance.report.gemini_calls || 0) + (migrationGaps.report.gemini_calls || 0),
            decision,
            acceptance: {
                report_dir: acceptance.reportDir,
                summary: acceptance.report.summary
            },
            migration_gaps: {
                report_dir: migrationGaps.reportDir,
                summary: migrationGaps.report.summary
            }
        };

        fs.writeFileSync(path.join(reportDir, 'analytical-legacy-reduction-gate-report.json'), JSON.stringify(report, null, 2));
        return { report, reportDir };
    } finally {
        restoreEnvFlag('FINANCIAL_AGENT_LLM_PLANNER_ENABLED', originalPlannerFlag);
        restoreEnvFlag('FINANCIAL_CONTEXTUAL_ANALYST_MODE', originalContextualFlag);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const strict = !args.includes('--no-strict');
    const { report, reportDir } = await runAnalyticalLegacyReductionGate({
        acceptanceLimit: parseIntegerOption(args, '--acceptance-limit'),
        migrationGapLimit: parseIntegerOption(args, '--migration-gap-limit')
    });

    console.log(`[analytical-legacy-gate] report=${reportDir}`);
    console.log(`[analytical-legacy-gate] status=${report.decision.status} blockers=${report.decision.blockers.join(',') || 'none'} gemini_calls=${report.gemini_calls}`);
    console.log(`[analytical-legacy-gate] acceptance total=${report.acceptance.summary.total} gaps=${report.acceptance.summary.gaps}`);
    console.log(`[analytical-legacy-gate] migration_gaps total=${report.migration_gaps.summary.total} gaps=${report.migration_gaps.summary.gaps} missing=${report.migration_gaps.summary.missingMigrationGap} unsafe=${report.migration_gaps.summary.unsafeTelemetry}`);
    if (strict && report.decision.status !== 'GO') process.exitCode = 1;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    buildAnalyticalLegacyReductionDecision,
    runAnalyticalLegacyReductionGate
};