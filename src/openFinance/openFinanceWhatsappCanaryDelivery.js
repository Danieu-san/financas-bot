function formatAmount(cents) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(Number(cents)) / 100);
}

function formatCanaryMessage(delivery, sourceLabel) {
    const kind = {
        purchase: 'Compra', refund: 'Estorno/reembolso', bill_payment: 'Pagamento de fatura',
        transfer: 'Transferência', income_candidate: 'Entrada', purchase_candidate: 'Saída', fee_interest: 'Tarifa/juros'
    }[delivery.classification] || 'Movimentação';
    return [
        `🔎 Nova movimentação detectada em ${sourceLabel}.`,
        `${kind}: ${formatAmount(delivery.amount_cents)}`,
        `Descrição: ${String(delivery.description || 'indisponível').slice(0, 120)}`,
        `Data: ${String(delivery.date || '').slice(0, 10) || 'indisponível'}`,
        `Referência: ${delivery.internal_reference}`,
        '',
        'Somente leitura: nada foi salvo automaticamente.'
    ].join('\n');
}

function formatSaveProposalMessage(delivery, sourceLabel, proposal) {
    const source = proposal?.source || {};
    const amountCents = Number.isInteger(source.amount_cents)
        ? source.amount_cents
        : delivery.amount_cents;
    return [
        `🧾 Nova compra reconciliada em ${sourceLabel}.`,
        `Valor: ${formatAmount(amountCents)}`,
        `Descrição: ${String(source.description || delivery.description || 'indisponível').slice(0, 120)}`,
        `Data: ${String(source.date || delivery.date || '').slice(0, 10) || 'indisponível'}`,
        `Referência: ${delivery.internal_reference}`,
        '',
        'Quer continuar para salvar este lançamento?',
        'Responda *sim*, *não* ou *cancelar*.',
        'Nada será salvo antes da conferência final.'
    ].join('\n');
}

function formatSaveProposalBatchMessage(entries = []) {
    if (!Array.isArray(entries) || entries.length < 2 || entries.length > 4) {
        throw new Error('valid_open_finance_save_batch_required');
    }
    const lines = [
        '🧾 Novas compras reconciliadas:',
        ''
    ];
    entries.forEach(({ delivery = {}, sourceLabel, proposal = {} }, index) => {
        const source = proposal.source || {};
        const amountCents = Number.isInteger(source.amount_cents)
            ? source.amount_cents
            : delivery.amount_cents;
        lines.push(
            `${index + 1}. ${sourceLabel}`,
            `Valor: ${formatAmount(amountCents)}`,
            `Descrição: ${String(source.description || delivery.description || 'indisponível').slice(0, 120)}`,
            `Data: ${String(source.date || delivery.date || '').slice(0, 10) || 'indisponível'}`,
            `Referência: ${delivery.internal_reference}`,
            ''
        );
    });
    lines.push(
        'Para iniciar a conferência, responda *salvar 1*, *salvar 1 e 3* ou *salvar todas*.',
        'Cada lançamento será conferido e confirmado separadamente.',
        'Nada será salvo automaticamente.'
    );
    return lines.join('\n');
}

async function deliverOneOpenFinanceCanary({ policy, outbox, transport, recipientResolver,
    sourceLabels = {}, saveProposalStore = null, proposalMode = 'off',
    deferSaveProposalConfirmation = false, proposalBatchSize = 1,
    eligibleProposalRefs = [], excludedRecipients = [], now } = {}) {
    if (!policy?.can_send_whatsapp ||
        typeof policy.can_write_financial !== 'boolean' ||
        !policy.canary_aliases?.length) {
        return { outcome: 'blocked', reason: 'canary_policy_not_authorized', transport_calls: 0, financial_writes: 0 };
    }
    if (!['off', 'prompt'].includes(proposalMode)) {
        throw new Error('invalid_open_finance_delivery_proposal_mode');
    }
    if (typeof deferSaveProposalConfirmation !== 'boolean') {
        throw new Error('invalid_open_finance_deferred_confirmation_mode');
    }
    if (!Number.isInteger(proposalBatchSize) || proposalBatchSize < 1 ||
        proposalBatchSize > 4) {
        throw new Error('invalid_open_finance_proposal_batch_size');
    }
    if (!Array.isArray(eligibleProposalRefs) || eligibleProposalRefs.some(ref =>
        !/^[a-f0-9]{32}$/.test(String(ref || '')))) {
        throw new Error('invalid_open_finance_eligible_proposal_refs');
    }
    if (!outbox || !transport || typeof transport.sendMessage !== 'function' || typeof recipientResolver !== 'function') {
        throw new Error('canary_delivery_dependencies_required');
    }
    const claimed = proposalBatchSize > 1
        ? outbox.claimNextBatch({
            canaryAliases: policy.canary_aliases,
            activatedAfterByAlias: policy.canary_activations || {},
            excludedRecipients,
            batchSize: proposalBatchSize,
            preferProposalBatch: proposalMode === 'prompt',
            eligibleProposalRefs,
            now
        })
        : [outbox.claimNext({ canaryAliases: policy.canary_aliases,
            activatedAfterByAlias: policy.canary_activations || {}, excludedRecipients,
            preferProposalBatch: proposalMode === 'prompt', eligibleProposalRefs, now })]
            .filter(Boolean);
    if (!claimed.length) {
        return { outcome: 'idle', transport_calls: 0, financial_writes: 0 };
    }
    const delivery = claimed[0];
    if (claimed.some(item => item.recipient !== delivery.recipient)) {
        throw new Error('open_finance_delivery_batch_recipient_mismatch');
    }
    let transportStarted = false;
    let proposalContext = null;
    const proposalEntries = [];
    try {
        const recipient = await recipientResolver(delivery.recipient);
        if (!recipient) throw Object.assign(new Error('recipient_unavailable'), { code: 'recipient_unavailable' });
        for (const item of claimed) {
            const sourceLabel = sourceLabels[item.alias];
            if (!sourceLabel) {
                throw Object.assign(new Error('source_label_unavailable'),
                    { code: 'source_label_unavailable' });
            }
            if (item.proposal_ref && proposalMode === 'prompt') {
                if (!saveProposalStore) {
                    throw Object.assign(new Error('save_proposal_store_unavailable'),
                        { code: 'save_proposal_store_unavailable' });
                }
                const proposalPayload = saveProposalStore.readSaveProposalPrivate(
                    item.proposal_ref,
                    { actorWhatsappId: recipient }
                );
                const expectedPrincipal = item.confirmation_principal || item.recipient;
                if (!proposalPayload || proposalPayload.principal !== expectedPrincipal) {
                    throw Object.assign(new Error('save_proposal_delivery_binding_mismatch'),
                        { code: 'save_proposal_delivery_binding_mismatch' });
                }
                const prepared = deferSaveProposalConfirmation
                    ? { state: 'deferred', expires_at: proposalPayload.expires_at }
                    : saveProposalStore.prepareSaveProposalConfirmation(
                        item.proposal_ref,
                        { actorWhatsappId: recipient }
                    );
                if (!deferSaveProposalConfirmation &&
                    (prepared.state !== 'ready' || !prepared.confirmation_ref)) {
                    throw Object.assign(new Error('save_proposal_confirmation_not_ready'),
                        { code: 'save_proposal_confirmation_not_ready' });
                }
                proposalEntries.push({
                    delivery: item,
                    sourceLabel,
                    proposal: proposalPayload,
                    proposal_ref: item.proposal_ref,
                    confirmation_expires_at: prepared.expires_at,
                    recipient_principal: item.recipient
                });
            } else if (claimed.length > 1) {
                throw new Error('open_finance_nonproposal_delivery_batch_forbidden');
            }
        }
        if (proposalEntries.length) {
            proposalContext = proposalEntries.length === 1
                ? {
                    proposal_ref: proposalEntries[0].proposal_ref,
                    confirmation_expires_at: proposalEntries[0].confirmation_expires_at,
                    recipient,
                    recipient_principal: delivery.recipient
                }
                : {
                    proposal_items: proposalEntries.map(entry => ({
                        proposal_ref: entry.proposal_ref,
                        confirmation_expires_at: entry.confirmation_expires_at,
                        recipient_principal: entry.recipient_principal
                    })),
                    confirmation_expires_at: proposalEntries
                        .map(entry => entry.confirmation_expires_at)
                        .sort()[0],
                    recipient,
                    recipient_principal: delivery.recipient
                };
        }
        transportStarted = true;
        const response = await transport.sendMessage(
            recipient,
            proposalEntries.length > 1
                ? formatSaveProposalBatchMessage(proposalEntries)
                : proposalContext
                    ? formatSaveProposalMessage(
                        delivery,
                        proposalEntries[0].sourceLabel,
                        proposalEntries[0].proposal
                    )
                    : formatCanaryMessage(delivery, sourceLabels[delivery.alias])
        );
        const messageId = response?.id?._serialized || response?.id?.id || response?.id || response?.messageId ||
            response?._data?.id?._serialized || response?._data?.id?.id;
        if (messageId) {
            if (claimed.length > 1) {
                outbox.acknowledgeDeliveredBatch({
                    deliveries: claimed.map(item => ({
                        alertRef: item.alert_ref,
                        leaseToken: item.lease_token
                    })),
                    whatsappMessageId: String(messageId),
                    sentAt: now
                });
            } else {
                outbox.acknowledgeDelivered({ alertRef: delivery.alert_ref,
                    leaseToken: delivery.lease_token,
                    whatsappMessageId: String(messageId), sentAt: now });
            }
            return { outcome: 'delivered_confirmed', alert_ref: delivery.alert_ref,
                alert_refs: claimed.map(item => item.alert_ref),
                ...(proposalContext || {}), transport_calls: 1, financial_writes: 0 };
        }
        if (claimed.length > 1) {
            outbox.acknowledgeAcceptedBatch({
                deliveries: claimed.map(item => ({
                    alertRef: item.alert_ref,
                    leaseToken: item.lease_token
                })),
                acceptedAt: now
            });
        } else {
            outbox.acknowledgeAccepted({ alertRef: delivery.alert_ref,
                leaseToken: delivery.lease_token, acceptedAt: now });
        }
        return { outcome: 'accepted_unconfirmed', alert_ref: delivery.alert_ref,
            alert_refs: claimed.map(item => item.alert_ref),
            conversation_bindable: Boolean(proposalContext),
            ...(proposalContext || {}), transport_calls: 1, financial_writes: 0 };
    } catch (error) {
        if (transportStarted && error?.definitiveNoSend !== true) {
            const leases = claimed.map(item => ({
                alertRef: item.alert_ref,
                leaseToken: item.lease_token
            }));
            if (claimed.length > 1) {
                outbox.acknowledgeAcceptedBatch({ deliveries: leases,
                    acceptedAt: now, reasonCode: 'ambiguous_transport_failure' });
            } else {
                outbox.acknowledgeAccepted({ alertRef: delivery.alert_ref,
                    leaseToken: delivery.lease_token,
                    acceptedAt: now, reasonCode: 'ambiguous_transport_failure' });
            }
            return { outcome: 'accepted_unconfirmed', reason: 'ambiguous_delivery',
                conversation_bindable: false,
                ...(proposalContext || {}), transport_calls: 1, financial_writes: 0 };
        }
        const errorCode = /^[a-z0-9_]{2,48}$/.test(String(error.code || ''))
            ? error.code
            : 'transport_error';
        if (claimed.length > 1) {
            outbox.releaseFailedBatch({
                deliveries: claimed.map(item => ({
                    alertRef: item.alert_ref,
                    leaseToken: item.lease_token
                })),
                errorCode
            });
        } else {
            outbox.releaseFailed({ alertRef: delivery.alert_ref,
                leaseToken: delivery.lease_token, errorCode });
        }
        return { outcome: 'retry', reason: 'delivery_failed', transport_calls: transportStarted ? 1 : 0, financial_writes: 0 };
    }
}

module.exports = {
    deliverOneOpenFinanceCanary,
    formatCanaryMessage,
    formatSaveProposalMessage,
    formatSaveProposalBatchMessage
};
