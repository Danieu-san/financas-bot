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
    if (!raw) return '';

    const ofxMatch = raw.match(/^(\d{4})(\d{2})(\d{2})/);
    if (ofxMatch) {
        return `${ofxMatch[3]}/${ofxMatch[2]}/${ofxMatch[1]}`;
    }

    const parsed = parseSheetDate(raw);
    return parsed ? getFormattedDateOnly(parsed) : '';
}

function buildImportedDateFields(value) {
    const data = normalizeImportedDate(value);
    if (data) return { data };
    return {
        data: '',
        needsDateInput: true,
        rawDate: String(value || '').trim()
    };
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

function normalizeAlias(value = '') {
    return normalizeText(value)
        .replace(/\b(da|de|do|das|dos|e)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildOwnerAliases(ownerAliases = []) {
    return [...new Set(
        ownerAliases
            .map(normalizeAlias)
            .filter(alias => alias.length >= 3)
    )];
}

function isProbableInternalTransfer(description = '', ownerAliases = []) {
    const text = normalizeAlias(description);
    if (!text) return false;

    if (text.includes('mesma titularidade') || text.includes('mesmo titular')) return true;

    const transferTerms = [
        'transferencia', 'transf', 'ted', 'doc', 'pix enviado', 'pix recebido',
        'envio pix', 'recebimento pix', 'resgate', 'aplicacao', 'aplicacao financeira'
    ];
    const hasTransferTerm = transferTerms.some(term => text.includes(normalizeAlias(term)));
    if (!hasTransferTerm) return false;

    const aliases = buildOwnerAliases(ownerAliases);
    return aliases.some(alias => text.includes(alias));
}

function buildTransfer({ date, description, amount, explicitType = '' }) {
    return {
        type: 'Transferências',
        ...buildImportedDateFields(date),
        descricao: String(description || 'Transferência importada').trim() || 'Transferência importada',
        valor: Math.abs(Number(amount || 0)),
        origem: '',
        destino: '',
        metodo: String(explicitType || '').trim() || 'Importação',
        observacoes: 'Importado de arquivo; não conta como gasto nem renda',
        status: 'Provável transferência interna'
    };
}

function buildTransaction({ date, description, amount, explicitType = '', ownerAliases = [] }) {
    const value = Math.abs(Number(amount || 0));
    if (!value) return null;

    const typeText = normalizeText(explicitType);
    const isIncome = amount > 0 || ['entrada', 'credito', 'crédito', 'credit', 'receita'].some(term => typeText.includes(normalizeText(term)));
    const isExpense = amount < 0 || ['saida', 'saída', 'debito', 'débito', 'debit', 'despesa'].some(term => typeText.includes(normalizeText(term)));
    if (!isIncome && !isExpense) return null;

    const safeDescription = String(description || 'Lançamento importado').trim() || 'Lançamento importado';
    if (isProbableInternalTransfer(safeDescription, ownerAliases)) {
        return buildTransfer({ date, description: safeDescription, amount, explicitType });
    }

    if (isIncome && !isExpense) {
        return {
            type: 'Entradas',
            ...buildImportedDateFields(date),
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
        ...buildImportedDateFields(date),
        descricao: safeDescription,
        categoria: category.categoria,
        subcategoria: category.subcategoria,
        valor: value,
        pagamento: 'Débito',
        recorrente: 'Não',
        observacoes: 'Importado de arquivo'
    };
}

function convertTransactionsForCreditCardStatement(transactions = []) {
    return transactions
        .filter(item => item && item.type === 'Saídas' && !item.duplicate)
        .map(item => ({
            ...item,
            type: 'Cartão',
            parcela: '1/1',
            observacoes: item.observacoes || 'Importado de extrato de cartão'
        }));
}

function transactionsNeedDateInput(transactions = []) {
    return transactions.some(item => item && item.needsDateInput);
}

function applyFallbackDateToTransactions(transactions = [], fallbackDate) {
    const normalizedFallback = normalizeImportedDate(fallbackDate);
    if (!normalizedFallback) return transactions;

    return transactions.map(item => {
        if (!item || !item.needsDateInput) return item;
        const { needsDateInput, rawDate, ...rest } = item;
        return {
            ...rest,
            data: normalizedFallback,
            observacoes: rest.observacoes
                ? `${rest.observacoes}; data informada pelo usuário na importação`
                : 'Data informada pelo usuário na importação'
        };
    });
}

function parseCsvTransactions(text, options = {}) {
    return parseDelimited(text)
        .map(row => {
            const date = pick(row, ['data', 'date', 'dt', 'dtpost']);
            const description = pick(row, ['descricao', 'descrição', 'historico', 'histórico', 'memo', 'name', 'descricao lancamento']);
            const amountRaw = pick(row, ['valor', 'amount', 'valor lancamento', 'quantia']);
            const explicitType = pick(row, ['tipo', 'type', 'natureza']);
            const amount = parseValue(amountRaw);
            return buildTransaction({ date, description, amount, explicitType, ownerAliases: options.ownerAliases });
        })
        .filter(Boolean);
}

function tagValue(block, tag) {
    const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
    const match = String(block || '').match(regex);
    return match ? match[1].trim() : '';
}

function parseOfxTransactions(text, options = {}) {
    const blocks = String(text || '').split(/<STMTTRN>/i).slice(1);
    return blocks
        .map(block => {
            const amount = parseValue(tagValue(block, 'TRNAMT'));
            const description = tagValue(block, 'MEMO') || tagValue(block, 'NAME') || 'Lançamento OFX';
            const date = tagValue(block, 'DTPOSTED');
            const explicitType = tagValue(block, 'TRNTYPE');
            return buildTransaction({ date, description, amount, explicitType, ownerAliases: options.ownerAliases });
        })
        .filter(Boolean);
}

function parseStatementText(text, type, options = {}) {
    if (type === 'ofx') return parseOfxTransactions(text, options);
    return parseCsvTransactions(text, options);
}

function formatMoney(value) {
    return Number(value || 0).toFixed(2).replace('.', ',');
}

function valueToCents(value) {
    const parsed = typeof value === 'number' ? value : parseValue(value);
    return Math.round(Math.abs(Number(parsed || 0)) * 100);
}

function normalizeDateKey(value) {
    const parsed = parseSheetDate(value);
    return parsed ? getFormattedDateOnly(parsed) : normalizeImportedDate(value);
}

function normalizeDescriptionKey(value = '') {
    return normalizeText(value)
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 140);
}

function buildImportDuplicateKey(item = {}) {
    return [
        item.type || '',
        normalizeDateKey(item.data),
        valueToCents(item.valor),
        normalizeDescriptionKey(item.descricao)
    ].join('|');
}

function existingRowToTransaction(sheetName, row = []) {
    if (sheetName === 'Entradas') {
        return { type: 'Entradas', data: row[0], descricao: row[1], valor: row[3] };
    }
    if (sheetName === 'Transferências') {
        return { type: 'Transferências', data: row[0], descricao: row[1], valor: row[2] };
    }
    if (sheetName === 'Cartão' || sheetName === 'Lançamentos Cartão' || String(sheetName || '').startsWith('Cartão ')) {
        return { type: 'Cartão', data: row[0], descricao: row[1], valor: row[3] };
    }
    return { type: 'Saídas', data: row[0], descricao: row[1], valor: row[4] };
}

function buildExistingDuplicateKeys(existingRowsByType = {}) {
    const keys = new Set();
    for (const [sheetName, rows] of Object.entries(existingRowsByType || {})) {
        for (const row of rows || []) {
            const item = existingRowToTransaction(sheetName, row);
            const key = buildImportDuplicateKey(item);
            if (key) keys.add(key);
        }
    }
    return keys;
}

function annotateImportDuplicates(transactions = [], existingRowsByType = {}) {
    const existingKeys = buildExistingDuplicateKeys(existingRowsByType);
    const batchKeys = new Set();

    return transactions.map((item) => {
        const key = buildImportDuplicateKey(item);
        const duplicateInSpreadsheet = existingKeys.has(key);
        const duplicateInFile = batchKeys.has(key);
        batchKeys.add(key);

        if (!duplicateInSpreadsheet && !duplicateInFile) return item;

        return {
            ...item,
            duplicate: true,
            duplicateReason: duplicateInSpreadsheet
                ? 'já existe na planilha'
                : 'repetido no arquivo'
        };
    });
}

function transactionLabel(item) {
    if (item.duplicate) return 'Duplicado';
    if (item.type === 'Entradas') return 'Entrada';
    if (item.type === 'Transferências') return 'Transferência';
    if (item.type === 'Cartão') return 'Cartão';
    return 'Saída';
}

function formatPreviewLine(item, index) {
    const duplicateSuffix = item.duplicate ? ` | ${item.duplicateReason}; será ignorado` : '';
    const dateLabel = item.data || 'data pendente';
    const billingSuffix = item.type === 'Cartão' && item.mesCobranca ? ` | Fatura: ${item.mesCobranca}` : '';
    return `${index + 1}. [${transactionLabel(item)}] ${dateLabel} | ${item.descricao} | R$ ${formatMoney(item.valor)} | ${item.categoria || item.status || 'Outros'}${billingSuffix}${duplicateSuffix}`;
}

function buildImportSummary(transactions = []) {
    const entradas = transactions.filter(item => item.type === 'Entradas');
    const saidas = transactions.filter(item => item.type === 'Saídas');
    const cartoes = transactions.filter(item => item.type === 'Cartão');
    const transferencias = transactions.filter(item => item.type === 'Transferências');
    const duplicados = transactions.filter(item => item.duplicate);
    const importaveis = transactions.filter(item => !item.duplicate);
    const totalEntradas = entradas.reduce((sum, item) => sum + Number(item.valor || 0), 0);
    const totalSaidas = saidas.reduce((sum, item) => sum + Number(item.valor || 0), 0);
    const totalCartoes = cartoes.reduce((sum, item) => sum + Number(item.valor || 0), 0);
    const totalTransferencias = transferencias.reduce((sum, item) => sum + Number(item.valor || 0), 0);

    const summary = [
        `Encontrei ${transactions.length} lançamento(s) no arquivo.`,
        `Novos que serão importados: ${importaveis.length}`,
        `Entradas no arquivo: ${entradas.length} (R$ ${formatMoney(totalEntradas)})`,
        `Saídas no arquivo: ${saidas.length} (R$ ${formatMoney(totalSaidas)})`,
        `Cartão no arquivo: ${cartoes.length} (R$ ${formatMoney(totalCartoes)})`,
        `Transferências internas prováveis no arquivo: ${transferencias.length} (R$ ${formatMoney(totalTransferencias)})`
    ];
    if (duplicados.length > 0) {
        summary.push(`Possíveis duplicados: ${duplicados.length} (serão ignorados)`);
    }
    return summary;
}

function buildImportPreviewMessage(transactions = []) {
    if (!transactions.length) {
        return 'Não encontrei lançamentos válidos no arquivo. Confira se ele tem data, descrição e valor.';
    }
    return [
        ...buildImportSummary(transactions),
        '',
        transactions.map(formatPreviewLine).join('\n'),
        '',
        'Responda `sim` para importar ou `não` para cancelar.'
    ].join('\n');
}

function buildImportPreviewMessages(transactions = [], options = {}) {
    const maxMessageLength = Number(options.maxMessageLength || 3000);
    const full = buildImportPreviewMessage(transactions);
    if (full.length <= maxMessageLength || !transactions.length) return [full];

    const summary = buildImportSummary(transactions);
    const lines = transactions.map(formatPreviewLine);
    const chunks = [];
    let current = [...summary, ''];

    for (const line of lines) {
        const candidate = [...current, line].join('\n');
        if (candidate.length > maxMessageLength && current.length > summary.length + 1) {
            chunks.push(current.join('\n'));
            current = [line];
        } else {
            current.push(line);
        }
    }
    if (current.length) chunks.push(current.join('\n'));

    const total = chunks.length;
    return chunks.map((chunk, index) => {
        const header = `Prévia da importação - Parte ${index + 1}/${total}`;
        const footer = index === total - 1
            ? '\n\nResponda `sim` para importar ou `não` para cancelar.'
            : '';
        return `${header}\n${chunk}${footer}`;
    });
}

function parseImportMedia(media = {}, msg = {}, options = {}) {
    const detected = detectImportFileType(media, msg);
    if (!detected.supported) {
        return { supported: false, reason: detected.reason, type: detected.type, transactions: [] };
    }
    const text = decodeMediaText(media);
    const transactions = parseStatementText(text, detected.type, options);
    const previewMessages = buildImportPreviewMessages(transactions);
    return {
        supported: true,
        type: detected.type,
        filename: detected.filename,
        transactions,
        preview: previewMessages.join('\n\n'),
        previewMessages
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
    buildImportPreviewMessages,
    annotateImportDuplicates,
    applyFallbackDateToTransactions,
    buildImportDuplicateKey,
    convertTransactionsForCreditCardStatement,
    detectImportFileType,
    parseCsvTransactions,
    parseImportMedia,
    parseOfxTransactions,
    parseStatementText,
    transactionsNeedDateInput,
    unsupportedImportMessage,
    __test__: {
        applyFallbackDateToTransactions,
        buildExistingDuplicateKeys,
        buildTransaction,
        convertTransactionsForCreditCardStatement,
        isProbableInternalTransfer,
        parseDelimited,
        splitDelimitedLine
    }
};
