function validateAlias(alias) {
    const normalized = String(alias || '').toLowerCase();
    if (!/^[a-z0-9_-]{2,48}$/.test(normalized)) throw new Error('valid_open_finance_alias_required');
    return normalized;
}

function revokeOpenFinanceConsent({ alias, itemId, vault, baseline, outbox, journal, preview,
    previewMode = 'off', generation = 1,
    revokedAt = new Date().toISOString(), reasonCode = 'consent_revoked' } = {}) {
    const normalizedAlias = validateAlias(alias);
    if (!String(itemId || '').trim()) throw new Error('open_finance_item_id_required');
    if (!vault?.revokeItem || !baseline?.revokeConnection || !outbox?.revokeSourceAlias || !journal?.recordRevocation) {
        throw new Error('open_finance_revocation_stores_required');
    }
    if (!['off', 'canary'].includes(previewMode)) throw new Error('invalid_open_finance_shadow_preview_mode');
    if (previewMode === 'canary' && !preview?.revokeSourceAlias) {
        throw new Error('open_finance_shadow_preview_required_for_revocation');
    }
    const options = { revokedAt, reasonCode };
    const durableJournal = journal.recordRevocation({ alias: normalizedAlias, generation, revokedAt, reasonCode });
    // Stop future delivery first. Every step is idempotent so an interrupted
    // operation can safely be replayed before polling is enabled again.
    const alerts = outbox.revokeSourceAlias(normalizedAlias, options);
    const history = baseline.revokeConnection(normalizedAlias, options);
    const staging = vault.revokeItem(String(itemId), options);
    const reviews = preview
        ? preview.revokeSourceAlias(normalizedAlias, { ...options, generation })
        : { configured: false, removed_previews: 0, financial_writes: 0 };
    return Object.freeze({
        revoked: true,
        alias: normalizedAlias,
        alerts,
        history,
        staging,
        reviews,
        journal: durableJournal,
        provider_consent_revoked: false,
        financial_writes: 0
    });
}

function reinstateOpenFinanceConsent({ alias, itemId, ownerScope, vault, baseline, outbox, journal, newGeneration } = {}) {
    const normalizedAlias = validateAlias(alias);
    if (!String(itemId || '').trim()) throw new Error('open_finance_item_id_required');
    if (!vault?.reinstateItem || !baseline?.reinstateConnection || !outbox?.reinstateSourceAlias ||
        !journal?.revokedGeneration) {
        throw new Error('open_finance_reinstatement_stores_required');
    }
    const generation = Number(newGeneration);
    const revokedGeneration = journal.revokedGeneration(normalizedAlias);
    if (!Number.isInteger(generation) || generation <= revokedGeneration) {
        throw new Error('reconsent_requires_new_generation');
    }
    const staging = vault.reinstateItem(String(itemId));
    const history = baseline.reinstateConnection(normalizedAlias, {
        itemId: String(itemId), ownerScope, generation
    });
    const alerts = outbox.reinstateSourceAlias(normalizedAlias);
    return Object.freeze({ reinstated: true, alias: normalizedAlias, generation, staging, history, alerts,
        baseline_required: true, financial_writes: 0 });
}

module.exports = { revokeOpenFinanceConsent, reinstateOpenFinanceConsent };
