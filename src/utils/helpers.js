// src/utils/helpers.js
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
  const raw = String(dateTimeStr || '').trim();

  const parts = raw.split(' ');
  const datePart = parts[0];
  const timePart = parts[1]; // pode ser undefined

  const [day, month, year] = datePart.split('/');

  // Se não vier hora, define uma hora padrão (ex: 09:00)
  const safeTime = timePart && /^\d{2}:\d{2}$/.test(timePart) ? timePart : '09:00';

  return `${year}-${month}-${day}T${safeTime}:00`;
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

function parsePortugueseNumberWords(text) {
    const normalized = normalizeText(String(text || ''))
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) return null;

    const units = {
        zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
        seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
        quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19
    };
    const tens = {
        vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90
    };
    const hundreds = {
        cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500,
        seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900
    };

    const ignore = new Set(['e', 'reais', 'real', 'r', 'de']);
    const tokens = normalized.split(' ').filter(Boolean).filter(t => !ignore.has(t));

    let total = 0;
    let current = 0;

    for (const token of tokens) {
        if (units[token] !== undefined) {
            current += units[token];
            continue;
        }
        if (tens[token] !== undefined) {
            current += tens[token];
            continue;
        }
        if (hundreds[token] !== undefined) {
            current += hundreds[token];
            continue;
        }
        if (token === 'mil') {
            current = current || 1;
            total += current * 1000;
            current = 0;
            continue;
        }
        if (token === 'milhao' || token === 'milhoes') {
            current = current || 1;
            total += current * 1000000;
            current = 0;
            continue;
        }
    }

    const result = total + current;
    return result > 0 ? result : null;
}

function parseAmountLocal(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const normalized = normalizeText(raw).replace(/\s+/g, ' ').trim();

    // Caso clássico BR de milhar sem decimais (ex: 2.000, 12.500)
    if (/^\d{1,3}(\.\d{3})+$/.test(raw.replace(/\s/g, ''))) {
        const thousands = parseInt(raw.replace(/\./g, ''), 10);
        if (!isNaN(thousands)) return thousands;
    }

    // 1) Número com multiplicador (ex: 2 mil, 1,5 milhao)
    const numericWithScale = normalized.match(/(\d+(?:[.,]\d+)?)\s*(milhao|milhoes|mil)?/);
    if (numericWithScale) {
        let amount = parseFloat(numericWithScale[1].replace('.', '').replace(',', '.'));
        if (!isNaN(amount)) {
            const scale = numericWithScale[2] || '';
            if (scale === 'mil') amount *= 1000;
            if (scale === 'milhao' || scale === 'milhoes') amount *= 1000000;
            if (scale) return amount;
        }
    }

    // 2) Caminho rápido: número puro/formato monetário
    const direct = parseValue(raw);
    if (direct !== 0 || normalized === '0') {
        return direct;
    }

    // 3) Número por extenso em português (ex: dois mil e quinhentos)
    const byWords = parsePortugueseNumberWords(normalized);
    return byWords;
}

module.exports = {
    isDate,
    getFormattedDate,
    getFormattedDateOnly,
    normalizeText,
    parseSheetDate,
    parseValue,
    parseAmountLocal,
    convertToIsoDateTime,
    parseAmount,
    parseDate
};
