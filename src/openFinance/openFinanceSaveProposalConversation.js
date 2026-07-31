const fs = require('node:fs');
const {
    evaluateOpenFinanceWriteActivation
} = require('./openFinanceWriteActivationPolicy');
const { OpenFinanceAlertOutbox, normalizePolicies } = require('./openFinanceAlertOutbox');
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

function normalizeNewCategoryName(value) {
    const category = String(value || '').trim().replace(/\s+/g, ' ');
    const normalized = normalizeReply(category);
    if (!category || category.length > 60 ||
        /^\d+$/.test(category) ||
        /^[=+\-@]/.test(category) ||
        /[\u0000-\u001f\u007f]/.test(category) ||
        ['outro', 'outros', 'sem categoria'].includes(normalized)) {
        return null;
    }
    const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) return null;
    return {
        id: `new-category:${slug}`.slice(0, 128),
        label: category,
        category,
        subcategory: '',
        origin: 'user_created'
    };
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
    const writeMode = String(env.OPEN_FINANCE_WRITE_MODE || 'off')
        .trim()
        .toLowerCase();
    if (!['off', 'confirm'].includes(writeMode)) {
        throw new Error('open_finance_save_proposal_write_mode_invalid');
    }
    if (writeMode === 'confirm') {
        const activation = evaluateOpenFinanceWriteActivation(env);
        if (!activation.enabled) {
            throw new Error(
                activation.blockers[0] ||
                'open_finance_write_configuration_invalid'
            );
        }
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
    let familyConfirmationEnabled = false;
    if (env.OPEN_FINANCE_VISIBILITY_POLICY_FILE) {
        if (!fs.existsSync(env.OPEN_FINANCE_VISIBILITY_POLICY_FILE)) {
            throw new Error('visibility_policy_unavailable');
        }
        const policies = normalizePolicies(JSON.parse(
            fs.readFileSync(env.OPEN_FINANCE_VISIBILITY_POLICY_FILE, 'utf8')
        ));
        const modes = new Set(policies.map(policy => policy.family));
        if (modes.size > 1) throw new Error('mixed_open_finance_visibility_mode');
        familyConfirmationEnabled = modes.has(true);
    }
    return {
        enabled: true,
        writeMode,
        ...(familyConfirmationEnabled ? { familyConfirmationEnabled: true } : {})
    };
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
    if (draft.paymentMethod?.value === 'Crédito' && draft.financialAccount) {
        missing.push('remover conta financeira incompatível');
    }
    if (['Débito', 'PIX'].includes(draft.paymentMethod?.value) &&
        !draft.financialAccount) {
        missing.push('conta financeira');
    }
    if (['Débito', 'PIX'].includes(draft.paymentMethod?.value) && draft.card) {
        missing.push('remover cartão incompatível');
    }
    if (draft.paymentMethod?.value === 'Dinheiro' &&
        (draft.financialAccount || draft.card)) {
        missing.push('remover conta ou cartão incompatível');
    }
    return missing;
}

function paymentEditBlockMessage(draft = {}, step = '') {
    const payment = draft.paymentMethod?.value;
    if (!['select_account', 'select_card'].includes(step)) return '';
    if (!payment) {
        return 'Escolha primeiro a forma de pagamento antes de definir conta ou cartão.';
    }
    if (step === 'select_account' && !['Débito', 'PIX'].includes(payment)) {
        return `A forma de pagamento ${payment} não usa conta financeira.`;
    }
    if (step === 'select_card' && payment !== 'Crédito') {
        return `A forma de pagamento ${payment} não usa cartão.`;
    }
    return '';
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

const CATEGORY_PAGE_SIZE = 8;

function reviewOptionsForStep(payload = {}) {
    const catalog = payload.catalog || {};
    if (payload.step === 'select_person') return catalog.people || [];
    if (payload.step === 'select_category') {
        const categories = catalog.categories || [];
        const pageCount = Math.max(1, Math.ceil(categories.length / CATEGORY_PAGE_SIZE));
        const requestedPage = Number.isInteger(payload.categoryPage)
            ? payload.categoryPage
            : 0;
        const page = Math.max(0, Math.min(requestedPage, pageCount - 1));
        const start = page * CATEGORY_PAGE_SIZE;
        const options = categories.slice(start, start + CATEGORY_PAGE_SIZE);
        if (page > 0) {
            options.push({
                id: '__previous_category_page__',
                label: 'Ver categorias anteriores',
                categoryPage: page - 1
            });
        }
        if (page < pageCount - 1) {
            options.push({
                id: '__next_category_page__',
                label: 'Ver mais categorias',
                categoryPage: page + 1
            });
        } else {
            options.push({
                id: '__create_new_category__',
                label: 'Criar nova categoria',
                createNew: true
            });
        }
        return options;
    }
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
        authorizedWhatsAppIds: [actorWhatsappId],
        familyConfirmationEnabled: Boolean(configuration.familyConfirmationEnabled)
    });
    const outbox = new Outbox({
        databasePath: env.OPEN_FINANCE_OUTBOX_DB,
        secret
    });
    try {
        if (expectedProposalRef && configuration.familyConfirmationEnabled) {
            const deliveryState = outbox.getProposalDeliveryState(expectedProposalRef);
            if (deliveryState !== 'delivered_confirmed') {
                return {
                    handled: true,
                    keep_pending: false,
                    reply: 'Essa proposta não está mais disponível. Nenhum lançamento foi salvo.',
                    financial_writes: 0
                };
            }
            try {
                preview.prepareSaveProposalConfirmation(
                    expectedProposalRef,
                    { actorWhatsappId }
                );
            } catch (error) {
                if (/confirmation_actor_unauthorized|confirmation_state_conflict/.test(
                    String(error?.message || '')
                )) {
                    return {
                        handled: true,
                        keep_pending: false,
                        reply: 'Esta proposta já está sendo conferida pelo outro membro do casal. Nada foi salvo por esta resposta.',
                        financial_writes: 0
                    };
                }
                throw error;
            }
        }
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
        if (payload.step === 'enter_new_category') {
            const newCategory = normalizeNewCategoryName(messageBody);
            const existing = newCategory
                ? (payload.catalog?.categories || []).some(option =>
                    normalizeReply(option.category) ===
                    normalizeReply(newCategory.category))
                : false;
            if (!newCategory || existing) {
                const reason = existing
                    ? 'Essa categoria já existe. Envie *voltar* e escolha uma opção numerada.'
                    : 'Envie um nome válido de categoria, sem número isolado ou fórmula.';
                return {
                    handled: true,
                    keep_pending: true,
                    state: 'review_editing',
                    proposal_ref: proposalRef,
                    reply: `${reason}\nNada foi salvo.`,
                    financial_writes: 0
                };
            }
            const updated = reviewStore.updateReview(proposalRef, {
                actorWhatsappId,
                mutate: current => {
                    current.draft.category = newCategory;
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
        }
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
            const blockedEdit = paymentEditBlockMessage(payload.draft, step);
            if (blockedEdit) {
                return {
                    handled: true,
                    keep_pending: true,
                    state: 'review_editing',
                    proposal_ref: proposalRef,
                    reply: `${blockedEdit}\n\n${formatReviewSummary(payload)}`,
                    financial_writes: 0
                };
            }
            const updated = reviewStore.updateReview(proposalRef, {
                actorWhatsappId,
                mutate: current => ({
                    ...current,
                    step,
                    categoryPage: step === 'select_category'
                        ? 0
                        : current.categoryPage
                })
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

        const blockedEdit = paymentEditBlockMessage(payload.draft, payload.step);
        if (blockedEdit) {
            const restored = reviewStore.updateReview(proposalRef, {
                actorWhatsappId,
                mutate: current => ({ ...current, step: 'menu' })
            });
            return {
                handled: true,
                keep_pending: true,
                state: 'review_editing',
                proposal_ref: proposalRef,
                reply: `${blockedEdit}\n\n${formatReviewSummary(restored.payload)}`,
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
        if (payload.step === 'select_category' && selected.createNew) {
            const updated = reviewStore.updateReview(proposalRef, {
                actorWhatsappId,
                mutate: current => ({ ...current, step: 'enter_new_category' })
            });
            return {
                handled: true,
                keep_pending: true,
                state: 'review_editing',
                proposal_ref: proposalRef,
                reply: [
                    'Qual é o nome da nova categoria?',
                    'Ela só será usada se você concluir e confirmar o salvamento.',
                    'Envie *voltar* para escolher uma categoria existente. Nada foi salvo.'
                ].join('\n'),
                financial_writes: 0
            };
        }
        if (payload.step === 'select_category' &&
            Number.isInteger(selected.categoryPage)) {
            const updated = reviewStore.updateReview(proposalRef, {
                actorWhatsappId,
                mutate: current => ({
                    ...current,
                    categoryPage: selected.categoryPage
                })
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
                    } else if (['Débito', 'PIX'].includes(selected.value)) {
                        current.draft.card = null;
                    } else {
                        current.draft.financialAccount = null;
                        current.draft.card = null;
                    }
                } else if (current.step === 'select_account') {
                    current.draft.financialAccount = {
                        id: selected.id,
                        label: selected.label,
                        ownerUserId: selected.ownerUserId || ''
                    };
                } else if (current.step === 'select_card') {
                    current.draft.card = {
                        id: selected.id,
                        label: selected.label,
                        cardId: selected.cardId,
                        closingDay: selected.closingDay
                    };
                }
                current.step = 'menu';
                current.categoryPage = 0;
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
