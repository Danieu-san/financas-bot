const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');
const { reconcileOpenFinanceShadow } = require('../src/openFinance/openFinanceShadowReconciler');

function readCanonicalTransactions(databasePath) {
    const db = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
        const expenses = db.prepare("SELECT fingerprint AS id, date_text AS date, description, ROUND(value*100) AS amountCents, 'debit' AS direction FROM expenses").all();
        const entries = db.prepare("SELECT fingerprint AS id, date_text AS date, description, ROUND(value*100) AS amountCents, 'credit' AS direction FROM entries").all();
        const transfers = db.prepare("SELECT fingerprint AS id, date_text AS date, description, ROUND(value*100) AS amountCents, 'transfer' AS direction FROM transfers").all();
        return [...expenses, ...entries, ...transfers];
    } finally { db.close(); }
}

function day(value) {
    const text = String(value || '').trim();
    const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const timestamp = br ? Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1])) : Date.parse(text);
    return Number.isFinite(timestamp) ? Math.floor(timestamp / 86400000) : null;
}

function main() {
    if (!process.argv.includes('--confirm-shadow-read')) throw new Error('confirm_shadow_read_required');
    const secret = fs.readFileSync(process.env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE, 'utf8').trim();
    const map = JSON.parse(fs.readFileSync(process.env.PLUGGY_ITEM_MAP_FILE, 'utf8'));
    const vault = new OpenFinanceLiveStagingVault({ databasePath: process.env.OPEN_FINANCE_LIVE_STAGING_DB, secret });
    try {
        const items = map.map(mapping => vault.readItemByAlias(mapping.alias)).filter(Boolean);
        const canonical = readCanonicalTransactions(path.resolve(process.env.READ_MODEL_DB_PATH || 'data/read_model.sqlite'));
        const result = reconcileOpenFinanceShadow({ openFinanceItems: items, canonicalTransactions: canonical, secret });
        const canonicalDays = canonical.map(item => day(item.date)).filter(Number.isFinite);
        const minCanonicalDay = canonicalDays.length ? Math.min(...canonicalDays) : null;
        const maxCanonicalDay = canonicalDays.length ? Math.max(...canonicalDays) : null;
        const providerInCanonicalWindow = items.flatMap(item => item.transactions || []).filter(transaction => {
            const transactionDay = day(transaction.date);
            return transactionDay !== null && minCanonicalDay !== null &&
                transactionDay >= minCanonicalDay && transactionDay <= maxCanonicalDay;
        }).length;
        const totals = Object.values(result.summary).reduce((acc, item) => {
            for (const key of ['matched', 'new', 'possible_duplicate', 'uncertain', 'total']) acc[key] += item[key];
            return acc;
        }, { matched: 0, new: 0, possible_duplicate: 0, uncertain: 0, total: 0 });
        process.stdout.write(`${JSON.stringify({
            gate: 'PHASE_9D_SHADOW_PREVIEW', outcome: 'GO', aliases: result.summary,
            totals, canonical_candidates: canonical.length, phase3g_links: result.phase3g_links.length,
            temporal_coverage: {
                canonical_days: canonicalDays.length,
                provider_transactions_in_canonical_window: providerInCanonicalWindow
            },
            runtime_connected: false, financial_writes: 0
        }, null, 2)}\n`);
    } finally { vault.close(); }
}

try { main(); } catch (error) {
    process.stderr.write(`${JSON.stringify({ gate: 'PHASE_9D_SHADOW_PREVIEW', outcome: 'NO_GO', reason: error.message, financial_writes: 0 })}\n`);
    process.exitCode = 1;
}
