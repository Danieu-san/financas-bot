const fs = require('node:fs');
const { OpenFinanceAlertOutbox } = require('./openFinanceAlertOutbox');
const { OpenFinanceRevocationJournal } = require('./openFinanceRevocationJournal');
const { OpenFinanceShadowPreviewStore } = require('./openFinanceShadowPreviewStore');
const {
    OpenFinanceSaveProposalReviewStore
} = require('./openFinanceSaveProposalReviewStore');

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

function formatMoneyFromCents(value) {
    if (!Number.isSafeInteger(value)) return 'não informado';
    return (value / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function reviewMissingFields(draft = {}) {
    const missing = [];
    if (!draft.person) missing.push('pessoa');
    if (!draft.category) missing.push('categoria');
    if (!draft.paymentMethod) missing.push('forma de pagamento');
    if (draft.paymentMethod?.value === 'Crédito' && !draft.card) {
        missing.push('cartão');
    }
    if (['Débito', 'PIX'].includes(draft.paymentMethod?.value) &&
        !draft.financialAccount) {
        missing.push('conta financeira');
    }
    return missing;
}

function formatReviewSummary(payload, { includeMenu = true } = {}) {
    const draft = payload?.draft || {};
    const source = payload?.source || {};
    const category = draft.category
        ? `${draft.category.category}${draft.category.subcategory
            ? ` / ${draft.category.subcategory}`
            : ''}`
        : 'não definida';
    const lines = [
        'Confira a proposta:',
        `Descrição: ${source.description || 'não informada'}`,
        `Valor: ${formatMoneyFromCents(source.amount_cents)}`,
        `Pessoa: ${draft.person?.label || 'não definida'}`,
        `Categoria: ${category}`,
        `Pagamento: ${draft.paymentMethod?.label || 'não definido'}`,
        `Conta financeira: ${draft.financialAccount?.label || 'não definida'}`,
        `Cartão: ${draft.card?.label || 'não definido'}`
    ];
    const missing = reviewMissingFields(draft);
    if (missing.length) lines.push(`Ainda falta: ${missing.join(', ')}.`);
    if (includeMenu) {
        lines.push(
            '',
            'O que deseja ajustar?',
            '1. Pessoa',
            '2. Categoria',
            '3. Forma de pagamento',
            '4. Conta financeira',
            '5. Cartão',
            '6. Concluir conferência',
            '0. Cancelar',
            '',
            'Responda com o número. Nada foi salvo.'
        );
    } else {
        lines.push('', 'Nada foi salvo.');
    }
    return lines.join('\n');
}

function reviewOptionsForStep(payload = {}) {
    const catalog = payload.catalog || {};
    if (payload.step === 'select_person') return catalog.people || [];
    if (payload.step === 'select_category') return catalog.categories || [];
    if (payload.step === 'select_payment') return catalog.paymentMethods || [];
    if (payload.step === 'select_account') return catalog.financialAccounts || [];
    if (payload.step === 'select_card') return catalog.cards || [];
    return [];
}

function formatReviewOptions(payload = {}) {
    const labels = {
        select_person: 'Escolha a pessoa:',
        select_category: 'Escolha a categoria:',
        select_payment: 'Escolha a forma de pagamento:',
        select_account: 'Escolha a conta financeira:',
        select_card: 'Escolha o cartão:'
    };
    const options = reviewOptionsForStep(payload);
    if (!options.length) {
        return [
            `${labels[payload.step] || 'Escolha uma opção:'}`,
            'Não há opções autorizadas disponíveis nesse catálogo.',
            'Envie *voltar* para revisar os outros campos. Nada foi salvo.'
        ].join('\n');
    }
    return [
        labels[payload.step] || 'Escolha uma opção:',
        ...options.map((option, index) => `${index + 1}. ${option.label}`),
        '',
        'Responda com o número ou envie *voltar*. Nada foi salvo.'
    ].join('\n');
}

function openReviewStore({ env, secret, actorWhatsappId, dependencies = {} }) {
    const Review = dependencies.OpenFinanceSaveProposalReviewStore ||
        OpenFinanceSaveProposalReviewStore;
    return new Review({
        databasePath: env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
        secret,
        authorizedWhatsAppIds: [actorWhatsappId]
    });
}

function cancelPreparedReviewIfPresent({
    proposalRef,
    actorWhatsappId,
    env,
    secret,
    dependencies = {}
}) {
    const reviewStore = openReviewStore({
        env,
        secret,
        actorWhatsappId,
        dependencies
    });
    try {
        const review = reviewStore.readReviewPrivate(
            proposalRef,
            { actorWhatsappId }
        );
        if (review?.state !== 'prepared') return null;
        return reviewStore.cancelReview(
            proposalRef,
            { actorWhatsappId }
        );
    } finally {
        reviewStore.close();
    }
}

function handleOpenFinanceSaveProposalReply({
    messageBody,
    actorWhatsappId,
    expectedProposalRef = null,
    reviewCatalog = null,
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
            cancelPreparedReviewIfPresent({
                proposalRef: confirmation.proposal_ref,
                actorWhatsappId,
                env,
                secret,
                dependencies
            });
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
        let reviewStore = null;
        let preparedReview = null;
        if (intent === 'accept') {
            if (!reviewCatalog) throw new Error('open_finance_save_review_catalog_required');
            const proposal = preview.readReviewableSaveProposal(
                confirmation.proposal_ref,
                { actorWhatsappId }
            );
            reviewStore = openReviewStore({
                env,
                secret,
                actorWhatsappId,
                dependencies
            });
            preparedReview = reviewStore.prepareReview({
                proposalRef: confirmation.proposal_ref,
                proposal,
                actorWhatsappId,
                catalog: reviewCatalog
            });
        }
        let result;
        try {
            result = preview.decideSaveProposalConfirmation(
                confirmation.confirmation_ref,
                intent,
                { actorWhatsappId }
            );
            if (intent === 'accept') {
                const activated = reviewStore.activateReview(
                    confirmation.proposal_ref,
                    { actorWhatsappId }
                );
                return {
                    handled: true,
                    keep_pending: true,
                    state: 'review_editing',
                    proposal_ref: result.proposal_ref,
                    replay: result.replay,
                    reply: formatReviewSummary(activated.payload || preparedReview.payload),
                    financial_writes: 0
                };
            }
        } finally {
            reviewStore?.close();
        }
        if (intent === 'decline') {
            cancelPreparedReviewIfPresent({
                proposalRef: result.proposal_ref,
                actorWhatsappId,
                env,
                secret,
                dependencies
            });
        }
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

function handleOpenFinanceSaveProposalReviewReply({
    messageBody,
    actorWhatsappId,
    expectedProposalRef = null,
    env = process.env,
    dependencies = {}
} = {}) {
    const configuration = assertPromptConfiguration(env);
    if (!configuration.enabled) return { handled: false, financial_writes: 0 };
    const secret = fs.readFileSync(env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE, 'utf8').trim();
    const reviewStore = openReviewStore({
        env,
        secret,
        actorWhatsappId,
        dependencies
    });
    try {
        const active = reviewStore.listActiveReviews({ actorWhatsappId, limit: 2 });
        let candidates = active;
        if (expectedProposalRef) {
            const exact = reviewStore.readReviewPrivate(
                expectedProposalRef,
                { actorWhatsappId }
            );
            candidates = exact && ['prepared', 'editing'].includes(exact.state)
                ? [{
                    proposal_ref: exact.proposal_ref,
                    state: exact.state,
                    step: exact.payload?.step,
                    financial_writes: 0
                }]
                : [];
        }
        if (candidates.length === 0) {
            return {
                handled: Boolean(expectedProposalRef),
                keep_pending: false,
                reply: expectedProposalRef
                    ? 'Essa conferência não está mais disponível. Nenhum lançamento foi salvo.'
                    : null,
                financial_writes: 0
            };
        }
        if (candidates.length !== 1 || active.length !== 1) {
            throw new Error('ambiguous_open_finance_save_review_reply');
        }
        const proposalRef = candidates[0].proposal_ref;
        let review = reviewStore.readReviewPrivate(proposalRef, { actorWhatsappId });
        if (review.state === 'prepared') {
            const Journal = dependencies.OpenFinanceRevocationJournal ||
                OpenFinanceRevocationJournal;
            const Preview = dependencies.OpenFinanceShadowPreviewStore ||
                OpenFinanceShadowPreviewStore;
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
            try {
                const decisionState = preview.readSaveProposalDecisionState(
                    proposalRef,
                    { actorWhatsappId }
                );
                if (decisionState?.confirmation_state === 'declined' ||
                    decisionState?.proposal_state === 'cancelled') {
                    const cancelled = reviewStore.cancelReview(
                        proposalRef,
                        { actorWhatsappId }
                    );
                    return {
                        handled: true,
                        keep_pending: false,
                        state: cancelled.state,
                        proposal_ref: proposalRef,
                        reply: 'Conferência cancelada. Nenhum lançamento foi salvo.',
                        financial_writes: 0
                    };
                }
                if (decisionState?.confirmation_state !== 'accepted') {
                    return { handled: false, financial_writes: 0 };
                }
                const proposal = preview.readReviewableSaveProposal(
                    proposalRef,
                    { actorWhatsappId }
                );
                review = reviewStore.activateReview(
                    proposalRef,
                    { actorWhatsappId }
                );
            } finally {
                preview.close();
                journal.close();
            }
        }

        const normalized = normalizeReply(messageBody);
        if (['cancelar', 'cancela', '0'].includes(normalized)) {
            const cancelled = reviewStore.cancelReview(
                proposalRef,
                { actorWhatsappId }
            );
            return {
                handled: true,
                keep_pending: false,
                state: cancelled.state,
                proposal_ref: proposalRef,
                reply: 'Conferência cancelada. Nenhum lançamento foi salvo.',
                financial_writes: 0
            };
        }
        if (normalized === 'voltar') {
            const updated = reviewStore.updateReview(proposalRef, {
                actorWhatsappId,
                mutate: payload => ({ ...payload, step: 'menu' })
            });
            return {
                handled: true,
                keep_pending: true,
                state: 'review_editing',
                proposal_ref: proposalRef,
                reply: formatReviewSummary(updated.payload),
                financial_writes: 0
            };
        }

        const payload = review.payload;
        if (payload.step === 'menu') {
            const fieldByChoice = {
                '1': 'select_person',
                '2': 'select_category',
                '3': 'select_payment',
                '4': 'select_account',
                '5': 'select_card'
            };
            if (normalized === '6') {
                const missing = reviewMissingFields(payload.draft);
                if (missing.length) {
                    return {
                        handled: true,
                        keep_pending: true,
                        state: 'review_editing',
                        proposal_ref: proposalRef,
                        reply: `Ainda não posso concluir: falta ${missing.join(', ')}.\n\n${formatReviewSummary(payload)}`,
                        financial_writes: 0
                    };
                }
                const completed = reviewStore.completeReview(
                    proposalRef,
                    { actorWhatsappId }
                );
                return {
                    handled: true,
                    keep_pending: false,
                    state: 'review_ready',
                    proposal_ref: proposalRef,
                    reply: [
                        formatReviewSummary(completed.payload, { includeMenu: false }),
                        'Conferência concluída para a próxima revalidação. Nada foi salvo.'
                    ].join('\n'),
                    financial_writes: 0
                };
            }
            const step = fieldByChoice[normalized];
            if (!step) {
                return {
                    handled: true,
                    keep_pending: true,
                    state: 'review_editing',
                    proposal_ref: proposalRef,
                    reply: `Escolha uma opção de 0 a 6.\n\n${formatReviewSummary(payload)}`,
                    financial_writes: 0
                };
            }
            const updated = reviewStore.updateReview(proposalRef, {
                actorWhatsappId,
                mutate: current => ({ ...current, step })
            });
            return {
                handled: true,
                keep_pending: true,
                state: 'review_editing',
                proposal_ref: proposalRef,
                reply: formatReviewOptions(updated.payload),
                financial_writes: 0
            };
        }

        const options = reviewOptionsForStep(payload);
        const choice = /^\d+$/.test(normalized) ? Number.parseInt(normalized, 10) : 0;
        const selected = choice >= 1 ? options[choice - 1] : null;
        if (!selected) {
            return {
                handled: true,
                keep_pending: true,
                state: 'review_editing',
                proposal_ref: proposalRef,
                reply: `Escolha o número de uma opção válida.\n\n${formatReviewOptions(payload)}`,
                financial_writes: 0
            };
        }
        const updated = reviewStore.updateReview(proposalRef, {
            actorWhatsappId,
            mutate: current => {
                if (current.step === 'select_person') {
                    current.draft.person = { id: selected.id, label: selected.label };
                } else if (current.step === 'select_category') {
                    current.draft.category = {
                        id: selected.id,
                        label: selected.label,
                        category: selected.category,
                        subcategory: selected.subcategory
                    };
                } else if (current.step === 'select_payment') {
                    current.draft.paymentMethod = {
                        id: selected.id,
                        label: selected.label,
                        value: selected.value
                    };
                    if (selected.value === 'Crédito') {
                        current.draft.financialAccount = null;
                    } else {
                        current.draft.card = null;
                    }
                } else if (current.step === 'select_account') {
                    current.draft.financialAccount = {
                        id: selected.id,
                        label: selected.label,
                        ownerUserId: selected.ownerUserId || ''
                    };
                } else if (current.step === 'select_card') {
                    current.draft.card = { id: selected.id, label: selected.label };
                }
                current.step = 'menu';
                return current;
            }
        });
        return {
            handled: true,
            keep_pending: true,
            state: 'review_editing',
            proposal_ref: proposalRef,
            reply: formatReviewSummary(updated.payload),
            financial_writes: 0
        };
    } finally {
        reviewStore.close();
    }
}

module.exports = {
    handleOpenFinanceSaveProposalReply,
    handleOpenFinanceSaveProposalReviewReply,
    classifySaveProposalReply,
    assertPromptConfiguration,
    formatOpenFinanceSaveProposalReviewSummary: formatReviewSummary
};
