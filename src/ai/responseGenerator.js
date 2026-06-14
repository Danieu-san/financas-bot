const { parseValue } = require('../utils/helpers');

function formatCurrency(value) {
    const numeric = typeof value === 'number' ? value : parseFloat(value) || 0;
    return `R$ ${numeric.toFixed(2).replace('.', ',')}`;
}

function getMonthLabel(details = {}) {
    const monthNames = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const month = Number(details.mes);
    const year = Number(details.ano) || new Date().getFullYear();
    return month >= 0 && month <= 11 ? `${monthNames[month]} de ${year}` : 'o período solicitado';
}

function formatListRows(rows = []) {
    return rows
        .slice(0, 12)
        .map((row, index) => `${index + 1}. ${row?.[1] || 'Lançamento'} - ${formatCurrency(parseValue(row?.[4]))}`)
        .join('\n');
}

async function generate(args = {}) {
    const { intent, rawResults, details = {} } = args;
    const period = getMonthLabel(details);

    switch (intent) {
        case 'total_gastos_mes': {
            const total = formatCurrency(rawResults);
            const parts = [`Total de gastos em ${period}: ${total}.`];
            if (details.totalSaidas !== undefined || details.totalCartoes !== undefined) {
                parts.push(`Saídas: ${formatCurrency(details.totalSaidas)}. Cartões: ${formatCurrency(details.totalCartoes)}.`);
            }
            return parts.join('\n');
        }

        case 'total_gastos_categoria_mes': {
            const categoria = details.categoria || 'categoria solicitada';
            return `Em ${period}, seus gastos com ${categoria} totalizaram ${formatCurrency(rawResults)}.`;
        }

        case 'saldo_do_mes':
            return [
                `Saldo de ${period}: ${formatCurrency(rawResults)}.`,
                `Entradas: ${formatCurrency(details.totalEntradas)}. Saídas: ${formatCurrency(details.totalSaidas)}.`
            ].join('\n');

        case 'maior_menor_gasto': {
            if (!rawResults?.max) {
                return `Não encontrei gastos registrados em ${period}.`;
            }
            return `Maior gasto em ${period}: ${rawResults.max[1]} (${formatCurrency(parseValue(rawResults.max[4]))}).`;
        }

        case 'listagem_gastos_categoria': {
            const categoria = details.categoria || 'categoria solicitada';
            if (!Array.isArray(rawResults) || rawResults.length === 0) {
                return `Não encontrei gastos com ${categoria} em ${period}.`;
            }
            const total = rawResults.reduce((sum, row) => sum + parseValue(row?.[4]), 0);
            const extra = rawResults.length > 12 ? `\n... e mais ${rawResults.length - 12} lançamento(s).` : '';
            return [
                `Gastos com ${categoria} em ${period}: ${formatCurrency(total)}.`,
                formatListRows(rawResults) + extra
            ].join('\n');
        }

        default:
            return 'Resposta segura: consegui processar a consulta, mas esse caminho legado não envia dados crus ao Gemini. Tente pedir o detalhamento ou o dashboard para ver a composição calculada.';
    }
}

module.exports = { generate };
