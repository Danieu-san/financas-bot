// src/services/sheets.js

const { google } = require('googleapis');
const path = require('path'); // Importa o módulo 'path' do Node.js

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// VERSÃO MAIS ROBUSTA E CORRIGIDA:
// Usa o módulo 'path' para construir o caminho absoluto para o credentials.json na raiz do projeto.
// Isso evita erros de caminho relativo como '../..'.
const GOOGLE_CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || path.resolve(process.cwd(), 'credentials.json');

let sheets; // Instância da API do Sheets, inicializada uma vez
const sheetNameToId = {}; // Cache para os IDs das abas

async function updateRowInSheet(range, values) {
    try {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [values],
            },
        });
        console.log(`Linha no intervalo "${range}" atualizada com sucesso.`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Erro ao atualizar linha no intervalo "${range}":`, error.message);
        throw new Error('Erro ao atualizar a planilha.');
    }
}

async function authorizeGoogleSheets() {
    try {
        // Esta linha agora usa o caminho absoluto e corrigido
        const credentials = require(GOOGLE_CREDENTIALS_PATH);
        const { client_secret, client_id, redirect_uris } = credentials.installed;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        oAuth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        });

        sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
        console.log('✅ Google Sheets API autorizada com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao autorizar Google Sheets API:', error.message);
        throw error; // Lança o erro para ser tratado no index.js
    }
}

async function getSheetIds() {
    try {
        const response = await sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID,
        });
        const sheetData = response.data.sheets;
        sheetData.forEach(sheet => {
            sheetNameToId[sheet.properties.title] = sheet.properties.sheetId;
        });
        console.log('✅ IDs das abas carregados:', sheetNameToId);
    } catch (error) {
        console.error('❌ Erro ao carregar IDs das abas:', error);
    }
}

async function appendRowToSheet(sheetName, row) {
    try {
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:A`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values: [row],
            },
        });
        console.log(`Linha adicionada à aba "${sheetName}" com sucesso.`);
    } catch (error) {
        console.error(`❌ Erro ao adicionar linha à aba "${sheetName}":`, error.message);
        throw new Error('Erro ao salvar na planilha.');
    }
}

async function deleteRowsByIndices(sheetName, rowIndices) {
    const sheetId = sheetNameToId[sheetName];
    if (sheetId === undefined) {
        return { success: false, message: `Não encontrei o ID para a aba "${sheetName}".` };
    }

    const sortedIndices = rowIndices.sort((a, b) => b - a);
    const requests = sortedIndices.map(index => ({
        deleteDimension: {
            range: {
                sheetId: sheetId,
                dimension: "ROWS",
                startIndex: index,
                endIndex: index + 1
            }
        }
    }));

    try {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: { requests },
        });
        console.log(`${rowIndices.length} linha(s) da aba "${sheetName}" apagada(s) com sucesso.`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Erro ao apagar linhas da aba "${sheetName}":`, error);
        return { success: false, message: `Ocorreu um erro ao tentar apagar os itens.` };
    }
}

async function readDataFromSheet(range) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
        });
        return response.data.values || [];
    } catch (error) {
        console.error(`❌ Erro ao ler dados do intervalo "${range}":`, error.message);
        return [];
    }
}

module.exports = {
    authorizeGoogleSheets,
    getSheetIds,
    appendRowToSheet,
    deleteRowsByIndices,
    readDataFromSheet,
    updateRowInSheet,
};