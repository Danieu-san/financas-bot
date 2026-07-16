const ALLOWED_MODES = new Set(['off', 'shadow', 'canary']);

function buildOpenFinanceRolloutPolicy({ env = process.env, evidence = {}, mappings = [], vaultAvailable = false } = {}) {
    const mode = String(env.OPEN_FINANCE_ALERT_MODE || 'off').toLowerCase();
    const writeMode = String(env.OPEN_FINANCE_WRITE_MODE || 'off').toLowerCase();
    const canaryAlias = String(env.OPEN_FINANCE_ALERT_CANARY_ALIAS || '').toLowerCase();
    const blockers = [];
    if (!ALLOWED_MODES.has(mode)) blockers.push('open_finance_rollout_mode_forbidden');
    if (writeMode !== 'off') blockers.push('open_finance_write_mode_forbidden');
    if (evidence.route !== 'meu_pluggy_connector_200') blockers.push('free_route_unverified');
    if (Number(evidence.connector_id) !== 200) blockers.push('connector_200_required');
    if (Number(evidence.observed_cost_cents) !== 0) blockers.push('nonzero_cost_forbidden');
    if (evidence.payment_method_registered !== false) blockers.push('payment_method_state_unsafe');
    if (evidence.pro_features_required !== false) blockers.push('pro_feature_dependency_forbidden');
    if (evidence.update_item_enabled !== false) blockers.push('update_item_forbidden');
    if (evidence.category_source !== 'financasbot_local') blockers.push('local_category_required');
    if (!vaultAvailable && mode !== 'off') blockers.push('encrypted_vault_unavailable');
    const aliases = new Set(mappings.map(mapping => String(mapping.alias || '').toLowerCase()));
    if (mode === 'canary' && (!aliases.has(canaryAlias) || !canaryAlias)) blockers.push('single_canary_alias_required');
    if (mode === 'shadow' && canaryAlias) blockers.push('shadow_must_not_select_recipient');
    const enabled = mode !== 'off' && blockers.length === 0;
    return Object.freeze({
        mode,
        enabled,
        can_poll_readonly: enabled,
        can_build_outbox: enabled,
        can_send_whatsapp: mode === 'canary' && enabled,
        can_write_financial: false,
        can_update_item: false,
        can_use_pro_features: false,
        canary_alias: mode === 'canary' && enabled ? canaryAlias : null,
        blockers: Object.freeze(blockers)
    });
}

module.exports = { buildOpenFinanceRolloutPolicy };
