const crypto = require('node:crypto');
const fs = require('node:fs');
const { getFormattedDateOnly } = require('../utils/helpers');
const {
    readOpenFinanceInternalSource,
    reconcileOpenFinanceRuntimeCandidates
} = require('./openFinanceRuntimeReconciliation');
const { classifyOpenFinanceLifecycle } = require('./openFinanceLifecycleClassifier');

const inFlightByStore = new WeakMap();
const MONTH_NAMES = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro'
];

function stableSerialize(value) {
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key =>
            `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function requireSecret(secret) {
    const value = String(secret || '');
    if (value.length < 32) throw new Error('open_finance_final_secret_required');
    return value;
}

function requireObject(value, reason) {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        throw new Error(reason);
    }
    return value;
}

function sourceFingerprint(transaction = {}, accountType = '') {
    return {
        id: String(transaction.id || '').trim(),
        provider_id: String(transaction.provider_id || '').trim(),
        account_id: String(transaction.account_id || '').trim(),
        amount_cents: Number(transaction.amount_cents),
        description: String(transaction.description || '').trim(),
        date: String(transaction.date || '').trim(),
        status: String(transaction.status || '').trim().toUpperCase(),
        total_installments: transaction.total_installments ?? null,
        installment_number: transaction.installment_number ?? null,
        account_type: String(accountType || '').trim().toUpperCase()
    };
}

function catalogProjection(kind, value = {}) {
    const base = {
        id: String(value.id || '').trim(),
        label: String(value.label || '').trim()
    };
    if (kind === 'categories') {
        return {
            ...base,
            category: String(value.category || '').trim(),
            subcategory: String(value.subcategory || '').trim()
        };
    }
    if (kind === 'paymentMethods') {
        return { ...base, value: String(value.value || '').trim() };
    }
    if (kind === 'financialAccounts') {
        return {
            ...base,
            ownerUserId: String(value.ownerUserId || '').trim()
        };
    }
    if (kind === 'cards') {
        return {
            ...base,
            cardId: String(value.cardId || '').trim(),
            closingDay: Number(value.closingDay)
        };
    }
    return base;
}

function assertCatalogSelection(catalog, kind, selected) {
    if (!selected) return null;
    const expected = catalogProjection(kind, selected);
    const current = (catalog[kind] || [])
        .map(value => catalogProjection(kind, value))
        .find(value => value.id === expected.id);
    if (!current || stableSerialize(current) !== stableSerialize(expected)) {
        throw new Error('open_finance_final_catalog_changed');
    }
    return current;
}

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function assertCategorySelection(catalog, selected) {
    if (selected?.origin !== 'user_created') {
        return assertCatalogSelection(catalog, 'categories', selected);
    }
    const category = String(selected.category || '').trim().replace(/\s+/g, ' ');
    const normalized = normalizeText(category);
    const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!category || category.length > 60 ||
        selected.label !== category ||
        String(selected.subcategory || '') !== '' ||
        String(selected.id || '') !== `new-category:${slug}`.slice(0, 128) ||
        /^\d+$/.test(category) ||
        /^[=+\-@]/.test(category) ||
        /[\u0000-\u001f\u007f]/.test(category) ||
        ['outro', 'outros', 'sem categoria'].includes(normalized)) {
        throw new Error('open_finance_final_new_category_forbidden');
    }
    const alreadyExists = (catalog.categories || []).some(option =>
        normalizeText(option.category) === normalized);
    if (alreadyExists) {
        throw new Error('open_finance_final_catalog_changed');
    }
    return {
        id: selected.id,
        label: category,
        category,
        subcategory: '',
        origin: 'user_created'
    };
}

function revalidateDraftCatalog(draft = {}, catalog = {}) {
    requireObject(draft, 'open_finance_final_draft_required');
    for (const key of [
        'people',
        'categories',
        'paymentMethods',
        'financialAccounts',
        'cards'
    ]) {
        if (!Array.isArray(catalog[key])) {
            throw new Error('open_finance_final_catalog_unavailable');
        }
    }
    const person = assertCatalogSelection(catalog, 'people', draft.person);
    const category = assertCategorySelection(catalog, draft.category);
    const paymentMethod = assertCatalogSelection(
        catalog,
        'paymentMethods',
        draft.paymentMethod
    );
    if (!person || !category || !paymentMethod) {
        throw new Error('open_finance_final_draft_incomplete');
    }
    let financialAccount = null;
    let card = null;
    if (paymentMethod.value === 'Crédito') {
        card = assertCatalogSelection(catalog, 'cards', draft.card);
        if (!card || draft.financialAccount) {
            throw new Error('open_finance_final_draft_incomplete');
        }
    } else if (['Débito', 'PIX'].includes(paymentMethod.value)) {
        financialAccount = assertCatalogSelection(
            catalog,
            'financialAccounts',
            draft.financialAccount
        );
        if (!financialAccount || draft.card) {
            throw new Error('open_finance_final_draft_incomplete');
        }
    } else if (paymentMethod.value === 'Dinheiro') {
        if (draft.financialAccount || draft.card) {
            throw new Error('open_finance_final_draft_incomplete');
        }
    } else {
        throw new Error('open_finance_final_payment_method_forbidden');
    }
    return { person, category, paymentMethod, financialAccount, card };
}

function parseProviderDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error('open_finance_final_source_changed');
    }
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function billingMonth(date, closingDay) {
    let month = date.getMonth();
    let year = date.getFullYear();
    if (Number.isInteger(closingDay) && closingDay >= 1 && closingDay <= 31 &&
        date.getDate() > closingDay) {
        month += 1;
    }
    if (month > 11) {
        month = 0;
        year += 1;
    }
    return `${MONTH_NAMES[month]} de ${year}`;
}

function buildWritePlan({ proposal, draft }) {
    const date = parseProviderDate(proposal.source.date);
    const amount = Math.abs(Number(proposal.source.amount_cents)) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('open_finance_final_source_changed');
    }
    if (draft.paymentMethod.value === 'Crédito') {
        return {
            operation: 'expense.create',
            sheetName: `Cartão ${draft.card.label}`,
            cardId: draft.card.cardId,
            row: [
                getFormattedDateOnly(date),
                proposal.source.description,
                draft.category.category,
                amount,
                '1/1',
                billingMonth(date, draft.card.closingDay),
                draft.person.id
            ],
            userId: draft.person.id,
            financial_writes: 0
        };
    }
    return {
        operation: 'expense.create',
        sheetName: 'Saídas',
        row: [
            getFormattedDateOnly(date),
            proposal.source.description,
            draft.category.category,
            draft.category.subcategory,
            amount,
            draft.person.label,
            draft.paymentMethod.value,
            'Não',
            'Importado de observação Open Finance confirmada.',
            draft.person.id,
            draft.financialAccount?.label || ''
        ],
        userId: draft.person.id,
        financial_writes: 0
    };
}

function revalidateOpenFinanceSaveProposal({
    proposal,
    review,
    item,
    internalSource,
    catalog,
    secret
} = {}) {
    const hmacSecret = requireSecret(secret);
    requireObject(proposal, 'open_finance_final_proposal_required');
    requireObject(review, 'open_finance_final_review_required');
    requireObject(item, 'open_finance_final_source_unavailable');
    requireObject(internalSource, 'open_finance_final_internal_source_unavailable');
    requireObject(catalog, 'open_finance_final_catalog_unavailable');

    if (!/^[a-f0-9]{32}$/.test(String(proposal.proposal_ref || '')) ||
        review.proposal_ref !== proposal.proposal_ref ||
        review.state !== 'ready' ||
        proposal.classification !== 'purchase' ||
        proposal.provider_state !== 'POSTED' ||
        proposal.reconciliation_status !== 'new' ||
        !/^[a-f0-9]{48}$/.test(String(proposal.operation_key || ''))) {
        throw new Error('open_finance_final_proposal_not_ready');
    }
    if (Number(proposal.source?.total_installments) > 1 ||
        Number(proposal.source?.installment_number) > 1) {
        throw new Error('open_finance_final_installments_unsupported');
    }
    if (!internalSource.available) {
        throw new Error('open_finance_final_internal_source_unavailable');
    }
    if (String(item.alias_code || '').trim().toLowerCase() !==
            String(proposal.alias || '').trim().toLowerCase() ||
        Number(item.generation) !== Number(proposal.generation)) {
        throw new Error('open_finance_final_source_changed');
    }
    const currentTransaction = (item.transactions || []).find(transaction =>
        String(transaction.id || '') === String(proposal.source?.id || '') &&
        String(transaction.account_id || '') ===
            String(proposal.source?.account_id || ''));
    const currentAccount = (item.accounts || []).find(account =>
        String(account.id || '') === String(proposal.source?.account_id || ''));
    if (!currentTransaction || !currentAccount ||
        stableSerialize(sourceFingerprint(currentTransaction, currentAccount.type)) !==
            stableSerialize(sourceFingerprint(proposal.source, proposal.account_type))) {
        throw new Error('open_finance_final_source_changed');
    }
    const lifecycle = classifyOpenFinanceLifecycle({
        items: [item],
        observedAt: new Date().toISOString(),
        secret: hmacSecret
    });
    const lifecycleDecision = lifecycle.decisions.find(decision =>
        decision.observation_ref === proposal.observation_ref);
    if (!lifecycleDecision ||
        lifecycleDecision.classification !== 'purchase' ||
        lifecycleDecision.provider_state !== 'POSTED') {
        throw new Error('open_finance_final_source_changed');
    }
    const reconciliation = reconcileOpenFinanceRuntimeCandidates({
        items: [item],
        candidates: [{
            observation_ref: proposal.observation_ref,
            correlation_state: 'new_event'
        }],
        internalTransactions: internalSource.transactions,
        scopeCoverage: internalSource.scope_coverage,
        secret: hmacSecret,
        previewDatabasePath: null
    });
    const decision = reconciliation.decisions.find(value =>
        value.observation_ref === proposal.observation_ref);
    if (!decision || decision.status !== 'new' ||
        reconciliation.eligibleCandidates.length !== 1) {
        throw new Error('open_finance_final_not_new');
    }
    const draft = revalidateDraftCatalog(review.payload?.draft, catalog);
    const operationKey = crypto.createHmac('sha256', hmacSecret)
        .update(`open-finance-final:${proposal.operation_key}:${stableSerialize(draft)}`)
        .digest('hex')
        .slice(0, 48);
    return {
        status: 'ready',
        proposal_ref: proposal.proposal_ref,
        operationKey,
        writePlan: buildWritePlan({ proposal, draft }),
        sourceFingerprint: crypto.createHmac('sha256', hmacSecret)
            .update(stableSerialize(sourceFingerprint(currentTransaction, currentAccount.type)))
            .digest('hex')
            .slice(0, 32),
        revalidation: {
            provider: 'posted_purchase_unchanged',
            internal: 'new',
            catalog: 'authorized'
        },
        financial_writes: 0
    };
}

function getInFlight(store) {
    let pending = inFlightByStore.get(store);
    if (!pending) {
        pending = new Map();
        inFlightByStore.set(store, pending);
    }
    return pending;
}

async function executeOpenFinanceSaveProposalFinalization({
    proposalRef,
    actorWhatsappId,
    store,
    writer,
    reconciler = null
} = {}) {
    if (!store || typeof store.read !== 'function' ||
        typeof store.claim !== 'function' ||
        typeof store.markCommitted !== 'function') {
        throw new Error('open_finance_final_store_required');
    }
    if (typeof writer !== 'function') {
        throw new Error('open_finance_final_writer_required');
    }
    const pending = getInFlight(store);
    if (pending.has(proposalRef)) {
        const result = await pending.get(proposalRef);
        return { ...result, replay: true };
    }
    const execution = (async () => {
        const current = store.read(proposalRef, { actorWhatsappId });
        if (!current) throw new Error('open_finance_final_not_found');
        if (['committed', 'receipt_delivered'].includes(current.state)) {
            return {
                state: 'committed',
                proposal_ref: proposalRef,
                receipt_ref: current.payload.receipt_ref,
                receipt: current.payload.receipt,
                replay: true,
                financial_writes: 0
            };
        }
        const reconcileOnly = ['writing', 'uncertain'].includes(current.state);
        const claimed = store.claim(proposalRef, { actorWhatsappId });
        try {
            const operation = reconcileOnly ? reconciler : writer;
            if (typeof operation !== 'function') {
                const unavailable = new Error(
                    'open_finance_final_reconciler_required'
                );
                unavailable.code = 'OPEN_FINANCE_FINAL_WRITE_UNCERTAIN';
                throw unavailable;
            }
            const writeResult = await operation(
                claimed.payload.validated.writePlan,
                {
                    operationKey: claimed.payload.operation_key,
                    proposalRef,
                    actorWhatsappId,
                    reconcileOnly
                }
            );
            if (writeResult?.status !== 'committed') {
                const error = new Error('open_finance_final_write_result_uncertain');
                error.code = 'OPEN_FINANCE_FINAL_WRITE_UNCERTAIN';
                throw error;
            }
            const committed = store.markCommitted(proposalRef, {
                actorWhatsappId,
                receipt: writeResult
            });
            return {
                state: 'committed',
                proposal_ref: proposalRef,
                receipt_ref: committed.payload.receipt_ref,
                receipt: committed.payload.receipt,
                replay: false,
                financial_writes: reconcileOnly ? 0 : 1
            };
        } catch (error) {
            const latest = store.read(proposalRef, { actorWhatsappId });
            if (latest?.state === 'writing') {
                store.markUncertain(proposalRef, {
                    actorWhatsappId,
                    reasonCode: error?.code || 'write_result_uncertain'
                });
            }
            const safeError = new Error('open_finance_final_write_uncertain');
            safeError.code = 'OPEN_FINANCE_FINAL_WRITE_UNCERTAIN';
            throw safeError;
        }
    })();
    pending.set(proposalRef, execution);
    try {
        return await execution;
    } finally {
        pending.delete(proposalRef);
    }
}

function finalizationConfiguration(env = process.env, { allowInjectedContext = false } = {}) {
    const proposalMode = String(env.OPEN_FINANCE_SAVE_PROPOSAL_MODE || 'off')
        .trim()
        .toLowerCase();
    const writeMode = String(env.OPEN_FINANCE_WRITE_MODE || 'off')
        .trim()
        .toLowerCase();
    if (proposalMode !== 'prompt' || writeMode !== 'confirm') {
        return { enabled: false, proposalMode, writeMode };
    }
    if (!allowInjectedContext) {
        for (const file of [
            env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE,
            env.OPEN_FINANCE_LIVE_STAGING_DB,
            env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
            env.OPEN_FINANCE_REVOCATION_JOURNAL_DB,
            env.PLUGGY_ITEM_MAP_FILE
        ]) {
            if (!file || !fs.existsSync(file)) {
                throw new Error('open_finance_final_state_unavailable');
            }
        }
    }
    return { enabled: true, proposalMode, writeMode };
}

function readJson(file, reason) {
    try {
        const value = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Array.isArray(value)) throw new Error(reason);
        return value;
    } catch {
        throw new Error(reason);
    }
}

function openFinalizationStore({
    env,
    secret,
    actorWhatsappId,
    dependencies
}) {
    if (dependencies.finalizationStore) {
        return { store: dependencies.finalizationStore, owned: false };
    }
    const Store = dependencies.OpenFinanceSaveProposalFinalizationStore ||
        require('./openFinanceSaveProposalFinalizationStore')
            .OpenFinanceSaveProposalFinalizationStore;
    return {
        store: new Store({
            databasePath: env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
            secret,
            authorizedWhatsAppIds: [actorWhatsappId]
        }),
        owned: true
    };
}

function findReadyReview({
    actorWhatsappId,
    env,
    secret,
    dependencies
}) {
    if (typeof dependencies.findReadyProposalRef === 'function') {
        return dependencies.findReadyProposalRef({ actorWhatsappId });
    }
    const Review = dependencies.OpenFinanceSaveProposalReviewStore ||
        require('./openFinanceSaveProposalReviewStore')
            .OpenFinanceSaveProposalReviewStore;
    const store = new Review({
        databasePath: env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
        secret,
        authorizedWhatsAppIds: [actorWhatsappId]
    });
    try {
        const ready = store.listReadyReviews({ actorWhatsappId, limit: 2 });
        if (ready.length > 1) {
            throw new Error('ambiguous_open_finance_finalization_reply');
        }
        return ready[0]?.proposal_ref || null;
    } finally {
        store.close();
    }
}

async function loadDefaultFinalizationContext({
    proposalRef,
    actorWhatsappId,
    userId,
    env,
    secret,
    dependencies
}) {
    const { OpenFinanceRevocationJournal } =
        require('./openFinanceRevocationJournal');
    const { OpenFinanceShadowPreviewStore } =
        require('./openFinanceShadowPreviewStore');
    const { OpenFinanceSaveProposalReviewStore } =
        require('./openFinanceSaveProposalReviewStore');
    const { OpenFinanceLiveStagingVault } =
        require('./openFinanceLiveStagingVault');
    const { buildOpenFinanceSaveProposalReviewCatalog } =
        require('./openFinanceSaveProposalReviewCatalog');
    const { getActiveUsers } = require('../services/userService');
    const { getFinancialScopeUserIds } =
        require('../services/oauthTokenStore');

    const Journal = dependencies.OpenFinanceRevocationJournal ||
        OpenFinanceRevocationJournal;
    const Preview = dependencies.OpenFinanceShadowPreviewStore ||
        OpenFinanceShadowPreviewStore;
    const Review = dependencies.OpenFinanceSaveProposalReviewStore ||
        OpenFinanceSaveProposalReviewStore;
    const Vault = dependencies.OpenFinanceLiveStagingVault ||
        OpenFinanceLiveStagingVault;
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
    const reviewStore = new Review({
        databasePath: env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
        secret,
        authorizedWhatsAppIds: [actorWhatsappId]
    });
    const vault = new Vault({
        databasePath: env.OPEN_FINANCE_LIVE_STAGING_DB,
        secret
    });
    try {
        const decision = preview.readSaveProposalDecisionState(
            proposalRef,
            { actorWhatsappId }
        );
        if (decision?.proposal_state !== 'pending' ||
            decision?.confirmation_state !== 'accepted') {
            throw new Error('open_finance_final_proposal_not_ready');
        }
        const proposal = preview.readReviewableSaveProposal(
            proposalRef,
            { actorWhatsappId }
        );
        const review = reviewStore.readReviewPrivate(
            proposalRef,
            { actorWhatsappId }
        );
        const mappings = readJson(
            env.PLUGGY_ITEM_MAP_FILE,
            'open_finance_final_mapping_unavailable'
        );
        const mappingMatches = mappings.filter(mapping =>
            String(mapping?.alias || '').trim().toLowerCase() ===
                String(proposal.alias || '').trim().toLowerCase());
        if (mappingMatches.length !== 1) {
            throw new Error('open_finance_final_mapping_unavailable');
        }
        const item = vault.readItemByAlias(proposal.alias);
        if (!item) throw new Error('open_finance_final_source_unavailable');
        item.generation = Number(mappingMatches[0].generation) || 1;
        const users = await (dependencies.getActiveUsers || getActiveUsers)();
        const resolveScope = dependencies.getFinancialScopeUserIds ||
            getFinancialScopeUserIds;
        const userIds = await Promise.resolve(resolveScope(userId));
        const internalReader = dependencies.readOpenFinanceInternalSource ||
            readOpenFinanceInternalSource;
        const internalSource = await internalReader({
            users,
            userIds,
            aliases: [proposal.alias],
            dependencies: dependencies.internalSourceDependencies || {}
        });
        const catalogBuilder =
            dependencies.buildOpenFinanceSaveProposalReviewCatalog ||
            buildOpenFinanceSaveProposalReviewCatalog;
        const catalog = await catalogBuilder({
            userId,
            dependencies: dependencies.catalogDependencies || {}
        });
        return { proposal, review, item, internalSource, catalog };
    } finally {
        vault.close();
        reviewStore.close();
        preview.close();
        journal.close();
    }
}

function buildFinalConfirmationReply(validated) {
    const plan = validated.writePlan;
    const amount = plan.sheetName === 'Saídas' ? plan.row[4] : plan.row[3];
    return [
        'Revalidação final concluída na fonte Open Finance e na planilha familiar.',
        `Data: *${plan.row[0]}*`,
        `Descrição: *${plan.row[1]}*`,
        `Valor: *${Number(amount).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        })}*`,
        `Destino: *${plan.sheetName}*`,
        '',
        'Confirma o salvamento? Responda *sim* ou *não*.',
        'Nada foi salvo nesta etapa.'
    ].join('\n');
}

async function prepareOpenFinanceSaveProposalFinalization({
    proposalRef,
    actorWhatsappId,
    userId,
    env = process.env,
    dependencies = {}
} = {}) {
    const configuration = finalizationConfiguration(env, {
        allowInjectedContext: typeof dependencies.loadContext === 'function'
    });
    if (!configuration.enabled) {
        return { handled: false, financial_writes: 0 };
    }
    const secret = dependencies.secret ||
        fs.readFileSync(env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE, 'utf8').trim();
    const context = dependencies.loadContext
        ? await dependencies.loadContext({
            proposalRef,
            actorWhatsappId,
            userId,
            env,
            secret
        })
        : await loadDefaultFinalizationContext({
            proposalRef,
            actorWhatsappId,
            userId,
            env,
            secret,
            dependencies
        });
    const validated = revalidateOpenFinanceSaveProposal({
        ...context,
        secret
    });
    const { store, owned } = openFinalizationStore({
        env,
        secret,
        actorWhatsappId,
        dependencies
    });
    try {
        const prepared = store.prepare({
            proposalRef,
            actorWhatsappId,
            operationKey: validated.operationKey,
            payload: validated,
            expiresAt: context.review.payload.expires_at
        });
        return {
            handled: true,
            keep_pending: true,
            state: prepared.state,
            proposal_ref: proposalRef,
            reply: buildFinalConfirmationReply(validated),
            financial_writes: 0
        };
    } finally {
        if (owned) store.close();
    }
}

async function writeOpenFinanceSaveProposal(writePlan, {
    operationKey,
    proposalRef,
    reconcileOnly = false,
    dependencies = {}
} = {}) {
    const append = dependencies.appendRowToSheet ||
        require('../services/google').appendRowToSheet;
    return append(writePlan.sheetName, writePlan.row, {
        operationKey,
        userId: writePlan.userId,
        cardId: writePlan.cardId,
        messageId: `open-finance-final:${proposalRef}`,
        source: 'open_finance.save_proposal.final',
        reconcileOnly: Boolean(reconcileOnly)
    });
}

function normalizeReply(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function committedReply(current) {
    return [
        '✅ Lançamento salvo com confirmação final.',
        `Recibo: *${current.payload.receipt_ref}*`,
        'O replay desta confirmação não cria outro lançamento.'
    ].join('\n');
}

async function handleOpenFinanceSaveProposalFinalizationReply({
    messageBody,
    actorWhatsappId,
    userId,
    expectedProposalRef = null,
    env = process.env,
    dependencies = {}
} = {}) {
    const configuration = finalizationConfiguration(env, {
        allowInjectedContext: typeof dependencies.loadContext === 'function'
    });
    if (!configuration.enabled) {
        return { handled: false, financial_writes: 0 };
    }
    const secret = dependencies.secret ||
        fs.readFileSync(env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE, 'utf8').trim();
    const { store, owned } = openFinalizationStore({
        env,
        secret,
        actorWhatsappId,
        dependencies
    });
    try {
        let current = expectedProposalRef
            ? store.read(expectedProposalRef, { actorWhatsappId })
            : null;
        if (!current) {
            const active = store.listActive({ actorWhatsappId, limit: 2 });
            if (active.length === 0) {
                const readyProposalRef = expectedProposalRef || findReadyReview({
                    actorWhatsappId,
                    env,
                    secret,
                    dependencies
                });
                if (readyProposalRef) {
                    return prepareOpenFinanceSaveProposalFinalization({
                        proposalRef: readyProposalRef,
                        actorWhatsappId,
                        userId,
                        env,
                        dependencies
                    });
                }
                return {
                    handled: Boolean(expectedProposalRef),
                    keep_pending: false,
                    reply: expectedProposalRef
                        ? 'Essa confirmação final não está mais disponível.'
                        : null,
                    financial_writes: 0
                };
            }
            if (active.length !== 1) {
                throw new Error('ambiguous_open_finance_finalization_reply');
            }
            current = store.read(active[0].proposal_ref, { actorWhatsappId });
        }
        if (current.state === 'committed') {
            return {
                handled: true,
                keep_pending: true,
                state: 'committed',
                proposal_ref: current.proposal_ref,
                reply: committedReply(current),
                acknowledge_receipt: true,
                financial_writes: 0
            };
        }
        if (current.state === 'receipt_delivered') {
            return {
                handled: true,
                keep_pending: false,
                state: 'receipt_delivered',
                proposal_ref: current.proposal_ref,
                reply: committedReply(current),
                financial_writes: 0
            };
        }
        if (['failed', 'cancelled', 'invalidated', 'expired'].includes(current.state)) {
            return {
                handled: true,
                keep_pending: false,
                state: current.state,
                proposal_ref: current.proposal_ref,
                reply: 'Essa confirmação final não está mais disponível. Nenhum novo lançamento foi criado.',
                financial_writes: 0
            };
        }
        const reply = normalizeReply(messageBody);
        if (['nao', 'n', 'cancelar', 'cancela'].includes(reply)) {
            const cancelled = store.cancel(current.proposal_ref, {
                actorWhatsappId
            });
            return {
                handled: true,
                keep_pending: false,
                state: cancelled.state,
                proposal_ref: current.proposal_ref,
                reply: 'Salvamento cancelado. Nenhum lançamento foi criado.',
                financial_writes: 0
            };
        }
        if (!['sim', 's', 'confirmo'].includes(reply)) {
            return {
                handled: true,
                keep_pending: true,
                state: current.state,
                proposal_ref: current.proposal_ref,
                reply: 'Responda *sim* para salvar ou *não* para cancelar.',
                financial_writes: 0
            };
        }
        if (current.state === 'awaiting_confirmation') {
            try {
                await prepareOpenFinanceSaveProposalFinalization({
                    proposalRef: current.proposal_ref,
                    actorWhatsappId,
                    userId,
                    env,
                    dependencies
                });
            } catch (error) {
                const latest = store.read(current.proposal_ref, {
                    actorWhatsappId
                });
                if (latest?.state === 'awaiting_confirmation') {
                    store.invalidate(current.proposal_ref, {
                        actorWhatsappId,
                        reasonCode: error?.message || 'revalidation_failed'
                    });
                }
                return {
                    handled: true,
                    keep_pending: false,
                    state: 'invalidated',
                    proposal_ref: current.proposal_ref,
                    reply: [
                        'A proposta mudou, expirou ou deixou de estar autorizada.',
                        'Nada foi salvo. Aguarde uma nova proposta atualizada.'
                    ].join('\n'),
                    financial_writes: 0
                };
            }
        }
        const writer = dependencies.writer || ((plan, options) =>
            writeOpenFinanceSaveProposal(plan, {
                ...options,
                dependencies
            }));
        const reconciler = dependencies.reconciler || (
            dependencies.writer
                ? null
                : ((plan, options) => writeOpenFinanceSaveProposal(plan, {
                    ...options,
                    reconcileOnly: true,
                    dependencies
                }))
        );
        try {
            const result = await executeOpenFinanceSaveProposalFinalization({
                proposalRef: current.proposal_ref,
                actorWhatsappId,
                store,
                writer,
                reconciler
            });
            const committed = store.read(current.proposal_ref, {
                actorWhatsappId
            });
            return {
                handled: true,
                keep_pending: true,
                state: result.state,
                proposal_ref: current.proposal_ref,
                reply: committedReply(committed),
                acknowledge_receipt: true,
                financial_writes: result.financial_writes
            };
        } catch (error) {
            if (error?.code !== 'OPEN_FINANCE_FINAL_WRITE_UNCERTAIN') throw error;
            return {
                handled: true,
                keep_pending: true,
                state: 'uncertain',
                proposal_ref: current.proposal_ref,
                reply: [
                    'Não consegui confirmar o resultado da gravação.',
                    'Não repeti a operação para evitar duplicidade.',
                    'Envie *sim* novamente para reconciliar usando o mesmo recibo.'
                ].join('\n'),
                financial_writes: 0
            };
        }
    } finally {
        if (owned) store.close();
    }
}

function acknowledgeOpenFinanceSaveProposalReceipt({
    proposalRef,
    actorWhatsappId,
    env = process.env,
    dependencies = {}
} = {}) {
    const configuration = finalizationConfiguration(env, {
        allowInjectedContext: Boolean(dependencies.finalizationStore)
    });
    if (!configuration.enabled) {
        return { acknowledged: false, financial_writes: 0 };
    }
    const secret = dependencies.secret ||
        fs.readFileSync(env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE, 'utf8').trim();
    const { store, owned } = openFinalizationStore({
        env,
        secret,
        actorWhatsappId,
        dependencies
    });
    try {
        const Review = dependencies.OpenFinanceSaveProposalReviewStore ||
            require('./openFinanceSaveProposalReviewStore')
                .OpenFinanceSaveProposalReviewStore;
        const reviewStore = dependencies.reviewStore || new Review({
            databasePath: env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
            secret,
            authorizedWhatsAppIds: [actorWhatsappId]
        });
        try {
            reviewStore.finalizeReview(proposalRef, {
                actorWhatsappId
            });
        } finally {
            if (!dependencies.reviewStore) reviewStore.close();
        }
        const result = store.acknowledgeReceipt(proposalRef, {
            actorWhatsappId
        });
        return {
            acknowledged: result.state === 'receipt_delivered',
            replay: result.replay,
            financial_writes: 0
        };
    } finally {
        if (owned) store.close();
    }
}

module.exports = {
    revalidateOpenFinanceSaveProposal,
    executeOpenFinanceSaveProposalFinalization,
    prepareOpenFinanceSaveProposalFinalization,
    handleOpenFinanceSaveProposalFinalizationReply,
    acknowledgeOpenFinanceSaveProposalReceipt,
    writeOpenFinanceSaveProposal,
    finalizationConfiguration,
    buildOpenFinanceFinalizationWritePlan: buildWritePlan,
    __test__: {
        sourceFingerprint,
        revalidateDraftCatalog,
        stableSerialize
    }
};
