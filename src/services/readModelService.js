const fs = require('fs');
const path = require('path');
const { readDataFromSheet, renderVisualDashboard } = require('./google');
const analysisService = require('./analysisService');
const { parseSheetDate, parseValue, normalizeText } = require('../utils/helpers');
const { matchesAnyField } = require('../utils/textMatcher');
const { creditCardConfig } = require('../config/constants');
const {
    ensureSqliteReady,
    syncSnapshotToSqlite,
    queryAnalyticalIntentSql,
    queryFinancialQueryDataSourcesSql,
    queryKpis,
    queryTopCategories,
    queryCashflow,
    queryDebts,
    queryGoals,
    queryRecentTransactions,
    queryAlerts,
    isSqliteReady,
    getSqliteStats,
    ALL_USERS_ID
} = require('./sqliteReadModelService');
const { executeFinancialQueryPlanForLegacyIntent } = require('./calculationOrchestrator');
const { decorateDashboardSummary } = require('./dashboardSummaryService');
const logger = require('../utils/logger');
const metrics = require('../utils/metrics');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'read_model.json');
const TEMP_FILE = path.join(DATA_DIR, 'read_model.tmp');
const SYNC_INTERVAL_MS = Math.max(30 * 1000, Number.parseInt(process.env.READ_MODEL_SYNC_INTERVAL_MS || '300000', 10));

const monthNames = {
    janeiro: 0,
    fevereiro: 1,
    marco: 2,
    março: 2,
    abril: 3,
    maio: 4,
    junho: 5,
    julho: 6,
    agosto: 7,
    setembro: 8,
    outubro: 9,
    novembro: 10,
    dezembro: 11
};

let readModel = {
    meta: {
        lastSyncedAt: '',
        source: 'empty'
    },
    saidas: [],
    entradas: [],
    transferencias: [],
    cartoes: [],
    cartoesConfig: [],
    userSettings: [],
    metas: [],
    movimentacoesMetas: [],
    dividas: [],
    contas: []
};

let syncInFlight = null;

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function saveReadModelToDisk() {
    try {
        ensureDataDir();
        fs.writeFileSync(TEMP_FILE, JSON.stringify(readModel, null, 2), 'utf8');
        fs.renameSync(TEMP_FILE, STORE_FILE);
    } catch (error) {
        logger.warn(`read-model: falha ao persistir em disco (${error.message})`);
    }
}

function loadReadModelFromDisk() {
    try {
        if (!fs.existsSync(STORE_FILE)) return;
        const raw = fs.readFileSync(STORE_FILE, 'utf8');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return;
        readModel = {
            meta: parsed.meta || { lastSyncedAt: '', source: 'disk' },
            saidas: Array.isArray(parsed.saidas) ? parsed.saidas : [],
            entradas: Array.isArray(parsed.entradas) ? parsed.entradas : [],
            transferencias: Array.isArray(parsed.transferencias) ? parsed.transferencias : [],
            cartoes: Array.isArray(parsed.cartoes) ? parsed.cartoes : [],
            cartoesConfig: Array.isArray(parsed.cartoesConfig) ? parsed.cartoesConfig : [],
            userSettings: Array.isArray(parsed.userSettings) ? parsed.userSettings : [],
            metas: Array.isArray(parsed.metas) ? parsed.metas : [],
            movimentacoesMetas: Array.isArray(parsed.movimentacoesMetas) ? parsed.movimentacoesMetas : [],
            dividas: Array.isArray(parsed.dividas) ? parsed.dividas : [],
            contas: Array.isArray(parsed.contas) ? parsed.contas : []
        };
        logger.info(`read-model: carregado do disco (saidas=${readModel.saidas.length}, entradas=${readModel.entradas.length}, cartoes=${readModel.cartoes.length})`);
    } catch (error) {
        logger.warn(`read-model: falha ao carregar do disco (${error.message})`);
    }
}

function parseBillingMonth(rawValue) {
    const text = normalizeText(String(rawValue || '').trim());
    if (!text) return null;

    const yearMatch = text.match(/\b(20\d{2})\b/);
    if (!yearMatch) return null;
    const year = Number.parseInt(yearMatch[1], 10);

    let month = null;
    Object.entries(monthNames).forEach(([name, index]) => {
        if (month === null && text.includes(name)) {
            month = index;
        }
    });

    if (month === null || Number.isNaN(year)) return null;
    return { month, year };
}

function periodMatches(record, month, year) {
    if (record.year !== year) return false;
    if (month === null || month === undefined) return true;
    return record.month === month;
}

function normalizeMonthParam(month) {
    if (month === null || month === undefined) return null;
    if (typeof month === 'number' && month >= 0 && month <= 11) return month;
    const parsed = Number.parseInt(month, 10);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 11) return parsed;
    return null;
}

function normalizeYearParam(year) {
    const parsed = Number.parseInt(year, 10);
    if (!Number.isNaN(parsed)) return parsed;
    return new Date().getFullYear();
}

function categoryMatches(record, category) {
    return matchesAnyField(
        [record.categoria || '', record.subcategoria || '', record.descricao || ''],
        category
    );
}

function daysConsideredForAverage(month, year, now = new Date()) {
    if (month === null || month === undefined) return 365;
    if (year === now.getFullYear() && month === now.getMonth()) {
        return Math.max(1, now.getDate());
    }
    return new Date(year, month + 1, 0).getDate();
}

function mapSaidasRows(rows) {
    if (!rows || rows.length <= 1) return [];
    const result = [];
    rows.slice(1).forEach((row) => {
        const user_id = String(row[9] || '').trim();
        if (!user_id) return;
        const dateObj = parseSheetDate(row[0]);
        if (!dateObj) return;
        result.push({
            user_id,
            data: row[0] || '',
            descricao: row[1] || '',
            categoria: row[2] || '',
            subcategoria: row[3] || '',
            valor: parseValue(row[4]),
            month: dateObj.getMonth(),
            year: dateObj.getFullYear()
        });
    });
    return result;
}

function mapEntradasRows(rows) {
    if (!rows || rows.length <= 1) return [];
    const result = [];
    rows.slice(1).forEach((row) => {
        const user_id = String(row[8] || '').trim();
        if (!user_id) return;
        const dateObj = parseSheetDate(row[0]);
        if (!dateObj) return;
        result.push({
            user_id,
            data: row[0] || '',
            descricao: row[1] || '',
            categoria: row[2] || '',
            valor: parseValue(row[3]),
            recebimento: row[5] || '',
            recorrente: row[6] || '',
            month: dateObj.getMonth(),
            year: dateObj.getFullYear()
        });
    });
    return result;
}

function mapTransferenciasRows(rows) {
    if (!rows || rows.length <= 1) return [];
    const result = [];
    rows.slice(1).forEach((row) => {
        const user_id = String(row[8] || '').trim();
        if (!user_id) return;
        const dateObj = parseSheetDate(row[0]);
        if (!dateObj) return;
        result.push({
            user_id,
            data: row[0] || '',
            descricao: row[1] || '',
            valor: parseValue(row[2]),
            origem: row[3] || '',
            destino: row[4] || '',
            metodo: row[5] || '',
            observacoes: row[6] || '',
            status: row[7] || '',
            month: dateObj.getMonth(),
            year: dateObj.getFullYear()
        });
    });
    return result;
}

function cardIdFromSheetName(sheetName = '') {
    return String(sheetName || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/^cartao\s+/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || '';
}

function mapLegacyCardRows(rows, sheetName) {
    if (!rows || rows.length <= 1) return [];
    const result = [];
    rows.slice(1).forEach((row) => {
        const user_id = String(row[6] || '').trim();
        if (!user_id) return;
        const billing = parseBillingMonth(row[5]);
        if (!billing) return;
        result.push({
            user_id,
            source: sheetName,
            data: row[0] || '',
            descricao: row[1] || '',
            categoria: row[2] || '',
            subcategoria: 'Cartão de Crédito',
            valor: parseValue(row[3]),
            parcela: row[4] || '',
            month: billing.month,
            year: billing.year,
            card_id: cardIdFromSheetName(sheetName),
            cartao: sheetName
        });
    });
    return result;
}

function mapUnifiedCardRows(rows) {
    if (!rows || rows.length <= 1) return [];
    const result = [];
    rows.slice(1).forEach((row) => {
        const user_id = String(row[9] || '').trim();
        if (!user_id) return;
        const billing = parseBillingMonth(row[5]);
        if (!billing) return;
        result.push({
            user_id,
            source: 'Lançamentos Cartão',
            data: row[0] || '',
            descricao: row[1] || '',
            categoria: row[2] || '',
            subcategoria: 'Cartão de Crédito',
            valor: parseValue(row[3]),
            parcela: row[4] || '',
            month: billing.month,
            year: billing.year,
            card_id: row[6] || '',
            cartao: row[7] || row[6] || 'Cartão'
        });
    });
    return result;
}

function buildCanonicalCardEntries({ unifiedRows = [], legacyRowsBySheet = [] } = {}) {
    const unifiedEntries = mapUnifiedCardRows(unifiedRows);
    if (unifiedEntries.length > 0) {
        return unifiedEntries;
    }

    return legacyRowsBySheet.flatMap(({ rows, sheetName }) => mapLegacyCardRows(rows, sheetName));
}

function mapUserSettingsRows(rows) {
    if (!rows || rows.length <= 1) return [];
    return rows.slice(1)
        .map(row => ({
            user_id: String(row[0] || '').trim(),
            monthly_budget_enabled: row[13] || '',
            monthly_budget_amount: row[14] || '',
            monthly_budget_scope: row[17] || 'personal',
            monthly_budget_cycle_start_day: row[18] || '1'
        }))
        .filter(item => item.user_id);
}

function mapCartoesConfigRows(rows) {
    if (!rows || rows.length <= 1) return [];
    return rows.slice(1)
        .map(row => ({
            card_id: row[0] || '',
            nome: row[1] || row[0] || '',
            due_day: row[4] || '1',
            active: row[5] || 'SIM'
        }))
        .filter(item => item.card_id || item.nome);
}

function mapGenericRows(rows, userIndex) {
    if (!rows || rows.length <= 1) return [];
    const headers = Array.isArray(rows[0]) ? rows[0] : [];
    return rows.slice(1)
        .map((row) => ({ row, headers, user_id: String(row[userIndex] || '').trim() }))
        .filter((entry) => entry.user_id);
}

function genericRowValue(entry = {}, aliases = [], fallbackIndex = -1) {
    const row = Array.isArray(entry.row) ? entry.row : [];
    const headers = Array.isArray(entry.headers) ? entry.headers : [];
    if (headers.length > 0) {
        const normalizedAliases = aliases.map(alias => normalizeText(alias));
        const index = headers.findIndex(header => normalizedAliases.includes(normalizeText(header)));
        return index >= 0 ? row[index] : '';
    }
    return fallbackIndex >= 0 ? row[fallbackIndex] : '';
}

function buildDashboardPeriodLabel(monthKey) {
    if (!monthKey || monthKey === 'TODOS') return 'Todos os períodos';
    return monthKey;
}

function normalizeSelection(value, validOptions, fallback) {
    const val = String(value || '').trim();
    if (val && validOptions.includes(val)) return val;
    return fallback;
}

function getMonthKey(record) {
    const y = Number(record?.year);
    const m = Number(record?.month);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return '';
    return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function filterBySelections(records, selectedUser, selectedMonth) {
    return records.filter((item) => {
        const userOk = selectedUser === 'TODOS' || item.user_id === selectedUser;
        const monthOk = selectedMonth === 'TODOS' || getMonthKey(item) === selectedMonth;
        return userOk && monthOk;
    });
}

async function refreshVisualDashboardFromReadModel() {
    try {
        const users = Array.from(new Set([
            ...readModel.saidas.map(r => r.user_id),
            ...readModel.entradas.map(r => r.user_id),
            ...readModel.cartoes.map(r => r.user_id)
        ].filter(Boolean))).sort();
        const userOptions = ['TODOS', ...users];

        const monthSet = new Set();
        [...readModel.saidas, ...readModel.entradas, ...readModel.cartoes].forEach((item) => {
            const key = getMonthKey(item);
            if (key) monthSet.add(key);
        });
        const monthOptions = ['TODOS', ...Array.from(monthSet).sort().reverse()];

        const filterCells = await readDataFromSheet('Dashboard!B3:B4');
        const selectedUserRaw = filterCells?.[0]?.[0] || 'TODOS';
        const selectedMonthRaw = filterCells?.[1]?.[0] || (monthOptions[1] || 'TODOS');
        const selectedUser = normalizeSelection(selectedUserRaw, userOptions, 'TODOS');
        const selectedMonth = normalizeSelection(selectedMonthRaw, monthOptions, monthOptions[1] || 'TODOS');

        const filteredEntradas = filterBySelections(readModel.entradas, selectedUser, selectedMonth);
        const filteredSaidas = filterBySelections(readModel.saidas, selectedUser, selectedMonth);
        const filteredCartoes = filterBySelections(readModel.cartoes, selectedUser, selectedMonth);

        const kpis = {
            entradas: filteredEntradas.reduce((s, r) => s + Number(r.valor || 0), 0),
            saidas: filteredSaidas.reduce((s, r) => s + Number(r.valor || 0), 0),
            cartoes: filteredCartoes.reduce((s, r) => s + Number(r.valor || 0), 0),
            saldo: 0,
            debtActiveCount: 0,
            debtTotal: 0,
            goalsActiveCount: 0,
            goalsTargetTotal: 0,
            goalsCurrentTotal: 0
        };
        kpis.saldo = kpis.entradas - (kpis.saidas + kpis.cartoes);

        const debtFiltered = readModel.dividas
            .filter((entry) => selectedUser === 'TODOS' || entry.user_id === selectedUser)
            .map((entry) => {
                const row = entry.row || [];
                return { status: normalizeText(row[10] || ''), saldoAtual: parseValue(row[4] || 0) };
            })
            .filter((item) => !(item.status.includes('quitad') || item.status.includes('pago') || item.status.includes('finalizad')));
        kpis.debtActiveCount = debtFiltered.length;
        kpis.debtTotal = debtFiltered.reduce((sum, item) => sum + item.saldoAtual, 0);

        const goalsFiltered = readModel.metas
            .filter((entry) => selectedUser === 'TODOS' || entry.user_id === selectedUser)
            .map((entry) => {
                const row = entry.row || [];
                const status = normalizeText(row[6] || '');
                const target = parseValue(row[1] || 0);
                const current = parseValue(row[2] || 0);
                return { status, target, current };
            })
            .filter((item) => !item.status.includes('conclu'));

        kpis.goalsActiveCount = goalsFiltered.length;
        kpis.goalsTargetTotal = goalsFiltered.reduce((sum, item) => sum + Number(item.target || 0), 0);
        kpis.goalsCurrentTotal = goalsFiltered.reduce((sum, item) => sum + Number(item.current || 0), 0);

        const categoryTotals = {};
        [...filteredSaidas, ...filteredCartoes].forEach((item) => {
            const key = item.categoria || 'Outros';
            categoryTotals[key] = (categoryTotals[key] || 0) + Number(item.valor || 0);
        });
        const topCategories = Object.entries(categoryTotals)
            .map(([category, value]) => ({ category, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        const dayMap = new Map();
        filteredEntradas.forEach((item) => {
            const key = item.data || '';
            const base = dayMap.get(key) || { date: key, entradas: 0, saidas: 0, saldo: 0 };
            base.entradas += Number(item.valor || 0);
            base.saldo += Number(item.valor || 0);
            dayMap.set(key, base);
        });
        [...filteredSaidas, ...filteredCartoes].forEach((item) => {
            const key = item.data || '';
            const base = dayMap.get(key) || { date: key, entradas: 0, saidas: 0, saldo: 0 };
            base.saidas += Number(item.valor || 0);
            base.saldo -= Number(item.valor || 0);
            dayMap.set(key, base);
        });
        const dailyFlow = Array.from(dayMap.values())
            .sort((a, b) => parseDateToTimestamp(a.date) - parseDateToTimestamp(b.date))
            .slice(-12);

        await renderVisualDashboard({
            userOptions,
            monthOptions,
            selectedUser,
            selectedMonth,
            periodLabel: buildDashboardPeriodLabel(selectedMonth),
            kpis,
            topCategories,
            dailyFlow,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        logger.warn(`read-model: falha ao renderizar Dashboard visual (${error.message})`);
    }
}

async function rebuildReadModelFromSheets() {
    const cardSheetNames = Object.values(creditCardConfig).map(card => card.sheetName);
    const sheetReads = [
        readDataFromSheet('Saídas!A:J'),
        readDataFromSheet('Entradas!A:I'),
        readDataFromSheet('Transferências!A:I'),
        readDataFromSheet('Metas!A:K'),
        readDataFromSheet('Movimentações Metas!A:J'),
        readDataFromSheet('Dívidas!A:R'),
        readDataFromSheet('Contas!A:I'),
        readDataFromSheet('UserSettings!A:S'),
        readDataFromSheet('Cartões!A:G', { suppressMissingSheetError: true }),
        readDataFromSheet('Lançamentos Cartão!A:J', { suppressMissingSheetError: true }),
        ...cardSheetNames.map((sheetName) => readDataFromSheet(`${sheetName}!A:G`))
    ];

    const allData = await Promise.all(sheetReads);
    const [saidasRows, entradasRows, transferenciasRows, metasRows, movimentacoesMetasRows, dividasRows, contasRows, userSettingsRows, cartoesConfigRows, unifiedCardRows] = allData;
    const cardRowsList = allData.slice(10);
    const cartoes = buildCanonicalCardEntries({
        unifiedRows: unifiedCardRows,
        legacyRowsBySheet: cardRowsList.map((rows, idx) => ({ rows, sheetName: cardSheetNames[idx] }))
    });

    readModel = {
        meta: {
            lastSyncedAt: new Date().toISOString(),
            source: 'sheets_full_refresh'
        },
        saidas: mapSaidasRows(saidasRows),
        entradas: mapEntradasRows(entradasRows),
        transferencias: mapTransferenciasRows(transferenciasRows),
        cartoes,
        cartoesConfig: mapCartoesConfigRows(cartoesConfigRows),
        userSettings: mapUserSettingsRows(userSettingsRows),
        metas: mapGenericRows(metasRows, 8),
        movimentacoesMetas: mapGenericRows(movimentacoesMetasRows, 8),
        dividas: mapGenericRows(dividasRows, 17),
        contas: mapGenericRows(contasRows, 3)
    };

    syncSnapshotToSqlite(readModel);
    saveReadModelToDisk();
    await refreshVisualDashboardFromReadModel();
    logger.info(`read-model: sync concluído (saidas=${readModel.saidas.length}, entradas=${readModel.entradas.length}, cartoes=${readModel.cartoes.length})`);
}

async function syncReadModelIfNeeded({ force = false } = {}) {
    if (syncInFlight) return syncInFlight;

    const last = readModel.meta?.lastSyncedAt ? new Date(readModel.meta.lastSyncedAt).getTime() : 0;
    const age = Date.now() - last;
    if (!force && last > 0 && age < SYNC_INTERVAL_MS) {
        return readModel.meta;
    }

    syncInFlight = (async () => {
        try {
            await rebuildReadModelFromSheets();
            return readModel.meta;
        } finally {
            syncInFlight = null;
        }
    })();

    return syncInFlight;
}

function markReadModelDirty(reason = 'write') {
    readModel.meta = {
        ...(readModel.meta || {}),
        lastSyncedAt: '',
        source: `dirty:${reason}`
    };
    saveReadModelToDisk();
}

function getUnifiedExpensesForUser(userId, month, year) {
    const outgoing = readModel.saidas
        .filter((entry) => entry.user_id === userId && periodMatches(entry, month, year));
    const cards = readModel.cartoes
        .filter((entry) => entry.user_id === userId && periodMatches(entry, month, year));
    return [...outgoing, ...cards];
}

function withResultSource(result, source) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
    return { ...result, source };
}

function readModelCardMatches(entry, cardName) {
    const needle = normalizeText(cardName || '');
    if (!needle) return true;
    return normalizeText(entry?.source || '').includes(needle);
}

function readModelCardRowsFromPeriod(entries, month, year) {
    if (month === null || month === undefined || !Number.isInteger(year)) return entries;
    const targetKey = year * 12 + month;
    return entries.filter(entry => Number(entry.year || 0) * 12 + Number(entry.month || 0) >= targetKey);
}

function summarizeReadModelCardInstallments(entries) {
    const grouped = new Map();
    entries.forEach((entry) => {
        const key = [normalizeText(entry.descricao), normalizeText(entry.source), normalizeText(entry.categoria)].join('|');
        const existing = grouped.get(key) || {
            descricao: entry.descricao || 'sem descrição',
            cartao: entry.source || '',
            categoria: entry.categoria || '',
            parcelasLancadas: 0,
            totalPrevisto: 0,
            primeiraParcela: entry.data || '',
            ultimaParcela: entry.data || ''
        };
        existing.parcelasLancadas += 1;
        existing.totalPrevisto += Number(entry.valor || 0);
        grouped.set(key, existing);
    });
    return Array.from(grouped.values())
        .filter(item => item.parcelasLancadas > 1)
        .sort((a, b) => b.totalPrevisto - a.totalPrevisto);
}

function summarizeReadModelInvoicesByCard(entries) {
    const grouped = new Map();
    entries.forEach((entry) => {
        const cardName = String(entry.source || 'Cartão').trim() || 'Cartão';
        const key = normalizeText(cardName) || cardName;
        const existing = grouped.get(key) || { cartao: cardName, total: 0, parcelas: 0 };
        existing.total += Number(entry.valor || 0);
        existing.parcelas += 1;
        grouped.set(key, existing);
    });
    return Array.from(grouped.values())
        .sort((a, b) => b.total - a.total || String(a.cartao).localeCompare(String(b.cartao), 'pt-BR'));
}

function titleCaseLabel(value) {
    return String(value || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
        .trim();
}

function normalizeEstablishmentLabel(description) {
    const original = String(description || '').trim();
    const normalized = normalizeText(original);
    if (!normalized) return 'Sem descrição';
    if (normalized.includes('ifood') || normalized.includes('i food')) return 'iFood';
    if (normalized.includes('uber')) return 'Uber';
    if (normalized.includes('mercadolivre') || normalized.includes('mercado livre')) return 'Mercado Livre';
    if (normalized.includes('google')) return 'Google';

    const cleaned = original
        .replace(/\s*[-–—]?\s*(?:parcela\s*)?\d+\s*\/\s*\d+\s*$/i, '')
        .replace(/\b(?:compra|pagamento|pix|debito|débito|credito|crédito|nu\s*pay|nupay)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return titleCaseLabel(cleaned || original).slice(0, 60);
}

function groupExpenseRows(entries, keyFn) {
    const grouped = new Map();
    entries.forEach((entry) => {
        const label = String(keyFn(entry) || 'Outros').trim() || 'Outros';
        const key = normalizeText(label) || label;
        const existing = grouped.get(key) || { label, total: 0, count: 0 };
        existing.total += Number(entry.valor || 0);
        existing.count += 1;
        grouped.set(key, existing);
    });
    return Array.from(grouped.values())
        .sort((a, b) => b.total - a.total || b.count - a.count || String(a.label).localeCompare(String(b.label), 'pt-BR'));
}

function normalizeReadModelExpense(entry, type) {
    return {
        data: entry.data || '',
        descricao: entry.descricao || '',
        categoria: entry.categoria || 'Outros',
        subcategoria: entry.subcategoria || '',
        valor: Number(entry.valor || 0),
        origem: type === 'cartao' ? 'Cartão' : 'Saídas',
        tipo: type,
        pagamento: type === 'cartao' ? 'Crédito' : '',
        cartao: type === 'cartao' ? entry.source || '' : '',
        parcela: '',
        mesCobranca: ''
    };
}

function buildReadModelExpenseDetail(rows, params = {}) {
    const totalSaidas = rows
        .filter(row => row.tipo === 'saida')
        .reduce((sum, row) => sum + Number(row.valor || 0), 0);
    const totalCartoes = rows
        .filter(row => row.tipo === 'cartao')
        .reduce((sum, row) => sum + Number(row.valor || 0), 0);
    return {
        total: totalSaidas + totalCartoes,
        totalSaidas,
        totalCartoes,
        categorias: groupExpenseRows(rows, row => row.categoria || 'Outros').slice(0, 8),
        estabelecimentos: groupExpenseRows(rows, row => normalizeEstablishmentLabel(row.descricao)).slice(0, 10),
        formas: groupExpenseRows(rows, row => row.tipo === 'cartao' ? (row.cartao || 'Cartão de Crédito') : 'Saídas').slice(0, 8),
        lancamentos: rows.slice(0, 12),
        filtroCartao: params.cartao || ''
    };
}

function isReadModelGoalActive(status, target, current) {
    const normalized = normalizeText(status || '');
    return !/(concluid|finalizad|atingid|quitad|cancelad|pausad)/.test(normalized) && Number(target || 0) > Number(current || 0);
}

function summarizeReadModelGoals(userId, { onlyActive = false } = {}) {
    const allGoals = readModel.metas
        .filter(entry => entry.user_id === userId)
        .map((entry) => {
            const row = entry.row || [];
            const alvo = parseValue(row[1] || 0);
            const atual = parseValue(row[2] || 0);
            const falta = Math.max(0, alvo - atual);
            const progressoPct = alvo > 0 ? Math.min(100, (atual / alvo) * 100) : parseValue(row[3] || 0);
            return {
                nome: row[0] || 'Meta',
                alvo,
                atual,
                progressoPct,
                falta,
                valorMensal: parseValue(row[4] || 0),
                dataFim: row[5] || '',
                status: row[6] || '',
                prioridade: row[7] || '',
                escopo: row[9] || '',
                ultimaMovimentacao: row[10] || '',
                ativa: isReadModelGoalActive(row[6], alvo, atual)
            };
        })
        .sort((a, b) => Number(b.ativa) - Number(a.ativa) || b.falta - a.falta || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    const goals = onlyActive ? allGoals.filter(goal => goal.ativa) : allGoals;
    return {
        results: goals,
        details: {
            total: allGoals.length,
            ativas: allGoals.filter(goal => goal.ativa).length,
            totalAlvo: allGoals.reduce((sum, goal) => sum + goal.alvo, 0),
            totalAtual: allGoals.reduce((sum, goal) => sum + goal.atual, 0),
            totalFalta: goals.reduce((sum, goal) => sum + goal.falta, 0),
            totalValorMensal: goals.reduce((sum, goal) => sum + Number(goal.valorMensal || 0), 0)
        }
    };
}

async function executeAnalyticalIntent(intent, parameters, { userId }) {
    const sqlResult = queryAnalyticalIntentSql(intent, parameters, { userId });
    if (sqlResult) {
        metrics.increment('read_model.sqlite.hit');
        return withResultSource(sqlResult, 'sqlite');
    }
    metrics.increment('read_model.sqlite.miss');
    metrics.increment('read_model.memory_fallback.started');

    const month = normalizeMonthParam(parameters?.mes);
    const year = normalizeYearParam(parameters?.ano);
    const categoria = parameters?.categoria || '';

    const saidasDoUsuario = readModel.saidas
        .filter((entry) => entry.user_id === userId && periodMatches(entry, month, year));
    const entradasDoUsuario = readModel.entradas
        .filter((entry) => entry.user_id === userId && periodMatches(entry, month, year));
    const cartoesDoUsuario = readModel.cartoes
        .filter((entry) => entry.user_id === userId && periodMatches(entry, month, year));
    const gastosUnificados = getUnifiedExpensesForUser(userId, month, year);

    switch (intent) {
    case 'total_gastos_mes': {
        const totalSaidas = saidasDoUsuario.reduce((sum, entry) => sum + entry.valor, 0);
        const totalCartoes = cartoesDoUsuario.reduce((sum, entry) => sum + entry.valor, 0);
        return withResultSource({
            results: totalSaidas + totalCartoes,
            details: {
                totalSaidas,
                totalCartoes,
                mes: month,
                ano: year
            }
        }, 'memory_fallback');
    }
    case 'total_gastos_categoria_mes': {
        const totalSaidas = saidasDoUsuario
            .filter((entry) => categoryMatches(entry, categoria))
            .reduce((sum, entry) => sum + entry.valor, 0);
        const totalCartoes = cartoesDoUsuario
            .filter((entry) => categoryMatches(entry, categoria))
            .reduce((sum, entry) => sum + entry.valor, 0);
        return withResultSource({ results: totalSaidas + totalCartoes, details: { categoria, mes: month, ano: year } }, 'memory_fallback');
    }
    case 'media_gastos_categoria_mes': {
        const filtered = saidasDoUsuario.filter((entry) => categoryMatches(entry, categoria));
        const total = filtered.reduce((sum, entry) => sum + entry.valor, 0);
        const media = filtered.length > 0 ? total / filtered.length : 0;
        return withResultSource({ results: media, details: { categoria, mes: month, ano: year } }, 'memory_fallback');
    }
    case 'media_diaria_gastos_mes': {
        const total = gastosUnificados.reduce((sum, entry) => sum + Number(entry.valor || 0), 0);
        const days = daysConsideredForAverage(month, year);
        return withResultSource({
            results: days > 0 ? total / days : 0,
            details: { mes: month, ano: year, diasConsiderados: days, totalGastos: total }
        }, 'memory_fallback');
    }
    case 'total_gastos_multiplas_categorias': {
        const categorias = Array.isArray(parameters?.categorias) ? parameters.categorias.filter(Boolean) : [];
        const total = gastosUnificados
            .filter((entry) => categorias.some(cat => categoryMatches(entry, cat)))
            .reduce((sum, entry) => sum + Number(entry.valor || 0), 0);
        return withResultSource({ results: total, details: { categorias, mes: month, ano: year } }, 'memory_fallback');
    }
    case 'percentual_categoria_gastos': {
        const totalGastos = gastosUnificados.reduce((sum, entry) => sum + Number(entry.valor || 0), 0);
        const totalCategoria = gastosUnificados
            .filter((entry) => categoryMatches(entry, categoria))
            .reduce((sum, entry) => sum + Number(entry.valor || 0), 0);
        const percentual = totalGastos > 0 ? (totalCategoria / totalGastos) * 100 : 0;
        return withResultSource({
            results: percentual,
            details: { categoria, mes: month, ano: year, totalCategoria, totalGastos }
        }, 'memory_fallback');
    }
    case 'comparacao_gastos_categorias': {
        const categorias = Array.isArray(parameters?.categorias) ? parameters.categorias.filter(Boolean).slice(0, 2) : [];
        return withResultSource({
            results: {
                categorias: categorias.map(cat => ({
                    categoria: cat,
                    total: gastosUnificados
                        .filter((entry) => categoryMatches(entry, cat))
                        .reduce((sum, entry) => sum + Number(entry.valor || 0), 0)
                }))
            },
            details: { categorias, mes: month, ano: year }
        }, 'memory_fallback');
    }
    case 'listagem_gastos_categoria': {
        const filtered = saidasDoUsuario
            .filter((entry) => categoryMatches(entry, categoria))
            .map((entry) => [entry.data, entry.descricao, entry.categoria, entry.subcategoria, entry.valor]);
        return withResultSource({ results: filtered, details: { categoria, mes: month, ano: year } }, 'memory_fallback');
    }
    case 'contagem_ocorrencias': {
        const dataParaAnalise = gastosUnificados.map((entry) => [entry.data, entry.descricao, entry.categoria, entry.subcategoria]);
        const filtered = analysisService.countOccurrences(dataParaAnalise, [normalizeText(categoria)], year, month);
        return withResultSource({ results: filtered.length, details: { categoria, mes: month, ano: year } }, 'memory_fallback');
    }
    case 'gastos_valores_duplicados': {
        const valoresContados = new Map();
        saidasDoUsuario.forEach((entry) => {
            const key = Math.round(entry.valor * 100) / 100;
            if (!valoresContados.has(key)) {
                valoresContados.set(key, []);
            }
            valoresContados.get(key).push(entry.descricao);
        });
        const duplicatas = [];
        valoresContados.forEach((descricoes, valor) => {
            if (descricoes.length > 1) {
                duplicatas.push({ valor, count: descricoes.length, itens: descricoes });
            }
        });
        return withResultSource({ results: duplicatas, details: { mes: month, ano: year } }, 'memory_fallback');
    }
    case 'maior_menor_gasto': {
        if (!gastosUnificados.length) {
            return withResultSource({ results: { min: null, max: null }, details: { mes: month, ano: year } }, 'memory_fallback');
        }
        const mapped = gastosUnificados.map((entry) => [entry.data, entry.descricao, entry.categoria, entry.subcategoria, entry.valor]);
        const minMax = analysisService.findMinMax(mapped);
        return withResultSource({ results: { min: minMax.min, max: minMax.max }, details: { mes: month, ano: year } }, 'memory_fallback');
    }
    case 'maior_menor_gasto_categoria': {
        const filtered = gastosUnificados.filter((entry) => categoryMatches(entry, categoria));
        if (!filtered.length) {
            return withResultSource({ results: { min: null, max: null }, details: { categoria, mes: month, ano: year } }, 'memory_fallback');
        }
        const mapped = filtered.map((entry) => [entry.data, entry.descricao, entry.categoria, entry.subcategoria, entry.valor]);
        const minMax = analysisService.findMinMax(mapped);
        return withResultSource({ results: { min: minMax.min, max: minMax.max }, details: { categoria, mes: month, ano: year } }, 'memory_fallback');
    }
    case 'saldo_do_mes': {
        const totalEntradas = entradasDoUsuario.reduce((sum, entry) => sum + entry.valor, 0);
        const totalSaidas = saidasDoUsuario.reduce((sum, entry) => sum + entry.valor, 0);
        const totalCartoes = cartoesDoUsuario.reduce((sum, entry) => sum + entry.valor, 0);
        const saldo = totalEntradas - (totalSaidas + totalCartoes);
        return withResultSource({
            results: saldo,
            details: {
                totalSaidas: totalSaidas + totalCartoes,
                totalEntradas,
                mes: month,
                ano: year
            }
        }, 'memory_fallback');
    }
    case 'total_fatura_cartao': {
        const rows = cartoesDoUsuario.filter(entry => readModelCardMatches(entry, parameters?.cartao));
        return withResultSource({
            results: rows.reduce((sum, entry) => sum + Number(entry.valor || 0), 0),
            details: { cartao: parameters?.cartao || '', mes: month, ano: year, parcelas: rows.length }
        }, 'memory_fallback');
    }
    case 'total_faturas_por_cartao': {
        const rows = cartoesDoUsuario.filter(entry => readModelCardMatches(entry, parameters?.cartao));
        const results = summarizeReadModelInvoicesByCard(rows);
        return withResultSource({
            results,
            details: {
                cartao: parameters?.cartao || '',
                mes: month,
                ano: year,
                total: results.reduce((sum, item) => sum + Number(item.total || 0), 0),
                cartoes: results.length,
                parcelas: rows.length
            }
        }, 'memory_fallback');
    }
    case 'detalhamento_gastos_mes':
    case 'detalhamento_cartao_mes':
    case 'ranking_estabelecimentos_gastos': {
        const onlyCards = intent === 'detalhamento_cartao_mes' || normalizeText(parameters?.origem || '') === 'cartao';
        const rows = [
            ...(onlyCards ? [] : saidasDoUsuario.map(entry => normalizeReadModelExpense(entry, 'saida'))),
            ...cartoesDoUsuario
                .filter(entry => readModelCardMatches(entry, parameters?.cartao))
                .map(entry => normalizeReadModelExpense(entry, 'cartao'))
        ].sort((a, b) => Number(b.valor || 0) - Number(a.valor || 0) || String(b.data || '').localeCompare(String(a.data || '')));

        if (intent === 'ranking_estabelecimentos_gastos') {
            const results = groupExpenseRows(rows, row => normalizeEstablishmentLabel(row.descricao)).slice(0, 15);
            return withResultSource({
                results,
                details: {
                    mes: month,
                    ano: year,
                    total: results.reduce((sum, item) => sum + Number(item.total || 0), 0),
                    totalLancamentos: rows.length,
                    somenteCartao: onlyCards
                }
            }, 'memory_fallback');
        }

        return withResultSource({
            results: buildReadModelExpenseDetail(rows, parameters),
            details: {
                cartao: parameters?.cartao || '',
                mes: month,
                ano: year,
                totalLancamentos: rows.length,
                criterioCartao: 'mes_cobranca',
                somenteCartao: onlyCards
            }
        }, 'memory_fallback');
    }
    case 'total_cartoes_em_aberto': {
        const rows = readModelCardRowsFromPeriod(
            readModel.cartoes
                .filter(entry => entry.user_id === userId)
                .filter(entry => readModelCardMatches(entry, parameters?.cartao)),
            month,
            year
        );
        const monthKeys = new Set(rows.map(entry => `${entry.year}-${entry.month}`));
        return withResultSource({
            results: rows.reduce((sum, entry) => sum + Number(entry.valor || 0), 0),
            details: { cartao: parameters?.cartao || '', mes: month, ano: year, parcelas: rows.length, meses: monthKeys.size }
        }, 'memory_fallback');
    }
    case 'resumo_parcelamentos_cartao': {
        const rows = readModelCardRowsFromPeriod(
            readModel.cartoes
                .filter(entry => entry.user_id === userId)
                .filter(entry => readModelCardMatches(entry, parameters?.cartao)),
            month,
            year
        );
        return withResultSource({
            results: summarizeReadModelCardInstallments(rows),
            details: { cartao: parameters?.cartao || '', mes: month, ano: year }
        }, 'memory_fallback');
    }
    case 'resumo_metas':
        return withResultSource(summarizeReadModelGoals(userId), 'memory_fallback');
    case 'progresso_metas':
        return withResultSource(summarizeReadModelGoals(userId, { onlyActive: true }), 'memory_fallback');
    default:
        return withResultSource({ results: 'Pergunta genérica', details: null }, 'memory_fallback');
    }
}

async function executeFinancialQueryPlanFromReadModel(financialQueryPlan, intent, parameters, { userId, resolvedScope } = {}) {
    if (!financialQueryPlan || !intent) return null;

    if (String(userId || '').trim() === ALL_USERS_ID) {
        metrics.increment('read_model.sqlite.query_engine_scope_blocked');
        return null;
    }
    if (resolvedScope && resolvedScope.decision !== 'allow') {
        metrics.increment('read_model.sqlite.query_engine_scope_blocked');
        return null;
    }
    const resolvedUserIds = resolvedScope?.decision === 'allow'
        ? Array.from(new Set((resolvedScope.userIds || []).map(id => String(id || '').trim()).filter(Boolean)))
        : [String(userId || '').trim()].filter(Boolean);
    if (resolvedUserIds.length === 0) return null;
    const effectiveScope = resolvedScope?.decision === 'allow' ? resolvedScope.scope : 'personal';
    const scopedFinancialQueryPlan = {
        ...financialQueryPlan,
        filters: {
            ...(financialQueryPlan.filters || {}),
            scope: effectiveScope
        }
    };
    if (effectiveScope === 'member') delete scopedFinancialQueryPlan.filters.member;

    const sqliteDataSources = queryFinancialQueryDataSourcesSql(scopedFinancialQueryPlan, {
        userId,
        userIds: resolvedUserIds,
        currentDate: parameters?.currentDate
    });
    if (sqliteDataSources) {
        const result = await executeFinancialQueryPlanForLegacyIntent(
            intent,
            { ...(parameters || {}), scope: effectiveScope, financialQueryPlan: scopedFinancialQueryPlan },
            sqliteDataSources
        );
        if (result) {
            metrics.increment('read_model.sqlite.query_engine_hit');
            return withResultSource(result, 'sqlite_query_engine');
        }
    }

    return null;
}

function getReadModelStats() {
    return {
        ...readModel.meta,
        saidas: readModel.saidas.length,
        entradas: readModel.entradas.length,
        cartoes: readModel.cartoes.length,
        transferencias: readModel.transferencias.length,
        cartoesConfig: readModel.cartoesConfig.length,
        userSettings: readModel.userSettings.length,
        metas: readModel.metas.length,
        movimentacoesMetas: readModel.movimentacoesMetas.length,
        dividas: readModel.dividas.length,
        contas: readModel.contas.length,
        sqlite: getSqliteStats()
    };
}

function initializeReadModel() {
    loadReadModelFromDisk();
    ensureSqliteReady();
    syncSnapshotToSqlite(readModel);
}

function parseDateToTimestamp(dateStr, fallbackYear = null, fallbackMonth = null) {
    const parsed = parseSheetDate(String(dateStr || '').trim());
    if (parsed) return parsed.getTime();
    if (typeof fallbackYear === 'number' && typeof fallbackMonth === 'number') {
        return new Date(fallbackYear, fallbackMonth, 1).getTime();
    }
    return 0;
}

function transferDashboardText(entry = {}) {
    return normalizeText([
        entry.descricao,
        entry.origem,
        entry.destino,
        entry.observacoes,
        entry.status
    ].filter(Boolean).join(' '));
}

function transferHasReserveKeyword(entry = {}) {
    const text = transferDashboardText(entry);
    return [
        'rdb',
        'caixinha',
        'nu reserva',
        'reserva',
        'investimento',
        'aplic aut',
        'aplicacao aut',
        'aplicação aut'
    ].some(term => text.includes(normalizeText(term)));
}

function isDashboardReserveApplication(entry = {}) {
    const text = transferDashboardText(entry);
    return transferHasReserveKeyword(entry) && (
        text.includes('aplicacao') ||
        text.includes('aplicação') ||
        text.includes('guardar') ||
        text.includes('guardado')
    );
}

function isDashboardReserveRedemption(entry = {}) {
    const text = transferDashboardText(entry);
    return transferHasReserveKeyword(entry) && (
        text.includes('resgate') ||
        text.includes('retirada')
    );
}

function roundDashboardMoney(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function getDashboardSnapshot(userId, { month, year } = {}) {
    const currentDate = new Date();
    const targetMonth = normalizeMonthParam(month) ?? currentDate.getMonth();
    const targetYear = normalizeYearParam(year);

    const saidasMonth = readModel.saidas.filter((entry) => entry.user_id === userId && periodMatches(entry, targetMonth, targetYear));
    const entradasMonth = readModel.entradas.filter((entry) => entry.user_id === userId && periodMatches(entry, targetMonth, targetYear));
    const cartoesMonth = readModel.cartoes.filter((entry) => entry.user_id === userId && periodMatches(entry, targetMonth, targetYear));
    const transferenciasMonth = readModel.transferencias.filter((entry) => entry.user_id === userId && periodMatches(entry, targetMonth, targetYear));

    const totalEntradas = entradasMonth.reduce((sum, entry) => sum + entry.valor, 0);
    const totalSaidas = saidasMonth.reduce((sum, entry) => sum + entry.valor, 0);
    const totalCartoes = cartoesMonth.reduce((sum, entry) => sum + entry.valor, 0);
    const reservaAplicada = roundDashboardMoney(transferenciasMonth.filter(isDashboardReserveApplication).reduce((sum, entry) => sum + Number(entry.valor || 0), 0));
    const reservaResgatada = roundDashboardMoney(transferenciasMonth.filter(isDashboardReserveRedemption).reduce((sum, entry) => sum + Number(entry.valor || 0), 0));
    const reservaLiquida = roundDashboardMoney(reservaAplicada - reservaResgatada);
    const saldo = roundDashboardMoney(totalEntradas - (totalSaidas + totalCartoes));
    const saldoDisponivelEstimado = roundDashboardMoney(saldo - reservaLiquida);

    const categoryTotals = {};
    [...saidasMonth, ...cartoesMonth].forEach((entry) => {
        const key = entry.categoria || 'Outros';
        categoryTotals[key] = (categoryTotals[key] || 0) + entry.valor;
    });
    const topCategories = Object.entries(categoryTotals)
        .map(([category, value]) => ({ category, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);

    const daily = {};
    entradasMonth.forEach((entry) => {
        const key = entry.data;
        if (!daily[key]) daily[key] = { date: key, entradas: 0, saidas: 0, saldo: 0 };
        daily[key].entradas += entry.valor;
        daily[key].saldo += entry.valor;
    });
    [...saidasMonth, ...cartoesMonth].forEach((entry) => {
        const key = entry.data;
        if (!daily[key]) daily[key] = { date: key, entradas: 0, saidas: 0, saldo: 0 };
        daily[key].saidas += entry.valor;
        daily[key].saldo -= entry.valor;
    });
    const dailyFlow = Object.values(daily)
        .sort((a, b) => parseDateToTimestamp(a.date) - parseDateToTimestamp(b.date))
        .slice(-31);

    const recentTransactions = [
        ...entradasMonth.map((entry) => ({
            date: entry.data,
            description: entry.descricao,
            type: 'entrada',
            category: entry.categoria,
            value: entry.valor,
            timestamp: parseDateToTimestamp(entry.data, entry.year, entry.month)
        })),
        ...saidasMonth.map((entry) => ({
            date: entry.data,
            description: entry.descricao,
            type: 'saida',
            category: entry.categoria,
            value: entry.valor,
            timestamp: parseDateToTimestamp(entry.data, entry.year, entry.month)
        })),
        ...cartoesMonth.map((entry) => ({
            date: entry.data,
            description: entry.descricao,
            type: 'cartao',
            typeLabel: 'Cartão',
            category: entry.categoria,
            value: entry.valor,
            timestamp: parseDateToTimestamp(entry.data, entry.year, entry.month)
        })),
        ...transferenciasMonth.map((entry) => ({
            date: entry.data,
            description: entry.descricao,
            type: 'transferencia',
            typeLabel: 'Transferência',
            category: 'Transferência',
            value: entry.valor,
            timestamp: parseDateToTimestamp(entry.data, entry.year, entry.month)
        }))
    ]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 12)
        .map(({ timestamp, ...item }) => item);

    const goals = readModel.metas
        .filter((entry) => entry.user_id === userId)
        .map((entry) => {
            const row = entry.row || [];
            const target = parseValue(row[1] || 0);
            const current = parseValue(row[2] || 0);
            const progress = target > 0 ? Math.min(100, (current / target) * 100) : parseValue(row[3] || 0);
            return {
                name: row[0] || 'Meta',
                target,
                current,
                progressPct: progress
            };
        })
        .slice(0, 8);

    const debts = readModel.dividas
        .filter((entry) => entry.user_id === userId)
        .map((entry) => {
            const row = entry.row || [];
            const statusValue = genericRowValue(entry, ['Status'], 10);
            const status = normalizeText(statusValue);
            return {
                name: row[0] || 'Dívida',
                creditor: row[1] || '',
                saldoAtual: parseValue(row[4] || 0),
                jurosPct: parseValue(row[6] || 0),
                status: statusValue || ''
            };
        });
    const activeDebts = debts.filter((debt) => {
        const s = normalizeText(debt.status || '');
        return !(s.includes('quitad') || s.includes('pago') || s.includes('finalizad'));
    });
    const totalDebt = activeDebts.reduce((sum, debt) => sum + debt.saldoAtual, 0);

    return decorateDashboardSummary({
        period: { month: targetMonth, year: targetYear },
        kpis: {
            entradas: totalEntradas,
            saidas: totalSaidas,
            cartoes: totalCartoes,
            saldo,
            reservaAplicada,
            reservaResgatada,
            reservaLiquida,
            saldoDisponivelEstimado,
            debtActiveCount: activeDebts.length,
            debtTotal: totalDebt
        },
        topCategories,
        dailyFlow,
        recentTransactions,
        goals,
        debts: activeDebts.slice(0, 10),
        sync: readModel.meta
    });
}

function getDashboardSqlData(userId, { month, year } = {}) {
    const kpis = queryKpis(userId, { month, year });
    if (!kpis) return null;
    return decorateDashboardSummary({
        period: kpis.period,
        kpis: {
            entradas: kpis.entradas,
            saidas: kpis.saidas,
            cartoes: kpis.cartoes,
            saldo: kpis.saldo,
            reservaAplicada: kpis.reservaAplicada,
            reservaResgatada: kpis.reservaResgatada,
            reservaLiquida: kpis.reservaLiquida,
            saldoDisponivelEstimado: kpis.saldoDisponivelEstimado,
            debtActiveCount: kpis.debtActiveCount,
            debtTotal: kpis.debtTotal
        },
        topCategories: queryTopCategories(userId, { month, year }) || [],
        dailyFlow: queryCashflow(userId, { month, year }) || [],
        recentTransactions: queryRecentTransactions(userId, { month, year }) || [],
        goals: queryGoals(userId) || [],
        debts: queryDebts(userId) || [],
        alerts: queryAlerts(userId, { month, year }) || [],
        sync: {
            ...readModel.meta,
            sqlite: getSqliteStats()
        }
    });
}

module.exports = {
    ALL_USERS_ID,
    initializeReadModel,
    syncReadModelIfNeeded,
    markReadModelDirty,
    executeAnalyticalIntent,
    executeFinancialQueryPlanFromReadModel,
    getReadModelStats,
    getDashboardSnapshot,
    getDashboardSqlData,
    isSqliteReady,
    __test__: {
        mapLegacyCardRows,
        mapUnifiedCardRows,
        buildCanonicalCardEntries
    }
};
