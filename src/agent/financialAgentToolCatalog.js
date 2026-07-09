const { normalizeText } = require('../utils/helpers');
const { PUBLIC_COLUMNS } = require('./safeReadonlySql');

const TOOL_DEFINITIONS = [
    {
        id: 'query_financial_plan',
        promptLine: '- query_financial_plan: para perguntas sobre dominios financeiros conhecidos. Args: plan.',
        examples: [
            '{"action":"tool","tool":"query_financial_plan","args":{"plan":{"kind":"financial_query","domain":"bills","operation":"list","filters":{"period":{"type":"month","month":5,"year":2026},"status":"pending"},"sort":{"by":"due_date","direction":"asc"},"timeBasis":"due_date"}}}',
            '{"action":"tool","tool":"query_financial_plan","args":{"plan":{"kind":"financial_query","domain":"forecast","operation":"forecast","filters":{"period":{"type":"date_range","from":"2026-07-01","to":"2026-07-31"},"type":"payable"},"sort":{"by":"due_date","direction":"asc"},"timeBasis":"due_date"}}}'
        ]
    },
    {
        id: 'list_recent_transactions',
        promptLine: '- list_recent_transactions: para ultimo/ultimos lancamentos. Args: eventTypes, limit, card opcional.',
        examples: [
            '{"action":"tool","tool":"list_recent_transactions","args":{"eventTypes":["card_expense"],"limit":4,"card":"Nubank - Thais"}}'
        ]
    },
    {
        id: 'run_safe_readonly_sql',
        promptLine: '- run_safe_readonly_sql: para agregacoes read-only flexiveis sobre financial_events_public. Args: sql.',
        examples: [
            `{"action":"tool","tool":"run_safe_readonly_sql","args":{"sql":"SELECT weekday, SUM(amount) AS total FROM financial_events_public WHERE event_type IN ('expense', 'card_expense') GROUP BY weekday ORDER BY total DESC LIMIT 7"}}`
        ]
    },
    {
        id: 'get_dashboard_snapshot',
        promptLine: '- get_dashboard_snapshot: para resumo deterministico do dashboard. Args: month, year.',
        examples: [
            '{"action":"tool","tool":"get_dashboard_snapshot","args":{"month":5,"year":2026}}'
        ]
    },
    {
        id: 'explain_metric',
        promptLine: '- explain_metric: explica saldo, disponivel, categorias, orcamento ou lancamentos recentes do dashboard. Args: metric, month, year.',
        examples: [
            '{"action":"tool","tool":"explain_metric","args":{"metric":"available","month":5,"year":2026}}'
        ]
    }
];

const TOOL_BY_ID = new Map(TOOL_DEFINITIONS.map(tool => [tool.id, tool]));
const ALLOWED_AGENT_TOOLS = new Set(TOOL_DEFINITIONS.map(tool => tool.id));

function hasAny(normalized = '', patterns = []) {
    return patterns.some(pattern => pattern.test(normalized));
}

function selectRelevantFinancialAgentTools(message = '') {
    const normalized = normalizeText(message);
    const selected = new Set(['query_financial_plan']);

    if (hasAny(normalized, [
        /\b(ultimo|ultima|ultimos|ultimas|recente|recentes|lancamento|lancamentos|movimento|movimentos|transacao|transacoes)\b/
    ])) {
        selected.add('list_recent_transactions');
    }

    if (hasAny(normalized, [
        /\b(dia da semana|ranking|rank|maiores|menores|agrupar|agrupado|por pessoa|por categoria|por estabelecimento|por cartao|quantos registros)\b/,
        /\b(media|contagem|frequencia)\b/
    ])) {
        selected.add('run_safe_readonly_sql');
    }

    if (hasAny(normalized, [
        /\b(dashboard|painel|kpi|indicador|indicadores|resumo financeiro|panorama|retrato financeiro)\b/
    ])) {
        selected.add('get_dashboard_snapshot');
        selected.add('explain_metric');
    }

    return Array.from(selected)
        .map(id => TOOL_BY_ID.get(id))
        .filter(Boolean);
}

function selectedToolIds(tools = []) {
    return new Set(tools.map(tool => tool.id));
}

function buildToolPromptLines(tools = []) {
    return tools.map(tool => tool.promptLine);
}

function buildToolExampleLines(tools = []) {
    return tools.flatMap(tool => tool.examples || []);
}

function buildSqlCatalogLines(toolIds = new Set()) {
    if (!toolIds.has('run_safe_readonly_sql')) return [];
    return [
        'Tabela SQL publica allowlisted: financial_events_public.',
        `Colunas publicas permitidas: ${PUBLIC_COLUMNS.join(', ')}.`,
        'Tipos de evento: expense, card_expense, income, transfer, goal, debt, bill.'
    ];
}

module.exports = {
    ALLOWED_AGENT_TOOLS,
    TOOL_DEFINITIONS,
    buildSqlCatalogLines,
    buildToolExampleLines,
    buildToolPromptLines,
    selectRelevantFinancialAgentTools,
    selectedToolIds
};