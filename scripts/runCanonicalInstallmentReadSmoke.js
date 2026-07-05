const { projectLegacyRowsToCanonicalLedger } = require('../src/ledger/canonicalLedgerProjector');
const { normalizeText, parseValue } = require('../src/utils/helpers');

const MONTH_BY_NAME = new Map([
    ['janeiro', 1], ['fevereiro', 2], ['marco', 3], ['abril', 4],
    ['maio', 5], ['junho', 6], ['julho', 7], ['agosto', 8],
    ['setembro', 9], ['outubro', 10], ['novembro', 11], ['dezembro', 12]
]);

function competenceMonth(value) {
    const raw = String(value || '').trim();
    if (/^\d{4}-\d{2}$/.test(raw)) return raw;
    const numeric = raw.match(/^(\d{1,2})\/(\d{4})$/);
    if (numeric) return `${numeric[2]}-${numeric[1].padStart(2, '0')}`;
    const named = normalizeText(raw).match(/^([a-z]+)\s+de\s+(\d{4})$/);
    const month = named ? MONTH_BY_NAME.get(named[1]) : null;
    return month ? `${named[2]}-${String(month).padStart(2, '0')}` : null;
}

function addCents(map, key, value) {
    map.set(key, (map.get(key) || 0) + Math.round(parseValue(value) * 100));
}

function buildInstallmentReadSmoke(sheetRows = []) {
    const sourceReadable = Array.isArray(sheetRows) && sheetRows.length > 0;
    const rows = Array.isArray(sheetRows) ? sheetRows.slice(1) : [];
    const sheetTotals = new Map();
    let invalidCompetenceRows = 0;
    let installmentRows = 0;

    rows.forEach((row) => {
        const competence = competenceMonth(row?.[5]);
        if (competence) addCents(sheetTotals, competence, row?.[3]);
        else invalidCompetenceRows += 1;
        const installment = String(row?.[4] || '').match(/^(\d{1,3})\s*\/\s*(\d{1,3})$/);
        if (installment && Number(installment[2]) > 1) installmentRows += 1;
    });

    const projected = projectLegacyRowsToCanonicalLedger({
        householdId: 'read-smoke',
        legacyRows: {
            contas: [], saidas: [], entradas: [], transferencias: [], dividas: [],
            pagamentosDividas: [], metas: [], movimentacoesMetas: [], importedTransactions: [],
            lancamentosCartao: rows.map((row, index) => ({
                source_row_id: `read-smoke-row-${index + 2}`,
                data: row?.[0],
                descricao: row?.[1],
                categoria: row?.[2],
                valor_parcela: row?.[3],
                parcela: row?.[4],
                mes_cobranca: row?.[5],
                card_id: row?.[6],
                cartao: row?.[7],
                observacoes: row?.[8],
                user_id: row?.[9]
            }))
        },
        people: []
    });
    const canonicalTotals = new Map();
    projected.invoices.forEach((invoice) => {
        const month = invoice.competence_month;
        if (!month) return;
        canonicalTotals.set(month, (canonicalTotals.get(month) || 0) + Number(invoice.observed_item_total_cents || 0));
    });
    const months = [...new Set([...sheetTotals.keys(), ...canonicalTotals.keys()])].sort();
    const monthTotals = months.map(month => ({
        competenceMonth: month,
        sheetCents: sheetTotals.get(month) || 0,
        canonicalCents: canonicalTotals.get(month) || 0
    }));
    const mismatches = monthTotals.filter(item => item.sheetCents !== item.canonicalCents);
    const schedules = projected.schedules.filter(schedule => schedule.schedule_type === 'card_installment');

    return {
        ok: sourceReadable && invalidCompetenceRows === 0 && mismatches.length === 0,
        sourceReadable,
        sourceRowCount: rows.length,
        installmentRows,
        scheduleCount: schedules.length,
        uncertainCount: schedules.filter(schedule => schedule.status === 'uncertain').length,
        invalidCompetenceRows,
        monthTotals,
        mismatchCount: mismatches.length
    };
}

async function main() {
    require('dotenv').config();
    const { authorizeGoogle, readDataFromSheet, runWithUserSheetContext, hasUserSpreadsheetContext } = require('../src/services/google');
    const { getAllUsers, getUserByLookup, getUserByWhatsAppId } = require('../src/services/userService');
    await authorizeGoogle();
    const adminId = String(process.env.ADMIN_IDS || '').split(',').map(value => value.trim()).find(Boolean);
    const lookup = String(process.env.INSTALLMENT_SMOKE_USER_LOOKUP || 'Daniel').trim();
    let user = (adminId ? await getUserByWhatsAppId(adminId) : null) || await getUserByLookup(lookup);
    if (!user?.user_id || !(await hasUserSpreadsheetContext({ userId: user.user_id }))) {
        const users = await getAllUsers();
        const contextualUsers = [];
        for (const candidate of users) {
            if (candidate?.user_id && await hasUserSpreadsheetContext({ userId: candidate.user_id })) contextualUsers.push(candidate);
        }
        const normalizedLookup = normalizeText(lookup);
        user = contextualUsers.find(candidate => normalizeText(candidate.display_name || '').includes(normalizedLookup)) || contextualUsers[0];
    }
    if (!user?.user_id) throw new Error('Nenhum contexto de planilha ativo foi encontrado para o smoke.');
    const rows = await runWithUserSheetContext({ userId: user.user_id }, () =>
        readDataFromSheet('Lançamentos Cartão!A:J')
    );
    const report = buildInstallmentReadSmoke(rows);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
}
if (require.main === module) {
    main().catch((error) => {
        console.error(`[canonical-installment-read-smoke] ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    buildInstallmentReadSmoke,
    competenceMonth
};
