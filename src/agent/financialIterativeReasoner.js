const { sanitizeFinancialEvidenceValue } = require('./financialSemanticReadFacade');
const path = require('node:path');
const { createFinancialAgentCostGuard } = require('./financialAgentCostPolicy');

const BLOCKED_ARGUMENT_KEYS = /(?:^|_)(?:user|owner|sheet|spreadsheet|tenant|oauth|token|secret|password)(?:_|$)/i;

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

function buildReasonerPrompt(context = {}) {
    const safeContext = sanitizeFinancialEvidenceValue({
        message: boundedText(context.message, 700),
        trajectory: context.trajectory || null,
        allowedCapabilities: context.allowedCapabilities || [],
        remainingReads: Number(context.remainingReads || 0),
        evidenceHistory: context.evidenceHistory || []
    });
    return [
        'Você é um investigador financeiro familiar estritamente read-only.',
        'Escolha uma ferramenta semântica permitida, responda usando somente a evidência recebida ou peça esclarecimento.',
        'Nunca escolha usuário, família, planilha, tenant ou fonte. Nunca escreva, não faça SQL livre e não calcule valores financeiros.',
        'Quando precisar de um número, solicite uma ferramenta que o calcule. Não trate fonte indisponível como zero ou ausência.',
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

function createFinancialIterativeReasoner({
    env = process.env,
    fetchImpl = global.fetch,
    costGuard = null
} = {}) {
    const apiKey = String(env.OPENROUTER_API_KEY || '').trim();
    if (!apiKey || typeof fetchImpl !== 'function') return null;
    const model = String(env.FINANCIAL_ITERATIVE_REASONER_MODEL || 'openai/gpt-5.6-terra').trim();
    const timeoutMs = Math.max(1000, Math.min(30000, Number.parseInt(env.FINANCIAL_ITERATIVE_REASONER_TIMEOUT_MS, 10) || 12000));
    const guard = costGuard || createIterativeCostGuard(env);

    return async (context = {}) => {
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
                    messages: [{ role: 'user', content: buildReasonerPrompt(context) }]
                }),
                signal: controller.signal
            });
            if (!response?.ok) throw new Error('reasoner_http_failure');
            const payload = await response.json();
            const parsed = parseJsonContent(payload?.choices?.[0]?.message?.content);
            const decision = normalizeReasonerDecision(parsed);
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
        containsBlockedArgumentKey,
        createIterativeCostGuard
    }
};
