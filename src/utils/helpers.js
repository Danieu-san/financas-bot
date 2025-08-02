const parseValue = (text) => {
    if (typeof text !== 'string') return null;
    const value = parseFloat(text.replace('.', '').replace(',', '.'));
    return isNaN(value) ? null : value;
};

const isDate = (text) => {
    if (typeof text !== 'string') return false;
    return /^\d{2}\/\d{2}\/\d{4}$/.test(text);
};

// Função padrão COM HORA (para Saídas, Entradas, etc.)
const getFormattedDate = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Mês começa em 0
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
};

// Função específica APENAS SEM HORA (para a Data de Início da Dívida)
const getFormattedDateOnly = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();

    return `${day}/${month}/${year}`;
};

const normalizeText = (text) => {
    if (typeof text !== 'string') return '';
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
};

module.exports = {
    parseValue,
    isDate,
    getFormattedDate,
    getFormattedDateOnly, // Exportamos a nova função
    normalizeText,
};