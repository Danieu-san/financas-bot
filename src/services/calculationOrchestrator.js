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

function normalizeCardSearchText(value) {
    return normalizeText(value)
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cardMatches(row, cardName) {
    const needle = normalizeCardSearchText(cardName);
    if (!needle) return true;
    return [row.cardId, row.cartao]
        .map(value => normalizeCardSearchText(value))
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

function summarizeInvoicesByCard(rows) {
    const grouped = new Map();
    rows.forEach((row) => {
        const cardName = String(row.cartao || row.cardId || 'Cartão').trim() || 'Cartão';
        const key = normalizeCardSearchText(cardName) || cardName;
        const existing = grouped.get(key) || {
            cartao: cardName,
            total: 0,
            parcelas: 0
        };
        existing.total += Number(row.valor || 0);
        existing.parcelas += 1;
        grouped.set(key, existing);
    });
    return Array.from(grouped.values())
        .sort((a, b) => b.total - a.total || String(a.cartao).localeCompare(String(b.cartao), 'pt-BR'));
}

function transferRowMatchesMonth(row, mes, ano) {
    const month = getMonthIndex(mes);
    const year = Number.parseInt(ano, 10);
    const rowDate = parseSheetDate(row?.[0]);
    if (!rowDate) return false;
    if (month !== null && rowDate.getMonth() !== month) return false;
    return Number.isInteger(year) && rowDate.getFullYear() === year;
}

function isInvoicePaymentTransfer(row) {
    const status = normalizeText(row?.[7] || '');
    const description = normalizeText(row?.[1] || '');
    return status.includes('pagamento de fatura') ||
        (/fatura/.test(description) && /\b(pagamento|paguei|pag)\b/.test(description)) ||
        description.includes('qrs nu pagament');
}

function summarizeRecurringAccounts(dataSources = {}) {
    const rows = Array.isArray(dataSources.contas) ? dataSources.contas.slice(1) : [];
    const accounts = rows
        .filter(row => String(row?.[0] || row?.[4] || '').trim())
        .map(row => {
            const active = normalizeText(row?.[8] || '') === 'sim';
            const rawDay = Number.parseInt(row?.[1], 10);
            return {
                nome: String(row?.[4] || row?.[0] || 'Conta recorrente').trim(),
                dia: Number.isInteger(rawDay) && rawDay >= 1 && rawDay <= 31 ? rawDay : null,
                categoria: String(row?.[5] || '').trim(),
                subcategoria: String(row?.[6] || '').trim(),
                valorEsperado: row?.[7] || '',
                ativa: active
            };
        })
        .sort((a, b) => {
            const dayA = a.dia || 99;
            const dayB = b.dia || 99;
            if (dayA !== dayB) return dayA - dayB;
            return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
        });

    return {
        results: accounts,
        details: {
            total: accounts.length,
            regrasAtivas: accounts.filter(account => account.ativa).length,
            lembretes: accounts.filter(account => account.dia).length
        }
    };
}

function findHeaderIndex(headers, aliases, fallbackIndex) {
    if (!Array.isArray(headers)) return fallbackIndex;
    const normalizedAliases = aliases.map(alias => normalizeText(alias));
    const found = headers.findIndex(header => normalizedAliases.includes(normalizeText(header)));
    return found >= 0 ? found : fallbackIndex;
}

function isGoalActive(status) {
    const normalized = normalizeText(status || '');
    return !/(concluid|finalizad|atingid|quitad|cancelad|pausad)/.test(normalized);
}

function summarizeGoals(dataSources = {}, { onlyActive = false } = {}) {
    const rows = Array.isArray(dataSources.metas) ? dataSources.metas : [];
    if (rows.length <= 1) {
        return {
            results: [],
            details: { total: 0, ativas: 0, totalAlvo: 0, totalAtual: 0, totalFalta: 0, totalValorMensal: 0 }
        };
    }

    const headers = rows[0] || [];
    const idx = {
        nome: findHeaderIndex(headers, ['Nome', 'Nome da Meta'], 0),
        alvo: findHeaderIndex(headers, ['Valor Alvo', 'Alvo'], 1),
        atual: findHeaderIndex(headers, ['Valor Atual', 'Atual'], 2),
        valorMensal: findHeaderIndex(headers, ['Valor Mensal', 'Valor Mensal Necessário', 'Valor Mensal Sugerido'], 4),
        dataFim: findHeaderIndex(headers, ['Data Fim', 'Data Final', 'Data Alvo', 'Prazo'], 5),
        status: findHeaderIndex(headers, ['Status'], 6),
        prioridade: findHeaderIndex(headers, ['Prioridade'], 7)
    };

    const allGoals = rows.slice(1)
        .filter(row => String(row?.[idx.nome] || '').trim())
        .map(row => {
            const alvo = parseValue(row[idx.alvo]);
            const atual = parseValue(row[idx.atual]);
            const falta = Math.max(0, alvo - atual);
            const progressoPct = alvo > 0 ? Math.min(100, (atual / alvo) * 100) : parseValue(row[3]);
            return {
                nome: String(row[idx.nome] || 'Meta').trim(),
                alvo,
                atual,
                progressoPct,
                falta,
                valorMensal: parseValue(row[idx.valorMensal]),
                dataFim: row[idx.dataFim] || '',
                status: row[idx.status] || '',
                prioridade: row[idx.prioridade] || '',
                ativa: isGoalActive(row[idx.status]) && falta > 0
            };
        })
        .sort((a, b) => Number(b.ativa) - Number(a.ativa) || b.falta - a.falta || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

    const goals = onlyActive ? allGoals.filter(goal => goal.ativa) : allGoals;
    return {
        results: goals,
        details: {
            total: allGoals.length,
            ativas: allGoals.filter(goal => goal.ativa).length,
            totalAlvo: allGoals.reduce((sum, goal) => sum + goal.alvo, 0),
            totalAtual: allGoals.reduce((sum, goal) => sum + goal.atual, 0),
            totalFalta: goals.reduce((sum, goal) => sum + goal.falta, 0),
            totalValorMensal: goals.reduce((sum, goal) => sum + Number(goal.valorMensal || 0), 0)
        }
    };
}

function isReserveTransfer(row) {
    const text = normalizeText(`${row?.[1] || ''} ${row?.[6] || ''} ${row?.[7] || ''}`);
    return ['rdb', 'caixinha', 'nu reserva', 'reserva', 'investimento', 'aplicacao', 'aplicação']
        .some(term => text.includes(normalizeText(term)));
}

function isReserveApplication(row) {
    const description = normalizeText(row?.[1] || '');
    return isReserveTransfer(row) && (
        description.includes('aplicacao') ||
        description.includes('aplicação') ||
        description.includes('guardar') ||
        description.includes('guardado')
    );
}

function isReserveRedemption(row) {
    const description = normalizeText(row?.[1] || '');
    return isReserveTransfer(row) && (
        description.includes('resgate') ||
        description.includes('retirada')
    );
}

function getPeriodExpenseTotal(dataSources, mes, ano) {
    return getUnifiedExpenses(dataSources, mes, ano)
        .reduce((sum, item) => sum + parseValue(item.valor), 0);
}

function previousMonthPeriod(mes, ano) {
    const month = getMonthIndex(mes);
    const year = Number.parseInt(ano, 10);
    if (month === null || !Number.isInteger(year)) return { mes: month, ano: year };
    if (month === 0) return { mes: 11, ano: year - 1 };
    return { mes: month - 1, ano: year };
}

function getSaoPauloToday() {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const [year, month, day] = formatter.format(new Date()).split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function buildDueDateForDay(day, baseDate = getSaoPauloToday()) {
    const dueDay = Number.parseInt(day, 10);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return null;
    const buildCandidate = (year, month) => {
        const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
        return new Date(year, month, Math.min(dueDay, lastDayOfMonth), 12, 0, 0, 0);
    };
    let candidate = buildCandidate(baseDate.getFullYear(), baseDate.getMonth());
    if (candidate < baseDate) {
        candidate = buildCandidate(baseDate.getFullYear(), baseDate.getMonth() + 1);
    }
    return candidate;
}

function formatDateBR(date) {
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
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
    saldo_disponivel_estimado: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const saldoData = await operationRegistry.saldo_do_mes(params, dataSources);
        const transferRows = Array.isArray(dataSources.transferencias) ? dataSources.transferencias.slice(1) : [];
        const monthTransfers = transferRows.filter(row => transferRowMatchesMonth(row, mes, ano));
        const reservaAplicada = monthTransfers
            .filter(isReserveApplication)
            .reduce((sum, row) => sum + parseValue(row[2]), 0);
        const reservaResgatada = monthTransfers
            .filter(isReserveRedemption)
            .reduce((sum, row) => sum + parseValue(row[2]), 0);
        const reservaLiquida = reservaAplicada - reservaResgatada;
        const saldo = Number(saldoData.results || 0);
        return {
            results: saldo - reservaLiquida,
            details: {
                ...saldoData.details,
                saldo,
                reservaAplicada,
                reservaResgatada,
                reservaLiquida
            }
        };
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
    total_faturas_por_cartao: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const rows = getCreditCardRows(dataSources)
            .filter(row => cardMatches(row, params.cartao))
            .filter(row => billingMatches(row, mes, ano));
        const results = summarizeInvoicesByCard(rows);
        return {
            results,
            details: {
                cartao: params.cartao || '',
                mes,
                ano,
                total: results.reduce((sum, item) => sum + Number(item.total || 0), 0),
                cartoes: results.length,
                parcelas: rows.length
            }
        };
    },
    total_pagamentos_fatura_mes: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const rows = (Array.isArray(dataSources.transferencias) ? dataSources.transferencias.slice(1) : [])
            .filter(row => transferRowMatchesMonth(row, mes, ano))
            .filter(isInvoicePaymentTransfer);
        return {
            results: rows.reduce((sum, row) => sum + parseValue(row[2]), 0),
            details: {
                mes,
                ano,
                pagamentos: rows.length,
                canGroupByCard: false
            }
        };
    },
    resumo_contas_recorrentes: async function(params, dataSources) {
        return summarizeRecurringAccounts(dataSources);
    },
    contas_vencendo: async function(params, dataSources) {
        const days = Math.max(1, Number.parseInt(params.dias || '7', 10) || 7);
        const today = getSaoPauloToday();
        const start = params.amanha ? new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 12, 0, 0, 0) : today;
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + (params.amanha ? 0 : days - 1), 23, 59, 59, 999);
        const accounts = summarizeRecurringAccounts(dataSources).results;
        const results = accounts
            .map(account => {
                const dueDate = buildDueDateForDay(account.dia, today);
                if (!dueDate) return null;
                const daysUntil = Math.round((dueDate - today) / (24 * 60 * 60 * 1000));
                return {
                    ...account,
                    data: formatDateBR(dueDate),
                    diasAteVencimento: daysUntil
                };
            })
            .filter(Boolean)
            .filter(account => account.dia && account.diasAteVencimento >= 0 && account.data)
            .filter(account => {
                const dueDate = buildDueDateForDay(account.dia, today);
                return dueDate >= start && dueDate <= end;
            })
            .sort((a, b) => a.diasAteVencimento - b.diasAteVencimento || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
        return { results, details: { dias: days, amanha: Boolean(params.amanha) } };
    },
    resumo_metas: async function(params, dataSources) {
        return summarizeGoals(dataSources);
    },
    progresso_metas: async function(params, dataSources) {
        return summarizeGoals(dataSources, { onlyActive: true });
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
    ranking_cartoes_em_aberto: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const rows = filterCardRowsFromPeriod(getCreditCardRows(dataSources), mes, ano);
        const grouped = new Map();
        rows.forEach((row) => {
            const cardName = String(row.cartao || row.cardId || 'Cartão').trim() || 'Cartão';
            const key = normalizeCardSearchText(cardName) || cardName;
            const existing = grouped.get(key) || { cartao: cardName, total: 0, parcelas: 0 };
            existing.total += Number(row.valor || 0);
            existing.parcelas += 1;
            grouped.set(key, existing);
        });
        return {
            results: Array.from(grouped.values()).sort((a, b) => b.parcelas - a.parcelas || b.total - a.total),
            details: { mes, ano }
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
    ranking_categorias_gastos: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const grouped = new Map();
        getUnifiedExpenses(dataSources, mes, ano).forEach((item) => {
            const categoria = String(item.categoria || 'Outros').trim() || 'Outros';
            const existing = grouped.get(categoria) || { categoria, total: 0, count: 0 };
            existing.total += parseValue(item.valor);
            existing.count += 1;
            grouped.set(categoria, existing);
        });
        const results = Array.from(grouped.values()).sort((a, b) => b.total - a.total || b.count - a.count);
        return {
            results,
            details: {
                ...params,
                mes,
                ano,
                totalGastos: results.reduce((sum, item) => sum + Number(item.total || 0), 0)
            }
        };
    },
    contagem_lancamentos_saida: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        return { results: getUnifiedExpenses(dataSources, mes, ano).length, details: { ...params, mes, ano } };
    },
    comparacao_gastos_periodo: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const previous = previousMonthPeriod(mes, ano);
        const atual = getPeriodExpenseTotal(dataSources, mes, ano);
        const anterior = getPeriodExpenseTotal(dataSources, previous.mes, previous.ano);
        const diferenca = atual - anterior;
        const percentual = anterior > 0 ? (diferenca / anterior) * 100 : 0;
        return {
            results: { atual, anterior, diferenca, percentual },
            details: { ...params, mes, ano, mesAnterior: previous.mes, anoAnterior: previous.ano }
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

module.exports = { execute, __test__: { parseBillingMonth, getCreditCardRows, summarizeInstallments, normalizeCardSearchText, cardMatches } };
