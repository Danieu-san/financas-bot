const { askLLM } = require('./geminiClient');
const { parseValue } = require('../utils/helpers');

function formatCurrency(value) {
    if (typeof value !== 'number') {
        value = parseFloat(value) || 0;
    }
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

async function generate(args) {
    const { intent, rawResults, details, userQuestion } = args;
    const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const mesNome = details && typeof details.mes === 'number' ? monthNames[details.mes] : 'o período solicitado';
    const ano = details ? details.ano : new Date().getFullYear();

    let prompt;
    let finalValue = null;

    switch (intent) {
        case 'total_gastos_categoria_mes':
            finalValue = formatCurrency(rawResults);
            prompt = `O usuário perguntou o total de gastos com "${details.categoria}" em ${mesNome} de ${ano}. Formule uma resposta amigável que inclua o placeholder VALOR_FINAL. Exemplo: "Em ${mesNome} de ${ano}, seus gastos com ${details.categoria} totalizaram VALOR_FINAL."`;
            break;

        case 'saldo_do_mes':
            finalValue = formatCurrency(rawResults);
            prompt = `O usuário perguntou o saldo de ${mesNome} de ${ano}. Formule uma resposta amigável sobre o saldo do mês que inclua o placeholder VALOR_FINAL. Mencione que o total de entradas foi ${formatCurrency(details.totalEntradas)} e o de saídas foi ${formatCurrency(details.totalSaidas)}.`;
            break;

        case 'maior_menor_gasto':
            if (!rawResults || !rawResults.max) {
                prompt = `O usuário perguntou sobre o maior gasto em ${mesNome} de ${ano}, mas não encontrei nenhum gasto registrado para este período. Informe isso a ele de forma amigável.`;
            } else {
                const maiorGasto = { descricao: rawResults.max[1], valor: formatCurrency(parseValue(rawResults.max[4])) };
                prompt = `O usuário perguntou sobre o maior gasto em ${mesNome} de ${ano}. O maior gasto encontrado foi "${maiorGasto.descricao}" no valor de ${maiorGasto.valor}. Formule uma resposta amigável com essa informação.`;
            }
            break;
        
        case 'listagem_gastos_categoria':
            if (!rawResults || rawResults.length === 0) {
                prompt = `O usuário pediu uma lista de gastos com "${details.categoria}" em ${mesNome}, mas não encontrei nenhum. Informe isso a ele.`;
            } else {
                const total = rawResults.reduce((sum, row) => sum + parseValue(row[4]), 0);
                let listaFormatada = rawResults.map(row => `- ${row[1]} (${formatCurrency(parseValue(row[4]))})`).join('\n');
                
                finalValue = formatCurrency(total);
                prompt = `
                    O usuário pediu uma lista de gastos com "${details.categoria}" em ${mesNome}. O total gasto foi VALOR_FINAL.
                    A lista de itens é:\n${listaFormatada}\n
                    Sua tarefa é montar uma resposta amigável apresentando o total (usando o placeholder VALOR_FINAL) e a lista de gastos de forma clara. É OBRIGATÓRIO incluir a lista.
                `;
            }
            break;
            
        default:
            prompt = `O usuário perguntou: "${userQuestion}". O resultado da análise foi: ${JSON.stringify(rawResults)}. Use essas informações para dar uma resposta clara.`;
            break;
    }

    try {
        const llmResponse = await askLLM(prompt);
        if (finalValue) {
            return llmResponse.replace(/VALOR_FINAL/g, finalValue);
        }
        return llmResponse;
    } catch (err) {
        console.error("Erro ao gerar resposta formatada via IA", err);
        return `Ocorreu um erro ao processar a resposta.`;
    }
}

module.exports = { generate };