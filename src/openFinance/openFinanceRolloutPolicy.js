const ALLOWED_MODES = new Set(['off', 'shadow', 'canary']);

function parseCanaryAliases(env, blockers) {
    const legacyAlias = String(env.OPEN_FINANCE_ALERT_CANARY_ALIAS || '').trim().toLowerCase();
    const list = String(env.OPEN_FINANCE_ALERT_CANARY_ALIASES || '').split(',')
        .map(value => value.trim().toLowerCase()).filter(Boolean);
    if (legacyAlias && list.length && (list.length !== 1 || list[0] !== legacyAlias)) {
        blockers.push('conflicting_canary_alias_configuration');
    }
    const aliases = list.length ? list : (legacyAlias ? [legacyAlias] : []);
    if (new Set(aliases).size !== aliases.length) blockers.push('duplicate_canary_alias');
    if (aliases.length > 4) blockers.push('canary_alias_limit_exceeded');
    if (aliases.some(alias => !/^[a-z0-9_-]{2,48}$/.test(alias))) blockers.push('invalid_canary_alias');
    return aliases;
}

function parseCanaryActivations(env, aliases, blockers) {
    const raw = String(env.OPEN_FINANCE_ALERT_CANARY_ACTIVATIONS_JSON || '').trim();
    if (!raw) {
        if (aliases.length > 1) blockers.push('multi_canary_activation_required');
        return {};
    }
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) {
        blockers.push('invalid_canary_activation_json');
        return {};
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        blockers.push('invalid_canary_activation_json');
        return {};
    }
    const activations = {};
    for (const alias of aliases) {
        const value = String(parsed[alias] || '');
        if (!value || !Number.isFinite(Date.parse(value))) blockers.push('canary_activation_missing');
        else activations[alias] = new Date(value).toISOString();
    }
    if (Object.keys(parsed).some(alias => !aliases.includes(String(alias).toLowerCase()))) {
        blockers.push('unknown_canary_activation_alias');
    }
    return activations;
}

function buildOpenFinanceRolloutPolicy({ env = process.env, evidence = {}, mappings = [], vaultAvailable = false } = {}) {
    const mode = String(env.OPEN_FINANCE_ALERT_MODE || 'off').toLowerCase();
    const writeMode = String(env.OPEN_FINANCE_WRITE_MODE || 'off').toLowerCase();
    const blockers = [];
    const canaryAliases = parseCanaryAliases(env, blockers);
    const canaryActivations = parseCanaryActivations(env, canaryAliases, blockers);
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
    if (mode === 'canary' && (!canaryAliases.length || canaryAliases.some(alias => !aliases.has(alias)))) {
        blockers.push('known_canary_alias_required');
    }
    if (mode === 'shadow' && canaryAliases.length) blockers.push('shadow_must_not_select_recipient');
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
        canary_alias: mode === 'canary' && enabled && canaryAliases.length === 1 ? canaryAliases[0] : null,
        canary_aliases: Object.freeze(mode === 'canary' && enabled ? [...canaryAliases] : []),
        canary_activations: Object.freeze(mode === 'canary' && enabled ? { ...canaryActivations } : {}),
        blockers: Object.freeze(blockers)
    });
}

module.exports = { buildOpenFinanceRolloutPolicy, parseCanaryAliases, parseCanaryActivations };
