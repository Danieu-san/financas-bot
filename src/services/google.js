const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const { convertToIsoDateTime } = require('../utils/helpers');

const GOOGLE_CREDENTIALS_PATH = path.resolve(process.cwd(), 'credentials.json');
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
let sheets;
let tasks;
let calendar;
let oAuth2Client;
let authInFlight = null;

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

async function runWithGoogleRetry(operationName, fn, { swallowOnError = false, fallbackValue = null } = {}) {
    await ensureGoogleAuthorized();
    try {
        return await fn();
    } catch (error) {
        if (isGoogleAuthError(error)) {
            console.warn(`⚠️ ${operationName}: erro de autenticação Google detectado. Reautorizando e tentando novamente...`);
            await authorizeGoogle(true);
            try {
                return await fn();
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

async function createCalendarEvent(title, startDateTime, recurrenceRule) {
    try {
        const isoDateTime = convertToIsoDateTime(startDateTime);
        const event = {
            summary: title,
            start: { dateTime: isoDateTime, timeZone: 'America/Sao_Paulo' },
            end: { dateTime: isoDateTime, timeZone: 'America/Sao_Paulo' },
        };
        if (recurrenceRule) event.recurrence = [`RRULE:${recurrenceRule}`];
        const response = await runWithGoogleRetry('createCalendarEvent', () => calendar.events.insert({
            calendarId: 'primary',
            resource: event,
        }));
        return response.data;
    } catch (error) {
        console.error('❌ Erro no Calendar:', error);
        throw new Error('Erro ao criar evento.');
    }
}

async function getSheetIds() {
    try {
        const response = await runWithGoogleRetry('getSheetIds', () => sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID }));
        const sheetData = response.data.sheets;
        const sheetNameToId = {};
        sheetData.forEach(sheet => { sheetNameToId[sheet.properties.title] = sheet.properties.sheetId; });
        return sheetNameToId;
    } catch (error) {
        console.error('❌ Erro ao carregar IDs das abas:', error);
    }
}

async function appendRowToSheet(sheetName, row) {
    try {
        await runWithGoogleRetry(`appendRowToSheet(${sheetName})`, () => sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:A`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: [row] },
        }));
    } catch (error) {
        console.error(`❌ Erro ao adicionar linha em ${sheetName}:`, error.message);
        throw new Error('Erro ao salvar na planilha.');
    }
}

async function readDataFromSheet(range) {
    try {
        const response = await runWithGoogleRetry(
            `readDataFromSheet(${range})`,
            () => sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range }),
            { swallowOnError: true, fallbackValue: { data: { values: [] } } }
        );
        return response.data.values || [];
    } catch (error) {
        console.error(`❌ Erro ao ler dados da planilha (${range}):`, error.message);
        return [];
    }
}

async function updateRowInSheet(range, rowData) {
    try {
        await runWithGoogleRetry(`updateRowInSheet(${range})`, () => sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [rowData] },
        }));
    } catch (error) {
        console.error(`❌ Erro ao atualizar linha (${range}):`, error.message);
        throw new Error('Erro ao atualizar dados na planilha.');
    }
}

async function batchUpdateRowsInSheet(data) {
    try {
        await runWithGoogleRetry('batchUpdateRowsInSheet', () => sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
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

    setCell(grid, 1, 1, 'Painel Financeiro Visual');
    setCell(grid, 2, 1, 'Resumo geral da planilha (filtro por usuário e mês).');
    setCell(grid, 3, 1, 'Filtro usuário (user_id)');
    setCell(grid, 3, 2, selectedUser);
    setCell(grid, 4, 1, 'Filtro mês (YYYY-MM)');
    setCell(grid, 4, 2, selectedMonth);
    setCell(grid, 5, 1, 'Período aplicado');
    setCell(grid, 5, 2, periodLabel);
    setCell(grid, 6, 1, 'Atualizado em');
    setCell(grid, 6, 2, updatedAt);

    // KPIs
    setCell(grid, 8, 1, 'KPIs');
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
    setCell(grid, 8, 4, 'Top categorias');
    setCell(grid, 9, 4, 'Categoria');
    setCell(grid, 9, 5, 'Valor');
    setCell(grid, 9, 6, 'Gráfico');
    const topRows = topCategories.slice(0, 10);
    for (let i = 0; i < topRows.length; i += 1) {
        const row = 10 + i;
        setCell(grid, row, 4, topRows[i].category || 'Outros');
        setCell(grid, row, 5, Number(topRows[i].value || 0));
        setCell(grid, row, 6, `=IF(E${row}=0,"",SPARKLINE(E${row},{"charttype","bar";"max",MAX($E$10:$E$19);"color1","#0f766e"}))`);
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
    setCell(grid, 22, 6, 'Tendência de saldo');
    setCell(grid, 23, 6, '=IF(COUNTA($D$23:$D$34)=0,"",SPARKLINE($D$23:$D$34,{"charttype","line";"linewidth",2;"color","#0ea5a0"}))');

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

    await runWithGoogleRetry('renderVisualDashboard.updateValues', () => sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Dashboard!A1:M45',
        valueInputOption: 'USER_ENTERED',
        resource: { values: grid }
    }));

    const sheetMap = await getSheetIds();
    const dashboardSheetId = sheetMap.Dashboard;
    if (dashboardSheetId === undefined) return;

    const requests = [
        // Título
        {
            repeatCell: {
                range: { sheetId: dashboardSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: { red: 0.07, green: 0.46, blue: 0.43 },
                        textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 14 }
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
        },
        // Cabeçalhos de blocos
        {
            repeatCell: {
                range: { sheetId: dashboardSheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 6 },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: { red: 0.88, green: 0.94, blue: 0.95 },
                        textFormat: { bold: true }
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
                        backgroundColor: { red: 0.95, green: 0.96, blue: 0.9 },
                        textFormat: { bold: true }
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
        // Congela cabeçalho e configura largura de colunas
        {
            updateSheetProperties: {
                properties: {
                    sheetId: dashboardSheetId,
                    gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 }
                },
                fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount'
            }
        },
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
        }
    ];

    await runWithGoogleRetry('renderVisualDashboard.formatting', () => sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: { requests }
    }));
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

async function getCalendarEventsForToday(targetDate = new Date()) {
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

        return response.data.items || [];
    } catch (error) {
        console.error('❌ Erro ao buscar eventos no Calendar:', error.message);
        return [];
    }
}

async function ensureSpreadsheetStructure() {
    console.log('--- Verificando Estrutura da Planilha ---');
    const structure = [
        { title: 'Saídas', headers: ['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Observações', 'user_id'], color: { red: 0.9, green: 0.4, blue: 0.4 } },
        { title: 'Entradas', headers: ['Data', 'Descrição', 'Categoria', 'Valor', 'Responsável', 'Recebimento', 'Recorrente', 'Observações', 'user_id'], color: { red: 0.4, green: 0.8, blue: 0.4 } },
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
        { title: 'UserProfile', headers: ['user_id', 'monthly_income', 'fixed_expense_estimate', 'has_debt', 'primary_goal', 'onboarding_completed_at'], color: { red: 0.3, green: 0.6, blue: 0.8 } },
        { title: 'UserSettings', headers: ['user_id', 'timezone', 'weekly_checkin_opt_in', 'monthly_report_opt_in', 'language', 'created_at', 'defaults_enabled', 'default_reserve_percent'], color: { red: 0.4, green: 0.6, blue: 0.7 } },
        { title: 'ConsentLog', headers: ['consent_id', 'user_id', 'whatsapp_id', 'accepted_at', 'terms_version', 'channel', 'evidence'], color: { red: 0.5, green: 0.5, blue: 0.8 } }
    ];

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
            
            // Cabeçalhos
            formattingRequests.push({
                updateCells: {
                    range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: item.headers.length },
                    rows: [{
                        values: item.headers.map(h => ({
                            userEnteredValue: { stringValue: h },
                            userEnteredFormat: {
                                backgroundColor: item.color,
                                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                                horizontalAlignment: 'CENTER'
                            }
                        }))
                    }],
                    fields: 'userEnteredValue,userEnteredFormat'
                }
            });

            // Congelamento de linha (exceto Dashboard)
            if (item.title !== 'Dashboard') {
                formattingRequests.push({
                    updateSheetProperties: {
                        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                        fields: 'gridProperties.frozenRowCount'
                    }
                });
            }
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

async function deleteRowsByIndices(sheetName, rowIndices) {
    try {
        const sheetMap = await getSheetIds();
        const sheetId = sheetMap[sheetName];
        if (sheetId === undefined) {
            return { success: false, message: `Aba "${sheetName}" não encontrada.` };
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

        await runWithGoogleRetry(`deleteRowsByIndices(${sheetName})`, () => sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
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
    getSheetIds,
    appendRowToSheet,
    readDataFromSheet,
    updateRowInSheet,
    batchUpdateRowsInSheet,
    syncDashboardForUser,
    renderVisualDashboard,
    deleteRowsByIndices,
    ensureSpreadsheetStructure,
    get sheets() { return sheets; }
};
