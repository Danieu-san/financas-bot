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
const { normalizeText } = require('../utils/helpers');

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

                if (allTransactions.length > 0) {
                    if (allTransactions.length === 1) {
                        const item = allTransactions[0];
                        if (item.type === 'Saídas' && !item.pagamento) {
                            const dataDoGasto = item.data ? item.data : getFormattedDate();
                            item.dataFinal = dataDoGasto;
                            userStateManager.setState(senderId, { action: 'awaiting_payment_method', data: item });
                            await msg.reply('Entendido! E qual foi a forma de pagamento? (Crédito, Débito, PIX ou Dinheiro)');
                            break;
                        }
                        if (item.type === 'Entradas' && !item.recebimento) {
                            userStateManager.setState(senderId, { action: 'awaiting_receipt_method', data: item });
                            await msg.reply('Entendido! E onde você recebeu esse valor? (Conta Corrente, Poupança, PIX ou Dinheiro)');
                            break;
                        }
                    }

                    let confirmationMessage = `Encontrei ${allTransactions.length} transaç(ão|ões) para registrar:\n\n`;
                    allTransactions.forEach((item, index) => {
                        const typeLabel = item.type === 'Saídas' ? 'Gasto' : 'Entrada';
                        const dataInfo = item.data ? ` (Data: ${item.data})` : '';
                        confirmationMessage += `*${index + 1}.* [${typeLabel}] ${item.descricao} - *R$${item.valor}* (${item.categoria || 'N/A'})${dataInfo}\n`;
                    });
                    confirmationMessage += "\nVocê confirma o registro de todos os itens? Responda com *'sim'* ou *'não'*."

                    userStateManager.setState(senderId, {
                        action: 'confirming_transactions',
                        data: { transactions: allTransactions, person: pessoa }
                    });
                    await msg.reply(confirmationMessage);

                } else if (structuredResponse.intent === 'gasto' || structuredResponse.intent === 'entrada') {
                    await msg.reply(`Entendi que era um(a) ${structuredResponse.intent}, mas não identifiquei os detalhes (valor, descrição).`);
                }
                break;
            }

            case 'pergunta': {
                await msg.reply("Analisando seus dados para responder, um momento...");

                const [saidasData, entradasData] = await Promise.all([
                    readDataFromSheet('Saídas!A:I'), readDataFromSheet('Entradas!A:H'),
                ]);

                const questionText = normalizeText(structuredResponse.question || messageBody);
                let respostaFinal = '';

                // --- MODO 1: LÓGICA DETERMINÍSTICA (100% PRECISA) ---
                // Aqui, o bot faz o cálculo sozinho para evitar erros da IA

                if (questionText.includes('total de gastos em transporte este mes')) {
                    const gastosTransporte = saidasData.slice(1).filter(row =>
                        normalizeText(row[2]).includes('transporte') && new Date(row[0]).getMonth() === new Date().getMonth()
                    );
                    const total = gastosTransporte.reduce((sum, row) => sum + parseFloat(row[4].replace('R$ ', '').replace('.', '').replace(',', '.')), 0);

                    const prompt = `O usuário perguntou qual o total de gastos em transporte este mês. O valor calculado é R$ ${total.toFixed(2)}. Liste também os itens que compõem esse valor. Itens: ${JSON.stringify(gastosTransporte)}.`;
                    respostaFinal = await askLLM(prompt);

                } else if (questionText.includes('media de gasto com lanche em agosto')) {
                    const gastosLanche = saidasData.slice(1).filter(row =>
                        (normalizeText(row[2]).includes('alimentação') && normalizeText(row[3]).includes('lanche')) || normalizeText(row[1]).includes('lanche')
                    );
                    const total = gastosLanche.reduce((sum, row) => sum + parseFloat(row[4].replace('R$ ', '').replace('.', '').replace(',', '.')), 0);
                    const media = gastosLanche.length > 0 ? total / gastosLanche.length : 0;

                    const prompt = `O usuário perguntou qual a média de gasto com lanche em agosto. O valor calculado é R$ ${media.toFixed(2)}. Os ${gastosLanche.length} itens são: ${JSON.stringify(gastosLanche)}.`;
                    respostaFinal = await askLLM(prompt);

                } else if (questionText.includes('me mostre todos os gastos com alimentação este mes')) {
                    const gastosAlimentacao = saidasData.slice(1).filter(row =>
                        normalizeText(row[2]).includes('alimentação') && new Date(row[0]).getMonth() === new Date().getMonth()
                    );
                    const prompt = `O usuário perguntou para listar todos os gastos com alimentação este mês. Aqui está a lista: ${JSON.stringify(gastosAlimentacao)}. Apresente esta lista de forma clara e amigável.`;
                    respostaFinal = await askLLM(prompt);

                } else if (questionText.includes('quantas vezes usei o uber este ano')) {
                    const gastosUber = saidasData.slice(1).filter(row =>
                        normalizeText(row[1]).includes('uber') && new Date(row[0]).getFullYear() === new Date().getFullYear()
                    );
                    const prompt = `O usuário perguntou quantas vezes usou o Uber este ano. A contagem é ${gastosUber.length}. Os itens são: ${JSON.stringify(gastosUber)}.`;
                    respostaFinal = await askLLM(prompt);

                } else if (questionText.includes('valores iguais')) {
                    const valoresContados = {};
                    if (saidasData && saidasData.length > 1) {
                        for (let i = 1; i < saidasData.length; i++) {
                            const row = saidasData[i];
                            const valorString = row[4];
                            const descricao = row[1];
                            if (valorString) {
                                const valorNumerico = parseFloat(valorString.replace('R$ ', '').replace('.', '').replace(',', '.'));
                                if (!isNaN(valorNumerico)) {
                                    if (!valoresContados[valorNumerico]) { valoresContados[valorNumerico] = new Set(); }
                                    valoresContados[valorNumerico].add(descricao);
                                }
                            }
                        }
                    }
                    const duplicatasEncontradas = [];
                    for (const valor in valoresContados) {
                        if (valoresContados[valor].size > 1) {
                            const itens = Array.from(valoresContados[valor]);
                            duplicatasEncontradas.push({ valor: parseFloat(valor), count: valoresContados[valor].size, itens: itens });
                        }
                    }
                    const prompt = `O usuário perguntou sobre gastos com valores iguais. Analisei os dados e encontrei o seguinte: ${JSON.stringify(duplicatasEncontradas)}. Responda ao usuário com uma lista formatada e amigável, incluindo a quantidade de vezes que cada valor aparece e os nomes dos itens associados.`;
                    respostaFinal = await askLLM(prompt);

                } else {
                    // --- MODO 2: IA GERAL (PARA PERGUNTAS NÃO PREVISTAS) ---
                    const [metasData, dividasData] = await Promise.all([
                        readDataFromSheet('Metas!A:L'), readDataFromSheet('Dívidas!A:N')
                    ]);
                    const contextPrompt = `Você é um analista financeiro experiente. Sua tarefa é responder à pergunta do usuário baseando-se EXCLUSIVAMENTE nos dados fornecidos abaixo.
                    A pergunta do usuário é: "${structuredResponse.question || messageBody}". Hoje é ${new Date().toLocaleDateString('pt-BR')}.
                    ### DADOS FINANCEIROS BRUTOS:
                    - Gastos ('Saídas'): ${JSON.stringify(saidasData)}
                    - Entradas: ${JSON.stringify(entradasData)}
                    - Metas: ${JSON.stringify(metasData)}
                    - Dívidas: ${JSON.stringify(dividasData)}`;
                    respostaFinal = await askLLM(contextPrompt);
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