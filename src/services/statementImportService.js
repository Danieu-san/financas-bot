const { getFormattedDateOnly, normalizeText, parseSheetDate, parseValue } = require('../utils/helpers');

const SUPPORTED_EXTENSIONS = new Set(['csv', 'ofx']);
const SUPPORTED_MIME_HINTS = [
    'text/csv',
    'application/csv',
    'application/ofx',
    'application/x-ofx',
    'application/vnd.ms-excel',
    'text/plain'
];

function getMediaFilename(media = {}, msg = {}) {
    return String(
        media.filename ||
        msg?._data?.filename ||
        msg?.filename ||
        ''
    ).trim();
}

function getFileExtension(filename = '') {
    const match = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
}

function detectImportFileType(media = {}, msg = {}) {
    const mimetype = String(media.mimetype || '').toLowerCase();
    const filename = getMediaFilename(media, msg);
    const extension = getFileExtension(filename);

    if (mimetype.startsWith('image/') || extension === 'pdf' || mimetype.includes('pdf')) {
        return { supported: false, type: extension || mimetype, reason: 'unsupported_binary' };
    }

    if (SUPPORTED_EXTENSIONS.has(extension)) {
        return { supported: true, type: extension, filename };
    }

    if (SUPPORTED_MIME_HINTS.some(hint => mimetype.includes(hint))) {
        if (mimetype.includes('ofx')) return { supported: true, type: 'ofx', filename };
        return { supported: true, type: 'csv', filename };
    }

    return { supported: false, type: extension || mimetype || 'desconhecido', reason: 'unsupported_type' };
}

function decodeMediaText(media = {}) {
    const data = String(media.data || '');
    if (!data) return '';
    return Buffer.from(data, 'base64').toString('utf8').replace(/^\uFEFF/, '');
}

function splitDelimitedLine(line, delimiter) {
    const cells = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const next = line[i + 1];
        if (char === '"' && next === '"') {
            current += '"';
            i += 1;
            continue;
        }
        if (char === '"') {
            inQuotes = !inQuotes;
            continue;
        }
        if (char === delimiter && !inQuotes) {
            cells.push(current.trim());
            current = '';
            continue;
        }
        current += char;
    }
    cells.push(current.trim());
    return cells;
}

function parseDelimited(text) {
    const lines = String(text || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    if (lines.length < 2) return [];

    const first = lines[0];
    const delimiter = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
    const headers = splitDelimitedLine(first, delimiter).map(header => normalizeText(header));

    return lines.slice(1).map(line => {
        const cells = splitDelimitedLine(line, delimiter);
        return Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']));
    });
}

function pick(row, aliases) {
    for (const alias of aliases) {
        const key = normalizeText(alias);
        if (row[key] !== undefined && row[key] !== '') return row[key];
    }
    return '';
}

function normalizeImportedDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return getFormattedDateOnly(new Date());

    const ofxMatch = raw.match(/^(\d{4})(\d{2})(\d{2})/);
    if (ofxMatch) {
        return `${ofxMatch[3]}/${ofxMatch[2]}/${ofxMatch[1]}`;
    }

    const parsed = parseSheetDate(raw);
    return parsed ? getFormattedDateOnly(parsed) : raw;
}

function categorizeExpense(description = '') {
    const text = normalizeText(description);
    const rules = [
        { terms: ['mercado', 'supermercado', 'guanabara', 'assai', 'assaí'], categoria: 'Alimentação', subcategoria: 'SUPERMERCADO' },
        { terms: ['restaurante', 'ifood', 'lanche', 'padaria'], categoria: 'Alimentação', subcategoria: 'RESTAURANTE / LANCHE' },
        { terms: ['uber', '99', 'onibus', 'ônibus', 'metro', 'metrô', 'trem', 'gasolina'], categoria: 'Transporte', subcategoria: 'TRANSPORTE' },
        { terms: ['farmacia', 'farmácia', 'remedio', 'remédio', 'consulta'], categoria: 'Saúde', subcategoria: 'SAÚDE' },
        { terms: ['aluguel', 'condominio', 'condomínio', 'luz', 'energia', 'agua', 'água', 'internet'], categoria: 'Moradia', subcategoria: 'CONTAS DA CASA' }
    ];
    const found = rules.find(rule => rule.terms.some(term => text.includes(normalizeText(term))));
    return found || { categoria: 'Outros', subcategoria: 'Importação' };
}

function categorizeIncome(description = '') {
    const text = normalizeText(description);
    if (text.includes('salario') || text.includes('salário') || text.includes('pagamento')) return 'Salário';
    if (text.includes('freela') || text.includes('freelance')) return 'Renda Extra';
    if (text.includes('reembolso')) return 'Reembolso';
    if (text.includes('venda')) return 'Venda';
    return 'Outros';
}

function buildTransaction({ date, description, amount, explicitType = '' }) {
    const value = Math.abs(Number(amount || 0));
    if (!value) return null;

    const typeText = normalizeText(explicitType);
    const isIncome = amount > 0 || ['entrada', 'credito', 'crédito', 'credit', 'receita'].some(term => typeText.includes(normalizeText(term)));
    const isExpense = amount < 0 || ['saida', 'saída', 'debito', 'débito', 'debit', 'despesa'].some(term => typeText.includes(normalizeText(term)));
    if (!isIncome && !isExpense) return null;

    const safeDescription = String(description || 'Lançamento importado').trim() || 'Lançamento importado';
    if (isIncome && !isExpense) {
        return {
            type: 'Entradas',
            data: normalizeImportedDate(date),
            descricao: safeDescription,
            categoria: categorizeIncome(safeDescription),
            valor: value,
            recebimento: 'Conta Corrente',
            recorrente: 'Não',
            observacoes: 'Importado de arquivo'
        };
    }

    const category = categorizeExpense(safeDescription);
    return {
        type: 'Saídas',
        data: normalizeImportedDate(date),
        descricao: safeDescription,
        categoria: category.categoria,
        subcategoria: category.subcategoria,
        valor: value,
        pagamento: 'Débito',
        recorrente: 'Não',
        observacoes: 'Importado de arquivo'
    };
}

function parseCsvTransactions(text) {
    return parseDelimited(text)
        .map(row => {
            const date = pick(row, ['data', 'date', 'dt', 'dtpost']);
            const description = pick(row, ['descricao', 'descrição', 'historico', 'histórico', 'memo', 'name', 'descricao lancamento']);
            const amountRaw = pick(row, ['valor', 'amount', 'valor lancamento', 'quantia']);
            const explicitType = pick(row, ['tipo', 'type', 'natureza']);
            const amount = parseValue(amountRaw);
            return buildTransaction({ date, description, amount, explicitType });
        })
        .filter(Boolean);
}

function tagValue(block, tag) {
    const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
    const match = String(block || '').match(regex);
    return match ? match[1].trim() : '';
}

function parseOfxTransactions(text) {
    const blocks = String(text || '').split(/<STMTTRN>/i).slice(1);
    return blocks
        .map(block => {
            const amount = parseValue(tagValue(block, 'TRNAMT'));
            const description = tagValue(block, 'MEMO') || tagValue(block, 'NAME') || 'Lançamento OFX';
            const date = tagValue(block, 'DTPOSTED');
            const explicitType = tagValue(block, 'TRNTYPE');
            return buildTransaction({ date, description, amount, explicitType });
        })
        .filter(Boolean);
}

function parseStatementText(text, type) {
    if (type === 'ofx') return parseOfxTransactions(text);
    return parseCsvTransactions(text);
}

function buildImportPreviewMessage(transactions = []) {
    if (!transactions.length) {
        return 'Não encontrei lançamentos válidos no arquivo. Confira se ele tem data, descrição e valor.';
    }
    const entradas = transactions.filter(item => item.type === 'Entradas');
    const saidas = transactions.filter(item => item.type === 'Saídas');
    const totalEntradas = entradas.reduce((sum, item) => sum + Number(item.valor || 0), 0);
    const totalSaidas = saidas.reduce((sum, item) => sum + Number(item.valor || 0), 0);
    const lines = transactions.slice(0, 10).map((item, index) => {
        const label = item.type === 'Entradas' ? 'Entrada' : 'Saída';
        return `${index + 1}. [${label}] ${item.data} | ${item.descricao} | R$ ${Number(item.valor || 0).toFixed(2).replace('.', ',')} | ${item.categoria || 'Outros'}`;
    });
    const extra = transactions.length > 10 ? `\n... e mais ${transactions.length - 10} lançamento(s).` : '';
    return [
        `Encontrei ${transactions.length} lançamento(s) no arquivo.`,
        `Entradas: ${entradas.length} (R$ ${totalEntradas.toFixed(2).replace('.', ',')})`,
        `Saídas: ${saidas.length} (R$ ${totalSaidas.toFixed(2).replace('.', ',')})`,
        '',
        lines.join('\n') + extra,
        '',
        'Responda `sim` para importar ou `não` para cancelar.'
    ].join('\n');
}

function parseImportMedia(media = {}, msg = {}) {
    const detected = detectImportFileType(media, msg);
    if (!detected.supported) {
        return { supported: false, reason: detected.reason, type: detected.type, transactions: [] };
    }
    const text = decodeMediaText(media);
    const transactions = parseStatementText(text, detected.type);
    return {
        supported: true,
        type: detected.type,
        filename: detected.filename,
        transactions,
        preview: buildImportPreviewMessage(transactions)
    };
}

function unsupportedImportMessage(reason) {
    if (reason === 'unsupported_binary') {
        return 'Por enquanto eu só importo extratos em CSV ou OFX. PDF e imagens ficam fora deste MVP.';
    }
    return 'Não reconheci esse arquivo para importação. Envie um extrato em CSV ou OFX.';
}

module.exports = {
    buildImportPreviewMessage,
    detectImportFileType,
    parseCsvTransactions,
    parseImportMedia,
    parseOfxTransactions,
    parseStatementText,
    unsupportedImportMessage,
    __test__: {
        buildTransaction,
        parseDelimited,
        splitDelimitedLine
    }
};
