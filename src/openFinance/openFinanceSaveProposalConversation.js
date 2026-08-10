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

function classifySaveProposalBatchReply(value, proposalCount) {
    const count = Number(proposalCount);
    if (!Number.isInteger(count) || count < 1 || count > 4) {
        throw new Error('valid_open_finance_save_batch_size_required');
    }
    const normalized = normalizeReply(value);
    if (['sim', 's', 'ss', 'confirmo', 'continuar'].includes(normalized)) {
        return count === 1
            ? { action: 'select', indexes: [1] }
            : { action: 'invalid', indexes: [] };
    }
    if (/^salvar\s+todas?$/.test(normalized)) {
        return {
            action: 'select',
            indexes: Array.from({ length: count }, (_, index) => index + 1)
        };
    }
    const selection = normalized.match(/^salvar\s+(.+)$/);
    if (selection) {
        const tokens = selection[1]
            .replace(/\s+e\s+|,/g, ' ')
            .split(/\s+/)
            .filter(Boolean);
        if (!tokens.length || tokens.some(token => !/^\d+$/.test(token))) {
            return { action: 'invalid', indexes: [] };
        }
        const indexes = [...new Set(tokens.map(token => Number.parseInt(token, 10)))]
            .sort((left, right) => left - right);
        if (!indexes.length || indexes.some(index => index < 1 || index > count)) {
            return { action: 'invalid', indexes: [] };
        }
        return { action: 'select', indexes };
    }
    if (['cancelar', 'cancela'].includes(normalized)) {
        return {
            action: 'cancel',
            indexes: Array.from({ length: count }, (_, index) => index + 1)
        };
    }
    return { action: 'invalid', indexes: [] };
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

function isReceiptLike(classification, linkedTargetKind = '') {
    return ['income', 'investment_income'].includes(classification) ||
        (classification === 'refund' && linkedTargetKind === 'bank');
}

function isTransferLike(classification) {
    return ['transfer', 'reserve_transfer'].includes(classification);
}

function reviewMissingFields(draft = {}, classification = 'purchase', linkedTargetKind = '') {
    if (isTransferLike(classification)) {
        const missing = [];
        const ownerField = classification === 'reserve_transfer'
            ? 'ownerUserId'
            : null;
        const originOwner = ownerField ? draft[ownerField] : draft.originOwnerUserId;
        const destinationOwner = ownerField ? draft[ownerField] : draft.destinationOwnerUserId;
        if (!draft.originAccount) missing.push('conta de origem');
        if (!draft.destinationAccount) missing.push('conta de destino');
        if (draft.originAccount?.ownerUserId !== originOwner) {
            missing.push('conta de origem autorizada');
        }
        if (draft.destinationAccount?.ownerUserId !== destinationOwner) {
            missing.push('conta de destino autorizada');
        }
        if (draft.originAccount?.id &&
            draft.originAccount.id === draft.destinationAccount?.id) {
            missing.push('contas distintas');
        }
        return [...new Set(missing)];
    }
    const receiptLike = isReceiptLike(classification, linkedTargetKind);
    const missing = [];
    if (!draft.person) missing.push('pessoa');
    if (!draft.category) missing.push('categoria');
    if (!draft.paymentMethod) {
        missing.push(receiptLike ? 'forma de recebimento' : 'forma de pagamento');
    }
    if (receiptLike) {
        if (!draft.financialAccount) missing.push('conta financeira');
        if (draft.card) missing.push('remover cartão incompatível');
        return missing;
    }
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

function paymentEditBlockMessage(draft = {}, step = '', classification = 'purchase',
    linkedTargetKind = '') {
    const payment = draft.paymentMethod?.value;
    if (!['select_account', 'select_card'].includes(step)) return '';
    if (isReceiptLike(classification, linkedTargetKind)) {
        return step === 'select_card'
            ? 'Entradas não usam cartão. Escolha a conta financeira de destino.'
            : '';
    }
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
    if (isTransferLike(payload?.classification)) {
        const reserve = payload.classification === 'reserve_transfer';
        const lines = [
            reserve
                ? `Confira ${payload.reserve_direction === 'application' ? 'a aplicação na reserva' : 'o resgate da reserva'}:`
                : 'Confira a transferência interna:',
            `Descrição: ${source.description || 'não informada'}`,
            `Valor: ${formatMoneyFromCents(Math.abs(source.amount_cents))}`,
            reserve
                ? `Origem: ${draft.originAccount?.label || 'não definida'}`
                : `Origem (${payload.transfer_origin_principal}): ${draft.originAccount?.label || 'não definida'}`,
            reserve
                ? `Destino: ${draft.destinationAccount?.label || 'não definida'}`
                : `Destino (${payload.transfer_destination_principal}): ${draft.destinationAccount?.label || 'não definida'}`
        ];
        const missing = reviewMissingFields(draft, payload.classification);
        if (missing.length) lines.push(`Ainda falta: ${missing.join(', ')}.`);
        if (includeMenu) {
            lines.push(
                '',
                'O que deseja ajustar?',
                '1. Conta de origem',
                '2. Conta de destino',
                '3. Concluir conferência',
                '0. Cancelar',
                '',
                'Responda com o número. Nada foi salvo.'
            );
        } else {
            lines.push('', 'Nada foi salvo.');
        }
        return lines.join('\n');
    }
    const category = draft.category
        ? `${draft.category.category}${draft.category.subcategory
            ? ` / ${draft.category.subcategory}`
            : ''}`
        : 'não definida';
    const isIncome = isReceiptLike(payload?.classification, payload?.linked_target_kind);
    const lines = [
        'Confira a proposta:',
        `Descrição: ${source.description || 'não informada'}`,
        `Valor: ${formatMoneyFromCents(source.amount_cents)}`,
        `Pessoa: ${draft.person?.label || 'não definida'}`,
        `Categoria: ${category}`,
        `${isIncome ? 'Recebimento' : 'Pagamento'}: ${draft.paymentMethod?.label || 'não definido'}`,
        `Conta financeira: ${draft.financialAccount?.label || 'não definida'}`,
        ...(!isIncome ? [`Cartão: ${draft.card?.label || 'não definido'}`] : [])
    ];
    const missing = reviewMissingFields(
        draft, payload?.classification, payload?.linked_target_kind
    );
    if (missing.length) lines.push(`Ainda falta: ${missing.join(', ')}.`);
    if (includeMenu) {
        const menu = isIncome ? [
            '1. Pessoa',
            '2. Categoria',
            '3. Forma de recebimento',
            '4. Conta financeira',
            '5. Concluir conferência'
        ] : [
            '1. Pessoa',
            '2. Categoria',
            '3. Forma de pagamento',
            '4. Conta financeira',
            '5. Cartão',
            '6. Concluir conferência'
        ];
        lines.push(
            '',
            'O que deseja ajustar?',
            ...menu,
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
    if (payload.step === 'select_origin_account') {
        return (catalog.financialAccounts || []).filter(item => {
            if (payload.classification === 'reserve_transfer') {
                const expectedType = payload.reserve_direction === 'application'
                    ? ['bank', 'savings']
                    : ['reserve'];
                return item.ownerUserId === payload.draft?.ownerUserId &&
                    expectedType.includes(item.accountType);
            }
            return item.ownerUserId === payload.draft?.originOwnerUserId;
        });
    }
    if (payload.step === 'select_destination_account') {
        return (catalog.financialAccounts || []).filter(item => {
            if (payload.classification === 'reserve_transfer') {
                const expectedType = payload.reserve_direction === 'application'
                    ? ['reserve']
                    : ['bank', 'savings'];
                return item.ownerUserId === payload.draft?.ownerUserId &&
                    expectedType.includes(item.accountType);
            }
            return item.ownerUserId === payload.draft?.destinationOwnerUserId;
        });
    }
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
        } else if (payload.classification !== 'refund') {
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
    const isIncome = isReceiptLike(payload?.classification, payload?.linked_target_kind);
    const labels = {
        select_origin_account: 'Escolha a conta de origem:',
        select_destination_account: 'Escolha a conta de destino:',
        select_person: 'Escolha a pessoa:',
        select_category: 'Escolha a categoria:',
        select_payment: isIncome
            ? 'Escolha a forma de recebimento:'
            : 'Escolha a forma de pagamento:',
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

function normalizeSaveProposalBatchEntries(proposals) {
    if (!Array.isArray(proposals) || proposals.length < 2 || proposals.length > 4) {
        throw new Error('valid_open_finance_save_selection_required');
    }
    const normalized = proposals.map(item => ({
        number: Number(item?.number),
        proposalRef: String(item?.proposalRef || ''),
        recipientPrincipal: String(item?.recipientPrincipal || '').trim().toLowerCase()
    }));
    if (new Set(normalized.map(item => item.number)).size !== normalized.length ||
        new Set(normalized.map(item => item.proposalRef)).size !== normalized.length ||
        normalized.some(item => !Number.isInteger(item.number) || item.number < 1 ||
            item.number > 4 || !/^[a-f0-9]{32}$/.test(item.proposalRef) ||
            !['daniel', 'thais'].includes(item.recipientPrincipal))) {
        throw new Error('valid_open_finance_save_selection_required');
    }
    return normalized.sort((left, right) => left.number - right.number);
}

function formatSaveProposalSelectionHelp() {
    return [
        'Escolha quais lançamentos deseja conferir:',
        '*salvar 1*, *salvar 1 e 3* ou *salvar todas*.',
        'Um *sim* isolado não escolhe um lote com vários itens.',
        'Nada foi salvo.'
    ].join('\n');
}

function resumeOrStartOpenFinanceSaveReview({
    proposalRef,
    recipientPrincipal,
    actorWhatsappId,
    reviewCatalog,
    env,
    dependencies
}) {
    const secret = fs.readFileSync(
        env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE,
        'utf8'
    ).trim();
    const reviewStore = openReviewStore({
        env,
        secret,
        actorWhatsappId,
        dependencies
    });
    let active;
    try {
        active = reviewStore.listActiveReviews({ actorWhatsappId, limit: 2 });
    } finally {
        reviewStore.close();
    }
    if (active.length) {
        if (active.length !== 1 || active[0].proposal_ref !== proposalRef) {
            throw new Error('open_finance_save_batch_active_review_conflict');
        }
        const resumed = handleOpenFinanceSaveProposalReviewReply({
            messageBody: 'voltar',
            actorWhatsappId,
            expectedProposalRef: proposalRef,
            env,
            dependencies
        });
        if (!resumed.handled || resumed.state !== 'review_editing') {
            throw new Error('open_finance_save_batch_review_not_resumed');
        }
        return resumed;
    }
    return handleOpenFinanceSaveProposalReply({
        messageBody: 'sim',
        actorWhatsappId,
        expectedProposalRef: proposalRef,
        expectedRecipientPrincipal: recipientPrincipal,
        reviewCatalog,
        env,
        dependencies
    });
}

function handleOpenFinanceSaveProposalBatchReply({
    messageBody,
    actorWhatsappId,
    proposals,
    reviewCatalog = null,
    env = process.env,
    dependencies = {}
} = {}) {
    const configuration = assertPromptConfiguration(env);
    if (!configuration.enabled) return { handled: false, financial_writes: 0 };
    const entries = normalizeSaveProposalBatchEntries(proposals);
    const selection = classifySaveProposalBatchReply(
        messageBody,
        Math.max(...entries.map(item => item.number))
    );
    const byNumber = new Map(entries.map(item => [item.number, item]));
    if (selection.action === 'invalid' ||
        selection.indexes.some(index => !byNumber.has(index))) {
        return {
            handled: true,
            keep_pending: true,
            state: 'selection_pending',
            reply: formatSaveProposalSelectionHelp(),
            financial_writes: 0
        };
    }
    if (selection.action === 'cancel') {
        return {
            handled: true,
            keep_pending: false,
            state: 'cancelled',
            reply: 'Lista encerrada. Nenhuma proposta foi aceita e nenhum lançamento foi salvo.',
            financial_writes: 0
        };
    }
    const secret = fs.readFileSync(
        env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE,
        'utf8'
    ).trim();
    const Journal = dependencies.OpenFinanceRevocationJournal ||
        OpenFinanceRevocationJournal;
    const Preview = dependencies.OpenFinanceShadowPreviewStore ||
        OpenFinanceShadowPreviewStore;
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
    let selectedEntries = [];
    try {
        if (!reviewCatalog) {
            throw new Error('open_finance_save_review_catalog_required');
        }
        selectedEntries = selection.indexes.map(index => byNumber.get(index));
        const replyEligible = selectedEntries.every(entry =>
            outbox.isProposalReplyEligible(entry.proposalRef, {
                recipient: entry.recipientPrincipal
            }));
        if (!replyEligible) {
            return {
                handled: true,
                keep_pending: false,
                state: 'selection_stale',
                reply: 'Uma das propostas selecionadas não está mais disponível. Nenhum item do lote foi reservado ou salvo.',
                financial_writes: 0
            };
        }
        try {
            preview.prepareSaveProposalConfirmations(
                selectedEntries.map(entry => entry.proposalRef),
                { actorWhatsappId }
            );
        } catch (error) {
            if (/confirmation_actor_unauthorized|confirmation_state_conflict/.test(
                String(error?.message || '')
            )) {
                return {
                    handled: true,
                    keep_pending: false,
                    state: 'selection_claimed_elsewhere',
                    reply: 'Uma das propostas já está sendo conferida pelo outro membro do casal. Nenhum item adicional foi reservado por esta resposta.',
                    financial_writes: 0
                };
            }
            throw error;
        }
    } finally {
        outbox.close();
        preview.close();
        journal.close();
    }
    const [first, ...queued] = selectedEntries;
    const started = resumeOrStartOpenFinanceSaveReview({
        proposalRef: first.proposalRef,
        recipientPrincipal: first.recipientPrincipal,
        actorWhatsappId,
        reviewCatalog,
        env,
        dependencies
    });
    if (!started.handled || started.state !== 'review_editing') {
        throw new Error('open_finance_save_batch_first_review_not_started');
    }
    return {
        ...started,
        batch: {
            version: 1,
            selectedProposalRefs: selectedEntries.map(entry => entry.proposalRef),
            queuedProposalRefs: queued.map(entry => entry.proposalRef),
            recipientPrincipalByProposal: Object.fromEntries(
                selectedEntries.map(entry => [entry.proposalRef, entry.recipientPrincipal])
            )
        }
    };
}

function advanceOpenFinanceSaveProposalBatch({
    batch,
    actorWhatsappId,
    reviewCatalog,
    env = process.env,
    dependencies = {}
} = {}) {
    const queued = Array.isArray(batch?.queuedProposalRefs)
        ? batch.queuedProposalRefs.map(value => String(value || ''))
        : [];
    if (batch?.version !== 1 || queued.some(value =>
        !/^[a-f0-9]{32}$/.test(value)) ||
        !batch?.recipientPrincipalByProposal ||
        typeof batch.recipientPrincipalByProposal !== 'object') {
        throw new Error('invalid_open_finance_save_batch_state');
    }
    if (!queued.length) {
        return {
            handled: true,
            keep_pending: false,
            state: 'batch_complete',
            reply: 'Conferência do lote concluída. Nenhum outro item foi selecionado.',
            financial_writes: 0
        };
    }
    const [nextProposalRef, ...remaining] = queued;
    const recipientPrincipal = String(
        batch.recipientPrincipalByProposal[nextProposalRef] || ''
    ).toLowerCase();
    if (!['daniel', 'thais'].includes(recipientPrincipal)) {
        throw new Error('invalid_open_finance_save_batch_state');
    }
    const started = resumeOrStartOpenFinanceSaveReview({
        proposalRef: nextProposalRef,
        recipientPrincipal,
        actorWhatsappId,
        reviewCatalog,
        env,
        dependencies
    });
    if (!started.handled || started.state !== 'review_editing') {
        throw new Error('open_finance_save_batch_next_review_not_started');
    }
    return {
        ...started,
        batch: {
            ...batch,
            queuedProposalRefs: remaining
        }
    };
}

function handleOpenFinanceSaveProposalReply({
    messageBody,
    actorWhatsappId,
    expectedProposalRef = null,
    expectedRecipientPrincipal = null,
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
        let directReviewedSemantic = false;
        if (expectedProposalRef) {
            const directProposal = preview.readSaveProposalPrivate(
                expectedProposalRef,
                { actorWhatsappId }
            );
            directReviewedSemantic = Boolean(
                ['income', 'investment_income', 'refund', 'transfer', 'reserve_transfer']
                    .includes(directProposal?.classification) &&
                /^[a-f0-9]{32}$/.test(String(directProposal.semantic_review_ref || ''))
            );
        }
        if (expectedProposalRef && configuration.familyConfirmationEnabled) {
            const replyEligible = outbox.isProposalReplyEligible(expectedProposalRef, {
                recipient: expectedRecipientPrincipal
            });
            if (!replyEligible && !directReviewedSemantic) {
                return {
                    handled: true,
                    keep_pending: false,
                    reply: 'Essa proposta não está mais disponível. Nenhum lançamento foi salvo.',
                    financial_writes: 0
                };
            }
            try {
                if (directReviewedSemantic) {
                    const state = preview.listReadySaveProposalConfirmations({
                        actorWhatsappId,
                        limit: 2
                    });
                    if (!state.some(item => item.proposal_ref === expectedProposalRef)) {
                        throw new Error('save_proposal_confirmation_state_conflict');
                    }
                } else {
                preview.prepareSaveProposalConfirmation(
                    expectedProposalRef,
                    { actorWhatsappId }
                );
                }
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
        const candidates = ready.filter(item => {
            if (expectedProposalRef) {
                return item.proposal_ref === expectedProposalRef &&
                    (directReviewedSemantic ||
                        outbox.isProposalReplyEligible(item.proposal_ref, {
                            recipient: expectedRecipientPrincipal
                        }));
            }
            if (outbox.getProposalDeliveryState(item.proposal_ref) === 'delivered_confirmed') {
                return true;
            }
            const proposal = preview.readSaveProposalPrivate(
                item.proposal_ref,
                { actorWhatsappId }
            );
            return ['income', 'investment_income', 'refund', 'transfer', 'reserve_transfer']
                .includes(proposal?.classification) &&
                /^[a-f0-9]{32}$/.test(String(proposal.semantic_review_ref || ''));
        });
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
        if (candidates.length !== 1) {
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
            const isTransfer = isTransferLike(payload.classification);
            const isIncome = isReceiptLike(
                payload.classification, payload.linked_target_kind
            );
            const fieldByChoice = isTransfer ? {
                '1': 'select_origin_account',
                '2': 'select_destination_account'
            } : isIncome ? {
                '1': 'select_person',
                '2': 'select_category',
                '3': 'select_payment',
                '4': 'select_account'
            } : {
                '1': 'select_person',
                '2': 'select_category',
                '3': 'select_payment',
                '4': 'select_account',
                '5': 'select_card'
            };
            const completionChoice = isTransfer ? '3' : isIncome ? '5' : '6';
            if (normalized === completionChoice) {
                const missing = reviewMissingFields(
                    payload.draft, payload.classification, payload.linked_target_kind
                );
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
                    reply: `Escolha uma opção de 0 a ${completionChoice}.\n\n${formatReviewSummary(payload)}`,
                    financial_writes: 0
                };
            }
            const blockedEdit = paymentEditBlockMessage(
                payload.draft,
                step,
                payload.classification,
                payload.linked_target_kind
            );
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

        const blockedEdit = paymentEditBlockMessage(
            payload.draft,
            payload.step,
            payload.classification,
            payload.linked_target_kind
        );
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
                    if (isReceiptLike(
                        current.classification, current.linked_target_kind
                    )) {
                        current.draft.card = null;
                    } else if (selected.value === 'Crédito') {
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
                        accountName: selected.accountName || selected.label,
                        ownerUserId: selected.ownerUserId || '',
                        accountType: selected.accountType || ''
                    };
                } else if (current.step === 'select_origin_account') {
                    current.draft.originAccount = {
                        id: selected.id,
                        label: selected.label,
                        accountName: selected.accountName || selected.label,
                        ownerUserId: selected.ownerUserId || '',
                        accountType: selected.accountType || ''
                    };
                } else if (current.step === 'select_destination_account') {
                    current.draft.destinationAccount = {
                        id: selected.id,
                        label: selected.label,
                        accountName: selected.accountName || selected.label,
                        ownerUserId: selected.ownerUserId || '',
                        accountType: selected.accountType || ''
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
    handleOpenFinanceSaveProposalBatchReply,
    advanceOpenFinanceSaveProposalBatch,
    handleOpenFinanceSaveProposalReviewReply,
    classifySaveProposalReply,
    classifySaveProposalBatchReply,
    assertPromptConfiguration,
    formatOpenFinanceSaveProposalReviewSummary: formatReviewSummary
};
