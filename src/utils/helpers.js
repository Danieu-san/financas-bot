// src/utils/helpers.js

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
    if (typeof text !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return false;
    const [day, month, year] = text.split('/').map(Number);
    const parsed = new Date(year, month - 1, day);
    return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
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
    if (dateString === null || dateString === undefined || dateString === '') return null;

    const raw = String(dateString).trim();
    if (/^\d+(\.\d+)?$/.test(raw)) {
        const serial = Number(raw);
        if (!Number.isFinite(serial) || serial <= 0) return null;
        const googleEpoch = Date.UTC(1899, 11, 30);
        const millis = googleEpoch + Math.floor(serial) * 24 * 60 * 60 * 1000;
        const parsed = new Date(millis);
        return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
    }

    const datePart = raw.split(' ')[0];
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
        return null;
    }

    const result = total + current;
    return result >= 0 ? result : null;
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
    const numericWithScale = normalized.match(/^(?:r\$?\s*)?(\d+(?:[.,]\d+)?)\s*(milhao|milhoes|mil)(?:\s+reais?)?$/);
    if (numericWithScale) {
        let amount = parseFloat(numericWithScale[1].replace('.', '').replace(',', '.'));
        if (!isNaN(amount)) {
            const scale = numericWithScale[2] || '';
            if (scale === 'mil') amount *= 1000;
            if (scale === 'milhao' || scale === 'milhoes') amount *= 1000000;
            return amount;
        }
    }

    // 2) Caminho rápido: número puro/formato monetário
    const compact = raw.replace(/\s/g, '');
    if (/^(?:R\$)?\d+(?:\.\d{3})*(?:,\d+)?(?:reais?)?$/i.test(compact) || /^(?:R\$)?\d+(?:\.\d+)?(?:reais?)?$/i.test(compact)) {
        const direct = parseValue(raw.replace(/\s*reais?$/i, ''));
        return direct;
    }

    // 3) Número por extenso em português (ex: dois mil e quinhentos)
    const byWords = parsePortugueseNumberWords(normalized);
    return byWords;
}

const DATE_MONTHS_PT = {
    janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
    julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12
};

function normalizeReferenceDate(now = new Date()) {
    const date = now instanceof Date ? now : new Date(now);
    return Number.isNaN(date.getTime()) ? new Date() : date;
}

function buildDateCandidate(day, month, year, now = new Date()) {
    const reference = normalizeReferenceDate(now);
    const parsedDay = Number.parseInt(day, 10);
    const parsedMonth = Number.parseInt(month, 10);
    if (!Number.isInteger(parsedDay) || !Number.isInteger(parsedMonth)) return null;

    let parsedYear = year ? String(year).trim() : String(reference.getFullYear());
    if (parsedYear.length === 2) parsedYear = `20${parsedYear}`;
    let candidateYear = Number.parseInt(parsedYear, 10);
    if (!Number.isInteger(candidateYear)) return null;

    let candidateDate = new Date(candidateYear, parsedMonth - 1, parsedDay);
    if (!year) {
        const futureLimit = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + 31);
        if (candidateDate > futureLimit) {
            candidateYear -= 1;
            candidateDate = new Date(candidateYear, parsedMonth - 1, parsedDay);
        }
    }

    const candidate = `${String(parsedDay).padStart(2, '0')}/${String(parsedMonth).padStart(2, '0')}/${String(candidateYear)}`;
    return isDate(candidate) ? candidate : null;
}

function parseDateLocal(text, now = new Date()) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const reference = normalizeReferenceDate(now);
    const normalized = normalizeText(raw).replace(/\s+/g, ' ').trim();
    const relativeDays = { ontem: -1, hoje: 0, amanha: 1 };
    if (Object.prototype.hasOwnProperty.call(relativeDays, normalized)) {
        const relative = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + relativeDays[normalized]);
        return getFormattedDateOnly(relative);
    }

    const numericDate = normalized.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
    if (numericDate) {
        return buildDateCandidate(numericDate[1], numericDate[2], numericDate[3], reference);
    }

    const writtenDate = normalized.match(/^(?:no\s+|na\s+)?(?:dia\s+)?(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{2,4}))?$/);
    if (!writtenDate || !DATE_MONTHS_PT[writtenDate[2]]) return null;
    return buildDateCandidate(writtenDate[1], DATE_MONTHS_PT[writtenDate[2]], writtenDate[3], reference);
}

function extractDateFromTextLocal(text, now = new Date()) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const exact = parseDateLocal(raw, now);
    if (exact) return exact;

    const normalized = normalizeText(raw).replace(/\s+/g, ' ').trim();
    const relativeMatch = normalized.match(/\b(ontem|hoje|amanha)\b/);
    if (relativeMatch) return parseDateLocal(relativeMatch[1], now);

    const numericMatch = normalized.match(/\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/);
    if (numericMatch) return parseDateLocal(numericMatch[1], now);

    const monthPattern = Object.keys(DATE_MONTHS_PT).join('|');
    const writtenMatch = normalized.match(new RegExp(`\\b((?:no\\s+|na\\s+)?(?:dia\\s+)?\\d{1,2}\\s+de\\s+(?:${monthPattern})(?:\\s+de\\s+\\d{2,4})?)\\b`));
    if (writtenMatch) return parseDateLocal(writtenMatch[1], now);

    return null;
}

async function parseAmount(text) {
    return parseAmountLocal(text);
}

async function parseDate(text) {
    return parseDateLocal(text);
}

module.exports = {
    isDate,
    getFormattedDate,
    getFormattedDateOnly,
    normalizeText,
    parseSheetDate,
    parseValue,
    parseAmountLocal,
    parseDateLocal,
    extractDateFromTextLocal,
    convertToIsoDateTime,
    parseAmount,
    parseDate
};
