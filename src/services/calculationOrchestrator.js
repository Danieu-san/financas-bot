// src/services/calculationOrchestrator.js

const analysisService = require('./analysisService');
const { parseSheetDate, normalizeText } = require('../utils/helpers');

const operationRegistry = {
    total_gastos_categoria_mes: async function(params, dataSources) {
        const saidasFiltradas = dataSources.saidas.slice(1).filter(row => {
        const rowDate = parseSheetDate(row[0]);
        if (!rowDate) return false;
        
        const isMonthMatch = (typeof params.mes === 'number') ? rowDate.getMonth() === params.mes : true;
        const isYearMatch = rowDate.getFullYear() === params.ano;
        if (!isMonthMatch || !isYearMatch) return false;

        const categoria = normalizeText(row[2] || '');
        const subcategoria = normalizeText(row[3] || '');
        const descricao = normalizeText(row[1] || '');
        const normalizedParam = normalizeText(params.categoria);

        return categoria.includes(normalizedParam) || subcategoria.includes(normalizedParam) || descricao.includes(normalizedParam);
    });
    const totalSaidas = analysisService.calculateTotal(saidasFiltradas);

    // 2. Calcula o total das abas de Cartão de Crédito
    let totalCartoes = 0;
    if (dataSources.cartoes && typeof params.mes === 'number') {
        const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        const targetBillingMonth = `${monthNames[params.mes]} de ${params.ano}`;

        dataSources.cartoes.forEach(cardSheetData => {
            if (!cardSheetData || cardSheetData.length <= 1) return;
            cardSheetData.slice(1).forEach(row => {
                const billingMonth = row[5] || ''; // Mês da Fatura na coluna F
                const category = normalizeText(row[2] || ''); // Categoria na coluna C
                
                if (billingMonth === targetBillingMonth && category.includes(normalizeText(params.categoria))) {
                    const value = parseFloat(row[3]) || 0; // Valor na coluna D
                    totalCartoes += value;
                }
            });
        });
    }

    // 3. Soma os dois totais
    const totalFinal = totalSaidas + totalCartoes;
    
    return {
        results: totalFinal,
        details: { categoria: params.categoria, mes: params.mes, ano: params.ano }
    };
},

    media_gastos_categoria_mes: async function(params, dataSources) {
        const filteredData = analysisService.getExpensesByMonthAndCategory(
            dataSources.saidas,
            params.mes,
            params.ano,
            params.categoria
        );
        const media = analysisService.calculateAverage(filteredData);

        return {
            results: media,
            details: {
                itensFiltrados: filteredData,
                quantidadeItens: filteredData.length,
                categoria: params.categoria,
                mes: params.mes,
                ano: params.ano
            }
        };
    },

    listagem_gastos_categoria: async function(params, dataSources) {
        const filteredData = analysisService.getExpensesByMonthAndCategory(
            dataSources.saidas,
            params.mes,
            params.ano,
            params.categoria
        );

        return {
            results: filteredData,
            details: {
                quantidadeItens: filteredData.length,
                categoria: params.categoria,
                mes: params.mes,
                ano: params.ano
            }
        };
    },

    contagem_ocorrencias: async function(params, dataSources) {
        const palavrasChave = params.categoria ? [params.categoria] : (params.palavras || []);
        
        const filteredItems = analysisService.countOccurrences(
            dataSources.saidas, 
            palavrasChave, 
            params.ano,
            params.mes
        );

        return {
            results: filteredItems.length,
            details: {
                itensFiltrados: filteredItems,
                palavrasChave: palavrasChave,
                mes: params.mes,
                ano: params.ano
            }
        };
    },

    gastos_valores_duplicados: async function(params, dataSources) {
        // CORREÇÃO: Lógica robusta de contagem e filtro por mês.
        const valoresContados = new Map();

        if (dataSources.saidas && dataSources.saidas.length > 1) {
            const saidasDoMes = dataSources.saidas.slice(1).filter(row => {
                const rowDate = parseSheetDate(row[0]);
                return rowDate && rowDate.getMonth() === params.mes && rowDate.getFullYear() === params.ano;
            });

            for (const row of saidasDoMes) {
                const valorString = row[4];
                const descricao = row[1];
                if (valorString) {
                    const valorNumerico = analysisService.parseValue(valorString);
                    if (!isNaN(valorNumerico)) {
                        const valorArredondado = Math.round(valorNumerico * 100) / 100;
                        if (!valoresContados.has(valorArredondado)) {
                            valoresContados.set(valorArredondado, []);
                        }
                        valoresContados.get(valorArredondado).push(descricao);
                    }
                }
            }
        }
        
        const duplicatasEncontradas = [];
        for (let [valor, descricoes] of valoresContados.entries()) {
            if (descricoes.length > 1) {
                duplicatasEncontradas.push({ valor, count: descricoes.length, itens: descricoes });
            }
        }

        return {
            results: duplicatasEncontradas,
            details: {
                quantidadeItens: duplicatasEncontradas.length,
                mes: params.mes,
                ano: params.ano
            }
        };
    },

    maior_menor_gasto: async function(params, dataSources) {
        // CORREÇÃO: Filtra pelo mês/ano antes de encontrar o min/max.
        const saidasDoPeriodo = dataSources.saidas.slice(1).filter(row => {
            const rowDate = parseSheetDate(row[0]);
            return rowDate && rowDate.getMonth() === params.mes && rowDate.getFullYear() === params.ano;
        });

        // Adiciona o cabeçalho de volta para a função findMinMax
        const dataParaAnalise = [dataSources.saidas[0], ...saidasDoPeriodo];

        const minMax = analysisService.findMinMax(dataParaAnalise);
        
        return {
            results: { min: minMax.min, max: minMax.max },
            // CORREÇÃO: Retorna os parâmetros para o gerador de resposta.
            details: params
        };
    },

    saldo_do_mes: async function(params, dataSources) {
        // CORREÇÃO: Soma as Entradas e Saídas corretamente.
        const mes = params.mes ?? new Date().getMonth();
        const ano = params.ano ?? new Date().getFullYear();

        const saidasFiltradas = dataSources.saidas.slice(1).filter(row => {
            const rowDate = parseSheetDate(row[0]);
            return rowDate && rowDate.getMonth() === mes && rowDate.getFullYear() === ano;
        });

        const entradasFiltradas = dataSources.entradas.slice(1).filter(row => {
            const rowDate = parseSheetDate(row[0]);
            return rowDate && rowDate.getMonth() === mes && rowDate.getFullYear() === ano;
        });

        const totalSaidas = analysisService.calculateTotal(saidasFiltradas);
        const totalEntradas = analysisService.calculateTotal(entradasFiltradas);
        const saldo = totalEntradas - totalSaidas;

        return {
            results: saldo,
            details: { totalSaidas, totalEntradas, mes, ano }
        };
    },

    pergunta_geral: async function(params, dataSources) {
        return {
            results: 'Pergunta genérica',
            details: null
        };
    }
};

async function execute(intent, parameters, dataSources) {
    const calculator = operationRegistry[intent] || operationRegistry.pergunta_geral;
    return await calculator(parameters, dataSources);
}

module.exports = { execute };