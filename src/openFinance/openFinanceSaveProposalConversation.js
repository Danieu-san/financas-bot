const fs = require('node:fs');
const { OpenFinanceAlertOutbox } = require('./openFinanceAlertOutbox');
const { OpenFinanceRevocationJournal } = require('./openFinanceRevocationJournal');
const { OpenFinanceShadowPreviewStore } = require('./openFinanceShadowPreviewStore');

function normalizeReply(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function classifySaveProposalReply(value) {
    const normalized = normalizeReply(value);
    if (['sim', 's', 'ss', 'confirmo', 'continuar'].includes(normalized)) return 'accept';
    if (['nao', 'n', 'recusar'].includes(normalized)) return 'decline';
    if (['cancelar', 'cancela'].includes(normalized)) return 'cancel';
    return null;
}

function assertPromptConfiguration(env = process.env) {
    const mode = String(env.OPEN_FINANCE_SAVE_PROPOSAL_MODE || 'off').trim().toLowerCase();
    if (['off', 'shadow'].includes(mode)) return { enabled: false };
    if (mode !== 'prompt') throw new Error('invalid_open_finance_save_proposal_mode');
    if (String(env.OPEN_FINANCE_WRITE_MODE || 'off').trim().toLowerCase() !== 'off') {
        throw new Error('open_finance_prompt_requires_write_mode_off');
    }
    const required = [
        env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE,
        env.OPEN_FINANCE_REVOCATION_JOURNAL_DB,
        env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
        env.OPEN_FINANCE_OUTBOX_DB
    ];
    if (required.some(file => !file || !fs.existsSync(file))) {
        throw new Error('open_finance_save_proposal_state_unavailable');
    }
    return { enabled: true };
}

function handleOpenFinanceSaveProposalReply({
    messageBody,
    actorWhatsappId,
    expectedProposalRef = null,
    env = process.env,
    dependencies = {}
} = {}) {
    const configuration = assertPromptConfiguration(env);
    if (!configuration.enabled) return { handled: false, financial_writes: 0 };
    const intent = classifySaveProposalReply(messageBody);
    if (!intent && !expectedProposalRef) return { handled: false, financial_writes: 0 };
    if (!intent) {
        return {
            handled: true,
            keep_pending: true,
            reply: 'Responda *sim* para continuar, *não* para recusar ou *cancelar* para encerrar. Nada foi salvo.',
            financial_writes: 0
        };
    }

    const secret = fs.readFileSync(env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE, 'utf8').trim();
    const Journal = dependencies.OpenFinanceRevocationJournal || OpenFinanceRevocationJournal;
    const Preview = dependencies.OpenFinanceShadowPreviewStore || OpenFinanceShadowPreviewStore;
    const Outbox = dependencies.OpenFinanceAlertOutbox || OpenFinanceAlertOutbox;
    const journal = new Journal({
        databasePath: env.OPEN_FINANCE_REVOCATION_JOURNAL_DB,
        secret
    });
    const preview = new Preview({
        databasePath: env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
        secret,
        revocationJournal: journal,
        authorizedWhatsAppIds: [actorWhatsappId]
    });
    const outbox = new Outbox({
        databasePath: env.OPEN_FINANCE_OUTBOX_DB,
        secret
    });
    try {
        const ready = preview.listReadySaveProposalConfirmations({
            actorWhatsappId,
            limit: 2
        });
        const delivered = ready.filter(item =>
            outbox.getProposalDeliveryState(item.proposal_ref) === 'delivered_confirmed');
        const candidates = expectedProposalRef
            ? delivered.filter(item => item.proposal_ref === expectedProposalRef)
            : delivered;
        if (candidates.length === 0) {
            return {
                handled: Boolean(expectedProposalRef),
                keep_pending: false,
                reply: expectedProposalRef
                    ? 'Essa proposta não está mais disponível. Nenhum lançamento foi salvo.'
                    : null,
                financial_writes: 0
            };
        }
        if (candidates.length !== 1 || delivered.length !== 1) {
            throw new Error('ambiguous_open_finance_save_proposal_reply');
        }
        const confirmation = candidates[0];
        if (intent === 'cancel') {
            const result = preview.cancelSaveProposal(confirmation.proposal_ref, { actorWhatsappId });
            return {
                handled: true,
                keep_pending: false,
                state: 'cancelled',
                proposal_ref: confirmation.proposal_ref,
                replay: result.replay,
                reply: 'Proposta cancelada. Nenhum lançamento foi salvo.',
                financial_writes: 0
            };
        }
        const result = preview.decideSaveProposalConfirmation(
            confirmation.confirmation_ref,
            intent,
            { actorWhatsappId }
        );
        return {
            handled: true,
            keep_pending: false,
            state: result.state,
            proposal_ref: result.proposal_ref,
            replay: result.replay,
            reply: intent === 'accept'
                ? 'Proposta aceita para a próxima conferência. Nada foi salvo ainda.'
                : 'Entendido. Não vou salvar esse lançamento.',
            financial_writes: 0
        };
    } finally {
        outbox.close();
        preview.close();
        journal.close();
    }
}

module.exports = {
    handleOpenFinanceSaveProposalReply,
    classifySaveProposalReply,
    assertPromptConfiguration
};
