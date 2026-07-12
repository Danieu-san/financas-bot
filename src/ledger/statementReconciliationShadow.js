const crypto = require('node:crypto');

const {
    CanonicalLedgerShadowStore,
    DEFAULT_DB_PATH
} = require('./canonicalLedgerShadowStore');
const { buildCanonicalLedgerRolloutPolicy } = require('./canonicalLedgerRolloutPolicy');

const VALID_STATUSES = new Set(['matched', 'new', 'possible_duplicate', 'uncertain']);

function sha256(value, length = 32) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, length);
}

function transactionFingerprint(item = {}) {
    return JSON.stringify({
        type: item.type || '',
        date: item.data || '',
        description: item.descricao || '',
        value: item.valor || 0,
        account: item.contaFinanceira || item.financialAccount || item.conta || '',
        card: item.cardInfo?.sheetName || item.cartao || item.cardId || ''
    });
}

function buildStatementReconciliationLinks({
    transactions = [],
    userId = '',
    filename = '',
    confirmedAt = new Date().toISOString()
} = {}) {
    const actorHash = sha256(userId);
    const sourceFileHash = sha256(filename || JSON.stringify(transactions));

    return transactions.map((item, index) => {
        const decisionStatus = VALID_STATUSES.has(item.reconciliationStatus)
            ? item.reconciliationStatus
            : 'uncertain';
        const transactionHash = sha256(transactionFingerprint(item));
        const matchedSourceHash = item.reconciliationMatchKey
            ? sha256(item.reconciliationMatchKey)
            : null;
        const operationKeyHash = sha256(JSON.stringify({
            actorHash,
            sourceFileHash,
            transactionHash,
            index
        }));
        const record = {
            operationKeyHash,
            actorHash,
            sourceFileHash,
            transactionHash,
            matchedSourceHash,
            decisionStatus,
            decisionRule: item.reconciliationRule || 'missing_decision_rule',
            confirmedAt
        };
        return {
            ...record,
            linkId: `stmtrec_${sha256(JSON.stringify(record), 24)}`
        };
    });
}

function persistConfirmedStatementReconciliations({
    env = process.env,
    dbPath = env.CANONICAL_LEDGER_SHADOW_DB_PATH || DEFAULT_DB_PATH,
    ...input
} = {}) {
    const policy = buildCanonicalLedgerRolloutPolicy(env);
    if (!policy.shadowWritesAllowed) {
        return { persisted: false, reason: 'shadow_writes_disabled' };
    }

    const links = buildStatementReconciliationLinks(input);
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    try {
        return {
            persisted: true,
            count: store.persistStatementReconciliationLinks(links)
        };
    } finally {
        store.close();
    }
}

function safelyPersistConfirmedStatementReconciliations({ onWarning = () => {}, ...input } = {}) {
    try {
        return persistConfirmedStatementReconciliations(input);
    } catch (error) {
        onWarning({
            code: 'statement_reconciliation_shadow_failed',
            error: error.message
        });
        return { persisted: false, reason: 'persistence_failed' };
    }
}

module.exports = {
    buildStatementReconciliationLinks,
    persistConfirmedStatementReconciliations,
    safelyPersistConfirmedStatementReconciliations
};
