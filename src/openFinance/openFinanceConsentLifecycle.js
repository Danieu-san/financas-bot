function validateAlias(alias) {
    const normalized = String(alias || '').toLowerCase();
    if (!/^[a-z0-9_-]{2,48}$/.test(normalized)) throw new Error('valid_open_finance_alias_required');
    return normalized;
}

function revokeOpenFinanceConsent({ alias, itemId, vault, baseline, outbox,
    revokedAt = new Date().toISOString(), reasonCode = 'consent_revoked' } = {}) {
    const normalizedAlias = validateAlias(alias);
    if (!String(itemId || '').trim()) throw new Error('open_finance_item_id_required');
    if (!vault?.revokeItem || !baseline?.revokeConnection || !outbox?.revokeSourceAlias) {
        throw new Error('open_finance_revocation_stores_required');
    }
    const options = { revokedAt, reasonCode };
    // Stop future delivery first. Every step is idempotent so an interrupted
    // operation can safely be replayed before polling is enabled again.
    const alerts = outbox.revokeSourceAlias(normalizedAlias, options);
    const history = baseline.revokeConnection(normalizedAlias, options);
    const staging = vault.revokeItem(String(itemId), options);
    return Object.freeze({
        revoked: true,
        alias: normalizedAlias,
        alerts,
        history,
        staging,
        provider_consent_revoked: false,
        financial_writes: 0
    });
}

function reinstateOpenFinanceConsent({ alias, itemId, vault, baseline, outbox } = {}) {
    const normalizedAlias = validateAlias(alias);
    if (!String(itemId || '').trim()) throw new Error('open_finance_item_id_required');
    if (!vault?.reinstateItem || !baseline?.reinstateConnection || !outbox?.reinstateSourceAlias) {
        throw new Error('open_finance_reinstatement_stores_required');
    }
    const staging = vault.reinstateItem(String(itemId));
    const history = baseline.reinstateConnection(normalizedAlias);
    const alerts = outbox.reinstateSourceAlias(normalizedAlias);
    return Object.freeze({ reinstated: true, alias: normalizedAlias, staging, history, alerts,
        baseline_required: true, financial_writes: 0 });
}

module.exports = { revokeOpenFinanceConsent, reinstateOpenFinanceConsent };
