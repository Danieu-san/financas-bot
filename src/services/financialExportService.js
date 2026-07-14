const XLSX = require('xlsx');

const { normalizeText, parseSheetDate, parseValue } = require('../utils/helpers');

const PUBLIC_EXPORT_COLUMNS = Object.freeze([
    'Data', 'Tipo', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Conta', 'Origem'
]);

const SOURCE_SPECS = Object.freeze([
    {
        sheetName: 'Saídas', sourceFilter: 'expenses', type: 'Saída', origin: 'Saídas',
        date: 0, description: 1, category: 2, subcategory: 3, amount: 4, userId: 9, account: 10
    },
    {
        sheetName: 'Entradas', sourceFilter: 'income', type: 'Entrada', origin: 'Entradas',
        date: 0, description: 1, category: 2, subcategory: null, amount: 3, userId: 8, account: 9
    },
    {
        sheetName: 'Lançamentos Cartão', sourceFilter: 'cards', type: 'Cartão', origin: 'Cartão',
        date: 0, description: 1, category: 2, subcategory: null, amount: 3, userId: 9, account: 7
    }
]);

function exportError(code, message, details = {}) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    error.details = details;
    return error;
}

function normalizeFilters(filters = {}) {
    const hasMonth = filters.month !== undefined && filters.month !== null && filters.month !== '';
    const hasYear = filters.year !== undefined && filters.year !== null && filters.year !== '';
    if (hasMonth !== hasYear) throw exportError('EXPORT_FILTER_INVALID', 'Mês e ano devem ser informados juntos.');
    const month = hasMonth ? Number(filters.month) : null;
    const year = hasYear ? Number(filters.year) : null;
    if (hasMonth && (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100)) {
        throw exportError('EXPORT_FILTER_INVALID', 'Período inválido.');
    }
    const source = String(filters.source || '').trim().toLowerCase();
    if (source && !SOURCE_SPECS.some(spec => spec.sourceFilter === source)) {
        throw exportError('EXPORT_FILTER_INVALID', 'Origem inválida.', { source });
    }
    return {
        month,
        year,
        account: String(filters.account || '').trim(),
        category: String(filters.category || '').trim(),
        source
    };
}

function neutralizeSpreadsheetText(value) {
    const text = String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
    return /^[=+@-]/.test(text) ? `'${text}` : text;
}

function rowMatchesFilters(row, spec, filters) {
    if (filters.source && filters.source !== spec.sourceFilter) return false;
    if (filters.category && normalizeText(row[spec.category] || '') !== normalizeText(filters.category)) return false;
    if (filters.account && normalizeText(row[spec.account] || '') !== normalizeText(filters.account)) return false;
    if (filters.month !== null) {
        const date = parseSheetDate(String(row[spec.date] || ''));
        if (!date || date.getMonth() + 1 !== filters.month || date.getFullYear() !== filters.year) return false;
    }
    return true;
}

function publicRow(row, spec) {
    return {
        Data: neutralizeSpreadsheetText(row[spec.date]),
        Tipo: spec.type,
        Descrição: neutralizeSpreadsheetText(row[spec.description]),
        Categoria: neutralizeSpreadsheetText(row[spec.category]),
        Subcategoria: Number.isInteger(spec.subcategory) ? neutralizeSpreadsheetText(row[spec.subcategory]) : '',
        Valor: Math.abs(Number(parseValue(row[spec.amount]) || 0)),
        Conta: neutralizeSpreadsheetText(row[spec.account]),
        Origem: spec.origin
    };
}

function selectPublicFinancialRows({ sheetDataByName = {}, userId, filters = {} } = {}) {
    const scopedUserId = String(userId || '').trim();
    if (!scopedUserId) throw exportError('EXPORT_USER_REQUIRED', 'Usuário obrigatório.');
    const safeFilters = normalizeFilters(filters);
    const output = [];
    for (const spec of SOURCE_SPECS) {
        const rows = Array.isArray(sheetDataByName[spec.sheetName]) ? sheetDataByName[spec.sheetName] : [];
        rows.forEach((row, index) => {
            if (index === 0 || !Array.isArray(row)) return;
            if (String(row[spec.userId] || '').trim() !== scopedUserId) return;
            if (!rowMatchesFilters(row, spec, safeFilters)) return;
            output.push(publicRow(row, spec));
        });
    }
    return output;
}

function buildFilteredFinancialExport({
    sheetDataByName = {},
    userId,
    filters = {},
    maxRows = 1000
} = {}) {
    const rows = selectPublicFinancialRows({ sheetDataByName, userId, filters });
    const limit = Math.min(5000, Math.max(1, Number(maxRows) || 1000));
    if (rows.length === 0) throw exportError('EXPORT_EMPTY', 'Nenhum lançamento corresponde aos filtros.');
    if (rows.length > limit) {
        throw exportError('EXPORT_LIMIT_EXCEEDED', 'A exportação excede o limite e não foi truncada.', {
            count: rows.length,
            maxRows: limit
        });
    }
    const sheet = XLSX.utils.json_to_sheet(rows, { header: PUBLIC_EXPORT_COLUMNS });
    sheet['!autofilter'] = { ref: sheet['!ref'] };
    sheet['!cols'] = [12, 12, 34, 20, 22, 14, 24, 18].map(width => ({ wch: width }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Exportacao');
    const period = filters.month && filters.year
        ? `${String(filters.year)}-${String(filters.month).padStart(2, '0')}`
        : 'filtrado';
    return {
        filename: `financas-${period}.xlsx`,
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true })),
        rowCount: rows.length,
        columns: [...PUBLIC_EXPORT_COLUMNS]
    };
}

module.exports = {
    PUBLIC_EXPORT_COLUMNS,
    buildFilteredFinancialExport,
    selectPublicFinancialRows,
    __test__: {
        exportError,
        neutralizeSpreadsheetText,
        normalizeFilters
    }
};
