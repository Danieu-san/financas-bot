// src/ai/responseGenerator.js

const { askLLM } = require('./geminiClient');

async function generate(args) {
    const monthNames = [
      "janeiro", "fevereiro", "março", "abril", "maio", "junho",
      "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
    ];

    // Extrai o nome do mês usando o índice fornecido pela classificação da IA
    let mesNome = "";
    if (args.details && typeof args.details.mes === 'number') {
        mesNome = monthNames[args.details.mes] || 'este mês';
    }

    const prompt = `
Você é um assistente financeiro gentil que precisa comunicar ao usuário uma análise feita por você com base em seus dados financeiros.

Detalhes da pergunta original: ${args.userQuestion}
Intenção identificada: ${args.intent}

Resultados numéricos exatos: ${JSON.stringify(args.rawResults)}
Informações detalhadas: ${JSON.stringify(args.details)}

Instruções:
- Responda de forma simples, clara e amigável.
- Se a análise for sobre um mês específico, use o nome do mês: "${mesNome}" para se referir ao mês ${args.details.mes}.
- A resposta DEVE incluir os valores numéricos calculados com precisão.
- Evite repetir detalhes técnicos; foque no valor para o usuário.
- Se não houver registros, mencione isso com simplicidade e sem alarme.
- Mantenha-se sempre dentro dos resultados fornecidos acima.
- Se a intenção for 'pergunta_geral', use apenas o 'userQuestion' para formular a resposta, sem se referir aos dados (pois eles não foram processados).
`;

    try {
        const answer = await askLLM(prompt);
        return answer;
    } catch (err) {
        console.error("Erro ao gerar resposta formatada via IA", err);
        return `Ocorreu um erro ao processar a resposta.`;
    }
}

module.exports = { generate };