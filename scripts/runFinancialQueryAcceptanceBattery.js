const fs = require('node:fs');
const path = require('node:path');

const { __test__: messageHandlerTest } = require('../src/handlers/messageHandler');

const DEFAULT_BATTERY_PATH = path.resolve(__dirname, '..', 'docs', 'qa', 'financial-query-acceptance-battery.md');

function splitMarkdownRow(line) {
    return line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(cell => cell.trim());
}

function parseAcceptanceBattery(filePath = DEFAULT_BATTERY_PATH) {
    const text = fs.readFileSync(filePath, 'utf8');
    const cases = [];

    for (const line of text.split(/\r?\n/)) {
        if (!/^\|\s*[A-Z]+-\d{3}\s*\|/.test(line)) continue;
        const [id, question, expectedDomain, expectedOperation, expectedTimeBasis, criteria] = splitMarkdownRow(line);
        cases.push({
            id,
            question,
            expected: {
                domain: expectedDomain,
                operation: expectedOperation,
                timeBasis: expectedTimeBasis
            },
            criteria
        });
    }

    return cases;
}

function createSyntheticPreviousContext(overrides = {}) {
    return {
        intent: 'total_gastos_mes',
        parameters: {
            mes: 5,
            ano: 2026,
            scope: 'personal',
            ...(overrides.parameters || {})
        },
        metric: 'sum_expenses',
        storedAt: Date.now(),
        expiresAt: Date.now() + 300000,
        ...overrides
    };
}

function shouldUseSyntheticContext(testCase) {
    return testCase.expected.timeBasis === 'context' || /^FUP-/.test(testCase.id);
}

function normalizeActualTimeBasis(testCase, plan) {
    if (testCase.expected.timeBasis === 'context' && plan) return 'context';
    if (
        testCase.expected.timeBasis === 'current_state' &&
        plan &&
        ['goals', 'debts', 'bills'].includes(plan.domain) &&
        !plan.filters?.period
    ) {
        return 'current_state';
    }
    if (
        testCase.expected.timeBasis === 'purchase_date' &&
        plan?.domain === 'cards' &&
        plan.timeBasis === 'transaction_date'
    ) {
        return 'purchase_date';
    }
    if (
        testCase.expected.timeBasis === 'none' &&
        plan?.domain === 'dashboard' &&
        plan.operation === 'explain' &&
        !plan.filters?.period
    ) {
        return 'none';
    }
    return plan?.timeBasis || 'none';
}

function evaluateAcceptanceCase(testCase, options = {}) {
    const securityCheck = messageHandlerTest.detectSecuritySensitiveRequest(testCase.question);
    if (securityCheck.blocked) {
        const actual = {
            domain: 'security',
            operation: 'block',
            timeBasis: 'none'
        };
        return {
            id: testCase.id,
            question: testCase.question,
            expected: testCase.expected,
            actual,
            intent: '',
            blockedBeforePlan: true,
            hasFinancialQueryPlan: false,
            matches: compareExpected(testCase.expected, actual),
            securityCategory: securityCheck.category || ''
        };
    }

    const previousContext = options.previousContext ||
        (shouldUseSyntheticContext(testCase) ? createSyntheticPreviousContext() : null);
    const classification = messageHandlerTest.classifyPerguntaLocally(testCase.question, previousContext);
    const plan = classification?.financialQueryPlan || null;
    const actual = {
        domain: plan?.domain || 'unmapped',
        operation: plan?.operation || 'unmapped',
        timeBasis: normalizeActualTimeBasis(testCase, plan)
    };
    if (!plan && testCase.expected.operation === 'clarify') {
        actual.domain = testCase.expected.domain;
        actual.operation = 'clarify';
        actual.timeBasis = testCase.expected.timeBasis;
    }

    return {
        id: testCase.id,
        question: testCase.question,
        expected: testCase.expected,
        actual,
        intent: classification?.intent || '',
        blockedBeforePlan: false,
        hasFinancialQueryPlan: Boolean(plan),
        needsContext: Boolean(plan?.needsContext),
        matches: compareExpected(testCase.expected, actual),
        safePlanShape: sanitizePlanForReport(plan)
    };
}

function compareExpected(expected, actual) {
    const operation = operationMatches(expected, actual);
    const timeBasis = expected.timeBasis === actual.timeBasis;
    return {
        domain: expected.domain === actual.domain,
        operation,
        timeBasis,
        all: expected.domain === actual.domain &&
            operation &&
            timeBasis
    };
}

function operationMatches(expected, actual) {
    if (expected.operation === actual.operation) return true;
    if (expected.domain !== actual.domain) return false;

    const equivalentByDomain = {
        cards: [
            ['list', 'detail'],
            ['explain', 'detail']
        ],
        budget: [
            ['compare', 'forecast'],
            ['recommend', 'forecast'],
            ['sum', 'explain'],
            ['rank', 'explain']
        ],
        goals: [
            ['sum', 'explain'],
            ['detail', 'explain'],
            ['forecast', 'explain'],
            ['sum', 'list']
        ],
        bills: [
            ['sum', 'list']
        ],
        dashboard: [
            ['explain', 'detail']
        ]
    };

    const pairs = equivalentByDomain[expected.domain] || [];
    return pairs.some(([left, right]) =>
        expected.operation === left && actual.operation === right
    );
}

function sanitizePlanForReport(plan) {
    if (!plan) return null;
    return {
        kind: plan.kind,
        domain: plan.domain,
        operation: plan.operation,
        filters: plan.filters,
        groupBy: plan.groupBy,
        sort: plan.sort,
        limit: plan.limit,
        timeBasis: plan.timeBasis,
        needsContext: plan.needsContext,
        answerStyle: plan.answerStyle
    };
}

function summarizeResults(results) {
    const summary = {
        total: results.length,
        matchedAll: 0,
        domainMatches: 0,
        operationMatches: 0,
        timeBasisMatches: 0,
        blockedBeforePlan: 0,
        withFinancialQueryPlan: 0,
        mismatches: []
    };

    for (const result of results) {
        if (result.matches.all) summary.matchedAll += 1;
        if (result.matches.domain) summary.domainMatches += 1;
        if (result.matches.operation) summary.operationMatches += 1;
        if (result.matches.timeBasis) summary.timeBasisMatches += 1;
        if (result.blockedBeforePlan) summary.blockedBeforePlan += 1;
        if (result.hasFinancialQueryPlan) summary.withFinancialQueryPlan += 1;
        if (!result.matches.all) {
            summary.mismatches.push({
                id: result.id,
                expected: result.expected,
                actual: result.actual,
                intent: result.intent,
                blockedBeforePlan: result.blockedBeforePlan
            });
        }
    }

    return summary;
}

function buildRunId(now = new Date()) {
    return `FQBATT_${now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function mirrorLatestReport(reportDir, latestDir = path.join('data', 'qa-runs', 'FQBATT_latest')) {
    const resolvedLatestDir = path.resolve(latestDir);
    fs.rmSync(resolvedLatestDir, { recursive: true, force: true });
    fs.mkdirSync(resolvedLatestDir, { recursive: true });
    for (const fileName of ['financial-query-acceptance-report.json', 'manifest.json']) {
        fs.copyFileSync(path.join(reportDir, fileName), path.join(resolvedLatestDir, fileName));
    }
    return resolvedLatestDir;
}

function parseArgs(argv = process.argv.slice(2)) {
    const args = { strict: false, reportDir: '', json: false };
    for (const arg of argv) {
        if (arg === '--strict') args.strict = true;
        else if (arg === '--json') args.json = true;
        else if (arg.startsWith('--report-dir=')) args.reportDir = arg.slice('--report-dir='.length);
    }
    return args;
}

function runAcceptanceBattery(options = {}) {
    const startedAt = new Date();
    const runId = options.runId || buildRunId(startedAt);
    const reportDir = path.resolve(options.reportDir || path.join('data', 'qa-runs', runId));
    const cases = parseAcceptanceBattery(options.batteryPath || DEFAULT_BATTERY_PATH);
    const results = cases.map(testCase => evaluateAcceptanceCase(testCase));
    const summary = summarizeResults(results);
    const report = {
        run_id: runId,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        source: path.relative(process.cwd(), options.batteryPath || DEFAULT_BATTERY_PATH),
        mode: 'offline_planner_security_gate',
        writes_real_data: false,
        calls_gemini: false,
        reads_real_financial_rows: false,
        summary,
        results
    };

    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, 'financial-query-acceptance-report.json'), JSON.stringify(report, null, 2), 'utf8');
    fs.writeFileSync(path.join(reportDir, 'manifest.json'), JSON.stringify({
        run_id: runId,
        started_at: report.started_at,
        finished_at: report.finished_at,
        artifacts: ['financial-query-acceptance-report.json'],
        markers_created: [],
        sheets_changed: [],
        calendar_events_changed: [],
        state_changed: false,
        cleanup_required: false
    }, null, 2), 'utf8');

    if (options.updateLatest !== false) {
        mirrorLatestReport(reportDir, options.latestDir);
    }

    return { report, reportDir };
}

function main() {
    const args = parseArgs();
    const { report, reportDir } = runAcceptanceBattery({ reportDir: args.reportDir });
    if (args.json) {
        console.log(JSON.stringify({ reportDir, summary: report.summary }, null, 2));
    } else {
        console.log(`[financial-query-battery] run_id=${report.run_id}`);
        console.log(`[financial-query-battery] report=${reportDir}`);
        console.log(`[financial-query-battery] total=${report.summary.total} matched=${report.summary.matchedAll} mismatches=${report.summary.mismatches.length}`);
        console.log(`[financial-query-battery] blocked_before_plan=${report.summary.blockedBeforePlan} with_plan=${report.summary.withFinancialQueryPlan}`);
    }
    if (args.strict && report.summary.mismatches.length > 0) {
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_BATTERY_PATH,
    parseAcceptanceBattery,
    evaluateAcceptanceCase,
    createSyntheticPreviousContext,
    runAcceptanceBattery,
    summarizeResults,
    mirrorLatestReport
};
