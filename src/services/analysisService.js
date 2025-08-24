// src/services/analysisService.js

const { normalizeText, parseSheetDate } = require('../utils/helpers');

const parseValue = (valueStr) => {
    if (!valueStr) return 0;
    return parseFloat(valueStr.toString().replace('R$ ', '').replace('.', '').replace(',', '.'));
};

function getExpensesByMonthAndCategory(data, month, year, category) {
    const normalizedCategory = normalizeText(category);
    
    return data.slice(1).filter(row => {
        const rowDate = parseSheetDate(row[0]);
        if (!rowDate) return false;

        const categoriaDaPlanilha = normalizeText(row[2] || '');
        const subcategoriaDaPlanilha = normalizeText(row[3] || '');
        const descricaoDaPlanilha = normalizeText(row[1] || '');
        
        // CORREÇÃO: Busca a palavra-chave em Categoria, Subcategoria ou Descrição
        const categoriaMatch = categoriaDaPlanilha.includes(normalizedCategory);
        const subcategoriaMatch = subcategoriaDaPlanilha.includes(normalizedCategory);
        const descricaoMatch = descricaoDaPlanilha.includes(normalizedCategory);

        return (
            rowDate.getMonth() === month &&
            rowDate.getFullYear() === year &&
            (categoriaMatch || subcategoriaMatch || descricaoMatch)
        );
    });
}

function calculateTotal(data) {
    return data.reduce((sum, row) => sum + parseValue(row[4]), 0);
}

function calculateAverage(data) {
    const total = calculateTotal(data);
    return data.length > 0 ? total / data.length : 0;
}

function countOccurrences(data, keywords, year) {
    return data.slice(1).filter(row => {
        const rowDate = parseSheetDate(row[0]);
        if (!rowDate) return false;
        return (
            keywords.some(keyword => normalizeText(row[1]).includes(normalizeText(keyword))) &&
            rowDate.getFullYear() === year
        );
    });
}

function findMinMax(data) {
    if (data.length <= 1) return { min: null, max: null };

    let minVal = Infinity;
    let maxVal = -Infinity;
    let minItem = null;
    let maxItem = null;

    for (const row of data.slice(1)) {
        const value = parseValue(row[4]);
        if (!isNaN(value)) {
            if (value < minVal) {
                minVal = value;
                minItem = row;
            }
            if (value > maxVal) {
                maxVal = value;
                maxItem = row;
            }
        }
    }

    return {
        min: minItem,
        max: maxItem
    };
}

module.exports = {
    getExpensesByMonthAndCategory,
    calculateTotal,
    calculateAverage,
    countOccurrences,
    findMinMax,
    parseValue
};