const WRITE_MODES = new Set(['off', 'confirm']);

function normalizeMode(value, fallback = 'off') {
    return String(value || fallback).trim().toLowerCase();
}

function evaluateOpenFinanceWriteActivation(env = process.env) {
    const alertMode = normalizeMode(env.OPEN_FINANCE_ALERT_MODE);
    const proposalMode = normalizeMode(env.OPEN_FINANCE_SAVE_PROPOSAL_MODE);
    const previewMode = normalizeMode(env.OPEN_FINANCE_SHADOW_PREVIEW_MODE);
    const reconciliationMode = normalizeMode(
        env.OPEN_FINANCE_RECONCILIATION_MODE
    );
    const writeMode = normalizeMode(env.OPEN_FINANCE_WRITE_MODE);
    const explicitlyApproved = normalizeMode(
        env.OPEN_FINANCE_WRITE_APPROVED,
        'false'
    ) === 'true';
    const blockers = [];

    if (!WRITE_MODES.has(writeMode)) {
        blockers.push('open_finance_write_mode_invalid');
    } else if (writeMode === 'confirm') {
        if (alertMode !== 'canary') {
            blockers.push('open_finance_write_canary_required');
        }
        if (proposalMode !== 'prompt') {
            blockers.push('open_finance_write_prompt_required');
        }
        if (previewMode !== 'canary') {
            blockers.push('open_finance_write_preview_required');
        }
        if (reconciliationMode !== 'canary') {
            blockers.push('open_finance_write_reconciliation_required');
        }
        if (!explicitlyApproved) {
            blockers.push('open_finance_write_approval_required');
        }
    }

    const enabled = writeMode === 'confirm' && blockers.length === 0;
    return Object.freeze({
        enabled,
        requested: writeMode === 'confirm',
        alertMode,
        proposalMode,
        previewMode,
        reconciliationMode,
        writeMode,
        explicitlyApproved,
        blockers: Object.freeze(blockers)
    });
}

module.exports = { evaluateOpenFinanceWriteActivation };
