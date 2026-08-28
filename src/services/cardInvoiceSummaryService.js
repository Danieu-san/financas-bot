'use strict';

function text(value) {
    return String(value ?? '').trim();
}

function parseMoney(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const raw = text(value).replace(/\s/g, '').replace(/^R\$/i, '');
    if (!raw) return 0;
    const normalized = raw.includes(',')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw;
    const parsed = Number.parseFloat(normalized.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function parseComparableDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
    const raw = text(value);
    const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) {
        return Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    }
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
        return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    }
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

function buildInvoiceIdentity(row = []) {
    const cardId = text(row[6]);
    const label = text(row[7]);
    if (cardId) {
        return {
            key: `id:${cardId}`,
            kind: 'canonical',
            cardId,
            label
        };
    }
    if (label) {
        return {
            key: `legacy:${label}`,
            kind: 'legacy',
            cardId: '',
            label
        };
    }
    return null;
}

function buildCardCatalog(cardRows = []) {
    const map = new Map();
    for (const row of Array.isArray(cardRows) ? cardRows : []) {
        const cardId = text(row?.[0]);
        const name = text(row?.[1]);
        if (!cardId || !name || cardId.toLowerCase() === 'card_id') continue;
        if (!map.has(cardId)) map.set(cardId, name);
    }
    return map;
}

function summarizeCardInvoiceRows(rows = [], cardRows = []) {
    const catalog = buildCardCatalog(cardRows);
    const groups = new Map();

    for (const row of Array.isArray(rows) ? rows : []) {
        const userId = text(row?.[9]);
        const billingMonth = text(row?.[5]);
        if (!userId || !billingMonth) continue;
        const identity = buildInvoiceIdentity(row);
        if (!identity) continue;
        const groupKey = `${identity.key}\u0000${billingMonth}`;
        let group = groups.get(groupKey);
        if (!group) {
            group = {
                identityKey: identity.key,
                identityKind: identity.kind,
                cardId: identity.cardId,
                billingMonth,
                total: 0,
                count: 0,
                firstPurchase: null,
                lastPurchase: null,
                firstPurchaseValue: '',
                lastPurchaseValue: '',
                firstFriendlyLabel: identity.label || '',
                legacyLabel: identity.kind === 'legacy' ? identity.label : ''
            };
            groups.set(groupKey, group);
        }
        if (!group.firstFriendlyLabel && identity.label) group.firstFriendlyLabel = identity.label;
        group.total = roundMoney(group.total + parseMoney(row?.[3]));
        group.count += 1;

        const comparableDate = parseComparableDate(row?.[0]);
        if (comparableDate !== null && (group.firstPurchase === null || comparableDate < group.firstPurchase)) {
            group.firstPurchase = comparableDate;
            group.firstPurchaseValue = row?.[0] ?? '';
        }
        if (comparableDate !== null && (group.lastPurchase === null || comparableDate > group.lastPurchase)) {
            group.lastPurchase = comparableDate;
            group.lastPurchaseValue = row?.[0] ?? '';
        }
    }

    return [...groups.values()].map((group) => ({
        identityKey: group.identityKey,
        identityKind: group.identityKind,
        cardId: group.cardId,
        displayName: group.identityKind === 'canonical'
            ? (catalog.get(group.cardId) || group.firstFriendlyLabel || group.cardId)
            : group.legacyLabel,
        billingMonth: group.billingMonth,
        total: group.total,
        count: group.count,
        firstPurchase: group.firstPurchaseValue,
        lastPurchase: group.lastPurchaseValue
    }));
}

function buildInvoiceSummaryFormula() {
    const headers = 'HSTACK("Cartão";"Mês de Cobrança";"Total da Fatura";"Parcelas Lançadas";"Primeira Compra";"Última Compra")';
    const source = "HSTACK(ARRAYFORMULA(IF('Lançamentos Cartão'!G2:G<>\"\";\"id:\"&'Lançamentos Cartão'!G2:G;IF('Lançamentos Cartão'!H2:H<>\"\";\"legacy:\"&'Lançamentos Cartão'!H2:H;\"\")));'Lançamentos Cartão'!F2:F;'Lançamentos Cartão'!D2:D;'Lançamentos Cartão'!A2:A;'Lançamentos Cartão'!J2:J)";
    const query = `DROP(QUERY(${source};"select Col1, Col2, sum(Col3), count(Col3), min(Col4), max(Col4) where Col5 is not null and Col1 is not null group by Col1, Col2 label Col1 '', Col2 '', sum(Col3) '', count(Col3) '', min(Col4) '', max(Col4) ''";0);1)`;
    const display = "ARRAYFORMULA(IF(LEFT(keys;3)=\"id:\";IFNA(VLOOKUP(MID(keys;4;999);'Cartões'!A:B;2;FALSE);IFNA(VLOOKUP(MID(keys;4;999);HSTACK('Lançamentos Cartão'!G2:G;'Lançamentos Cartão'!H2:H);2;FALSE);MID(keys;4;999)));REGEXREPLACE(keys;\"^legacy:\";\"\")))";
    return `=IFERROR(LET(q;${query};keys;CHOOSECOLS(q;1);display;${display};VSTACK(${headers};HSTACK(display;CHOOSECOLS(q;2;3;4;5;6))));${headers})`;
}

module.exports = {
    buildInvoiceIdentity,
    buildCardCatalog,
    summarizeCardInvoiceRows,
    buildInvoiceSummaryFormula
};
