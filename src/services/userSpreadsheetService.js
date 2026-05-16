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
        title: 'Contas',
        headers: ['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id'],
        color: { red: 0.78, green: 0.54, blue: 0.17 }
    },
    {
        title: 'Importações',
        headers: ['import_id', 'Data Importação', 'Tipo', 'Arquivo', 'Status', 'Linhas Detectadas', 'Linhas Confirmadas', 'Hash', 'user_id'],
        color: { red: 0.35, green: 0.42, blue: 0.53 }
    },
    {
        title: 'Configurações',
        headers: ['Chave', 'Valor', 'Observações', 'user_id'],
        color: { red: 0.21, green: 0.27, blue: 0.34 }
    }
]);

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

function buildDashboardRows({ user = {} } = {}) {
    const displayName = safeDisplayName(user.display_name || 'Usuário');
    return [
        [`FinançasBot - Painel de ${displayName}`, '', '', '', ''],
        ['Atualiza conforme seus lançamentos entram pelas abas e pelo WhatsApp.', '', '', '', ''],
        ['', '', '', '', ''],
        ['Indicador', 'Valor', 'Observação', 'user_id', 'updated_at'],
        ['Entradas', "=SUM('Entradas'!D2:D)", 'Recebimentos registrados', user.user_id || '', '=NOW()'],
        ['Saídas', "=SUM('Saídas'!E2:E)", 'Gastos pagos fora do cartão', user.user_id || '', '=NOW()'],
        ['Cartões', "=SUM('Lançamentos Cartão'!D2:D)", 'Parcelas/faturas lançadas nos seus cartões', user.user_id || '', '=NOW()'],
        ['Saldo estimado', '=B5-B6-B7', 'Entradas menos saídas e cartões', user.user_id || '', '=NOW()'],
        ['', '', '', '', ''],
        ['Resumo para gráfico', 'Valor', '', '', ''],
        ['Entradas', '=B5', '', '', ''],
        ['Saídas', '=B6', '', '', ''],
        ['Cartões', '=B7', '', '', ''],
        ['Dívidas', "=SUM('Dívidas'!E2:E)", '', '', ''],
        ['', '', '', '', ''],
        ['Próximos passos', '1) Leia a aba Manual. 2) Cadastre seus cartões na aba Cartões. 3) Registre gastos pelo WhatsApp.', '', '', '']
    ];
}

function buildManualRows({ user = {} } = {}) {
    const displayName = safeDisplayName(user.display_name || 'Usuário');
    return [
        [`Manual rápido do FinançasBot para ${displayName}`, 'Use esta aba como mapa da sua planilha pessoal.', 'Comece pelo WhatsApp: "gastei 25 no mercado no pix"'],
        ['Dashboard', 'Visão executiva com totais, saldo estimado e gráfico. Não edite as fórmulas desta aba.', 'Abra esta aba para se orientar.'],
        ['Saídas', 'Gastos pagos fora do cartão: pix, débito, dinheiro, boleto e similares.', 'Data, descrição, categoria, valor e forma de pagamento.'],
        ['Entradas', 'Recebimentos como salário, freela, reembolso ou presente.', 'Data, origem, categoria, valor e conta de recebimento.'],
        ['Dívidas', 'Controle de empréstimos, financiamentos e parcelas em aberto.', 'Informe saldo atual, parcela, juros e vencimento.'],
        ['Metas', 'Objetivos financeiros como reserva, viagem ou compra planejada.', 'Valor alvo, valor atual, data alvo e prioridade.'],
        ['Cartões', 'Cadastre apenas os seus cartões. Cada usuário tem a própria lista de cartões.', 'Ex.: nubank-principal, Nubank, fechamento 8, vencimento 15.'],
        ['Lançamentos Cartão', 'Gastos parcelados e compras no crédito vinculados ao card_id da aba Cartões.', 'O bot usa esta aba para organizar parcelas futuras.'],
        ['Contas', 'Contas recorrentes e vencimentos importantes.', 'Aluguel dia 10, internet dia 15.'],
        ['Importações', 'Área técnica para CSV/OFX quando o importador estiver em uso.', 'Não edite hashes/status se não souber o motivo.'],
        ['Configurações', 'Preferências simples da sua planilha e do bot.', 'A chave cartoes_do_usuario explica o cadastro de cartões.'],
        ['Como falar com o bot', 'Use frases naturais. O bot pergunta confirmação quando precisar.', 'recebi 2000 de salário; paguei 80 de luz no pix.'],
        ['Dashboard web', 'No WhatsApp, envie "dashboard" para receber um link seguro com gráficos.', 'Não compartilhe o link.'],
        ['Privacidade', 'Esta planilha pertence ao usuário conectado no OAuth. Administradores não devem usar isso como acesso amplo aos dados.', 'Você controla a conta Google autorizada.'],
        ['Quando algo parecer errado', 'Responda no WhatsApp com detalhes ou peça ajuda ao administrador.', 'Ex.: "apagar último gasto" ou "ajuda".'],
        ['Resumo', 'WhatsApp registra, planilha organiza, Dashboard mostra o panorama.', 'Comece com um gasto pequeno para validar.']
    ];
}

function buildConfigurationRows({ user = {} } = {}) {
    return [
        ['cartoes_do_usuario', 'true', 'Cadastre na aba Cartões somente cartões deste usuário. Não use cartões de Daniel/Thaís de outra planilha.', user.user_id || ''],
        ['manual_version', '2026-05-16', 'Versão inicial do manual e identidade visual da planilha do usuário.', user.user_id || ''],
        ['dashboard_formula_mode', 'local_sheet', 'O dashboard desta planilha usa fórmulas locais e gráfico nativo do Google Sheets.', user.user_id || '']
    ];
}

function buildStarterValueRanges({ user = {} } = {}) {
    return [
        {
            range: `${quoteSheetName('Dashboard')}!A1:E16`,
            values: buildDashboardRows({ user })
        },
        {
            range: `${quoteSheetName('Manual')}!A1:C16`,
            values: buildManualRows({ user })
        },
        {
            range: `${quoteSheetName('Configurações')}!A2:D4`,
            values: buildConfigurationRows({ user })
        }
    ];
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

async function writeStarterContent({ sheetsClient, spreadsheetId, user }) {
    if (!sheetsClient?.spreadsheets?.values?.batchUpdate) return;
    await sheetsClient.spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource: {
            valueInputOption: 'USER_ENTERED',
            data: buildStarterValueRanges({ user })
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

async function getCreatedSheetMap({ sheetsClient, spreadsheetId, createdSpreadsheet }) {
    const fromCreate = getSheetMapFromSpreadsheet(createdSpreadsheet);
    if (Object.keys(fromCreate).length > 0) return fromCreate;
    if (!sheetsClient?.spreadsheets?.get) return {};
    const loaded = await sheetsClient.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets(properties(sheetId,title))'
    });
    return getSheetMapFromSpreadsheet(loaded);
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

function buildUserSpreadsheetFormattingRequests(sheetMap = {}) {
    const requests = [];

    for (const tab of USER_SPREADSHEET_TABS) {
        const sheetId = sheetMap[tab.title];
        if (sheetId === undefined) continue;
        const isDashboard = tab.type === 'dashboard';
        const isManual = tab.type === 'manual';

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

        if (!isDashboard && !isManual) {
            requests.push({
                updateCells: {
                    range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: tab.headers.length },
                    rows: [{ values: tab.headers.map(header => buildHeaderCell(header, tab.title)) }],
                    fields: 'userEnteredValue,userEnteredFormat,note'
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
                    range: { sheetId: manualSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 3 },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: THEME.amberSoft,
                            textFormat: textStyle({ bold: true, size: 12, color: THEME.ink }),
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

async function formatUserSpreadsheet({ sheetsClient, spreadsheetId, createdSpreadsheet }) {
    if (!sheetsClient?.spreadsheets?.batchUpdate) return;
    const sheetMap = await getCreatedSheetMap({ sheetsClient, spreadsheetId, createdSpreadsheet });
    const requests = buildUserSpreadsheetFormattingRequests(sheetMap);
    if (!requests.length) return;
    await sheetsClient.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: { requests }
    });
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
    await writeHeaders({ sheetsClient: client, spreadsheetId });
    await writeStarterContent({ sheetsClient: client, spreadsheetId, user: safeUser });
    await formatUserSpreadsheet({ sheetsClient: client, spreadsheetId, createdSpreadsheet: created?.data });
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
        spreadsheetUrl = created.spreadsheetUrl;
        await updateOAuthConnectionMetadata(safeUser.user_id, { spreadsheetId });
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
    buildUserSpreadsheetResource,
    createUserSpreadsheetForUser,
    completeGoogleConnectionForUser,
    quoteSheetName,
    __test__: {
        columnLetter,
        safeDisplayName,
        writeHeaders,
        buildDashboardRows,
        buildManualRows,
        buildStarterValueRanges,
        buildUserSpreadsheetFormattingRequests,
        headerToNumberFormat
    }
};
