const crypto = require('node:crypto');
const { buildStatementReconciliationLinks } = require('../ledger/statementReconciliationShadow');

function requireSecret(secret) {
    const value = String(secret || '');
    if (value.length < 32) throw new Error('open_finance_shadow_secret_required');
    return value;
}

function dateDay(value) {
    const text = String(value || '').trim();
    const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const parsed = br
        ? Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1]))
        : Date.parse(text);
    return Number.isFinite(parsed) ? Math.floor(parsed / 86400000) : null;
}

function normalizedTokens(value) {
    return new Set(String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(token => token.length > 1));
}

function similarity(left, right) {
    const a = normalizedTokens(left);
    const b = normalizedTokens(right);
    if (!a.size || !b.size) return 0;
    const intersection = [...a].filter(token => b.has(token)).length;
    return intersection / new Set([...a, ...b]).size;
}

function directionOf(transaction) {
    const type = String(transaction.type || transaction.direction || '').toUpperCase();
    if (['CREDIT', 'ENTRADA'].includes(type)) return 'credit';
    if (['DEBIT', 'SAIDA', 'CARTAO'].includes(type)) return 'debit';
    if (['TRANSFER', 'TRANSFERENCIA'].includes(type)) return 'transfer';
    return Number(transaction.amount_cents ?? transaction.amountCents ?? 0) < 0 ? 'debit' : 'credit';
}

function amountOf(transaction) {
    const amount = Number(transaction.amount_cents ?? transaction.amountCents);
    return Number.isFinite(amount) ? Math.abs(Math.round(amount)) : null;
}

function candidateScore(source, target) {
    const sourceAmount = amountOf(source);
    const targetAmount = amountOf(target);
    const sourceDay = dateDay(source.date);
    const targetDay = dateDay(target.date);
    if (sourceAmount === null || targetAmount === null || sourceAmount !== targetAmount ||
        sourceDay === null || targetDay === null) return 0;
    const dayDelta = Math.abs(sourceDay - targetDay);
    if (dayDelta > 2) return 0;
    const sourceDirection = directionOf(source);
    const targetDirection = directionOf(target);
    if (sourceDirection !== targetDirection && targetDirection !== 'transfer') return 0;
    const textScore = similarity(source.description, target.description);
    return (dayDelta === 0 ? 0.45 : 0.25) + (textScore * 0.45) + 0.1;
}

function reconcileOpenFinanceShadow({ openFinanceItems = [], canonicalTransactions = [], secret } = {}) {
    const hmacSecret = requireSecret(secret);
    const hmac = value => crypto.createHmac('sha256', hmacSecret).update(String(value || '')).digest('hex').slice(0, 32);
    const decisions = [];
    const claimedCanonical = new Map();

    for (const item of openFinanceItems) {
        for (const transaction of item.transactions || []) {
            const candidates = canonicalTransactions.map((candidate, index) => ({
                index,
                score: candidateScore(transaction, candidate)
            })).filter(candidate => candidate.score >= 0.55).sort((a, b) => b.score - a.score);
            let status = 'new';
            let rule = 'no_candidate';
            let selected = null;
            if (amountOf(transaction) === null || dateDay(transaction.date) === null) {
                status = 'uncertain';
                rule = 'invalid_source_fields';
            } else if (candidates.length > 1 && candidates[0].score - candidates[1].score < 0.15) {
                status = 'possible_duplicate';
                rule = 'multiple_candidates';
            } else if (candidates.length) {
                selected = candidates[0];
                status = selected.score >= 0.85 ? 'matched' : 'possible_duplicate';
                rule = selected.score >= 0.85 ? 'amount_date_description' : 'weak_candidate';
                const prior = claimedCanonical.get(selected.index);
                if (prior !== undefined) {
                    status = 'possible_duplicate';
                    rule = 'canonical_candidate_reused';
                    decisions[prior].status = 'possible_duplicate';
                    decisions[prior].rule = 'canonical_candidate_reused';
                } else {
                    claimedCanonical.set(selected.index, decisions.length);
                }
            }
            decisions.push({
                alias: item.alias_code,
                transaction_ref: hmac(`${item.id}:${transaction.id}`),
                canonical_ref: selected ? hmac(canonicalTransactions[selected.index].id || selected.index) : null,
                status,
                rule,
                confidence_band: !selected ? 'none' : selected.score >= 0.85 ? 'high' : 'medium'
            });
        }
    }

    const summary = {};
    for (const decision of decisions) {
        summary[decision.alias] ||= { matched: 0, new: 0, possible_duplicate: 0, uncertain: 0, total: 0 };
        summary[decision.alias][decision.status] += 1;
        summary[decision.alias].total += 1;
    }
    const links = buildStatementReconciliationLinks({
        userId: 'open_finance_shadow',
        filename: 'pluggy_live_staging',
        transactions: decisions.map(decision => ({
            type: 'open_finance', data: '', descricao: decision.transaction_ref, valor: 0,
            reconciliationStatus: decision.status,
            reconciliationRule: decision.rule,
            reconciliationMatchKey: decision.canonical_ref
        }))
    });
    return { decisions, summary, phase3g_links: links, financial_writes: 0 };
}

module.exports = { reconcileOpenFinanceShadow, __test__: { candidateScore, dateDay, similarity } };
