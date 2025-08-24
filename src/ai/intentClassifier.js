// src/ai/intentClassifier.js

const { askLLM } = require('./geminiClient');
const { normalizeText } = require('../utils/helpers'); 

// Função auxiliar para parsear nome de mês se necessário
const parseMonthName = (monthStr) => {
    const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const normalizedStr = monthStr.toLowerCase().trim();
    const index = months.indexOf(normalizedStr);
    return index !== -1 ? index : null;
};

/**
 * Classifica a pergunta do usuário em tipos reconhecidos
 */
async function classify(questionText) {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const classificationPrompt = `
Você é um classificador de intenções para um assistente financeiro.
Sua única responsabilidade é analisar a pergunta do usuário e extrair a intenção e os parâmetros para um JSON.

[INSTRUÇÕES]
1.  **Tipos de Intenções:**
    - total_gastos_categoria_mes
    - media_gastos_categoria_mes
    - listagem_gastos_categoria
    - contagem_ocorrencias
    - gastos_valores_duplicados
    - maior_menor_gasto
    - saldo_do_mes
    - pergunta_geral

2.  **Regras de Parâmetros:**
    - Para 'mes', use o número do mês (0 para janeiro, 1 para fevereiro, etc.).
    - Para 'ano', use o ano completo (ex: 2025).
    - Se o usuário disser "este mês", o 'mes' deve ser ${currentMonth}.
    - Se o usuário disser "ano passado", o 'ano' deve ser ${currentYear - 1}.
    - Se o usuário disser "agosto", o 'mes' deve ser 7.

3.  **Intenções Especiais:**
    - Se a pergunta não se encaixar em nenhuma das intenções acima, use 'pergunta_geral'.

[PERGUNTA DO USUÁRIO]
"${questionText}"

[FORMATO DE SAÍDA OBRIGATÓRIO]
Responda APENAS com o objeto JSON. Não inclua texto explicativo, formatação extra, saudações ou qualquer outra coisa. Sua resposta deve começar e terminar com chaves {}.
Exemplo:
{
  "intent": "total_gastos_categoria_mes",
  "parameters": {
    "categoria": "transporte",
    "mes": ${currentMonth},
    "ano": ${currentYear}
  }
}`;

    try {
        const rawResponse = await askLLM(classificationPrompt);
        console.log("Resposta bruta da IA:", rawResponse);

        // Estratégia 1: Tentar extrair o JSON com uma Regex
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        let jsonString = rawResponse;
        if (jsonMatch) {
            jsonString = jsonMatch[0];
        } else {
            // Estratégia 2: Se a Regex falhou, tenta a limpeza simples
            jsonString = rawResponse.replace(/```json\n?|\n?```/g, '').trim();
        }

        const classification = JSON.parse(jsonString);

        // 3. Normalização Defensiva de Parâmetros
        if (classification.parameters && classification.parameters.mes) {
            // Sua lógica atual de normalização
            const mesNormalizado = normalizeText(String(classification.parameters.mes));
            if (mesNormalizado.includes('atual') || mesNormalizado.includes('este mes')) {
                classification.parameters.mes = currentMonth;
            } else if (mesNormalizado.includes('passado')) {
                // Lógica para mês passado, caso necessário
                classification.parameters.mes = (currentMonth - 1 + 12) % 12;
            } else {
                const parsedMonth = parseMonthName(mesNormalizado);
                if (parsedMonth !== null) {
                    classification.parameters.mes = parsedMonth;
                }
            }
        }
        // Lógica para ano, se não existir
        if (classification.parameters && !classification.parameters.ano) {
            classification.parameters.ano = currentYear;
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
            parameters: {}
        };
    }
}
module.exports = { classify };