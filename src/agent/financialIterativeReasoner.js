const { sanitizeFinancialEvidenceValue } = require('./financialSemanticReadFacade');
const path = require('node:path');
const { createFinancialAgentCostGuard } = require('./financialAgentCostPolicy');

const BLOCKED_ARGUMENT_KEYS = /(?:^|_)(?:user|owner|sheet|spreadsheet|tenant|oauth|token|secret|password)(?:_|$)/i;
const DEFAULT_REASONER_TIMEOUT_MS = 30000;

function boundedText(value, maxLength = 3000) {
    return String(value || '').trim().slice(0, maxLength);
}

function containsBlockedArgumentKey(value, depth = 0) {
    if (depth > 10 || value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.some(item => containsBlockedArgumentKey(item, depth + 1));
    if (typeof value !== 'object') return false;
    return Object.entries(value).some(([key, child]) => (
        BLOCKED_ARGUMENT_KEYS.test(String(key || '')) || containsBlockedArgumentKey(child, depth + 1)
    ));
}

function normalizeReasonerDecision(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const action = String(value.action || '').trim().toLowerCase();
    if (action === 'answer') {
        const answer = boundedText(value.answer);
        return answer ? { action, answer } : null;
    }
    if (action === 'clarify') {
        const question = boundedText(value.question, 700);
        return question ? { action, question } : null;
    }
    if (action === 'tool') {
        const tool = String(value.tool || '').trim();
        const args = value.args && typeof value.args === 'object' && !Array.isArray(value.args) ? value.args : {};
        if (!tool || containsBlockedArgumentKey(args)) return null;
        return { action, tool, args };
    }
    return null;
}

function parseJsonContent(content = '') {
    const raw = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

function resolvedPlanFromContext(context = {}) {
    const executedPlan = context.trajectory?.executedPlan;
    if (!executedPlan || typeof executedPlan !== 'object' || Array.isArray(executedPlan)) return null;
    if (executedPlan.needsContext !== false) return null;
    return sanitizeFinancialEvidenceValue(executedPlan);
}

function enforceResolvedPlanDecision({ decision = null, resolvedPlan = null, hasEvidence = false } = {}) {
    if (!resolvedPlan) return decision;
    if (!hasEvidence) {
        return {
            action: 'tool',
            tool: 'query_financial_plan',
            args: { plan: resolvedPlan }
        };
    }
    return decision?.action === 'answer' ? decision : null;
}

function buildReasonerPrompt(context = {}) {
    const resolvedPlan = resolvedPlanFromContext(context);
    const safeContext = sanitizeFinancialEvidenceValue({
        message: boundedText(context.message, 700),
        trajectory: context.trajectory || null,
        resolvedPlan,
        allowedCapabilities: context.allowedCapabilities || [],
        remainingReads: Number(context.remainingReads || 0),
        evidenceHistory: context.evidenceHistory || []
    });
    return [
        'Você é um investigador financeiro familiar estritamente read-only.',
        'Escolha uma ferramenta semântica permitida, responda usando somente a evidência recebida ou peça esclarecimento.',
        'Nunca escolha usuário, família, planilha, tenant ou fonte. Nunca escreva, não faça SQL livre e não calcule valores financeiros.',
        'Quando precisar de um número, solicite uma ferramenta que o calcule. Não trate fonte indisponível como zero ou ausência.',
        'Plano resolvido server-side: quando resolvedPlan estiver presente, execute primeiro query_financial_plan com esse plan exatamente, sem trocar filtros, periodo, escopo, agrupamento ou base temporal.',
        'Com resolvedPlan, nao peca novamente pessoa, escopo, periodo, categoria ou dimensao; esses campos ja foram resolvidos pelo servidor.',
        'Depois de uma leitura compatível com cobertura available ou empty, responda assim que a evidência for suficiente e nao faca leituras auxiliares redundantes.',
        'Em ranking, responda com um prefixo continuo iniciado no primeiro colocado, preserve a ordem exata da evidencia e nao pule itens para citar colocados posteriores.',
        'Copie somente valores presentes na evidencia; nao invente totais, percentuais ou contagens.',
        'Use clarify somente quando resolvedPlan estiver ausente ou marcado com needsContext=true e faltar contexto indispensavel.',
        'Retorne somente JSON válido em um destes formatos:',
        '{"action":"tool","tool":"nome_permitido","args":{}}',
        '{"action":"answer","answer":"texto sustentado pela evidência"}',
        '{"action":"clarify","question":"pergunta objetiva"}',
        `Contexto sanitizado: ${JSON.stringify(safeContext)}`
    ].join('\n');
}

function createIterativeCostGuard(env = process.env) {
    return createFinancialAgentCostGuard({
        env: {
            ...env,
            FINANCIAL_AGENT_MAX_MODEL_CALLS_PER_QUESTION:
                env.FINANCIAL_ITERATIVE_REASONER_MAX_MODEL_CALLS_PER_QUESTION || '4',
            FINANCIAL_AGENT_MAX_MODEL_CALLS_PER_MONTH:
                env.FINANCIAL_ITERATIVE_REASONER_MAX_MODEL_CALLS_PER_MONTH || '240',
            FINANCIAL_AGENT_COST_STATE_PATH:
                env.FINANCIAL_ITERATIVE_REASONER_COST_STATE_PATH ||
                path.resolve(process.cwd(), 'data', 'financial-iterative-reasoner-cost-usage.json')
        },
        statePath: env.FINANCIAL_ITERATIVE_REASONER_COST_STATE_PATH ||
            path.resolve(process.cwd(), 'data', 'financial-iterative-reasoner-cost-usage.json')
    });
}

function getReasonerTimeoutMs(env = process.env) {
    return Math.max(
        1000,
        Math.min(
            30000,
            Number.parseInt(env.FINANCIAL_ITERATIVE_REASONER_TIMEOUT_MS, 10) ||
                DEFAULT_REASONER_TIMEOUT_MS
        )
    );
}

function buildReasonerResponseFormat({ resolvedPlan = null, hasEvidence = false } = {}) {
    if (resolvedPlan && hasEvidence) {
        return {
            type: 'json_schema',
            json_schema: {
                name: 'financial_readonly_answer',
                strict: true,
                schema: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', enum: ['answer'] },
                        answer: { type: 'string' }
                    },
                    required: ['action', 'answer'],
                    additionalProperties: false
                }
            }
        };
    }
    return { type: 'json_object' };
}

function createFinancialIterativeReasoner({
    env = process.env,
    fetchImpl = global.fetch,
    costGuard = null
} = {}) {
    const apiKey = String(env.OPENROUTER_API_KEY || '').trim();
    if (!apiKey || typeof fetchImpl !== 'function') return null;
    const model = String(env.FINANCIAL_ITERATIVE_REASONER_MODEL || 'openai/gpt-5.6-terra').trim();
    const timeoutMs = getReasonerTimeoutMs(env);
    const guard = costGuard || createIterativeCostGuard(env);

    return async (context = {}) => {
        const resolvedPlan = resolvedPlanFromContext(context);
        const hasEvidence = Array.isArray(context.evidenceHistory) && context.evidenceHistory.length > 0;
        const deterministicDecision = enforceResolvedPlanDecision({ resolvedPlan, hasEvidence });
        if (deterministicDecision) return deterministicDecision;

        const reservation = guard.reserveModelCall('iterative_reasoner');
        if (!reservation?.allowed) throw new Error(`reasoner_budget_${reservation?.reason || 'unavailable'}`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'X-Title': 'FinancasBot iterative read-only canary'
                },
                body: JSON.stringify({
                    model,
                    temperature: 0,
                    max_tokens: 700,
                    provider: { require_parameters: true },
                    response_format: buildReasonerResponseFormat({ resolvedPlan, hasEvidence }),
                    messages: [{ role: 'user', content: buildReasonerPrompt(context) }]
                }),
                signal: controller.signal
            });
            if (!response?.ok) throw new Error('reasoner_http_failure');
            const payload = await response.json();
            const parsed = parseJsonContent(payload?.choices?.[0]?.message?.content);
            const decision = enforceResolvedPlanDecision({
                decision: normalizeReasonerDecision(parsed),
                resolvedPlan,
                hasEvidence
            });
            if (!decision) throw new Error('reasoner_invalid_decision');
            return decision;
        } finally {
            clearTimeout(timeout);
        }
    };
}

module.exports = {
    createFinancialIterativeReasoner,
    __test__: {
        normalizeReasonerDecision,
        parseJsonContent,
        buildReasonerPrompt,
        resolvedPlanFromContext,
        enforceResolvedPlanDecision,
        containsBlockedArgumentKey,
        createIterativeCostGuard,
        getReasonerTimeoutMs,
        buildReasonerResponseFormat
    }
};
