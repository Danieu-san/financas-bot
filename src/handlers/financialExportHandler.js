const { normalizeText } = require('../utils/helpers');
const { readDataFromSheet } = require('../services/google');
const { buildFilteredFinancialExport } = require('../services/financialExportService');

const MONTHS = Object.freeze({
    janeiro: 1,
    fevereiro: 2,
    marco: 3,
    abril: 4,
    maio: 5,
    junho: 6,
    julho: 7,
    agosto: 8,
    setembro: 9,
    outubro: 10,
    novembro: 11,
    dezembro: 12
});

function buildFinancialFileIoPolicy(env = process.env, userId = '') {
    const requestedMode = String(env.FINANCIAL_FILE_IO_MODE || 'off').trim().toLowerCase();
    const mode = ['off', 'canary', 'on'].includes(requestedMode) ? requestedMode : 'off';
    const scopedUserId = String(userId || '').trim();
    const allowlist = new Set(String(env.FINANCIAL_FILE_IO_USER_IDS || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean));
    if (mode === 'off') return { mode, allowed: false, reason: 'mode_off' };
    if (!scopedUserId) return { mode, allowed: false, reason: 'user_required' };
    if (mode === 'canary' && !allowlist.has(scopedUserId)) {
        return { mode, allowed: false, reason: 'user_not_allowlisted' };
    }
    return { mode, allowed: true, reason: mode === 'on' ? 'mode_on' : 'canary_allowlisted' };
}

function parsePeriod(text, now = new Date()) {
    const normalized = normalizeText(text);
    const numeric = normalized.match(/\b(0?[1-9]|1[0-2])[\/-](20\d{2})\b/);
    if (numeric) return { month: Number(numeric[1]), year: Number(numeric[2]) };
    for (const [name, month] of Object.entries(MONTHS)) {
        const match = normalized.match(new RegExp(`\\b${name}\\b(?:\\s+de)?\\s+(20\\d{2})\\b`));
        if (match) return { month, year: Number(match[1]) };
        if (new RegExp(`\\b${name}\\b`).test(normalized)) {
            return { month, year: now.getFullYear() };
        }
    }
    return null;
}

function extractNamedFilter(text, label) {
    const pattern = new RegExp(
        `(?:^|\\s)(?:da\\s+|de\\s+)?${label}\\s+(?:"([^"]+)"|'([^']+)'|(.+?))(?=\\s+(?:da\\s+|de\\s+)?(?:categoria|conta|origem)\\b|$)`,
        'i'
    );
    const match = String(text || '').replace(/[.!?]+$/g, '').match(pattern);
    return String(match?.[1] || match?.[2] || match?.[3] || '').trim();
}

function parseFinancialExportCommand(text, { now = new Date() } = {}) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    const normalized = normalizeText(raw);
    const hasVerb = /\b(exportar|exporte|gerar|gere|baixar|baixe)\b/.test(normalized);
    const hasTarget = /\b(financas|financeiro|lancamentos|movimentacoes|gastos|saidas|entradas|receitas|cartao|extrato)\b/.test(normalized);
    if (!hasVerb || !hasTarget) return null;

    const period = parsePeriod(raw, now);
    if (!period) return { kind: 'invalid', reason: 'period_required' };
    const sourceSignals = [
        ['expenses', /\b(gastos|saidas|despesas)\b/],
        ['income', /\b(entradas|receitas)\b/],
        ['cards', /\b(cartao|cartoes)\b/]
    ].filter(([, pattern]) => pattern.test(normalized));
    if (sourceSignals.length > 1) return { kind: 'invalid', reason: 'single_source_required' };

    const filters = {
        ...period,
        ...(sourceSignals[0] ? { source: sourceSignals[0][0] } : {})
    };
    const category = extractNamedFilter(raw, 'categoria');
    const account = extractNamedFilter(raw, 'conta');
    if (category) filters.category = category;
    if (account) filters.account = account;
    return { kind: 'command', filters };
}

function defaultDependencies() {
    return {
        readDataFromSheet,
        buildExport: buildFilteredFinancialExport,
        getPolicy: userId => buildFinancialFileIoPolicy(process.env, userId),
        createMessageMedia: ({ mimetype, buffer, filename }) => {
            const { MessageMedia } = require('whatsapp-web.js');
            return new MessageMedia(mimetype, buffer.toString('base64'), filename);
        }
    };
}

function errorMessage(error) {
    if (error?.code === 'EXPORT_EMPTY') return 'Não encontrei lançamentos com esses filtros. Nenhum arquivo foi gerado.';
    if (error?.code === 'EXPORT_LIMIT_EXCEEDED') return 'A exportação excedeu o limite seguro e não foi truncada. Use um período ou filtros menores.';
    return 'Não consegui gerar a exportação com segurança. Confira o período e os filtros e tente novamente.';
}

async function handleFinancialExportCommand(msg, user = {}, overrides = {}) {
    const parsed = parseFinancialExportCommand(msg?.body);
    if (!parsed) return false;
    if (parsed.kind === 'invalid') {
        const reply = parsed.reason === 'single_source_required'
            ? 'Escolha uma única origem por arquivo: gastos, entradas ou cartão.'
            : 'Informe o período da exportação, por exemplo: `exportar finanças de julho de 2026`.';
        await msg.reply(reply);
        return true;
    }

    const userId = String(user?.user_id || user?.userId || '').trim();
    const deps = { ...defaultDependencies(), ...overrides };
    const policy = deps.getPolicy(userId);
    if (!policy.allowed) {
        await msg.reply('A exportação XLSX ainda não está liberada para este usuário.');
        return true;
    }

    try {
        const options = { userId, suppressMissingSheetError: true };
        const [expenses, income, cards] = await Promise.all([
            deps.readDataFromSheet('Saídas!A:K', options),
            deps.readDataFromSheet('Entradas!A:J', options),
            deps.readDataFromSheet('Lançamentos Cartão!A:J', options)
        ]);
        const exported = deps.buildExport({
            sheetDataByName: {
                'Saídas': expenses || [],
                'Entradas': income || [],
                'Lançamentos Cartão': cards || []
            },
            userId,
            filters: parsed.filters
        });
        const media = deps.createMessageMedia(exported);
        await msg.reply(media, undefined, {
            sendMediaAsDocument: true,
            caption: `Exportação concluída: ${exported.rowCount} lançamento(s).`
        });
    } catch (error) {
        await msg.reply(errorMessage(error));
    }
    return true;
}

module.exports = {
    buildFinancialFileIoPolicy,
    handleFinancialExportCommand,
    parseFinancialExportCommand,
    __test__: { errorMessage, extractNamedFilter, parsePeriod }
};
