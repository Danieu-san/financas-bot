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

function normalizeHeader(value = '') {
    return normalizeText(String(value || ''))
        .replace(/\s+/g, ' ')
        .trim();
}

function chooseDelimiter(lines = []) {
    let semicolonScore = 0;
    let commaScore = 0;
    for (const line of lines) {
        semicolonScore = Math.max(semicolonScore, (line.match(/;/g) || []).length);
        commaScore = Math.max(commaScore, (line.match(/,/g) || []).length);
    }
    return semicolonScore >= commaScore ? ';' : ',';
}

function headerHasAny(headers = [], aliases = []) {
    const normalizedAliases = aliases.map(normalizeHeader);
    return headers.some(header => normalizedAliases.includes(header));
}

function findHeaderLineIndex(lines = [], delimiter) {
    for (let index = 0; index < lines.length; index += 1) {
        const headers = splitDelimitedLine(lines[index], delimiter).map(normalizeHeader);
        const hasDate = headerHasAny(headers, ['data', 'date', 'dt', 'dtpost', 'data lançamento', 'data lancamento', 'data movimento']);
        const hasDescription = headerHasAny(headers, [
            'descricao', 'descrição', 'historico', 'histórico', 'memo', 'name',
            'descricao lancamento', 'lançamentos', 'lancamentos', 'title', 'titulo'
        ]);
        const hasAmount = headerHasAny(headers, [
            'valor', 'amount', 'valor lancamento', 'valor lançamento', 'quantia',
            'valor (r$)', 'debito', 'débito', 'credito', 'crédito'
        ]);
        if (hasDate && hasDescription && hasAmount) return index;
    }
    return 0;
}

function parseDelimited(text) {
    const lines = String(text || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    if (lines.length < 2) return [];

    const delimiter = chooseDelimiter(lines);
    const headerIndex = findHeaderLineIndex(lines, delimiter);
    const headers = splitDelimitedLine(lines[headerIndex], delimiter).map(normalizeHeader);

    return lines.slice(headerIndex + 1).map(line => {
        const cells = splitDelimitedLine(line, delimiter);
        return Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']));
    });
}

function pick(row, aliases) {
    for (const alias of aliases) {
        const key = normalizeHeader(alias);
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

    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
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
        { terms: ['99food', 'ifood'], categoria: 'Alimentação', subcategoria: 'RESTAURANTE / LANCHE' },
        { terms: ['mcdonalds', 'macdonalds', 'lanche', 'lanchonete', 'panificacao', 'panificação', 'cafe', 'café', 'frutt', 'fruti', 'hortifruti', 'hortfruti', 'pastel'], categoria: 'Alimentação', subcategoria: 'RESTAURANTE / LANCHE' },
        { terms: ['mercadolivre', 'mercado livre', 'shopee', 'shein', 'amazon'], categoria: 'Compras', subcategoria: 'COMPRAS ONLINE' },
        { terms: ['gci caixa', 'habitacao', 'habitação', 'ccisa', 'incorporadora', 'llz garantidora', 'aluguel', 'condominio', 'condomínio'], categoria: 'Moradia', subcategoria: 'HABITAÇÃO' },
        { terms: ['light', 'energia', 'eletricidade'], categoria: 'Moradia', subcategoria: 'ENERGIA' },
        { terms: ['ceg', 'naturgy', 'gas natural', 'gás natural', 'agua', 'água'], categoria: 'Moradia', subcategoria: 'CONTAS DA CASA' },
        { terms: ['claro', 'vivo', 'tim', 'internet', 'telefone'], categoria: 'Moradia', subcategoria: 'INTERNET / TELEFONE' },
        { terms: ['reforma', 'material de construcao', 'material de construção', 'obra casa'], categoria: 'Moradia', subcategoria: 'REFORMA / MANUTENÇÃO' },
        { terms: ['mercado', 'supermercado', 'guanabara', 'assai', 'assaí', 'hortifruti', 'hortfruti'], categoria: 'Alimentação', subcategoria: 'SUPERMERCADO' },
        { terms: ['restaurante', 'ifood', 'lanche', 'padaria', 'pastel'], categoria: 'Alimentação', subcategoria: 'RESTAURANTE / LANCHE' },
        { terms: ['uber', 'uberrides', '99', '99 ride', 'riocard', 'mais mobi', 'onibus', 'ônibus', 'metro', 'metrô', 'trem', 'gasolina', 'auto posto', 'posto', 'veloe', 'estacionamento', 'auto pecas', 'auto peças'], categoria: 'Transporte', subcategoria: 'TRANSPORTE' },
        { terms: ['farmacia', 'farmácia', 'drogaria', 'pacheco', 'remedio', 'remédio', 'consulta', 'amorsaude', 'amor saude', 'amor saúde', 'biostevi', 'gymnast'], categoria: 'Saúde', subcategoria: 'SAÚDE' },
        { terms: ['cinema', 'cine'], categoria: 'Lazer', subcategoria: 'ENTRETENIMENTO' },
        { terms: ['barbershop', 'barbearia', 'perfumaria', 'dona chic', 'demas divas', 'demas & divas'], categoria: 'Cuidados Pessoais', subcategoria: 'BELEZA / CUIDADOS' },
        { terms: ['open english', 'qconcursos', 'curso', 'aula', 'livro'], categoria: 'Educação', subcategoria: 'CURSOS / ESTUDOS' },
        { terms: ['apple.com/bill', 'apple', 'canva', 'capcut', 'moises', 'google', 'melimais', 'assinatura', 'premium', 'premiun'], categoria: 'Assinaturas', subcategoria: 'SERVIÇOS DIGITAIS' },
        { terms: ['iof', 'multa por fatura', 'juros'], categoria: 'Taxas e Juros', subcategoria: 'ENCARGOS FINANCEIROS' }
    ];
    const found = rules.find(rule => rule.terms.some(term => normalizedTextIncludesTerm(text, term)));
    return found || { categoria: 'Outros', subcategoria: 'Importação' };
}

function inferRecurringBillClassification(label = '') {
    const text = normalizeText(label);
    const directRules = [
        { terms: ['aluguel'], categoria: 'Moradia', subcategoria: 'ALUGUEL' },
        { terms: ['condominio', 'condomínio'], categoria: 'Moradia', subcategoria: 'CONDOMÍNIO' },
        { terms: ['iptu'], categoria: 'Moradia', subcategoria: 'IPTU' },
        { terms: ['luz', 'energia'], categoria: 'Moradia', subcategoria: 'ENERGIA' },
        { terms: ['agua', 'água'], categoria: 'Moradia', subcategoria: 'ÁGUA' },
        { terms: ['internet', 'telefone'], categoria: 'Moradia', subcategoria: 'INTERNET / TELEFONE' },
        { terms: ['escola', 'faculdade', 'curso'], categoria: 'Educação', subcategoria: 'MENSALIDADE / CURSO' },
        { terms: ['plano de saude', 'plano saúde', 'saude', 'saúde'], categoria: 'Saúde', subcategoria: 'PLANO / RECORRENTE' },
        { terms: ['assinatura', 'netflix', 'spotify', 'canva', 'google', 'apple'], categoria: 'Assinaturas', subcategoria: 'SERVIÇOS DIGITAIS' }
    ];
    const direct = directRules.find(rule => rule.terms.some(term => normalizedTextIncludesTerm(text, term)));
    return direct || categorizeExpense(label);
}

function titleCaseLabel(value = '') {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .replace(/(^|\s)(\S)/g, (_, space, char) => `${space}${char.toUpperCase()}`);
}

function parseRecurringBillClassificationReply(text = '') {
    const raw = String(text || '').trim();
    const normalized = normalizeText(raw);
    if (!normalized) return null;

    if (['so lembrar', 'só lembrar', 'apenas lembrar', 'sem regra', 'nao classificar', 'não classificar'].includes(normalized)) {
        return {
            friendlyName: '',
            categoria: '',
            subcategoria: '',
            expectedValue: '',
            ruleActive: 'NÃO'
        };
    }

    const [labelPart, valuePart = ''] = raw.split(/\s*;\s*/);
    const classification = inferRecurringBillClassification(labelPart);
    return {
        friendlyName: titleCaseLabel(labelPart),
        categoria: classification.categoria || 'Outros',
        subcategoria: classification.subcategoria || 'Importação',
        expectedValue: valuePart.trim(),
        ruleActive: 'SIM'
    };
}

function buildRecurringBillClassificationQuestion(candidate = {}) {
    return [
        'Perfeito. Como devo chamar e classificar essa conta daqui para frente?',
        '',
        `Nome detectado no extrato: "${candidate.description || 'conta recorrente'}"`,
        `Vencimento provável: dia ${candidate.suggestedDueDay || 1}`,
        '',
        'Responda com algo simples, por exemplo:',
        '- aluguel',
        '- internet',
        '- luz',
        '',
        'Se quiser só o lembrete, sem classificar futuros lançamentos, responda `só lembrar`.'
    ].join('\n');
}

function accountRuleIsActive(value) {
    const normalized = normalizeText(String(value || 'SIM'));
    return !['nao', 'não', 'n', 'false', '0', 'inativo', 'desativado'].includes(normalized);
}

function accountRowsToClassificationRules(accountRows = []) {
    return (accountRows || [])
        .map(row => {
            const rawName = String(row?.[0] || '').trim();
            const friendlyName = String(row?.[4] || '').trim();
            const categoria = String(row?.[5] || '').trim();
            const subcategoria = String(row?.[6] || '').trim();
            const expectedValue = String(row?.[7] || '').trim();
            const active = accountRuleIsActive(row?.[8]);
            if (!rawName || !categoria || !active) return null;
            return {
                rawName,
                friendlyName,
                categoria,
                subcategoria: subcategoria || 'Importação',
                expectedValue,
                signature: recurringDescriptionSignature(rawName)
            };
        })
        .filter(Boolean);
}

function accountRuleMatchesDescription(rule = {}, description = '') {
    const text = normalizeText(description);
    const rawName = normalizeText(rule.rawName || '');
    if (!text || !rawName) return false;
    if (text.includes(rawName) || rawName.includes(text)) return true;

    const descriptionSignature = recurringDescriptionSignature(description);
    return Boolean(
        rule.signature &&
        descriptionSignature &&
        (
            rule.signature === descriptionSignature ||
            descriptionSignature.includes(rule.signature) ||
            rule.signature.includes(descriptionSignature)
        )
    );
}

function appendRuleObservation(current = '', rule = {}) {
    const note = `Classificado pela regra da conta recorrente: ${rule.friendlyName || rule.rawName}`;
    return current ? `${current}; ${note}` : note;
}

function applyAccountClassificationRules(transactions = [], accountRows = []) {
    const rules = accountRowsToClassificationRules(accountRows);
    if (!rules.length) return transactions;

    return transactions.map(item => {
        if (!item || item.type !== 'Saídas') return item;
        const rule = rules.find(candidate => accountRuleMatchesDescription(candidate, item.descricao));
        if (!rule) return item;
        return {
            ...item,
            categoria: rule.categoria,
            subcategoria: rule.subcategoria,
            recorrente: 'Sim',
            observacoes: appendRuleObservation(item.observacoes || '', rule)
        };
    });
}

function escapeRegex(value = '') {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizedTextIncludesTerm(text, term) {
    const normalizedTerm = normalizeText(term).trim();
    if (!normalizedTerm) return false;
    if (!/^[a-z0-9]+(?:\s+[a-z0-9]+)*$/.test(normalizedTerm)) {
        return text.includes(normalizedTerm);
    }

    const pattern = normalizedTerm
        .split(/\s+/)
        .map(escapeRegex)
        .join('[^a-z0-9]+');
    return new RegExp(`(^|[^a-z0-9])${pattern}($|[^a-z0-9])`, 'i').test(text);
}

function categorizeIncome(description = '') {
    const text = normalizeText(description);
    if (text.includes('salario') || text.includes('salário') || text.includes('pagamento')) return 'Salário';
    if (text.includes('rendimento') || text.includes('rend pago aplic') || text.includes('dividendo')) return 'Investimentos';
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
    const status = isCreditCardPaymentMovement(description)
        ? 'Pagamento de fatura'
        : isInvestmentMovement(description)
            ? 'Movimentação de reserva/investimento'
            : 'Provável transferência interna';

    return {
        type: 'Transferências',
        ...buildImportedDateFields(date),
        descricao: String(description || 'Transferência importada').trim() || 'Transferência importada',
        valor: Math.abs(Number(amount || 0)),
        origem: '',
        destino: '',
        metodo: String(explicitType || '').trim() || 'Importação',
        observacoes: 'Importado de arquivo; não conta como gasto nem renda',
        status
    };
}

function isCreditCardPaymentMovement(description = '') {
    const text = normalizeText(description);
    return [
        'pagamento de fatura',
        'pag boleto nu pagamentos',
        'qrs nu pagament',
        'nu pagamentos s/a',
        'banco csf'
    ].some(term => text.includes(normalizeText(term)));
}

function isInvestmentMovement(description = '') {
    const text = normalizeText(description);
    return [
        'aplicacao rdb',
        'aplicação rdb',
        'resgate rdb',
        'resgate de caixinha',
        'resgate caixinha',
        'caixinha nubank',
        'aplicacao financeira',
        'aplicação financeira'
    ].some(term => text.includes(normalizeText(term)));
}

function isInternalFinancialMovement(description = '') {
    return isCreditCardPaymentMovement(description) || isInvestmentMovement(description);
}

function buildTransaction({ date, description, amount, explicitType = '', ownerAliases = [] }) {
    const value = Math.abs(Number(amount || 0));
    if (!value) return null;

    const safeDescription = String(description || 'Lançamento importado').trim() || 'Lançamento importado';
    if (isBalanceMarker(safeDescription)) return null;

    const typeText = normalizeText(explicitType);
    const isIncome = amount > 0 || ['entrada', 'credito', 'crédito', 'credit', 'receita'].some(term => typeText.includes(normalizeText(term)));
    const isExpense = amount < 0 || ['saida', 'saída', 'debito', 'débito', 'debit', 'despesa'].some(term => typeText.includes(normalizeText(term)));
    if (!isIncome && !isExpense) return null;

    if (isInternalFinancialMovement(safeDescription)) {
        return buildTransfer({ date, description: safeDescription, amount, explicitType });
    }

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
        .filter(item => item && !item.duplicate)
        .filter(item => !isLikelyCreditCardCredit(item.descricao))
        .filter(item => item.type === 'Saídas' || item.type === 'Entradas')
        .map(item => {
            const category = categorizeExpense(item.descricao);
            return {
                ...item,
                type: 'Cartão',
                categoria: item.categoria && item.categoria !== 'Outros' ? item.categoria : category.categoria,
                subcategoria: item.subcategoria && item.subcategoria !== 'Importação' ? item.subcategoria : category.subcategoria,
                parcela: '1/1',
                observacoes: item.observacoes || 'Importado de extrato de cartão'
            };
        });
}

function isBalanceMarker(description = '') {
    const text = normalizeText(description).trim();
    return /\bsaldo\b/.test(text) && (
        text.includes('saldo do dia') ||
        text.includes('saldo anterior') ||
        text.includes('saldo atual') ||
        text === 'saldo'
    );
}

function isLikelyCreditCardCredit(description = '') {
    const text = normalizeText(description).trim();
    return [
        'estorno',
        'credito',
        'crédito',
        'pagamento recebido',
        'pagamento de fatura',
        'valor pendente do mes anterior',
        'valor pendente do mês anterior',
        'cashback',
        'ajuste credito',
        'ajuste crédito'
    ].some(term => text.includes(normalizeText(term)));
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
            const date = pick(row, ['data', 'date', 'dt', 'dtpost', 'data lançamento', 'data lancamento', 'data movimento']);
            const description = pick(row, [
                'descricao', 'descrição', 'historico', 'histórico', 'memo', 'name',
                'descricao lancamento', 'lançamentos', 'lancamentos', 'title', 'titulo'
            ]);
            const { amount, inferredType } = extractCsvAmount(row);
            const explicitType = pick(row, ['tipo', 'type', 'natureza']) || inferredType;
            return buildTransaction({ date, description, amount, explicitType, ownerAliases: options.ownerAliases });
        })
        .filter(Boolean);
}

function extractCsvAmount(row = {}) {
    const amountRaw = pick(row, ['valor', 'amount', 'valor lancamento', 'valor lançamento', 'valor (r$)', 'quantia']);
    if (amountRaw !== '') return { amount: parseValue(amountRaw), inferredType: '' };

    const debitRaw = pick(row, ['debito', 'débito', 'debit']);
    if (debitRaw !== '') return { amount: -Math.abs(parseValue(debitRaw)), inferredType: 'Débito' };

    const creditRaw = pick(row, ['credito', 'crédito', 'credit']);
    if (creditRaw !== '') return { amount: Math.abs(parseValue(creditRaw)), inferredType: 'Crédito' };

    return { amount: 0, inferredType: '' };
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

function buildImportPossibleDuplicateKey(item = {}) {
    return [
        item.type || '',
        normalizeDateKey(item.data),
        valueToCents(item.valor)
    ].join('|');
}

function existingRowToTransaction(sheetName, row = []) {
    if (sheetName === 'Entradas') {
        return { type: 'Entradas', data: row[0], descricao: row[1], valor: row[3], userId: row[8] };
    }
    if (sheetName === 'Transferências') {
        return { type: 'Transferências', data: row[0], descricao: row[1], valor: row[2], userId: row[8] };
    }
    if (sheetName === 'Lançamentos Cartão') {
        return {
            type: 'Cartão',
            data: row[0],
            descricao: row[1],
            valor: row[3],
            cardId: row[6],
            cartao: row[7],
            userId: row[9]
        };
    }
    if (sheetName === 'Cartão' || String(sheetName || '').startsWith('Cartão ')) {
        return {
            type: 'Cartão',
            data: row[0],
            descricao: row[1],
            valor: row[3],
            cardId: sheetName,
            cartao: sheetName,
            userId: row[6]
        };
    }
    return { type: 'Saídas', data: row[0], descricao: row[1], categoria: row[2], subcategoria: row[3], valor: row[4], userId: row[9] };
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

function buildExistingPossibleDuplicateIndex(existingRowsByType = {}) {
    const index = new Map();
    for (const [sheetName, rows] of Object.entries(existingRowsByType || {})) {
        for (const row of rows || []) {
            const item = existingRowToTransaction(sheetName, row);
            const key = buildImportPossibleDuplicateKey(item);
            if (key && !index.has(key)) {
                index.set(key, {
                    descricao: item.descricao || 'lançamento existente',
                    data: normalizeDateKey(item.data),
                    valor: item.valor
                });
            }
        }
    }
    return index;
}

function annotateImportDuplicates(transactions = [], existingRowsByType = {}) {
    const existingKeys = buildExistingDuplicateKeys(existingRowsByType);
    const existingPossibleDuplicates = buildExistingPossibleDuplicateIndex(existingRowsByType);
    const batchKeys = new Set();

    return transactions.map((item) => {
        const key = buildImportDuplicateKey(item);
        const duplicateInSpreadsheet = existingKeys.has(key);
        const duplicateInFile = batchKeys.has(key);
        batchKeys.add(key);

        if (duplicateInSpreadsheet || duplicateInFile) {
            return {
                ...item,
                duplicate: true,
                duplicateReason: duplicateInSpreadsheet
                    ? 'já existe na planilha'
                    : 'repetido no arquivo'
            };
        }

        const possibleDuplicate = existingPossibleDuplicates.get(buildImportPossibleDuplicateKey(item));
        if (!possibleDuplicate) return item;

        return {
            ...item,
            possibleDuplicate: true,
            possibleDuplicateReason: `mesma data e valor de "${possibleDuplicate.descricao}"`
        };
    });
}

function monthKeyFromDate(value) {
    const parsed = parseSheetDate(value);
    if (!parsed) return '';
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

function dayFromDate(value) {
    const parsed = parseSheetDate(value);
    return parsed ? parsed.getDate() : 0;
}

function modeNumber(values = []) {
    const counts = new Map();
    for (const value of values.filter(Number.isFinite)) {
        counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .map(([value]) => value)[0] || 0;
}

function recurringDescriptionSignature(description = '') {
    return normalizeText(description)
        .replace(/\d{1,2}\/\d{1,2}/g, ' ')
        .replace(/\b\d{2,}\b/g, ' ')
        .replace(/[•*_.:/\\|()[\]-]+/g, ' ')
        .replace(/\b(transferencia|transferencia recebida|recebida|recebido|enviada|enviado|pelo|pela|pix|transf|agencia|conta|bco|banco|s a|sa|ltda|importacao|pagamento|boleto|efetuado)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100);
}

function isIncomingTransferLike(description = '') {
    const text = normalizeDescriptionKey(description);
    return (
        text.includes('recebida') ||
        text.includes('recebido') ||
        text.includes('pix transf') ||
        text.includes('transferencia recebida')
    );
}

function recurringRowsToItems(existingRowsByType = {}, allowedTypes = new Set()) {
    const items = [];
    for (const [sheetName, rows] of Object.entries(existingRowsByType || {})) {
        const type = sheetName === 'Entradas'
            ? 'Entradas'
            : sheetName === 'Transferências'
                ? 'Transferências'
                : 'Saídas';
        if (allowedTypes.size && !allowedTypes.has(type)) continue;
        for (const row of rows || []) {
            const item = existingRowToTransaction(sheetName, row);
            const signature = recurringDescriptionSignature(item.descricao);
            const monthKey = monthKeyFromDate(item.data);
            if (!signature || !monthKey) continue;
            items.push({
                ...item,
                signature,
                monthKey,
                day: dayFromDate(item.data),
                value: Number(parseValue(item.valor) || 0)
            });
        }
    }
    return items;
}

function buildRecurringCandidate({ item, index, existingItems, kind }) {
    const signature = recurringDescriptionSignature(item.descricao);
    const monthKey = monthKeyFromDate(item.data);
    if (!signature || !monthKey) return null;

    const matching = existingItems.filter(existing => existing.signature === signature);
    const months = new Set([monthKey, ...matching.map(existing => existing.monthKey).filter(Boolean)]);
    if (months.size < 3) return null;

    const days = [dayFromDate(item.data), ...matching.map(existing => existing.day)].filter(Number.isFinite);
    const categorySource = [item, ...matching].find(existing =>
        existing?.categoria && existing.categoria !== 'Outros'
    ) || {};
    return {
        kind,
        signature,
        transactionIndexes: [index],
        description: item.descricao || matching[0]?.descricao || 'lançamento recorrente',
        categoria: categorySource.categoria || '',
        subcategoria: categorySource.subcategoria || '',
        value: Number(item.valor || 0),
        suggestedDueDay: modeNumber(days),
        monthCount: months.size,
        months: [...months].sort()
    };
}

function mergeCandidates(candidates = []) {
    const bySignature = new Map();
    for (const candidate of candidates.filter(Boolean)) {
        const existing = bySignature.get(candidate.signature);
        if (!existing) {
            bySignature.set(candidate.signature, { ...candidate });
            continue;
        }
        existing.transactionIndexes = [...new Set([...existing.transactionIndexes, ...candidate.transactionIndexes])];
        existing.months = [...new Set([...existing.months, ...candidate.months])].sort();
        existing.monthCount = existing.months.length;
    }
    return [...bySignature.values()]
        .sort((a, b) => b.monthCount - a.monthCount || a.description.localeCompare(b.description));
}

function detectRecurringIncomeCandidates(transactions = [], existingRowsByType = {}) {
    const existingItems = recurringRowsToItems(existingRowsByType, new Set(['Entradas', 'Transferências']));
    const candidates = transactions
        .map((item, index) => {
            if (!item || item.duplicate || item.type !== 'Transferências') return null;
            if (!isIncomingTransferLike(item.descricao)) return null;
            return buildRecurringCandidate({ item, index, existingItems, kind: 'income' });
        });
    return mergeCandidates(candidates);
}

function detectRecurringBillCandidates(transactions = [], existingRowsByType = {}) {
    const existingItems = recurringRowsToItems(existingRowsByType, new Set(['Saídas']));
    const candidates = transactions
        .map((item, index) => {
            if (!item || item.duplicate || item.type !== 'Saídas') return null;
            return buildRecurringCandidate({ item, index, existingItems, kind: 'bill' });
        });
    return mergeCandidates(candidates);
}

function parseRecurringIncomeClassificationReply(text = '') {
    const normalized = normalizeText(text);
    if (['1', 'salario', 'salário', 'salario recorrente', 'salário recorrente'].includes(normalized)) return 'salary';
    if (['2', 'renda extra', 'extra', 'renda recorrente', 'outra renda'].includes(normalized)) return 'extra_income';
    if (['3', 'transferencia', 'transferência', 'transferencia interna', 'transferência interna'].includes(normalized)) return 'internal_transfer';
    if (['4', 'ignorar', 'deixar', 'deixar como esta', 'deixar como está', 'nao sei', 'não sei'].includes(normalized)) return 'ignore';
    return '';
}

function applyRecurringIncomeClassification(transactions = [], candidate = {}, classification = '') {
    const indexes = new Set(candidate.transactionIndexes || []);
    if (!indexes.size || !['salary', 'extra_income'].includes(classification)) return transactions;

    const category = classification === 'salary' ? 'Salário' : 'Renda Extra';
    return transactions.map((item, index) => {
        if (!indexes.has(index) || item.type !== 'Transferências') return item;
        return {
            type: 'Entradas',
            data: item.data,
            descricao: item.descricao,
            categoria: category,
            valor: item.valor,
            recebimento: 'Conta Corrente',
            recorrente: 'Sim',
            observacoes: 'Reclassificado de transferência recorrente durante importação',
            userId: item.userId
        };
    });
}

function buildRecurringIncomeQuestion(candidate = {}) {
    return [
        'Percebi uma entrada recorrente parecida com:',
        `"${candidate.description || 'lançamento recorrente'}"`,
        '',
        `Ela aparece em ${candidate.monthCount || 3} meses. Como devo tratar essa importação?`,
        '1. Salário recorrente',
        '2. Renda extra recorrente',
        '3. Transferência interna',
        '4. Deixar como está por enquanto'
    ].join('\n');
}

function buildRecurringBillSuggestionMessage(candidate = {}) {
    const day = candidate.suggestedDueDay || 1;
    return [
        `Percebi uma saída recorrente parecida com "${candidate.description || 'conta recorrente'}".`,
        `Ela aparece em ${candidate.monthCount || 3} meses, perto do dia ${day}.`,
        '',
        'Quer cadastrar isso na aba Contas para eu lembrar nos próximos vencimentos?',
        'Responda `sim` para cadastrar ou `não` para ignorar.'
    ].join('\n');
}

function transactionLabel(item) {
    if (item.duplicate) return 'Duplicado';
    if (item.possibleDuplicate) return 'Possível duplicado';
    if (item.type === 'Entradas') return 'Entrada';
    if (item.type === 'Transferências') return 'Transferência';
    if (item.type === 'Cartão') return 'Cartão';
    return 'Saída';
}

function formatPreviewLine(item, index) {
    const duplicateSuffix = item.duplicate ? ` | ${item.duplicateReason}; será ignorado` : '';
    const possibleDuplicateSuffix = !item.duplicate && item.possibleDuplicate
        ? ` | atenção: ${item.possibleDuplicateReason}; será importado se você confirmar`
        : '';
    const dateLabel = item.data || 'data pendente';
    const billingSuffix = item.type === 'Cartão' && item.mesCobranca ? ` | Fatura: ${item.mesCobranca}` : '';
    return `${index + 1}. [${transactionLabel(item)}] ${dateLabel} | ${item.descricao} | R$ ${formatMoney(item.valor)} | ${item.categoria || item.status || 'Outros'}${billingSuffix}${duplicateSuffix}${possibleDuplicateSuffix}`;
}

function buildImportSummary(transactions = []) {
    const entradas = transactions.filter(item => item.type === 'Entradas');
    const saidas = transactions.filter(item => item.type === 'Saídas');
    const cartoes = transactions.filter(item => item.type === 'Cartão');
    const transferencias = transactions.filter(item => item.type === 'Transferências');
    const duplicados = transactions.filter(item => item.duplicate);
    const possiveisDuplicados = transactions.filter(item => item.possibleDuplicate && !item.duplicate);
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
    if (possiveisDuplicados.length > 0) {
        summary.push(`Alertas de possível duplicidade: ${possiveisDuplicados.length} (confira; serão importados se você confirmar)`);
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
    applyAccountClassificationRules,
    applyRecurringIncomeClassification,
    applyFallbackDateToTransactions,
    buildImportDuplicateKey,
    buildRecurringBillSuggestionMessage,
    buildRecurringBillClassificationQuestion,
    buildRecurringIncomeQuestion,
    convertTransactionsForCreditCardStatement,
    detectRecurringBillCandidates,
    detectRecurringIncomeCandidates,
    detectImportFileType,
    parseCsvTransactions,
    parseImportMedia,
    parseOfxTransactions,
    parseRecurringBillClassificationReply,
    parseRecurringIncomeClassificationReply,
    parseStatementText,
    transactionsNeedDateInput,
    unsupportedImportMessage,
    __test__: {
        applyFallbackDateToTransactions,
        accountRowsToClassificationRules,
        buildExistingDuplicateKeys,
        buildTransaction,
        categorizeExpense,
        inferRecurringBillClassification,
        convertTransactionsForCreditCardStatement,
        isInternalFinancialMovement,
        normalizedTextIncludesTerm,
        recurringDescriptionSignature,
        isProbableInternalTransfer,
        parseDelimited,
        splitDelimitedLine
    }
};
