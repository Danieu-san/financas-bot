const fs = require('node:fs');
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');
const { OpenFinanceBaselineStore } = require('../src/openFinance/openFinanceBaselineStore');
const { classifyOpenFinanceLifecycle } = require('../src/openFinance/openFinanceLifecycleClassifier');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');

function main() {
    if (!process.argv.includes('--confirm-no-send')) throw new Error('confirm_no_send_required');
    const secret = fs.readFileSync(process.env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE, 'utf8').trim();
    const mappings = JSON.parse(fs.readFileSync(process.env.PLUGGY_ITEM_MAP_FILE, 'utf8'));
    const policies = JSON.parse(fs.readFileSync(process.env.OPEN_FINANCE_VISIBILITY_POLICY_FILE, 'utf8'));
    const vault = new OpenFinanceLiveStagingVault({ databasePath: process.env.OPEN_FINANCE_LIVE_STAGING_DB, secret });
    const baseline = new OpenFinanceBaselineStore({ databasePath: process.env.OPEN_FINANCE_BASELINE_DB, secret });
    const outbox = new OpenFinanceAlertOutbox({ databasePath: process.env.OPEN_FINANCE_OUTBOX_DB, secret });
    try {
        const items = mappings.map(mapping => vault.readItemByAlias(mapping.alias)).filter(Boolean);
        const lifecycle = classifyOpenFinanceLifecycle({ items, secret });
        const baselineStats = baseline.stats();
        const baselineComplete = baselineStats.connections === mappings.length && baselineStats.completed_baselines === mappings.length;
        const candidates = baseline.listCandidates();
        const queued = outbox.enqueue({ candidates, lifecycleDecisions: lifecycle.decisions, items, policies, baselineComplete });
        process.stdout.write(`${JSON.stringify({
            gate: 'PHASE_9D1C_OUTBOX_NO_SEND', outcome: 'GO', baseline_complete: baselineComplete,
            queued, outbox: outbox.stats(), transport_connected: false, financial_writes: 0
        }, null, 2)}\n`);
    } finally { outbox.close(); baseline.close(); vault.close(); }
}

try { main(); } catch (error) {
    process.stderr.write(`${JSON.stringify({ gate: 'PHASE_9D1C_OUTBOX_NO_SEND', outcome: 'NO_GO', reason: error.message, financial_writes: 0 })}\n`);
    process.exitCode = 1;
}
