const crypto = require('node:crypto');
const fs = require('node:fs');
const { getFormattedDateOnly } = require('../utils/helpers');
const {
    readOpenFinanceInternalSource,
    reconcileOpenFinanceRuntimeCandidates
} = require('./openFinanceRuntimeReconciliation');
const { classifyOpenFinanceLifecycle } = require('./openFinanceLifecycleClassifier');
const {
    evaluateOpenFinanceWriteActivation
} = require('./openFinanceWriteActivationPolicy');
const {
    isCreditPurchaseProviderState,
    isReviewableCreditPurchase,
    isMonotonicPurchaseStateTransition
} = require('./openFinancePurchaseProposalEligibility');

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

function semanticReviewSourceFingerprint(transaction = {}) {
    return {
        id: String(transaction.id || '').trim(),
        account_id: String(transaction.account_id || '').trim(),
        amount_cents: Number(transaction.amount_cents),
        description: String(transaction.description || '').trim(),
        date: String(transaction.date || '').trim(),
        status: String(transaction.status || '').trim().toUpperCase()
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
            accountName: String(value.accountName || value.label || '').trim(),
            ownerUserId: String(value.ownerUserId || '').trim(),
            accountType: normalizeText(value.accountType || 'bank')
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

function revalidateRefundDraftCatalog(draft = {}, catalog = {}, linkedTarget = {}) {
    const person = assertCatalogSelection(catalog, 'people', draft.person);
    if (!person || person.id !== linkedTarget.user_id) {
        throw new Error('open_finance_final_refund_target_changed');
    }
    if (linkedTarget.kind === 'card') {
        const category = assertCatalogSelection(catalog, 'categories', draft.category);
        const paymentMethod = assertCatalogSelection(
            catalog, 'paymentMethods', draft.paymentMethod
        );
        const card = assertCatalogSelection(catalog, 'cards', draft.card);
        if (!category || normalizeText(category.category) !==
            normalizeText(linkedTarget.category) ||
            normalizeText(category.subcategory) !== normalizeText(linkedTarget.subcategory) ||
            !paymentMethod || paymentMethod.value !== 'Cr\u00e9dito' || !card ||
            card.cardId !== linkedTarget.card_id ||
            normalizeText(card.label) !== normalizeText(linkedTarget.card_name) ||
            draft.financialAccount) {
            throw new Error('open_finance_final_refund_target_changed');
        }
        return { person, category, paymentMethod, financialAccount: null, card };
    }
    if (linkedTarget.kind === 'bank') {
        const incomeCatalog = {
            ...catalog,
            categories: catalog.incomeCategories || [],
            paymentMethods: catalog.receiptMethods || []
        };
        const category = assertCatalogSelection(incomeCatalog, 'categories', draft.category);
        const paymentMethod = assertCatalogSelection(
            incomeCatalog, 'paymentMethods', draft.paymentMethod
        );
        const financialAccount = assertCatalogSelection(
            catalog, 'financialAccounts', draft.financialAccount
        );
        const accountLabel = normalizeText(financialAccount?.label || '');
        const expectedAccount = normalizeText(linkedTarget.financial_account || '');
        if (!category || normalizeText(category.category) !== 'reembolso' ||
            !paymentMethod || paymentMethod.value !== 'Conta Corrente' ||
            !financialAccount || financialAccount.ownerUserId !== linkedTarget.user_id ||
            (accountLabel !== expectedAccount &&
                !accountLabel.startsWith(`${expectedAccount} `)) || draft.card) {
            throw new Error('open_finance_final_refund_target_changed');
        }
        return { person, category, paymentMethod, financialAccount, card: null };
    }
    throw new Error('open_finance_final_refund_target_changed');
}

function revalidateDraftCatalog(draft = {}, catalog = {}, classification = 'purchase',
    linkedTarget = null, principal = '') {
    requireObject(draft, 'open_finance_final_draft_required');
    if (classification === 'reserve_transfer') {
        if (!Array.isArray(catalog.financialAccounts)) {
            throw new Error('open_finance_final_catalog_unavailable');
        }
        const originAccount = assertCatalogSelection(
            catalog, 'financialAccounts', draft.originAccount
        );
        const destinationAccount = assertCatalogSelection(
            catalog, 'financialAccounts', draft.destinationAccount
        );
        const ownerUserId = String(draft.ownerUserId || '');
        if (!originAccount || !destinationAccount ||
            originAccount.id === destinationAccount.id || !ownerUserId ||
            originAccount.ownerUserId !== ownerUserId ||
            destinationAccount.ownerUserId !== ownerUserId) {
            throw new Error('open_finance_final_reserve_accounts_changed');
        }
        return { originAccount, destinationAccount, ownerUserId };
    }
    if (classification === 'transfer') {
        if (!Array.isArray(catalog.financialAccounts)) {
            throw new Error('open_finance_final_catalog_unavailable');
        }
        const originAccount = assertCatalogSelection(
            catalog, 'financialAccounts', draft.originAccount
        );
        const destinationAccount = assertCatalogSelection(
            catalog, 'financialAccounts', draft.destinationAccount
        );
        if (!originAccount || !destinationAccount ||
            originAccount.id === destinationAccount.id ||
            originAccount.ownerUserId !== String(draft.originOwnerUserId || '') ||
            destinationAccount.ownerUserId !==
                String(draft.destinationOwnerUserId || '')) {
            throw new Error('open_finance_final_transfer_accounts_changed');
        }
        return {
            originAccount,
            destinationAccount,
            originOwnerUserId: String(draft.originOwnerUserId),
            destinationOwnerUserId: String(draft.destinationOwnerUserId)
        };
    }
    if (classification === 'refund') {
        return revalidateRefundDraftCatalog(draft, catalog, linkedTarget || {});
    }
    if (classification === 'investment_income') {
        principal = String(principal || '').trim().toLowerCase();
        const people = (catalog.people || []).filter(item =>
            String(item.label || '').trim().toLowerCase().split(/\s+/)[0] === principal);
        const categories = (catalog.incomeCategories || catalog.categories || [])
            .filter(item => String(item.category || '').trim().toLowerCase() === 'investimentos');
        const ownerId = people.length === 1 ? people[0].id : '';
        const financialAccounts = (catalog.financialAccounts || []).filter(item =>
            item.ownerUserId === ownerId &&
            ['bank', 'savings', 'reserve'].includes(String(item.accountType || '')));
        catalog = {
            ...catalog,
            people,
            categories,
            paymentMethods: catalog.receiptMethods || catalog.paymentMethods,
            financialAccounts,
            cards: []
        };
    } else if (classification === 'income') {
        catalog = {
            ...catalog,
            categories: catalog.incomeCategories || catalog.categories,
            paymentMethods: catalog.receiptMethods || catalog.paymentMethods,
            cards: []
        };
    }
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
    if (classification === 'investment_income' &&
        draft.category?.origin === 'user_created') {
        throw new Error('open_finance_final_investment_income_category_forbidden');
    }
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
    if (['income', 'investment_income'].includes(classification)) {
        if (!['PIX', 'Conta Corrente', 'Conta Poupança']
            .includes(paymentMethod.value) || draft.card) {
            throw new Error('open_finance_final_payment_method_forbidden');
        }
        financialAccount = assertCatalogSelection(
            catalog,
            'financialAccounts',
            draft.financialAccount
        );
        if (!financialAccount) {
            throw new Error('open_finance_final_draft_incomplete');
        }
        return { person, category, paymentMethod, financialAccount, card: null };
    }
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

function refundRelationNote(target = {}) {
    const ref = String(target.related_source_row_ref || '').trim();
    if (!ref) throw new Error('open_finance_final_refund_relation_unavailable');
    return `[open_finance_refund_pair:${Buffer.from(ref, 'utf8').toString('base64url')}]`;
}

function buildWritePlan({ proposal, draft }) {
    const date = parseProviderDate(proposal.source.date);
    const amount = Math.abs(Number(proposal.source.amount_cents)) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('open_finance_final_source_changed');
    }
    if (proposal.classification === 'transfer') {
        return {
            operation: 'transfer.create',
            sheetName: 'Transferências',
            row: [
                getFormattedDateOnly(date),
                proposal.source.description,
                amount,
                draft.originAccount.accountName,
                draft.destinationAccount.accountName,
                'Transferência',
                'Importado de par Open Finance confirmado nas duas pontas.',
                'Conferida',
                draft.originOwnerUserId
            ],
            userId: draft.originOwnerUserId,
            canonicalRelation: {
                type: 'internal_transfer_pair',
                origin_owner_person_id: draft.originOwnerUserId,
                destination_owner_person_id: draft.destinationOwnerUserId
            },
            financial_writes: 0
        };
    }
    if (proposal.classification === 'reserve_transfer') {
        const application = proposal.reserve_direction === 'application';
        const expectedOrigin = application ? ['bank', 'savings'] : ['reserve'];
        const expectedDestination = application ? ['reserve'] : ['bank', 'savings'];
        if (!expectedOrigin.includes(draft.originAccount.accountType) ||
            !expectedDestination.includes(draft.destinationAccount.accountType)) {
            throw new Error('open_finance_final_reserve_accounts_changed');
        }
        const relationType = application ? 'reserve_application' : 'reserve_redemption';
        return {
            operation: 'transfer.create',
            sheetName: 'Transferências',
            row: [
                getFormattedDateOnly(date),
                proposal.source.description,
                amount,
                draft.originAccount.accountName,
                draft.destinationAccount.accountName,
                'Transferência',
                application
                    ? 'Aplicação em reserva importada do Open Finance.'
                    : 'Resgate de reserva importado do Open Finance.',
                'Conferida',
                draft.ownerUserId
            ],
            userId: draft.ownerUserId,
            canonicalRelation: {
                type: relationType,
                owner_person_id: draft.ownerUserId
            },
            financial_writes: 0
        };
    }
    if (proposal.classification === 'income') {
        return {
            operation: 'income.create',
            sheetName: 'Entradas',
            row: [
                getFormattedDateOnly(date),
                proposal.source.description,
                draft.category.category,
                amount,
                draft.person.label,
                draft.paymentMethod.value,
                'Não',
                'Importado de observação Open Finance confirmada.',
                draft.person.id,
                draft.financialAccount.label
            ],
            userId: draft.person.id,
            financial_writes: 0
        };
    }
    if (proposal.classification === 'investment_income') {
        return {
            operation: 'income.create',
            sheetName: 'Entradas',
            row: [
                getFormattedDateOnly(date),
                proposal.source.description,
                draft.category.category,
                amount,
                draft.person.label,
                draft.paymentMethod.value,
                'N\u00e3o',
                'Rendimento de investimento importado do Open Finance.',
                draft.person.id,
                draft.financialAccount.label
            ],
            userId: draft.person.id,
            canonicalRelation: {
                type: 'investment_income',
                owner_person_id: draft.person.id
            },
            financial_writes: 0
        };
    }
    if (proposal.classification === 'refund') {
        const target = proposal.linked_target || {};
        const canonicalRelation = {
            type: 'refund_pair',
            related_event_id: target.related_event_id,
            related_source_row_ref: target.related_source_row_ref,
            original_amount_cents: target.original_amount_cents,
            category: target.category,
            subcategory: target.subcategory,
            owner_person_id: target.user_id,
            original_source_type: target.kind === 'card'
                ? 'sheet.lancamentos_cartao'
                : 'sheet.saidas'
        };
        if (target.kind === 'card') {
            return {
                operation: 'refund.create',
                sheetName: `Cart\u00e3o ${draft.card.label}`,
                cardId: draft.card.cardId,
                row: [
                    getFormattedDateOnly(date),
                    proposal.source.description,
                    draft.category.category,
                    -amount,
                    '1/1',
                    billingMonth(date, draft.card.closingDay),
                    draft.person.id
                ],
                userId: draft.person.id,
                canonicalRelation,
                financial_writes: 0
            };
        }
        return {
            operation: 'refund.create',
            sheetName: 'Entradas',
            row: [
                getFormattedDateOnly(date),
                proposal.source.description,
                'Reembolso',
                amount,
                draft.person.label,
                draft.paymentMethod.value,
                'N\u00e3o',
                `Reembolso Open Finance vinculado ao gasto original. ${refundRelationNote(target)}`,
                draft.person.id,
                target.financial_account
            ],
            userId: draft.person.id,
            canonicalRelation,
            financial_writes: 0
        };
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
    pairItem = null,
    internalSource,
    catalog,
    semanticReview = null,
    canonicalOriginal = null,
    secret
} = {}) {
    const hmacSecret = requireSecret(secret);
    requireObject(proposal, 'open_finance_final_proposal_required');
    requireObject(review, 'open_finance_final_review_required');
    requireObject(item, 'open_finance_final_source_unavailable');
    requireObject(internalSource, 'open_finance_final_internal_source_unavailable');
    requireObject(catalog, 'open_finance_final_catalog_unavailable');

    const isPurchase = proposal.classification === 'purchase';
    const isIncome = proposal.classification === 'income';
    const isInvestmentIncome = proposal.classification === 'investment_income';
    const isRefund = proposal.classification === 'refund';
    const isTransfer = proposal.classification === 'transfer';
    const isReserveTransfer = proposal.classification === 'reserve_transfer';
    // Installments are deliberately checked by the existing explicit guard below,
    // so this first readiness gate validates provider state without changing that invariant.
    const reviewablePurchaseProposal = isCreditPurchaseProviderState({
        classification: proposal.classification,
        providerState: proposal.provider_state,
        accountType: proposal.account_type,
        transaction: proposal.source
    });
    if (!/^[a-f0-9]{32}$/.test(String(proposal.proposal_ref || '')) ||
        review.proposal_ref !== proposal.proposal_ref ||
        review.state !== 'ready' ||
        (!isPurchase && !isIncome && !isInvestmentIncome && !isRefund && !isTransfer &&
            !isReserveTransfer) ||
        (isPurchase ? !reviewablePurchaseProposal : proposal.provider_state !== 'POSTED') ||
        proposal.reconciliation_status !== 'new' ||
        !/^[a-f0-9]{48}$/.test(String(proposal.operation_key || ''))) {
        throw new Error('open_finance_final_proposal_not_ready');
    }
    if (isIncome && (!semanticReview || semanticReview.review_state !== 'decided' ||
        semanticReview.decision !== 'income' || semanticReview.review_kind !== 'income' ||
        semanticReview.review_ref !== proposal.semantic_review_ref ||
        semanticReview.observation_ref !== proposal.observation_ref ||
        Number(semanticReview.generation) !== Number(proposal.generation) ||
        stableSerialize(semanticReviewSourceFingerprint(semanticReview.source)) !==
            stableSerialize(semanticReviewSourceFingerprint(proposal.source)))) {
        throw new Error('open_finance_final_income_review_changed');
    }
    if (isInvestmentIncome && (!semanticReview ||
        semanticReview.review_state !== 'decided' ||
        semanticReview.decision !== 'investment_income' ||
        semanticReview.review_kind !== 'reserve' ||
        semanticReview.review_ref !== proposal.semantic_review_ref ||
        semanticReview.observation_ref !== proposal.observation_ref ||
        Number(semanticReview.generation) !== Number(proposal.generation) ||
        String(semanticReview.provider_operation_type || '').trim().toUpperCase() !==
            String(proposal.source?.operation_type || '').trim().toUpperCase() ||
        !/^RENDIMENTO_APLIC_FINANCEIRA(?:_|$)/.test(
            String(proposal.source?.operation_type || '').trim().toUpperCase()) ||
        Number(proposal.source?.amount_cents) <= 0 ||
        stableSerialize(semanticReviewSourceFingerprint(semanticReview.source)) !==
            stableSerialize(semanticReviewSourceFingerprint(proposal.source)))) {
        throw new Error('open_finance_final_investment_income_review_changed');
    }
    if (isRefund && (!semanticReview || semanticReview.review_state !== 'decided' ||
        semanticReview.decision !== 'confirm_pair' ||
        semanticReview.review_kind !== 'refund_link' ||
        semanticReview.review_status !== 'pair_confirmation_required' ||
        semanticReview.review_ref !== proposal.semantic_review_ref ||
        semanticReview.observation_ref !== proposal.observation_ref ||
        semanticReview.pair_observation_ref !== proposal.pair_observation_ref ||
        Number(semanticReview.generation) !== Number(proposal.generation) ||
        stableSerialize(semanticReviewSourceFingerprint(semanticReview.source)) !==
            stableSerialize(semanticReviewSourceFingerprint(proposal.source)) ||
        stableSerialize(semanticReviewSourceFingerprint(semanticReview.pair_source)) !==
            stableSerialize(semanticReviewSourceFingerprint(proposal.paired_source)))) {
        throw new Error('open_finance_final_refund_review_changed');
    }
    if (isTransfer && (!semanticReview || semanticReview.review_state !== 'decided' ||
        semanticReview.decision !== 'confirm_transfer_pair' ||
        semanticReview.review_kind !== 'transfer' ||
        semanticReview.review_status !== 'strong_pair_confirmation_required' ||
        semanticReview.pair_basis !== 'shared_provider_reference' ||
        semanticReview.review_ref !== proposal.semantic_review_ref ||
        semanticReview.observation_ref !== proposal.observation_ref ||
        semanticReview.pair_observation_ref !== proposal.pair_observation_ref ||
        Number(semanticReview.generation) !== Number(proposal.generation) ||
        stableSerialize(semanticReviewSourceFingerprint(semanticReview.source)) !==
            stableSerialize(semanticReviewSourceFingerprint(proposal.source)) ||
        stableSerialize(semanticReviewSourceFingerprint(semanticReview.pair_source)) !==
            stableSerialize(semanticReviewSourceFingerprint(proposal.paired_source)))) {
        throw new Error('open_finance_final_transfer_review_changed');
    }
    if (isReserveTransfer && (!semanticReview ||
        semanticReview.review_state !== 'decided' ||
        semanticReview.review_kind !== 'reserve' ||
        semanticReview.review_ref !== proposal.semantic_review_ref ||
        semanticReview.observation_ref !== proposal.observation_ref ||
        Number(semanticReview.generation) !== Number(proposal.generation) ||
        !['reserve_application', 'reserve_redemption'].includes(semanticReview.decision) ||
        (semanticReview.decision === 'reserve_application'
            ? proposal.reserve_direction !== 'application'
            : proposal.reserve_direction !== 'redemption') ||
        (semanticReview.provider_operation_type &&
            String(semanticReview.provider_operation_type).trim().toUpperCase() !==
                String(proposal.source?.operation_type || '').trim().toUpperCase()) ||
        stableSerialize(semanticReviewSourceFingerprint(semanticReview.source)) !==
            stableSerialize(semanticReviewSourceFingerprint(proposal.source)))) {
        throw new Error('open_finance_final_reserve_review_changed');
    }
    if (isTransfer && (
        review.payload?.classification !== 'transfer' ||
        review.payload?.transfer_origin_principal !== proposal.transfer_origin?.principal ||
        review.payload?.transfer_destination_principal !==
            proposal.transfer_destination?.principal ||
        proposal.transfer_origin?.observation_ref ===
            proposal.transfer_destination?.observation_ref ||
        ![proposal.observation_ref, proposal.pair_observation_ref]
            .includes(proposal.transfer_origin?.observation_ref) ||
        ![proposal.observation_ref, proposal.pair_observation_ref]
            .includes(proposal.transfer_destination?.observation_ref))) {
        throw new Error('open_finance_final_transfer_review_changed');
    }
    if (isReserveTransfer && (
        review.payload?.classification !== 'reserve_transfer' ||
        review.payload?.reserve_direction !== proposal.reserve_direction)) {
        throw new Error('open_finance_final_reserve_review_changed');
    }
    if (isInvestmentIncome && (
        review.payload?.classification !== 'investment_income' ||
        proposal.investment_semantic !== 'income_only')) {
        throw new Error('open_finance_final_investment_income_review_changed');
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
    const currentPair = isRefund
        ? (item.transactions || []).find(transaction =>
            String(transaction.id || '') === String(proposal.paired_source?.id || '') &&
            String(transaction.account_id || '') ===
                String(proposal.paired_source?.account_id || ''))
        : isTransfer && pairItem
            ? (pairItem.transactions || []).find(transaction =>
                String(transaction.id || '') === String(proposal.paired_source?.id || '') &&
                String(transaction.account_id || '') ===
                    String(proposal.paired_source?.account_id || ''))
        : null;
    const currentPairAccount = isTransfer && pairItem
        ? (pairItem.accounts || []).find(account =>
            String(account.id || '') === String(proposal.paired_source?.account_id || ''))
        : null;
    const currentFingerprint = currentTransaction && currentAccount
        ? sourceFingerprint(currentTransaction, currentAccount.type)
        : null;
    const proposalFingerprint = sourceFingerprint(proposal.source, proposal.account_type);
    const purchaseStateAdvanced = isPurchase && currentTransaction && currentAccount &&
        isReviewableCreditPurchase({
            classification: 'purchase',
            providerState: currentTransaction.status,
            accountType: currentAccount.type,
            transaction: currentTransaction
        }) && isMonotonicPurchaseStateTransition(
            proposal.provider_state,
            currentTransaction.status
        ) && stableSerialize({ ...currentFingerprint, status: 'REVIEWABLE' }) ===
            stableSerialize({ ...proposalFingerprint, status: 'REVIEWABLE' });
    if (!currentTransaction || !currentAccount ||
        (!purchaseStateAdvanced &&
            stableSerialize(currentFingerprint) !== stableSerialize(proposalFingerprint)) ||
        (isInvestmentIncome &&
            String(currentTransaction.operation_type || '').trim().toUpperCase() !==
                String(proposal.source?.operation_type || '').trim().toUpperCase()) ||
        ((isRefund || isTransfer) && (!currentPair ||
            stableSerialize(semanticReviewSourceFingerprint(currentPair)) !==
                stableSerialize(semanticReviewSourceFingerprint(proposal.paired_source)))) ||
        (isTransfer && (!currentPairAccount ||
            String(pairItem.alias_code || '').trim().toLowerCase() !== proposal.pair_alias ||
            Number(pairItem.generation) !== Number(proposal.pair_generation) ||
            String(currentPairAccount.type || '').trim().toUpperCase() !==
                String(proposal.pair_account_type || '').trim().toUpperCase()))) {
        throw new Error('open_finance_final_source_changed');
    }
    const revalidationItems = isTransfer ? [item, pairItem] : [item];
    const lifecycle = classifyOpenFinanceLifecycle({
        items: revalidationItems,
        observedAt: new Date().toISOString(),
        secret: hmacSecret
    });
    const lifecycleDecision = lifecycle.decisions.find(decision =>
        decision.observation_ref === proposal.observation_ref);
    const expectedLifecycle = (isIncome || isInvestmentIncome) ? 'income_candidate' :
        isRefund ? 'refund' :
        isTransfer ? 'transfer' : isReserveTransfer
            ? (proposal.reserve_direction === 'application'
                ? 'purchase_candidate'
                : 'income_candidate')
            : 'purchase';
    const lifecycleStillEligible = isPurchase
        ? isReviewableCreditPurchase({
            classification: lifecycleDecision?.classification,
            providerState: lifecycleDecision?.provider_state,
            accountType: currentAccount?.type,
            transaction: currentTransaction
        })
        : lifecycleDecision?.provider_state === 'POSTED';
    if (!lifecycleDecision ||
        lifecycleDecision.classification !== expectedLifecycle ||
        !lifecycleStillEligible) {
        throw new Error('open_finance_final_source_changed');
    }
    const candidates = [{
        observation_ref: proposal.observation_ref,
        correlation_state: 'new_event'
    }];
    if (isRefund || isTransfer) {
        candidates.push({
            observation_ref: proposal.pair_observation_ref,
            correlation_state: 'new_event'
        });
    }
    const reconciliation = reconcileOpenFinanceRuntimeCandidates({
        items: revalidationItems,
        candidates,
        internalTransactions: internalSource.transactions,
        scopeCoverage: internalSource.scope_coverage,
        secret: hmacSecret,
        previewDatabasePath: null
    });
    const decision = reconciliation.decisions.find(value =>
        value.observation_ref === proposal.observation_ref);
    if (!decision || decision.status !== 'new' ||
        !reconciliation.eligibleCandidates.some(candidate =>
            candidate.observation_ref === proposal.observation_ref)) {
        throw new Error('open_finance_final_not_new');
    }
    if (isRefund) {
        const pairDecision = reconciliation.decisions.find(value =>
            value.observation_ref === proposal.pair_observation_ref);
        const internalMatches = (internalSource.transactions || []).filter(value =>
            crypto.createHmac('sha256', hmacSecret)
                .update(String(value.id || ''))
                .digest('hex').slice(0, 32) === pairDecision?.canonical_ref);
        if (!pairDecision || pairDecision.status !== 'matched' ||
            pairDecision.confidence_band !== 'high' || internalMatches.length !== 1 ||
            pairDecision.canonical_ref !== proposal.pair_reconciliation_ref ||
            !canonicalOriginal?.resolved) {
            throw new Error('open_finance_final_refund_pair_changed');
        }
        const { linkedTargetFromInternal } =
            require('./openFinanceReviewedRefundSaveProposal');
        const currentTarget = linkedTargetFromInternal({
            accountType: proposal.account_type,
            internalTransaction: internalMatches[0],
            canonicalOriginal
        });
        if (stableSerialize(currentTarget) !== stableSerialize(proposal.linked_target)) {
            throw new Error('open_finance_final_refund_target_changed');
        }
    }
    if (isTransfer) {
        const pairDecision = reconciliation.decisions.find(value =>
            value.observation_ref === proposal.pair_observation_ref);
        if (!pairDecision || pairDecision.status !== 'new' ||
            !reconciliation.eligibleCandidates.some(candidate =>
                candidate.observation_ref === proposal.pair_observation_ref)) {
            throw new Error('open_finance_final_transfer_pair_changed');
        }
        const { analyzeOpenFinanceProactiveReviews } =
            require('./openFinanceProactiveReview');
        const pairAnalysis = analyzeOpenFinanceProactiveReviews({
            items: revalidationItems,
            lifecycleDecisions: lifecycle.decisions,
            reconciliationDecisions: reconciliation.decisions,
            secret: hmacSecret
        });
        const strongPair = pairAnalysis.reviews.find(candidate =>
            candidate.observation_ref === proposal.observation_ref &&
            candidate.pair_observation_ref === proposal.pair_observation_ref);
        if (!strongPair ||
            strongPair.review_status !== 'strong_pair_confirmation_required' ||
            strongPair.pair_basis !== 'shared_provider_reference') {
            throw new Error('open_finance_final_transfer_pair_changed');
        }
    }
    if (isReserveTransfer) {
        const { analyzeOpenFinanceProactiveReviews } =
            require('./openFinanceProactiveReview');
        const reserveAnalysis = analyzeOpenFinanceProactiveReviews({
            items: [item],
            lifecycleDecisions: lifecycle.decisions,
            reconciliationDecisions: reconciliation.decisions,
            secret: hmacSecret
        });
        const currentReserveReview = reserveAnalysis.reviews.find(candidate =>
            candidate.observation_ref === proposal.observation_ref &&
            candidate.review_kind === 'reserve');
        if (!currentReserveReview ||
            currentReserveReview.review_status !== semanticReview.review_status) {
            throw new Error('open_finance_final_reserve_review_changed');
        }
    }
    if (isInvestmentIncome) {
        const { analyzeOpenFinanceProactiveReviews } =
            require('./openFinanceProactiveReview');
        const incomeAnalysis = analyzeOpenFinanceProactiveReviews({
            items: [item],
            lifecycleDecisions: lifecycle.decisions,
            reconciliationDecisions: reconciliation.decisions,
            secret: hmacSecret
        });
        const currentIncomeReview = incomeAnalysis.reviews.find(candidate =>
            candidate.observation_ref === proposal.observation_ref &&
            candidate.review_kind === 'reserve');
        if (!currentIncomeReview ||
            currentIncomeReview.review_status !== semanticReview.review_status) {
            throw new Error('open_finance_final_investment_income_review_changed');
        }
    }
    const draft = revalidateDraftCatalog(
        review.payload?.draft,
        catalog,
        proposal.classification,
        proposal.linked_target,
        proposal.principal
    );
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
            .update(stableSerialize(isTransfer ? [
                sourceFingerprint(currentTransaction, currentAccount.type),
                sourceFingerprint(currentPair, currentPairAccount.type)
            ] : sourceFingerprint(currentTransaction, currentAccount.type)))
            .digest('hex')
            .slice(0, 32),
        revalidation: {
            provider: isIncome
                ? 'posted_reviewed_income_unchanged'
                : isInvestmentIncome
                    ? 'posted_reviewed_investment_income_unchanged'
                : isRefund
                    ? 'posted_reviewed_refund_pair_unchanged'
                    : isTransfer
                        ? 'posted_reviewed_transfer_pair_unchanged'
                        : isReserveTransfer
                            ? 'posted_reviewed_reserve_transfer_unchanged'
                    : 'posted_purchase_unchanged',
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
    const activation = evaluateOpenFinanceWriteActivation(env);
    if (!activation.enabled) {
        return {
            enabled: false,
            proposalMode: activation.proposalMode,
            writeMode: activation.writeMode
        };
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
    return {
        enabled: true,
        proposalMode: activation.proposalMode,
        writeMode: activation.writeMode
    };
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
    expectedProposalRef = null,
    env,
    secret,
    dependencies
}) {
    if (typeof dependencies.findReadyProposalRef === 'function') {
        const readyProposalRef = dependencies.findReadyProposalRef({
            actorWhatsappId,
            expectedProposalRef
        });
        return expectedProposalRef && readyProposalRef !== expectedProposalRef
            ? null
            : readyProposalRef;
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
        if (expectedProposalRef) {
            const exact = store.readReviewPrivate(expectedProposalRef, {
                actorWhatsappId
            });
            return exact?.state === 'ready' ? expectedProposalRef : null;
        }
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
    const { OpenFinanceProactiveReviewStore } =
        require('./openFinanceProactiveReviewStore');
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
        let semanticReview = null;
        if (['income', 'investment_income', 'refund', 'transfer', 'reserve_transfer']
            .includes(proposal.classification)) {
            const ProactiveReview = dependencies.OpenFinanceProactiveReviewStore ||
                OpenFinanceProactiveReviewStore;
            const proactiveStore = new ProactiveReview({
                databasePath: env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
                secret
            });
            try {
                semanticReview = proactiveStore.readPrivate(
                    proposal.semantic_review_ref,
                    { actorWhatsappId }
                );
            } finally {
                proactiveStore.close();
            }
        }
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
        if (journal.isGenerationRevoked?.(
            proposal.alias,
            proposal.generation
        )) {
            throw new Error('save_proposal_revoked_generation');
        }
        let pairItem = null;
        if (proposal.classification === 'transfer') {
            const pairMappingMatches = mappings.filter(mapping =>
                String(mapping?.alias || '').trim().toLowerCase() ===
                    String(proposal.pair_alias || '').trim().toLowerCase());
            if (pairMappingMatches.length !== 1 ||
                Number(pairMappingMatches[0].generation || 1) !==
                    Number(proposal.pair_generation)) {
                throw new Error('open_finance_final_mapping_unavailable');
            }
            pairItem = proposal.pair_alias === proposal.alias
                ? item
                : vault.readItemByAlias(proposal.pair_alias);
            if (!pairItem) throw new Error('open_finance_final_source_unavailable');
            pairItem.generation = Number(pairMappingMatches[0].generation) || 1;
            if (journal.isGenerationRevoked?.(
                proposal.pair_alias,
                proposal.pair_generation
            )) {
                throw new Error('save_proposal_revoked_generation');
            }
        }
        const users = await (dependencies.getActiveUsers || getActiveUsers)();
        const resolveScope = dependencies.getFinancialScopeUserIds ||
            getFinancialScopeUserIds;
        const userIds = await Promise.resolve(resolveScope(userId));
        const internalReader = dependencies.readOpenFinanceInternalSource ||
            readOpenFinanceInternalSource;
        const internalSource = await internalReader({
            users,
            userIds,
            aliases: [...new Set([
                proposal.alias,
                ...(proposal.classification === 'transfer' ? [proposal.pair_alias] : [])
            ])],
            dependencies: dependencies.internalSourceDependencies || {}
        });
        const catalogBuilder =
            dependencies.buildOpenFinanceSaveProposalReviewCatalog ||
            buildOpenFinanceSaveProposalReviewCatalog;
        const catalog = await catalogBuilder({
            userId,
            dependencies: dependencies.catalogDependencies || {}
        });
        let canonicalOriginal = null;
        if (proposal.classification === 'refund') {
            const pairMatches = (internalSource.transactions || []).filter(value =>
                crypto.createHmac('sha256', secret)
                    .update(String(value.id || ''))
                    .digest('hex').slice(0, 32) === proposal.pair_reconciliation_ref);
            if (pairMatches.length !== 1) {
                throw new Error('open_finance_final_refund_pair_changed');
            }
            const resolver = dependencies.resolveCanonicalRefundOriginal ||
                require('../ledger/canonicalLedgerReceiptProjector')
                    .resolveCanonicalRefundOriginal;
            canonicalOriginal = resolver({ env, original: pairMatches[0] });
        }
        return {
            proposal, review, semanticReview, item, pairItem, internalSource, catalog,
            canonicalOriginal
        };
    } finally {
        vault.close();
        reviewStore.close();
        preview.close();
        journal.close();
    }
}

function buildFinalConfirmationReply(validated) {
    const plan = validated.writePlan;
    const amount = plan.sheetName === 'Saídas'
        ? plan.row[4]
        : plan.sheetName === 'Transferências'
            ? plan.row[2]
            : plan.row[3];
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
        requireUserScoped: true,
        reconcileOnly: Boolean(reconcileOnly),
        canonicalRelation: writePlan.canonicalRelation || null
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
    prepareExpectedIfMissing = true,
    handleExpectedMissing = true,
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
        if (!current && expectedProposalRef) {
            const readyProposalRef = prepareExpectedIfMissing
                ? findReadyReview({
                    actorWhatsappId,
                    expectedProposalRef,
                    env,
                    secret,
                    dependencies
                })
                : null;
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
                handled: Boolean(handleExpectedMissing),
                keep_pending: Boolean(handleExpectedMissing),
                proposal_ref: expectedProposalRef,
                reply: handleExpectedMissing
                    ? 'Essa confirma\u00e7\u00e3o final n\u00e3o est\u00e1 mais dispon\u00edvel.'
                    : null,
                financial_writes: 0
            };
        }
        if (!current) {
            const active = store.listActive({ actorWhatsappId, limit: 2 });
            if (active.length === 0) {
                const readyProposalRef = findReadyReview({
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
