const fs = require('node:fs');
const { buildOpenFinanceRolloutPolicy } = require('../src/openFinance/openFinanceRolloutPolicy');

function readJson(file, failure) {
    if (!file || !fs.existsSync(file)) throw new Error(failure);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
    if (!process.argv.includes('--confirm-no-runtime-change')) throw new Error('confirm_no_runtime_change_required');
    const evidence = readJson(process.env.OPEN_FINANCE_COMMERCIAL_EVIDENCE_FILE, 'commercial_evidence_unavailable');
    const mappings = readJson(process.env.PLUGGY_ITEM_MAP_FILE, 'item_mapping_unavailable');
    const vaultAvailable = Boolean(
        process.env.OPEN_FINANCE_LIVE_STAGING_DB &&
        process.env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE &&
        fs.existsSync(process.env.OPEN_FINANCE_LIVE_STAGING_DB) &&
        fs.existsSync(process.env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE)
    );
    const policy = buildOpenFinanceRolloutPolicy({ env: process.env, evidence, mappings, vaultAvailable });
    const expectedEnabled = policy.mode === 'shadow' || policy.mode === 'canary';
    const outcome = policy.enabled === expectedEnabled && policy.can_write_financial === false ? 'GO' : 'NO_GO';
    process.stdout.write(`${JSON.stringify({
        gate: 'PHASE_9E0_FAIL_CLOSED_ROLLOUT_READINESS',
        outcome,
        mode: policy.mode,
        enabled: policy.enabled,
        can_poll_readonly: policy.can_poll_readonly,
        can_build_outbox: policy.can_build_outbox,
        can_send_whatsapp: policy.can_send_whatsapp,
        can_write_financial: policy.can_write_financial,
        can_update_item: policy.can_update_item,
        can_use_pro_features: policy.can_use_pro_features,
        canary_alias_selected: policy.canary_aliases.length > 0,
        canary_alias_count: policy.canary_aliases.length,
        canary_activation_count: Object.keys(policy.canary_activations).length,
        blockers: policy.blockers,
        runtime_changed: false,
        financial_writes: 0,
        transport_calls: 0
    }, null, 2)}\n`);
    if (outcome !== 'GO') process.exitCode = 1;
}

try { main(); } catch (error) {
    process.stderr.write(`${JSON.stringify({
        gate: 'PHASE_9E0_FAIL_CLOSED_ROLLOUT_READINESS', outcome: 'NO_GO',
        reason: error.message, runtime_changed: false, financial_writes: 0, transport_calls: 0
    })}\n`);
    process.exitCode = 1;
}
