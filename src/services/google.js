// src/services/google.js

const { google } = require('googleapis');
const path = require('path');

const GOOGLE_CREDENTIALS_PATH = path.resolve(process.cwd(), 'credentials.json');
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
let sheets;
let tasks;
let calendar; // Nova variável para a API de Agenda

async function authorizeGoogle() {
    try {
        const credentials = require(GOOGLE_CREDENTIALS_PATH);
        const { client_secret, client_id, redirect_uris } = credentials.installed;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

        sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
        tasks = google.tasks({ version: 'v1', auth: oAuth2Client });
        calendar = google.calendar({ version: 'v3', auth: oAuth2Client }); // Inicializa a API de Agenda

        console.log('✅ Google Sheets, Tasks e Calendar API autorizadas com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao autorizar APIs do Google:', error.message);
        throw error;
    }
}

// NOVA FUNÇÃO para criar um evento na agenda
async function createCalendarEvent(title, startDateTime, recurrenceRule) {
    try {
        const event = {
            summary: title,
            start: {
                dateTime: startDateTime, // Formato ISO: '2025-08-03T14:10:00-03:00'
                timeZone: 'America/Sao_Paulo', // Fuso horário do Brasil
            },
            end: {
                dateTime: startDateTime, // Para um lembrete, o início e o fim são iguais
                timeZone: 'America/Sao_Paulo',
            },
        };

        if (recurrenceRule) {
            event.recurrence = [`RRULE:${recurrenceRule}`];
        }

        const response = await calendar.events.insert({
            calendarId:'9514288e86be9262b198a99355e2fa4339f670836ec84eb64f3ccf4896d93137@group.calendar.google.com', // Usa a agenda principal do usuário
            resource: event,
        });

        console.log(`Evento criado: ${response.data.summary}`);
        return response.data;
    } catch (error) {
        console.error('❌ Erro ao criar evento na agenda:', error);
        throw new Error('Não foi possível criar o evento na agenda.');
    }
}

async function getSheetIds() {
    try {
        const response = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        const sheetData = response.data.sheets;
        const sheetNameToId = {};
        sheetData.forEach(sheet => { sheetNameToId[sheet.properties.title] = sheet.properties.sheetId; });
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
            resource: { values: [row] },
        });
        console.log(`Linha adicionada à aba "${sheetName}" com sucesso.`);
    } catch (error) {
        console.error(`❌ Erro ao adicionar linha à aba "${sheetName}":`, error.message);
        throw new Error('Erro ao salvar na planilha.');
    }
}

async function deleteRowsByIndices(sheetName, rowIndices) {
    try {
        const response = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        const sheetData = response.data.sheets;
        const sheetNameToId = {};
        sheetData.forEach(sheet => { sheetNameToId[sheet.properties.title] = sheet.properties.sheetId; });
        const sheetId = sheetNameToId[sheetName];
        if (sheetId === undefined) { return { success: false, message: `Não encontrei o ID para a aba "${sheetName}".` }; }
        const sortedIndices = rowIndices.sort((a, b) => b - a);
        const requests = sortedIndices.map(index => ({
            deleteDimension: { range: { sheetId: sheetId, dimension: "ROWS", startIndex: index, endIndex: index + 1 } }
        }));
        await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, resource: { requests } });
        console.log(`${rowIndices.length} linha(s) da aba "${sheetName}" apagada(s) com sucesso.`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Erro ao apagar linhas da aba "${sheetName}":`, error);
        return { success: false, message: `Ocorreu um erro ao tentar apagar os itens.` };
    }
}

async function readDataFromSheet(range) {
    try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: range });
        return response.data.values || [];
    } catch (error) {
        console.error(`❌ Erro ao ler dados do intervalo "${range}":`, error.message);
        return [];
    }
}

async function updateRowInSheet(range, values) {
    try {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [values] },
        });
        console.log(`Linha no intervalo "${range}" atualizada com sucesso.`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Erro ao atualizar linha no intervalo "${range}":`, error.message);
        throw new Error('Erro ao atualizar a planilha.');
    }
}

module.exports = {
    authorizeGoogle,
    createCalendarEvent,
    getSheetIds,
    appendRowToSheet,
    deleteRowsByIndices,
    readDataFromSheet,
    updateRowInSheet,
};