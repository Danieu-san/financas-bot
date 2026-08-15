const crypto = require('node:crypto');
const {
    FinancialWriteLedger,
    createOperationKey
} = require('../reliability/financialWriteLedger');

const STATE_NAMES = Object.freeze([
    'ready',
    'existing',
    'possible_duplicate',
    'excluded',
    'needs_review',
    'outside_window'
]);

const DESTINATIONS = Object.freeze({
    'Saídas': { rowLength: 11, userIdIndex: 9, operation: 'expense.create' },
    'Entradas': { rowLength: 10, userIdIndex: 8, operation: 'income.create' },
    'Lançamentos Cartão': {
        rowLength: 10,
        userIdIndex: 9,
        cardIdIndex: 6,
        operation: 'expense.create'
    },
    'Transferências': {
        rowLength: 9,
        userIdIndex: 8,
        operation: 'transfer.create'
    }
});

function stableSerialize(value) {
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key =>
            `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function hashHistoricalPlan(plan) {
    return crypto.createHash('sha256').update(stableSerialize({
        historyStartDate: plan.history_start_date,
        historyEndDate: plan.history_end_date,
        includeOpenInvoiceCurrentPurchases:
            plan.include_open_invoice_current_purchases === true,
        entries: plan.entries
    })).digest('hex');
}

function fingerprintHistoricalPlan(plan) {
    return crypto.createHash('sha256')
        .update(stableSerialize(plan))
        .digest('hex');
}

function fail(code) {
    const error = new Error(code);
    error.code = code.toUpperCase();
    throw error;
}

function validateWritePlan(entry) {
    const writePlan = entry.write_plan;
    if (!writePlan || typeof writePlan !== 'object' ||
        writePlan.financial_writes !== 0) {
        fail('historical_import_writer_ready_plan_required');
    }
    const destination = String(writePlan.sheet_name || '').trim();
    const contract = DESTINATIONS[destination];
    if (!contract || writePlan.operation !== contract.operation ||
        !Array.isArray(writePlan.row) ||
        writePlan.row.length !== contract.rowLength) {
        fail('historical_import_writer_destination_contract_invalid');
    }
    const userId = String(writePlan.row[contract.userIdIndex] || '').trim();
    if (!userId) fail('historical_import_writer_user_scope_required');
    const cardId = Number.isInteger(contract.cardIdIndex)
        ? String(writePlan.row[contract.cardIdIndex] || '').trim()
        : '';
    if (Number.isInteger(contract.cardIdIndex) && !cardId) {
        fail('historical_import_writer_card_scope_required');
    }
    return { destination, contract, userId, cardId, writePlan };
}

function validateHistoricalImportPlan(plan) {
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.entries) ||
        plan.coverage_complete !== true || plan.financial_writes !== 0 ||
        plan.writable !== false || plan.plan_status !== 'REVIEW_REQUIRED') {
        fail('historical_import_writer_closed_plan_required');
    }
    const observedAt = Date.parse(String(plan.source_observed_at || ''));
    const historyEnd = Date.parse(`${String(plan.history_end_date || '')}T00:00:00.000Z`);
    if (!Number.isFinite(observedAt) || !Number.isFinite(historyEnd) ||
        observedAt < historyEnd) {
        fail('historical_import_writer_coverage_evidence_invalid');
    }
    const planHash = String(plan.plan_hash || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(planHash) || hashHistoricalPlan(plan) !== planHash) {
        fail('historical_import_writer_plan_hash_mismatch');
    }
    const counts = Object.fromEntries(STATE_NAMES.map(state => [state, 0]));
    const sourceRefs = new Set();
    const ready = [];
    for (const entry of plan.entries) {
        const state = String(entry?.state || '').trim();
        const sourceRef = String(entry?.source_ref || '').trim();
        if (!Object.hasOwn(counts, state) || !sourceRef ||
            sourceRefs.has(sourceRef) || entry.financial_writes !== 0) {
            fail('historical_import_writer_entry_contract_invalid');
        }
        sourceRefs.add(sourceRef);
        counts[state] += 1;
        if (state === 'ready') {
            ready.push({ entry, sourceRef, ...validateWritePlan(entry) });
        } else if (entry.write_plan !== undefined) {
            fail('historical_import_writer_non_ready_write_plan_blocked');
        }
    }
    for (const state of STATE_NAMES) {
        if (Number(plan.summary?.[state]) !== counts[state]) {
            fail('historical_import_writer_summary_mismatch');
        }
    }
    if (counts.needs_review !== 0) {
        fail('historical_import_writer_review_residue');
    }
    return {
        planHash,
        planFingerprint: fingerprintHistoricalPlan(plan),
        counts,
        ready
    };
}

function internalBatch(plan) {
    const validated = validateHistoricalImportPlan(plan);
    const messageId = `open-finance-historical-import:${validated.planFingerprint}`;
    const items = validated.ready.map(current => ({
        ...current,
        operationKey: createOperationKey({
            userId: current.userId,
            messageId,
            operation: `append.${current.destination}`,
            itemFingerprint: current.sourceRef
        })
    }));
    const destinationCounts = {};
    for (const item of items) {
        destinationCounts[item.destination] =
            Number(destinationCounts[item.destination] || 0) + 1;
    }
    return {
        ...validated,
        messageId,
        items,
        destinationCounts: Object.fromEntries(
            Object.entries(destinationCounts).sort(([left], [right]) =>
                left.localeCompare(right, 'pt-BR'))
        )
    };
}

function publicDryRun(batch) {
    return {
        status: 'dry_run_ready',
        plan_hash: batch.planHash,
        plan_fingerprint: batch.planFingerprint,
        total_entries: Object.values(batch.counts).reduce((sum, value) => sum + value, 0),
        write_count: batch.items.length,
        blocked_count: Object.entries(batch.counts)
            .filter(([state]) => state !== 'ready')
            .reduce((sum, [, value]) => sum + value, 0),
        state_counts: { ...batch.counts },
        destination_counts: { ...batch.destinationCounts },
        items: batch.items.map(item => ({
            operation_key: item.operationKey,
            destination: item.destination
        })),
        financial_writes: 0
    };
}

function buildOpenFinanceHistoricalImportWriteBatch({ plan } = {}) {
    return publicDryRun(internalBatch(plan));
}

function resultSnapshot({
    status,
    batch,
    committed,
    replayed,
    reconciled,
    failed,
    remaining,
    attempted,
    failureCode = ''
}) {
    return {
        status,
        plan_hash: batch.planHash,
        plan_fingerprint: batch.planFingerprint,
        total: batch.items.length,
        attempted,
        committed,
        replayed,
        reconciled,
        failed,
        remaining,
        ...(failureCode ? { failure_code: failureCode } : {}),
        financial_writes: committed
    };
}

async function executeOpenFinanceHistoricalImportWriteBatch({
    plan,
    mode = 'dry-run',
    confirmApply = false,
    confirmPlanHash = '',
    confirmPlanFingerprint = '',
    appendRowToSheet,
    writeLedger = null,
    ledgerPath,
    maxNewWrites = Number.POSITIVE_INFINITY,
    onProgress = null
} = {}) {
    const batch = internalBatch(plan);
    if (mode === 'dry-run') return publicDryRun(batch);
    if (mode !== 'apply' || confirmApply !== true) {
        fail('historical_import_writer_apply_confirmation_required');
    }
    if (String(confirmPlanHash || '').trim().toLowerCase() !== batch.planHash) {
        fail('historical_import_writer_confirmed_hash_mismatch');
    }
    if (String(confirmPlanFingerprint || '').trim().toLowerCase() !==
        batch.planFingerprint) {
        fail('historical_import_writer_confirmed_fingerprint_mismatch');
    }
    const append = appendRowToSheet || require('../services/google').appendRowToSheet;
    if (typeof append !== 'function') fail('historical_import_writer_append_required');
    const ownedLedger = !writeLedger;
    const ledger = writeLedger || new FinancialWriteLedger(
        ledgerPath ? { dbPath: ledgerPath } : undefined
    );
    if (!ledger || typeof ledger.getOperation !== 'function') {
        fail('historical_import_writer_ledger_required');
    }
    const writeLimit = Number.isFinite(Number(maxNewWrites))
        ? Math.max(0, Math.floor(Number(maxNewWrites)))
        : Number.POSITIVE_INFINITY;
    let committed = 0;
    let replayed = 0;
    let reconciled = 0;
    let attempted = 0;
    let newWriteAttempts = 0;
    try {
        for (let index = 0; index < batch.items.length; index += 1) {
            const item = batch.items[index];
            const current = ledger.getOperation(item.operationKey);
            if (current?.status === 'committed') {
                replayed += 1;
                continue;
            }
            const reconcileOnly = current?.status === 'pending' ||
                current?.status === 'uncertain';
            if (!reconcileOnly && newWriteAttempts >= writeLimit) {
                return resultSnapshot({
                    status: 'partial',
                    batch,
                    committed,
                    replayed,
                    reconciled,
                    failed: 0,
                    remaining: batch.items.length - index,
                    attempted
                });
            }
            attempted += 1;
            if (!reconcileOnly) newWriteAttempts += 1;
            try {
                const writeResult = await append(
                    item.writePlan.sheet_name,
                    item.writePlan.row,
                    {
                        operationKey: item.operationKey,
                        userId: item.userId,
                        cardId: item.cardId || undefined,
                        messageId: `${batch.messageId}:${item.operationKey}`,
                        source: 'open_finance.historical_import',
                        telemetryConsumer: 'open_finance_historical_import',
                        requireUserScoped: true,
                        reconcileOnly,
                        allowNonIdempotentRetry: false,
                        writeLedger: ledger,
                        canonicalRelation: item.writePlan.canonical_relation || null
                    }
                );
                if (writeResult?.status !== 'committed') {
                    const error = new Error('historical_import_writer_result_uncertain');
                    error.code = 'FINANCIAL_WRITE_UNCERTAIN';
                    throw error;
                }
                if (reconcileOnly) reconciled += 1;
                else committed += 1;
                if (typeof onProgress === 'function') {
                    onProgress({
                        completed: committed + replayed + reconciled,
                        total: batch.items.length,
                        financial_writes: committed
                    });
                }
            } catch (error) {
                return resultSnapshot({
                    status: 'stopped',
                    batch,
                    committed,
                    replayed,
                    reconciled,
                    failed: 1,
                    remaining: batch.items.length - index - 1,
                    attempted,
                    failureCode: String(error?.code || 'write_failed')
                        .replace(/[^A-Z0-9_]/gi, '_')
                        .slice(0, 80)
                });
            }
        }
        return resultSnapshot({
            status: 'committed',
            batch,
            committed,
            replayed,
            reconciled,
            failed: 0,
            remaining: 0,
            attempted
        });
    } finally {
        if (ownedLedger) ledger.close();
    }
}

module.exports = {
    buildOpenFinanceHistoricalImportWriteBatch,
    executeOpenFinanceHistoricalImportWriteBatch,
    __test__: {
        stableSerialize,
        hashHistoricalPlan,
        fingerprintHistoricalPlan,
        validateHistoricalImportPlan
    }
};
