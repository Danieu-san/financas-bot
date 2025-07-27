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

// FUNÇÃO DE DATA REFINADA
const getFormattedDate = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Mês começa em 0
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
};

module.exports = {
    parseValue,
    isDate,
    getFormattedDate,
};