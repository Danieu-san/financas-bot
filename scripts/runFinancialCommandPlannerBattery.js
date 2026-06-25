require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

const fixture = require('../tests/fixtures/planner/unified-financial-command-cases.json');
const {
    buildDeterministicFinancialCommandPlan,
    planFinancialCommandWithGemini
} = require('../src/planning/financialCommandPlanner');
const {
    validateFinancialCommandPlan
} = require('../src/planning/financialCommandPlanContract');

const MAX_LIVE_CALLS_HARD_LIMIT = 12;

function parseArgs(argv = process.argv.slice(2)) {
    const options = {
        live: false,
        maxCalls: 0,
        limit: null,
        reportDir: null,
        caseId: null
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--live') options.live = true;
        else if (arg === '--max-calls') {
            options.maxCalls = Number.parseInt(argv[++index], 10);
        } else if (arg.startsWith('--max-calls=')) {
            options.maxCalls = Number.parseInt(arg.split('=')[1], 10);
        } else if (arg === '--limit') {
            options.limit = Number.parseInt(argv[++index], 10);
        } else if (arg.startsWith('--limit=')) {
            options.limit = Number.parseInt(arg.split('=')[1], 10);
        } else if (arg === '--report-dir') {
            options.reportDir = argv[++index];
        } else if (arg.startsWith('--report-dir=')) {
            options.reportDir = arg.split('=').slice(1).join('=');
        } else if (arg === '--case') {
            options.caseId = argv[++index];
        } else if (arg.startsWith('--case=')) {
            options.caseId = arg.split('=').slice(1).join('=');
        }
    }
    return options;
}

function validateOptions(options = {}) {
    if (!options.live) return { ok: true, mode: 'offline' };
    if (!Number.isInteger(options.maxCalls) || options.maxCalls < 1) {
        return { ok: false, reason: 'live_requires_positive_max_calls' };
    }
    if (options.maxCalls > MAX_LIVE_CALLS_HARD_LIMIT) {
        return { ok: false, reason: 'max_calls_exceeds_hard_limit' };
    }
    return { ok: true, mode: 'live' };
}

function evaluatePlan(testCase, plan, validationErrors = []) {
    const validation = validateFinancialCommandPlan(plan);
    const contextTool = validation.normalizedPlan.contextRequests[0]?.tool || null;
    const expectedAmountMatches = testCase.expectedAmount === undefined
        || validation.normalizedPlan.entities.amount === testCase.expectedAmount;
    const accepted = validation.ok
        && validationErrors.length === 0
        && validation.normalizedPlan.operation === testCase.expectedOperation
        && contextTool === testCase.expectedContextTool
        && expectedAmountMatches;

    return {
        id: testCase.id,
        accepted,
        operation: validation.normalizedPlan.operation || 'invalid',
        contextTool: contextTool || '',
        amountMatches: expectedAmountMatches,
        errors: [...new Set([...validation.errors, ...validationErrors])]
    };
}

function buildRunId(date = new Date()) {
    return `FINANCIAL_COMMAND_PLANNER_${date.toISOString().replace(/\D/g, '').slice(0, 14)}`;
}

async function runFinancialCommandPlannerBattery(options = {}) {
    const optionValidation = validateOptions(options);
    if (!optionValidation.ok) throw new Error(optionValidation.reason);
    const startedAt = new Date();
    const startedAtMs = Date.now();

    const candidates = options.caseId
        ? fixture.cases.filter(testCase => testCase.id === options.caseId)
        : fixture.cases;
    if (options.caseId && candidates.length === 0) throw new Error('case_not_found');

    const requestedLimit = Number.isInteger(options.limit)
        ? Math.max(0, options.limit)
        : candidates.length;
    const effectiveLimit = options.live
        ? Math.min(requestedLimit, options.maxCalls)
        : requestedLimit;
    const cases = candidates.slice(0, effectiveLimit);
    const planner = options.planWithGemini || planFinancialCommandWithGemini;
    const results = [];

    for (const testCase of cases) {
        if (options.live) {
            const planned = await planner({ message: testCase.message });
            results.push({
                ...evaluatePlan(
                    testCase,
                    planned.plan || {},
                    planned.errors || []
                ),
                geminiCalls: 1
            });
        } else {
            results.push({
                ...evaluatePlan(
                    testCase,
                    buildDeterministicFinancialCommandPlan(testCase.message)
                ),
                geminiCalls: 0
            });
        }
    }

    const runId = options.runId || buildRunId(startedAt);
    const reportDir = path.resolve(
        options.reportDir || path.join('data', 'qa-runs', runId)
    );
    const summary = {
        total: results.length,
        accepted: results.filter(item => item.accepted).length,
        gaps: results.filter(item => !item.accepted).length,
        geminiCalls: results.reduce(
            (sum, item) => sum + Number(item.geminiCalls || 0),
            0
        ),
        gapIds: results.filter(item => !item.accepted).map(item => item.id)
    };
    const finishedAt = new Date();
    const report = {
        run_id: runId,
        mode: options.live ? 'live' : 'offline',
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_ms: Date.now() - startedAtMs,
        max_calls: options.live ? options.maxCalls : 0,
        summary,
        results
    };

    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(
        reportDir,
        'financial-command-planner-report.json'
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    return { report, reportDir, reportPath };
}

async function main() {
    const options = parseArgs();
    const { report, reportPath } = await runFinancialCommandPlannerBattery(options);
    console.log(`[financial-command-planner] report=${reportPath}`);
    console.log(
        `[financial-command-planner] mode=${report.mode} total=${report.summary.total} accepted=${report.summary.accepted} gaps=${report.summary.gaps} gemini_calls=${report.summary.geminiCalls}`
    );
    if (report.summary.gaps > 0) process.exitCode = 1;
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message || error);
        process.exit(1);
    });
}

module.exports = {
    MAX_LIVE_CALLS_HARD_LIMIT,
    parseArgs,
    validateOptions,
    evaluatePlan,
    runFinancialCommandPlannerBattery
};
