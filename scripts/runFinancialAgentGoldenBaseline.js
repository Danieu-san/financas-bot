const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CORPUS_PATH = path.join(
    REPO_ROOT,
    'tests',
    'fixtures',
    'agentic',
    'phase-3f1a-golden-corpus.json'
);
const SENSITIVE_PATTERN = /(?:\b\d{10,13}\b|@[a-z0-9._-]+\.[a-z]{2,}|api[_-]?key|bearer\s+[a-z0-9._-]+|agentic-battery-user)/i;
const ALLOWED_SOURCE_HEALTH = new Set(['available', 'partial', 'stale', 'unavailable']);

function readCorpus(filePath = DEFAULT_CORPUS_PATH) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildProvenanceIndex(groups = {}) {
    const index = new Map();
    for (const [provenance, ids] of Object.entries(groups)) {
        for (const id of ids) {
            if (index.has(id)) throw new Error(`duplicate_provenance:${id}`);
            index.set(id, provenance);
        }
    }
    return index;
}

function validateCorpus(corpus) {
    const cases = Array.isArray(corpus?.cases) ? corpus.cases : [];
    if (corpus?.schema_version !== 'phase-3f1a-golden-v1') throw new Error('invalid_schema_version');
    if (cases.length < 50 || cases.length > 100) throw new Error('case_count_out_of_range');
    if (cases.length !== corpus.expected_case_count) throw new Error('unexpected_case_count');

    const ids = new Set();
    for (const item of cases) {
        if (!item.id || ids.has(item.id)) throw new Error(`invalid_or_duplicate_id:${item.id || ''}`);
        ids.add(item.id);
        if (!item.source_case_id && (!item.question || !item.expected)) {
            throw new Error(`missing_case_source:${item.id}`);
        }
        if (!item.metric || !item.scope || !Array.isArray(item.dimensions) || !item.entity) {
            throw new Error(`missing_semantic_label:${item.id}`);
        }
        const sourceHealth = item.source_health || 'available';
        if (!ALLOWED_SOURCE_HEALTH.has(sourceHealth)) throw new Error(`invalid_source_health:${item.id}`);
    }

    const approvalIds = new Set(corpus.approval_case_ids || []);
    if (approvalIds.size === 0 || approvalIds.size >= cases.length) throw new Error('invalid_approval_split');
    for (const id of approvalIds) {
        if (!ids.has(id)) throw new Error(`unknown_approval_case:${id}`);
    }
    for (const id of corpus.critical_case_ids || []) {
        if (!ids.has(id)) throw new Error(`unknown_critical_case:${id}`);
    }

    const provenance = buildProvenanceIndex(corpus.provenance_groups);
    for (const id of ids) {
        if (!provenance.has(id)) throw new Error(`missing_provenance:${id}`);
    }
    if (provenance.size !== ids.size) throw new Error('provenance_case_count_mismatch');

    if (SENSITIVE_PATTERN.test(JSON.stringify(corpus))) throw new Error('sensitive_data_in_corpus');
    return {
        total: cases.length,
        development: cases.length - approvalIds.size,
        approval: approvalIds.size,
        critical: new Set(corpus.critical_case_ids || []).size
    };
}

function materializeCases(corpus, acceptanceCases) {
    const sourceById = new Map(acceptanceCases.map(item => [item.id, item]));
    const approvalIds = new Set(corpus.approval_case_ids || []);
    const criticalIds = new Set(corpus.critical_case_ids || []);
    const provenance = buildProvenanceIndex(corpus.provenance_groups);

    return corpus.cases.map(item => {
        const source = item.source_case_id ? sourceById.get(item.source_case_id) : null;
        if (item.source_case_id && !source) throw new Error(`unknown_source_case:${item.source_case_id}`);
        const rawExpected = source?.expected || item.expected;
        const expected = {
            domain: rawExpected.domain,
            operation: rawExpected.operation,
            timeBasis: rawExpected.timeBasis || rawExpected.time_basis,
            metric: item.metric,
            dimensions: item.dimensions,
            filters: item.filters || [],
            entity: item.entity,
            period: item.period || rawExpected.timeBasis || rawExpected.time_basis,
            scope: item.scope,
            sourceHealth: item.source_health || 'available',
            responseMode: item.expected_response_mode || 'answer'
        };
        return {
            id: item.id,
            sourceCaseId: item.source_case_id || '',
            question: source?.question || item.question,
            criteria: source?.criteria || item.criteria || '',
            expected,
            split: approvalIds.has(item.id) ? 'approval' : 'development',
            critical: criticalIds.has(item.id),
            provenance: provenance.get(item.id)
        };
    });
}

function seedSyntheticSnapshot(syncSnapshotToSqlite) {
    const userId = 'agentic-battery-user';
    return syncSnapshotToSqlite({
        saidas: [
            { user_id: userId, data: '01/07/2026', descricao: 'mercado teste', categoria: 'Alimentacao', subcategoria: '', valor: 120, pagamento: 'PIX', month: 7, year: 2026 },
            { user_id: userId, data: '02/07/2026', descricao: 'transporte teste', categoria: 'Transporte', subcategoria: '', valor: 30, pagamento: 'PIX', month: 7, year: 2026 }
        ],
        cartoes: [
            { user_id: userId, source: 'Cartao Principal', card_id: 'card-test', cartao: 'Cartao Principal', data: '03/07/2026', descricao: 'farmacia teste', categoria: 'Saude', subcategoria: 'Cartao', valor: 80, parcela: '1/1', month: 7, year: 2026 }
        ],
        entradas: [
            { user_id: userId, data: '04/07/2026', descricao: 'receita teste', categoria: 'Salario', valor: 2000, recebimento: 'Conta Corrente', recorrente: 'Sim', month: 7, year: 2026 }
        ],
        transferencias: [
            { user_id: userId, data: '05/07/2026', descricao: 'reserva teste', valor: 200, origem: 'Conta', destino: 'Reserva', metodo: 'PIX', observacoes: '', status: 'Movimentacao de reserva/investimento', month: 7, year: 2026 }
        ],
        userSettings: [
            { user_id: userId, monthly_budget_enabled: 'SIM', monthly_budget_amount: '1000', monthly_budget_scope: 'family', monthly_budget_cycle_start_day: '28' }
        ],
        cartoesConfig: [
            { card_id: 'card-test', nome: 'Cartao Principal', due_day: 15, active: 'SIM' }
        ],
        metas: [
            { user_id: userId, row: ['Reserva Teste', '1000', '250', '25%', '', '31/12/2026', 'Em andamento', 'Alta', userId, 'family', 'Aporte teste'] }
        ],
        movimentacoesMetas: [
            { user_id: userId, row: ['06/07/2026', 'Reserva Teste', 'Aporte', '250', '0', '250', 'teste', 'Pessoa A', userId, userId] }
        ],
        dividas: [
            { user_id: userId, row: ['Divida Teste', 'Instituicao', 'Emprestimo', '2000', '1200', '200', '2%', 10, '01/01/2026', 10, 'Ativa', '', '', '40%', '10/08/2026'] }
        ],
        contas: [
            {
                user_id: userId,
                headers: ['Categoria', 'Nome Amigavel', 'Dia do Vencimento', 'Valor Esperado', 'Regra Ativa', 'Subcategoria', 'Nome da Conta', 'Observacoes', 'user_id'],
                row: ['Moradia', 'Internet Teste', '10', '100', 'SIM', 'Internet', 'Conta Teste', '', userId]
            }
        ]
    });
}

function percentile(values, ratio) {
    if (!values.length) return 0;
    const ordered = [...values].sort((a, b) => a - b);
    return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * ratio) - 1)];
}

function reportTelemetry(agent = {}, fallbackLatencyMs = 0) {
    const telemetry = agent.telemetry || {};
    const numeric = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const estimatedCost = Number(telemetry.estimatedCostUsd);
    return {
        gemini_calls: numeric(telemetry.modelCalls),
        input_tokens: numeric(telemetry.inputTokens),
        output_tokens: numeric(telemetry.outputTokens),
        estimated_cost: Number.isFinite(estimatedCost) ? estimatedCost : null,
        latency_ms: numeric(telemetry.latencyMs, fallbackLatencyMs)
    };
}

function summarize(results, corpusStats) {
    const executed = results.filter(item => item.agent.execution === 'executed');
    const latencies = executed.map(item => item.telemetry.latency_ms);
    const hasUnpricedModelCall = executed.some(item =>
        item.telemetry.gemini_calls > 0 && item.telemetry.estimated_cost === null
    );
    return {
        ...corpusStats,
        executed: executed.length,
        deferredFaultInjection: results.length - executed.length,
        routeMatches: results.filter(item => item.route.matches.all).length,
        agentAccepted: executed.filter(item => item.agent.accepted).length,
        baselineGaps: results.filter(item => !item.baselineAccepted).map(item => item.id),
        geminiCalls: executed.reduce((total, item) => total + item.telemetry.gemini_calls, 0),
        inputTokens: executed.reduce((total, item) => total + item.telemetry.input_tokens, 0),
        outputTokens: executed.reduce((total, item) => total + item.telemetry.output_tokens, 0),
        estimatedCost: hasUnpricedModelCall ? null : executed.reduce(
            (total, item) => total + (item.telemetry.estimated_cost || 0),
            0
        ),
        latencyP50Ms: percentile(latencies, 0.5),
        latencyP95Ms: percentile(latencies, 0.95)
    };
}

async function runGoldenBaseline(options = {}) {
    const originalCwd = process.cwd();
    const previousPlannerFlag = process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED;
    const previousAnalystMode = process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE;
    const corpusPath = path.resolve(options.corpusPath || DEFAULT_CORPUS_PATH);
    const reportDir = path.resolve(options.reportDir || path.join(REPO_ROOT, 'data', 'qa-runs', 'PHASE3F1A_BASELINE_20260708'));
    const isolationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-3f1a-'));

    process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED = 'false';
    process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE = 'shadow';
    process.chdir(isolationDir);
    try {
        const {
            parseAcceptanceBattery,
            evaluateAcceptanceCase
        } = require('./runFinancialQueryAcceptanceBattery');
        const { evaluateAgenticCase } = require('./runFinancialAgentAcceptanceBattery');
        const {
            ensureSqliteReady,
            syncSnapshotToSqlite
        } = require('../src/services/sqliteReadModelService');

        const corpus = readCorpus(corpusPath);
        const corpusStats = validateCorpus(corpus);
        const sourcePath = path.resolve(REPO_ROOT, corpus.source_battery);
        const allCases = materializeCases(corpus, parseAcceptanceBattery(sourcePath));
        const cases = Number.isInteger(options.limit) ? allCases.slice(0, options.limit) : allCases;
        if (!ensureSqliteReady() || !seedSyntheticSnapshot(syncSnapshotToSqlite)) {
            throw new Error('synthetic_sqlite_unavailable');
        }

        const results = [];
        for (const testCase of cases) {
            const routed = evaluateAcceptanceCase(testCase);
            const sourceUnavailable = testCase.expected.sourceHealth === 'unavailable';
            if (sourceUnavailable) {
                results.push({
                    ...testCase,
                    route: {
                        actual: routed.actual,
                        matches: routed.matches,
                        safePlan: routed.safePlanShape
                    },
                    agent: {
                        execution: 'deferred_fault_injection',
                        accepted: false,
                        action: '',
                        tool: '',
                        verified: false,
                        answer: ''
                    },
                    telemetry: { gemini_calls: 0, input_tokens: 0, output_tokens: 0, estimated_cost: 0, latency_ms: 0 },
                    baselineAccepted: routed.matches.all
                });
                continue;
            }

            const started = performance.now();
            const agent = await evaluateAgenticCase(testCase);
            const latencyMs = Math.round((performance.now() - started) * 100) / 100;
            results.push({
                ...testCase,
                route: {
                    actual: routed.actual,
                    matches: routed.matches,
                    safePlan: routed.safePlanShape
                },
                agent: {
                    execution: 'executed',
                    accepted: agent.accepted,
                    action: agent.action,
                    tool: agent.tool,
                    verified: agent.verified,
                    answer: agent.answer,
                    safePlan: agent.safePlan,
                    reason: agent.reason
                },
                telemetry: reportTelemetry(agent, latencyMs),
                baselineAccepted: routed.matches.all && agent.accepted
            });
        }

        const effectiveStats = options.limit
            ? {
                total: cases.length,
                development: cases.filter(item => item.split === 'development').length,
                approval: cases.filter(item => item.split === 'approval').length,
                critical: cases.filter(item => item.critical).length
            }
            : corpusStats;
        const summary = summarize(results, effectiveStats);
        const report = {
            run_id: options.runId || 'PHASE3F1A_BASELINE_20260708',
            schema_version: corpus.schema_version,
            generated_at: new Date().toISOString(),
            mode: 'offline_current_baseline',
            production_changed: false,
            writes_real_data: false,
            reads_real_financial_rows: false,
            synthetic_fixture_only: true,
            calls_gemini: summary.geminiCalls > 0,
            summary,
            results
        };
        if (SENSITIVE_PATTERN.test(JSON.stringify(report))) throw new Error('sensitive_data_in_report');

        fs.mkdirSync(reportDir, { recursive: true });
        fs.writeFileSync(path.join(reportDir, 'phase-3f1a-golden-baseline-report.json'), JSON.stringify(report, null, 2), 'utf8');
        fs.writeFileSync(path.join(reportDir, 'manifest.json'), JSON.stringify({
            run_id: report.run_id,
            artifacts: ['phase-3f1a-golden-baseline-report.json'],
            markers_created: [],
            sheets_changed: [],
            calendar_events_changed: [],
            state_changed: false,
            cleanup_required: false
        }, null, 2), 'utf8');
        return { report, reportDir };
    } finally {
        process.chdir(originalCwd);
        if (previousPlannerFlag === undefined) delete process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED;
        else process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED = previousPlannerFlag;
        if (previousAnalystMode === undefined) delete process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE;
        else process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE = previousAnalystMode;
    }
}

async function main() {
    const { report, reportDir } = await runGoldenBaseline();
    console.log(`[phase-3f1a] report=${reportDir}`);
    console.log(`[phase-3f1a] total=${report.summary.total} executed=${report.summary.executed} gaps=${report.summary.baselineGaps.length}`);
    console.log(`[phase-3f1a] gemini_calls=${report.summary.geminiCalls} real_writes=false`);
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_CORPUS_PATH,
    readCorpus,
    validateCorpus,
    materializeCases,
    reportTelemetry,
    summarize,
    runGoldenBaseline
};
