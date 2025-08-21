// src/handlers/messageHandler.js

const { userMap } = require('../config/constants');
const userStateManager = require('../state/userStateManager');
const creationHandler = require('./creationHandler');
const deletionHandler = require('./deletionHandler');
const debtHandler = require('./debtHandler');
const { getStructuredResponseFromLLM, askLLM } = require('../services/gemini');
const { appendRowToSheet, readDataFromSheet, createCalendarEvent } = require('../services/google');
const { getFormattedDate } = require('../utils/helpers');
const cache = require('../utils/cache');
const rateLimiter = require('../utils/rateLimiter');
const { handleAudio } = require('./audioHandler');

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
const categoriasEntradaOficiais = ["Salário", "Renda Extra", "Investimentos", "Presente", "Reembolso", "Venda", "Outros"];
const metodosRecebimento = ["Conta Corrente", "Poupança", "Dinheiro", "PIX"];

// Schema Unificado Completo
const MASTER_SCHEMA = {
    type: "OBJECT",
    properties: {
        intent: { type: "STRING", enum: ["gasto", "entrada", "pergunta", "apagar_item", "criar_divida", "criar_meta", "registrar_pagamento", "criar_lembrete", "desconhecido"] },
            gastoDetails: {
            type: "ARRAY",
            description: "Preenchido com uma lista de objetos se a intenção for 'gasto'. CADA gasto deve ser um objeto separado no array.",
            items: {
                type: "OBJECT",
                properties: {
                    descricao: { type: "STRING" }, valor: { type: "NUMBER" }, categoria: { type: "STRING" },
                    subcategoria: { type: "STRING" }, pagamento: { type: "STRING", enum: ["Dinheiro", "Débito", "Crédito", "PIX"] },
                    recorrente: { type: "STRING", enum: ["Sim", "Não"] }, observacoes: { type: "STRING" },
                    data: { type: "STRING", description: "A data do gasto no formato DD/MM/AAAA, se mencionada." }
                }
            }
        },
        entradaDetails: {
            type: "ARRAY",
            description: "Preenchido com uma lista de objetos se a intenção for 'entrada'. CADA entrada deve ser um objeto separado no array.",
            items: {
                type: "OBJECT",
                properties: {
                    descricao: { type: "STRING" }, 
                    categoria: { type: "STRING", enum: categoriasEntradaOficiais },
                    valor: { type: "NUMBER" }, 
                    recebimento: { type: "STRING", enum: metodosRecebimento },
                    recorrente: { type: "STRING", enum: ["Sim", "Não"] }, 
                    observacoes: { type: "STRING" }
                }
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
        lembreteDetails: {
            type: "OBJECT",
            description: "Preenchido se a intenção for 'criar_lembrete'.",
            properties: {
                titulo: { type: "STRING", description: "O título do lembrete." },
                dataHora: { type: "STRING", description: "A data e hora da primeira ocorrência do lembrete no formato ISO 8601 (AAAA-MM-DDTHH:MM:SS-03:00)." },
             recorrencia: { type: "STRING", description: "A regra de recorrência no formato RRULE do iCalendar (ex: 'FREQ=MONTHLY'). Se não for recorrente, deve ser nulo." }
         }
        },
        question: { type: "STRING" }
    },
    required: ["intent"]
};

// Função reutilizável para salvar gastos
async function salvarGastoNaPlanilha(gasto, pessoa, dataParaSalvar) {
    const valorNumerico = parseFloat(gasto.valor);
    const rowData = [
        dataParaSalvar, // Usa a data correta que foi passada
        gasto.descricao || 'Não especificado',
        gasto.categoria || 'Outros',
        gasto.subcategoria || '',
        valorNumerico,
        pessoa,
        gasto.pagamento || '',
        gasto.recorrente || 'Não',
        gasto.observacoes || ''
    ];
    await appendRowToSheet('Saídas', rowData);
    return `✅ Gasto de R$${valorNumerico.toFixed(2)} registrado em *${gasto.categoria || 'Outros'} / ${gasto.subcategoria || 'N/A'}*!`;
}

// Função principal de tratamento de mensagens
async function handleMessage(msg) {
    // Verifica se a mensagem é um áudio (ptt = push to talk)
    if (msg.type === 'ptt' || msg.type === 'audio') {
        return handleAudio(msg); // Delega para o handler de áudio e encerra
    }
    if (msg.isStatus || msg.fromMe) return;

    const senderId = msg.author || msg.from;
    const pessoa = userMap[senderId] || 'Ambos';
    const messageBody = msg.body.trim();
    // --- RATE LIMITER ---
    if (!rateLimiter.isAllowed(senderId)) {
        // Opcional: Enviar uma mensagem informando o usuário.
        // Cuidado para não criar um loop. Talvez só logar no console seja melhor.
        console.log(`Usuário ${senderId} bloqueado pelo rate limit. Mensagem ignorada.`);
        return; // Interrompe a execução
    }
// --- FIM DO RATE LIMITER ---
    const cacheKey = `${senderId}:${messageBody}`;
    const cachedResponse = cache.get(cacheKey);

    if (cachedResponse) {
        console.log(`♻️ Resposta encontrada no cache para a chave: ${cacheKey}`);
        await msg.reply(cachedResponse);
        return; // Interrompe a execução aqui, pois já respondemos
    }

    const currentState = userStateManager.getState(senderId);
    if (currentState) {
        switch (currentState.action) {
            case 'awaiting_payment_amount':
                await debtHandler.finalizePaymentRegistration(msg);
                return;
            
            case 'confirming_transactions':
    if (msg.body.toLowerCase() === 'sim') {
        const { transactions, sheetName, person } = currentState.data;
        await msg.reply(`✅ Confirmado! Registrando ${transactions.length} itens...`);

        let successCount = 0;
        for (const item of transactions) {
            try {
                if (sheetName === 'Saídas') {
                    const dataDoGasto = item.data || getFormattedDate();
                    const valorNumerico = parseFloat(item.valor);
                    const rowData = [
                        dataDoGasto, item.descricao || 'Não especificado', item.categoria || 'Outros',
                        item.subcategoria || '', valorNumerico, person, item.pagamento || '',
                        item.recorrente || 'Não', item.observacoes || ''
                    ];
                    await appendRowToSheet('Saídas', rowData);
                } else { // Entradas
                    const valorNumerico = parseFloat(item.valor);
                    const rowData = [
                        getFormattedDate(), item.descricao || 'Não especificado', item.categoria || 'Outros',
                        valorNumerico, person, item.recebimento || '',
                        item.recorrente || 'Não', item.observacoes || ''
                    ];
                    await appendRowToSheet('Entradas', rowData);
                }
                successCount++;
            } catch (e) {
                console.error("Erro ao salvar item da lista:", item, e);
            }
        }
        await msg.reply(`Registro finalizado. ${successCount} de ${transactions.length} itens foram salvos com sucesso.`);

    } else {
        await msg.reply("Ok, registro cancelado.");
    }
    userStateManager.deleteState(senderId);
    return;
            
            case 'awaiting_payment_method':
                const gasto = currentState.data;
                const respostaPagamento = messageBody;
                const promptCorrecaoPagamento = `Analise a resposta: "${respostaPagamento}" e normalize-a para uma das seguintes opções: 'Crédito', 'Débito', 'PIX', 'Dinheiro'. Se impossível, retorne "Outros". Retorne APENAS a palavra correta.`;
                const pagamentoCorrigido = await askLLM(promptCorrecaoPagamento);
                gasto.pagamento = pagamentoCorrigido.trim();

                // Pega a data que salvamos no estado e passa para a função de salvar
                const confirmationMessage = await salvarGastoNaPlanilha(gasto, pessoa, gasto.dataFinal);
                
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
        const masterPrompt = `Sua tarefa é analisar a mensagem e extrair a intenção e detalhes em um JSON. A mensagem é de "${pessoa}". A data e hora atual é ${new Date().toISOString()}. ### Mensagem: "${messageBody}" ### REGRA GERAL IMPORTANTE: Se a mensagem contiver múltiplas transações (ex: 'comprei X por 10 e Y por 20'), os campos 'gastoDetails' ou 'entradaDetails' devem ser um ARRAY contendo um objeto para CADA transação individual. ### ORDEM DE ANÁLISE: 1. **CRIAR LEMBRETE:** Se contiver "lembrete", "me lembre", etc., a intent é 'criar_lembrete'. Extraia o 'titulo', a 'dataHora' da primeira ocorrência e a regra de 'recorrencia'. Para "todo dia 10", a recorrência é 'FREQ=MONTHLY;BYMONTHDAY=10'. Para "toda segunda-feira", é 'FREQ=WEEKLY;BYDAY=MO'. Se não for recorrente, a recorrência é nula. 2. **APAGAR:** ... 3. **PAGAMENTO:** ... 4. **PERGUNTA:** ... 5. **GASTO:** ... 6. **ENTRADA:** ... 7. **OUTRAS:** ... 8. **DESCONHECIDO:** ... ### Bases de Conhecimento: - Mapa de Gastos: ${JSON.stringify(mapeamentoGastos)} - Mapa de Entradas: ${JSON.stringify(mapeamentoEntradas)} ### Formato de Saída: Retorne APENAS o objeto JSON, seguindo este schema: ${JSON.stringify(MASTER_SCHEMA)}`;
        
        const structuredResponse = await getStructuredResponseFromLLM(masterPrompt);
        console.log("--- RESPOSTA BRUTA DA IA ---");
        console.log(JSON.stringify(structuredResponse, null, 2));
        console.log("--------------------------");

        if (!structuredResponse || !structuredResponse.intent) {
            await msg.reply("Desculpe, não entendi o que você quis dizer.");
            return;
        };

        switch (structuredResponse.intent) {
            case 'criar_lembrete':
                const lembrete = structuredResponse.lembreteDetails;
                if (!lembrete || !lembrete.titulo || !lembrete.dataHora) {
                    await msg.reply("Não entendi os detalhes do lembrete. Por favor, inclua o que e quando (ex: 'me lembre de pagar a luz amanhã às 10h').");
                    break;
                }
                try {
                    // Agora passamos a regra de recorrência para a função
                    await createCalendarEvent(lembrete.titulo, lembrete.dataHora, lembrete.recorrencia);
                    await msg.reply(`✅ Lembrete criado: "${lembrete.titulo}"`);
                } catch (error) {
                    await msg.reply("Houve um erro ao tentar salvar o evento na sua Agenda Google.");
                }
                break;
            case 'registrar_pagamento':
                await debtHandler.startPaymentRegistration(msg, structuredResponse.pagamentoDetails);
                break;
            
            case 'gasto':
                let gastos = structuredResponse.gastoDetails;
                if (!gastos || gastos.length === 0) {
                    await msg.reply("Entendi que é um gasto, mas não identifiquei os detalhes (valor, descrição).");
                    break;
                }

                // Garante que 'gastos' seja sempre um array para tratar tudo igual
                if (!Array.isArray(gastos)) {
                    gastos = [gastos];
                }

                // Se for só um gasto e faltar o pagamento, usa o fluxo antigo
                if (gastos.length === 1 && !gastos[0].pagamento) {
                    const gasto = gastos[0];
                    const dataDoGasto = gasto.data ? gasto.data : getFormattedDate();
                    gasto.dataFinal = dataDoGasto;
                    userStateManager.setState(senderId, { action: 'awaiting_payment_method', data: gasto });
                    await msg.reply('Entendido! E qual foi a forma de pagamento? (Crédito, Débito, PIX ou Dinheiro)');
                    break;
                }

                // Se tiver múltiplos gastos ou um gasto já completo, inicia a confirmação
                let confirmationMessage = `Encontrei ${gastos.length} gasto(s) para registrar:\n\n`;
                gastos.forEach((gasto, index) => {
                    confirmationMessage += `*${index + 1}.* ${gasto.descricao} - *R$${gasto.valor}* (${gasto.pagamento || 'a definir'})\n`;
                });
                confirmationMessage += "\nVocê confirma o registro de todos os itens? Responda com *'sim'* ou *'não'*."

                userStateManager.setState(senderId, {
                    action: 'confirming_transactions',
                    data: {
                        transactions: gastos,
                        sheetName: 'Saídas',
                        person: pessoa
                    }
                });

                await msg.reply(confirmationMessage);
                break;

            case 'entrada':
                let entradas = structuredResponse.entradaDetails;
                if (!entradas || entradas.length === 0) {
                    await msg.reply("Entendi que é uma entrada, mas não identifiquei os detalhes (valor, descrição).");
                    break;
                }

                if (!Array.isArray(entradas)) {
                    entradas = [entradas];
                }

                if (entradas.length === 1 && !entradas[0].recebimento) {
                    userStateManager.setState(senderId, { action: 'awaiting_receipt_method', data: entradas[0] });
                    await msg.reply('Entendido! E onde você recebeu esse valor? (Conta Corrente, Poupança, PIX ou Dinheiro)');
                    break;
                }

                let entradaConfMessage = `Encontrei ${entradas.length} entrada(s) para registrar:\n\n`;
                entradas.forEach((entrada, index) => {
                    entradaConfMessage += `*${index + 1}.* ${entrada.descricao} - *R$${entrada.valor}* (${entrada.recebimento || 'a definir'})\n`;
                });
                entradaConfMessage += "\nVocê confirma o registro de todos os itens? Responda com *'sim'* ou *'não'*."

                userStateManager.setState(senderId, {
                    action: 'confirming_transactions',
                    data: {
                        transactions: entradas,
                        sheetName: 'Entradas',
                        person: pessoa
                    }
                });

                await msg.reply(entradaConfMessage);
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
                cache.set(cacheKey, respostaIA);
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
                cache.set(cacheKey, genericResponse);
                break;
        }
    } catch (error) {
        console.error('❌ Erro fatal ao processar mensagem:', error);
        await msg.reply('Ocorreu um erro interno e a equipe de TI (o Daniel) foi notificada.');
    }
}

module.exports = { handleMessage };