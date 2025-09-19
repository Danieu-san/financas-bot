// src/services/google.js

const { google } = require('googleapis');
const path = require('path');
const { convertToIsoDateTime } = require('../utils/helpers');

const GOOGLE_CREDENTIALS_PATH = path.resolve(process.cwd(), 'credentials.json');
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
let sheets;
let tasks;
let calendar;

async function authorizeGoogle() {
    try {
        const credentials = require(GOOGLE_CREDENTIALS_PATH);
        const { client_secret, client_id, redirect_uris } = credentials.installed;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

        sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
        tasks = google.tasks({ version: 'v1', auth: oAuth2Client });
        calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

        console.log('✅ Google Sheets, Tasks e Calendar API autorizadas com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao autorizar APIs do Google:', error.message);
        throw error;
    }
}
async function createCalendarEvent(title, startDateTime, recurrenceRule) {
    try {
        // CORREÇÃO: Converte a data para o formato ISO antes de enviar
        const isoDateTime = convertToIsoDateTime(startDateTime);

        const event = {
            summary: title,
            start: {
                dateTime: isoDateTime, // Usa a data formatada
                timeZone: 'America/Sao_Paulo',
            },
            end: {
                dateTime: isoDateTime, // Usa a data formatada
                timeZone: 'America/Sao_Paulo',
            },
        };

        if (recurrenceRule) {
            event.recurrence = [`RRULE:${recurrenceRule}`];
        }

        const response = await calendar.events.insert({
            calendarId: '9514288e86be9262b198a99355e2fa4339f670836ec84eb64f3ccf4896d93137@group.calendar.google.com',
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
async function getCalendarEventsForToday(date = null) {
    try {
        const calendarIdsString = process.env.GOOGLE_CALENDAR_ID;
        if (!calendarIdsString) {
            console.warn('Nenhum ID de Google Calendar configurado no .env. Pulando busca de eventos.');
            return [];
        }

        const calendarIds = calendarIdsString.split(',');
        console.log('[Diagnóstico Calendar] Lendo as seguintes agendas:', calendarIds);

        const targetDate = date || new Date();
        
        const inicioDoDia = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
        const fimDoDia = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);

        const promises = calendarIds.map(id => {
            return calendar.events.list({
                calendarId: id.trim(),
                timeMin: inicioDoDia.toISOString(),
                timeMax: fimDoDia.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });
        });

        const results = await Promise.all(promises);
        const allEvents = results.flatMap(result => result.data.items || []);

        console.log(`[Diagnóstico Calendar] Total de eventos encontrados para ${targetDate.toLocaleDateString('pt-BR')}: ${allEvents.length}`);
        if (allEvents.length > 0) {
            console.log('[Diagnóstico Calendar] Títulos dos eventos:', allEvents.map(e => e.summary));
        }

        return allEvents;

    } catch (error) {
        console.error('❌ [ERRO GRAVE Calendar] Erro ao buscar eventos do Google Calendar:', error.message);
        return [];
    }
}


module.exports = {
    authorizeGoogle,
    createCalendarEvent,
    getCalendarEventsForToday,
    getSheetIds,
    appendRowToSheet,
    deleteRowsByIndices,
    readDataFromSheet,
    updateRowInSheet,
};