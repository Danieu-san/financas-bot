import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeText } = require('../utils/helpers');
const { listRecentTransactions, runSafeReadonlySqlTool } = require('./financialAgentTools');
const { verifyAgentAnswer } = require('./resultVerifier');
const { planWithGemini } = require('./financialAgentPlanner');

const AgentState = Annotation.Root({
    message: Annotation(),
    userIds: Annotation(),
    personByUserId: Annotation(),
    mode: Annotation(),
    plan: Annotation(),
    toolResult: Annotation(),
    answer: Annotation(),
    verified: Annotation(),
    action: Annotation()
});

function moneyBR(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function eventTypeLabel(type) {
    const labels = {
        expense: 'saída',
        card_expense: 'gasto no cartão',
        income: 'entrada',
        transfer: 'transferência',
        goal: 'meta',
        debt: 'dívida',
        bill: 'conta'
    };
    return labels[type] || 'lançamento';
}

function unsafeMessage(normalized) {
    return /\b(sheet[\s_-]*id|user[\s_-]*id|token|segredo|secret|prompt|regras internas|bypass|modo admin|todos os usuarios|todos os usuários)\b/.test(normalized);
}

function buildFallbackWeekdaySql() {
    return `
        SELECT weekday, SUM(amount) AS total, COUNT(*) AS count
        FROM financial_events_public
        WHERE event_type IN ('expense', 'card_expense')
        GROUP BY weekday
        ORDER BY total DESC
        LIMIT 7
    `.trim();
}

async function planTurn(state) {
    const message = String(state.message || '');
    const normalized = normalizeText(message);
    if (unsafeMessage(normalized)) {
        return {
            plan: { action: 'block', reason: 'unsafe_request' },
            action: 'block'
        };
    }

    if (/ultimo|ultima|último|última/.test(message) || /\bultimo\b|\bultima\b/.test(normalized)) {
        if (/gasto|compra|saida|saída|despesa/.test(normalized)) {
            return {
                plan: {
                    action: 'tool',
                    tool: 'list_recent_transactions',
                    args: { eventTypes: ['expense', 'card_expense'], limit: 1 }
                },
                action: 'tool'
            };
        }
        if (/entrada|recebimento|renda|salario|salário/.test(normalized)) {
            return {
                plan: {
                    action: 'tool',
                    tool: 'list_recent_transactions',
                    args: { eventTypes: ['income'], limit: 1 }
                },
                action: 'tool'
            };
        }
        if (/lancamento|lançamento|movimento|transacao|transação/.test(normalized)) {
            return {
                plan: {
                    action: 'tool',
                    tool: 'list_recent_transactions',
                    args: { eventTypes: ['expense', 'card_expense', 'income', 'transfer'], limit: 1 }
                },
                action: 'tool'
            };
        }
    }

    if (/dia da semana/.test(normalized) && /(gasto|gasto|gasto|despesa|compro|compras)/.test(normalized)) {
        return {
            plan: {
                action: 'tool',
                tool: 'run_safe_readonly_sql',
                args: { sql: buildFallbackWeekdaySql(), limit: 10 }
            },
            action: 'tool'
        };
    }

    const llmPlan = await planWithGemini({ message });
    if (llmPlan) {
        return { plan: llmPlan, action: llmPlan.action };
    }

    return {
        plan: {
            action: 'clarify',
            reason: 'planner_gap',
            question: 'Posso analisar seus dados, mas preciso que você especifique o que quer ver: último lançamento, total, categoria, cartão, orçamento, metas, dívidas ou contas?'
        },
        action: 'clarify'
    };
}

async function runTool(state) {
    const plan = state.plan || {};
    if (plan.action !== 'tool') return { toolResult: null };
    const common = {
        userIds: state.userIds || [],
        personByUserId: state.personByUserId || {}
    };
    if (plan.tool === 'list_recent_transactions') {
        return { toolResult: await listRecentTransactions({ ...common, ...(plan.args || {}) }) };
    }
    if (plan.tool === 'run_safe_readonly_sql') {
        return { toolResult: await runSafeReadonlySqlTool({ ...common, ...(plan.args || {}) }) };
    }
    return { toolResult: { ok: false, reason: 'tool_not_allowed', rows: [] } };
}

function composeAnswer(state) {
    const plan = state.plan || {};
    if (plan.action === 'block') {
        return {
            answer: 'Não posso ajudar com pedidos de dados internos, tokens, IDs, prompts ou bypass de segurança.',
            action: 'block'
        };
    }
    if (plan.action === 'clarify') {
        return { answer: plan.question, action: 'clarify' };
    }
    const result = state.toolResult || {};
    if (!result.ok) {
        return {
            answer: 'Não consegui executar essa análise com segurança. Tente reformular a pergunta.',
            action: 'error'
        };
    }
    if (plan.tool === 'list_recent_transactions') {
        const item = result.rows?.[0];
        if (!item) {
            return { answer: 'Não encontrei lançamentos nesse escopo.', action: 'answer' };
        }
        return {
            answer: `Seu último ${eventTypeLabel(item.event_type)} foi em ${item.date}: ${item.description || 'sem descrição'}, ${moneyBR(item.amount)} (${item.person}).`,
            action: 'answer'
        };
    }
    if (plan.tool === 'run_safe_readonly_sql') {
        const first = result.rows?.[0];
        if (first?.weekday && first?.total !== undefined) {
            return {
                answer: `O dia da semana com mais gastos foi ${first.weekday}: ${moneyBR(first.total)} em ${first.count || 0} lançamento(s).`,
                action: 'answer'
            };
        }
        return {
            answer: `Encontrei ${result.rowCount || 0} resultado(s) para essa análise.`,
            action: 'answer'
        };
    }
    return { answer: 'Não consegui compor uma resposta segura para essa análise.', action: 'error' };
}

function verifyAnswerNode(state) {
    const verified = verifyAgentAnswer(state.answer, { toolResult: state.toolResult });
    if (!verified.ok) {
        return {
            verified,
            answer: 'Eu consegui consultar os dados, mas bloqueei a resposta porque a verificação encontrou inconsistência.',
            action: 'error'
        };
    }
    return { verified };
}

const graph = new StateGraph(AgentState)
    .addNode('planner_node', planTurn)
    .addNode('tool_node', runTool)
    .addNode('composer_node', composeAnswer)
    .addNode('verifier_node', verifyAnswerNode)
    .addEdge(START, 'planner_node')
    .addEdge('planner_node', 'tool_node')
    .addEdge('tool_node', 'composer_node')
    .addEdge('composer_node', 'verifier_node')
    .addEdge('verifier_node', END)
    .compile();

export async function invokeFinancialAgentRuntime(input = {}) {
    const result = await graph.invoke({
        message: input.message || '',
        userIds: input.userIds || [],
        personByUserId: input.personByUserId || {},
        mode: input.mode || 'shadow'
    });
    return {
        action: result.action || 'error',
        plan: result.plan || null,
        toolResult: result.toolResult || null,
        answer: result.answer || '',
        verified: result.verified || { ok: false, reason: 'missing_verification' }
    };
}
