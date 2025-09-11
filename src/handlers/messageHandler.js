// src/handlers/messageHandler.js

const { userMap, sheetCategoryMap, creditCardConfig  } = require('../config/constants');
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
const { normalizeText } = require('../utils/helpers');
const analysisService = require('../services/analysisService');
const { parseSheetDate } = require('../utils/helpers');
const { classify } = require('../ai/intentClassifier');
const { execute } = require('../services/calculationOrchestrator');
const { generate } = require('../ai/responseGenerator');
const { getFormattedDateOnly } = require('../utils/helpers');
const stringSimilarity = require('string-similarity');

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
            case 'awaiting_installment_confirmation': {
                const { gasto, cardInfo } = currentState.data;
                const resposta = normalizeText(msg.body);

                if (resposta === 'sim') {
                    // Se for parcelado, pergunta o número de vezes
                    userStateManager.setState(senderId, {
                        action: 'awaiting_installment_number',
                        data: { gasto, cardInfo }
                    });
                    await msg.reply("Em quantas vezes?");
                } else {
                    // Se não for parcelado, lança como 1/1 e finaliza
                    try {
                        // ... (A lógica de calcular o mês e salvar UMA linha vai aqui, igual a que tínhamos antes)
                        // ... você pode copiar e colar a lógica do case antigo aqui ...
                        await msg.reply(`✅ Gasto de R$${gasto.valor} lançado no *${cardInfo.sheetName}* (fatura de ...).`);
                    } catch (error) {
                        // ...
                    } finally {
                        userStateManager.deleteState(senderId);
                    }
                }
                return;
            }

            case 'awaiting_installment_number': {
                const { gasto, cardInfo } = currentState.data;
                const installments = parseInt(msg.body.trim(), 10);

                if (isNaN(installments) || installments < 1) {
                    await msg.reply("Número inválido. Por favor, digite um número a partir de 1.");
                    return;
                }

                try {
                    // Se for 1 parcela (à vista)
                    if (installments === 1) {
                        // Lógica para salvar uma única linha
                        const purchaseDate = gasto.data ? parseSheetDate(gasto.data) : new Date();
                        let billingMonth = purchaseDate.getMonth();
                        let billingYear = purchaseDate.getFullYear();

                        if (purchaseDate.getDate() > cardInfo.closingDay) {
                            billingMonth += 1;
                            if (billingMonth > 11) {
                                billingMonth = 0;
                                billingYear += 1;
                            }
                        }
                        const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
                        const billingMonthName = `${monthNames[billingMonth]} de ${billingYear}`;

                        const rowData = [
                            getFormattedDateOnly(purchaseDate),
                            gasto.descricao,
                            gasto.categoria || 'Outros',
                            parseFloat(gasto.valor),
                            '1/1',
                            billingMonthName
                        ];
                        
                        await appendRowToSheet(cardInfo.sheetName, rowData);
                        await msg.reply(`✅ Gasto de R$${gasto.valor} lançado no *${cardInfo.sheetName}* (fatura de ${billingMonthName}).`);

                    } else {
                        // Se for mais de 1 parcela, executa o loop
                        const installmentValue = parseFloat(gasto.valor) / installments;
                        const purchaseDate = gasto.data ? parseSheetDate(gasto.data) : new Date();

                        for (let i = 1; i <= installments; i++) {
                            // ... (lógica de cálculo de mês da fatura para cada parcela, como já tínhamos) ...
                             let billingMonth = purchaseDate.getMonth();
                             let billingYear = purchaseDate.getFullYear();

                             if (purchaseDate.getDate() > cardInfo.closingDay) {
                                 billingMonth += 1;
                             }
                             
                             billingMonth += (i - 1); 

                             while (billingMonth > 11) {
                                 billingMonth -= 12;
                                 billingYear += 1;
                             }

                             const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
                             const billingMonthName = `${monthNames[billingMonth]} de ${billingYear}`;

                             const rowData = [
                                 getFormattedDateOnly(purchaseDate),
                                 gasto.descricao,
                                 gasto.categoria || 'Outros',
                                 installmentValue.toFixed(2),
                                 `${i}/${installments}`,
                                 billingMonthName
                             ];
                             
                             await appendRowToSheet(cardInfo.sheetName, rowData);
                        }
                        await msg.reply(`✅ Gasto de R$${gasto.valor} lançado em ${installments}x de R$${installmentValue.toFixed(2)} no *${cardInfo.sheetName}*.`);
                    }

                } catch (error) {
                    console.error("Erro ao salvar parcelamento:", error);
                    await msg.reply("Ocorreu um erro ao salvar o gasto.");
                } finally {
                    userStateManager.deleteState(senderId);
                }
                return;
            }
            case 'awaiting_credit_card_selection': {
                const { gasto, cardOptions } = currentState.data;
                const selection = parseInt(msg.body.trim(), 10) - 1;

                if (selection >= 0 && selection < cardOptions.length) {
                    const cardKey = cardOptions[selection];
                    const cardInfo = creditCardConfig[cardKey];

                    // **MUDANÇA AQUI:** Define o estado e faz a pergunta direta
                    userStateManager.setState(senderId, {
                        action: 'awaiting_installment_number', // Vai direto para o estado de número de parcelas
                        data: { gasto, cardInfo }
                    });
                    await msg.reply("Em quantas parcelas? (digite `1` se for à vista)");

                } else {
                    await msg.reply("Opção inválida. Por favor, responda apenas com um dos números da lista.");
                }
                return;
            }
            case 'awaiting_payment_amount':
                await debtHandler.finalizePaymentRegistration(msg);
                return;
            
            case 'confirming_transactions':
    const cleanReply = normalizeText(msg.body.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"")).trim();
    if (cleanReply === 'sim') {
        const { transactions, sheetName, person } = currentState.data;
        await msg.reply(`✅ Confirmado! Registrando ${transactions.length} itens...`);

        let successCount = 0;
        for (const item of transactions) {
            try {
                const sheetName = item.type; // Pega o nome da aba do próprio item
                if (sheetName === 'Saídas') {
                    const dataDoGasto = item.data || getFormattedDate();
                    const rowData = [
                        dataDoGasto, item.descricao || 'Não especificado', item.categoria || 'Outros',
                        item.subcategoria || '', parseFloat(item.valor), person, item.pagamento || '',
                        item.recorrente || 'Não', item.observacoes || ''
                    ];
                    await appendRowToSheet('Saídas', rowData);
                } else if (sheetName === 'Entradas') {
                    const dataDaEntrada = item.data || getFormattedDate();
                    const rowData = [
                        dataDaEntrada,
                        item.descricao || 'Não especificado',
                        item.categoria || 'Outros',
                        parseFloat(item.valor),
                        person,
                        item.recebimento || '',
                        item.recorrente || 'Não',
                        item.observacoes || ''
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
        const masterPrompt = `Sua tarefa é analisar a mensagem e extrair a intenção e detalhes em um JSON. A data e hora atual é ${new Date().toISOString()}.

### ORDEM DE ANÁLISE OBRIGATÓRIA:
1.  **É UMA PERGUNTA?** Se a mensagem for uma pergunta (iniciar com "Qual", "Quanto", "Liste", "Me mostre", etc.), a intenção é OBRIGATORIAMENTE 'pergunta'. O campo 'question' deve conter a pergunta completa. NÃO prossiga para outras intenções.
2.  **É UM REGISTRO DE TRANSAÇÃO?** Se NÃO for uma pergunta, verifique se é um 'gasto' ou 'entrada'. Palavras como "recebi", "ganhei" indicam 'entrada'. Se contiver múltiplas transações (ex: 'comprei X e Y'), os campos 'gastoDetails' ou 'entradaDetails' devem ser um ARRAY com um objeto para CADA transação.
3.  **OUTRAS INTENÇÕES:** Se não for nenhum dos acima, verifique as outras intenções como 'apagar_item', 'criar_lembrete', etc.

### REGRAS ADICIONAIS:
- **DATAS:** Se o usuário mencionar uma data (ontem, hoje, dia 20, em agosto), converta para o formato DD/MM/AAAA. Hoje é ${new Date().toLocaleDateString('pt-BR')}. Se nenhuma data for mencionada em uma PERGUNTA, a análise deve considerar todos os registros.

### Mensagem do usuário ("${pessoa}"): "${messageBody}"

### Bases de Conhecimento:
- Mapa de Gastos: ${JSON.stringify(mapeamentoGastos)}
- Mapa de Entradas: ${JSON.stringify(mapeamentoEntradas)}

### Formato de Saída:
Retorne APENAS o objeto JSON, seguindo este schema: ${JSON.stringify(MASTER_SCHEMA)}`;
        
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
            case 'entrada': {
                const gastos = structuredResponse.gastoDetails || [];
                const entradas = structuredResponse.entradaDetails || [];
                const allTransactions = [];

                if (gastos.length > 0) {
                    gastos.forEach(g => allTransactions.push({ ...g, type: 'Saídas' }));
                }
                if (entradas.length > 0) {
                    entradas.forEach(e => allTransactions.push({ ...e, type: 'Entradas' }));
                }

                // Se não encontrou transações, avisa o usuário.
                if (allTransactions.length === 0) {
                    await msg.reply(`Entendi a intenção, mas não identifiquei os detalhes (valor, descrição).`);
                    break;
                }

                // **INÍCIO DA LÓGICA REESTRUTURADA**
                if (allTransactions.length === 1) {
                    const item = allTransactions[0];
                    const pagamento = normalizeText(item.pagamento || '');

                    // PRIORIDADE MÁXIMA: É um gasto no cartão de crédito?
                    if (item.type === 'Saídas' && pagamento === 'credito') {
                        // **INÍCIO DA NOVA LÓGICA DE LISTA NUMERADA**
                        const cardOptions = Object.keys(creditCardConfig);
                        let question = `Entendi, o gasto foi no crédito. Em qual cartão? Responda com o número:\n\n`;
                        cardOptions.forEach((cardName, index) => {
                            question += `${index + 1}. ${cardName}\n`;
                        });

                        userStateManager.setState(senderId, {
                            action: 'awaiting_credit_card_selection', // Novo estado
                            data: {
                                gasto: item,
                                cardOptions: cardOptions // Armazena a lista de opções no estado
                            }
                        });

                        await msg.reply(question);
                        break;
                    }

                    // 2. Se não for crédito, verifica se falta o método de pagamento
                    if (item.type === 'Saídas' && !item.pagamento) {
                        // ... (código antigo para 'awaiting_payment_method' - já está correto)
                        break;
                    }

                    // 3. Se não for crédito, verifica se falta o método de recebimento
                    if (item.type === 'Entradas' && !item.recebimento) {
                        // ... (código antigo para 'awaiting_receipt_method' - já está correto)
                        break;
                    }
                }
                
                // 4. Se chegou até aqui, é uma transação múltipla OU uma transação única já completa (que não é de crédito)
                // Pede a confirmação final
                let confirmationMessage = `Encontrei ${allTransactions.length} transa...`;
                // ... (código antigo para 'confirming_transactions' - já está correto)
                await msg.reply(confirmationMessage);

                break;
            }
            case 'pergunta': {
                await msg.reply("Analisando seus dados para responder, um momento...");
                
                // 1. Coletar dados de todas as planilhas
                const [saidasData, entradasData, metasData, dividasData] = await Promise.all([
                    readDataFromSheet('Saídas!A:I'), 
                    readDataFromSheet('Entradas!A:H'),
                    readDataFromSheet('Metas!A:L'), 
                    readDataFromSheet('Dívidas!A:N')
                ]);

                const userQuestion = structuredResponse.question || messageBody;
                
                let respostaFinal = '';
                try {
                    // 2. Classificar a intenção
                    const intentClassification = await classify(userQuestion);
                    console.log('Classificação da intenção:', intentClassification);
                    
                    // 3. Executar o cálculo
                    const analyzedData = await execute(
                        intentClassification.intent,
                        intentClassification.parameters,
                        {
                            saidas: saidasData,
                            entradas: entradasData,
                            metas: metasData,
                            dividas: dividasData
                        }
                    );

                    // 4. Gerar a resposta final
                    respostaFinal = await generate({
                        userQuestion,
                        intent: intentClassification.intent,
                        rawResults: analyzedData.results,
                        details: analyzedData.details,
                        dateContext: {
                            currentMonth: new Date().getMonth(),
                            currentYear: new Date().getFullYear()
                        }
                    });
                
                } catch (err) {
                    console.error("Erro no novo sistema de perguntas:", err);
                    respostaFinal = "Desculpe, não consegui processar essa análise. Tente reformular a pergunta.";
                }

                cache.set(cacheKey, respostaFinal);
                await msg.reply(respostaFinal);
                break;
            }

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
                // Não responde a mensagens desconhecidas para evitar loops
                console.log(`Intenção desconhecida para a mensagem: "${messageBody}". Nenhuma resposta enviada.`);
                break;
        }
    } catch (error) {
        console.error('❌ Erro fatal ao processar mensagem:', error);
        await msg.reply('Ocorreu um erro interno e a equipe de TI (o Daniel) foi notificada.');
    }
}

module.exports = { handleMessage };