const { userMap, sheetCategoryMap, creditCardConfig } = require('../config/constants');
const userStateManager = require('../state/userStateManager');
const creationHandler = require('./creationHandler');
const deletionHandler = require('./deletionHandler');
const debtHandler = require('./debtHandler');
const { getStructuredResponseFromLLM, askLLM } = require('../services/gemini');
const { appendRowToSheet, readDataFromSheet, createCalendarEvent } = require('../services/google');
const { getFormattedDate, getFormattedDateOnly, normalizeText, parseSheetDate, parseAmount } = require('../utils/helpers');
const cache = require('../utils/cache');
const rateLimiter = require('../utils/rateLimiter');
const { handleAudio } = require('./audioHandler');
const { classify } = require('../ai/intentClassifier');
const { execute } = require('../services/calculationOrchestrator');
const { generate } = require('../ai/responseGenerator');

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
        intent: { type: "STRING", enum: ["gasto", "entrada", "pergunta", "apagar_item", "criar_divida", "criar_meta", "registrar_pagamento", "criar_lembrete", "ajuda","desconhecido"] },
        gastoDetails: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    descricao: { type: "STRING" }, valor: { type: "NUMBER" }, categoria: { type: "STRING" },
                    subcategoria: { type: "STRING" }, pagamento: { type: "STRING", enum: ["Dinheiro", "Débito", "Crédito", "PIX"] },
                    recorrente: { type: "STRING", enum: ["Sim", "Não"] }, observacoes: { type: "STRING" },
                    data: { type: "STRING" }
                }
            }
        },
        entradaDetails: {
            type: "ARRAY",
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
        deleteDetails: { type: "OBJECT", properties: { descricao: { type: "STRING" }, categoria: { type: "STRING" } } },
        pagamentoDetails: { type: "OBJECT", properties: { descricao: { type: "STRING" } } },
        lembreteDetails: { type: "OBJECT", properties: { titulo: { type: "STRING" }, dataHora: { type: "STRING" }, recorrencia: { type: "STRING" } } },
        question: { type: "STRING" }
    },
    required: ["intent"]
};

const processedMessages = new Set();

async function handleMessage(msg) {
    const messageId = msg.id.id;
    if (processedMessages.has(messageId)) {
        console.log(`Mensagem duplicada ignorada: ${messageId}`);
        return;
    }

    // Se a mensagem for de áudio, processa primeiro.
    // Se não for, o processamento normal continua com o corpo original.
    if (msg.type === 'ptt' || msg.type === 'audio') {
        const transcribedText = await handleAudio(msg);
        if (!transcribedText) return; // Se a transcrição falhar, para aqui.
        
        msg.body = transcribedText; // Atualiza o corpo da mensagem com o texto!
    }

    processedMessages.add(messageId);
    setTimeout(() => processedMessages.delete(messageId), 300000); // 5 minutos

    if (msg.isStatus || msg.fromMe) return;

    const senderId = msg.author || msg.from;
    const pessoa = userMap[senderId] || 'Ambos';
    const messageBody = msg.body.trim();

    if (!rateLimiter.isAllowed(senderId)) {
        console.log(`Usuário ${senderId} bloqueado pelo rate limit.`);
        return;
    }

    const cacheKey = `${senderId}:${messageBody}`;
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
        await msg.reply(cachedResponse);
        return;
    }

    const currentState = userStateManager.getState(senderId);
    if (currentState) {
        // --- INÍCIO DA MÁQUINA DE ESTADOS (CONVERSAS EM ANDAMENTO) ---
        // Se existe uma conversa em andamento, o bot lida com ela e PARA AQUI.
        switch (currentState.action) {
            case 'awaiting_credit_card_selection': {
                const { gasto, cardOptions } = currentState.data;
                const selection = parseInt(msg.body.trim(), 10) - 1;

                if (selection >= 0 && selection < cardOptions.length) {
                    const cardKey = cardOptions[selection];
                    const cardInfo = creditCardConfig[cardKey];

                    userStateManager.setState(senderId, {
                        action: 'awaiting_installment_number',
                        data: { gasto, cardInfo }
                    });
                    await msg.reply("Em quantas parcelas? (digite `1` se for à vista)");
                } else {
                    await msg.reply("Opção inválida. Por favor, responda apenas com um dos números da lista.");
                }
                return;
            }

            case 'awaiting_installment_number': {
                const { gasto, cardInfo } = currentState.data;
                const installments = await parseAmount(msg.body.trim());

                if (isNaN(installments) || installments < 1) {
                    await msg.reply("Número inválido. Por favor, digite um número a partir de 1.");
                    return;
                }

                try {
                    const purchaseDate = gasto.data ? parseSheetDate(gasto.data) : new Date();
                    if (installments === 1) {
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
                            getFormattedDateOnly(purchaseDate), gasto.descricao, gasto.categoria || 'Outros',
                            parseFloat(gasto.valor), '1/1', billingMonthName
                        ];
                        
                        await appendRowToSheet(cardInfo.sheetName, rowData);
                        await msg.reply(`✅ Gasto de R$${gasto.valor} lançado no *${cardInfo.sheetName}* (fatura de ${billingMonthName}).`);
                    } else {
                        const installmentValue = parseFloat(gasto.valor) / installments;
                        for (let i = 1; i <= installments; i++) {
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
                                 getFormattedDateOnly(purchaseDate), gasto.descricao, gasto.categoria || 'Outros',
                                 String(installmentValue.toFixed(2)).replace('.',','), `${i}/${installments}`, billingMonthName
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

            // Outros estados de conversa que você já tinha
            case 'awaiting_payment_method': {
                const { gasto } = currentState.data; // A data já está dentro do objeto 'gasto'
                const respostaPagamento = messageBody;
                const dataFinal = gasto.data || getFormattedDateOnly(); // Usar a data do gasto, ou a de hoje como fallback

                // Se a resposta for crédito, inicia o fluxo do cartão
                if (normalizeText(respostaPagamento) === 'credito') {
                    const cardOptions = Object.keys(creditCardConfig);
                    let question = `Ok, crédito. Em qual cartão? Responda com o número:\n\n`;
                    cardOptions.forEach((cardName, index) => {
                        question += `${index + 1}. ${cardName}\n`;
                    });
                    userStateManager.setState(senderId, {
                        action: 'awaiting_credit_card_selection',
                        data: { gasto: { ...gasto, pagamento: 'Crédito' }, cardOptions }
                    });
                    await msg.reply(question);
                    return;
                }

                // Se for outro método, salva direto
                const promptCorrecaoPagamento = `
                Sua tarefa é normalizar a forma de pagamento informada pelo usuário.
                A resposta DEVE ser uma das seguintes opções: 'Débito', 'Crédito', 'PIX', 'Dinheiro'.

                Analise a resposta do usuário e faça a correspondência:
                - Se for 'd', 'deb', 'cartao de debito', a resposta é 'Débito'.
                - Se for 'c', 'cred', 'cartao de credito', a resposta é 'Crédito'.
                - Se for 'p', 'px', 'pics', a resposta é 'PIX'.
                - Se for 'din', 'vivo', 'especie', a resposta é 'Dinheiro'.

                Se não for possível determinar, retorne 'PIX' como padrão.

                NÃO forneça nenhuma explicação. Retorne APENAS a palavra final.

                Resposta do usuário: "${respostaPagamento}"
                `;
                const pagamentoCorrigido = await askLLM(promptCorrecaoPagamento);
                gasto.pagamento = pagamentoCorrigido.trim();

                const valorNumerico = parseFloat(gasto.valor);
                const rowData = [
                    dataFinal, gasto.descricao || 'Não especificado', gasto.categoria || 'Outros',
                    gasto.subcategoria || '', valorNumerico, pessoa, gasto.pagamento,
                    gasto.recorrente || 'Não', gasto.observacoes || ''
                ];
                await appendRowToSheet('Saídas', rowData);

                // MENSAGEM DE SUCESSO MELHORADA
                await msg.reply(`✅ Gasto de R$${valorNumerico.toFixed(2)} (${gasto.descricao}) registrado como *${gasto.pagamento}* para a data de *${dataFinal}*!`);
                userStateManager.deleteState(senderId);
                return;
            }

            case 'awaiting_receipt_method': {
                const entrada = currentState.data;
                const metodoRecebimento = msg.body.trim();
                const pessoa = userMap[senderId] || 'Ambos';

                // Usamos a IA para normalizar a resposta do usuário
                const promptCorrecaoRecebimento = `Analise a resposta: "${metodoRecebimento}" e normalize-a para 'Conta Corrente', 'Poupança', 'PIX' ou 'Dinheiro'. Se impossível, retorne 'PIX'. Retorne APENAS a palavra correta.`;
                const recebimentoCorrigido = await askLLM(promptCorrecaoRecebimento);
                entrada.recebimento = recebimentoCorrigido.trim();

                const dataDaEntrada = entrada.data || getFormattedDateOnly();
                const valorNumerico = parseFloat(entrada.valor);

                const rowData = [
                    dataDaEntrada, entrada.descricao || 'Não especificado',
                    entrada.categoria || 'Outros', valorNumerico, pessoa,
                    entrada.recebimento, entrada.recorrente || 'Não', entrada.observacoes || ''
                ];

                await appendRowToSheet('Entradas', rowData);
                await msg.reply(`✅ Entrada de R$${valorNumerico.toFixed(2)} (${entrada.descricao}) registrada como *${entrada.recebimento}* para a data de *${dataDaEntrada}*!`);
                userStateManager.deleteState(senderId);
                return;
            }

            case 'creating_goal': {
                await creationHandler.handleGoalCreation(msg);
                return;
            }

            case 'creating_debt': {
                await creationHandler.handleDebtCreation(msg);
                return;
            }

            case 'awaiting_payment_amount': {
                await debtHandler.finalizePaymentRegistration(msg);
                return;
            }

            case 'confirming_delete': {
                await deletionHandler.confirmDeletion(msg);
                return;
            }

            case 'confirming_transactions': {
                const cleanReply = normalizeText(msg.body);
                if (cleanReply === 'sim') {
                    // Agora, em vez de registrar, vamos para a próxima etapa
                    const { transactions } = currentState.data;
                    userStateManager.setState(senderId, {
                        action: 'awaiting_batch_payment_method',
                        data: { transactions } // Passamos as transações para o próximo estado
                    });
                    await msg.reply("Ótimo! E como esses itens foram pagos? (Crédito, Débito, PIX ou Dinheiro)");
                } else {
                    await msg.reply("Ok, registro cancelado.");
                    userStateManager.deleteState(senderId);
                }
                return; // Importante para esperar a próxima resposta do usuário
            }

            case 'awaiting_batch_payment_method': {
                const { transactions } = currentState.data;
                const respostaPagamento = msg.body.trim();
                const person = userMap[senderId] || 'Ambos';

                // Reutilizamos nosso prompt inteligente para normalizar a resposta de pagamento
                const promptCorrecaoPagamento = `
                Sua tarefa é normalizar a forma de pagamento informada pelo usuário.
                A resposta DEVE ser uma das seguintes opções: 'Débito', 'Crédito', 'PIX', 'Dinheiro'.

                Analise a resposta do usuário e faça a correspondência:
                - Se for 'd', 'deb', 'cartao de debito', a resposta é 'Débito'.
                - Se for 'c', 'cred', 'cartao de credito', a resposta é 'Crédito'.
                - Se for 'p', 'px', 'pics', a resposta é 'PIX'.
                - Se for 'din', 'vivo', 'especie', a resposta é 'Dinheiro'.

                Se não for possível determinar, retorne 'PIX' como padrão.

                NÃO forneça nenhuma explicação. Retorne APENAS a palavra final.

                Resposta do usuário: "${respostaPagamento}"
                `;
                const pagamentoCorrigido = await askLLM(promptCorrecaoPagamento);
                const pagamentoFinal = pagamentoCorrigido.trim();

                // Uma verificação de segurança: o fluxo de crédito é complexo (pede cartão, parcelas, etc.).
                // Por isso, é melhor tratar múltiplos itens no crédito de forma individual.
                if (normalizeText(pagamentoFinal) === 'credito') {
                    const cardOptions = Object.keys(creditCardConfig);
                    let question = `Ok, crédito. Em qual cartão? Responda com o número:\n\n`;
                    cardOptions.forEach((cardName, index) => {
                        question += `${index + 1}. ${cardName}\n`;
                    });

                    userStateManager.setState(senderId, {
                        action: 'awaiting_credit_card_selection_batch', // Novo estado!
                        data: { transactions }
                    });
                    await msg.reply(question);
                    return;
                }

                await msg.reply(`✅ Entendido, ${pagamentoFinal}! Registrando ${transactions.length} itens...`);
                let successCount = 0;
                for (const item of transactions) {
                    try {
                        const sheetName = item.type; // 'Saídas' ou 'Entradas'
                        let rowData = [];

                        // Adiciona a forma de pagamento que acabamos de receber
                        item.pagamento = pagamentoFinal;
                        item.recebimento = pagamentoFinal;

                        if (sheetName === 'Saídas') {
                            const dataDoGasto = item.data ? parseSheetDate(item.data) : new Date();
                            rowData = [
                                getFormattedDateOnly(dataDoGasto), item.descricao || 'Não especificado', item.categoria || 'Outros',
                                item.subcategoria || '', parseFloat(item.valor), person, item.pagamento || '',
                                item.recorrente || 'Não', item.observacoes || ''
                            ];
                        } else if (sheetName === 'Entradas') {
                            const dataDaEntrada = item.data ? parseSheetDate(item.data) : new Date();
                            rowData = [
                                getFormattedDateOnly(dataDaEntrada), item.descricao || 'Não especificado',
                                item.categoria || 'Outros', parseFloat(item.valor), person,
                                item.recebimento || '', item.recorrente || 'Não', item.observacoes || ''
                            ];
                        }
                        
                        if (rowData.length > 0) {
                            await appendRowToSheet(sheetName, rowData);
                            successCount++;
                        }
                    } catch (e) {
                        console.error("Erro CRÍTICO ao salvar item da lista (batch):", item, e);
                        await msg.reply(`Houve um erro ao tentar salvar o item "${item.descricao}".`);
                    }
                }

                await msg.reply(`Registro finalizado. ${successCount} de ${transactions.length} itens foram salvos com sucesso.`);
                userStateManager.deleteState(senderId);
                return;
            }

            case 'awaiting_credit_card_selection_batch': {
                const { transactions } = currentState.data;
                const cardOptions = Object.keys(creditCardConfig);
                const selection = parseInt(msg.body.trim(), 10) - 1;

                if (selection >= 0 && selection < cardOptions.length) {
                    const cardKey = cardOptions[selection];
                    const cardInfo = creditCardConfig[cardKey];

                    userStateManager.setState(senderId, {
                        action: 'awaiting_installments_batch', // Próximo novo estado!
                        data: { transactions, cardInfo }
                    });

                    let question = `Entendido, no cartão *${cardInfo.sheetName}*. E as parcelas?\n\n`;
                    question += `*1.* Se foi tudo à vista (ou 1x), digite \`1\`.\n`;
                    question += `*2.* Se todos tiveram o mesmo nº de parcelas, digite o número (ex: \`3\`)\n`;
                    question += `*3.* Se foram parcelas diferentes, me diga quais (ex: \`${transactions[0].descricao} em 3x, o resto à vista\`).`;
                    await msg.reply(question);

                } else {
                    await msg.reply("Opção inválida. Por favor, responda apenas com um dos números da lista.");
                }
                return;
            }

            case 'awaiting_installments_batch': {
                const { transactions, cardInfo } = currentState.data;
                const userReply = msg.body.trim();
                const installments = parseInt(userReply, 10);

                let installmentMap = {};

                // Se a resposta for um número simples, cria um mapa com esse número para todos.
                if (!isNaN(installments) && installments > 0) {
                    transactions.forEach(t => installmentMap[normalizeText(t.descricao)] = installments);
                } else {
                    // Se for texto, pedimos ajuda para a IA mapear
                    await msg.reply("Ok, entendi que são parcelas diferentes. Estou analisando sua resposta para aplicar corretamente...");
                    const descricoes = transactions.map(t => t.descricao);
                    const promptMapeamento = `
                        Sua tarefa é analisar a resposta do usuário e mapear o número de parcelas para cada item de uma lista.
                        Itens disponíveis: ${JSON.stringify(descricoes)}.
                        Resposta do usuário: "${userReply}".

                        Regras:
                        - "à vista", "1x", "uma vez" significa 1 parcela.
                        - "o resto", "os outros" se aplica a todos os itens que não foram explicitamente mencionados. Se nada mais for mencionado, aplica-se a todos.
                        - Retorne APENAS um objeto JSON no formato {"nome do item": numero_de_parcelas}.

                        Exemplo:
                        - Itens: ["ifood", "farmacia"]
                        - Resposta: "ifood em 2x, o resto a vista"
                        - Saída JSON: {"ifood": 2, "farmacia": 1}
                    `;
                    const mappedInstallments = await getStructuredResponseFromLLM(promptMapeamento);
                    // Normalizamos as chaves do objeto retornado pela IA para garantir a correspondência
                    if (mappedInstallments) {
                        for (const key in mappedInstallments) {
                            installmentMap[normalizeText(key)] = mappedInstallments[key];
                        }
                    }
                }

                if (Object.keys(installmentMap).length === 0) {
                    await msg.reply("Não consegui entender a divisão das parcelas. Vamos cancelar e você pode tentar de novo, ok?");
                    userStateManager.deleteState(senderId);
                    return;
                }

                await msg.reply(`Perfeito! Registrando ${transactions.length} gastos no cartão *${cardInfo.sheetName}*...`);

                // A partir daqui, a lógica de salvar é a mesma, mas dentro de um loop
                for (const gasto of transactions) {
                    const descNormalizada = normalizeText(gasto.descricao);
                    const numParcelas = installmentMap[descNormalizada] || 1; // Se a IA não mapear um, assume 1x

                    const installmentValue = parseFloat(gasto.valor) / numParcelas;
                    const purchaseDate = gasto.data ? parseSheetDate(gasto.data) : new Date();

                    for (let i = 1; i <= numParcelas; i++) {
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
                            getFormattedDateOnly(purchaseDate), gasto.descricao, gasto.categoria || 'Outros',
                            installmentValue.toFixed(2), `${i}/${numParcelas}`, billingMonthName
                        ];
                        
                        await appendRowToSheet(cardInfo.sheetName, rowData);
                    }
                }

                await msg.reply(`✅ Lançamentos no crédito finalizados com sucesso!`);
                userStateManager.deleteState(senderId);
                return;
            }
        }
    } else {
        // --- INÍCIO DA ANÁLISE DE NOVOS COMANDOS ---
        console.log(`Mensagem de ${pessoa} (${senderId}): "${messageBody}"`);
        try {
            // CÓDIGO PARA SUBSTITUIR (APENAS A CONSTANTE masterPrompt)

            const masterPrompt = `Sua tarefa é analisar a mensagem e extrair a intenção e detalhes em um JSON. A data e hora atual é ${new Date().toISOString()}.

            ### ORDEM DE ANÁLISE OBRIGATÓRIA:
            1.  **É UM PEDIDO DE AJUDA?** Se o usuário perguntar o que você faz, quais são seus comandos, ou pedir ajuda, a intenção é OBRIGATORIAMENTE 'ajuda'.
            2.  **É UM PAGAMENTO DE DÍVIDA?** Se a mensagem indicar o pagamento de uma conta ou dívida existente (ex: "paguei o financiamento", "registre o pagamento da fatura", "paguei a parcela do carro"), a intenção é OBRIGATORIAMENTE 'registrar_pagamento'.
            3.  **É UM PEDIDO DE EXCLUSÃO?** Se a mensagem for para apagar algo, a intenção é 'apagar_item'.
            4.  **É UMA PERGUNTA DE ANÁLISE?** Se a mensagem for uma pergunta sobre dados (iniciar com "Qual", "Quanto", "Liste", etc.), a intenção é OBRIGATORIAMENTE 'pergunta'.
            5.  **É UM REGISTRO DE TRANSAÇÃO GERAL?** Se não for nenhum dos acima, verifique se é um 'gasto' ou 'entrada' novo.
            6.  **OUTRAS INTENÇÕES:** Se não for nenhum dos acima, verifique as outras intenções (criar meta, etc).

            ### REGRAS PARA A INTENÇÃO 'apagar_item':
            - O campo 'deleteDetails.descricao' deve ser o texto do item a ser apagado (ex: "uber", "pão").
            - Se o usuário disser "último" (ex: "apagar último gasto"), a 'descricao' DEVE ser a palavra "ultimo".
            - O campo 'deleteDetails.categoria' DEVE ser o TIPO do item a ser apagado (ex: "gasto", "saida", "entrada", "divida", "meta"). NÃO use categorias financeiras como "Alimentação".

            ### REGRAS GERAIS:
            - **DATAS:** Se o usuário mencionar uma data, converta para DD/MM/AAAA. Hoje é ${new Date().toLocaleDateString('pt-BR')}.
            - **CORREÇÃO E PADRONIZAÇÃO:** Para gastos/entradas, use as bases de conhecimento para encontrar a categoria correta e corrija erros de digitação.
            - **NÃO FAÇA SUPOSIÇÕES:** Não presuma informações que não estejam EXPLICITAMENTE na mensagem.

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

            if (structuredResponse && structuredResponse.error) {
            await msg.reply("A conexão com a IA está instável no momento. Por favor, tente novamente em alguns instantes.");
            return;
        }

        if (!structuredResponse || !structuredResponse.intent) {
            await msg.reply("Desculpe, não entendi o que você quis dizer.");
            return;
        };

            switch (structuredResponse.intent) {
                case 'gasto':
                case 'entrada': {
                    const gastos = structuredResponse.gastoDetails || [];
                    const entradas = structuredResponse.entradaDetails || [];
                    const allTransactions = [];

                    // --- NOVA BARREIRA DE VALIDAÇÃO ---
                    for (const item of [...gastos, ...entradas]) {
                        if (item.valor === null || typeof item.valor !== 'number') {
                            await msg.reply(`Opa! Entendi que você quer registrar algo sobre "${item.descricao}", mas não consegui identificar um valor numérico válido na sua mensagem. Pode tentar de novo, por favor?`);
                            return; // Para a execução imediatamente
                        }
                    }
                    // --- FIM DA VALIDAÇÃO ---

                    if (gastos.length > 0) gastos.forEach(g => allTransactions.push({ ...g, type: 'Saídas' }));
                    if (entradas.length > 0) entradas.forEach(e => allTransactions.push({ ...e, type: 'Entradas' }));

                    if (allTransactions.length === 0) {
                        await msg.reply(`Entendi a intenção, mas não identifiquei os detalhes (valor, descrição).`);
                        break;
                    }

                    if (allTransactions.length === 1) {
                        const item = allTransactions[0];
                        const pagamento = normalizeText(item.pagamento || '');

                        if (item.type === 'Saídas' && pagamento === 'credito') {
                            const cardOptions = Object.keys(creditCardConfig);
                            let question = `Entendi, o gasto foi no crédito. Em qual cartão? Responda com o número:\n\n`;
                            cardOptions.forEach((cardName, index) => {
                                question += `${index + 1}. ${cardName}\n`;
                            });
                            userStateManager.setState(senderId, {
                                action: 'awaiting_credit_card_selection',
                                data: { gasto: item, cardOptions: cardOptions }
                            });
                            await msg.reply(question);
                            return; 
                        }
                    if (item.type === 'Saídas' && !item.pagamento) {
                        const dataDoGasto = item.data ? parseSheetDate(item.data) : new Date();
                        userStateManager.setState(senderId, {
                            action: 'awaiting_payment_method',
                            // A estrutura de dados correta é um objeto com a propriedade 'gasto'
                            data: {
                                gasto: item,
                                dataFinal: getFormattedDateOnly(dataDoGasto)
                            }
                        });
                        await msg.reply('Entendido! E qual foi a forma de pagamento? (Crédito, Débito, PIX ou Dinheiro)');
                        return;
                    }

                        if (item.type === 'Entradas' && !item.recebimento) {
                            userStateManager.setState(senderId, { action: 'awaiting_receipt_method', data: item });
                            await msg.reply('Entendido! E onde você recebeu esse valor? (Conta Corrente, Poupança, PIX ou Dinheiro)');
                            return;
                        }
                    }
                    
                    let confirmationMessage = `Encontrei ${allTransactions.length} transaç(ão|ões) para registrar:\n\n`;
                    allTransactions.forEach((item, index) => {
                        const typeLabel = item.type === 'Saídas' ? 'Gasto' : 'Entrada';
                        const dataInfo = item.data ? ` (Data: ${item.data})` : '';
                        confirmationMessage += `*${index + 1}.* [${typeLabel}] ${item.descricao} - *R$${item.valor}* (${item.categoria || 'N/A'})${dataInfo}\n`;
                    });
                    confirmationMessage += "\nVocê confirma o registro de todos os itens? Responda com *'sim'* ou *'não'*.";

                    userStateManager.setState(senderId, {
                        action: 'confirming_transactions',
                        data: { transactions: allTransactions, person: pessoa }
                    });
                    await msg.reply(confirmationMessage);
                    break;
                }

                case 'pergunta': {
                    await msg.reply("Analisando seus dados para responder, um momento...");
                    try {
                        const sheetReads = [
                            readDataFromSheet('Saídas!A:I'), 
                            readDataFromSheet('Entradas!A:H'),
                            readDataFromSheet('Metas!A:L'), 
                            readDataFromSheet('Dívidas!A:N')
                        ];
                        const cardSheetNames = Object.values(creditCardConfig).map(card => card.sheetName);
                        cardSheetNames.forEach(sheetName => {
                            sheetReads.push(readDataFromSheet(`${sheetName}!A:F`)); 
                        });
                        const allSheetData = await Promise.all(sheetReads);

                        const [saidasData, entradasData, metasData, dividasData] = allSheetData;
                        const creditCardData = allSheetData.slice(4);

                        const userQuestion = structuredResponse.question || messageBody;
                        const intentClassification = await classify(userQuestion);
                        
                        const analyzedData = await execute(
                            intentClassification.intent,
                            intentClassification.parameters,
                            {
                                saidas: saidasData,
                                entradas: entradasData,
                                metas: metasData,
                                dividas: dividasData,
                                cartoes: creditCardData
                            }
                        );

                        const respostaFinal = await generate({
                            userQuestion,
                            intent: intentClassification.intent,
                            rawResults: analyzedData.results,
                            details: analyzedData.details,
                            dateContext: {
                                currentMonth: new Date().getMonth(),
                                currentYear: new Date().getFullYear()
                            }
                        });
                    
                        cache.set(cacheKey, respostaFinal);
                        await msg.reply(respostaFinal);

                    } catch (err) {
                        console.error("Erro no novo sistema de perguntas:", err);
                        await msg.reply("Desculpe, não consegui processar essa análise. Tente reformular a pergunta.");
                    }
                    break;
                }

                case 'criar_lembrete': {
                    const lembrete = structuredResponse.lembreteDetails;
                    if (!lembrete || !lembrete.titulo || !lembrete.dataHora) {
                        await msg.reply("Não entendi os detalhes do lembrete. Por favor, inclua o que e quando (ex: 'me lembre de pagar a luz amanhã às 10h').");
                        break;
                    }
                    try {
                        await createCalendarEvent(lembrete.titulo, lembrete.dataHora, lembrete.recorrencia);
                        await msg.reply(`✅ Lembrete criado: "${lembrete.titulo}"`);
                    } catch (error) {
                        await msg.reply("Houve um erro ao tentar salvar o evento na sua Agenda Google.");
                    }
                    break;
                }

                case 'registrar_pagamento': {
                    await debtHandler.startPaymentRegistration(msg, structuredResponse.pagamentoDetails);
                    break;
                }
            
                case 'apagar_item': {
                    await deletionHandler.handleDeletionRequest(msg, structuredResponse.deleteDetails);
                    break;
                }

                case 'criar_divida': {
                    await creationHandler.startDebtCreation(msg);
                    break;
                }

                case 'criar_meta': {
                    await creationHandler.startGoalCreation(msg);
                    break;
                }

                case 'desconhecido':
                default: {
                    console.log(`Intenção desconhecida para a mensagem: "${messageBody}". Nenhuma resposta enviada.`);
                    break;
                }

                case 'ajuda': {
                    const helpMessage = `Olá! Eu sou seu assistente financeiro. Veja como posso te ajudar:\n\n*PARA REGISTRAR:*\n- *Gasto:* \`gastei 50 no mercado ontem no pix\`\n- *Entrada:* \`recebi 1200 do freela na conta\`\n- *Múltiplos:* \`hoje paguei 100 de luz e 50 de internet\`\n\n*PARA CONSULTAR:*\n- *Saldo:* \`qual o saldo de agosto?\`\n- *Gastos:* \`quanto gastei com transporte este mês?\`\n- *Listar:* \`liste meus gastos com mercado\`\n\n*OUTROS COMANDOS:*\n- \`criar meta\`\n- \`criar dívida\`\n- \`apagar último gasto\`\n- \`me lembre de pagar a fatura amanhã às 10h\`\n\nÉ só me dizer o que precisa! 😉`;
                    await msg.reply(helpMessage);
                    break;
                }
            }
        } catch (error) {
            console.error('❌ Erro fatal ao processar mensagem:', error);
            await msg.reply('Ocorreu um erro interno e a equipe de TI (o Daniel) foi notificada.');
        }
    }
}

module.exports = { handleMessage };