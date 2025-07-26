// src/utils/helpers.js

const parseValue = (text) => {
    if (typeof text !== 'string') return null;
    const value = parseFloat(text.replace('.', '').replace(',', '.'));
    return isNaN(value) ? null : value;
};

const isDate = (text) => {
    if (typeof text !== 'string') return false;
    return /^\d{2}\/\d{2}\/\d{4}$/.test(text);
};

module.exports = {
    parseValue,
    isDate,
};