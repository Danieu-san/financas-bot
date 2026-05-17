const { normalizeText, parseSheetDate, parseValue } = require('../utils/helpers');
const { matchesAnyField, fuzzyIncludes } = require('../utils/textMatcher');

function getExpensesByMonthAndCategory(data, month, year, category) {
    const normalizedCategory = normalizeText(category);
    
    return data.filter(row => {
        const rowDate = parseSheetDate(row[0]);
        if (!rowDate) return false;

        const matchesCategory = matchesAnyField(
            [row[2] || '', row[3] || '', row[1] || ''],
            normalizedCategory
        );

        return (
            rowDate.getMonth() === month &&
            rowDate.getFullYear() === year &&
            matchesCategory
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
        const description = row[1] || '';
        return searchTerms.some(term => fuzzyIncludes(description, term, { wordThreshold: 0.65 }));
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
