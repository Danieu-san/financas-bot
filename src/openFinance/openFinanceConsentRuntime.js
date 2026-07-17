const fs = require('node:fs');
const { OpenFinanceLiveStagingVault } = require('./openFinanceLiveStagingVault');
const { OpenFinanceBaselineStore } = require('./openFinanceBaselineStore');
const { OpenFinanceAlertOutbox } = require('./openFinanceAlertOutbox');
const { OpenFinanceRevocationJournal } = require('./openFinanceRevocationJournal');
const { OpenFinanceShadowPreviewStore } = require('./openFinanceShadowPreviewStore');
const { revokeOpenFinanceConsent } = require('./openFinanceConsentLifecycle');

function requiredFile(value, reason) {
    const file = String(value || '');
    if (!file || !fs.existsSync(file)) throw new Error(reason);
    return file;
}

function closeOpenedStores(opened) {
    let closeError = null;
    while (opened.length) {
        try {
            opened.pop().close();
        } catch (error) {
            closeError ||= error;
        }
    }
    if (closeError) throw closeError;
}

function openFinanceConsentRuntime({ env = process.env, dependencies = {} } = {}) {
    const previewMode = String(env.OPEN_FINANCE_SHADOW_PREVIEW_MODE || 'off').trim().toLowerCase();
    if (!['off', 'canary'].includes(previewMode)) throw new Error('invalid_open_finance_shadow_preview_mode');
    const secretFile = requiredFile(env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE, 'open_finance_secret_unavailable');
    const paths = {
        staging: requiredFile(env.OPEN_FINANCE_LIVE_STAGING_DB, 'open_finance_staging_unavailable'),
        baseline: requiredFile(env.OPEN_FINANCE_BASELINE_DB, 'open_finance_baseline_unavailable'),
        outbox: requiredFile(env.OPEN_FINANCE_OUTBOX_DB, 'open_finance_outbox_unavailable'),
        journal: requiredFile(env.OPEN_FINANCE_REVOCATION_JOURNAL_DB, 'open_finance_revocation_journal_unavailable')
    };
    if (previewMode === 'canary') {
        paths.preview = requiredFile(env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
            'open_finance_shadow_preview_unavailable');
    }
    const secret = fs.readFileSync(secretFile, 'utf8').trim();
    if (secret.length < 32) throw new Error('open_finance_secret_invalid');
    const Stores = {
        Vault: dependencies.OpenFinanceLiveStagingVault || OpenFinanceLiveStagingVault,
        Baseline: dependencies.OpenFinanceBaselineStore || OpenFinanceBaselineStore,
        Outbox: dependencies.OpenFinanceAlertOutbox || OpenFinanceAlertOutbox,
        Journal: dependencies.OpenFinanceRevocationJournal || OpenFinanceRevocationJournal,
        Preview: dependencies.OpenFinanceShadowPreviewStore || OpenFinanceShadowPreviewStore
    };
    const opened = [];
    try {
        const vault = new Stores.Vault({ databasePath: paths.staging, secret }); opened.push(vault);
        const baseline = new Stores.Baseline({ databasePath: paths.baseline, secret }); opened.push(baseline);
        const outbox = new Stores.Outbox({ databasePath: paths.outbox, secret }); opened.push(outbox);
        const journal = new Stores.Journal({ databasePath: paths.journal, secret }); opened.push(journal);
        const preview = paths.preview
            ? new Stores.Preview({ databasePath: paths.preview, secret, revocationJournal: journal })
            : null;
        if (preview) opened.push(preview);
        return {
            previewMode,
            revoke: options => revokeOpenFinanceConsent({ ...options, vault, baseline, outbox, journal, preview,
                previewMode }),
            close: () => closeOpenedStores(opened)
        };
    } catch (error) {
        try { closeOpenedStores(opened); } catch {}
        throw error;
    }
}

module.exports = { openFinanceConsentRuntime };
