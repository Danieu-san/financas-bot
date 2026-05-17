const analysisService = require('./analysisService');
const { parseSheetDate, normalizeText, parseValue } = require('../utils/helpers');
const { matchesAnyField } = require('../utils/textMatcher');
const { creditCardConfig } = require('../config/constants');

const getMonthIndex = (monthInput) => {
    if (monthInput === null || monthInput === undefined) return null;
    if (typeof monthInput === 'number' && monthInput >= 0 && monthInput <= 11) return monthInput;
    const numericMonth = parseInt(monthInput, 10);
    if (!isNaN(numericMonth) && numericMonth >= 0 && numericMonth <= 11) return numericMonth;
    const months = { 'janeiro': 0, 'fevereiro': 1, 'março': 2, 'marco': 2, 'abril': 3, 'maio': 4, 'junho': 5, 'julho': 6, 'agosto': 7, 'setembro': 8, 'outubro': 9, 'novembro': 10, 'dezembro': 11 };
    const normalizedStr = normalizeText(String(monthInput).toLowerCase().trim());
    return months[normalizedStr] !== undefined ? months[normalizedStr] : null;
};

const getUnifiedExpenses = (dataSources, mes, ano) => {
    const saidasLimpo = dataSources.saidas.slice(1);
    let unifiedList = saidasLimpo.map(row => ({
        data: row[0],
        descricao: row[1],
        categoria: row[2],
        subcategoria: row[3],
        valor: row[4],
    }));

    if (dataSources.cartoes) {
        dataSources.cartoes.forEach(cardSheetData => {
            if (!cardSheetData || cardSheetData.length <= 1) return;
            const cardExpenses = cardSheetData.slice(1).map(row => ({
                data: row[0],
                descricao: row[1],
                categoria: row[2],
                subcategoria: 'Cartão de Crédito',
                valor: row[3],
            }));
            unifiedList.push(...cardExpenses);
        });
    }

    return unifiedList.filter(item => {
        const itemDate = parseSheetDate(item.data);
        if (!itemDate) return false;
        
        const isMonthMatch = (mes !== null) ? itemDate.getMonth() === mes : true;
        const isYearMatch = itemDate.getFullYear() === ano;
        
        return isMonthMatch && isYearMatch;
    });
};

function daysConsideredForAverage(mes, ano, now = new Date()) {
    if (mes === null || mes === undefined) return 365;
    if (ano === now.getFullYear() && mes === now.getMonth()) {
        return Math.max(1, now.getDate());
    }
    return new Date(ano, mes + 1, 0).getDate();
}

function expenseMatchesCategory(item, category) {
    return matchesAnyField(
        [item.categoria || '', item.subcategoria || '', item.descricao || ''],
        category
    );
}

const operationRegistry = {
    total_gastos_mes: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const saidasLimpo = dataSources.saidas.slice(1);
        const saidasFiltradas = saidasLimpo.filter(row => {
            const rowDate = parseSheetDate(row[0]);
            return rowDate && rowDate.getMonth() === mes && rowDate.getFullYear() === ano;
        });
        const totalSaidas = analysisService.calculateTotal(saidasFiltradas, 4);
        let totalCartoes = 0;
        if (dataSources.cartoes && mes !== null) {
            const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
            const targetBillingMonth = `${monthNames[mes]} de ${ano}`;
            dataSources.cartoes.forEach(cardSheetData => {
                if (!cardSheetData || cardSheetData.length <= 1) return;
                cardSheetData.slice(1).forEach(row => {
                    if ((row[5] || '') === targetBillingMonth) {
                        totalCartoes += parseValue(row[3]);
                    }
                });
            });
        }
        return { results: totalSaidas + totalCartoes, details: { totalSaidas, totalCartoes, mes, ano } };
    },
    total_gastos_categoria_mes: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const saidasLimpo = dataSources.saidas.slice(1);
        const saidasFiltradas = saidasLimpo.filter(row => {
            const rowDate = parseSheetDate(row[0]);
            if (!rowDate) return false;
            if (rowDate.getMonth() !== mes || rowDate.getFullYear() !== ano) return false;
            return matchesAnyField([row[2] || '', row[3] || '', row[1] || ''], params.categoria);
        });
        const totalSaidas = analysisService.calculateTotal(saidasFiltradas);
        let totalCartoes = 0;
        if (dataSources.cartoes && mes !== null) {
            const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
            const targetBillingMonth = `${monthNames[mes]} de ${ano}`;
            dataSources.cartoes.forEach(cardSheetData => {
                if (!cardSheetData || cardSheetData.length <= 1) return;
                cardSheetData.slice(1).forEach(row => {
                    const billingMonth = row[5] || '';
                    if (billingMonth === targetBillingMonth && matchesAnyField([row[2] || '', row[1] || ''], params.categoria)) {
                        totalCartoes += parseValue(row[3]);
                    }
                });
            });
        }
        const totalFinal = totalSaidas + totalCartoes;
        return { results: totalFinal, details: { categoria: params.categoria, mes, ano } };
    },
    media_gastos_categoria_mes: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const saidasLimpo = dataSources.saidas.slice(1);
        const filteredData = analysisService.getExpensesByMonthAndCategory(saidasLimpo, mes, ano, params.categoria);
        const media = analysisService.calculateAverage(filteredData);
        return { results: media, details: { ...params, mes, ano } };
    },
    media_diaria_gastos_mes: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const gastosUnificados = getUnifiedExpenses(dataSources, mes, ano);
        const total = gastosUnificados.reduce((sum, item) => sum + parseValue(item.valor), 0);
        const days = daysConsideredForAverage(mes, ano);
        return { results: days > 0 ? total / days : 0, details: { ...params, mes, ano, diasConsiderados: days, totalGastos: total } };
    },
    total_gastos_multiplas_categorias: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const categorias = Array.isArray(params.categorias) ? params.categorias.filter(Boolean) : [];
        const gastosUnificados = getUnifiedExpenses(dataSources, mes, ano);
        const total = gastosUnificados
            .filter(item => categorias.some(category => expenseMatchesCategory(item, category)))
            .reduce((sum, item) => sum + parseValue(item.valor), 0);
        return { results: total, details: { ...params, categorias, mes, ano } };
    },
    percentual_categoria_gastos: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const gastosUnificados = getUnifiedExpenses(dataSources, mes, ano);
        const totalGastos = gastosUnificados.reduce((sum, item) => sum + parseValue(item.valor), 0);
        const totalCategoria = gastosUnificados
            .filter(item => expenseMatchesCategory(item, params.categoria))
            .reduce((sum, item) => sum + parseValue(item.valor), 0);
        const percentual = totalGastos > 0 ? (totalCategoria / totalGastos) * 100 : 0;
        return { results: percentual, details: { ...params, mes, ano, totalCategoria, totalGastos } };
    },
    comparacao_gastos_categorias: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const categorias = Array.isArray(params.categorias) ? params.categorias.filter(Boolean).slice(0, 2) : [];
        const gastosUnificados = getUnifiedExpenses(dataSources, mes, ano);
        return {
            results: {
                categorias: categorias.map(category => ({
                    categoria: category,
                    total: gastosUnificados
                        .filter(item => expenseMatchesCategory(item, category))
                        .reduce((sum, item) => sum + parseValue(item.valor), 0)
                }))
            },
            details: { ...params, categorias, mes, ano }
        };
    },
    listagem_gastos_categoria: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const saidasLimpo = dataSources.saidas.slice(1);
        const filteredData = analysisService.getExpensesByMonthAndCategory(saidasLimpo, mes, ano, params.categoria);
        return { results: filteredData, details: { ...params, mes, ano } };
    },
    contagem_ocorrencias: async function(params, dataSources) {
        const ano = parseInt(params.ano, 10);
        const mes = getMonthIndex(params.mes);
        const gastosUnificados = getUnifiedExpenses(dataSources, mes, ano);
        const dataParaAnalise = gastosUnificados.map(g => [g.data, g.descricao, g.categoria, g.subcategoria]);
        const searchTerms = [normalizeText(params.categoria)];
        const filteredItems = analysisService.countOccurrences(dataParaAnalise, searchTerms, ano, mes);
        return { results: filteredItems.length, details: { ...params, mes, ano } };
    },
    gastos_valores_duplicados: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const valoresContados = new Map();
        if (dataSources.saidas && dataSources.saidas.length > 1) {
            const saidasLimpo = dataSources.saidas.slice(1);
            const saidasDoMes = saidasLimpo.filter(row => {
                const rowDate = parseSheetDate(row[0]);
                return rowDate && rowDate.getMonth() === mes && rowDate.getFullYear() === ano;
            });
            for (const row of saidasDoMes) {
                const valorNumerico = parseValue(row[4]);
                const descricao = row[1];
                const valorArredondado = Math.round(valorNumerico * 100) / 100;
                if (!valoresContados.has(valorArredondado)) { valoresContados.set(valorArredondado, []); }
                valoresContados.get(valorArredondado).push(descricao);
            }
        }
        const duplicatasEncontradas = [];
        for (let [valor, descricoes] of valoresContados.entries()) {
            if (descricoes.length > 1) {
                duplicatasEncontradas.push({ valor, count: descricoes.length, itens: descricoes });
            }
        }
        return { results: duplicatasEncontradas, details: { ...params, mes, ano } };
    },
    maior_menor_gasto: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const gastosUnificados = getUnifiedExpenses(dataSources, mes, ano);
        const dataParaAnalise = gastosUnificados.map(g => [g.data, g.descricao, g.categoria, g.subcategoria, g.valor]);
        const minMax = analysisService.findMinMax(dataParaAnalise);
        return { results: { min: minMax.min, max: minMax.max }, details: { ...params, mes, ano } };
    },
    maior_menor_gasto_categoria: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const gastosUnificados = getUnifiedExpenses(dataSources, mes, ano)
            .filter(item => expenseMatchesCategory(item, params.categoria));
        const dataParaAnalise = gastosUnificados.map(g => [g.data, g.descricao, g.categoria, g.subcategoria, g.valor]);
        const minMax = analysisService.findMinMax(dataParaAnalise);
        return { results: { min: minMax.min, max: minMax.max }, details: { ...params, mes, ano } };
    },
    saldo_do_mes: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const entradasLimpo = dataSources.entradas.slice(1);
        const saidasLimpo = dataSources.saidas.slice(1);
        const entradasFiltradas = entradasLimpo.filter(row => {
            const rowDate = parseSheetDate(row[0]);
            return rowDate && rowDate.getMonth() === mes && rowDate.getFullYear() === ano;
        });
        const totalEntradas = analysisService.calculateTotal(entradasFiltradas, 3);
        const saidasFiltradas = saidasLimpo.filter(row => {
            const rowDate = parseSheetDate(row[0]);
            return rowDate && rowDate.getMonth() === mes && rowDate.getFullYear() === ano;
        });
        const totalSaidas = analysisService.calculateTotal(saidasFiltradas, 4);
        let totalCartoes = 0;
        if (dataSources.cartoes && mes !== null) {
            const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
            const targetBillingMonth = `${monthNames[mes]} de ${ano}`;
            dataSources.cartoes.forEach(cardSheetData => {
                if (!cardSheetData || cardSheetData.length <= 1) return;
                cardSheetData.slice(1).forEach(row => {
                    if ((row[5] || '') === targetBillingMonth) {
                        totalCartoes += parseValue(row[3]);
                    }
                });
            });
        }
        const saldo = totalEntradas - (totalSaidas + totalCartoes);
        return { results: saldo, details: { totalSaidas: totalSaidas + totalCartoes, totalEntradas, mes, ano } };
    },
    pergunta_geral: async function(params, dataSources) {
        return { results: 'Pergunta genérica', details: null };
    }
};

async function execute(intent, parameters, dataSources) {
    const calculator = operationRegistry[intent] || operationRegistry.pergunta_geral;
    return await calculator(parameters, dataSources);
}

module.exports = { execute };
