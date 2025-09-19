const { askLLM } = require('./geminiClient');
const { normalizeText } = require('../utils/helpers');

const parseMonthName = (monthStr) => {
    const months = { 'janeiro': 0, 'fevereiro': 1, 'março': 2, 'marco': 2, 'abril': 3, 'maio': 4, 'junho': 5, 'julho': 6, 'agosto': 7, 'setembro': 8, 'outubro': 9, 'novembro': 10, 'dezembro': 11 };
    const normalizedStr = normalizeText(String(monthStr).toLowerCase().trim());
    return months[normalizedStr] !== undefined ? months[normalizedStr] : null;
};

async function classify(questionText) {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const classificationPrompt = `
    Você é um classificador de intenções para um bot de finanças.
    Sua tarefa é extrair a intenção e os parâmetros da pergunta do usuário.

    [DATA ATUAL DE REFERÊNCIA]
    Hoje é: ${today.toLocaleDateString('pt-BR')}

    [INTENÇÕES POSSÍVEIS]
    - total_gastos_categoria_mes
    - media_gastos_categoria_mes
    - listagem_gastos_categoria
    - contagem_ocorrencias
    - gastos_valores_duplicados
    - maior_menor_gasto
    - saldo_do_mes
    - pergunta_geral

    [REGRAS DE EXTRAÇÃO DE PARÂMETROS]
    - "categoria": O item sobre o qual o usuário pergunta (ex: "alimentação", "pedágio").
    - "ano": O ano com 4 dígitos (ex: 2025). Se não for mencionado, use o ano atual: ${currentYear}.
    - "mes": O NOME do mês (ex: "agosto").

    [REGRAS DE TEMPO OBRIGATÓRIAS]
    - Se a pergunta NÃO mencionar um mês específico (ex: "qual o maior gasto"), o parâmetro "mes" DEVE ser o mês atual: "${today.toLocaleString('pt-BR', { month: 'long' })}".
    - Se a pergunta usar "mês passado", o parâmetro "mes" DEVE ser: "${new Date(today.getFullYear(), today.getMonth() - 1, 1).toLocaleString('pt-BR', { month: 'long' })}".
    - REGRA MAIS IMPORTANTE: Se a pergunta se referir ao ano inteiro (contiver "neste ano", "em 2025", "anual"), o parâmetro "mes" DEVE ser \`null\`. NÃO adicione um mês padrão nesses casos.

    [PERGUNTA DO USUÁRIO]
    "${questionText}"

    [FORMATO DE SAÍDA OBRIGATÓRIO]
    Responda APENAS com o objeto JSON.
    Exemplo para pergunta anual:
    {
      "intent": "contagem_ocorrencias",
      "parameters": {
        "categoria": "pedágio",
        "mes": null,
        "ano": ${currentYear}
      }
    }`;

    try {
        const rawResponse = await askLLM(classificationPrompt);
        console.log("Resposta bruta da IA (Classificação):", rawResponse);
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("A resposta da IA não contém um JSON válido.");
        
        const classification = JSON.parse(jsonMatch[0]);

        if (classification.parameters) {
            if (classification.parameters.mes) {
                const parsedMonth = parseMonthName(classification.parameters.mes);
                classification.parameters.mes = parsedMonth;
            } else if (classification.parameters.mes !== null) {
                // Se o mês não foi especificado e não é uma busca anual, assume o mês atual
                classification.parameters.mes = currentMonth;
            }
            if (!classification.parameters.ano) {
                classification.parameters.ano = currentYear;
            }
        }

        return {
            intent: classification.intent,
            parameters: classification.parameters,
            originalQuestion: questionText
        };
    } catch (err) {
        console.warn("Classificação por IA falhou, usando fallback 'pergunta_geral'. Erro:", err.message);
        return {
            intent: 'pergunta_geral',
            parameters: {},
            originalQuestion: questionText
        };
    }
}

module.exports = { classify };