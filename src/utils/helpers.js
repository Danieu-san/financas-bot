const { askLLM } = require('../services/gemini');

const parseValue = (valueStr) => {
    if (!valueStr) return 0;

    let sanitized = String(valueStr).replace(/R\$\s*/, '').trim();

    // Se o número usa vírgula como decimal (formato brasileiro, ex: "1.800,50")
    if (sanitized.includes(',')) {
        // Remove os pontos de milhar e troca a vírgula por ponto
        sanitized = sanitized.replace(/\./g, '').replace(',', '.');
    }
    // Se não tiver vírgula, o ponto já é o decimal (formato americano, ex: "120.50"), então não fazemos nada.

    const value = parseFloat(sanitized);
    return isNaN(value) ? 0 : value;
};

const isDate = (text) => {
    if (typeof text !== 'string') return false;
    return /^\d{2}\/\d{2}\/\d{4}$/.test(text);
};

const getFormattedDate = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
};

const getFormattedDateOnly = (date = new Date()) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

const normalizeText = (text) => {
    if (typeof text !== 'string') return '';
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
};

const parseSheetDate = (dateString) => {
    if (!dateString || typeof dateString !== 'string') return null;
    const datePart = dateString.split(' ')[0];
    const parts = datePart.split('/');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts;
    if (isNaN(day) || isNaN(month) || isNaN(year)) {
        return null;
    }
    return new Date(year, month - 1, day);
};

const convertToIsoDateTime = (dateTimeStr) => {
    const [datePart, timePart] = dateTimeStr.split(' ');
    const [day, month, year] = datePart.split('/');
    // Formato final: YYYY-MM-DDTHH:MM:SS
    return `${year}-${month}-${day}T${timePart}:00`;
};

async function parseNumberFromText(text) {
    // Se o texto já parece um número, não gasta uma chamada de IA
    if (!isNaN(parseFloat(text))) {
        return parseFloat(text);
    }
    const prompt = `Converta o seguinte texto para um número em dígitos. Responda APENAS com o número. Se não for um número claro, responda com "erro".\n\nTexto: "${text}"`;
    try {
        const response = await askLLM(prompt);
        const number = parseFloat(response);
        return isNaN(number) ? null : number;
    } catch (error) {
        console.error("Erro ao tentar converter texto para número via IA:", error);
        return null;
    }
}

// Nossa nova "super função" de parse
async function parseAmount(text) {
    // Tentativa 1: O caminho rápido, para números digitados
    const directParse = parseValue(text);
    if (directParse !== 0 || text.trim() === '0') { // O parseValue funciona
        return directParse;
    }
    
    // Tentativa 2: O caminho inteligente, para números falados (ex: "cinco mil")
    const llmParse = await parseNumberFromText(text);
    return llmParse;
}

async function parseDate(text) {
    // Tentativa 1: O caminho rápido, para datas digitadas
    if (isDate(text)) {
        return text;
    }

    // Tentativa 2: O caminho inteligente, para datas faladas
    const today = new Date().toLocaleDateString('pt-BR');
    const prompt = `Converta o texto a seguir para uma data no formato DD/MM/AAAA. A data de hoje é ${today}. Se não for uma data clara, responda 'erro'.\n\nTexto: "${text}"`;
    try {
        const response = await askLLM(prompt);
        // Se a resposta da IA for uma data válida, retorna. Senão, retorna null.
        return isDate(response) ? response : null;
    } catch (error) {
        console.error("Erro ao tentar converter texto para data via IA:", error);
        return null;
    }
}

module.exports = {
    isDate,
    getFormattedDate,
    getFormattedDateOnly,
    normalizeText,
    parseSheetDate,
    parseValue,
    convertToIsoDateTime,
    parseAmount,
    parseDate
};