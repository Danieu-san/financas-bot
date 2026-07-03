const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    buildMigrationGapBatteryCases,
    runFinancialAgentMigrationGapBattery,
    summarizeMigrationGapResults
} = require('../scripts/runFinancialAgentMigrationGapBattery');

test('financial agent migration-gap battery defines adversarial analytical gaps', () => {
    const cases = buildMigrationGapBatteryCases();
    assert.ok(cases.length >= 6);
    assert.ok(cases.some(item => item.expectedTag === 'engine_gap'));
    assert.ok(cases.some(item => item.expectedTag === 'unsupported_filter'));
    assert.ok(cases.every(item => item.expectMigrationGap === true));
    assert.doesNotMatch(JSON.stringify(cases), /token|secret|spreadsheet_id|raw_rows/i);
});

test('financial agent migration-gap battery writes sanitized zero-Gemini evidence', async () => {
    const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-migration-gap-'));
    const { report } = await runFinancialAgentMigrationGapBattery({
        reportDir,
        runId: 'MIGRATION_GAP_TEST',
        limit: 4
    });

    assert.strictEqual(report.summary.total, 4);
    assert.strictEqual(report.summary.accepted, 4);
    assert.strictEqual(report.summary.missingMigrationGap, 0);
    assert.strictEqual(report.summary.unsafeTelemetry, 0);
    assert.strictEqual(report.gemini_calls, 0);
    assert.strictEqual(report.synthetic_user_only, true);
    assert.strictEqual(report.llm_planner_enabled, false);
    assert.strictEqual(fs.existsSync(path.join(reportDir, 'financial-agent-migration-gap-report.json')), true);
    assert.doesNotMatch(JSON.stringify(report), /user_id|agent-daniel|sheet|spreadsheet|token|secret|raw/i);
});

test('financial agent migration-gap summary classifies missing telemetry as a failed gate', () => {
    const summary = summarizeMigrationGapResults([
        { accepted: true, telemetrySafe: true, hasMigrationGap: true, telemetry: { tag: 'engine_gap', tool: null } },
        { accepted: false, telemetrySafe: false, hasMigrationGap: false, telemetry: null }
    ]);

    assert.strictEqual(summary.total, 2);
    assert.strictEqual(summary.accepted, 1);
    assert.strictEqual(summary.gaps, 1);
    assert.strictEqual(summary.missingMigrationGap, 1);
    assert.strictEqual(summary.unsafeTelemetry, 1);
    assert.deepStrictEqual(summary.byTag, { engine_gap: 1, none: 1 });
});