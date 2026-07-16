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

async function deliverOneOpenFinanceCanary({ policy, outbox, transport, recipientResolver, sourceLabels = {}, now } = {}) {
    if (!policy?.can_send_whatsapp || policy.can_write_financial !== false || !policy.canary_aliases?.length) {
        return { outcome: 'blocked', reason: 'canary_policy_not_authorized', transport_calls: 0, financial_writes: 0 };
    }
    if (!outbox || !transport || typeof transport.sendMessage !== 'function' || typeof recipientResolver !== 'function') {
        throw new Error('canary_delivery_dependencies_required');
    }
    const delivery = outbox.claimNext({ canaryAliases: policy.canary_aliases,
        activatedAfterByAlias: policy.canary_activations || {}, now });
    if (!delivery) return { outcome: 'idle', transport_calls: 0, financial_writes: 0 };
    let transportStarted = false;
    try {
        const recipient = await recipientResolver(delivery.recipient);
        if (!recipient) throw Object.assign(new Error('recipient_unavailable'), { code: 'recipient_unavailable' });
        const sourceLabel = sourceLabels[delivery.alias];
        if (!sourceLabel) throw Object.assign(new Error('source_label_unavailable'), { code: 'source_label_unavailable' });
        transportStarted = true;
        const response = await transport.sendMessage(recipient, formatCanaryMessage(delivery, sourceLabel));
        const messageId = response?.id?._serialized || response?.id?.id || response?.id || response?.messageId ||
            response?._data?.id?._serialized || response?._data?.id?.id;
        if (messageId) {
            outbox.acknowledgeDelivered({ alertRef: delivery.alert_ref, leaseToken: delivery.lease_token,
                whatsappMessageId: String(messageId), sentAt: now });
            return { outcome: 'delivered_confirmed', alert_ref: delivery.alert_ref, transport_calls: 1, financial_writes: 0 };
        }
        outbox.acknowledgeAccepted({ alertRef: delivery.alert_ref, leaseToken: delivery.lease_token, acceptedAt: now });
        return { outcome: 'accepted_unconfirmed', alert_ref: delivery.alert_ref, transport_calls: 1, financial_writes: 0 };
    } catch (error) {
        if (transportStarted && error?.definitiveNoSend !== true) {
            outbox.acknowledgeAccepted({ alertRef: delivery.alert_ref, leaseToken: delivery.lease_token,
                acceptedAt: now, reasonCode: 'ambiguous_transport_failure' });
            return { outcome: 'accepted_unconfirmed', reason: 'ambiguous_delivery', transport_calls: 1, financial_writes: 0 };
        }
        outbox.releaseFailed({ alertRef: delivery.alert_ref, leaseToken: delivery.lease_token,
            errorCode: /^[a-z0-9_]{2,48}$/.test(String(error.code || '')) ? error.code : 'transport_error' });
        return { outcome: 'retry', reason: 'delivery_failed', transport_calls: transportStarted ? 1 : 0, financial_writes: 0 };
    }
}

module.exports = { deliverOneOpenFinanceCanary, formatCanaryMessage };
