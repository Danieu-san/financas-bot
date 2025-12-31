const { normalizeText, parseSheetDate, parseValue } = require('../utils/helpers');
const stringSimilarity = require('string-similarity');

function getExpensesByMonthAndCategory(data, month, year, category) {
    const normalizedCategory = normalizeText(category);
    
    return data.filter(row => {
        const rowDate = parseSheetDate(row[0]);
        if (!rowDate) return false;

        const categoriaDaPlanilha = normalizeText(row[2] || '');
        const subcategoriaDaPlanilha = normalizeText(row[3] || '');
        const descricaoDaPlanilha = normalizeText(row[1] || '');
        
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

function calculateTotal(data, valueColumnIndex = 4) {
    return data.reduce((sum, row) => {
        if (row && row[valueColumnIndex]) {
            return sum + parseValue(row[valueColumnIndex]);
        }
        return sum;
    }, 0);
}

function calculateAverage(data) {
    if (data.length === 0) return 0;
    const total = calculateTotal(data);
    return total / data.length;
}

function countOccurrences(data, keywords, year, month) {
    const searchTerms = keywords.map(k => normalizeText(k));

    const filteredByDate = data.filter(row => {
        const rowDate = parseSheetDate(row[0]);
        if (!rowDate) return false;
        const isMonthMatch = (typeof month === 'number') ? rowDate.getMonth() === month : true;
        const isYearMatch = rowDate.getFullYear() === year;
        return isMonthMatch && isYearMatch;
    });

    const matchingRows = filteredByDate.filter(row => {
        const description = normalizeText(row[1] || '');
        const wordsInDescription = description.split(' ');

        return searchTerms.some(term => 
            wordsInDescription.some(word => 
                stringSimilarity.compareTwoStrings(term, word) > 0.65
            )
        );
    });
    
    return matchingRows;
}

function findMinMax(data) {
    if (data.length === 0) return { min: null, max: null };

    let minItem = null;
    let maxItem = null;
    
    let minVal = Infinity;
    let maxVal = -1;

    for (const row of data) {
        const value = parseValue(row[4]);
        if (value < minVal) {
            minVal = value;
            minItem = row;
        }
        if (value > maxVal) {
            maxVal = value;
            maxItem = row;
        }
    }

    return { min: minItem, max: maxItem };
}

module.exports = {
    getExpensesByMonthAndCategory,
    calculateTotal,
    calculateAverage,
    countOccurrences,
    findMinMax,
    parseValue
};