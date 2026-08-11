const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const {
    __test__: { sourceRef, categoryPatterns }
} = require('../src/openFinance/openFinanceHistoricalImportPlanner');

const SIGNATURE_STOPWORDS = new Set([
    'compra', 'pagamento', 'pgto', 'debito', 'credito', 'cartao', 'pix',
    'transferencia', 'ifd', 'mp', 'pag', 'payment', 'ltda', 'brasil'
]);

function merchantSignature(value) {
    const meaningful = normalizeText(value).split(' ').filter(token =>
        token.length >= 3 && !/^\d+$/.test(token) &&
        !SIGNATURE_STOPWORDS.has(token));
    const selected = meaningful.slice(0, 2);
    if (!selected.some(token => token.length >= 5)) return '';
    return selected.join(' ');
}

function normalizeText(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function rangeSheetName(rangeName) {
    return String(rangeName || '').split('!')[0].replace(/^'|'$/g, '');
}

function findRange(snapshot, name) {
    const expected = normalizeText(name);
    const match = Object.entries(snapshot?.ranges || {}).find(([range]) =>
        normalizeText(rangeSheetName(range)) === expected);
    return match ? match[1] : [];
}

function unique(values) {
    return [...new Set(values.filter(Boolean).map(String))];
}

function observedAt(snapshot) {
    const values = Array.isArray(snapshot?.observed_at)
        ? snapshot.observed_at
        : [snapshot?.observed_at];
    return values.map(String).filter(Boolean).sort().at(-1) || '';
}

function buildConfig({ pluggySnapshot, sheetSnapshot, historyStartDate,
    historyEndDate, classifyExpense = null } = {}) {
    const activeValues = new Set(['active', 'ativo', 'ativa', 'sim', 'yes', 'true', '1']);
    const accountRows = findRange(sheetSnapshot, 'Contas Financeiras').slice(1)
        .filter(row => activeValues.has(normalizeText(row?.[4])));
    const cardRows = findRange(sheetSnapshot, 'Cartões').slice(1)
        .filter(row => activeValues.has(normalizeText(row?.[5])));
    const accountBindings = {};
    const decisionOverrides = {};
    const diagnostics = {
        bound_bank: 0,
        bound_card: 0,
        unbound_bank: 0,
        unbound_card: 0,
        unbound_savings: 0,
        owners_without_unique_user: 0
    };

    for (const item of pluggySnapshot?.items || []) {
        const aliasParts = normalizeText(item.alias_code).split(' ').filter(Boolean);
        const subject = aliasParts[0] || '';
        const institution = aliasParts.slice(1).join(' ');
        const ownerScope = normalizeText(item.owner_scope);
        const ownerRows = accountRows.filter(row =>
            normalizeText(row?.[6]) === ownerScope);
        const ownerUserIds = unique(ownerRows.map(row => row?.[7]));
        if (ownerUserIds.length !== 1) {
            diagnostics.owners_without_unique_user += 1;
            continue;
        }
        const ownerUserId = ownerUserIds[0];
        const ownerLabel = String(ownerRows[0]?.[6] || '').trim();
        const reserveRows = ownerRows.filter(row =>
            normalizeText(row?.[1]) === 'reserve' &&
            normalizeText(row?.[0]).includes(institution));
        const reserveAccount = reserveRows.length === 1
            ? String(reserveRows[0][0]).trim()
            : '';

        for (const account of item.accounts || []) {
            const type = normalizeText(account.type).toUpperCase();
            const subtype = normalizeText(account.subtype);
            if (type === 'BANK') {
                const expectedType = subtype.includes('savings') ? 'savings' : 'bank';
                const candidates = ownerRows.filter(row => {
                    const name = normalizeText(row?.[0]);
                    return normalizeText(row?.[1]) === expectedType &&
                        name.includes(subject) && name.includes(institution);
                });
                if (candidates.length === 1) {
                    accountBindings[account.id] = {
                        kind: 'bank',
                        ownerUserId,
                        ownerLabel,
                        financialAccount: String(candidates[0][0]).trim(),
                        paymentMethod: 'Débito',
                        ...(reserveAccount ? { reserveAccount } : {})
                    };
                    diagnostics.bound_bank += 1;
                } else if (expectedType === 'savings') {
                    diagnostics.unbound_savings += 1;
                } else {
                    diagnostics.unbound_bank += 1;
                }
                continue;
            }
            if (type === 'CREDIT') {
                const candidates = cardRows.filter(row => {

                    const identity = normalizeText(`${row?.[1] || ''} ${row?.[2] || ''}`);
                    return identity.includes(subject) && identity.includes(institution);
                });
                if (candidates.length === 1 && String(candidates[0]?.[0] || '').trim()) {
                    const closeDate = String(account.balance_close_date || '');
                    const match = /-(\d{2})(?:T|$)/.exec(closeDate);
                    accountBindings[account.id] = {
                        kind: 'card',
                        ownerUserId,
                        ownerLabel,
                        sheetName: 'Lançamentos Cartão',
                        cardId: String(candidates[0][0]).trim(),
                        cardName: String(candidates[0][1] || '').trim(),
                        closingDay: Number(candidates[0][3]) ||
                            (match ? Number(match[1]) : 1),
                        billingFallbackAuthorized: false
                    };
                    diagnostics.bound_card += 1;
                } else {
                    diagnostics.unbound_card += 1;
                }
            }
        }
    }

    if (typeof classifyExpense === 'function') {
        const patterns = categoryPatterns(sheetSnapshot);
        const expenseCandidates = [];
        for (const item of pluggySnapshot?.items || []) {
            const accountTypes = new Map((item.accounts || [])
                .map(account => [String(account.id), normalizeText(account.type).toUpperCase()]));
            for (const transaction of item.transactions || []) {
                const type = accountTypes.get(String(transaction.account_id));
                const expenseDirection = (type === 'BANK' &&
                    Number(transaction.amount_cents) < 0) ||
                    (type === 'CREDIT' && Number(transaction.amount_cents) > 0);
                if (!expenseDirection) continue;
                const ref = sourceRef({
                    ...transaction,
                    item_id: transaction.item_id || item.id
                });
                const suggestion = classifyExpense(transaction.description);
                const exactPattern = patterns.get(normalizeText(transaction.description));
                const category = String(exactPattern?.category ||
                    suggestion?.categoria || suggestion?.category || '').trim();
                const subcategory = String(exactPattern?.subcategory ||
                    suggestion?.subcategoria || suggestion?.subcategory || '').trim();
                const fallback = !exactPattern && normalizeText(category) === 'outros' &&
                    normalizeText(subcategory) === 'importacao';
                if (category && !fallback) {
                    decisionOverrides[ref] = {
                        suggestedCategory: category,
                        suggestedSubcategory: subcategory
                    };
                }
                expenseCandidates.push({
                    ref,
                    signature: merchantSignature(transaction.description),
                    category: category && !fallback ? category : '',
                    subcategory: category && !fallback ? subcategory : ''
                });
            }
        }
        const groups = new Map();
        for (const candidate of expenseCandidates) {
            if (!candidate.signature) continue;
            if (!groups.has(candidate.signature)) groups.set(candidate.signature, []);
            groups.get(candidate.signature).push(candidate);
        }
        for (const group of groups.values()) {
            if (group.length < 2) continue;
            const known = unique(group.filter(item => item.category).map(item =>
                `${item.category}\u0000${item.subcategory}`));
            if (known.length !== 1) continue;
            const [category, subcategory] = known[0].split('\u0000');
            for (const candidate of group) {
                if (decisionOverrides[candidate.ref]) continue;
                decisionOverrides[candidate.ref] = {
                    suggestedCategory: category,
                    suggestedSubcategory: subcategory,
                    suggestionOrigin: 'unambiguous_recurring_merchant'
                };
            }
        }
    }

    const sourceObservedAt = observedAt(pluggySnapshot);
    return {
        schema_version: 1,
        historyStartDate,
        historyEndDate,
        sourceObservedAt,
        coverageComplete: Boolean(sourceObservedAt &&
            sourceObservedAt.slice(0, 10) >= historyEndDate),
        accountBindings,
        merchantRules: [],
        decisionOverrides,
        diagnostics,
        financial_writes: 0
    };
}

function argument(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : '';
}

function requiredAbsolutePath(name) {
    const value = argument(name);
    if (!value || !path.isAbsolute(value)) {
        throw new Error(`historical_import_config_absolute_path_required:${name}`);
    }
    return path.resolve(value);
}

function isInside(parent, candidate) {
    const contains = (root, target) => {
        const relative = path.relative(root, target);
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    };
    const canonicalize = value => {
        let existing = path.resolve(value);
        const missing = [];
        while (!fs.existsSync(existing)) {
            const parentPath = path.dirname(existing);
            if (parentPath === existing) break;
            missing.unshift(path.basename(existing));
            existing = parentPath;
        }
        const real = fs.realpathSync.native
            ? fs.realpathSync.native(existing)
            : fs.realpathSync(existing);
        return path.join(real, ...missing);
    };
    const lexicalParent = path.resolve(parent);
    const lexicalCandidate = path.resolve(candidate);
    return contains(lexicalParent, lexicalCandidate) ||
        contains(canonicalize(lexicalParent), canonicalize(lexicalCandidate));
}

function main() {
    if (!process.argv.includes('--confirm-private-output')) {
        throw new Error('historical_import_config_confirmation_required');
    }
    const pluggyPath = requiredAbsolutePath('--pluggy-snapshot');
    const sheetPath = requiredAbsolutePath('--sheet-snapshot');
    const outputPath = requiredAbsolutePath('--output');
    const historyStartDate = argument('--history-start');
    const historyEndDate = argument('--history-end');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(historyStartDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(historyEndDate)) {
        throw new Error('historical_import_config_dates_required');
    }
    if (isInside(path.resolve(__dirname, '..'), outputPath)) {
        throw new Error('historical_import_config_output_must_stay_outside_repository');
    }
    const moduleRoot = argument('--module-root');
    if (moduleRoot) {
        if (!path.isAbsolute(moduleRoot)) {
            throw new Error('historical_import_config_module_root_must_be_absolute');
        }
        process.env.NODE_PATH = path.resolve(moduleRoot);
        Module._initPaths();
    }
    const classifyExpense = process.argv.includes('--use-established-category-rules')
        ? require('../src/services/statementImportService').categorizeExpense
        : null;
    const config = buildConfig({
        pluggySnapshot: JSON.parse(fs.readFileSync(pluggyPath, 'utf8')),
        sheetSnapshot: JSON.parse(fs.readFileSync(sheetPath, 'utf8')),
        historyStartDate,
        historyEndDate,
        classifyExpense
    });
    fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, {
        encoding: 'utf8', flag: 'wx', mode: 0o600
    });
    process.stdout.write(`${JSON.stringify({
        coverageComplete: config.coverageComplete,
        bindings: Object.keys(config.accountBindings).length,
        category_suggestions: Object.keys(config.decisionOverrides).length,
        diagnostics: config.diagnostics,
        financial_writes: config.financial_writes
    })}\n`);
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = { buildConfig, normalizeText, rangeSheetName, merchantSignature };
