// --- Importações ---
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { google } = require('googleapis');
require('dotenv').config();

// --- Configurações Iniciais ---
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- State Management ---
const userStates = {}; // Armazena o estado da conversa atual para cada usuário
const sheetNameToId = {}; // Armazena o ID numérico de cada aba da planilha

// --- Inicialização do Cliente WhatsApp ---
const client = new Client({
    authStrategy: new LocalAuth(), // Armazena a sessão localmente
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
    }
});

// --- Eventos do Cliente WhatsApp ---

client.on('qr', qr => {
    console.log('QR Code recebido. Escaneie com seu celular:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ Cliente WhatsApp está pronto e conectado!');
});

client.on('auth_failure', msg => {
    console.error('❌ Falha na autenticação do WhatsApp:', msg);
});

client.on('disconnected', reason => {
    console.log('Cliente desconectado:', reason);
    console.log('Tentando reconectar...');
    client.initialize();
});

// --- Integração com Google Sheets ---
let sheets; // Variável para a API do Google Sheets

async function authorizeGoogleSheets() {
    try {
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
        process.exit(1);
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

// --- Integração com LLM (Gemini API) ---

async function askLLM(prompt) {
    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`Erro na API Gemini: ${response.status} ${await response.text()}`);
        const result = await response.json();
        if (result.candidates && result.candidates.length > 0) {
            return result.candidates[0].content.parts[0].text.trim();
        }
        console.error("Resposta inesperada do LLM:", JSON.stringify(result, null, 2));
        return "Não consegui processar a resposta da IA.";
    } catch (error) {
        console.error("❌ Erro ao comunicar com o LLM:", error);
        return "Ocorreu um erro ao conectar com a IA.";
    }
}

async function getStructuredResponseFromLLM(prompt) {
    const schema = {
        type: "OBJECT",
        properties: {
            "tipo": { "type": "STRING", "enum": ["gasto", "entrada", "divida", "meta", "pergunta", "apagar_item", "desconhecido"] },
            "valor": { "type": "NUMBER" },
            "categoria": { "type": "STRING", "description": "Categoria da transação ou a aba para apagar (gasto, entrada, divida, meta)." },
            "descricao": { "type": "STRING", "description": "Descrição da transação ou do item a ser apagado." },
            "pessoa": { "type": "STRING", "enum": ["Daniel", "Thaís", "Ambos"] },
            "detalhesPergunta": { "type": "STRING" }
        },
        "required": ["tipo"]
    };

    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", responseSchema: schema }
        };
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`Erro na API Gemini (JSON): ${response.status} ${await response.text()}`);
        const result = await response.json();
        if (result.candidates && result.candidates.length > 0) {
            return JSON.parse(result.candidates[0].content.parts[0].text);
        }
        console.error("Resposta estruturada inesperada do LLM:", JSON.stringify(result, null, 2));
        return null;
    } catch (error) {
        console.error("❌ Erro ao obter resposta estruturada do LLM:", error);
        return null;
    }
}

// --- Mapeamento de Usuários e Funções de Validação ---
const userMap = { '5521970112407@c.us': 'Daniel', '5521964270368@c.us': 'Thaís' };
const parseValue = (text) => {
    const value = parseFloat(text.replace('.', '').replace(',', '.'));
    return isNaN(value) ? null : value;
};
const isDate = (text) => /^\d{2}\/\d{2}\/\d{4}$/.test(text);

// --- Lógica de Exclusão ---
async function handleDeletionRequest(msg, deletionRequest) {
    const senderId = msg.author || msg.from;
    const pessoa = userMap[senderId] || 'Ambos';

    const parsingPrompt = `
        Analise o seguinte pedido de exclusão de um usuário chamado '${pessoa}': "${deletionRequest.descricao}".
        Extraia os critérios para a exclusão em um formato JSON com os campos: "quantidade" (padrão 1), "alvo" (ex: "ultimo"), e "criterios" (um objeto com filtros como 'data', 'categoria', 'descricao', 'pessoa').
        Se o usuário falar "meus gastos", o critério de pessoa deve ser '${pessoa}'.
        Hoje é ${new Date().toLocaleDateString('pt-BR')}.
        Exemplos:
        - "apagar as duas ultimas dívidas" -> {"quantidade": 2, "alvo": "ultimo", "criterios": {}}
        - "apagar meus gastos com transporte do dia 5 de julho" -> {"quantidade": 0, "alvo": null, "criterios": {"pessoa": "${pessoa}", "categoria": "transporte", "data": "05/07/2025", "descricao": "transporte"}}
        Retorne apenas o objeto JSON.`;

    const parsedCriteriaJson = await askLLM(parsingPrompt);
    let parsedCriteria;
    try {
        const cleanedJson = parsedCriteriaJson.replace(/```json/g, '').replace(/```/g, '').trim();
        parsedCriteria = JSON.parse(cleanedJson);
    } catch (e) {
        console.error("Erro ao parsear critérios de exclusão do LLM:", e, parsedCriteriaJson);
        await msg.reply("Não consegui entender exatamente o que você quer apagar.");
        return;
    }

    const sheetMap = { 'gasto': 'Saídas', 'saida': 'Saídas', 'saídas': 'Saídas', 'entrada': 'Entradas', 'divida': 'Dívidas', 'dívida': 'Dívidas', 'meta': 'Metas' };
    const sheetName = sheetMap[deletionRequest.categoria?.toLowerCase()];

    if (!sheetName) {
        await msg.reply("Não entendi de qual aba você quer apagar (gasto, entrada, dívida ou meta).");
        return;
    }

    const allData = await readDataFromSheet(sheetName);
    if (!allData || allData.length <= 1) {
        await msg.reply(`A aba "${sheetName}" está vazia.`);
        return;
    }

    let rowsToDelete = [];

    if (parsedCriteria.alvo === 'ultimo') {
        const count = parsedCriteria.quantidade || 1;
        if (allData.length - 1 < count) {
            await msg.reply(`Você quer apagar ${count} itens, mas só existem ${allData.length - 1} na aba "${sheetName}".`);
            return;
        }
        for (let i = 0; i < count; i++) {
            const rowIndex = allData.length - 1 - i;
            rowsToDelete.push({ index: rowIndex, data: allData[rowIndex] });
        }
    } else {
        const criteria = parsedCriteria.criterios;
        if (!criteria || Object.keys(criteria).length === 0) {
            await msg.reply("Não identifiquei critérios para a exclusão.");
            return;
        }

        const filteredRows = allData.map((row, index) => ({ row, index }))
            .filter(item => {
                if (item.index === 0) return false;
                const rowData = item.row;
                const dateAsString = new Date(rowData[0]).toLocaleDateString('pt-BR');
                let match = true;
                if (criteria.descricao && !rowData[1]?.toLowerCase().includes(criteria.descricao.toLowerCase())) match = false;
                if (criteria.categoria && !rowData[2]?.toLowerCase().includes(criteria.categoria.toLowerCase())) match = false;
                if (criteria.pessoa && !rowData[4]?.toLowerCase().includes(criteria.pessoa.toLowerCase())) match = false;
                if (criteria.data && !dateAsString.includes(criteria.data)) match = false;
                return match;
            });
        rowsToDelete = filteredRows.map(item => ({ index: item.index, data: item.row }));
    }

    if (rowsToDelete.length === 0) {
        await msg.reply("Não encontrei nenhum item que corresponda à sua solicitação para apagar.");
        return;
    }

    userStates[senderId] = {
        action: 'confirming_delete',
        sheetName: sheetName,
        rowsToDelete: rowsToDelete.map(r => r.index)
    };

    let confirmationMessage = `Encontrei ${rowsToDelete.length} item(ns) para apagar na aba "${sheetName}":\n\n`;
    rowsToDelete.forEach(item => {
        let itemText = '';
        const itemData = item.data;
        if (sheetName === 'Saídas' || sheetName === 'Entradas') {
            const date = new Date(itemData[0]).toLocaleDateString('pt-BR');
            const description = itemData[1];
            const value = parseValue(itemData[3]?.toString() || '0')?.toFixed(2);
            itemText = `${date} - ${description} (R$ ${value})`;
        } else if (sheetName === 'Dívidas') {
            const description = itemData[0]; // Nome da Dívida
            const value = parseValue(itemData[3]?.toString() || '0')?.toFixed(2); // Saldo Devedor
            itemText = `${description} (Saldo: R$ ${value})`;
        } else if (sheetName === 'Metas') {
            const description = itemData[0]; // Nome da Meta
            const value = parseValue(itemData[3]?.toString() || '0')?.toFixed(2); // Valor Alvo
            itemText = `${description} (Alvo: R$ ${value})`;
        } else {
            // Fallback genérico caso uma nova aba seja adicionada no futuro
            itemText = `${itemData.join(' - ')}`;
        }
        confirmationMessage += `- ${itemText}\n`;
    });
    confirmationMessage += "\nVocê tem certeza que deseja apagar esses itens? Responda com *'sim'* para confirmar.";
    await msg.reply(confirmationMessage);
}

// --- Lógicas de Conversa para Criação de Itens ---
// (As funções startDebtCreation, handleDebtCreation, finalizeDebtCreation, startGoalCreation, handleGoalCreation, finalizeGoalCreation permanecem as mesmas da versão anterior)
async function startDebtCreation(msg, initialData = {}) {
    const senderId = msg.author || msg.from;
    const pessoa = userMap[senderId] || 'Ambos';
    userStates[senderId] = {
        action: 'creating_debt',
        step: 0,
        data: {
            "Nome da Dívida / Descrição": initialData.descricao || null, "Credor": null, "Valor Original": initialData.valor || null, "Saldo Devedor Atual": initialData.valor || null, "Status": "Em dia", "Tipo de Dívida": null, "Taxa de Juros (% ao mês ou ano)": null, "Data de Vencimento da Parcela": null, "Valor da Parcela / Pagamento Mínimo": null, "Data de Quitação Prevista": null, "Pessoa Responsável": initialData.pessoa || pessoa, "Data de Início": new Date().toLocaleDateString('pt-BR'), "Número de Parcelas (Total / Restante)": null, "Observações": null
        }
    };
    await handleDebtCreation(msg, true);
}
async function handleDebtCreation(msg, isFirstRun = false) {
    const senderId = msg.author || msg.from;
    const state = userStates[senderId];
    const messageBody = msg.body.trim();
    if (messageBody.toLowerCase() === 'cancelar') { delete userStates[senderId]; await msg.reply("Criação de dívida cancelada."); return; }
    if (state && !isFirstRun) {
        const step = state.step;
        if (step === 1) state.data["Nome da Dívida / Descrição"] = messageBody;
        else if (step === 2) state.data["Credor"] = messageBody;
        else if (step === 3) { const valor = parseValue(messageBody); if (valor === null) { await msg.reply("Valor inválido."); return; } state.data["Valor Original"] = valor; state.data["Saldo Devedor Atual"] = valor; }
        else if (step === 4) state.data["Tipo de Dívida"] = messageBody;
        else if (step === 5) state.data["Taxa de Juros (% ao mês ou ano)"] = messageBody;
        else if (step === 6) { if (!/^\d{1,2}$/.test(messageBody)) { await msg.reply("Dia inválido."); return; } state.data["Data de Vencimento da Parcela"] = messageBody; }
        else if (step === 7) { const valor = parseValue(messageBody); if (valor === null) { await msg.reply("Valor inválido."); return; } state.data["Valor da Parcela / Pagamento Mínimo"] = valor; }
        else if (step === 8) { if (!isDate(messageBody)) { await msg.reply("Formato de data inválido."); return; } state.data["Data de Quitação Prevista"] = messageBody; }
        else if (step === 9) state.data["Número de Parcelas (Total / Restante)"] = messageBody;
        else if (step === 10) state.data["Observações"] = messageBody;
    }
    let question = "";
    if (!state.data["Nome da Dívida / Descrição"]) { state.step = 1; question = "Qual o nome da dívida?"; }
    else if (!state.data["Credor"]) { state.step = 2; question = "Para quem você deve?"; }
    else if (!state.data["Valor Original"]) { state.step = 3; question = "Qual o valor original?"; }
    else if (!state.data["Tipo de Dívida"]) { state.step = 4; question = "Qual o tipo da dívida?"; }
    else if (!state.data["Taxa de Juros (% ao mês ou ano)"]) { state.step = 5; question = "Qual a taxa de juros?"; }
    else if (!state.data["Data de Vencimento da Parcela"]) { state.step = 6; question = "Qual o dia do vencimento?"; }
    else if (!state.data["Valor da Parcela / Pagamento Mínimo"]) { state.step = 7; question = "Qual o valor da parcela?"; }
    else if (!state.data["Data de Quitação Prevista"]) { state.step = 8; question = "Qual a data prevista para quitação? (DD/MM/AAAA)"; }
    else if (!state.data["Número de Parcelas (Total / Restante)"]) { state.step = 9; question = "Qual o número de parcelas?"; }
    else if (state.data["Observações"] === null) { state.step = 10; question = "Alguma observação?"; }
    else { await finalizeDebtCreation(msg); return; }
    await msg.reply(question + "\n\n(Digite 'cancelar' para parar)");
}
async function finalizeDebtCreation(msg) {
    const senderId = msg.author || msg.from;
    const state = userStates[senderId];
    if (!state) return;
    try {
        await appendRowToSheet('Dívidas', Object.values(state.data));
        await msg.reply(`✅ Dívida "${state.data["Nome da Dívida / Descrição"]}" registrada!`);
    } catch (error) {
        await msg.reply(`Houve um erro ao salvar sua dívida.`);
        console.error("Erro ao finalizar a criação da dívida:", error);
    } finally {
        delete userStates[senderId];
    }
}
async function startGoalCreation(msg, initialData = {}) {
    const senderId = msg.author || msg.from;
    const pessoa = userMap[senderId] || 'Ambos';
    userStates[senderId] = {
        action: 'creating_goal',
        step: 0,
        data: { "Nome da Meta": initialData.descricao || null, "Pessoa da Meta": initialData.pessoa || pessoa, "Tipo de Meta": null, "Valor Alvo": initialData.valor || null, "Data de Início": new Date().toISOString(), "Data Alvo": null, "Valor já Economizado": null, "Contribuição Mensal Sugerida (R$)": 0, "Progresso (%)": 0, "Status": "Em andamento", "Prioridade": null, "Observações": null }
    };
    await handleGoalCreation(msg, true);
}
async function handleGoalCreation(msg, isFirstRun = false) {
    const senderId = msg.author || msg.from;
    const state = userStates[senderId];
    const messageBody = msg.body.trim();
    if (messageBody.toLowerCase() === 'cancelar') { delete userStates[senderId]; await msg.reply("Criação de meta cancelada."); return; }
    if (state && !isFirstRun) {
        const step = state.step;
        if (step === 1) state.data["Nome da Meta"] = messageBody;
        else if (step === 2) state.data["Tipo de Meta"] = messageBody;
        else if (step === 3) { const valor = parseValue(messageBody); if (valor === null || valor <= 0) { await msg.reply("Valor inválido."); return; } state.data["Valor Alvo"] = valor; }
        else if (step === 4) { if (!isDate(messageBody)) { await msg.reply("Formato de data inválido."); return; } state.data["Data Alvo"] = messageBody; }
        else if (step === 5) { const valor = parseValue(messageBody); if (valor === null || valor < 0) { await msg.reply("Valor inválido."); return; } state.data["Valor já Economizado"] = valor; }
        else if (step === 6) state.data["Prioridade"] = messageBody;
        else if (step === 7) state.data["Observações"] = messageBody;
    }
    let question = "";
    if (!state.data["Nome da Meta"]) { state.step = 1; question = "Qual o nome da meta?"; }
    else if (!state.data["Tipo de Meta"]) { state.step = 2; question = `Qual o tipo da meta "${state.data["Nome da Meta"]}"?`; }
    else if (!state.data["Valor Alvo"]) { state.step = 3; question = "Qual o valor alvo?"; }
    else if (!state.data["Data Alvo"]) { state.step = 4; question = "Qual a data alvo? (DD/MM/AAAA)"; }
    else if (state.data["Valor já Economizado"] === null) { state.step = 5; question = "Já tem valor guardado?"; }
    else if (!state.data["Prioridade"]) { state.step = 6; question = "Qual a prioridade?"; }
    else if (state.data["Observações"] === null) { state.step = 7; question = "Alguma observação?"; }
    else { await finalizeGoalCreation(msg); return; }
    await msg.reply(question + "\n\n(Digite 'cancelar' para parar)");
}
async function finalizeGoalCreation(msg) {
    const senderId = msg.author || msg.from;
    const state = userStates[senderId];
    if (!state) return;
    try {
        const data = state.data;
        const progresso = data["Valor Alvo"] > 0 ? (data["Valor já Economizado"] / data["Valor Alvo"]) * 100 : 0;
        const [day, month, year] = data["Data Alvo"].split('/');
        const dataAlvo = new Date(year, month - 1, day);
        const dataInicio = new Date(data["Data de Início"]);
        const meses = (dataAlvo.getFullYear() - dataInicio.getFullYear()) * 12 + (dataAlvo.getMonth() - dataInicio.getMonth());
        let contribuicao = (meses > 0) ? (data["Valor Alvo"] - data["Valor já Economizado"]) / meses : 0;
        const rowData = [data["Nome da Meta"], data["Pessoa da Meta"], data["Tipo de Meta"], data["Valor Alvo"], dataInicio.toLocaleDateString('pt-BR'), data["Data Alvo"], data["Valor já Economizado"], contribuicao > 0 ? contribuicao.toFixed(2) : 0, progresso.toFixed(2), data["Status"], data["Prioridade"], data["Observações"].toLowerCase() === 'não' ? '' : data["Observações"]];
        await appendRowToSheet('Metas', rowData);
        await msg.reply(`✅ Meta "${data["Nome da Meta"]}" registrada!`);
    } catch (error) {
        await msg.reply(`Houve um erro ao salvar sua meta.`);
        console.error("Erro ao finalizar a criação da meta:", error);
    } finally {
        delete userStates[senderId];
    }
}


// --- Lógica Principal do Bot ---
client.on('message', async msg => {
    if (msg.isStatus || msg.fromMe) return;

    const senderId = msg.author || msg.from;
    const pessoa = userMap[senderId] || 'Ambos';
    const messageBody = msg.body.trim();

    if (userStates[senderId]) {
        const state = userStates[senderId];
        if (state.action === 'confirming_delete') {
            if (messageBody.toLowerCase() === 'sim') {
                await msg.reply("Confirmado. Apagando os itens...");
                const result = await deleteRowsByIndices(state.sheetName, state.rowsToDelete);
                if (result.success) {
                    await msg.reply(`✅ ${state.rowsToDelete.length} item(ns) foram apagados com sucesso!`);
                } else {
                    await msg.reply(result.message || "Ocorreu um erro ao apagar.");
                }
            } else {
                await msg.reply("Ok, a exclusão foi cancelada.");
            }
            delete userStates[senderId];
            return;
        }
        if (state.action === 'creating_goal') { await handleGoalCreation(msg); return; }
        if (state.action === 'creating_debt') { await handleDebtCreation(msg); return; }
    }

    console.log(`Mensagem de ${pessoa} (${senderId}): "${messageBody}"`);

    try {
        const prompt = `A mensagem é de '${pessoa}'. Analise a seguinte mensagem para controle financeiro: "${messageBody}".
- Se a intenção for apagar algo (ex: "apagar ultimo gasto", "delete a última dívida", "excluir gastos com ifood de ontem"), classifique o tipo como 'apagar_item'. Na 'categoria', coloque a aba (gasto, entrada, divida, meta). Na 'descricao', coloque a descrição completa do que apagar (ex: 'ultimo gasto', 'dívidas de maio').
- Se for um pedido de informação ou busca (ex: "quanto gastei com alimentação?", "procure por ifood"), classifique como 'pergunta'.
- Para registros de novas transações, use os tipos 'gasto', 'entrada', 'divida', 'meta'.
- Extraia os detalhes conforme o schema JSON. Se não se encaixar em nada, classifique como 'desconhecido'.`;
        const structuredResponse = await getStructuredResponseFromLLM(prompt);

        if (!structuredResponse || !structuredResponse.tipo) {
            await msg.reply("Não consegui entender sua mensagem. Tente de novo.");
            return;
        }

        const { tipo, descricao, categoria, valor, detalhesPergunta } = structuredResponse;
        
        switch (tipo) {
            case 'gasto':
            case 'entrada':
                const sheetName = tipo === 'gasto' ? 'Saídas' : 'Entradas';
                const rowData = [new Date().toISOString(), descricao || 'Sem descrição', categoria || 'Outros', valor || 0, structuredResponse.pessoa || pessoa];
                await appendRowToSheet(sheetName, rowData);
                await msg.reply(`✅ ${tipo.charAt(0).toUpperCase() + tipo.slice(1)} de ${structuredResponse.pessoa || pessoa} registrada com sucesso!`);
                break;

            case 'divida':
                 await startDebtCreation(msg, structuredResponse);
                 break;

            case 'meta':
                 await startGoalCreation(msg, structuredResponse);
                 break;
            
            case 'apagar_item':
                await handleDeletionRequest(msg, structuredResponse);
                break;

            case 'pergunta':
                await msg.reply("Analisando seus dados para responder, um momento...");
                const [saidasData, entradasData, metasData, dividasData] = await Promise.all([
                    readDataFromSheet('Saídas!A:E'), readDataFromSheet('Entradas!A:E'),
                    readDataFromSheet('Metas!A:L'), readDataFromSheet('Dívidas!A:N')
                ]);
                
                const contextPrompt = `
                    Você é um assistente financeiro prestativo. Com base nos dados JSON abaixo, responda à pergunta do usuário. Hoje é ${new Date().toLocaleDateString('pt-BR')}.
                    Dados de Saídas: ${JSON.stringify(saidasData)}
                    Dados de Entradas: ${JSON.stringify(entradasData)}
                    Dados de Metas: ${JSON.stringify(metasData)}
                    Dados de Dívidas: ${JSON.stringify(dividasData)}
                    Pergunta do Usuário (${pessoa}): "${detalhesPergunta || messageBody}"`;

                const respostaIA = await askLLM(contextPrompt);
                await msg.reply(respostaIA);
                break;

            default:
                const genericResponse = await askLLM(`A mensagem é de ${pessoa}. Responda de forma amigável à seguinte mensagem: "${messageBody}"`);
                await msg.reply(genericResponse);
                break;
        }

    } catch (error) {
        console.error('❌ Erro fatal ao processar mensagem:', error);
        await msg.reply('Ocorreu um erro interno. A equipe de TI (o Daniel) foi notificada.');
    }
});

// --- Inicia o Bot ---
async function startBot() {
    console.log('Iniciando o bot...');
    if (!SPREADSHEET_ID || !GEMINI_API_KEY || !process.env.GOOGLE_REFRESH_TOKEN) {
        console.error("❌ Faltam variáveis de ambiente essenciais. Verifique seu arquivo .env.");
        return;
    }
    await authorizeGoogleSheets();
    await getSheetIds(); // Carrega os IDs das abas
    client.initialize();
}

startBot();
