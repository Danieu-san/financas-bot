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

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

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

function parseBillingMonth(value) {
    const match = String(value || '').trim().match(/^([A-Za-zÀ-ÿ]+)\s+de\s+(20\d{2})$/i);
    if (!match) return null;
    const month = getMonthIndex(match[1]);
    const year = Number.parseInt(match[2], 10);
    if (month === null || !Number.isInteger(year)) return null;
    return { month, year, key: year * 12 + month };
}

function targetBillingLabel(mes, ano) {
    const month = getMonthIndex(mes);
    const year = Number.parseInt(ano, 10);
    if (month === null || !Number.isInteger(year)) return '';
    return `${MONTH_NAMES[month]} de ${year}`;
}

function getCreditCardRows(dataSources = {}) {
    const cardSheets = Array.isArray(dataSources.cartoes) ? dataSources.cartoes : [];
    return cardSheets.flatMap((sheetRows) => {
        if (!Array.isArray(sheetRows) || sheetRows.length <= 1) return [];
        return sheetRows.slice(1).map(row => ({
            date: row[0] || '',
            descricao: row[1] || '',
            categoria: row[2] || 'Cartão',
            valor: parseValue(row[3]),
            parcela: row[4] || '',
            mesCobranca: row[5] || '',
            cardId: row.length >= 10 ? row[6] || '' : '',
            cartao: row.length >= 10 ? row[7] || row[6] || '' : '',
            raw: row
        }));
    });
}

function cardMatches(row, cardName) {
    const needle = normalizeText(cardName);
    if (!needle) return true;
    return [row.cardId, row.cartao]
        .map(value => normalizeText(value))
        .some(value => value.includes(needle));
}

function billingMatches(row, mes, ano) {
    const expected = targetBillingLabel(mes, ano);
    return expected && String(row.mesCobranca || '').trim() === expected;
}

function filterCardRowsFromPeriod(rows, mes, ano) {
    const month = getMonthIndex(mes);
    const year = Number.parseInt(ano, 10);
    if (month === null || !Number.isInteger(year)) return rows;
    const targetKey = year * 12 + month;
    return rows.filter(row => {
        const parsed = parseBillingMonth(row.mesCobranca);
        return parsed && parsed.key >= targetKey;
    });
}

function summarizeInstallments(rows) {
    const grouped = new Map();
    rows.forEach((row) => {
        const key = [normalizeText(row.descricao), normalizeText(row.cartao), normalizeText(row.categoria)].join('|');
        const existing = grouped.get(key) || {
            descricao: row.descricao || 'sem descrição',
            cartao: row.cartao || '',
            categoria: row.categoria || '',
            parcelasLancadas: 0,
            totalPrevisto: 0,
            primeiraParcela: row.date || '',
            ultimaParcela: row.date || ''
        };
        existing.parcelasLancadas += 1;
        existing.totalPrevisto += Number(row.valor || 0);
        if (row.date && (!existing.primeiraParcela || String(row.date).localeCompare(String(existing.primeiraParcela)) < 0)) {
            existing.primeiraParcela = row.date;
        }
        if (row.date && (!existing.ultimaParcela || String(row.date).localeCompare(String(existing.ultimaParcela)) > 0)) {
            existing.ultimaParcela = row.date;
        }
        grouped.set(key, existing);
    });
    return Array.from(grouped.values())
        .filter(item => item.parcelasLancadas > 1 || /\/[2-9]\d*$/.test(String(rows.find(row => row.descricao === item.descricao)?.parcela || '')))
        .sort((a, b) => b.totalPrevisto - a.totalPrevisto);
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
    total_fatura_cartao: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const rows = getCreditCardRows(dataSources)
            .filter(row => cardMatches(row, params.cartao))
            .filter(row => billingMatches(row, mes, ano));
        const total = rows.reduce((sum, row) => sum + Number(row.valor || 0), 0);
        return {
            results: total,
            details: {
                cartao: params.cartao || '',
                mes,
                ano,
                parcelas: rows.length
            }
        };
    },
    total_cartoes_em_aberto: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const rows = filterCardRowsFromPeriod(
            getCreditCardRows(dataSources).filter(row => cardMatches(row, params.cartao)),
            mes,
            ano
        );
        const total = rows.reduce((sum, row) => sum + Number(row.valor || 0), 0);
        const billingMonths = new Set(rows.map(row => row.mesCobranca).filter(Boolean));
        return {
            results: total,
            details: {
                cartao: params.cartao || '',
                mes,
                ano,
                parcelas: rows.length,
                meses: billingMonths.size
            }
        };
    },
    resumo_parcelamentos_cartao: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const rows = filterCardRowsFromPeriod(
            getCreditCardRows(dataSources).filter(row => cardMatches(row, params.cartao)),
            mes,
            ano
        );
        return {
            results: summarizeInstallments(rows),
            details: { cartao: params.cartao || '', mes, ano }
        };
    },
    pergunta_geral: async function(params, dataSources) {
        return { results: 'Pergunta genérica', details: null };
    }
};

async function execute(intent, parameters, dataSources) {
    const calculator = operationRegistry[intent] || operationRegistry.pergunta_geral;
    return await calculator(parameters, dataSources);
}

module.exports = { execute, __test__: { parseBillingMonth, getCreditCardRows, summarizeInstallments } };
