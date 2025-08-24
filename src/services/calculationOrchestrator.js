// src/services/calculationOrchestrator.js

const analysisService = require('./analysisService');
const { parseSheetDate } = require('../utils/helpers');

const operationRegistry = {
    total_gastos_categoria_mes: async function(params, dataSources) {
        const filteredData = analysisService.getExpensesByMonthAndCategory(
            dataSources.saidas,
            params.mes,
            params.ano,
            params.categoria
        );
        const total = analysisService.calculateTotal(filteredData);

        return {
            results: total,
            details: {
                itensFiltrados: filteredData,
                quantidadeItens: filteredData.length,
                categoria: params.categoria,
                mes: params.mes,
                ano: params.ano
            }
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
        const filteredItems = analysisService.countOccurrences(
            dataSources.saidas, 
            params.palavras || [], 
            params.ano
        );

        return {
            results: filteredItems.length,
            details: {
                itensFiltrados: filteredItems,
                palavrasChave: params.palavras,
                ano: params.ano
            }
        };
    },

    gastos_valores_duplicados: async function(params, dataSources) {
        // Usamos um Map para lidar melhor com chaves de diferentes tipos
        const valoresContados = new Map();

        if (dataSources.saidas && dataSources.saidas.length > 1) {
            // Filtra os gastos do mês correto
            const saidasDoMes = dataSources.saidas.slice(1).filter(row => {
                const rowDate = parseSheetDate(row[0]);
                return rowDate && rowDate.getMonth() === params.mes && rowDate.getFullYear() === params.ano;
            });

            for (const row of saidasDoMes) {
                const valorString = row[4];
                const descricao = row[1];
                if (valorString) {
                    const valorNumerico = parseFloat(valorString.toString().replace('R$ ', '').replace('.', '').replace(',', '.'));
                    
                    if (!isNaN(valorNumerico)) {
                        const valorArredondado = Math.round(valorNumerico * 100) / 100;
                        
                        if (!valoresContados.has(valorArredondado)) {
                            // CORREÇÃO AQUI: Armazenamos um ARRAY vazio, não um SET
                            valoresContados.set(valorArredondado, []);
                        }
                        // CORREÇÃO AQUI: Adicionamos a descrição ao array
                        valoresContados.get(valorArredondado).push(descricao);
                    }
                }
            }
        }
        
        const duplicatasEncontradas = [];
        
        for (let [valor, descricoes] of valoresContados.entries()) {
            // A lógica de verificação agora checa o tamanho do array
            if (descricoes.length > 1) {
                duplicatasEncontradas.push({ valor: valor, count: descricoes.length, itens: descricoes });
            }
        }

        return {
            results: duplicatasEncontradas,
            details: {
                quantidadeItens: duplicatasEncontradas.length
            }
        };
    },

    maior_menor_gasto: async function(params, dataSources) {
        const minMax = analysisService.findMinMax(dataSources.saidas);
        return {
            results: { min: minMax.min, max: minMax.max },
            details: null
        };
    },

    saldo_do_mes: async function(params, dataSources) {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        const saidasFiltradas = dataSources.saidas.slice(1).filter(row => {
            const rowDate = parseSheetDate(row[0]);
            return rowDate && rowDate.getMonth() === currentMonth && rowDate.getFullYear() === currentYear;
        });

        const entradasFiltradas = dataSources.entradas.slice(1).filter(row => {
            const rowDate = parseSheetDate(row[0]);
            return rowDate && rowDate.getMonth() === currentMonth && rowDate.getFullYear() === currentYear;
        });

        const totalSaidas = analysisService.calculateTotal(saidasFiltradas);
        const totalEntradas = analysisService.calculateTotal(entradasFiltradas);
        const saldo = totalEntradas - totalSaidas;

        return {
            results: saldo,
            details: {
                totalSaidas: totalSaidas,
                totalEntradas: totalEntradas,
                mes: currentMonth,
                ano: currentYear
            }
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