const { google } = require('googleapis');
const { getOAuthConnection, updateOAuthConnectionMetadata } = require('./oauthTokenStore');
const { updateUserStatus, USER_STATUS } = require('./userService');

const USER_SPREADSHEET_TABS = Object.freeze([
    {
        title: 'Dashboard',
        headers: ['Indicador', 'Valor', 'Observação', 'user_id', 'updated_at'],
        color: { red: 0.07, green: 0.45, blue: 0.42 },
        type: 'dashboard'
    },
    {
        title: 'Manual',
        headers: ['Seção', 'Orientação', 'Exemplo'],
        color: { red: 0.79, green: 0.54, blue: 0.22 },
        type: 'manual'
    },
    {
        title: 'Saídas',
        headers: ['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Observações', 'user_id'],
        color: { red: 0.74, green: 0.22, blue: 0.20 }
    },
    {
        title: 'Entradas',
        headers: ['Data', 'Descrição', 'Categoria', 'Valor', 'Responsável', 'Recebimento', 'Recorrente', 'Observações', 'user_id'],
        color: { red: 0.13, green: 0.55, blue: 0.36 }
    },
    {
        title: 'Transferências',
        headers: ['Data', 'Descrição', 'Valor', 'Conta Origem', 'Conta Destino', 'Método', 'Observações', 'Status', 'user_id'],
        color: { red: 0.28, green: 0.48, blue: 0.70 }
    },
    {
        title: 'Dívidas',
        headers: [
            'Nome da Dívida', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Valor da Parcela',
            'Taxa de Juros', 'Dia de Vencimento', 'Data de Início', 'Total de Parcelas', 'Parcelas Pagas',
            'Status', 'Observações', '% Quitado', 'Último Pagamento', 'Próximo Vencimento', 'Estratégia', 'user_id'
        ],
        color: { red: 0.69, green: 0.34, blue: 0.13 }
    },
    {
        title: 'Metas',
        headers: ['Nome da Meta', 'Valor Alvo', 'Valor Atual', '% Progresso', 'Valor Mensal Sugerido', 'Data Alvo', 'Status', 'Prioridade', 'user_id'],
        color: { red: 0.14, green: 0.43, blue: 0.67 }
    },
    {
        title: 'Cartões',
        headers: ['card_id', 'Nome', 'Banco', 'Dia de Fechamento', 'Dia de Vencimento', 'Ativo', 'Observações', 'user_id'],
        color: { red: 0.45, green: 0.27, blue: 0.68 }
    },
    {
        title: 'Lançamentos Cartão',
        headers: ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Observações', 'user_id'],
        color: { red: 0.45, green: 0.27, blue: 0.68 }
    },
    {
        title: 'Faturas',
        headers: ['Cartão', 'Mês de Cobrança', 'Total da Fatura', 'Parcelas Lançadas', 'Primeira Compra', 'Última Compra'],
        color: { red: 0.36, green: 0.20, blue: 0.55 },
        type: 'summary'
    },
    {
        title: 'Parcelamentos',
        headers: ['Descrição', 'Cartão', 'Categoria', 'Parcelas Lançadas', 'Total Previsto', 'Primeira Parcela', 'Última Parcela'],
        color: { red: 0.54, green: 0.31, blue: 0.64 },
        type: 'summary'
    },
    {
        title: 'Contas',
        headers: ['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id'],
        color: { red: 0.78, green: 0.54, blue: 0.17 }
    }
]);

const OBSOLETE_USER_SPREADSHEET_TABS = Object.freeze(['Importações', 'Configurações']);

const THEME = Object.freeze({
    paper: { red: 0.98, green: 0.96, blue: 0.91 },
    white: { red: 1, green: 1, blue: 1 },
    ink: { red: 0.12, green: 0.14, blue: 0.16 },
    muted: { red: 0.38, green: 0.38, blue: 0.35 },
    teal: { red: 0.07, green: 0.45, blue: 0.42 },
    tealSoft: { red: 0.88, green: 0.96, blue: 0.94 },
    amberSoft: { red: 0.99, green: 0.92, blue: 0.78 },
    line: { red: 0.85, green: 0.81, blue: 0.74 }
});

const FORMATTED_ROW_LIMIT = 1000;

function safeDisplayName(displayName = '') {
    return String(displayName || '')
        .trim()
        .replace(/[\\/?*\[\]:]/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 80) || 'Usuário';
}

function buildUserSpreadsheetResource({ displayName = '' } = {}) {
    return {
        properties: {
            title: `FinançasBot - ${safeDisplayName(displayName)}`
        },
        sheets: USER_SPREADSHEET_TABS.map((tab) => ({
            properties: {
                title: tab.title,
                gridProperties: {
                    frozenRowCount: 1
                }
            }
        }))
    };
}

function buildSpreadsheetUrl(spreadsheetId) {
    const safeSpreadsheetId = String(spreadsheetId || '').trim();
    return safeSpreadsheetId ? `https://docs.google.com/spreadsheets/d/${safeSpreadsheetId}/edit` : '';
}

function quoteSheetName(sheetName) {
    return `'${String(sheetName || '').replace(/'/g, "''")}'`;
}

function columnLetter(index) {
    let n = Number(index || 0) + 1;
    let result = '';
    while (n > 0) {
        const mod = (n - 1) % 26;
        result = String.fromCharCode(65 + mod) + result;
        n = Math.floor((n - mod) / 26);
    }
    return result;
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
        normalized.includes('parcela')
    ) {
        return { type: 'CURRENCY', pattern: '"R$"#,##0.00' };
    }
    if (normalized.includes('%') || normalized.includes('progresso')) {
        return { type: 'PERCENT', pattern: '0.00%' };
    }
    if (
        normalized.includes('dia de fechamento') ||
        normalized.includes('dia de vencimento') ||
        normalized.includes('total de parcelas') ||
        normalized.includes('parcelas pagas') ||
        normalized.includes('linhas detectadas') ||
        normalized.includes('linhas confirmadas')
    ) {
        return { type: 'NUMBER', pattern: '0' };
    }
    if (
        normalized === 'data' ||
        normalized.includes('data de inicio') ||
        normalized.includes('data alvo') ||
        normalized.includes('ultimo pagamento') ||
        normalized.includes('proximo vencimento') ||
        normalized.includes('data importacao')
    ) {
        return { type: 'DATE', pattern: 'dd/mm/yyyy' };
    }
    return null;
}

function buildDashboardRows({ user = {}, dataStartRow = 2 } = {}) {
    const displayName = safeDisplayName(user.display_name || 'Usuário');
    return [
        [`FinançasBot - Painel de ${displayName}`, '', '', '', ''],
        ['Atualiza conforme seus lançamentos entram pelas abas e pelo WhatsApp.', '', '', '', ''],
        ['', '', '', '', ''],
        ['Indicador', 'Valor', 'Observação', 'user_id', 'updated_at'],
        ['Entradas', `=SUM('Entradas'!D${dataStartRow}:D)`, 'Recebimentos registrados', user.user_id || '', '=NOW()'],
        ['Saídas', `=SUM('Saídas'!E${dataStartRow}:E)`, 'Gastos pagos fora do cartão', user.user_id || '', '=NOW()'],
        ['Cartões', `=SUM('Lançamentos Cartão'!D${dataStartRow}:D)`, 'Parcelas/faturas lançadas nos seus cartões', user.user_id || '', '=NOW()'],
        ['Saldo estimado', '=B5-B6-B7', 'Entradas menos saídas e cartões', user.user_id || '', '=NOW()'],
        ['', '', '', '', ''],
        ['Resumo para gráfico', 'Valor', '', '', ''],
        ['Entradas', '=B5', '', '', ''],
        ['Saídas', '=B6', '', '', ''],
        ['Cartões', '=B7', '', '', ''],
        ['Dívidas', `=SUM('Dívidas'!E${dataStartRow}:E)`, '', '', ''],
        ['Transferências internas', `=SUM('Transferências'!C${dataStartRow}:C)`, 'Movimentos entre suas próprias contas; não entram no saldo estimado.', user.user_id || '', '=NOW()'],
        ['Faturas por mês', "=COUNTA('Faturas'!A2:A)", 'Aba Faturas mostra totais por cartão e mês de cobrança.', user.user_id || '', '=NOW()'],
        ['Parcelamentos ativos', "=COUNTA('Parcelamentos'!A2:A)", 'Aba Parcelamentos mostra compras agrupadas, parcelas lançadas e total previsto.', user.user_id || '', '=NOW()'],
        ['', '', '', '', ''],
        ['Próximos passos', '1) Leia a aba Manual. 2) Cadastre seus cartões na aba Cartões. 3) Registre gastos pelo WhatsApp.', '', '', '']
    ];
}

function buildManualRows({ user = {} } = {}) {
    const displayName = safeDisplayName(user.display_name || 'Usuário');
    return [
        [`Manual completo do FinançasBot para ${displayName}`, 'Esta planilha é seu painel financeiro pessoal. Use o WhatsApp para registrar e esta planilha para acompanhar.', 'Comece enviando no WhatsApp: "gastei 25 no mercado no pix".'],
        ['Primeiros passos', '1) Leia este manual. 2) Cadastre seus cartões, se usar crédito. 3) Envie um gasto simples no WhatsApp. 4) Abra o Dashboard para conferir.', 'Depois teste: "recebi 2000 de salário".'],
        ['Comandos do WhatsApp', 'O bot entende gastos, entradas, perguntas, metas, dívidas, lembretes, exclusões e dashboard. Ele pede confirmação quando precisar.', 'gastei 80 de gasolina no débito; quanto gastei este mês?; dashboard'],
        ['Saídas', 'Aqui ficam gastos pagos por pix, débito, dinheiro, boleto ou qualquer pagamento que não seja cartão de crédito parcelado.', 'Campos principais: data, descrição, categoria, valor e forma de pagamento.'],
        ['Entradas', 'Aqui ficam seus recebimentos: salário, freela, reembolso, venda, presente ou qualquer dinheiro que entrou.', 'Campos principais: data, descrição, categoria, valor e forma de recebimento.'],
        ['Transferências', 'Aqui ficam movimentos entre suas próprias contas. Elas são úteis para conferência, mas não contam como gasto nem como renda.', 'Exemplo: Pix entre sua conta do banco e sua conta da corretora.'],
        ['Cartões', 'Cadastre apenas cartões que pertencem a este usuário. Esta lista define quais cartões o bot pode oferecer quando você registrar compras no crédito.', 'Exemplo: id nubank-principal, nome Nubank Principal, fechamento 8, vencimento 15, ativo SIM.'],
        ['Lançamentos Cartão', 'Aqui ficam compras no crédito, compras parceladas e parcelas futuras. O nome do cartão deve existir na aba Cartões.', 'Exemplo: compra de R$ 300 em 3x vira parcelas mensais.'],
        ['Faturas', 'Resumo automático das faturas por cartão e mês de cobrança. Use para ver quanto cada cartão tem previsto em cada mês.', 'Não edite as fórmulas; confira os detalhes em Lançamentos Cartão.'],
        ['Parcelamentos', 'Resumo automático das compras parceladas, agrupando parcelas por descrição, cartão e categoria.', 'Use para ver total previsto, quantidade de parcelas lançadas e primeira/última parcela.'],
        ['Dívidas', 'Use para empréstimos, financiamentos, acordos, parcelas em aberto e qualquer valor que você quer acompanhar até quitar.', 'Campos úteis: valor original, saldo atual, parcela, juros, vencimento, parcelas pagas e status.'],
        ['Metas', 'Use para objetivos como reserva de emergência, viagem, quitar dívida, entrada de imóvel ou compra planejada.', 'Acompanhe valor alvo, valor atual, progresso, sugestão mensal e prioridade.'],
        ['Contas', 'Use para despesas recorrentes e vencimentos que não podem ser esquecidos.', 'Exemplo: aluguel dia 10, internet dia 15, escola dia 5.'],
        ['Dashboard', 'Mostra um resumo visual da planilha: entradas, saídas, cartões, saldo estimado, dívidas e gráfico. As fórmulas desta aba são automáticas.', 'Use para conferir se o mês está saudável. Evite editar fórmulas.'],
        ['Dashboard web', 'No WhatsApp, envie "dashboard" para receber um link seguro com gráficos no navegador.', 'Não compartilhe esse link com outras pessoas.'],
        ['Perguntas que o bot responde', 'Você pode perguntar totais, saldos, categorias, listas e maiores/menores gastos em linguagem natural.', 'qual meu saldo do mês?; quanto gastei com mercado?; liste gastos com transporte'],
        ['Metas pelo bot', 'Envie "criar meta" para o bot guiar o cadastro de um objetivo financeiro.', 'criar meta; quero juntar 5000 para reserva'],
        ['Dívidas pelo bot', 'Envie "criar dívida" ou registre pagamento de dívida para manter o saldo atualizado.', 'criar dívida; paguei 300 da parcela do carro'],
        ['Lembretes', 'O bot pode criar lembretes no Google Calendar quando você pedir uma data e horário.', 'me lembre de pagar o aluguel amanhã às 10h'],
        ['Correções', 'Se lançar algo errado, peça ajuda pelo WhatsApp. Para apagar algo recente, use o fluxo de exclusão.', 'apagar último gasto; ajuda'],
        ['Boas práticas', 'Escreva valor, descrição e forma de pagamento. Quanto mais clara a mensagem, melhor o registro.', 'Melhor: "gastei 42,50 no mercado no pix" em vez de "42".'],
        ['Privacidade', 'Esta planilha fica no Drive da conta Google autorizada por você. Não compartilhe links de planilha ou dashboard com quem não deve ver seus dados.', 'Se perder acesso ou notar algo estranho, fale com o responsável pelo bot.'],
        ['Resumo', 'WhatsApp registra. A planilha organiza. O Dashboard mostra. O manual orienta. Se tiver dúvida, envie "ajuda" no WhatsApp.', 'Você não precisa mexer em fórmulas para usar o bot.']
    ];
}

function buildInvoiceSummaryRows({ dataStartRow = 2 } = {}) {
    const headerCount = dataStartRow > 2 ? 0 : 1;
    return [[
        `=QUERY('Lançamentos Cartão'!A${dataStartRow}:J,"select H, F, sum(D), count(D), min(A), max(A) where H is not null group by H, F label H 'Cartão', F 'Mês de Cobrança', sum(D) 'Total da Fatura', count(D) 'Parcelas Lançadas', min(A) 'Primeira Compra', max(A) 'Última Compra'",${headerCount})`,
        '',
        '',
        '',
        '',
        ''
    ]];
}

function buildInstallmentSummaryRows({ dataStartRow = 2 } = {}) {
    const headerCount = dataStartRow > 2 ? 0 : 1;
    return [[
        `=QUERY('Lançamentos Cartão'!A${dataStartRow}:J,"select B, H, C, count(D), sum(D), min(A), max(A) where B is not null group by B, H, C label B 'Descrição', H 'Cartão', C 'Categoria', count(D) 'Parcelas Lançadas', sum(D) 'Total Previsto', min(A) 'Primeira Parcela', max(A) 'Última Parcela'",${headerCount})`,
        '',
        '',
        '',
        '',
        '',
        ''
    ]];
}

const USER_INPUT_EXAMPLE_ROWS = Object.freeze({
    'Saídas': ['01/01/2026', 'Exemplo: mercado', 'Alimentação', 'Supermercado', '25,00', 'Seu nome', 'PIX', 'Não', 'Exemplo de gasto; pode apagar esta linha.', ''],
    'Entradas': ['01/01/2026', 'Exemplo: salário', 'Salário', '3000,00', 'Seu nome', 'Conta Corrente', 'Sim', 'Exemplo de entrada; pode apagar esta linha.', ''],
    'Transferências': ['01/01/2026', 'Exemplo: pix para reserva', '500,00', 'Conta corrente', 'Poupança', 'PIX', 'Transferência entre suas contas; não é gasto.', 'Conferida', ''],
    'Dívidas': ['Exemplo: financiamento', 'Banco Exemplo', 'Financiamento', '10000,00', '8500,00', '500,00', '1,5% a.m.', '10', '01/01/2026', '24', '3', 'Em dia', 'Exemplo de dívida; pode apagar.', '', '', '', 'Avalanche', ''],
    'Metas': ['Exemplo: reserva de emergência', '10000,00', '1500,00', '', '', '31/12/2026', 'Em andamento', 'Alta', ''],
    'Cartões': ['nubank-principal', 'Nubank Principal', 'Nubank', '8', '15', 'SIM', 'Exemplo de cartão; edite ou apague.', ''],
    'Lançamentos Cartão': ['01/01/2026', 'Exemplo: compra parcelada', 'Casa', '100,00', '1/3', 'Janeiro de 2026', 'nubank-principal', 'Nubank Principal', 'Exemplo gerado para orientar; pode apagar.', ''],
    'Contas': ['Exemplo: internet', '15', 'Conta recorrente que vence todo mês.', '']
});

function buildInputExampleRanges() {
    return Object.entries(USER_INPUT_EXAMPLE_ROWS).map(([title, values]) => ({
        range: `${quoteSheetName(title)}!A2:${columnLetter(values.length - 1)}2`,
        values: [values]
    }));
}

function buildStarterValueRanges({ user = {}, includeInputExamples = false } = {}) {
    const dataStartRow = includeInputExamples ? 3 : 2;
    const ranges = [
        {
            range: `${quoteSheetName('Dashboard')}!A1:E19`,
            values: buildDashboardRows({ user, dataStartRow })
        },
        {
            range: `${quoteSheetName('Manual')}!A1:C23`,
            values: buildManualRows({ user })
        },
        {
            range: `${quoteSheetName('Faturas')}!A1:F1`,
            values: buildInvoiceSummaryRows({ dataStartRow })
        },
        {
            range: `${quoteSheetName('Parcelamentos')}!A1:G1`,
            values: buildInstallmentSummaryRows({ dataStartRow })
        }
    ];
    if (includeInputExamples) {
        ranges.push(...buildInputExampleRanges());
    }
    return ranges;
}

function getSheetsClient(auth) {
    return google.sheets({ version: 'v4', auth });
}

async function writeHeaders({ sheetsClient, spreadsheetId }) {
    for (const tab of USER_SPREADSHEET_TABS) {
        const lastColumn = columnLetter(tab.headers.length - 1);
        await sheetsClient.spreadsheets.values.update({
            spreadsheetId,
            range: `${quoteSheetName(tab.title)}!A1:${lastColumn}1`,
            valueInputOption: 'RAW',
            resource: {
                values: [tab.headers]
            }
        });
    }
}

async function writeStarterContent({ sheetsClient, spreadsheetId, user, includeInputExamples = false }) {
    if (!sheetsClient?.spreadsheets?.values?.batchUpdate) return;
    await sheetsClient.spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource: {
            valueInputOption: 'USER_ENTERED',
            data: buildStarterValueRanges({ user, includeInputExamples })
        }
    });
}

function getSheetMapFromSpreadsheet(spreadsheet = {}) {
    const map = {};
    const sheets = spreadsheet?.sheets || spreadsheet?.data?.sheets || [];
    sheets.forEach((sheet) => {
        const title = sheet?.properties?.title;
        const sheetId = sheet?.properties?.sheetId;
        if (title && sheetId !== undefined) map[title] = sheetId;
    });
    return map;
}

function getDashboardChartDeleteRequests(spreadsheet = {}, dashboardSheetId) {
    if (dashboardSheetId === undefined) return [];
    const sheets = spreadsheet?.sheets || spreadsheet?.data?.sheets || [];
    const dashboardSheet = sheets.find(sheet => sheet?.properties?.sheetId === dashboardSheetId);
    const charts = dashboardSheet?.charts || [];
    return charts
        .filter(chart => chart?.chartId !== undefined)
        .map(chart => ({ deleteEmbeddedObject: { objectId: chart.chartId } }));
}

async function loadSpreadsheetMetadata({ sheetsClient, spreadsheetId }) {
    if (!sheetsClient?.spreadsheets?.get) return { data: { sheets: [] } };
    return sheetsClient.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets(properties(sheetId,title),charts(chartId,position))'
    });
}

async function ensureUserSpreadsheetTabs({ sheetsClient, spreadsheetId, spreadsheet }) {
    const existingSheets = spreadsheet?.data?.sheets || spreadsheet?.sheets || [];
    const existingTitles = new Set(existingSheets.map(sheet => sheet?.properties?.title).filter(Boolean));
    const missingTabs = USER_SPREADSHEET_TABS.filter(tab => !existingTitles.has(tab.title));
    const obsoleteDeletes = existingSheets
        .filter(sheet => OBSOLETE_USER_SPREADSHEET_TABS.includes(sheet?.properties?.title) && sheet?.properties?.sheetId !== undefined)
        .map(sheet => ({ deleteSheet: { sheetId: sheet.properties.sheetId } }));

    if ((!missingTabs.length && !obsoleteDeletes.length) || !sheetsClient?.spreadsheets?.batchUpdate) return spreadsheet;

    await sheetsClient.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
            requests: [
                ...obsoleteDeletes,
                ...missingTabs.map(tab => ({
                    addSheet: {
                        properties: {
                            title: tab.title,
                            gridProperties: { frozenRowCount: tab.type === 'dashboard' ? 4 : 1 }
                        }
                    }
                }))
            ]
        }
    });

    return loadSpreadsheetMetadata({ sheetsClient, spreadsheetId });
}

function textStyle({ bold = false, size = 10, color = THEME.ink } = {}) {
    return {
        bold,
        fontSize: size,
        foregroundColor: color
    };
}

function buildHeaderCell(header, tabTitle) {
    const notes = {
        Cartões: {
            card_id: 'Identificador curto do seu cartão. Ex.: nubank-principal. Use este mesmo valor em Lançamentos Cartão.',
            Nome: 'Nome amigável do cartão do usuário. Esta lista é individual, não copie cartões de outros usuários.',
            'Dia de Fechamento': 'Dia em que a fatura fecha.',
            'Dia de Vencimento': 'Dia em que a fatura vence.'
        }
    };

    return {
        userEnteredValue: { stringValue: header },
        note: notes[tabTitle]?.[header],
        userEnteredFormat: {
            backgroundColor: USER_SPREADSHEET_TABS.find(tab => tab.title === tabTitle)?.color || THEME.teal,
            textFormat: textStyle({ bold: true, size: 10, color: THEME.white }),
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP'
        }
    };
}

function buildUserSpreadsheetFormattingRequests(sheetMap = {}, spreadsheet = {}) {
    const requests = [];

    for (const tab of USER_SPREADSHEET_TABS) {
        const sheetId = sheetMap[tab.title];
        if (sheetId === undefined) continue;
        const isDashboard = tab.type === 'dashboard';
        const isManual = tab.type === 'manual';
        const isSummary = tab.type === 'summary';

        requests.push({
            updateSheetProperties: {
                properties: {
                    sheetId,
                    tabColor: tab.color,
                    gridProperties: { frozenRowCount: isDashboard ? 4 : 1 }
                },
                fields: 'tabColor,gridProperties.frozenRowCount'
            }
        });

        if (!isDashboard && !isManual && !isSummary) {
            requests.push({
                updateCells: {
                    range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: tab.headers.length },
                    rows: [{ values: tab.headers.map(header => buildHeaderCell(header, tab.title)) }],
                    fields: 'userEnteredValue,userEnteredFormat,note'
                }
            });
        }

        if (isSummary) {
            requests.push({
                repeatCell: {
                    range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: tab.headers.length },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: tab.color,
                            textFormat: textStyle({ bold: true, size: 10, color: THEME.white }),
                            horizontalAlignment: 'CENTER',
                            verticalAlignment: 'MIDDLE',
                            wrapStrategy: 'WRAP'
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)'
                }
            });
        }

        requests.push({
            repeatCell: {
                range: { sheetId, startRowIndex: 1, endRowIndex: FORMATTED_ROW_LIMIT, startColumnIndex: 0, endColumnIndex: tab.headers.length },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: THEME.paper,
                        verticalAlignment: 'MIDDLE',
                        wrapStrategy: 'WRAP',
                        textFormat: textStyle({ size: 10 })
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,verticalAlignment,wrapStrategy,textFormat)'
            }
        });

        requests.push({
            updateDimensionProperties: {
                range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
                properties: { pixelSize: isDashboard ? 48 : 36 },
                fields: 'pixelSize'
            }
        });

        requests.push({
            autoResizeDimensions: {
                dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: tab.headers.length }
            }
        });

        tab.headers.forEach((header, index) => {
            const numberFormat = headerToNumberFormat(header);
            if (numberFormat) {
                requests.push({
                    repeatCell: {
                        range: { sheetId, startRowIndex: 1, endRowIndex: FORMATTED_ROW_LIMIT, startColumnIndex: index, endColumnIndex: index + 1 },
                        cell: { userEnteredFormat: { numberFormat } },
                        fields: 'userEnteredFormat.numberFormat'
                    }
                });
            }

            if (['user_id', 'updated_at', 'import_id'].includes(header)) {
                requests.push({
                    updateDimensionProperties: {
                        range: { sheetId, dimension: 'COLUMNS', startIndex: index, endIndex: index + 1 },
                        properties: { hiddenByUser: true },
                        fields: 'hiddenByUser'
                    }
                });
            }
        });

        if (!isDashboard && !isManual) {
            requests.push({ clearBasicFilter: { sheetId } });
            requests.push({
                setBasicFilter: {
                    filter: {
                        range: { sheetId, startRowIndex: 0, endRowIndex: FORMATTED_ROW_LIMIT, startColumnIndex: 0, endColumnIndex: tab.headers.length }
                    }
                }
            });
        }
    }

    const dashboardSheetId = sheetMap.Dashboard;
    if (dashboardSheetId !== undefined) {
        requests.push(
            ...getDashboardChartDeleteRequests(spreadsheet, dashboardSheetId),
            {
                unmergeCells: {
                    range: { sheetId: dashboardSheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 5 }
                }
            },
            {
                mergeCells: {
                    range: { sheetId: dashboardSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
                    mergeType: 'MERGE_ALL'
                }
            },
            {
                mergeCells: {
                    range: { sheetId: dashboardSheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 5 },
                    mergeType: 'MERGE_ALL'
                }
            },
            {
                repeatCell: {
                    range: { sheetId: dashboardSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: THEME.teal,
                            textFormat: textStyle({ bold: true, size: 16, color: THEME.white }),
                            horizontalAlignment: 'LEFT',
                            verticalAlignment: 'MIDDLE'
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
                }
            },
            {
                repeatCell: {
                    range: { sheetId: dashboardSheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 5 },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: THEME.tealSoft,
                            textFormat: textStyle({ size: 10, color: THEME.muted }),
                            wrapStrategy: 'WRAP'
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat,wrapStrategy)'
                }
            },
            {
                repeatCell: {
                    range: { sheetId: dashboardSheetId, startRowIndex: 9, endRowIndex: 14, startColumnIndex: 0, endColumnIndex: 2 },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: THEME.white,
                            borders: {
                                top: { style: 'SOLID', color: THEME.line },
                                bottom: { style: 'SOLID', color: THEME.line }
                            }
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,borders)'
                }
            },
            {
                repeatCell: {
                    range: { sheetId: dashboardSheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 5 },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: THEME.teal,
                            textFormat: textStyle({ bold: true, size: 10, color: THEME.white }),
                            horizontalAlignment: 'CENTER',
                            verticalAlignment: 'MIDDLE',
                            wrapStrategy: 'WRAP'
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)'
                }
            },
            {
                updateDimensionProperties: {
                    range: { sheetId: dashboardSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
                    properties: { pixelSize: 170 },
                    fields: 'pixelSize'
                }
            },
            {
                updateDimensionProperties: {
                    range: { sheetId: dashboardSheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 5 },
                    properties: { pixelSize: 150 },
                    fields: 'pixelSize'
                }
            }
        );

        requests.push({
            addChart: {
                chart: {
                    spec: {
                        title: 'Distribuição financeira',
                        basicChart: {
                            chartType: 'COLUMN',
                            legendPosition: 'BOTTOM_LEGEND',
                            axis: [
                                { position: 'BOTTOM_AXIS', title: 'Indicador' },
                                { position: 'LEFT_AXIS', title: 'Valor (R$)' }
                            ],
                            domains: [{
                                domain: {
                                    sourceRange: {
                                        sources: [{
                                            sheetId: dashboardSheetId,
                                            startRowIndex: 10,
                                            endRowIndex: 14,
                                            startColumnIndex: 0,
                                            endColumnIndex: 1
                                        }]
                                    }
                                }
                            }],
                            series: [{
                                series: {
                                    sourceRange: {
                                        sources: [{
                                            sheetId: dashboardSheetId,
                                            startRowIndex: 10,
                                            endRowIndex: 14,
                                            startColumnIndex: 1,
                                            endColumnIndex: 2
                                        }]
                                    }
                                },
                                targetAxis: 'LEFT_AXIS'
                            }],
                            headerCount: 0
                        }
                    },
                    position: {
                        overlayPosition: {
                            anchorCell: { sheetId: dashboardSheetId, rowIndex: 3, columnIndex: 5 },
                            offsetXPixels: 12,
                            offsetYPixels: 0,
                            widthPixels: 520,
                            heightPixels: 300
                        }
                    }
                }
            }
        });
    }

    const manualSheetId = sheetMap.Manual;
    if (manualSheetId !== undefined) {
        requests.push(
            {
                repeatCell: {
                    range: { sheetId: manualSheetId, startRowIndex: 0, endRowIndex: 23, startColumnIndex: 0, endColumnIndex: 3 },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: THEME.amberSoft,
                            textFormat: textStyle({ size: 10, color: THEME.ink }),
                            wrapStrategy: 'WRAP'
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat,wrapStrategy)'
                }
            },
            {
                updateDimensionProperties: {
                    range: { sheetId: manualSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
                    properties: { pixelSize: 150 },
                    fields: 'pixelSize'
                }
            },
            {
                updateDimensionProperties: {
                    range: { sheetId: manualSheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 3 },
                    properties: { pixelSize: 360 },
                    fields: 'pixelSize'
                }
            }
        );
    }

    return requests;
}

async function formatUserSpreadsheet({ sheetsClient, spreadsheetId, spreadsheet }) {
    if (!sheetsClient?.spreadsheets?.batchUpdate) return;
    const sheetMap = getSheetMapFromSpreadsheet(spreadsheet);
    const requests = buildUserSpreadsheetFormattingRequests(sheetMap, spreadsheet);
    if (!requests.length) return;
    await sheetsClient.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: { requests }
    });
}

async function applyUserSpreadsheetTemplate({ user, oauth2Client, sheetsClient, spreadsheetId, spreadsheet, includeInputExamples = false }) {
    const safeUser = user || {};
    const safeSpreadsheetId = String(spreadsheetId || '').trim();
    if (!safeSpreadsheetId) throw new Error('spreadsheetId é obrigatório para aplicar template da planilha do usuário.');
    const client = sheetsClient || getSheetsClient(oauth2Client);

    let spreadsheetMetadata = spreadsheet || await loadSpreadsheetMetadata({ sheetsClient: client, spreadsheetId: safeSpreadsheetId });
    spreadsheetMetadata = await ensureUserSpreadsheetTabs({ sheetsClient: client, spreadsheetId: safeSpreadsheetId, spreadsheet: spreadsheetMetadata });

    await writeHeaders({ sheetsClient: client, spreadsheetId: safeSpreadsheetId });
    await writeStarterContent({ sheetsClient: client, spreadsheetId: safeSpreadsheetId, user: safeUser, includeInputExamples });
    await formatUserSpreadsheet({ sheetsClient: client, spreadsheetId: safeSpreadsheetId, spreadsheet: spreadsheetMetadata });

    return { spreadsheetId: safeSpreadsheetId };
}

async function createUserSpreadsheetForUser({ user, oauth2Client, sheetsClient }) {
    const safeUser = user || {};
    const client = sheetsClient || getSheetsClient(oauth2Client);
    const resource = buildUserSpreadsheetResource({ displayName: safeUser.display_name });
    const created = await client.spreadsheets.create({
        resource,
        fields: 'spreadsheetId,spreadsheetUrl,sheets(properties(sheetId,title))'
    });
    const spreadsheetId = created?.data?.spreadsheetId;
    if (!spreadsheetId) {
        throw new Error('Google não retornou spreadsheetId ao criar planilha do usuário.');
    }
    await applyUserSpreadsheetTemplate({
        user: safeUser,
        sheetsClient: client,
        spreadsheetId,
        spreadsheet: created?.data,
        includeInputExamples: true
    });
    return {
        spreadsheetId,
        spreadsheetUrl: created?.data?.spreadsheetUrl || ''
    };
}

async function completeGoogleConnectionForUser({ user, oauth2Client, sheetsClient }) {
    const safeUser = user || {};
    if (!safeUser.user_id) throw new Error('user_id é obrigatório para concluir conexão Google.');

    const existingConnection = getOAuthConnection(safeUser.user_id);
    if (!existingConnection) {
        throw new Error('Conexão OAuth não encontrada para o usuário.');
    }

    let spreadsheetId = existingConnection.spreadsheet_id || '';
    let spreadsheetUrl = '';
    if (!spreadsheetId) {
        const created = await createUserSpreadsheetForUser({ user: safeUser, oauth2Client, sheetsClient });
        spreadsheetId = created.spreadsheetId;
        spreadsheetUrl = created.spreadsheetUrl || buildSpreadsheetUrl(spreadsheetId);
        await updateOAuthConnectionMetadata(safeUser.user_id, { spreadsheetId });
    } else {
        await applyUserSpreadsheetTemplate({ user: safeUser, oauth2Client, sheetsClient, spreadsheetId });
        spreadsheetUrl = buildSpreadsheetUrl(spreadsheetId);
    }

    const updatedUser = await updateUserStatus(safeUser.user_id, USER_STATUS.ACTIVE);
    return {
        user: updatedUser,
        spreadsheetId,
        spreadsheetUrl
    };
}

module.exports = {
    USER_SPREADSHEET_TABS,
    OBSOLETE_USER_SPREADSHEET_TABS,
    buildUserSpreadsheetResource,
    createUserSpreadsheetForUser,
    applyUserSpreadsheetTemplate,
    completeGoogleConnectionForUser,
    buildSpreadsheetUrl,
    quoteSheetName,
    __test__: {
        columnLetter,
        safeDisplayName,
        writeHeaders,
        buildDashboardRows,
        buildManualRows,
        buildInvoiceSummaryRows,
        buildInstallmentSummaryRows,
        buildInputExampleRanges,
        USER_INPUT_EXAMPLE_ROWS,
        buildStarterValueRanges,
        buildUserSpreadsheetFormattingRequests,
        getSheetMapFromSpreadsheet,
        getDashboardChartDeleteRequests,
        headerToNumberFormat
    }
};
