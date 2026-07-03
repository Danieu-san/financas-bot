const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    buildAnalyticalLegacyReductionDecision,
    runAnalyticalLegacyReductionGate
} = require('../scripts/runAnalyticalLegacyReductionGate');

test('analytical legacy reduction gate blocks when acceptance or migration telemetry has gaps', () => {
    const decision = buildAnalyticalLegacyReductionDecision({
        acceptanceSummary: { gaps: 1 },
        migrationGapSummary: { gaps: 0, missingMigrationGap: 1, unsafeTelemetry: 1 }
    });

    assert.strictEqual(decision.status, 'NO_GO');
    assert.deepStrictEqual(decision.blockers, [
        'financial_agent_acceptance_gaps',
        'missing_migration_gap_telemetry',
        'unsafe_migration_gap_telemetry'
    ]);
});

test('analytical legacy reduction gate writes a sanitized zero-Gemini GO report for sampled batteries', async () => {
    const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-analytical-gate-'));
    const { report } = await runAnalyticalLegacyReductionGate({
        reportDir,
        runId: 'ANALYTICAL_GATE_TEST',
        acceptanceLimit: 5,
        migrationGapLimit: 3
    });

    assert.strictEqual(report.decision.status, 'GO');
    assert.deepStrictEqual(report.decision.blockers, []);
    assert.strictEqual(report.gemini_calls, 0);
    assert.strictEqual(report.synthetic_user_only, true);
    assert.strictEqual(report.acceptance.summary.total, 5);
    assert.strictEqual(report.migration_gaps.summary.total, 3);
    assert.strictEqual(fs.existsSync(path.join(reportDir, 'analytical-legacy-reduction-gate-report.json')), true);
    assert.doesNotMatch(JSON.stringify(report), /user_id|agent-daniel|sheet|spreadsheet|token|secret|raw/i);
});