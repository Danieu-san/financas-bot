const { google } = require('googleapis');
const { getOAuthConnection, updateOAuthConnectionMetadata } = require('./oauthTokenStore');
const { updateUserStatus, USER_STATUS } = require('./userService');

const USER_SPREADSHEET_TABS = Object.freeze([
    {
        title: 'Dashboard',
        headers: ['Métrica', 'Valor', 'Período', 'user_id', 'updated_at']
    },
    {
        title: 'Saídas',
        headers: ['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Observações', 'user_id']
    },
    {
        title: 'Entradas',
        headers: ['Data', 'Descrição', 'Categoria', 'Valor', 'Responsável', 'Recebimento', 'Recorrente', 'Observações', 'user_id']
    },
    {
        title: 'Dívidas',
        headers: [
            'Nome da Dívida', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Valor da Parcela',
            'Taxa de Juros', 'Dia de Vencimento', 'Data de Início', 'Total de Parcelas', 'Parcelas Pagas',
            'Status', 'Observações', '% Quitado', 'Último Pagamento', 'Próximo Vencimento', 'Estratégia', 'user_id'
        ]
    },
    {
        title: 'Metas',
        headers: ['Nome da Meta', 'Valor Alvo', 'Valor Atual', '% Progresso', 'Valor Mensal Sugerido', 'Data Alvo', 'Status', 'Prioridade', 'user_id']
    },
    {
        title: 'Cartões',
        headers: ['card_id', 'Nome', 'Banco', 'Dia de Fechamento', 'Dia de Vencimento', 'Ativo', 'Observações', 'user_id']
    },
    {
        title: 'Lançamentos Cartão',
        headers: ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Observações', 'user_id']
    },
    {
        title: 'Contas',
        headers: ['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id']
    },
    {
        title: 'Importações',
        headers: ['import_id', 'Data Importação', 'Tipo', 'Arquivo', 'Status', 'Linhas Detectadas', 'Linhas Confirmadas', 'Hash', 'user_id']
    },
    {
        title: 'Configurações',
        headers: ['Chave', 'Valor', 'Observações', 'user_id']
    }
]);

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

async function createUserSpreadsheetForUser({ user, oauth2Client, sheetsClient }) {
    const safeUser = user || {};
    const client = sheetsClient || getSheetsClient(oauth2Client);
    const resource = buildUserSpreadsheetResource({ displayName: safeUser.display_name });
    const created = await client.spreadsheets.create({
        resource,
        fields: 'spreadsheetId,spreadsheetUrl'
    });
    const spreadsheetId = created?.data?.spreadsheetId;
    if (!spreadsheetId) {
        throw new Error('Google não retornou spreadsheetId ao criar planilha do usuário.');
    }
    await writeHeaders({ sheetsClient: client, spreadsheetId });
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
        writeHeaders
    }
};
