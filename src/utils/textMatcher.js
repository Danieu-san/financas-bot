const stringSimilarity = require('string-similarity');
const { normalizeText } = require('./helpers');

function splitComparableWords(value) {
    return normalizeText(value || '')
        .split(/[^a-z0-9]+/i)
        .map(word => word.trim())
        .filter(word => word.length >= 3);
}

function editDistance(left, right) {
    const a = String(left || '');
    const b = String(right || '');
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

    for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
    for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }

    return dp[a.length][b.length];
}

function isSmallTypo(left, right) {
    const a = normalizeText(left || '');
    const b = normalizeText(right || '');
    if (a.length < 4 || b.length < 4) return false;
    const maxDistance = Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.2));
    return editDistance(a, b) <= maxDistance;
}

function fuzzyIncludes(value, query, options = {}) {
    const normalizedValue = normalizeText(value || '');
    const normalizedQuery = normalizeText(query || '');
    const minWordLength = options.minWordLength || 4;
    const wordThreshold = options.wordThreshold || 0.65;
    const phraseThreshold = options.phraseThreshold || 0.78;

    if (!normalizedQuery) return true;
    if (!normalizedValue) return false;
    if (normalizedValue.includes(normalizedQuery)) return true;
    if (normalizedQuery.length < minWordLength) return false;
    if (stringSimilarity.compareTwoStrings(normalizedValue, normalizedQuery) >= phraseThreshold) return true;

    const queryWords = splitComparableWords(normalizedQuery)
        .filter(word => word.length >= minWordLength);
    const valueWords = splitComparableWords(normalizedValue)
        .filter(word => word.length >= minWordLength);

    return queryWords.some(queryWord =>
        valueWords.some(valueWord =>
            isSmallTypo(valueWord, queryWord) ||
            stringSimilarity.compareTwoStrings(valueWord, queryWord) >= wordThreshold
        )
    );
}

function matchesAnyField(fields, query, options = {}) {
    return fields.some(field => fuzzyIncludes(field, query, options));
}

module.exports = {
    editDistance,
    fuzzyIncludes,
    isSmallTypo,
    matchesAnyField,
    splitComparableWords
};
