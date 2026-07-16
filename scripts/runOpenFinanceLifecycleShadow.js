const fs = require('node:fs');
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');
const { classifyOpenFinanceLifecycle } = require('../src/openFinance/openFinanceLifecycleClassifier');

function main() {
    if (!process.argv.includes('--confirm-shadow-read')) throw new Error('confirm_shadow_read_required');
    const secret = fs.readFileSync(process.env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE, 'utf8').trim();
    const mappings = JSON.parse(fs.readFileSync(process.env.PLUGGY_ITEM_MAP_FILE, 'utf8'));
    const vault = new OpenFinanceLiveStagingVault({ databasePath: process.env.OPEN_FINANCE_LIVE_STAGING_DB, secret });
    try {
        const items = mappings.map(mapping => vault.readItemByAlias(mapping.alias)).filter(Boolean);
        const result = classifyOpenFinanceLifecycle({ items, secret });
        process.stdout.write(`${JSON.stringify({
            gate: 'PHASE_9D1B_LIFECYCLE_SHADOW', outcome: 'GO', summary: result.summary,
            observations: result.decisions.length, investments_excluded: result.investments_excluded,
            alert_candidates: 0, runtime_connected: false, financial_writes: 0
        }, null, 2)}\n`);
    } finally { vault.close(); }
}

try { main(); } catch (error) {
    process.stderr.write(`${JSON.stringify({ gate: 'PHASE_9D1B_LIFECYCLE_SHADOW', outcome: 'NO_GO', reason: error.message, financial_writes: 0 })}\n`);
    process.exitCode = 1;
}
