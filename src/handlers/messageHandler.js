// src/handlers/messageHandler.js

const { userMap } = require('../config/constants');
const userStateManager = require('../state/userStateManager');
const creationHandler = require('./creationHandler');
const deletionHandler = require('./deletionHandler');
const debtHandler = require('./debtHandler');
const { getStructuredResponseFromLLM, askLLM } = require('../services/gemini');
const { appendRowToSheet, readDataFromSheet } = require('../services/sheets');
const { getFormattedDate } = require('../utils/helpers');

// Base de Conhecimento para Gastos
const mapeamentoGastos = {
    "aluguel": { categoria: "Moradia", subcategoria: "ALUGUEL" }, "condomínio": { categoria: "Moradia", subcategoria: "CONDOMÍNIO" },
    "iptu": { categoria: "Moradia", subcategoria: "IPTU" }, "luz": { categoria: "Moradia", subcategoria: "LUZ" },
    "água": { categoria: "Moradia", subcategoria: "ÁGUA" }, "internet": { categoria: "Moradia", subcategoria: "INTERNET" },
    "mercado": { categoria: "Alimentação", subcategoria: "SUPERMERCADO" }, "supermercado": { categoria: "Alimentação", subcategoria: "SUPERMERCADO" },
    "guanabara": { categoria: "Alimentação", subcategoria: "SUPERMERCADO" }, "assaí": { categoria: "Alimentação", subcategoria: "SUPERMERCADO" },
    "assai": { categoria: "Alimentação", subcategoria: "SUPERMERCADO" }, "restaurante": { categoria: "Alimentação", subcategoria: "RESTAURANTE" },
    "ifood": { categoria: "Alimentação", subcategoria: "DELIVERY / IFOOD" }, "delivery": { categoria: "Alimentação", subcategoria: "DELIVERY / IFOOD" },
    "lanche": { categoria: "Alimentação", subcategoria: "PADARIA / LANCHE" }, "padaria": { categoria: "Alimentação", subcategoria: "PADARIA / LANCHE" },
    "gasolina": { categoria: "Transporte", subcategoria: "COMBUSTÍVEL" }, "combustível": { categoria: "Transporte", subcategoria: "COMBUSTÍVEL" },
    "uber": { categoria: "Transporte", subcategoria: "UBER / 99" }, "99": { categoria: "Transporte", subcategoria: "UBER / 99" },
    "trem": { categoria: "Transporte", subcategoria: "TRANSPORTE PÚBLICO" }, "metrô": { categoria: "Transporte", subcategoria: "TRANSPORTE PÚBLICO" },
    "ônibus": { categoria: "Transporte", subcategoria: "TRANSPORTE PÚBLICO" }, "farmácia": { categoria: "Saúde", subcategoria: "FARMÁCIA" },
    "remédio": { categoria: "Saúde", subcategoria: "FARMÁCIA" }, "consulta": { categoria: "Saúde", subcategoria: "CONSULTAS" },
    "exame": { categoria: "Saúde", subcategoria: "EXAMES" },
};

// Base de Conhecimento para Entradas
const mapeamentoEntradas = {
    "salário": { categoria: "Salário" },
    "salario": { categoria: "Salário" },
    "pagamento": { categoria: "Salário" },
    "freela": { categoria: "Renda Extra" },
    "freelance": { categoria: "Renda Extra" },
    "bico": { categoria: "Renda Extra" },
    "venda": { categoria: "Venda" },
    "presente": { categoria: "Presente" },
    "reembolso": { categoria: "Reembolso" },
    "dividendos": { categoria: "Investimentos" },
};
const categoriasEntrada = ["Salário", "Renda Extra", "Investimentos", "Presente", "Reembolso", "Venda", "Outros"];
const metodosRecebimento = ["Conta Corrente", "Poupança", "Dinheiro", "PIX"];

// Schema Unificado Completo
const MASTER_SCHEMA = {
    type: "OBJECT",
    properties: {
        intent: { type: "STRING", enum: ["gasto", "entrada", "pergunta", "apagar_item", "criar_divida", "criar_meta", "registrar_pagamento", "desconhecido"] },
        gastoDetails: {
            type: "OBJECT",
            description: "Preenchido SOMENTE se a intenção for 'gasto'.",
            properties: {
                descricao: { type: "STRING" }, valor: { type: "NUMBER" }, categoria: { type: "STRING" },
                subcategoria: { type: "STRING" }, pagamento: { type: "STRING", enum: ["Dinheiro", "Débito", "Crédito", "PIX"] },
                recorrente: { type: "STRING", enum: ["Sim", "Não"] }, observacoes: { type: "STRING" },
            }
        },
        entradaDetails: {
            type: "OBJECT",
            description: "Preenchido SOMENTE se a intenção for 'entrada'.",
            properties: {
                descricao: { type: "STRING" }, categoria: { type: "STRING", enum: categoriasEntrada },
                valor: { type: "NUMBER" }, recebimento: { type: "STRING", enum: metodosRecebimento },
                recorrente: { type: "STRING", enum: ["Sim", "Não"] }, observacoes: { type: "STRING" }
            }
        },
        deleteDetails: {
            type: "OBJECT",
            description: "Preenchido se a intenção for 'apagar_item'.",
            properties: { descricao: { type: "STRING" }, categoria: { type: "STRING" } }
        },
        pagamentoDetails: {
            type: "OBJECT",
            description: "Preenchido se a intenção for 'registrar_pagamento'.",
            properties: {
                descricao: { type: "STRING", description: "O nome da dívida que foi paga." }
            }
        },
        question: { type: "STRING" }
    },
    required: ["intent"]
};

// Função reutilizável para salvar gastos
async function salvarGastoNaPlanilha(gasto, pessoa) {
    const valorNumerico = parseFloat(gasto.valor);
    const rowData = [
        getFormattedDate(),
        gasto.descricao || 'Não especificado', gasto.categoria || 'Outros',
        gasto.subcategoria || '', valorNumerico, pessoa, gasto.pagamento || '',
        gasto.recorrente || 'Não', gasto.observacoes || ''
    ];
    await appendRowToSheet('Saídas', rowData);
    return `✅ Gasto de R$${valorNumerico.toFixed(2)} registrado em *${gasto.categoria || 'Outros'} / ${gasto.subcategoria || 'N/A'}*!`;
}

// Função principal de tratamento de mensagens
async function handleMessage(msg) {
    if (msg.isStatus || msg.fromMe) return;

    const senderId = msg.author || msg.from;
    const pessoa = userMap[senderId] || 'Ambos';
    const messageBody = msg.body.trim();

    const currentState = userStateManager.getState(senderId);
    if (currentState) {
        switch (currentState.action) {
            case 'awaiting_payment_amount':
                await debtHandler.finalizePaymentRegistration(msg);
                return;
            
            case 'awaiting_payment_method':
                const gasto = currentState.data;
                const respostaPagamento = messageBody;
                const promptCorrecaoPagamento = `Analise a resposta: "${respostaPagamento}" e normalize-a para uma das seguintes opções: 'Crédito', 'Débito', 'PIX', 'Dinheiro'. Se impossível, retorne "Outros". Retorne APENAS a palavra correta.`;
                const pagamentoCorrigido = await askLLM(promptCorrecaoPagamento);
                gasto.pagamento = pagamentoCorrigido.trim();
                const confirmationMessage = await salvarGastoNaPlanilha(gasto, pessoa);
                await msg.reply(confirmationMessage);
                userStateManager.deleteState(senderId);
                return;

            case 'awaiting_receipt_method':
                const entrada = currentState.data;
                const respostaRecebimento = messageBody;
                const promptCorrecaoRecebimento = `Analise a resposta: "${respostaRecebimento}" e normalize-a para uma das seguintes opções: 'Conta Corrente', 'Poupança', 'PIX', 'Dinheiro'. Se impossível, retorne "Outros". Retorne APENAS a categoria correta.`;
                const recebimentoCorrigido = await askLLM(promptCorrecaoRecebimento);
                entrada.recebimento = recebimentoCorrigido.trim();
                const valorNumericoEntrada = parseFloat(entrada.valor);
                const entradaRowData = [
                    getFormattedDate(), entrada.descricao || 'Não especificado', entrada.categoria || 'Outros',
                    valorNumericoEntrada, pessoa, entrada.recebimento,
                    entrada.recorrente || 'Não', entrada.observacoes || ''
                ];
                await appendRowToSheet('Entradas', entradaRowData);
                await msg.reply(`✅ Entrada de R$${valorNumericoEntrada.toFixed(2)} registrada na categoria *${entrada.categoria}*!`);
                userStateManager.deleteState(senderId);
                return;

            case 'creating_goal':
                await creationHandler.handleGoalCreation(msg);
                return;

            case 'creating_debt':
                await creationHandler.handleDebtCreation(msg);
                return;

            case 'confirming_delete':
                await deletionHandler.confirmDeletion(msg);
                return;
        }
    }

    console.log(`Mensagem de ${pessoa} (${senderId}): "${messageBody}"`);

    try {
        const masterPrompt = `Sua tarefa é analisar a mensagem e extrair a intenção e detalhes em um JSON. A mensagem é de "${pessoa}". ### Mensagem: "${messageBody}" ### ORDEM DE ANÁLISE: 1. **APAGAR:** Se contiver "apagar", "excluir", etc., a intent é 'apagar_item'. Para 'deleteDetails': a. **categoria**: Primeiro, veja se a frase contém o tipo explícito ('gasto', 'entrada', 'divida', 'meta'). Se não, analise o termo de busca (ex: 'financiamento', 'salário') e infira a categoria mais provável. 'financiamento' é uma 'divida'. 'salário' é uma 'entrada'. Em último caso, assuma 'gasto'. b. **descricao**: Coloque APENAS o item a ser buscado (ex: de 'apagar financiamento do ap', a descrição é 'financiamento ap'). 2. **PAGAMENTO:** Se contiver "paguei", etc., a intent é 'registrar_pagamento'. 3. **PERGUNTA:** Use a intent 'pergunta' APENAS se for uma pergunta explícita sobre dados financeiros. 4. **GASTO:** Se não for apagar/pagar/pergunta, verifique se é um 'gasto'. 5. **ENTRADA:** Se não for gasto, verifique se é uma 'entrada'. 6. **OUTRAS:** Verifique se é 'criar_divida' ou 'criar_meta'. 7. **DESCONHECIDO:** Se não for nenhuma das anteriores. ### Bases de Conhecimento: - Mapa de Gastos: ${JSON.stringify(mapeamentoGastos)} - Mapa de Entradas: ${JSON.stringify(mapeamentoEntradas)} ### Formato de Saída: Retorne APENAS o objeto JSON, seguindo este schema: ${JSON.stringify(MASTER_SCHEMA)}`;
        
        const structuredResponse = await getStructuredResponseFromLLM(masterPrompt);
        console.log("--- RESPOSTA BRUTA DA IA ---");
        console.log(JSON.stringify(structuredResponse, null, 2));
        console.log("--------------------------");

        if (!structuredResponse || !structuredResponse.intent) {
            await msg.reply("Desculpe, não entendi o que você quis dizer.");
            return;
        };

        switch (structuredResponse.intent) {
            case 'registrar_pagamento':
                await debtHandler.startPaymentRegistration(msg, structuredResponse.pagamentoDetails);
                break;
            
            case 'gasto':
                const gasto = structuredResponse.gastoDetails;
                if (!gasto || !gasto.valor) { await msg.reply("Entendi que é um gasto, mas não identifiquei o valor."); break; }
                if (!gasto.pagamento) {
                    userStateManager.setState(senderId, { action: 'awaiting_payment_method', data: gasto });
                    await msg.reply('Entendido! E qual foi a forma de pagamento? (Crédito, Débito, PIX ou Dinheiro)');
                } else {
                    const confirmationMessage = await salvarGastoNaPlanilha(gasto, pessoa);
                    await msg.reply(confirmationMessage);
                }
                break;

            case 'entrada':
                const entrada = structuredResponse.entradaDetails;
                if (!entrada || !entrada.valor) { await msg.reply("Entendi que é uma entrada, mas não identifiquei o valor."); break; }
                if (!entrada.recebimento) {
                    userStateManager.setState(senderId, { action: 'awaiting_receipt_method', data: entrada });
                    await msg.reply('Entendido! E onde você recebeu esse valor? (Conta Corrente, Poupança, PIX ou Dinheiro)');
                } else {
                    const valorNumerico = parseFloat(entrada.valor);
                    const entradaRowData = [
                        getFormattedDate(), entrada.descricao || 'Não especificado', entrada.categoria || 'Outros',
                        valorNumerico, pessoa, entrada.recebimento,
                        entrada.recorrente || 'Não', entrada.observacoes || ''
                    ];
                    await appendRowToSheet('Entradas', entradaRowData);
                    await msg.reply(`✅ Entrada de R$${valorNumerico.toFixed(2)} registrada na categoria *${entrada.categoria}*!`);
                }
                break;

            case 'pergunta':
                await msg.reply("Analisando seus dados para responder, um momento...");
                const [saidasData, entradasData, metasData, dividasData] = await Promise.all([
                    readDataFromSheet('Saídas!A:I'), readDataFromSheet('Entradas!A:H'),
                    readDataFromSheet('Metas!A:L'), readDataFromSheet('Dívidas!A:N')
                ]);
                const contextPrompt = `Com base nos dados JSON abaixo, responda à pergunta do usuário (${pessoa}): "${structuredResponse.question || messageBody}". Hoje é ${new Date().toLocaleDateString('pt-BR')}. Dados de Saídas: ${JSON.stringify(saidasData)} Dados de Entradas: ${JSON.stringify(entradasData)} Dados de Metas: ${JSON.stringify(metasData)} Dados de Dívidas: ${JSON.stringify(dividasData)}`;
                const respostaIA = await askLLM(contextPrompt);
                await msg.reply(respostaIA);
                break;

            case 'apagar_item':
                await deletionHandler.handleDeletionRequest(msg, structuredResponse.deleteDetails);
                break;

            case 'criar_divida':
                await creationHandler.startDebtCreation(msg);
                break;

            case 'criar_meta':
                await creationHandler.startGoalCreation(msg);
                break;

            case 'desconhecido':
            default:
                const genericResponse = await askLLM(`A mensagem é de ${pessoa}. Responda de forma amigável: "${messageBody}"`);
                await msg.reply(genericResponse);
                break;
        }
    } catch (error) {
        console.error('❌ Erro fatal ao processar mensagem:', error);
        await msg.reply('Ocorreu um erro interno e a equipe de TI (o Daniel) foi notificada.');
    }
}

module.exports = { handleMessage };