// src/handlers/creationHandler.js

const { getStructuredResponseFromLLM, askLLM } = require('../services/gemini');
const userStateManager = require('../state/userStateManager');
const { appendRowToSheet } = require('../services/sheets');
const { userMap } = require('../config/constants');
const { parseValue, isDate, getFormattedDate, getFormattedDateOnly } = require('../utils/helpers');

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
        else if (step === 4) { const valor = parseValue(messageBody); if (valor && valor > 0) { state.data["Valor Original"] = valor; } else { await msg.reply("Valor inválido."); } }
        else if (step === 5) { const valor = parseValue(messageBody); if (valor && valor >= 0) { state.data["Saldo Devedor Atual"] = valor; } else { await msg.reply("Valor inválido."); } }
        else if (step === 6) { const valor = parseValue(messageBody); if (valor && valor > 0) { state.data["Valor da Parcela"] = valor; } else { await msg.reply("Valor inválido."); } }
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
        else if (step === 8) { const dia = parseInt(messageBody); if (dia >= 1 && dia <= 31) { state.data["Dia do Vencimento"] = dia; } else { await msg.reply("Dia inválido. Informe um número de 1 a 31."); } }
        else if (step === 9) { // CORREÇÃO: Novo passo para a Data de Início
            if (messageBody.toLowerCase() === 'hoje') {
                state.data["Data de Início"] = getFormattedDateOnly();
            } else if (isDate(messageBody)) {
                state.data["Data de Início"] = messageBody;
            } else {
                await msg.reply("Formato inválido. Responda 'hoje' ou uma data em DD/MM/AAAA.");
            }
        }
        else if (step === 10) { const parcelas = parseInt(messageBody); if (parcelas > 0) { state.data["Total de Parcelas"] = parcelas; } else { await msg.reply("Número de parcelas inválido."); } }
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
        const data = state.data;
        const valorOriginal = parseFloat(data["Valor Original"]);
        const saldoAtual = parseFloat(data["Saldo Devedor Atual"]);

        // --- CÁLCULOS AUTOMÁTICOS (exceto % Quitado) ---

        // Próximo Vencimento e Atraso
        const hoje = new Date();
        const diaVencimento = parseInt(data["Dia do Vencimento"]);
        let proximoVencimento = new Date(hoje.getFullYear(), hoje.getMonth(), diaVencimento);
        if (hoje.getDate() > diaVencimento) {
            proximoVencimento.setMonth(proximoVencimento.getMonth() + 1);
        }
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
        
        // --- MONTAGEM FINAL DA LINHA ---
        const rowData = [
            data["Nome da Dívida"],          // A
            data["Credor"],                  // B
            data["Tipo de Dívida"],          // C
            valorOriginal,                   // D
            saldoAtual,                      // E
            data["Valor da Parcela"],        // F
            data["Taxa de Juros"],           // G
            diaVencimento,                   // H
            data["Data de Início"],          // I
            totalParcelas,                   // J
            data["Status"],                  // K
            data["Responsável"],             // L
            data["Observações"].toLowerCase() === 'não' ? '' : data["Observações"], // M
            '',                              // N: % Quitado (deixamos em branco para a fórmula da planilha)
            proximoVencimento.toLocaleDateString('pt-BR'), // O
            atrasoDias,                      // P
            dataQuitacao.toLocaleDateString('pt-BR') // Q
        ];

        await appendRowToSheet('Dívidas', rowData);
        await msg.reply(`✅ Dívida "${data["Nome da Dívida"]}" registrada com sucesso!`);

    } catch (error) {
        await msg.reply('Houve um erro ao salvar sua dívida.');
        console.error("Erro ao finalizar a criação da dívida:", error);
    } finally {
        userStateManager.deleteState(senderId);
    }
}

async function startGoalCreation(msg, initialData = {}) {
    const senderId = msg.author || msg.from;
    userStateManager.setState(senderId, {
        action: 'creating_goal',
        step: 0,
        // ESTRUTURA DE DADOS CORRIGIDA PARA BATER COM A PLANILHA
        data: {
            "Nome da Meta": initialData.descricao || null,
            "Valor Alvo": initialData.valor || null,
            "Valor Atual": null, // Será perguntado
            "Data Fim": null, // Será perguntado
            "Status": "Em andamento", // Valor padrão
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
        // Valida e processa a resposta do passo anterior
        if (step === 1) { // Resposta para "Nome da Meta"
            state.data["Nome da Meta"] = messageBody;
        } else if (step === 2) { // Resposta para "Valor Alvo"
            const valor = parseValue(messageBody);
            if (valor === null || valor <= 0) {
                await msg.reply("Valor alvo inválido. Por favor, digite apenas números (ex: 15000).");
            } else {
                state.data["Valor Alvo"] = valor;
            }
        } else if (step === 3) { // Resposta para "Valor Atual"
            const resposta = messageBody.toLowerCase();
            if (['não', 'nao', 'nada', '0', 'zero'].includes(resposta)) {
                state.data["Valor Atual"] = 0;
            } else {
                let valor = parseValue(messageBody);
                if (valor === null) {
                    const promptExtracaoValor = `Extraia apenas o valor numérico da seguinte frase: "${messageBody}". Se não houver um número claro, retorne "erro".`;
                    const valorDaIA = await askLLM(promptExtracaoValor);
                    valor = parseValue(valorDaIA);
                }
                if (valor !== null && valor >= 0) {
                    state.data["Valor Atual"] = valor;
                } else {
                    await msg.reply("Não consegui entender esse valor. Por favor, digite apenas números (ex: 5000) ou responda 'não'.");
                }
            }
        } else if (step === 4) { // Resposta para "Data Fim"
            if (!isDate(messageBody)) {
                await msg.reply("Formato de data inválido. Use DD/MM/AAAA, por favor.");
            } else {
                state.data["Data Fim"] = messageBody;
            }
        } else if (step === 5) { // Resposta para "Prioridade"
            state.data["Prioridade"] = messageBody;
        }
    }

    // Encontra a próxima pergunta a ser feita
    let question = "";
    if (state.data["Nome da Meta"] === null) {
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
        await finalizeGoalCreation(msg); // Todos os dados foram coletados
        return;
    }

    await msg.reply(question + "\n\n(Digite 'cancelar' para parar)");
}

async function finalizeGoalCreation(msg) {
    const senderId = msg.author || msg.from;
    const state = userStateManager.getState(senderId);
    if (!state) return;

    try {
        const data = state.data;
        const valorAlvo = parseFloat(data["Valor Alvo"]);
        const valorAtual = parseFloat(data["Valor Atual"]);

        // Calcula o progresso
        const progresso = valorAlvo > 0 ? (valorAtual / valorAlvo) : 0;

        // Calcula o valor mensal necessário
        const [day, month, year] = data["Data Fim"].split('/');
        const dataFim = new Date(year, month - 1, day);
        const dataInicio = new Date();
        const meses = (dataFim.getFullYear() - dataInicio.getFullYear()) * 12 + (dataFim.getMonth() - dataInicio.getMonth());
        let valorMensal = (meses > 0) ? (valorAlvo - valorAtual) / meses : 0;
        if (valorMensal < 0) valorMensal = 0; // Se já atingiu a meta, não precisa de mais nada

        // MONTA A LINHA NA ORDEM CORRETA DA PLANILHA
        const rowData = [
            data["Nome da Meta"],
            valorAlvo,
            valorAtual,
            `${(progresso * 100).toFixed(2)}%`, // Formata como porcentagem
            valorMensal.toFixed(2),
            data["Data Fim"],
            data["Status"],
            data["Prioridade"]
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
};
