const { google } = require('googleapis');
const { AsyncLocalStorage } = require('async_hooks');
const path = require('path');
const fs = require('fs');
const { convertToIsoDateTime } = require('../utils/helpers');
const { getOAuthConnection } = require('./oauthTokenStore');

const GOOGLE_CREDENTIALS_PATH = path.resolve(process.cwd(), 'credentials.json');
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
let sheets;
let tasks;
let calendar;
let oAuth2Client;
let authInFlight = null;
const sheetContext = new AsyncLocalStorage();

const USER_SHEET_NAMES = new Set([
    'Dashboard',
    'Manual',
    'Saídas',
    'Entradas',
    'Transferências',
    'Dívidas',
    'Metas',
    'Cartões',
    'Lançamentos Cartão',
    'Contas'
]);

function runWithUserSheetContext(userOrContext, fn) {
    const userId = String(userOrContext?.user_id || userOrContext?.userId || '').trim();
    return sheetContext.run({ userId }, fn);
}

function getCurrentSheetContext(options = {}) {
    if (options.forceCentral) return {};
    const explicitUserId = String(options.userId || '').trim();
    if (explicitUserId) return { userId: explicitUserId };
    return sheetContext.getStore() || {};
}

function isLegacyCreditCardSheetName(sheetName) {
    return String(sheetName || '').trim().startsWith('Cartão ');
}

function splitRangeSheetName(range = '') {
    const match = String(range || '').match(/^'((?:[^']|'')+)'!(.+)$/);
    if (match) {
        return {
            sheetName: match[1].replace(/''/g, "'"),
            suffix: match[2],
            quoted: true
        };
    }
    const bangIndex = String(range || '').indexOf('!');
    if (bangIndex === -1) return { sheetName: String(range || ''), suffix: '', quoted: false };
    return {
        sheetName: String(range).slice(0, bangIndex),
        suffix: String(range).slice(bangIndex + 1),
        quoted: false
    };
}

function shouldUseUserSpreadsheetForSheet(sheetName) {
    const safeSheetName = String(sheetName || '').trim();
    return USER_SHEET_NAMES.has(safeSheetName) || isLegacyCreditCardSheetName(safeSheetName);
}

function mapSheetNameForUserSpreadsheet(sheetName) {
    return isLegacyCreditCardSheetName(sheetName) ? 'Lançamentos Cartão' : sheetName;
}

function mapRangeForUserSpreadsheet(range) {
    const parsed = splitRangeSheetName(range);
    const mappedSheetName = mapSheetNameForUserSpreadsheet(parsed.sheetName);
    if (!parsed.suffix && !isLegacyCreditCardSheetName(parsed.sheetName)) return mappedSheetName;
    const suffix = isLegacyCreditCardSheetName(parsed.sheetName) ? 'A:J' : parsed.suffix;
    return `${mappedSheetName}!${suffix || 'A:A'}`;
}

function cardIdFromLegacySheetName(sheetName) {
    return String(sheetName || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/^cartao\s+/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'cartao';
}

function mapRowForUserSpreadsheet(sheetName, row) {
    if (!isLegacyCreditCardSheetName(sheetName)) return row;
    return [
        row[0] || '',
        row[1] || '',
        row[2] || '',
        row[3] || '',
        row[4] || '',
        row[5] || '',
        cardIdFromLegacySheetName(sheetName),
        sheetName,
        '',
        row[6] || ''
    ];
}

function mapValuesFromUserSpreadsheetRange(originalRange, values = []) {
    const parsed = splitRangeSheetName(originalRange);
    if (!isLegacyCreditCardSheetName(parsed.sheetName)) return values;
    return values.map((row, index) => {
        if (index === 0) {
            return ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'user_id'];
        }
        return [row[0] || '', row[1] || '', row[2] || '', row[3] || '', row[4] || '', row[5] || '', row[9] || ''];
    });
}

function getErrorStatusCode(error) {
    return error?.code || error?.status || error?.response?.status || null;
}

function isGoogleAuthError(error) {
    const status = getErrorStatusCode(error);
    const msg = String(error?.message || '').toLowerCase();
    const oauthError = String(error?.response?.data?.error || '').toLowerCase();
    const oauthDescription = String(error?.response?.data?.error_description || '').toLowerCase();

    return (
        status === 401 ||
        msg.includes('deleted_client') ||
        msg.includes('invalid_grant') ||
        oauthError.includes('deleted_client') ||
        oauthError.includes('invalid_grant') ||
        oauthDescription.includes('deleted') ||
        oauthDescription.includes('invalid')
    );
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isGoogleRetriableError(error) {
    const status = getErrorStatusCode(error);
    const msg = String(error?.message || '').toLowerCase();
    const reason = String(error?.errors?.[0]?.reason || error?.response?.data?.error?.errors?.[0]?.reason || '').toLowerCase();

    return (
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        reason.includes('ratelimit') ||
        reason.includes('quota') ||
        msg.includes('quota exceeded') ||
        msg.includes('rate limit') ||
        msg.includes('user rate limit')
    );
}

function getGoogleRetryConfig() {
    return {
        attempts: Math.max(1, Number.parseInt(process.env.GOOGLE_API_RETRY_ATTEMPTS || '3', 10)),
        delayMs: Math.max(0, Number.parseInt(process.env.GOOGLE_API_RETRY_DELAY_MS || '30000', 10))
    };
}

async function runRetriableGoogleOperation(operationName, fn) {
    const retryConfig = getGoogleRetryConfig();
    let lastError = null;

    for (let attempt = 1; attempt <= retryConfig.attempts; attempt += 1) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (isGoogleRetriableError(error) && attempt < retryConfig.attempts) {
                console.warn(`⚠️ ${operationName}: erro transitório/quota Google (${error.message}). Tentativa ${attempt}/${retryConfig.attempts}; aguardando ${retryConfig.delayMs}ms...`);
                await sleep(retryConfig.delayMs);
                continue;
            }

            break;
        }
    }

    try {
        throw lastError;
    } catch (error) {
        throw error;
    }
}

async function runWithGoogleRetry(operationName, fn, { swallowOnError = false, fallbackValue = null } = {}) {
    await ensureGoogleAuthorized();
    try {
        return await runRetriableGoogleOperation(operationName, fn);
    } catch (error) {
        if (isGoogleAuthError(error)) {
            console.warn(`⚠️ ${operationName}: erro de autenticação Google detectado. Reautorizando e tentando novamente...`);
            await authorizeGoogle(true);
            try {
                return await runRetriableGoogleOperation(operationName, fn);
            } catch (retryError) {
                console.error(`❌ ${operationName}: falhou após reautorização:`, retryError.message);
                if (swallowOnError) return fallbackValue;
                throw retryError;
            }
        }

        if (swallowOnError) return fallbackValue;
        throw error;
    }
}

async function ensureGoogleAuthorized() {
    if (sheets && tasks && calendar && oAuth2Client) return;
    await authorizeGoogle();
}

async function authorizeGoogle(forceRefresh = false) {
    if (!forceRefresh && sheets && tasks && calendar && oAuth2Client) return;
    if (authInFlight) return authInFlight;

    authInFlight = (async () => {
        try {
            const credentials = JSON.parse(fs.readFileSync(GOOGLE_CREDENTIALS_PATH));
            const keys = credentials.installed || credentials.web;
            const { client_secret, client_id, redirect_uris } = keys;
            oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
            oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

            sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
            tasks = google.tasks({ version: 'v1', auth: oAuth2Client });
            calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

            console.log('✅ Google APIs autorizadas com sucesso!');
        } catch (error) {
            console.error('❌ Erro ao autorizar APIs do Google:', error.message);
            throw error;
        } finally {
            authInFlight = null;
        }
    })();

    await authInFlight;
}

const CALENDAR_USER_ID_PRIVATE_KEY = 'financas_bot_user_id';
const USER_SCOPED_APPEND_USER_ID_INDEX = Object.freeze({
    'Saídas': 9,
    'Entradas': 8,
    'Transferências': 8,
    'Dívidas': 17,
    'Metas': 8,
    'Contas': 3,
    'Dashboard': 3,
    'DashboardData': 3,
    'Users': 0,
    'UserProfile': 0,
    'UserSettings': 0,
    'ConsentLog': 1
});

function requireUserId(value, context) {
    const safeUserId = String(value || '').trim();
    if (!safeUserId) {
        throw new Error(`${context} requer user_id válido.`);
    }
    return safeUserId;
}

function getUserIdIndexForAppend(sheetName) {
    const normalized = String(sheetName || '').trim();
    if (normalized.startsWith('Cartão ')) return 6;
    return USER_SCOPED_APPEND_USER_ID_INDEX[normalized];
}

function validateUserScopedWrite(sheetName, row) {
    const userIdIndex = getUserIdIndexForAppend(sheetName);
    if (!Number.isInteger(userIdIndex)) return;
    if (!Array.isArray(row)) {
        throw new Error(`appendRowToSheet(${sheetName}) requer linha em formato de array.`);
    }
    requireUserId(row[userIdIndex], `appendRowToSheet(${sheetName})`);
}

function normalizeHeaderForNumberFormat(header) {
    return String(header || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function headerToNumberFormat(header) {
    const normalized = normalizeHeaderForNumberFormat(header);
    if (
        normalized.includes('valor') ||
        normalized.includes('saldo') ||
        normalized.includes('monthly_income') ||
        normalized.includes('fixed_expense')
    ) {
        return { type: 'CURRENCY', pattern: '"R$"#,##0.00' };
    }
    if (normalized.includes('%') || normalized.includes('percent')) {
        return { type: 'PERCENT', pattern: '0.00%' };
    }
    if (
        normalized === 'dia do vencimento' ||
        normalized === 'vencimento' ||
        normalized.includes('total parcelas') ||
        normalized.includes('parcelas pagas') ||
        normalized.includes('atraso')
    ) {
        return { type: 'NUMBER', pattern: '0' };
    }
    if (
        normalized === 'data' ||
        normalized.includes('inicio') ||
        normalized.includes('data fim') ||
        normalized.includes('data prevista') ||
        normalized.includes('proximo vencimento')
    ) {
        return { type: 'DATE', pattern: 'dd/mm/yyyy' };
    }
    if (normalized.endsWith('_at') || normalized.endsWith(' at')) {
        return { type: 'DATE_TIME', pattern: 'dd/mm/yyyy hh:mm' };
    }
    return null;
}

function eventBelongsToUser(event, userId) {
    if (!userId) return true;
    return String(event?.extendedProperties?.private?.[CALENDAR_USER_ID_PRIVATE_KEY] || '').trim() === String(userId).trim();
}

async function createCalendarEvent(title, startDateTime, recurrenceRule, options = {}) {
    const safeUserId = requireUserId(options.userId, 'createCalendarEvent');
    try {
        const target = await resolveCalendarTarget({ ...options, userId: safeUserId });
        const isoDateTime = convertToIsoDateTime(startDateTime);
        const event = {
            summary: title,
            start: { dateTime: isoDateTime, timeZone: 'America/Sao_Paulo' },
            end: { dateTime: isoDateTime, timeZone: 'America/Sao_Paulo' },
            extendedProperties: {
                private: {
                    [CALENDAR_USER_ID_PRIVATE_KEY]: safeUserId,
                    financas_bot_source: 'whatsapp'
                }
            }
        };
        if (recurrenceRule) event.recurrence = [`RRULE:${recurrenceRule}`];
        const response = target.userScoped
            ? await target.calendarClient.events.insert({
                calendarId: target.calendarId,
                resource: event,
            })
            : await runWithGoogleRetry('createCalendarEvent', () => calendar.events.insert({
                calendarId: target.calendarId,
                resource: event,
            }));
        return response.data;
    } catch (error) {
        console.error('❌ Erro no Calendar:', error);
        throw new Error('Erro ao criar evento.');
    }
}

async function getSheetIds(options = {}) {
    const target = await resolveSpreadsheetTarget(options);
    try {
        const response = await runSheetsOperation('getSheetIds', target, () => target.sheetsClient.spreadsheets.get({ spreadsheetId: target.spreadsheetId }));
        const sheetData = response.data.sheets;
        const sheetNameToId = {};
        sheetData.forEach(sheet => { sheetNameToId[sheet.properties.title] = sheet.properties.sheetId; });
        return sheetNameToId;
    } catch (error) {
        console.error('❌ Erro ao carregar IDs das abas:', error);
    }
}

function buildUserOAuthClient(tokens = {}) {
    const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
    const redirectUri = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim();
    if (!clientId || !clientSecret) return null;
    const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri || undefined);
    client.setCredentials(tokens);
    return client;
}

async function resolveSpreadsheetTarget(options = {}) {
    const context = getCurrentSheetContext(options);
    const safeUserId = String(context.userId || '').trim();
    const requestedSheet = String(options.sheetName || splitRangeSheetName(options.range || '').sheetName || '').trim();

    if (safeUserId && shouldUseUserSpreadsheetForSheet(requestedSheet)) {
        try {
            const connection = getOAuthConnection(safeUserId, { includeTokens: true });
            const spreadsheetId = String(connection?.spreadsheet_id || '').trim();
            const auth = buildUserOAuthClient(connection?.tokens || {});
            if (spreadsheetId && auth) {
                return {
                    userScoped: true,
                    userId: safeUserId,
                    spreadsheetId,
                    sheetsClient: google.sheets({ version: 'v4', auth })
                };
            }
        } catch (error) {
            console.warn(`⚠️ Não foi possível usar planilha do usuário ${safeUserId}; usando planilha central. Motivo: ${error.message}`);
        }
    }

    await ensureGoogleAuthorized();
    return {
        userScoped: false,
        spreadsheetId: SPREADSHEET_ID,
        sheetsClient: sheets
    };
}

async function resolveCalendarTarget(options = {}) {
    const context = getCurrentSheetContext(options);
    const safeUserId = String(context.userId || '').trim();

    if (safeUserId) {
        try {
            const connection = getOAuthConnection(safeUserId, { includeTokens: true });
            const auth = buildUserOAuthClient(connection?.tokens || {});
            if (auth) {
                return {
                    userScoped: true,
                    userId: safeUserId,
                    calendarClient: google.calendar({ version: 'v3', auth }),
                    calendarId: connection?.calendar_id || 'primary'
                };
            }
        } catch (error) {
            console.warn(`⚠️ Não foi possível usar Calendar do usuário ${safeUserId}; usando Calendar central. Motivo: ${error.message}`);
        }
    }

    await ensureGoogleAuthorized();
    return {
        userScoped: false,
        calendarClient: calendar,
        calendarId: 'primary'
    };
}

async function hasUserSpreadsheetContext(options = {}) {
    const target = await resolveSpreadsheetTarget({ ...options, sheetName: options.sheetName || 'Saídas' });
    return Boolean(target.userScoped);
}

async function runSheetsOperation(operationName, target, fn, { swallowOnError = false, fallbackValue = null } = {}) {
    if (!target?.userScoped) {
        return runWithGoogleRetry(operationName, fn, { swallowOnError, fallbackValue });
    }

    try {
        return await runRetriableGoogleOperation(operationName, fn);
    } catch (error) {
        console.error(`❌ ${operationName}: erro na planilha do usuário:`, error.message);
        if (swallowOnError) return fallbackValue;
        throw error;
    }
}

async function appendRowToSheet(sheetName, row, options = {}) {
    validateUserScopedWrite(sheetName, row);
    const target = await resolveSpreadsheetTarget({ ...options, sheetName });
    const mappedSheetName = target.userScoped ? mapSheetNameForUserSpreadsheet(sheetName) : sheetName;
    const mappedRow = target.userScoped ? mapRowForUserSpreadsheet(sheetName, row) : row;
    try {
        await runSheetsOperation(`appendRowToSheet(${sheetName})`, target, () => target.sheetsClient.spreadsheets.values.append({
            spreadsheetId: target.spreadsheetId,
            range: `${mappedSheetName}!A:A`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: [mappedRow] },
        }));
    } catch (error) {
        console.error(`❌ Erro ao adicionar linha em ${sheetName}:`, error.message);
        throw new Error('Erro ao salvar na planilha.');
    }
}

async function readDataFromSheet(range, options = {}) {
    const target = await resolveSpreadsheetTarget({ ...options, range });
    const mappedRange = target.userScoped ? mapRangeForUserSpreadsheet(range) : range;
    try {
        const response = await runSheetsOperation(
            `readDataFromSheet(${range})`,
            target,
            () => target.sheetsClient.spreadsheets.values.get({ spreadsheetId: target.spreadsheetId, range: mappedRange }),
            { swallowOnError: true, fallbackValue: { data: { values: [] } } }
        );
        return target.userScoped
            ? mapValuesFromUserSpreadsheetRange(range, response.data.values || [])
            : response.data.values || [];
    } catch (error) {
        console.error(`❌ Erro ao ler dados da planilha (${range}):`, error.message);
        return [];
    }
}

async function updateRowInSheet(range, rowData, options = {}) {
    const target = await resolveSpreadsheetTarget({ ...options, range });
    const mappedRange = target.userScoped ? mapRangeForUserSpreadsheet(range) : range;
    try {
        await runSheetsOperation(`updateRowInSheet(${range})`, target, () => target.sheetsClient.spreadsheets.values.update({
            spreadsheetId: target.spreadsheetId,
            range: mappedRange,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [rowData] },
        }));
    } catch (error) {
        console.error(`❌ Erro ao atualizar linha (${range}):`, error.message);
        throw new Error('Erro ao atualizar dados na planilha.');
    }
}

async function batchUpdateRowsInSheet(data, options = {}) {
    const target = await resolveSpreadsheetTarget(options);
    try {
        await runSheetsOperation('batchUpdateRowsInSheet', target, () => target.sheetsClient.spreadsheets.values.batchUpdate({
            spreadsheetId: target.spreadsheetId,
            resource: {
                valueInputOption: 'USER_ENTERED',
                data
            }
        }));
    } catch (error) {
        console.error('❌ Erro em batchUpdateRowsInSheet:', error.message);
        throw new Error('Erro ao atualizar dados em lote na planilha.');
    }
}

function buildEmptyGrid(rows = 40, cols = 13) {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
}

function setCell(grid, row, col, value) {
    if (!grid[row - 1]) return;
    grid[row - 1][col - 1] = value;
}

async function replaceDashboardCharts(dashboardSheetId) {
    const spreadsheet = await runWithGoogleRetry('replaceDashboardCharts.loadSpreadsheet', () => sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
        includeGridData: false,
        fields: 'sheets(properties(sheetId),charts(chartId,position))'
    }));

    const chartDeletes = [];
    const allSheets = spreadsheet?.data?.sheets || [];
    allSheets.forEach((sheet) => {
        const charts = sheet?.charts || [];
        charts.forEach((chart) => {
            const anchorSheetId = chart?.position?.overlayPosition?.anchorCell?.sheetId;
            if (anchorSheetId === dashboardSheetId) {
                chartDeletes.push({
                    deleteEmbeddedObject: {
                        objectId: chart.chartId
                    }
                });
            }
        });
    });

    const addCharts = [
        {
            addChart: {
                chart: {
                    spec: {
                        title: 'Distribuição de Gastos por Categoria',
                        subtitle: 'Top categorias do período filtrado',
                        pieChart: {
                            legendPosition: 'RIGHT_LEGEND',
                            domain: {
                                sourceRange: {
                                    sources: [{
                                        sheetId: dashboardSheetId,
                                        startRowIndex: 9,
                                        endRowIndex: 19,
                                        startColumnIndex: 3,
                                        endColumnIndex: 4
                                    }]
                                }
                            },
                            series: {
                                sourceRange: {
                                    sources: [{
                                        sheetId: dashboardSheetId,
                                        startRowIndex: 9,
                                        endRowIndex: 19,
                                        startColumnIndex: 4,
                                        endColumnIndex: 5
                                    }]
                                }
                            },
                            pieHole: 0.45
                        }
                    },
                    position: {
                        overlayPosition: {
                            anchorCell: { sheetId: dashboardSheetId, rowIndex: 8, columnIndex: 7 },
                            offsetXPixels: 8,
                            offsetYPixels: 8,
                            widthPixels: 520,
                            heightPixels: 300
                        }
                    }
                }
            }
        },
        {
            addChart: {
                chart: {
                    spec: {
                        title: 'Fluxo de Caixa Diário',
                        subtitle: 'Entradas, saídas e saldo',
                        basicChart: {
                            chartType: 'COMBO',
                            legendPosition: 'BOTTOM_LEGEND',
                            headerCount: 1,
                            axis: [
                                { position: 'BOTTOM_AXIS', title: 'Data' },
                                { position: 'LEFT_AXIS', title: 'Valor (R$)' }
                            ],
                            domains: [{
                                domain: {
                                    sourceRange: {
                                        sources: [{
                                            sheetId: dashboardSheetId,
                                            startRowIndex: 21,
                                            endRowIndex: 34,
                                            startColumnIndex: 0,
                                            endColumnIndex: 1
                                        }]
                                    }
                                }
                            }],
                            series: [
                                {
                                    series: {
                                        sourceRange: {
                                            sources: [{
                                                sheetId: dashboardSheetId,
                                                startRowIndex: 21,
                                                endRowIndex: 34,
                                                startColumnIndex: 1,
                                                endColumnIndex: 2
                                            }]
                                        }
                                    },
                                    targetAxis: 'LEFT_AXIS',
                                    type: 'COLUMN'
                                },
                                {
                                    series: {
                                        sourceRange: {
                                            sources: [{
                                                sheetId: dashboardSheetId,
                                                startRowIndex: 21,
                                                endRowIndex: 34,
                                                startColumnIndex: 2,
                                                endColumnIndex: 3
                                            }]
                                        }
                                    },
                                    targetAxis: 'LEFT_AXIS',
                                    type: 'COLUMN'
                                },
                                {
                                    series: {
                                        sourceRange: {
                                            sources: [{
                                                sheetId: dashboardSheetId,
                                                startRowIndex: 21,
                                                endRowIndex: 34,
                                                startColumnIndex: 3,
                                                endColumnIndex: 4
                                            }]
                                        }
                                    },
                                    targetAxis: 'LEFT_AXIS',
                                    type: 'LINE'
                                }
                            ]
                        }
                    },
                    position: {
                        overlayPosition: {
                            anchorCell: { sheetId: dashboardSheetId, rowIndex: 22, columnIndex: 7 },
                            offsetXPixels: 8,
                            offsetYPixels: 8,
                            widthPixels: 520,
                            heightPixels: 300
                        }
                    }
                }
            }
        }
    ];

    const requests = [...chartDeletes, ...addCharts];
    try {
        await runWithGoogleRetry('replaceDashboardCharts.batchUpdate', () => sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: { requests }
        }));
    } catch (error) {
        console.error('❌ Detalhes do erro ao criar gráficos do Dashboard:', JSON.stringify(error?.response?.data || error.message, null, 2));
        throw error;
    }
}

async function renderVisualDashboard(payload = {}) {
    const {
        userOptions = [],
        monthOptions = [],
        selectedUser = 'TODOS',
        selectedMonth = 'TODOS',
        periodLabel = 'Todos os períodos',
        kpis = {},
        topCategories = [],
        dailyFlow = [],
        updatedAt = new Date().toISOString()
    } = payload;

    const grid = buildEmptyGrid(45, 13); // A:M

    setCell(grid, 1, 1, 'Painel Financeiro');
    setCell(grid, 2, 1, 'Resumo visual completo da planilha com filtros por usuário e mês');
    setCell(grid, 3, 1, 'Filtro usuário (user_id)');
    setCell(grid, 3, 2, selectedUser);
    setCell(grid, 4, 1, 'Filtro mês (YYYY-MM)');
    setCell(grid, 4, 2, selectedMonth);
    setCell(grid, 5, 1, 'Período aplicado');
    setCell(grid, 5, 2, periodLabel);
    setCell(grid, 6, 1, 'Atualizado em');
    setCell(grid, 6, 2, updatedAt);

    // KPIs
    setCell(grid, 8, 1, 'Resumo Executivo');
    setCell(grid, 9, 1, 'Entradas');
    setCell(grid, 9, 2, Number(kpis.entradas || 0));
    setCell(grid, 10, 1, 'Saídas (sem cartão)');
    setCell(grid, 10, 2, Number(kpis.saidas || 0));
    setCell(grid, 11, 1, 'Cartões');
    setCell(grid, 11, 2, Number(kpis.cartoes || 0));
    setCell(grid, 12, 1, 'Saldo');
    setCell(grid, 12, 2, Number(kpis.saldo || 0));
    setCell(grid, 13, 1, 'Dívidas ativas (qtd)');
    setCell(grid, 13, 2, Number(kpis.debtActiveCount || 0));
    setCell(grid, 14, 1, 'Dívidas ativas (total)');
    setCell(grid, 14, 2, Number(kpis.debtTotal || 0));
    setCell(grid, 15, 1, 'Metas ativas (qtd)');
    setCell(grid, 15, 2, Number(kpis.goalsActiveCount || 0));
    setCell(grid, 16, 1, 'Metas (valor alvo)');
    setCell(grid, 16, 2, Number(kpis.goalsTargetTotal || 0));
    setCell(grid, 17, 1, 'Metas (valor atual)');
    setCell(grid, 17, 2, Number(kpis.goalsCurrentTotal || 0));

    // Top categorias
    setCell(grid, 8, 4, 'Top Categorias');
    setCell(grid, 9, 4, 'Categoria');
    setCell(grid, 9, 5, 'Valor');
    setCell(grid, 9, 6, 'Barra');
    const topRows = topCategories.slice(0, 10);
    const maxTopValue = topRows.reduce((max, item) => Math.max(max, Number(item.value || 0)), 0);
    for (let i = 0; i < topRows.length; i += 1) {
        const row = 10 + i;
        const value = Number(topRows[i].value || 0);
        const barSize = maxTopValue > 0 ? Math.max(1, Math.round((value / maxTopValue) * 18)) : 0;
        setCell(grid, row, 4, topRows[i].category || 'Outros');
        setCell(grid, row, 5, value);
        setCell(grid, row, 6, barSize > 0 ? '#'.repeat(barSize) : '');
    }

    // Fluxo diário
    setCell(grid, 21, 1, 'Fluxo diário');
    setCell(grid, 22, 1, 'Data');
    setCell(grid, 22, 2, 'Entradas');
    setCell(grid, 22, 3, 'Saídas');
    setCell(grid, 22, 4, 'Saldo');
    const flowRows = dailyFlow.slice(-12);
    for (let i = 0; i < flowRows.length; i += 1) {
        const row = 23 + i;
        setCell(grid, row, 1, flowRows[i].date || '');
        setCell(grid, row, 2, Number(flowRows[i].entradas || 0));
        setCell(grid, row, 3, Number(flowRows[i].saidas || 0));
        setCell(grid, row, 4, Number(flowRows[i].saldo || 0));
    }
    setCell(grid, 22, 6, 'Tendência');
    setCell(grid, 23, 6, 'Ver gráfico ao lado');

    // Legenda do dashboard
    setCell(grid, 37, 1, 'Legenda');
    setCell(grid, 38, 1, 'Saldo > 0: saudável');
    setCell(grid, 39, 1, 'Saldo < 0: atenção ao caixa');
    setCell(grid, 40, 1, 'Filtros: B3 usuário | B4 mês');

    // Opções para dropdown (colunas ocultáveis)
    setCell(grid, 2, 12, 'user_options');
    setCell(grid, 2, 13, 'month_options');
    userOptions.slice(0, 40).forEach((item, idx) => setCell(grid, 3 + idx, 12, item));
    monthOptions.slice(0, 40).forEach((item, idx) => setCell(grid, 3 + idx, 13, item));

    const sheetMap = await getSheetIds();
    const dashboardSheetId = sheetMap.Dashboard;
    if (dashboardSheetId !== undefined) {
        try {
            await runWithGoogleRetry('renderVisualDashboard.unmergeAll', () => sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                resource: {
                    requests: [{
                        unmergeCells: {
                            range: { sheetId: dashboardSheetId }
                        }
                    }]
                }
            }));
        } catch (error) {
            console.error('❌ Detalhes do erro ao desmesclar Dashboard:', JSON.stringify(error?.response?.data || error.message, null, 2));
            throw error;
        }
    }

    try {
        await runWithGoogleRetry('renderVisualDashboard.updateValues', () => sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Dashboard!A1:M45',
            valueInputOption: 'USER_ENTERED',
            resource: { values: grid }
        }));
    } catch (error) {
        console.error('❌ Detalhes do erro ao escrever Dashboard:', JSON.stringify(error?.response?.data || error.message, null, 2));
        throw error;
    }

    if (dashboardSheetId === undefined) return;

    const requests = [
        // Título e subtítulo
        {
            repeatCell: {
                range: { sheetId: dashboardSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: { red: 0.04, green: 0.39, blue: 0.45 },
                        horizontalAlignment: 'LEFT',
                        textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 18 }
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
            }
        },
        {
            repeatCell: {
                range: { sheetId: dashboardSheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 6 },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: { red: 0.9, green: 0.96, blue: 0.98 },
                        horizontalAlignment: 'LEFT',
                        textFormat: { foregroundColor: { red: 0.06, green: 0.24, blue: 0.28 }, fontSize: 10 }
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
            }
        },
        // Cabeçalhos de blocos
        {
            repeatCell: {
                range: { sheetId: dashboardSheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 6 },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: { red: 0.85, green: 0.93, blue: 0.95 },
                        textFormat: { bold: true, foregroundColor: { red: 0.06, green: 0.2, blue: 0.25 } }
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
        },
        {
            repeatCell: {
                range: { sheetId: dashboardSheetId, startRowIndex: 20, endRowIndex: 22, startColumnIndex: 0, endColumnIndex: 6 },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: { red: 0.9, green: 0.95, blue: 0.9 },
                        textFormat: { bold: true, foregroundColor: { red: 0.1, green: 0.26, blue: 0.1 } }
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
        },
        // Filtros
        {
            repeatCell: {
                range: { sheetId: dashboardSheetId, startRowIndex: 2, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 1 },
                cell: {
                    userEnteredFormat: {
                        textFormat: { bold: true, foregroundColor: { red: 0.2, green: 0.24, blue: 0.3 } }
                    }
                },
                fields: 'userEnteredFormat.textFormat'
            }
        },
        {
            repeatCell: {
                range: { sheetId: dashboardSheetId, startRowIndex: 2, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 2 },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: { red: 1, green: 1, blue: 1 },
                        textFormat: { bold: true, foregroundColor: { red: 0.05, green: 0.35, blue: 0.4 } }
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
        },
        // Formato moeda
        {
            repeatCell: {
                range: { sheetId: dashboardSheetId, startRowIndex: 8, endRowIndex: 20, startColumnIndex: 1, endColumnIndex: 2 },
                cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"R$"#,##0.00' } } },
                fields: 'userEnteredFormat.numberFormat'
            }
        },
        {
            repeatCell: {
                range: { sheetId: dashboardSheetId, startRowIndex: 9, endRowIndex: 20, startColumnIndex: 4, endColumnIndex: 5 },
                cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"R$"#,##0.00' } } },
                fields: 'userEnteredFormat.numberFormat'
            }
        },
        {
            repeatCell: {
                range: { sheetId: dashboardSheetId, startRowIndex: 22, endRowIndex: 35, startColumnIndex: 1, endColumnIndex: 4 },
                cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"R$"#,##0.00' } } },
                fields: 'userEnteredFormat.numberFormat'
            }
        },
        // Data validation dropdowns
        {
            setDataValidation: {
                range: { sheetId: dashboardSheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 2 },
                rule: {
                    condition: {
                        type: 'ONE_OF_RANGE',
                        values: [{ userEnteredValue: '=Dashboard!L3:L40' }]
                    },
                    strict: true,
                    showCustomUi: true
                }
            }
        },
        {
            setDataValidation: {
                range: { sheetId: dashboardSheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 1, endColumnIndex: 2 },
                rule: {
                    condition: {
                        type: 'ONE_OF_RANGE',
                        values: [{ userEnteredValue: '=Dashboard!M3:M40' }]
                    },
                    strict: true,
                    showCustomUi: true
                }
            }
        },
        // Bordas na área principal
        {
            updateBorders: {
                range: { sheetId: dashboardSheetId, startRowIndex: 7, endRowIndex: 35, startColumnIndex: 0, endColumnIndex: 6 },
                top: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.85, blue: 0.88 } },
                bottom: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.85, blue: 0.88 } },
                left: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.85, blue: 0.88 } },
                right: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.85, blue: 0.88 } },
                innerHorizontal: { style: 'SOLID', width: 1, color: { red: 0.9, green: 0.92, blue: 0.94 } },
                innerVertical: { style: 'SOLID', width: 1, color: { red: 0.9, green: 0.92, blue: 0.94 } }
            }
        },
        // Configura largura de colunas
        {
            updateDimensionProperties: {
                range: { sheetId: dashboardSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
                properties: { pixelSize: 240 },
                fields: 'pixelSize'
            }
        },
        {
            updateDimensionProperties: {
                range: { sheetId: dashboardSheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
                properties: { pixelSize: 165 },
                fields: 'pixelSize'
            }
        },
        {
            updateDimensionProperties: {
                range: { sheetId: dashboardSheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 6 },
                properties: { pixelSize: 170 },
                fields: 'pixelSize'
            }
        },
        {
            updateDimensionProperties: {
                range: { sheetId: dashboardSheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 13 },
                properties: { pixelSize: 120 },
                fields: 'pixelSize'
            }
        }
    ];

    try {
        await runWithGoogleRetry('renderVisualDashboard.formatting', () => sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: { requests }
        }));
    } catch (error) {
        console.error('❌ Detalhes do erro ao formatar Dashboard:', JSON.stringify(error?.response?.data || error.message, null, 2));
        throw error;
    }

    await replaceDashboardCharts(dashboardSheetId);
}

async function syncDashboardForUser({ userId, periodLabel, metrics }) {
    const safeUserId = String(userId || '').trim();
    if (!safeUserId) {
        throw new Error('syncDashboardForUser requer userId válido.');
    }
    const metricRows = Array.isArray(metrics) ? metrics : [];
    const updatedAt = new Date().toISOString();
    const headers = ['Resumo Financeiro', 'Valor', 'Período', 'user_id', 'updated_at'];

    const existing = await readDataFromSheet('DashboardData!A:E');
    const existingRows = existing && existing.length > 1 ? existing.slice(1) : [];
    const preservedRows = existingRows.filter((row) => String(row[3] || '').trim() !== safeUserId);
    const userRows = metricRows.map((item) => ([
        String(item?.label || '').trim(),
        String(item?.value || '').trim(),
        String(periodLabel || '').trim(),
        safeUserId,
        updatedAt
    ]));

    const allRows = [headers, ...preservedRows, ...userRows];

    await runWithGoogleRetry('syncDashboardForUser.clear', () => sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: 'DashboardData!A2:E'
    }));

    await runWithGoogleRetry('syncDashboardForUser.update', () => sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `DashboardData!A1:E${allRows.length}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: allRows }
    }));
}

async function getCalendarEventsForToday(targetDate = new Date(), options = {}) {
    try {
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const response = await runWithGoogleRetry('getCalendarEventsForToday', () => calendar.events.list({
            calendarId: 'primary',
            timeMin: startOfDay.toISOString(),
            timeMax: endOfDay.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
            timeZone: 'America/Sao_Paulo'
        }), { swallowOnError: true, fallbackValue: { data: { items: [] } } });

        const events = response.data.items || [];
        return options.userId
            ? events.filter(event => eventBelongsToUser(event, options.userId))
            : events;
    } catch (error) {
        console.error('❌ Erro ao buscar eventos no Calendar:', error.message);
        return [];
    }
}

async function ensureSpreadsheetStructure() {
    console.log('--- Verificando Estrutura da Planilha ---');
    const FORMATTED_ROW_LIMIT = 5000;
    const structure = [
        { title: 'Saídas', headers: ['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Observações', 'user_id'], color: { red: 0.9, green: 0.4, blue: 0.4 } },
        { title: 'Entradas', headers: ['Data', 'Descrição', 'Categoria', 'Valor', 'Responsável', 'Recebimento', 'Recorrente', 'Observações', 'user_id'], color: { red: 0.4, green: 0.8, blue: 0.4 } },
        { title: 'Transferências', headers: ['Data', 'Descrição', 'Valor', 'Conta Origem', 'Conta Destino', 'Método', 'Observações', 'Status', 'user_id'], color: { red: 0.42, green: 0.58, blue: 0.74 } },
        { title: 'Dívidas', headers: ['Nome', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Parcela', 'Juros', 'Vencimento', 'Início', 'Total Parcelas', 'Status', 'Responsável', 'Observações', '% Quitado', 'Próximo Vencimento', 'Atraso (Dias)', 'Data Prevista para Quitação', 'user_id'], color: { red: 0.8, green: 0.5, blue: 0.2 } },
        { title: 'Metas', headers: ['Nome', 'Valor Alvo', 'Valor Atual', '% Progresso', 'Valor Mensal', 'Data Fim', 'Status', 'Prioridade', 'user_id'], color: { red: 0.2, green: 0.6, blue: 0.8 } },
        { title: 'Contas', headers: ['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id'], color: { red: 0.9, green: 0.7, blue: 0.3 } },
        { title: 'Dashboard', headers: ['Painel Visual', 'Valor', 'Período', 'user_id', 'updated_at'], color: { red: 0.5, green: 0.5, blue: 0.5 } },
        { title: 'DashboardData', headers: ['Resumo Financeiro', 'Valor', 'Período', 'user_id', 'updated_at'], color: { red: 0.4, green: 0.4, blue: 0.6 } },
        { title: 'Cartão Nubank - Daniel', headers: ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'user_id'], color: { red: 0.6, green: 0.3, blue: 0.7 } },
        { title: 'Cartão Nubank - Thais', headers: ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'user_id'], color: { red: 0.6, green: 0.3, blue: 0.7 } },
        { title: 'Cartão Nubank - Cristina', headers: ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'user_id'], color: { red: 0.6, green: 0.3, blue: 0.7 } },
        { title: 'Cartão Atacadão', headers: ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'user_id'], color: { red: 0.6, green: 0.3, blue: 0.7 } },
        { title: 'Users', headers: ['user_id', 'whatsapp_id', 'phone_e164', 'display_name', 'status', 'created_at', 'updated_at', 'consent_at', 'terms_version', 'deleted_at'], color: { red: 0.2, green: 0.5, blue: 0.9 } },
        { title: 'UserProfile', headers: ['user_id', 'full_name', 'monthly_income', 'fixed_expense_estimate', 'has_debt', 'primary_goal', 'onboarding_completed_at'], color: { red: 0.3, green: 0.6, blue: 0.8 } },
        { title: 'UserSettings', headers: ['user_id', 'timezone', 'weekly_checkin_opt_in', 'monthly_report_opt_in', 'language', 'created_at', 'defaults_enabled', 'default_reserve_percent'], color: { red: 0.4, green: 0.6, blue: 0.7 } },
        { title: 'ConsentLog', headers: ['consent_id', 'user_id', 'whatsapp_id', 'accepted_at', 'terms_version', 'channel', 'evidence'], color: { red: 0.5, green: 0.5, blue: 0.8 } }
    ];

    const headerStyle = {
        textFormat: {
            bold: true,
            foregroundColor: { red: 1, green: 1, blue: 1 },
            fontSize: 10
        },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE',
        wrapStrategy: 'WRAP'
    };

    const bodyStyle = {
        backgroundColor: { red: 0.98, green: 0.99, blue: 0.99 },
        verticalAlignment: 'MIDDLE',
        wrapStrategy: 'WRAP'
    };

    try {
        const spreadsheet = await runWithGoogleRetry('ensureSpreadsheetStructure.spreadsheets.get', () => sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID }));
        const existingSheets = spreadsheet.data.sheets.map(s => s.properties.title);
        const createRequests = [];

        for (const item of structure) {
            if (!existingSheets.includes(item.title)) {
                createRequests.push({ addSheet: { properties: { title: item.title } } });
                console.log(`[Auto-Reparo] Criando aba: ${item.title}`);
            }
        }

        if (createRequests.length > 0) {
            await runWithGoogleRetry('ensureSpreadsheetStructure.createSheets', () => sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, resource: { requests: createRequests } }));
        }

        const updatedSpreadsheet = await runWithGoogleRetry('ensureSpreadsheetStructure.updatedSpreadsheet', () => sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID }));
        const sheetMap = {};
        updatedSpreadsheet.data.sheets.forEach(s => { sheetMap[s.properties.title] = s.properties.sheetId; });

        const formattingRequests = [];
        for (const item of structure) {
            const sheetId = sheetMap[item.title];
            const isDashboard = item.title === 'Dashboard';

            formattingRequests.push({
                updateSheetProperties: {
                    properties: {
                        sheetId,
                        tabColor: item.color
                    },
                    fields: 'tabColor'
                }
            });

            if (isDashboard) {
                continue;
            }
            
            // Cabeçalhos
            formattingRequests.push({
                updateCells: {
                    range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: item.headers.length },
                    rows: [{
                        values: item.headers.map(h => ({
                            userEnteredValue: { stringValue: h },
                            userEnteredFormat: {
                                backgroundColor: item.color,
                                ...headerStyle
                            }
                        }))
                    }],
                    fields: 'userEnteredValue,userEnteredFormat'
                }
            });

            formattingRequests.push({
                repeatCell: {
                    range: { sheetId, startRowIndex: 1, endRowIndex: FORMATTED_ROW_LIMIT, startColumnIndex: 0, endColumnIndex: item.headers.length },
                    cell: { userEnteredFormat: bodyStyle },
                    fields: 'userEnteredFormat(backgroundColor,verticalAlignment,wrapStrategy)'
                }
            });

            formattingRequests.push({
                updateSheetProperties: {
                    properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                    fields: 'gridProperties.frozenRowCount'
                }
            });

            formattingRequests.push({
                updateDimensionProperties: {
                    range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
                    properties: { pixelSize: 36 },
                    fields: 'pixelSize'
                }
            });

            formattingRequests.push({
                autoResizeDimensions: {
                    dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: item.headers.length }
                }
            });

            item.headers.forEach((header, index) => {
                const numberFormat = headerToNumberFormat(header);
                if (!numberFormat) return;
                formattingRequests.push({
                    repeatCell: {
                        range: { sheetId, startRowIndex: 1, endRowIndex: FORMATTED_ROW_LIMIT, startColumnIndex: index, endColumnIndex: index + 1 },
                        cell: { userEnteredFormat: { numberFormat } },
                        fields: 'userEnteredFormat.numberFormat'
                    }
                });
            });

            formattingRequests.push({
                clearBasicFilter: { sheetId }
            });

            formattingRequests.push({
                setBasicFilter: {
                    filter: {
                        range: { sheetId, startRowIndex: 0, endRowIndex: FORMATTED_ROW_LIMIT, startColumnIndex: 0, endColumnIndex: item.headers.length }
                    }
                }
            });
        }

        try {
            await runWithGoogleRetry('ensureSpreadsheetStructure.formatting', () => sheets.spreadsheets.batchUpdate({ 
                spreadsheetId: SPREADSHEET_ID, 
                resource: { requests: formattingRequests } 
            }));
            console.log('✅ Planilha Sincronizada com Sucesso!');
        } catch (error) {
            console.warn('⚠️ Aviso: Algumas formatações da planilha não puderam ser aplicadas:', error.message);
        }

    } catch (error) {
        console.error('❌ Erro fatal ao sincronizar estrutura da planilha:', error.message);
    }
}

async function deleteRowsByIndices(sheetName, rowIndices, options = {}) {
    try {
        const target = await resolveSpreadsheetTarget({ ...options, sheetName });
        const mappedSheetName = target.userScoped ? mapSheetNameForUserSpreadsheet(sheetName) : sheetName;
        const sheetMap = await getSheetIds({ ...options, sheetName });
        const sheetId = sheetMap[mappedSheetName];
        if (sheetId === undefined) {
            return { success: false, message: `Aba "${mappedSheetName}" não encontrada.` };
        }

        // Deleta de baixo para cima para não deslocar os índices
        const sortedIndices = [...rowIndices].sort((a, b) => b - a);

        const requests = sortedIndices.map(index => ({
            deleteDimension: {
                range: {
                    sheetId,
                    dimension: 'ROWS',
                    startIndex: index,
                    endIndex: index + 1
                }
            }
        }));

        await runSheetsOperation(`deleteRowsByIndices(${sheetName})`, target, () => target.sheetsClient.spreadsheets.batchUpdate({
            spreadsheetId: target.spreadsheetId,
            resource: { requests }
        }));

        return { success: true };
    } catch (error) {
        console.error(`❌ Erro ao deletar linhas em ${sheetName}:`, error.message);
        return { success: false, message: 'Erro ao apagar item na planilha.' };
    }
}

module.exports = {
    authorizeGoogle,
    createCalendarEvent,
    getCalendarEventsForToday,
    __test__: {
        eventBelongsToUser,
        requireUserId,
        validateUserScopedWrite,
        isGoogleRetriableError,
        getGoogleRetryConfig,
        headerToNumberFormat,
        mapSheetNameForUserSpreadsheet,
        mapRangeForUserSpreadsheet,
        mapRowForUserSpreadsheet,
        mapValuesFromUserSpreadsheetRange,
        runWithUserSheetContext,
        hasUserSpreadsheetContext
    },
    getSheetIds,
    appendRowToSheet,
    readDataFromSheet,
    updateRowInSheet,
    batchUpdateRowsInSheet,
    syncDashboardForUser,
    renderVisualDashboard,
    deleteRowsByIndices,
    ensureSpreadsheetStructure,
    runWithUserSheetContext,
    hasUserSpreadsheetContext,
    get sheets() { return sheets; }
};
