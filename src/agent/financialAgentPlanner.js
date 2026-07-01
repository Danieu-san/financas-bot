const { normalizeText } = require('../utils/helpers');
const { getStructuredResponseFromLLM } = require('../services/gemini');
const { validateSafeReadonlySql } = require('./safeReadonlySql');
const { DEFAULT_EVENT_TYPES } = require('./financialAgentTools');
const { normalizeFinancialQueryPlan } = require('../query/financialQueryPlan');

const ALLOWED_AGENT_TOOLS = new Set([
    'query_financial_plan',
    'list_recent_transactions',
    'run_safe_readonly_sql',
    'get_dashboard_snapshot',
    'explain_metric'
]);
const FINANCIAL_REFERENCE_TIME_ZONE = 'America/Sao_Paulo';
let structuredResponseOverrideForTest = null;

function truthy(value) {
    return ['1', 'true', 'sim', 'yes', 'on', 'enabled', 'ativo'].includes(normalizeText(value));
}

function isLlmPlannerEnabled(env = process.env) {
    return truthy(env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED);
}

function formatReferenceDate(referenceDate = new Date()) {
    const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
    if (Number.isNaN(date.getTime())) return formatReferenceDate(new Date());
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: FINANCIAL_REFERENCE_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function buildPlannerPrompt(message = '', { referenceDate = new Date() } = {}) {
    const referenceDateIso = formatReferenceDate(referenceDate);
    const [referenceYear, referenceMonth] = referenceDateIso.split('-').map(Number);
    const referenceMonthIndex = referenceMonth - 1;
    return [
        'Voce e um planner de ferramenta para um assistente financeiro familiar.',
        'Retorne APENAS JSON valido. Nao calcule valores. Nao escreva resposta final.',
        `Data de referencia: ${referenceDateIso}. Mes atual humano: ${referenceMonth}. Indice de mes para FinancialQueryPlan: ${referenceMonthIndex}. Ano atual: ${referenceYear}.`,
        '',
        'Ferramentas permitidas:',
        '- query_financial_plan: para perguntas sobre domínios já conhecidos. Args: plan.',
        '- list_recent_transactions: para ultimo/ultimos lancamentos. Args: eventTypes, limit, card opcional.',
        '- run_safe_readonly_sql: para consultas read-only flexiveis.',
        '- get_dashboard_snapshot: para resumo deterministico do dashboard. Args: month, year.',
        '- explain_metric: explica saldo, disponivel, categorias, orcamento ou lancamentos recentes. Args: metric, month, year.',
        '',
        'Tabela SQL publica allowlisted: financial_events_public.',
        'Colunas publicas: date, iso_date, year, month, weekday, event_type, amount, description, category, subcategory, person, payment_method, card, billing_month, due_date, source.',
        'Tipos de evento: expense, card_expense, income, transfer, goal, debt, bill.',
        '',
        'Regras obrigatorias:',
        '- Nunca use user_id, sheet_id, spreadsheet_id, token, oauth, prompt, owner_hash ou dados internos.',
        '- Prefira query_financial_plan para gastos, cartoes, entradas, transferencias, orcamento, metas, dividas e contas.',
        '- SQL deve ser somente SELECT, usar somente financial_events_public e conter LIMIT.',
        '- Se a pergunta pedir escrita, admin, OAuth, dados internos ou bypass, retorne block.',
        '- Interprete hoje, ontem, esta semana, este mes e do mes usando a data de referencia.',
        '- Em FinancialQueryPlan, period.month e zero-based: janeiro=0, fevereiro=1, ..., junho=5, dezembro=11.',
        '- Se a pergunta disser lancamento, movimento ou transacao sem restringir tipo, use todos os event_type publicos relevantes.',
        '- Preserve a quantidade solicitada em limit e, quando o usuario nomear um cartao, preserve esse nome em card.',
        '- Se faltar periodo/criterio essencial, retorne clarify.',
        '',
        'Formato:',
        '{"action":"tool","tool":"query_financial_plan","args":{"plan":{"kind":"financial_query","domain":"bills","operation":"list","filters":{"period":{"type":"month","month":5,"year":2026},"status":"pending"},"sort":{"by":"due_date","direction":"asc"},"timeBasis":"due_date"}}}',
        '{"action":"tool","tool":"run_safe_readonly_sql","args":{"sql":"SELECT ... LIMIT 20"}}',
        '{"action":"tool","tool":"list_recent_transactions","args":{"eventTypes":["card_expense"],"limit":4,"card":"Nubank - Thais"}}',
        '{"action":"tool","tool":"get_dashboard_snapshot","args":{"month":5,"year":2026}}',
        '{"action":"tool","tool":"explain_metric","args":{"metric":"available","month":5,"year":2026}}',
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
                limit: Math.max(1, Math.min(20, Number.parseInt(args.limit, 10) || 5)),
                card: String(args.card || '').trim().slice(0, 120) || undefined,
            },
            source: 'llm_planner'
        };
    }

    if (tool === 'get_dashboard_snapshot') {
        return {
            action: 'tool',
            tool,
            args: {
                month: Number.isInteger(Number(args.month)) ? Number(args.month) : undefined,
                year: Number.isInteger(Number(args.year)) ? Number(args.year) : undefined
            },
            source: 'llm_planner'
        };
    }

    if (tool === 'explain_metric') {
        const metric = String(args.metric || '').trim();
        if (!metric) return null;
        return {
            action: 'tool',
            tool,
            args: {
                metric,
                month: Number.isInteger(Number(args.month)) ? Number(args.month) : undefined,
                year: Number.isInteger(Number(args.year)) ? Number(args.year) : undefined
            },
            source: 'llm_planner'
        };
    }

    if (tool === 'query_financial_plan') {
        const normalized = normalizeFinancialQueryPlan(args.plan || {});
        if (!normalized.ok) {
            return {
                action: 'clarify',
                reason: 'invalid_financial_query_plan',
                question: 'Consigo analisar seus dados, mas preciso que você reformule essa pergunta financeira com mais contexto.'
            };
        }
        return {
            action: 'tool',
            tool,
            args: { plan: normalized.plan },
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

async function planWithGemini({ message = '', env = process.env, referenceDate = new Date() } = {}) {
    if (!isLlmPlannerEnabled(env)) return null;
    const planner = structuredResponseOverrideForTest || getStructuredResponseFromLLM;
    const response = await planner(buildPlannerPrompt(message, { referenceDate }));
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
        formatReferenceDate,
        normalizeEventTypes,
        setStructuredResponseOverrideForTest: (override) => {
            structuredResponseOverrideForTest = override;
        },
        truthy
    }
};
