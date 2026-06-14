const { normalizeText } = require('../utils/helpers');
const { getStructuredResponseFromLLM } = require('../services/gemini');
const { validateSafeReadonlySql } = require('./safeReadonlySql');
const { DEFAULT_EVENT_TYPES } = require('./financialAgentTools');

const ALLOWED_AGENT_TOOLS = new Set([
    'list_recent_transactions',
    'run_safe_readonly_sql'
]);

function truthy(value) {
    return ['1', 'true', 'sim', 'yes', 'on', 'enabled', 'ativo'].includes(normalizeText(value));
}

function isLlmPlannerEnabled(env = process.env) {
    return truthy(env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED);
}

function buildPlannerPrompt(message = '') {
    return [
        'Voce e um planner de ferramenta para um assistente financeiro familiar.',
        'Retorne APENAS JSON valido. Nao calcule valores. Nao escreva resposta final.',
        '',
        'Ferramentas permitidas:',
        '- list_recent_transactions: para ultimo/ultimos lancamentos. Args: eventTypes, limit.',
        '- run_safe_readonly_sql: para consultas read-only flexiveis.',
        '',
        'Tabela SQL publica allowlisted: financial_events_public.',
        'Colunas publicas: date, iso_date, year, month, weekday, event_type, amount, description, category, subcategory, person, payment_method, card, billing_month, due_date, source.',
        'Tipos de evento: expense, card_expense, income, transfer, goal, debt, bill.',
        '',
        'Regras obrigatorias:',
        '- Nunca use user_id, sheet_id, spreadsheet_id, token, oauth, prompt, owner_hash ou dados internos.',
        '- SQL deve ser somente SELECT, usar somente financial_events_public e conter LIMIT.',
        '- Se a pergunta pedir escrita, admin, OAuth, dados internos ou bypass, retorne block.',
        '- Se faltar periodo/criterio essencial, retorne clarify.',
        '',
        'Formato:',
        '{"action":"tool","tool":"run_safe_readonly_sql","args":{"sql":"SELECT ... LIMIT 20"}}',
        '{"action":"tool","tool":"list_recent_transactions","args":{"eventTypes":["expense"],"limit":1}}',
        '{"action":"clarify","question":"..."}',
        '{"action":"block","reason":"unsafe_request"}',
        '',
        `Pergunta do usuario: ${JSON.stringify(String(message || '').slice(0, 500))}`
    ].join('\n');
}

function normalizeEventTypes(eventTypes = []) {
    const allowed = new Set(DEFAULT_EVENT_TYPES);
    const normalized = (Array.isArray(eventTypes) ? eventTypes : [])
        .map(type => String(type || '').trim())
        .filter(type => allowed.has(type));
    return normalized.length ? normalized : DEFAULT_EVENT_TYPES;
}

function normalizePlannerPlan(rawPlan = {}) {
    const action = String(rawPlan?.action || '').trim();
    if (action === 'block') {
        return { action: 'block', reason: rawPlan.reason || 'unsafe_request' };
    }
    if (action === 'clarify') {
        const question = String(rawPlan.question || '').trim();
        return {
            action: 'clarify',
            reason: 'llm_clarification',
            question: question || 'Preciso de mais um detalhe para responder essa análise com segurança.'
        };
    }
    if (action !== 'tool') return null;

    const tool = String(rawPlan.tool || '').trim();
    if (!ALLOWED_AGENT_TOOLS.has(tool)) return null;

    const args = rawPlan.args || {};
    if (tool === 'list_recent_transactions') {
        return {
            action: 'tool',
            tool,
            args: {
                eventTypes: normalizeEventTypes(args.eventTypes),
                limit: Math.max(1, Math.min(20, Number.parseInt(args.limit, 10) || 5))
            },
            source: 'llm_planner'
        };
    }

    if (tool === 'run_safe_readonly_sql') {
        const sql = String(args.sql || '').trim();
        const validation = validateSafeReadonlySql(sql);
        if (!validation.ok) {
            return {
                action: 'clarify',
                reason: `unsafe_sql_${validation.reason}`,
                question: 'Consigo analisar seus dados, mas essa pergunta precisa ser reformulada para uma consulta segura.'
            };
        }
        return {
            action: 'tool',
            tool,
            args: {
                sql,
                limit: Math.max(1, Math.min(100, Number.parseInt(args.limit, 10) || 50))
            },
            source: 'llm_planner'
        };
    }

    return null;
}

async function planWithGemini({ message = '', env = process.env } = {}) {
    if (!isLlmPlannerEnabled(env)) return null;
    const response = await getStructuredResponseFromLLM(buildPlannerPrompt(message));
    if (!response || response.error) return null;
    return normalizePlannerPlan(response);
}

module.exports = {
    ALLOWED_AGENT_TOOLS,
    buildPlannerPrompt,
    isLlmPlannerEnabled,
    normalizePlannerPlan,
    planWithGemini,
    __test__: {
        normalizeEventTypes,
        truthy
    }
};
