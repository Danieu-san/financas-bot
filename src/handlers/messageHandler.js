// src/handlers/messageHandler.js

const { userMap } = require('../config/constants');
const userStateManager = require('../state/userStateManager');
const creationHandler = require('./creationHandler');
const deletionHandler = require('./deletionHandler');
const { getStructuredResponseFromLLM, askLLM } = require('../services/gemini');
const { appendRowToSheet, readDataFromSheet } = require('../services/sheets');

// Base de Conhecimento (A versão mais completa)
const mapeamentoGastos = {
    "aluguel": { categoria: "Moradia", subcategoria: "ALUGUEL" },
    "condomínio": { categoria: "Moradia", subcategoria: "CONDOMÍNIO" },
    "iptu": { categoria: "Moradia", subcategoria: "IPTU" },
    "luz": { categoria: "Moradia", subcategoria: "LUZ" },
    "água": { categoria: "Moradia", subcategoria: "ÁGUA" },
    "internet": { categoria: "Moradia", subcategoria: "INTERNET" },
    "mercado": { categoria: "Alimentação", subcategoria: "SUPERMERCADO" },
    "supermercado": { categoria: "Alimentação", subcategoria: "SUPERMERCADO" },
    "guanabara": { categoria: "Alimentação", subcategoria: "SUPERMERCADO" },
    "assaí": { categoria: "Alimentação", subcategoria: "SUPERMERCADO" },
    "assai": { categoria: "Alimentação", subcategoria: "SUPERMERCADO" },
    "restaurante": { categoria: "Alimentação", subcategoria: "RESTAURANTE" },
    "ifood": { categoria: "Alimentação", subcategoria: "DELIVERY / IFOOD" },
    "delivery": { categoria: "Alimentação", subcategoria: "DELIVERY / IFOOD" },
    "lanche": { categoria: "Alimentação", subcategoria: "PADARIA / LANCHE" },
    "padaria": { categoria: "Alimentação", subcategoria: "PADARIA / LANCHE" },
    "gasolina": { categoria: "Transporte", subcategoria: "COMBUSTÍVEL" },
    "combustível": { categoria: "Transporte", subcategoria: "COMBUSTÍVEL" },
    "uber": { categoria: "Transporte", subcategoria: "UBER / 99" },
    "99": { categoria: "Transporte", subcategoria: "UBER / 99" },
    "trem": { categoria: "Transporte", subcategoria: "TRANSPORTE PÚBLICO" },
    "metrô": { categoria: "Transporte", subcategoria: "TRANSPORTE PÚBLICO" },
    "ônibus": { categoria: "Transporte", subcategoria: "TRANSPORTE PÚBLICO" },
    "farmácia": { categoria: "Saúde", subcategoria: "FARMÁCIA" },
    "remédio": { categoria: "Saúde", subcategoria: "FARMÁCIA" },
    "consulta": { categoria: "Saúde", subcategoria: "CONSULTAS" },
    "exame": { categoria: "Saúde", subcategoria: "EXAMES" },
};

// Schema Unificado
const MASTER_SCHEMA = {
    type: "OBJECT",
    properties: {
        intent: { type: "STRING", enum: ["gasto", "entrada", "pergunta", "apagar", "desconhecido"] },
        gastoDetails: {
            type: "OBJECT",
            description: "Preenchido SOMENTE se a intenção for 'gasto'.",
            properties: {
                descricao: { type: "STRING" }, valor: { type: "NUMBER" }, categoria: { type: "STRING" },
                subcategoria: { type: "STRING" }, pagamento: { type: "STRING", enum: ["Dinheiro", "Débito", "Crédito", "PIX"] },
                recorrente: { type: "STRING", enum: ["Sim", "Não"] }, observacoes: { type: "STRING" },
            }
        },
        question: { type: "STRING" }
    },
    required: ["intent"]
};

// Função reutilizável para salvar na planilha
async function salvarGastoNaPlanilha(gasto, pessoa) {
    const dataFormatada = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const rowData = [
        dataFormatada, gasto.descricao || 'Não especificado', gasto.categoria || 'Outros',
        gasto.subcategoria || '', gasto.valor, pessoa, gasto.pagamento || '',
        gasto.recorrente || 'Não', gasto.observacoes || ''
    ];
    await appendRowToSheet('Saídas', rowData);
    return `✅ Gasto de R$${gasto.valor.toFixed(2)} registrado em *${gasto.categoria || 'Outros'} / ${gasto.subcategoria || 'N/A'}*!`;
}

// Função principal de tratamento de mensagens
async function handleMessage(msg) {
    if (msg.isStatus || msg.fromMe) return;

    const senderId = msg.author || msg.from;
    const pessoa = userMap[senderId] || 'Ambos';
    const messageBody = msg.body.trim();

    const currentState = userStateManager.getState(senderId);

    if (currentState && currentState.action === 'awaiting_payment_method') {
    const gasto = currentState.data;
    const respostaPagamento = messageBody;

    // Criamos um prompt específico para a IA corrigir a resposta
    const promptCorrecao = `
        Analise a resposta do usuário e normalize-a para uma das 4 categorias de pagamento: 'Crédito', 'Débito', 'PIX', 'Dinheiro'.
        A resposta pode conter erros de digitação ou gírias. Use sua inteligência para encontrar a correspondência mais provável.

        Resposta do usuário: "${respostaPagamento}"

        Se a resposta for "crdito" ou "cred", a resposta correta é "Crédito".
        Se for impossível determinar, retorne "Outros".

        Retorne APENAS a palavra correta.
    `;

    // Pedimos a correção para a IA
    const pagamentoCorrigido = await askLLM(promptCorrecao);

    // Usamos a resposta limpa da IA
    gasto.pagamento = pagamentoCorrigido.trim();

    const confirmationMessage = await salvarGastoNaPlanilha(gasto, pessoa);
    await msg.reply(confirmationMessage);

    userStateManager.deleteState(senderId); // Limpa o estado
    return; // Encerra o processamento
}

    if (currentState) { /* Lógica para outras conversas futuras */ return; }

    console.log(`Mensagem de ${pessoa} (${senderId}): "${messageBody}"`);

    try {
        const masterPrompt = `
            Sua tarefa é extrair detalhes de um gasto financeiro de uma mensagem e retornar um JSON.

            ### REGRA MAIS IMPORTANTE
            Para determinar a 'categoria' e 'subcategoria', você DEVE usar o mapa de palavras-chave fornecido abaixo. Esta é sua principal fonte de verdade.

            ### Mapa de Palavras-Chave (Sua Base de Conhecimento)
            ${JSON.stringify(mapeamentoGastos, null, 2)}

            ### Mensagem do Usuário
            "${messageBody}"

            ### Outras Regras de Extração
            -   **descricao**: Crie uma descrição curta sobre o que foi o gasto.
            -   **valor**: O valor numérico.
            -   **observacoes**: Qualquer informação extra, como planos futuros ou comentários. (Ex: "vou voltar lá segunda feira").
            -   **pagamento**: A regra para este campo é EXTREMAMENTE RÍGIDA. Procure pelas palavras exatas: "crédito", "débito", "pix", "dinheiro". Se, e somente se, uma dessas palavras estiver na mensagem, preencha o campo. Caso contrário, você é OBRIGADO a retornar o valor como nulo (null). Não adivinhe ou presuma um valor.
            -   **responsavel**: Sempre "${pessoa}".
            -   **intent**: Se você conseguir extrair um 'valor' e uma 'descricao', a intenção é 'gasto'. Caso contrário, é 'desconhecido'.

            ### Formato de Saída Obrigatório
            Retorne APENAS o objeto JSON, seguindo este schema:
            ${JSON.stringify(MASTER_SCHEMA)}
        `;

        const structuredResponse = await getStructuredResponseFromLLM(masterPrompt);

        // --- LOCAL CORRETO DO DEBUG ---
        // Imprimimos a resposta aqui, ANTES do switch, para ver o que a IA realmente retornou.
        console.log("--- RESPOSTA BRUTA DA IA ---");
        console.log(JSON.stringify(structuredResponse, null, 2));
        console.log("--------------------------");

        if (!structuredResponse || !structuredResponse.intent) {
            await msg.reply("Desculpe, não entendi o que você quis dizer. Pode tentar de outra forma?");
            return;
        }

        switch (structuredResponse.intent) {
            case 'gasto':
                const gasto = structuredResponse.gastoDetails;

                if (!gasto || !gasto.valor) {
                    await msg.reply("Entendi que é um gasto, mas não consegui identificar o valor. Pode me dizer de novo?");
                    break;
                }

                // Lógica para perguntar o pagamento
                if (!gasto.pagamento) {
                    userStateManager.setState(senderId, { action: 'awaiting_payment_method', data: gasto });

                    // MÉTODO FINAL E MAIS ESTÁVEL: Pergunta de Texto
                    await msg.reply(
                        'Entendido! Falta só uma coisa: Qual foi a forma de pagamento? (Crédito, Débito, PIX ou Dinheiro)'
                    );

                } else {
                    const confirmationMessage = await salvarGastoNaPlanilha(gasto, pessoa);
                    await msg.reply(confirmationMessage);
                }
                break;
            
            case 'desconhecido':
            default:
                const genericResponse = await askLLM(`A mensagem é de ${pessoa}. Responda de forma amigável à seguinte mensagem, sem se oferecer para registrar nada: "${messageBody}"`);
                await msg.reply(genericResponse);
                break;
        }
    } catch (error) {
        console.error('❌ Erro fatal ao processar mensagem:', error);
        await msg.reply('Ocorreu um erro interno. A equipe de TI (o Daniel) foi notificada.');
    }
}

module.exports = { handleMessage };