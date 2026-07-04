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
const {
    composeContextualFinancialAnswer,
    selectVerifiedContextualAnswer
} = require('./contextualFinancialAnalyst');
const stringSimilarity = require('string-similarity');
const { isSmallTypo } = require('../utils/textMatcher');

const AgentState = Annotation.Root({
    message: Annotation(),
    userIds: Annotation(),
    ownerUserId: Annotation(),
    personByUserId: Annotation(),
    financialQueryPlan: Annotation(),
    currentDate: Annotation(),
    canonicalLedgerDbPath: Annotation(),
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
        dashboard: 'dashboard',
        accounts: 'contas financeiras'
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

function hasApproximateConcept(normalized = '', concepts = [], threshold = 0.78) {
    const tokens = String(normalized || '').split(/[^a-z0-9]+/).filter(token => token.length >= 4);
    return concepts.some(concept => (
        tokens.includes(concept) ||
        tokens.some(token => isSmallTypo(token, concept)) ||
        tokens.some(token => stringSimilarity.compareTwoStrings(token, concept) >= threshold)
    ));
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

function currentMonthPeriod(currentDate = '') {
    const { year, month } = referenceMonthFromCurrentDate(currentDate);
    return { type: 'month', month, year };
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

function asksForExpenseCutRecommendation(normalized = '') {
    const wantsCut =
        /\b(cortar|economizar|reduzir|diminuir|poupar|enxugar|rever|revisar)\b/.test(normalized) ||
        /\bonde\s+(?:posso|da|daria|vale)\b/.test(normalized) ||
        /\bdesperdicio|desperdicios\b/.test(normalized);
    const talksAboutSpending = /\b(gasto|gastos|despesa|despesas|custo|custos|mes|mensal)\b/.test(normalized);
    return wantsCut && talksAboutSpending;
}

function asksForExpenseDrivers(normalized = '') {
    const wantsDrivers =
        /\b(vilao|viloes|responsavel|responsaveis|driver|drivers)\b/.test(normalized) ||
        /\b(puxou|puxaram|pesou|pesaram|pesa|pesando)\b/.test(normalized) ||
        /\bprincipais\s+(?:gastos|despesas|custos)\b/.test(normalized);
    const talksAboutSpending = /\b(gasto|gastos|despesa|despesas|mes|mensal)\b/.test(normalized);
    return wantsDrivers && talksAboutSpending;
}

function expensePlanFromSemanticOverride(state, normalized = '') {
    const incoming = state.financialQueryPlan || {};
    const filters = {
        ...(incoming.filters || {}),
        period: incoming.filters?.period || currentMonthPeriod(state.currentDate)
    };
    const base = {
        kind: 'financial_query',
        domain: 'expenses',
        filters,
        sort: { by: 'value', direction: 'desc' },
        limit: incoming.limit || 10,
        needsContext: false,
        timeBasis: incoming.timeBasis || 'billing_month'
    };

    if (asksForExpenseCutRecommendation(normalized)) {
        return {
            ...base,
            operation: 'recommend',
            groupBy: ['category'],
            answerStyle: 'audit',
            timeBasis: 'billing_month'
        };
    }

    if (asksForExpenseDrivers(normalized)) {
        return {
            ...base,
            operation: 'rank',
            groupBy: ['merchant'],
            answerStyle: 'short',
            timeBasis: 'billing_month'
        };
    }

    return null;
}

function accountPlanFromSemanticOverride(state, normalized = '') {
    const talksAboutAccount = /\b(conta|contas|caixinha|nubank|itau|itaú|banco|saldo)\b/.test(normalized);
    const asksBalance = /\b(saldo|quanto|tenho|temos|valor|disponivel|disponível)\b/.test(normalized);
    if (!talksAboutAccount || !asksBalance) return null;
    if (/\b(cartao|cartão|credito|crédito|fatura)\b/.test(normalized)) return null;

    const accountTerms = [];
    const knownPeople = Object.values(state.personByUserId || {})
        .map(person => normalizeText(String(person || '')).trim())
        .filter(Boolean);
    for (const person of knownPeople) {
        if (normalized.includes(person)) accountTerms.push(person);
    }
    if (/\bcaixinha\b/.test(normalized)) accountTerms.push('caixinha');
    if (/\bnubank\b/.test(normalized)) accountTerms.push('nubank');
    if (/\bitau|itaú\b/.test(normalized)) accountTerms.push('itau');
    const account = [...new Set(accountTerms)].join(' ').trim();
    return {
        kind: 'financial_query',
        domain: 'accounts',
        operation: account ? 'sum' : 'detail',
        filters: {
            ...(state.financialQueryPlan?.filters || {}),
            ...(account ? { account } : {})
        },
        sort: { by: 'name', direction: 'asc' },
        limit: 10,
        needsContext: false,
        timeBasis: 'current_state',
        answerStyle: 'detailed'
    };
}
async function planWithGeminiForState(state, message) {
    return await planWithGemini({
        message,
        referenceDate: parseSheetDate(state.currentDate) || new Date()
    });
}

function shouldUseLlmPlanOverLegacy(llmPlan, incomingQueryPlan = null) {
    if (!llmPlan) return false;
    if (llmPlan.action === 'block') return true;
    if (llmPlan.action !== 'tool') return false;

    const incomingDomain = String(incomingQueryPlan?.domain || '').trim();
    const dashboardTools = new Set(['get_dashboard_snapshot', 'explain_metric']);
    if (incomingDomain && incomingDomain !== 'dashboard' && dashboardTools.has(llmPlan.tool)) {
        return false;
    }

    if (incomingDomain === 'budget' && llmPlan.tool === 'query_financial_plan') {
        const llmQueryPlan = llmPlan.args?.plan || {};
        const incomingOperation = String(incomingQueryPlan.operation || '').trim();
        const incomingTimeBasis = String(incomingQueryPlan.timeBasis || '').trim();
        const incomingPeriodType = String(incomingQueryPlan.filters?.period?.type || '').trim();

        if (String(llmQueryPlan.domain || '').trim() !== incomingDomain) return false;
        if (String(llmQueryPlan.operation || '').trim() !== incomingOperation) return false;
        if (incomingTimeBasis && String(llmQueryPlan.timeBasis || '').trim() !== incomingTimeBasis) return false;
        if (
            incomingPeriodType &&
            String(llmQueryPlan.filters?.period?.type || '').trim() !== incomingPeriodType
        ) return false;
    }
    return true;
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

    const recentTransactionRequest = hasApproximateConcept(normalized, ['ultimo', 'ultima']) && (
        hasApproximateConcept(normalized, ['gasto', 'compra', 'saida', 'despesa']) ||
        hasApproximateConcept(normalized, ['entrada', 'recebimento', 'renda', 'salario']) ||
        hasApproximateConcept(normalized, ['lancamento', 'movimento', 'transacao'])
    );
    if (recentTransactionRequest) {
        const llmPlan = await planWithGeminiForState(state, message);
        if (llmPlan) {
            return { plan: llmPlan, action: llmPlan.action };
        }
    }
    if (hasApproximateConcept(normalized, ['ultimo', 'ultima'])) {
        if (hasApproximateConcept(normalized, ['gasto', 'compra', 'saida', 'despesa'])) {
            return {
                plan: {
                    action: 'tool',
                    tool: 'list_recent_transactions',
                    args: { eventTypes: ['expense', 'card_expense'], limit: 1 }
                },
                action: 'tool'
            };
        }
        if (hasApproximateConcept(normalized, ['entrada', 'recebimento', 'renda', 'salario'])) {
            return {
                plan: {
                    action: 'tool',
                    tool: 'list_recent_transactions',
                    args: { eventTypes: ['income'], limit: 1 }
                },
                action: 'tool'
            };
        }
        if (hasApproximateConcept(normalized, ['lancamento', 'movimento', 'transacao'])) {
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

    const accountPlan = accountPlanFromSemanticOverride(state, normalized);
    if (accountPlan) {
        return {
            plan: {
                action: 'tool',
                tool: 'query_financial_plan',
                args: { plan: accountPlan }
            },
            action: 'tool'
        };
    }
    if (state.financialQueryPlan) {
        const llmPlan = await planWithGeminiForState(state, message);
        if (shouldUseLlmPlanOverLegacy(llmPlan, state.financialQueryPlan)) {
            return { plan: llmPlan, action: llmPlan.action };
        }

        const semanticOverride = expensePlanFromSemanticOverride(state, normalized);
        if (semanticOverride) {
            return {
                plan: {
                    action: 'tool',
                    tool: 'query_financial_plan',
                    args: { plan: semanticOverride }
                },
                action: 'tool'
            };
        }
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

    const semanticPlan = expensePlanFromSemanticOverride(state, normalized);
    if (semanticPlan) {
        return {
            plan: {
                action: 'tool',
                tool: 'query_financial_plan',
                args: { plan: semanticPlan }
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

    const llmPlan = await planWithGeminiForState(state, message);
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
        currentDate: state.currentDate || '',
        canonicalLedgerDbPath: state.canonicalLedgerDbPath
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

function composeAccountsAnswer(plan = {}, result = {}) {
    const value = result.value;
    const details = result.details || {};
    if (typeof value === 'number') {
        const account = plan.filters?.account ? ` para ${plan.filters.account}` : '';
        return [`Saldo${account}: ${moneyBR(value)}.`, details.criteria || ''].filter(Boolean).join('\n');
    }
    const items = Array.isArray(value?.items) ? value.items : [];
    const lines = items.slice(0, 10).map((item, index) => (
        `${index + 1}. ${item.name || item.label || 'Conta'}: ${moneyBR(item.balance ?? item.value ?? 0)}`
    ));
    return [
        `Saldo total das contas: ${moneyBR(value?.total ?? details.total ?? 0)}.`,
        ...lines,
        details.criteria || value?.criteria || ''
    ].filter(Boolean).join('\n');
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

function composeBillsListAnswer(plan = {}, result = {}) {
    const details = result.details || {};
    const value = result.value;
    const items = Array.isArray(value)
        ? value
        : Array.isArray(value?.items)
            ? value.items
            : [];
    const status = normalizeText(plan.filters?.status || '');
    const pendingMode = status.includes('pending') || status.includes('pendente');
    const paidMode = status.includes('paid') || status.includes('pago') || status.includes('paga');
    const title = pendingMode
        ? 'Contas pendentes/em aberto'
        : paidMode
            ? 'Contas pagas'
            : 'Contas';
    const statusLabels = {
        paid: 'paga',
        pending: 'pendente',
        scheduled: 'agendada',
        overdue: 'atrasada'
    };

    if (items.length === 0) {
        return [
            `${title}: não encontrei itens nesse recorte.`,
            details.criteria || value?.criteria || '',
            plan.timeBasis ? `Critério temporal: ${plan.timeBasis}.` : ''
        ].filter(Boolean).join('\n');
    }

    const lines = items.slice(0, 10).map((item, index) => {
        const due = item.date || item.dueDate || item.due_date || '';
        const pendingValue = Number(item.pendingValue ?? item.value ?? item.expectedValue ?? 0);
        const realizedValue = Number(item.realizedValue || 0);
        const expectedValue = Number(item.expectedValue ?? item.value ?? 0);
        const amountLabel = expectedValue > 0
            ? `pendente ${moneyBR(pendingValue)}`
            : realizedValue > 0
                ? `realizado ${moneyBR(realizedValue)}`
                : 'valor esperado não cadastrado';
        const normalizedStatus = normalizeText(item.status || '');
        const humanStatus = statusLabels[normalizedStatus] || '';
        const statusLabel = humanStatus && !pendingMode && !paidMode ? ` · ${humanStatus}` : '';
        return `${index + 1}. ${item.description || item.name || 'Conta'}${due ? ` · vence em ${due}` : ''} · ${amountLabel}${statusLabel}`;
    });
    const totals = details.totals || value?.totals || {};
    const totalLine = Number.isFinite(Number(totals.pending))
        ? `Total pendente: ${moneyBR(totals.pending)}.`
        : Number.isFinite(Number(details.total))
            ? `Total esperado: ${moneyBR(details.total)}.`
            : '';
    const truncated = items.length > 10 ? `... e mais ${items.length - 10} conta(s).` : '';

    return [
        `${title}:`,
        ...lines,
        truncated,
        totalLine,
        details.criteria || value?.criteria || '',
        plan.timeBasis ? `Critério temporal: ${plan.timeBasis}.` : ''
    ].filter(Boolean).join('\n');
}

function composeFinancialPlanAnswer(toolResult = {}) {
    const plan = toolResult.plan || {};
    const result = toolResult.result || {};
    const value = result.value;
    const details = result.details || {};
    const title = domainLabel(plan.domain);
    const criteria = plan.operation === 'recommend' ? '' : (details.criteria || value?.criteria || '');

    if (plan.domain === 'accounts') {
        return composeAccountsAnswer(plan, result);
    }

    if (plan.domain === 'budget' && value && typeof value === 'object' && !Array.isArray(value)) {
        return composeBudgetAnswer(value);
    }

    if (plan.domain === 'bills' && plan.operation === 'detect' && Array.isArray(value?.items)) {
        const matched = value.items[0];
        if (!matched) {
            return [
                'Não encontrei essa conta cadastrada ou um pagamento correspondente neste período.',
                details.criteria || value.criteria || '',
                plan.timeBasis ? `Critério temporal: ${plan.timeBasis}.` : ''
            ].filter(Boolean).join('\n');
        }
        const paid = matched.status === 'paid' || Number(matched.realizedValue || 0) > 0;
        const amount = paid
            ? Number(matched.realizedValue || 0)
            : Number(matched.pendingValue ?? matched.expectedValue ?? 0);
        const statement = paid
            ? `Sim. ${matched.description || 'A conta'} foi identificada como paga neste período por ${moneyBR(amount)}.`
            : `Ainda não. ${matched.description || 'A conta'} aparece como pendente por ${moneyBR(amount)}.`;
        return [
            statement,
            details.criteria || value.criteria || '',
            plan.timeBasis ? `Critério temporal: ${plan.timeBasis}.` : ''
        ].filter(Boolean).join('\n');
    }

    if (plan.domain === 'bills' && plan.operation === 'list') {
        return composeBillsListAnswer(plan, result);
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

function composeDeterministicAnswer(state) {
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
        const rows = Array.isArray(result.rows) ? result.rows : [];
        if (rows.length > 1) {
            const allCardExpenses = rows.every(row => row.event_type === 'card_expense');
            const title = allCardExpenses
                ? `Últimos ${rows.length} gastos no cartão:`
                : `Últimos ${rows.length} lançamentos:`;
            const lines = rows.map((row, index) => {
                const card = row.card ? ` · ${row.card}` : '';
                return `${index + 1}. ${row.date}: ${row.description || 'sem descrição'} · ${moneyBR(row.amount)} · ${row.person}${card}`;
            });
            return {
                answer: `${title}\n${lines.join('\n')}`,
                action: 'answer'
            };
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

async function composeAnswer(state) {
    const deterministic = composeDeterministicAnswer(state);
    if (deterministic.action !== 'answer') return deterministic;

    const contextual = await composeContextualFinancialAnswer({
        message: state.message,
        plan: state.plan,
        toolResult: state.toolResult,
        deterministicAnswer: deterministic.answer
    });
    if (!contextual.ok) return deterministic;

    const selected = selectVerifiedContextualAnswer({
        contextualAnswer: contextual.answer,
        deterministicAnswer: deterministic.answer,
        toolResult: state.toolResult
    });
    return {
        answer: selected.answer,
        action: 'answer'
    };
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

function migrationGapTagForReason(reason = '') {
    const normalized = String(reason || '').trim();
    if (/unsafe|security|bypass/i.test(normalized)) return 'unsafe_request';
    if (/ambiguous.*period|period/i.test(normalized)) return 'ambiguous_period';
    if (/ambiguous.*scope|scope/i.test(normalized)) return 'ambiguous_scope';
    if (/invalid_financial_query_plan|unsupported_filter|filter/i.test(normalized)) return 'unsupported_filter';
    if (/response/i.test(normalized)) return 'response_gap';
    return 'engine_gap';
}

function publicPlanDomain(plan = {}, toolResult = {}) {
    return plan?.args?.plan?.domain || toolResult?.plan?.domain || null;
}

function buildMigrationGap({ plan = null, toolResult = null } = {}) {
    const safePlan = plan || {};
    const safeToolResult = toolResult || null;
    if (safePlan.action === 'clarify') {
        const reason = String(safePlan.reason || 'planner_gap').trim();
        return {
            tag: migrationGapTagForReason(reason),
            reason,
            surface: 'financial_agent',
            tool: safePlan.tool || null,
            domain: publicPlanDomain(safePlan, safeToolResult)
        };
    }
    if (safeToolResult && safeToolResult.ok === false) {
        const reason = String(safeToolResult.reason || 'tool_gap').trim();
        return {
            tag: migrationGapTagForReason(reason),
            reason,
            surface: 'financial_agent',
            tool: safeToolResult.tool || safePlan.tool || null,
            domain: publicPlanDomain(safePlan, safeToolResult)
        };
    }
    return null;
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
        canonicalLedgerDbPath: input.canonicalLedgerDbPath || undefined,
        mode: input.mode || 'shadow'
    });
    return {
        action: result.action || 'error',
        plan: result.plan || null,
        toolResult: result.toolResult || null,
        answer: result.answer || '',
        verified: result.verified || { ok: false, reason: 'missing_verification' },
        migrationGap: buildMigrationGap({ plan: result.plan || null, toolResult: result.toolResult || null })
    };
}
