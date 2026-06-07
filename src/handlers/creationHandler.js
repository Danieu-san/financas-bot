// src/handlers/creationHandler.js

const { getStructuredResponseFromLLM, askLLM } = require('../services/gemini');
const userStateManager = require('../state/userStateManager');
const { appendRowToSheet, readDataFromSheet } = require('../services/google');
const { userMap } = require('../config/constants');
const { parseValue, parseDate, isDate, getFormattedDateOnly, parseAmount, normalizeText } = require('../utils/helpers');
const { getUserByWhatsAppId } = require('../services/userService');
const { getFinancialScopeUserIds } = require('../services/oauthTokenStore');
const { GOAL_STATUS } = require('../services/goalService');

const LEGACY_DEBT_HEADERS = [
    'Nome', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Parcela', 'Juros', 'Vencimento',
    'Início', 'Total Parcelas', 'Status', 'Responsável', 'Observações', '% Quitado',
    'Próximo Vencimento', 'Atraso (Dias)', 'Data Prevista para Quitação', 'user_id'
];

function computeNextDebtDueDate(referenceDate, dueDay) {
    const safeReference = referenceDate instanceof Date ? referenceDate : new Date();
    const day = Math.max(1, Number.parseInt(dueDay, 10) || 1);
    const buildForMonth = (year, month) => {
        const maxDay = new Date(year, month + 1, 0).getDate();
        return new Date(year, month, Math.min(day, maxDay), 12, 0, 0, 0);
    };
    const currentDue = buildForMonth(safeReference.getFullYear(), safeReference.getMonth());
    if (safeReference.getDate() > currentDue.getDate()) {
        return buildForMonth(safeReference.getFullYear(), safeReference.getMonth() + 1);
    }
    return currentDue;
}

function buildDebtRowForHeaders(headers = [], data = {}, computed = {}, userId = '') {
    const values = new Map();
    const add = (aliases, value) => aliases.forEach(alias => values.set(normalizeText(alias), value));

    add(['Nome', 'Nome da Dívida'], data['Nome da Dívida']);
    add(['Credor'], data.Credor);
    add(['Tipo', 'Tipo de Dívida'], data['Tipo de Dívida']);
    add(['Valor Original'], computed.valorOriginal);
    add(['Saldo Atual'], computed.saldoAtual);
    add(['Parcela', 'Valor da Parcela'], data['Valor da Parcela']);
    add(['Juros', 'Taxa de Juros', 'Taxa'], data['Taxa de Juros']);
    add(['Vencimento', 'Dia de Vencimento'], Number.parseInt(data['Dia do Vencimento'], 10));
    add(['Início', 'Inicio', 'Data de Início', 'Data de Inicio'], data['Data de Início']);
    add(['Total Parcelas', 'Total de Parcelas'], Number.parseInt(data['Total de Parcelas'], 10));
    add(['Parcelas Pagas'], 0);
    add(['Status'], data.Status);
    add(['Responsável', 'Responsavel'], data.Responsável);
    add(['Observações', 'Observacoes', 'Obs'], normalizeText(data.Observações) === 'nao' ? '' : data.Observações);
    add(['% Quitado', 'Quitado'], '');
    add(['Último Pagamento', 'Ultimo Pagamento'], '');
    add(['Próximo Vencimento', 'Proximo Vencimento'], computed.proximoVencimento);
    add(['Atraso (Dias)', 'Dias de Atraso', 'Atraso'], computed.atrasoDias);
    add(['Data Prevista para Quitação', 'Data Prevista para Quitacao'], computed.dataQuitacao);
    add(['Estratégia', 'Estrategia'], '');
    add(['user_id', 'user id'], userId);

    const safeHeaders = Array.isArray(headers) && headers.length > 0 ? headers : LEGACY_DEBT_HEADERS;
    return safeHeaders.map(header => values.get(normalizeText(header)) ?? '');
}

function buildDebtSuccessMessage(debtName) {
    return [
        `✅ Dívida "${debtName}" registrada com sucesso!`,
        '',
        'Ela já entra na área de dívidas e no dashboard.',
        'Importante: cadastrar a dívida não entra como gasto do mês. Quando pagar uma parcela, envie `registrar pagamento` ou `paguei a parcela da dívida`.'
    ].join('\n');
}

async function startDebtCreation(msg, initialData = {}) {
    const senderId = msg.author || msg.from;
    const pessoa = userMap[senderId] || 'Ambos';
    userStateManager.setState(senderId, {
        action: 'creating_debt',
        step: 0,
        data: {
            "Nome da Dívida": initialData.descricao || null,
            "Credor": null,
            "Tipo de Dívida": null,
            "Valor Original": initialData.valor || null,
            "Saldo Devedor Atual": null,
            "Valor da Parcela": null,
            "Taxa de Juros": null,
            "Dia do Vencimento": null,
            "Data de Início": null, // CORREÇÃO: Agora será perguntado
            "Total de Parcelas": null,
            "Status": "Em dia",
            "Responsável": pessoa,
            "Observações": null,
        }
    });
    await handleDebtCreation(msg, true);
}

async function handleDebtCreation(msg, isFirstRun = false) {
    const senderId = msg.author || msg.from;
    const state = userStateManager.getState(senderId);
    if (!state) return;

    const messageBody = msg.body.trim();
    if (messageBody.toLowerCase() === 'cancelar') {
        userStateManager.deleteState(senderId);
        await msg.reply("Criação de dívida cancelada.");
        return;
    }

    if (!isFirstRun) {
        const step = state.step;
        if (step === 1) { state.data["Nome da Dívida"] = messageBody; }
        else if (step === 2) { state.data["Credor"] = messageBody; }
        else if (step === 3) {
            const promptCorrecao = `Normalize a resposta do usuário para uma das categorias: 'Empréstimo Pessoal', 'Financiamento', 'Cartão de Crédito', 'Outros'. Resposta: "${messageBody}"`;
            const tipoCorrigido = await askLLM(promptCorrecao);
            state.data["Tipo de Dívida"] = tipoCorrigido.trim();
        }
        else if (step === 4) { const valor = await parseAmount(messageBody); if (valor && valor > 0) { state.data["Valor Original"] = valor; } else { await msg.reply("Valor inválido."); } }
        else if (step === 5) { const valor = await parseAmount(messageBody); if (valor >= 0) { state.data["Saldo Devedor Atual"] = valor; } else { await msg.reply("Valor inválido."); } }
        else if (step === 6) { const valor = await parseAmount(messageBody); if (valor && valor > 0) { state.data["Valor da Parcela"] = valor; } else { await msg.reply("Valor inválido."); } }
        else if (step === 7) {
            const promptPadronizacao = `
                Sua tarefa é padronizar uma taxa de juros para o formato 'X% a.m.' (ao mês) ou 'X% a.a.' (ao ano).
                A entrada do usuário pode ser ambígua (ex: '10aa'). Faça sua melhor suposição.
                NÃO forneça explicações. Retorne APENAS o valor padronizado.

                Entrada do usuário: "${messageBody}"

                Exemplos:
                - Entrada: "2 am" -> Saída: "2% a.m."
                - Entrada: "20aa" -> Saída: "20% a.a."
                - Entrada: "1.5 ao mes" -> Saída: "1.5% a.m."

                Retorne APENAS o resultado final.
            `;
            const jurosPadronizado = await askLLM(promptPadronizacao);
            state.data["Taxa de Juros"] = jurosPadronizado.trim();
        }
        else if (step === 8) { const dia = await parseAmount(messageBody); if (dia >= 1 && dia <= 31) { state.data["Dia do Vencimento"] = dia; } else { await msg.reply("Dia inválido. Informe um número de 1 a 31."); } }
        else if (step === 9) { // Passo da Data da Dívida
            const dataFormatada = await parseDate(messageBody);
            if (dataFormatada) {
                state.data["Data de Início"] = dataFormatada;
            } else {
                await msg.reply("Formato de data inválido. Use 'hoje' ou DD/MM/AAAA, ou fale a data por extenso.");
            }
        }
        else if (step === 10) { const parcelas = await parseAmount(messageBody); if (parcelas > 0) { state.data["Total de Parcelas"] = parcelas; } else { await msg.reply("Número de parcelas inválido."); } }
        else if (step === 11) { state.data["Observações"] = messageBody; }
    }
    
    let question = "";
    if (state.data["Nome da Dívida"] === null) { state.step = 1; question = "Qual o nome da dívida? (ex: Financiamento Carro)"; }
    else if (state.data["Credor"] === null) { state.step = 2; question = "Para quem você deve?"; }
    else if (state.data["Tipo de Dívida"] === null) { state.step = 3; question = "Qual o tipo da dívida? (ex: Empréstimo Pessoal, Financiamento, Cartão de Crédito)"; }
    else if (state.data["Valor Original"] === null) { state.step = 4; question = "Qual foi o valor original da dívida?"; }
    else if (state.data["Saldo Devedor Atual"] === null) { state.step = 5; state.data["Saldo Devedor Atual"] = state.data["Valor Original"]; question = `O saldo devedor atual ainda é de R$${state.data["Valor Original"]}? (Se sim, apenas repita o valor, ou informe o valor correto).`; }
    else if (state.data["Valor da Parcela"] === null) { state.step = 6; question = "Qual o valor da parcela mensal?"; }
    else if (state.data["Taxa de Juros"] === null) { state.step = 7; question = "Qual a taxa de juros? (ex: 2 am ou 20 aa)"; }
    else if (state.data["Dia do Vencimento"] === null) { state.step = 8; question = "Qual o dia do vencimento de cada mês? (apenas o número do dia)"; }
    else if (state.data["Data de Início"] === null) { state.step = 9; question = "Qual a data de início da dívida? (Responda 'hoje' ou uma data em DD/MM/AAAA)"; } // CORREÇÃO: Nova pergunta
    else if (state.data["Total de Parcelas"] === null) { state.step = 10; question = "Qual o número total de parcelas?"; }
    else if (state.data["Observações"] === null) { state.step = 11; question = "Alguma observação? (Se não, digite 'não')"; }
    else {
        await finalizeDebtCreation(msg);
        return;
    }

    await msg.reply(question + "\n\n(Digite 'cancelar' para parar)");
}

async function finalizeDebtCreation(msg) {
    const senderId = msg.author || msg.from;
    const state = userStateManager.getState(senderId);
    if (!state) return;
    try {
        const user = await getUserByWhatsAppId(senderId);
        if (!user || !user.user_id) {
            throw new Error('Usuário ativo sem user_id. Operação bloqueada.');
        }
        const data = state.data;
        const valorOriginal = parseFloat(data["Valor Original"]);
        const saldoAtual = parseFloat(data["Saldo Devedor Atual"]);

        // --- CÁLCULOS AUTOMÁTICOS (exceto % Quitado) ---

        // Próximo Vencimento e Atraso
        const hoje = new Date();
        const diaVencimento = parseInt(data["Dia do Vencimento"]);
        const proximoVencimento = computeNextDebtDueDate(hoje, diaVencimento);
        const atrasoMs = hoje.getTime() - proximoVencimento.getTime();
        const atrasoDias = Math.max(0, Math.floor(atrasoMs / (1000 * 60 * 60 * 24)));
        if (atrasoDias > 0) {
            data["Status"] = "Atrasada";
        }

        // Data Prevista para Quitação
        const [startDay, startMonth, startYear] = data["Data de Início"].split('/');
        const dataInicio = new Date(startYear, parseInt(startMonth) - 1, startDay);
        const totalParcelas = parseInt(data["Total de Parcelas"]);
        let dataQuitacao = new Date(dataInicio.setMonth(dataInicio.getMonth() + totalParcelas));
        
        const headerRows = await readDataFromSheet('Dívidas!A1:R1');
        const headers = Array.isArray(headerRows?.[0]) ? headerRows[0] : LEGACY_DEBT_HEADERS;
        const rowData = buildDebtRowForHeaders(headers, data, {
            valorOriginal,
            saldoAtual,
            proximoVencimento: proximoVencimento.toLocaleDateString('pt-BR'),
            atrasoDias,
            dataQuitacao: dataQuitacao.toLocaleDateString('pt-BR')
        }, user.user_id);

        await appendRowToSheet('Dívidas', rowData);
        await msg.reply(buildDebtSuccessMessage(data["Nome da Dívida"]));

    } catch (error) {
        await msg.reply('Houve um erro ao salvar sua dívida.');
        console.error("Erro ao finalizar a criação da dívida:", error);
    } finally {
        userStateManager.deleteState(senderId);
    }
}

async function startGoalCreation(msg, initialData = {}) {
    const senderId = msg.author || msg.from;
    const user = await getUserByWhatsAppId(senderId);
    const hasFamilyScope = user?.user_id && getFinancialScopeUserIds(user.user_id).length > 1;
    userStateManager.setState(senderId, {
        action: 'creating_goal',
        step: 0,
        // ESTRUTURA DE DADOS CORRIGIDA PARA BATER COM A PLANILHA
        data: {
            "Escopo": initialData.escopo || initialData.scope || (hasFamilyScope ? null : 'personal'),
            "Nome da Meta": initialData.descricao || null,
            "Valor Alvo": initialData.valor || null,
            "Valor Atual": null, // Será perguntado
            "Data Fim": null, // Será perguntado
            "Status": GOAL_STATUS.ACTIVE, // Valor padrão
            "Prioridade": null // Será perguntado no final
        }
    });
    await handleGoalCreation(msg, true);
}

async function handleGoalCreation(msg, isFirstRun = false) {
    const senderId = msg.author || msg.from;
    const state = userStateManager.getState(senderId);
    if (!state) return;

    const messageBody = msg.body.trim();
    if (messageBody.toLowerCase() === 'cancelar') {
        userStateManager.deleteState(senderId);
        await msg.reply("Criação de meta cancelada.");
        return;
    }

    if (!isFirstRun) {
        const step = state.step;
        if (step === 0) {
            const normalized = messageBody.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (normalized.includes('familia') || normalized.includes('familiar')) {
                state.data["Escopo"] = 'family';
            } else if (normalized.includes('pessoal') || normalized.includes('individual')) {
                state.data["Escopo"] = 'personal';
            } else {
                await msg.reply("Não entendi o escopo. Responda 'pessoal' ou 'família'.");
            }
        }
        else if (step === 1) { state.data["Nome da Meta"] = messageBody; } 
        else if (step === 2) {
            const valor = await parseAmount(messageBody);
            if (valor === null || valor <= 0) {
                await msg.reply("Valor alvo inválido. Por favor, digite apenas números (ex: 15000).");
            } else { state.data["Valor Alvo"] = valor; }
        } else if (step === 3) {
            const resposta = messageBody.toLowerCase();
            if (['não', 'nao', 'nada', '0', 'zero'].includes(resposta)) {
                state.data["Valor Atual"] = 0;
            } else {
                const valor = await parseAmount(messageBody);
                if (valor !== null && valor >= 0) {
                    state.data["Valor Atual"] = valor;
                } else { await msg.reply("Não consegui entender esse valor. Por favor, digite apenas números (ex: 5000) ou responda 'não'."); }
            }
        } else if (step === 4) { // Passo da Data da Meta
            const dataFormatada = await parseDate(messageBody);
            if (dataFormatada) {
                state.data["Data Fim"] = dataFormatada;
            } else {
                await msg.reply("Formato de data inválido. Use DD/MM/AAAA ou fale a data por extenso.");
            }
        } else if (step === 5) {
            const promptCorrecao = `Normalize a prioridade do usuário para "Alta", "Média" ou "Baixa". Resposta do usuário: "${messageBody}"`;
            const prioridadeCorrigida = await askLLM(promptCorrecao);
            state.data["Prioridade"] = prioridadeCorrigida.trim();
        }
    }

    let question = "";
    if (state.data["Escopo"] === null) {
        state.step = 0; question = "Essa meta é pessoal ou familiar?";
    } else if (state.data["Nome da Meta"] === null) {
        state.step = 1; question = "Qual o nome da sua nova meta?";
    } else if (state.data["Valor Alvo"] === null) {
        state.step = 2; question = `Qual o valor alvo para a meta "${state.data["Nome da Meta"]}"?`;
    } else if (state.data["Valor Atual"] === null) {
        state.step = 3; question = "Você já tem algum valor guardado para essa meta? Se sim, digite o valor. Se não, responda 'não'.";
    } else if (state.data["Data Fim"] === null) {
        state.step = 4; question = "Qual a data final que você planeja para alcançar essa meta? (DD/MM/AAAA)";
    } else if (state.data["Prioridade"] === null) {
        state.step = 5; question = "E qual a prioridade dessa meta? (Ex: Alta, Média, Baixa)";
    } else {
        await finalizeGoalCreation(msg);
        return;
    }

    await msg.reply(question + "\n\n(Digite 'cancelar' para parar)");
}

async function finalizeGoalCreation(msg) {
    const senderId = msg.author || msg.from;
    const state = userStateManager.getState(senderId);
    if (!state) return;

    try {
        const user = await getUserByWhatsAppId(senderId);
        if (!user || !user.user_id) {
            throw new Error('Usuário ativo sem user_id. Operação bloqueada.');
        }
        const data = state.data;
        // --- CORREÇÃO 1: Recalculando o Valor Mensal ---
        const valorAlvo = parseFloat(data["Valor Alvo"]);
        const valorAtual = parseFloat(data["Valor Atual"]);
        
        const [day, month, year] = data["Data Fim"].split('/');
        const dataFim = new Date(year, month - 1, day);
        const dataInicio = new Date();
        // Calcula a diferença de meses entre hoje e a data final
        const mesesRestantes = (dataFim.getFullYear() - dataInicio.getFullYear()) * 12 + (dataFim.getMonth() - dataInicio.getMonth());
        
        let valorMensal = 0;
        if (mesesRestantes > 0) {
            valorMensal = (valorAlvo - valorAtual) / mesesRestantes;
        }
        // Se já atingiu a meta ou não há meses restantes, o valor necessário é 0
        if (valorMensal < 0) valorMensal = 0;

        // --- CORREÇÃO 2: Usando as Fórmulas e a Data Corrigida ---
        const progressoFormula = '=INDIRECT("C"&ROW())/INDIRECT("B"&ROW())';
        const statusFormula = '=IF(INDIRECT("C"&ROW()) >= INDIRECT("B"&ROW()); "Concluída"; "Em andamento")';

        const rowData = [
            data["Nome da Meta"],
            data["Valor Alvo"],
            data["Valor Atual"],
            progressoFormula,
            valorMensal, // Adiciona o valor mensal calculado
            data["Data Fim"], // A data já está no formato DD/MM/AAAA, a planilha interpreta corretamente
            statusFormula,
            data["Prioridade"],
            user.user_id,
            data["Escopo"] || 'personal',
            ''
        ];

        await appendRowToSheet('Metas', rowData);
        await msg.reply(`✅ Meta "${data["Nome da Meta"]}" registrada com sucesso!`);

    } catch (error) {
        await msg.reply('Houve um erro ao salvar sua meta.');
        console.error("Erro ao finalizar a criação da meta:", error);
    } finally {
        userStateManager.deleteState(senderId);
    }
}

module.exports = {
    startDebtCreation,
    handleDebtCreation,
    finalizeDebtCreation,
    startGoalCreation,
    handleGoalCreation,
    finalizeGoalCreation,
    __test__: {
        buildDebtSuccessMessage,
        buildDebtRowForHeaders,
        computeNextDebtDueDate
    }
};

