import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeText, parseSheetDate } = require('../utils/helpers');
const {
    listRecentTransactions,
    runSafeReadonlySqlTool,
    queryFinancialPlanTool,
    getDashboardSnapshotTool,
    explainMetricTool
} = require('./financialAgentTools');
const { verifyAgentAnswer } = require('./resultVerifier');
const { planWithGemini } = require('./financialAgentPlanner');

const AgentState = Annotation.Root({
    message: Annotation(),
    userIds: Annotation(),
    ownerUserId: Annotation(),
    personByUserId: Annotation(),
    financialQueryPlan: Annotation(),
    currentDate: Annotation(),
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

function latestTransactionIntro(type) {
    const labels = {
        expense: 'Sua última saída',
        card_expense: 'Seu último gasto no cartão',
        income: 'Sua última entrada',
        transfer: 'Sua última transferência',
        goal: 'Sua última meta',
        debt: 'Sua última dívida',
        bill: 'Sua última conta'
    };
    return labels[type] || `Seu último ${eventTypeLabel(type)}`;
}

function domainLabel(domain) {
    const labels = {
        expenses: 'gastos',
        cards: 'cartões/faturas',
        income: 'entradas',
        transfers: 'transferências/reserva',
        budget: 'orçamento',
        goals: 'metas',
        debts: 'dívidas',
        bills: 'contas',
        dashboard: 'dashboard'
    };
    return labels[domain] || 'análise financeira';
}

function extremeItemLabel(domain) {
    const labels = {
        expenses: 'gasto',
        cards: 'gasto no cartão',
        income: 'entrada',
        transfers: 'transferência',
        goals: 'meta',
        debts: 'dívida',
        bills: 'conta'
    };
    return labels[domain] || 'resultado';
}

function unsafeMessage(normalized) {
    return /\b(sheet[\s_-]*id|user[\s_-]*id|token|segredo|secret|prompt|regras internas|bypass|modo admin|todos os usuarios|todos os usuários)\b/.test(normalized);
}

function inferDashboardMetric(normalized) {
    if (/disponivel|disponível|caixinha|reserva/.test(normalized)) return 'available';
    if (/categoria/.test(normalized)) return 'categories';
    if (/orcamento|orçamento|ritmo/.test(normalized)) return 'budget';
    if (/recente|ultimo|último|lancamento|lançamento/.test(normalized)) return 'recentTransactions';
    return 'balance';
}

function isDashboardNavigationRequest(normalized) {
    if (!normalized.includes('dashboard')) return false;
    if (/\b(?:sem|nao|não)\s+(?:quero\s+)?(?:abrir|alterar|enviar|gerar|mudar|trocar)\b/.test(normalized)) {
        return false;
    }
    return /\b(abra|abrir|altere|alterar|envia|enviar|envie|gere|gerar|link|mude|mudar|troque|trocar)\b/.test(normalized);
}

function referenceMonthFromCurrentDate(currentDate = '') {
    const parsed = parseSheetDate(currentDate) || new Date();
    return { year: parsed.getFullYear(), month: parsed.getMonth() };
}

function buildFallbackWeekdaySql(currentDate = '') {
    const { year, month } = referenceMonthFromCurrentDate(currentDate);
    return `
        SELECT weekday, SUM(amount) AS total, COUNT(*) AS count
        FROM financial_events_public
        WHERE event_type IN ('expense', 'card_expense')
          AND year = ${year}
          AND month = ${month}
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

    if (/dia da semana/.test(normalized) && /(gasto|despesa|compra|compras|compro)/.test(normalized)) {
        return {
            plan: {
                action: 'tool',
                tool: 'run_safe_readonly_sql',
                args: { sql: buildFallbackWeekdaySql(state.currentDate), limit: 10 }
            },
            action: 'tool'
        };
    }

    if (state.financialQueryPlan) {
        if (state.financialQueryPlan.domain === 'dashboard') {
            if (state.financialQueryPlan.operation === 'explain') {
                return {
                    plan: {
                        action: 'tool',
                        tool: 'explain_metric',
                        args: {
                            metric: inferDashboardMetric(normalized),
                            month: state.financialQueryPlan.filters?.period?.month,
                            year: state.financialQueryPlan.filters?.period?.year
                        }
                    },
                    action: 'tool'
                };
            }
            return {
                plan: {
                    action: 'tool',
                    tool: 'get_dashboard_snapshot',
                    args: {
                        month: state.financialQueryPlan.filters?.period?.month,
                        year: state.financialQueryPlan.filters?.period?.year
                    }
                },
                action: 'tool'
            };
        }
        return {
            plan: {
                action: 'tool',
                tool: 'query_financial_plan',
                args: { plan: state.financialQueryPlan }
            },
            action: 'tool'
        };
    }

    if (isDashboardNavigationRequest(normalized)) {
        return {
            plan: {
                action: 'clarify',
                question: 'Você quer abrir o dashboard ou consultar algum indicador financeiro aqui na conversa?'
            },
            action: 'clarify'
        };
    }

    if (/(dashboard|resumo financeiro)/.test(normalized)) {
        const wantsExplanation = /(por que|explique|explica|criterio|critério)/.test(normalized);
        return {
            plan: {
                action: 'tool',
                tool: wantsExplanation ? 'explain_metric' : 'get_dashboard_snapshot',
                args: wantsExplanation ? { metric: inferDashboardMetric(normalized) } : {}
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
        ownerUserId: state.ownerUserId || state.userIds?.[0] || '',
        personByUserId: state.personByUserId || {},
        currentDate: state.currentDate || ''
    };
    if (plan.tool === 'list_recent_transactions') {
        return { toolResult: await listRecentTransactions({ ...common, ...(plan.args || {}) }) };
    }
    if (plan.tool === 'run_safe_readonly_sql') {
        return { toolResult: await runSafeReadonlySqlTool({ ...common, ...(plan.args || {}) }) };
    }
    if (plan.tool === 'query_financial_plan') {
        return { toolResult: await queryFinancialPlanTool({ ...common, ...(plan.args || {}) }) };
    }
    if (plan.tool === 'get_dashboard_snapshot') {
        return { toolResult: await getDashboardSnapshotTool({ ...common, ...(plan.args || {}) }) };
    }
    if (plan.tool === 'explain_metric') {
        return { toolResult: await explainMetricTool({ ...common, ...(plan.args || {}) }) };
    }
    return { toolResult: { ok: false, reason: 'tool_not_allowed', rows: [] } };
}

function valueFromItem(item = {}) {
    const candidates = ['total', 'value', 'amount', 'current', 'balance', 'saldo', 'expected', 'remaining'];
    for (const key of candidates) {
        if (Number.isFinite(Number(item?.[key]))) return Number(item[key]);
    }
    return null;
}

function labelFromItem(item = {}) {
    return item.label || item.description || item.name || item.category || item.card || item.monthLabel || item.month || 'item';
}

function composeList(items = [], title = 'Resultados') {
    const safeItems = Array.isArray(items) ? items.slice(0, 10) : [];
    if (safeItems.length === 0) return `${title}: nenhum item encontrado.`;
    const lines = safeItems.map((item, index) => {
        const value = valueFromItem(item);
        const count = Number.isFinite(Number(item?.count)) ? `, ${Number(item.count)} lançamento(s)` : '';
        return `${index + 1}. ${labelFromItem(item)}${value === null ? '' : `: ${moneyBR(value)}`}${count}`;
    });
    return `${title}:\n${lines.join('\n')}`;
}

function describeExtremeItem(item = {}) {
    const description = item.description || item.label || 'sem descrição';
    const value = moneyBR(item.value ?? item.total ?? item.amount ?? 0);
    const date = item.date ? ` em ${item.date}` : '';
    const category = item.category ? ` · ${item.category}` : '';
    const source = item.card || item.source ? ` · ${item.card || item.source}` : '';
    return `${description}: ${value}${date}${category}${source}`;
}

function composeBudgetAnswer(summary = {}) {
    if (!summary.active) {
        return summary.criteria || 'Nenhum orçamento mensal livre está ativo neste escopo.';
    }
    return [
        'Orçamento do ciclo:',
        `- Limite mensal: ${moneyBR(summary.monthlyAmount || 0)}`,
        `- Gasto no ciclo: ${moneyBR(summary.cycleSpent || 0)}`,
        `- Restante no ciclo: ${moneyBR(summary.remainingInCycle || 0)}`,
        `- Gasto hoje: ${moneyBR(summary.todaySpent || 0)}`,
        `- Ritmo recomendado hoje: ${moneyBR(summary.dailyRecommendedAmount || 0)}`,
        `- Dias restantes: ${Number(summary.daysRemaining || 0)}`,
        summary.period?.label ? `- Ciclo: ${summary.period.label}` : '',
        summary.criteria
    ].filter(Boolean).join('\n');
}

function composeComparisonAnswer(title, value = {}) {
    const difference = Number(value.difference || 0);
    const direction = difference > 0 ? 'aumentaram' : difference < 0 ? 'diminuíram' : 'ficaram iguais';
    return [
        `Comparação de ${title}:`,
        `- Período atual: ${moneyBR(value.current || 0)}`,
        `- Período anterior: ${moneyBR(value.previous || 0)}`,
        `- Diferença: ${moneyBR(difference)} (${Number(value.percent || 0).toLocaleString('pt-BR')}%, ${direction})`
    ].join('\n');
}

function composeDailyAverageAnswer(value = {}) {
    return [
        `Média diária de gastos: ${moneyBR(value.average || 0)} por dia.`,
        `Total considerado: ${moneyBR(value.total || 0)} em ${Number(value.daysConsidered || 0)} dia(s) considerado(s).`,
        Number.isFinite(Number(value.count)) ? `Lançamentos considerados: ${Number(value.count)}.` : ''
    ].filter(Boolean).join('\n');
}

function composeRecommendationAnswer(value = {}) {
    const lines = ['Candidatos para revisar:'];
    const candidates = Array.isArray(value.candidates) ? value.candidates : [];
    if (candidates.length === 0) {
        lines.push('Não encontrei uma categoria claramente revisável neste período.');
    } else {
        candidates.slice(0, 5).forEach((item, index) => {
            lines.push(`${index + 1}. ${labelFromItem(item)}: ${moneyBR(valueFromItem(item) || 0)}, ${Number(item.count || 0)} lançamento(s)`);
        });
    }
    const protectedGroups = Array.isArray(value.protectedGroups) ? value.protectedGroups : [];
    if (protectedGroups.length > 0) {
        lines.push(`Separei como despesas essenciais: ${protectedGroups.slice(0, 5).map(labelFromItem).join(', ')}.`);
    }
    if (value.criteria) lines.push(value.criteria);
    if (value.disclaimer) lines.push(value.disclaimer);
    return lines.join('\n');
}

function composeFinancialPlanAnswer(toolResult = {}) {
    const plan = toolResult.plan || {};
    const result = toolResult.result || {};
    const value = result.value;
    const details = result.details || {};
    const title = domainLabel(plan.domain);
    const criteria = details.criteria || value?.criteria || '';

    if (plan.domain === 'budget' && value && typeof value === 'object' && !Array.isArray(value)) {
        return composeBudgetAnswer(value);
    }

    let body = '';
    if (plan.operation === 'count') {
        body = `Contagem de ${title}: ${Number(value || 0)}.`;
    } else if (plan.operation === 'average' && value?.average !== undefined) {
        body = composeDailyAverageAnswer(value);
    } else if (plan.operation === 'compare' && value?.current !== undefined && value?.previous !== undefined) {
        body = composeComparisonAnswer(title, value);
    } else if (plan.operation === 'recommend' && value && typeof value === 'object' && Array.isArray(value.candidates)) {
        body = composeRecommendationAnswer(value);
    } else if (typeof value === 'number') {
        body = `${title.charAt(0).toUpperCase() + title.slice(1)}: ${moneyBR(value)}.`;
    } else if (Array.isArray(value)) {
        body = composeList(value, title.charAt(0).toUpperCase() + title.slice(1));
    } else if (value?.percent !== undefined) {
        body = `${title.charAt(0).toUpperCase() + title.slice(1)} representam ${Number(value.percent || 0).toLocaleString('pt-BR')}%: ${moneyBR(value.part || 0)} de ${moneyBR(value.total || 0)}.`;
    } else if (plan.operation === 'extreme' && value?.max && value?.min) {
        const itemLabel = extremeItemLabel(plan.domain);
        body = [
            `Maior ${itemLabel}: ${describeExtremeItem(value.max)}.`,
            `Menor ${itemLabel}: ${describeExtremeItem(value.min)}.`
        ].join('\n');
    } else if (Array.isArray(value?.items)) {
        const totalLine = value.total !== undefined ? `Total: ${moneyBR(value.total)}.\n` : '';
        body = `${totalLine}${composeList(value.items, title.charAt(0).toUpperCase() + title.slice(1))}`;
    } else if (value && typeof value === 'object') {
        const numericEntries = Object.entries(value)
            .filter(([, item]) => typeof item === 'number' && Number.isFinite(item))
            .slice(0, 8);
        if (numericEntries.length > 0) {
            body = `${title.charAt(0).toUpperCase() + title.slice(1)}:\n${numericEntries
                .map(([key, item]) => `- ${key}: ${moneyBR(item)}`)
                .join('\n')}`;
        }
    }

    if (!body) {
        body = `Consegui analisar ${title}, mas o resultado precisa de uma apresentação mais específica.`;
    }
    const basis = plan.timeBasis ? `Critério temporal: ${plan.timeBasis}.` : '';
    return [body, criteria, basis].filter(Boolean).join('\n');
}

function composeDashboardAnswer(snapshot = {}) {
    const kpis = snapshot.kpis || {};
    return [
        'Resumo financeiro:',
        `- Entradas: ${moneyBR(kpis.entradas || 0)}`,
        `- Saídas: ${moneyBR(kpis.saidas || 0)}`,
        `- Cartões: ${moneyBR(kpis.cartoes || 0)}`,
        `- Saldo: ${moneyBR(kpis.saldo || 0)}`,
        `- Disponível estimado: ${moneyBR(kpis.saldoDisponivelEstimado ?? kpis.saldo ?? 0)}`,
        snapshot.criteria?.balance,
        snapshot.criteria?.available
    ].filter(Boolean).join('\n');
}

function composeMetricExplanation(result = {}) {
    const lines = [`Explicação de ${result.metric || 'métrica'}:`];
    if (Array.isArray(result.components)) {
        lines.push(composeList(result.components, 'Componentes'));
    } else {
        Object.entries(result.components || {}).slice(0, 10).forEach(([key, value]) => {
            if (typeof value === 'number') lines.push(`- ${key}: ${moneyBR(value)}`);
        });
    }
    if (result.criteria) lines.push(result.criteria);
    return lines.join('\n');
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
        const normalizedMessage = normalizeText(state.message || '');
        if (/\b(data|dia)\b/.test(normalizedMessage)) {
            return {
                answer: `A data do seu último lançamento é ${item.date}. Item: ${item.description || 'sem descrição'}, ${moneyBR(item.amount)} (${item.person}).`,
                action: 'answer'
            };
        }
        return {
            answer: `${latestTransactionIntro(item.event_type)} foi em ${item.date}: ${item.description || 'sem descrição'}, ${moneyBR(item.amount)} (${item.person}).`,
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
    if (plan.tool === 'query_financial_plan') {
        return { answer: composeFinancialPlanAnswer(result), action: 'answer' };
    }
    if (plan.tool === 'get_dashboard_snapshot') {
        return { answer: composeDashboardAnswer(result.snapshot || {}), action: 'answer' };
    }
    if (plan.tool === 'explain_metric') {
        return { answer: composeMetricExplanation(result), action: 'answer' };
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
        ownerUserId: input.ownerUserId || input.userIds?.[0] || '',
        personByUserId: input.personByUserId || {},
        financialQueryPlan: input.financialQueryPlan || null,
        currentDate: input.currentDate || '',
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
