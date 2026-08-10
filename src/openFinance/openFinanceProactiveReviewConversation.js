const fs = require('node:fs');
const {
    OpenFinanceProactiveReviewStore
} = require('./openFinanceProactiveReviewStore');

function normalize(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function formatAmount(cents) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency: 'BRL'
    }).format(Math.abs(Number(cents)) / 100);
}

function optionsFor(review) {
    const code = review.review_code;
    if (review.review_kind === 'income') {
        return `Responda *revisar ${code} entrada*, *transferência*, *reserva* ou *não sei*.`;
    }
    if (review.review_status === 'pair_confirmation_required') {
        return `Responda *revisar ${code} confirmar*, *rejeitar* ou *não sei*.`;
    }
    return `Responda *revisar ${code} estorno sem vínculo*, *não é estorno* ou *não sei*.`;
}

function decisionFor(value, review) {
    const normalized = normalize(value);
    if (!normalized) return null;
    if (['nao sei', 'não sei', 'incerto', 'incerta'].includes(normalized)) return 'uncertain';
    if (review.review_kind === 'income') {
        return {
            entrada: 'income', renda: 'income', receita: 'income',
            transferencia: 'transfer', reserva: 'reserve', caixinha: 'reserve'
        }[normalized] || null;
    }
    if (review.review_status === 'pair_confirmation_required') {
        return {
            confirmar: 'confirm_pair', confirma: 'confirm_pair',
            rejeitar: 'reject_pair', rejeita: 'reject_pair'
        }[normalized] || null;
    }
    return {
        'estorno sem vinculo': 'unlinked_refund',
        'nao e estorno': 'not_refund'
    }[normalized] || null;
}

function tryHandleOpenFinanceProactiveReviewReply({
    actorWhatsappId,
    body,
    env = process.env,
    dependencies = {}
} = {}) {
    if (String(env.OPEN_FINANCE_SAVE_PROPOSAL_MODE || 'off').trim().toLowerCase() !== 'prompt') {
        return { handled: false, financial_writes: 0 };
    }
    const match = normalize(body).match(/^revisar\s+([a-f0-9]{10})(?:\s+(.+))?$/);
    if (!match) return { handled: false, financial_writes: 0 };
    const secretPath = String(env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE || '');
    const databasePath = String(env.OPEN_FINANCE_SHADOW_PREVIEW_DB || '');
    if (!secretPath || !databasePath || !fs.existsSync(secretPath)) {
        return {
            handled: true,
            reply: 'A revisão está temporariamente indisponível. Nada foi salvo.',
            financial_writes: 0
        };
    }
    const secret = fs.readFileSync(secretPath, 'utf8').trim();
    const Store = dependencies.OpenFinanceProactiveReviewStore || OpenFinanceProactiveReviewStore;
    const store = new Store({ databasePath, secret });
    try {
        let review;
        try {
            review = store.readPrivateByCode(match[1], { actorWhatsappId });
        } catch (error) {
            if (['open_finance_proactive_review_not_found', 'proactive_review_actor_unauthorized']
                .includes(error?.message)) {
                return {
                    handled: true,
                    reply: 'Essa revisão não está disponível para este número. Nada foi salvo.',
                    financial_writes: 0
                };
            }
            if (error?.message === 'open_finance_proactive_review_not_pending') {
                return {
                    handled: true,
                    reply: 'Essa revisão expirou e não pode mais receber decisão. Nada foi salvo.',
                    financial_writes: 0
                };
            }
            throw error;
        }
        if (!match[2]) {
            return {
                handled: true,
                reply: [
                    `Revisão de ${review.review_kind === 'income' ? 'entrada' : 'estorno'}:`,
                    `Valor: ${formatAmount(review.source.amount_cents)}`,
                    `Descrição: ${String(review.source.description || 'indisponível').slice(0, 120)}`,
                    `Data: ${String(review.source.date || '').slice(0, 10)}`,
                    '',
                    optionsFor(review),
                    'Somente leitura: nada foi salvo.'
                ].join('\n'),
                financial_writes: 0
            };
        }
        const decision = decisionFor(match[2], review);
        if (!decision) {
            return {
                handled: true,
                reply: `Opção inválida. ${optionsFor(review)} Nada foi salvo.`,
                financial_writes: 0
            };
        }
        let result;
        try {
            result = store.decideByCode(match[1], decision, { actorWhatsappId });
        } catch (error) {
            if (error?.message === 'proactive_review_decision_conflict') {
                return {
                    handled: true,
                    reply: 'Essa revisão já recebeu outra decisão. Nada foi alterado nem salvo.',
                    financial_writes: 0
                };
            }
            throw error;
        }
        return {
            handled: true,
            review_ref: result.review_ref,
            decision: result.decision,
            replay: result.replay,
            reply: result.replay
                ? 'Essa decisão já estava registrada. Nada foi salvo.'
                : 'Decisão registrada para futura conferência. Nada foi salvo.',
            financial_writes: 0
        };
    } finally {
        store.close();
    }
}

module.exports = {
    tryHandleOpenFinanceProactiveReviewReply,
    __test__: { decisionFor, optionsFor }
};
