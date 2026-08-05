'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const {
    classifyHistoricalRxInvestmentOperation,
    historicalRxInstallmentGrouping
} = require('./openFinanceHistoricalRx');

const SCHEMA_VERSION = 1;
const PAGE_SIZE = 4;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function requireSecret(secret) {
    const value = String(secret || '');
    if (value.length < 32) throw new Error('open_finance_historical_ambiguity_review_secret_required');
    return value;
}

function hmac(secret, value, length = 32) {
    return crypto.createHmac('sha256', secret)
        .update(String(value || ''))
        .digest('hex')
        .slice(0, length);
}

function historicalRef(secret, kind, value) {
    return hmac(secret, `${kind}:${String(value || '')}`);
}

function actorRef(secret, value) {
    const normalized = String(value || '').trim();
    if (!normalized) throw new Error('open_finance_historical_ambiguity_review_actor_required');
    return hmac(secret, `historical-ambiguity-actor:${normalized}`);
}

function nowIso(clock) {
    const value = new Date(clock());
    if (Number.isNaN(value.getTime())) {
        throw new Error('open_finance_historical_ambiguity_review_clock_invalid');
    }
    return value.toISOString();
}

function cleanText(value, fallback = 'Sem descrição') {
    const normalized = String(value || '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
    return normalized || fallback;
}

function normalizeReply(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function formatMoney(cents) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency: 'BRL'
    }).format(Number(cents || 0) / 100);
}

function parseDateLabel(value) {
    const text = String(value || '');
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return 'data não informada';
    return date.toISOString().slice(0, 10);
}

function sealState(state, secret) {
    const key = crypto.createHash('sha256')
        .update(`open-finance-historical-ambiguity-review:${secret}`)
        .digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from('open-finance-historical-ambiguity-review:v1'));
    const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(state), 'utf8'),
        cipher.final()
    ]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'),
        ciphertext.toString('base64url')].join('.');
}

function openState(sealedState, secret) {
    try {
        const [version, iv, tag, ciphertext, extra] = String(sealedState || '').split('.');
        if (version !== 'v1' || !iv || !tag || !ciphertext || extra !== undefined) {
            throw new Error('invalid_shape');
        }
        const key = crypto.createHash('sha256')
            .update(`open-finance-historical-ambiguity-review:${secret}`)
            .digest();
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
        decipher.setAAD(Buffer.from('open-finance-historical-ambiguity-review:v1'));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        const state = JSON.parse(Buffer.concat([
            decipher.update(Buffer.from(ciphertext, 'base64url')),
            decipher.final()
        ]).toString('utf8'));
        if (state?.schema_version !== SCHEMA_VERSION || !state.review_ref
            || !Array.isArray(state.items) || !Array.isArray(state.authorized_actor_refs)
            || !state.selected_item_refs || typeof state.selected_item_refs !== 'object'
            || Array.isArray(state.selected_item_refs)
            || !state.pages || typeof state.pages !== 'object' || Array.isArray(state.pages)
            || !['pending', 'reviewed'].includes(state.status)
            || state.financial_writes !== 0) {
            throw new Error('invalid_payload');
        }
        return state;
    } catch (error) {
        if (String(error?.message || '').startsWith('open_finance_')) throw error;
        throw new Error('open_finance_historical_ambiguity_review_state_invalid');
    }
}

function requireActor(state, secret, actorWhatsappId) {
    const ref = actorRef(secret, actorWhatsappId);
    if (!state.authorized_actor_refs.includes(ref)) {
        throw new Error('open_finance_historical_ambiguity_review_actor_unauthorized');
    }
    return ref;
}

function requireFresh(state, clock) {
    const currentTimestamp = new Date(clock()).getTime();
    if (!Number.isFinite(currentTimestamp) || !Number.isFinite(Date.parse(state.expires_at))) {
        throw new Error('open_finance_historical_ambiguity_review_state_invalid');
    }
    if (Date.parse(state.expires_at) <= currentTimestamp) {
        throw new Error('open_finance_historical_ambiguity_review_state_expired');
    }
}

function itemBySegment(items, sourceAlias, segmentRef, secret) {
    const source = items.find(item =>
        String(item?.alias_code || '').trim().toLowerCase() === sourceAlias);
    if (!source) throw new Error('open_finance_historical_ambiguity_review_source_missing');
    const account = (source.accounts || []).find(candidate =>
        historicalRef(secret, 'historical_rx_segment', `${sourceAlias}:${candidate.id}`) === segmentRef);
    if (!account) throw new Error('open_finance_historical_ambiguity_review_segment_missing');
    return { source, account };
}

function privateCandidate(transaction, secret) {
    const transactionId = String(transaction?.id || '').trim();
    if (!transactionId) throw new Error('open_finance_historical_ambiguity_review_transaction_id_required');
    const amountCents = Number(transaction.amount_cents);
    if (!Number.isSafeInteger(amountCents)) {
        throw new Error('open_finance_historical_ambiguity_review_transaction_amount_invalid');
    }
    return {
        candidate_ref: hmac(secret, `historical-ambiguity-transaction:${transactionId}`),
        description: cleanText(transaction.description),
        date: parseDateLabel(transaction.date),
        amount_cents: amountCents,
        installment_number: transaction.installment_number === undefined
            || transaction.installment_number === null
            ? null : Number(transaction.installment_number),
        total_installments: transaction.total_installments === undefined
            || transaction.total_installments === null
            ? null : Number(transaction.total_installments),
        operation_type: transaction.operation_type
            ? cleanText(transaction.operation_type, 'não informado').toUpperCase()
            : null
    };
}

function installmentChoices(candidates) {
    return [
        { code: 'distinct_rows', label: 'São lançamentos distintos' },
        ...candidates.map((candidate, index) => ({
            code: `keep_only:${candidate.candidate_ref}`,
            label: `Somente o registro ${index + 1} é válido`
        })),
        { code: 'discard_all', label: 'Nenhum dos registros é válido' }
    ];
}

function investmentChoices() {
    return [
        { code: 'reserve_application', label: 'Aplicação em reserva' },
        { code: 'reserve_redemption', label: 'Resgate de reserva' },
        { code: 'investment_income', label: 'Rendimento' },
        { code: 'not_investment_movement', label: 'Não é movimento de investimento' }
    ];
}

function isAmbiguousInvestment(transaction) {
    const operation = classifyHistoricalRxInvestmentOperation(transaction.operation_type);
    if (!operation) return false;
    const amount = Number(transaction.amount_cents);
    return operation.semantic === 'investment_related_unknown'
        || (operation.semantic === 'reserve_application' && amount >= 0)
        || (operation.semantic === 'reserve_redemption' && amount <= 0)
        || (operation.semantic === 'investment_income' && amount <= 0);
}

function derivePrivateInstallmentAmbiguities(rows, sourceAlias, accountId, secret) {
    const groups = new Map();
    for (const transaction of rows) {
        const installmentNumber = Number(transaction.installment_number);
        const totalInstallments = Number(transaction.total_installments);
        if (!Number.isInteger(installmentNumber) || !Number.isInteger(totalInstallments)
            || totalInstallments <= 1) continue;
        const grouping = historicalRxInstallmentGrouping(transaction);
        const seriesRef = historicalRef(secret, 'historical_rx_installment',
            `${sourceAlias}:${accountId}:${grouping.basis}`);
        if (!groups.has(seriesRef)) groups.set(seriesRef, new Map());
        const counts = groups.get(seriesRef);
        counts.set(installmentNumber, (counts.get(installmentNumber) || 0) + 1);
    }
    return [...groups.entries()].map(([seriesRef, counts]) => ({
        series_ref: seriesRef,
        duplicate_numbers: [...counts.entries()]
            .filter(([, count]) => count > 1)
            .map(([number]) => number)
            .sort((left, right) => left - right)
    })).filter(series => series.duplicate_numbers.length)
        .sort((left, right) => left.series_ref.localeCompare(right.series_ref));
}

function normalizeReportedInstallmentAmbiguities(series = []) {
    return series.filter(entry => entry?.identity_status === 'ambiguous_duplicate_installment_number')
        .map(entry => ({
            series_ref: String(entry.series_ref || ''),
            duplicate_numbers: [...new Set((entry.duplicate_numbers || []).map(Number))]
                .sort((left, right) => left - right)
        }))
        .sort((left, right) => left.series_ref.localeCompare(right.series_ref));
}

function buildItems({ items, historicalRx, secret }) {
    const reviewItems = [];
    const observedBlockers = new Set();
    const privateSegmentRefs = items.flatMap(source => {
        const sourceAlias = String(source?.alias_code || '').trim().toLowerCase();
        return (source.accounts || []).map(account =>
            historicalRef(secret, 'historical_rx_segment', `${sourceAlias}:${account.id}`));
    }).sort();
    const reportedSegmentRefs = (historicalRx.segments || [])
        .map(segment => String(segment?.segment_ref || '')).sort();
    if (JSON.stringify(privateSegmentRefs) !== JSON.stringify(reportedSegmentRefs)) {
        throw new Error('open_finance_historical_ambiguity_review_private_evidence_mismatch');
    }
    for (const segment of historicalRx.segments || []) {
        const sourceAlias = String(segment?.source_alias || '').trim().toLowerCase();
        const segmentRef = String(segment?.segment_ref || '');
        if (!sourceAlias || !segmentRef) {
            throw new Error('open_finance_historical_ambiguity_review_segment_invalid');
        }
        const ambiguousSeries = normalizeReportedInstallmentAmbiguities(
            segment.installments?.series || []
        );
        const investmentCount = Number(segment.investment_movements?.semantically_ambiguous_count || 0);
        const { source, account } = itemBySegment(items, sourceAlias, segmentRef, secret);
        const lowerBound = [historicalRx.history_start_date, segment.account_available_from]
            .filter(Boolean).sort().at(-1);
        const rows = (source.transactions || []).filter(transaction => {
            if (String(transaction.account_id || '') !== String(account.id || '')) return false;
            return !lowerBound || String(transaction.date || '').slice(0, 10) >= lowerBound;
        });
        const privateAmbiguousSeries = derivePrivateInstallmentAmbiguities(
            rows, sourceAlias, account.id, secret
        );
        const privateAmbiguousInvestmentRows = rows.filter(isAmbiguousInvestment);
        if (JSON.stringify(privateAmbiguousSeries) !== JSON.stringify(ambiguousSeries)
            || privateAmbiguousInvestmentRows.length !== investmentCount) {
            throw new Error('open_finance_historical_ambiguity_review_private_evidence_mismatch');
        }
        if (!ambiguousSeries.length && !investmentCount) continue;

        for (const series of ambiguousSeries) {
            observedBlockers.add(`${sourceAlias}:installment_series_ambiguous`);
            const seriesRows = rows.filter(transaction => {
                if (!Number.isInteger(Number(transaction.installment_number))
                    || !Number.isInteger(Number(transaction.total_installments))) return false;
                const grouping = historicalRxInstallmentGrouping(transaction);
                return historicalRef(secret, 'historical_rx_installment',
                    `${sourceAlias}:${account.id}:${grouping.basis}`) === series.series_ref;
            });
            for (const duplicateNumber of series.duplicate_numbers || []) {
                const candidates = seriesRows
                    .filter(transaction => Number(transaction.installment_number) === Number(duplicateNumber))
                    .map(transaction => privateCandidate(transaction, secret))
                    .sort((left, right) => left.date.localeCompare(right.date)
                        || left.candidate_ref.localeCompare(right.candidate_ref));
                if (candidates.length < 2) {
                    throw new Error('open_finance_historical_ambiguity_review_installment_evidence_missing');
                }
                const itemRef = hmac(secret,
                    `installment:${segmentRef}:${series.series_ref}:${duplicateNumber}`);
                reviewItems.push({
                    item_ref: itemRef,
                    type: 'installment_identity',
                    title: 'Parcela com identidade duplicada',
                    source_alias: sourceAlias,
                    segment_ref: segmentRef,
                    candidates,
                    choices: installmentChoices(candidates),
                    decision: null
                });
            }
        }

        if (investmentCount) {
            observedBlockers.add(`${sourceAlias}:investment_movement_semantics_ambiguous`);
            const ambiguousRows = privateAmbiguousInvestmentRows;
            if (ambiguousRows.length !== investmentCount) {
                throw new Error('open_finance_historical_ambiguity_review_investment_evidence_mismatch');
            }
            for (const transaction of ambiguousRows) {
                const candidate = privateCandidate(transaction, secret);
                reviewItems.push({
                    item_ref: hmac(secret, `investment:${segmentRef}:${candidate.candidate_ref}`),
                    type: 'investment_semantics',
                    title: 'Movimento de investimento sem natureza definida',
                    source_alias: sourceAlias,
                    segment_ref: segmentRef,
                    candidates: [candidate],
                    choices: investmentChoices(),
                    decision: null
                });
            }
        }
    }
    const declaredBlockers = new Set((historicalRx.blockers || []).filter(blocker =>
        /:(?:installment_series_ambiguous|investment_movement_semantics_ambiguous)$/.test(String(blocker))));
    if (JSON.stringify([...declaredBlockers].sort()) !== JSON.stringify([...observedBlockers].sort())) {
        throw new Error('open_finance_historical_ambiguity_review_blocker_mismatch');
    }
    return reviewItems.sort((left, right) =>
        left.type.localeCompare(right.type) || left.item_ref.localeCompare(right.item_ref));
}

function pendingItems(state) {
    return state.items.filter(item => !item.decision);
}

function formatInbox(state, prefix = '', actor = null) {
    const pending = pendingItems(state);
    if (!pending.length) {
        return `${prefix}Revisão concluída. Nenhum lançamento foi salvo.`.trim();
    }
    const pageCount = Math.max(1, Math.ceil(pending.length / PAGE_SIZE));
    const requestedPage = actor ? state.pages[actor] : 0;
    const page = Math.min(Math.max(Number(requestedPage) || 0, 0), pageCount - 1);
    if (actor) state.pages[actor] = page;
    const pageItems = pending.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const lines = [prefix, `Ambiguidades pendentes (${pending.length}):`]
        .filter(Boolean);
    pageItems.forEach((item, index) => lines.push(`${index + 1}. ${item.title}`));
    if (pageCount > 1) {
        lines.push(`Página ${page + 1} de ${pageCount}. Envie *mais* ou *anteriores* para navegar.`);
    }
    lines.push('Responda com o número do item que deseja revisar. “Sim” não resolve ambiguidades.');
    lines.push('Nada foi salvo.');
    return lines.join('\n');
}

function formatItem(item) {
    const lines = [item.title];
    item.candidates.forEach((candidate, index) => {
        const installment = candidate.installment_number === null
            ? '' : ` · parcela ${candidate.installment_number}/${candidate.total_installments}`;
        lines.push(`${index + 1}. ${candidate.date} · ${formatMoney(candidate.amount_cents)}${installment} · ${candidate.description}`);
    });
    lines.push('', 'Escolha a resolução:');
    item.choices.forEach((choice, index) => lines.push(`${index + 1}. ${choice.label}`));
    lines.push('Responda somente com o número da resolução ou *voltar*.');
    lines.push('Nada foi salvo.');
    return lines.join('\n');
}

function buildOpenFinanceHistoricalAmbiguityReview({
    items = [],
    historicalRx,
    secret,
    familyScope = 'shared-family',
    authorizedWhatsAppIds = [],
    clock = () => new Date(),
    ttlMs = DEFAULT_TTL_MS
} = {}) {
    const safeSecret = requireSecret(secret);
    if (!historicalRx || historicalRx.financial_writes !== 0) {
        throw new Error('open_finance_historical_ambiguity_review_read_only_rx_required');
    }
    if (!Array.isArray(items) || !items.length) {
        throw new Error('open_finance_historical_ambiguity_review_items_required');
    }
    const uniqueActors = [...new Set(authorizedWhatsAppIds.map(value => actorRef(safeSecret, value)))];
    if (uniqueActors.length !== 2) {
        throw new Error('open_finance_historical_ambiguity_review_family_actors_required');
    }
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000) {
        throw new Error('open_finance_historical_ambiguity_review_ttl_invalid');
    }
    const reviewItems = buildItems({ items, historicalRx, secret: safeSecret });
    if (!reviewItems.length) {
        throw new Error('open_finance_historical_ambiguity_review_supported_ambiguity_required');
    }
    const createdAt = nowIso(clock);
    const state = {
        schema_version: SCHEMA_VERSION,
        review_ref: hmac(safeSecret,
            `review:${String(familyScope || 'shared-family')}:${reviewItems.map(item => item.item_ref).join(':')}`),
        family_scope_ref: hmac(safeSecret, `family:${String(familyScope || 'shared-family')}`),
        authorized_actor_refs: uniqueActors.sort(),
        status: 'pending',
        pages: {},
        selected_item_refs: {},
        created_at: createdAt,
        updated_at: createdAt,
        expires_at: new Date(Date.parse(createdAt) + ttlMs).toISOString(),
        items: reviewItems,
        financial_writes: 0
    };
    return {
        sealed_state: sealState(state, safeSecret),
        pending_count: reviewItems.length,
        reply: formatInbox(state),
        financial_writes: 0
    };
}

function readOpenFinanceHistoricalAmbiguityReviewPrivate({
    sealedState,
    secret,
    actorWhatsappId,
    clock = () => new Date()
} = {}) {
    const safeSecret = requireSecret(secret);
    const state = openState(sealedState, safeSecret);
    requireActor(state, safeSecret, actorWhatsappId);
    requireFresh(state, clock);
    return {
        review_ref: state.review_ref,
        state: state.status,
        pending_count: pendingItems(state).length,
        decisions: state.items.filter(item => item.decision).map(item => ({
            item_ref: item.item_ref,
            type: item.type,
            resolution_code: item.decision.resolution_code,
            decided_at: item.decision.decided_at
        })),
        financial_writes: 0
    };
}

function handleOpenFinanceHistoricalAmbiguityReviewReply({
    sealedState,
    secret,
    actorWhatsappId,
    body,
    clock = () => new Date()
} = {}) {
    const safeSecret = requireSecret(secret);
    const state = openState(sealedState, safeSecret);
    const decidingActorRef = requireActor(state, safeSecret, actorWhatsappId);
    requireFresh(state, clock);
    const reply = normalizeReply(body);
    const timestamp = nowIso(clock);
    const pending = pendingItems(state);
    if (state.status === 'reviewed' || !pending.length) {
        state.status = 'reviewed';
        delete state.selected_item_refs[decidingActorRef];
        state.updated_at = timestamp;
        return {
            handled: true,
            state: 'reviewed',
            pending_count: 0,
            reply: 'Revisão concluída. Nenhum lançamento foi salvo.',
            sealed_state: sealState(state, safeSecret),
            financial_writes: 0
        };
    }

    const selectedItemRef = state.selected_item_refs[decidingActorRef] || null;
    if (!selectedItemRef) {
        const pageCount = Math.max(1, Math.ceil(pending.length / PAGE_SIZE));
        const actorPage = Math.min(
            Math.max(Number(state.pages[decidingActorRef]) || 0, 0),
            pageCount - 1
        );
        if (reply === 'mais') {
            state.pages[decidingActorRef] = Math.min(actorPage + 1, pageCount - 1);
        } else if (reply === 'anteriores') {
            state.pages[decidingActorRef] = Math.max(actorPage - 1, 0);
        } else if (/^\d+$/.test(reply)) {
            const index = Number(reply) - 1;
            const pageItems = pending.slice(actorPage * PAGE_SIZE, (actorPage + 1) * PAGE_SIZE);
            const selected = pageItems[index];
            if (selected) {
                state.selected_item_refs[decidingActorRef] = selected.item_ref;
                state.updated_at = timestamp;
                return {
                    handled: true,
                    state: 'awaiting_resolution_number',
                    pending_count: pending.length,
                    reply: formatItem(selected),
                    sealed_state: sealState(state, safeSecret),
                    financial_writes: 0
                };
            }
        }
        state.updated_at = timestamp;
        const prefix = reply === 'sim'
            ? '“Sim” não resolve ambiguidades. Escolha explicitamente um item.\n'
            : (/^\d+$/.test(reply) ? 'Esse número não está disponível nesta página.\n' : '');
        return {
            handled: true,
            state: 'awaiting_item_number',
            pending_count: pending.length,
            reply: formatInbox(state, prefix, decidingActorRef),
            sealed_state: sealState(state, safeSecret),
            financial_writes: 0
        };
    }

    const selected = state.items.find(item => item.item_ref === selectedItemRef && !item.decision);
    if (!selected) {
        delete state.selected_item_refs[decidingActorRef];
        state.updated_at = timestamp;
        return {
            handled: true,
            state: 'awaiting_item_number',
            pending_count: pending.length,
            reply: formatInbox(state,
                'Esse item já foi resolvido pelo outro membro do casal.\n', decidingActorRef),
            sealed_state: sealState(state, safeSecret),
            financial_writes: 0
        };
    }
    if (reply === 'voltar') {
        delete state.selected_item_refs[decidingActorRef];
        state.updated_at = timestamp;
        return {
            handled: true,
            state: 'awaiting_item_number',
            pending_count: pending.length,
            reply: formatInbox(state, '', decidingActorRef),
            sealed_state: sealState(state, safeSecret),
            financial_writes: 0
        };
    }
    const choice = /^\d+$/.test(reply) ? selected.choices[Number(reply) - 1] : null;
    if (!choice) {
        const prefix = reply === 'sim'
            ? '“Sim” não é uma resolução válida para uma ambiguidade.\n\n'
            : 'Escolha o número de uma resolução válida.\n\n';
        return {
            handled: true,
            state: 'awaiting_resolution_number',
            pending_count: pending.length,
            reply: `${prefix}${formatItem(selected)}`,
            sealed_state: sealState(state, safeSecret),
            financial_writes: 0
        };
    }
    selected.decision = {
        resolution_code: choice.code,
        actor_ref: decidingActorRef,
        decided_at: timestamp
    };
    delete state.selected_item_refs[decidingActorRef];
    state.pages[decidingActorRef] = 0;
    state.updated_at = timestamp;
    const remaining = pendingItems(state);
    if (!remaining.length) state.status = 'reviewed';
    const responseText = state.status === 'reviewed'
        ? 'Decisão familiar registrada. Revisão concluída. Nenhum lançamento foi salvo.'
        : formatInbox(state, 'Decisão familiar registrada.\n', decidingActorRef);
    return {
        handled: true,
        state: state.status === 'reviewed' ? 'reviewed' : 'awaiting_item_number',
        pending_count: remaining.length,
        reply: responseText,
        sealed_state: sealState(state, safeSecret),
        financial_writes: 0
    };
}

class OpenFinanceHistoricalAmbiguityReviewStore {
    constructor({
        databasePath = ':memory:',
        secret,
        familyScope = 'shared-family',
        authorizedWhatsAppIds = [],
        clock = () => new Date()
    } = {}) {
        this.secret = requireSecret(secret);
        this.databasePath = databasePath;
        this.familyScopeRef = hmac(this.secret, `family:${String(familyScope || 'shared-family')}`);
        this.authorizedActorRefs = [...new Set(
            authorizedWhatsAppIds.map(value => actorRef(this.secret, value))
        )].sort();
        if (this.authorizedActorRefs.length !== 2) {
            throw new Error('open_finance_historical_ambiguity_review_family_actors_required');
        }
        this.clock = clock;
        this.db = new Database(databasePath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS open_finance_historical_ambiguity_reviews (
                review_ref TEXT PRIMARY KEY,
                family_scope_ref TEXT NOT NULL,
                sealed_state TEXT NOT NULL,
                review_state TEXT NOT NULL,
                revision INTEGER NOT NULL,
                updated_at TEXT NOT NULL,
                state_mac TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_open_finance_historical_ambiguity_one_active_family
                ON open_finance_historical_ambiguity_reviews(family_scope_ref)
                WHERE review_state='pending';
        `);
        this.#hardenFiles();
    }

    #hardenFiles() {
        if (this.databasePath === ':memory:') return;
        for (const file of [this.databasePath, `${this.databasePath}-wal`, `${this.databasePath}-shm`]) {
            if (fs.existsSync(file)) fs.chmodSync(file, 0o600);
        }
    }

    #stateMac(row) {
        return hmac(this.secret, `historical-ambiguity-row:${JSON.stringify({
            review_ref: row.review_ref,
            family_scope_ref: row.family_scope_ref,
            sealed_state_sha256: crypto.createHash('sha256')
                .update(String(row.sealed_state || ''))
                .digest('hex'),
            review_state: row.review_state,
            revision: row.revision,
            updated_at: row.updated_at
        })}`, 64);
    }

    #assertRow(row) {
        if (!row || row.family_scope_ref !== this.familyScopeRef
            || !['pending', 'reviewed'].includes(row.review_state)
            || !Number.isSafeInteger(row.revision) || row.revision < 1
            || row.state_mac !== this.#stateMac(row)) {
            throw new Error('open_finance_historical_ambiguity_review_store_state_invalid');
        }
        const state = openState(row.sealed_state, this.secret);
        if (state.review_ref !== row.review_ref
            || state.family_scope_ref !== row.family_scope_ref
            || state.status !== row.review_state) {
            throw new Error('open_finance_historical_ambiguity_review_store_state_invalid');
        }
        this.#assertStateScope(state);
        return row;
    }

    #assertStateScope(state) {
        if (state.family_scope_ref !== this.familyScopeRef
            || JSON.stringify([...state.authorized_actor_refs].sort())
                !== JSON.stringify(this.authorizedActorRefs)) {
            throw new Error('open_finance_historical_ambiguity_review_store_scope_mismatch');
        }
    }

    #activeRow() {
        return this.db.prepare(`SELECT * FROM open_finance_historical_ambiguity_reviews
            WHERE family_scope_ref=? AND review_state='pending'
            ORDER BY updated_at DESC LIMIT 1`).get(this.familyScopeRef);
    }

    #latestRow() {
        return this.db.prepare(`SELECT * FROM open_finance_historical_ambiguity_reviews
            WHERE family_scope_ref=? ORDER BY updated_at DESC,rowid DESC LIMIT 1`).get(this.familyScopeRef);
    }

    purgeExpired() {
        const rows = this.db.prepare(`SELECT * FROM open_finance_historical_ambiguity_reviews
            WHERE family_scope_ref=? AND review_state='pending'`).all(this.familyScopeRef);
        let purged = 0;
        const currentTimestamp = new Date(this.clock()).getTime();
        if (!Number.isFinite(currentTimestamp)) {
            throw new Error('open_finance_historical_ambiguity_review_clock_invalid');
        }
        for (const row of rows) {
            this.#assertRow(row);
            const state = openState(row.sealed_state, this.secret);
            if (Date.parse(state.expires_at) > currentTimestamp) continue;
            purged += this.db.prepare(`DELETE FROM open_finance_historical_ambiguity_reviews
                WHERE review_ref=? AND revision=?`).run(row.review_ref, row.revision).changes;
        }
        this.#hardenFiles();
        return { purged, financial_writes: 0 };
    }

    prepare({ sealedState } = {}) {
        this.purgeExpired();
        const state = openState(sealedState, this.secret);
        this.#assertStateScope(state);
        requireFresh(state, this.clock);
        const existing = this.db.prepare(`SELECT * FROM open_finance_historical_ambiguity_reviews
            WHERE review_ref=?`).get(state.review_ref);
        if (existing) {
            this.#assertRow(existing);
            const existingState = openState(existing.sealed_state, this.secret);
            if (existing.sealed_state !== sealedState) {
                const sameCandidate = existingState.created_at === state.created_at
                    && existingState.expires_at === state.expires_at
                    && existingState.family_scope_ref === state.family_scope_ref
                    && JSON.stringify(existingState.authorized_actor_refs)
                        === JSON.stringify(state.authorized_actor_refs)
                    && JSON.stringify(existingState.items.map(item => item.item_ref))
                        === JSON.stringify(state.items.map(item => item.item_ref));
                if (!sameCandidate) {
                    throw new Error('open_finance_historical_ambiguity_review_store_prepare_conflict');
                }
            }
            return {
                review_ref: existingState.review_ref,
                state: existing.review_state,
                pending_count: pendingItems(existingState).length,
                reply: formatInbox(existingState),
                financial_writes: 0
            };
        }
        const timestamp = nowIso(this.clock);
        const row = {
            review_ref: state.review_ref,
            family_scope_ref: this.familyScopeRef,
            sealed_state: sealedState,
            review_state: state.status,
            revision: 1,
            updated_at: timestamp
        };
        row.state_mac = this.#stateMac(row);
        try {
            this.db.prepare(`INSERT INTO open_finance_historical_ambiguity_reviews(
                review_ref,family_scope_ref,sealed_state,review_state,revision,updated_at,state_mac
            ) VALUES (?,?,?,?,?,?,?)`).run(
                row.review_ref, row.family_scope_ref, row.sealed_state, row.review_state,
                row.revision, row.updated_at, row.state_mac
            );
        } catch (error) {
            if (String(error?.code || '').startsWith('SQLITE_CONSTRAINT')) {
                throw new Error('open_finance_historical_ambiguity_review_store_active_conflict');
            }
            throw error;
        }
        this.#hardenFiles();
        return {
            review_ref: state.review_ref,
            state: state.status,
            pending_count: pendingItems(state).length,
            reply: formatInbox(state),
            financial_writes: 0
        };
    }

    handleReply({ actorWhatsappId, body } = {}) {
        const transaction = this.db.transaction(() => {
            const row = this.#assertRow(this.#activeRow() || this.#latestRow());
            const result = handleOpenFinanceHistoricalAmbiguityReviewReply({
                sealedState: row.sealed_state,
                secret: this.secret,
                actorWhatsappId,
                body,
                clock: this.clock
            });
            const updated = {
                ...row,
                sealed_state: result.sealed_state,
                review_state: result.state === 'reviewed' ? 'reviewed' : 'pending',
                revision: row.revision + 1,
                updated_at: nowIso(this.clock)
            };
            updated.state_mac = this.#stateMac(updated);
            const write = this.db.prepare(`UPDATE open_finance_historical_ambiguity_reviews
                SET sealed_state=?,review_state=?,revision=?,updated_at=?,state_mac=?
                WHERE review_ref=? AND revision=?`).run(
                    updated.sealed_state, updated.review_state, updated.revision,
                    updated.updated_at, updated.state_mac, row.review_ref, row.revision
                );
            if (write.changes !== 1) {
                throw new Error('open_finance_historical_ambiguity_review_store_revision_conflict');
            }
            return result;
        });
        const result = transaction.immediate();
        this.#hardenFiles();
        return result;
    }

    readPrivate({ actorWhatsappId } = {}) {
        const row = this.#assertRow(this.#latestRow());
        return readOpenFinanceHistoricalAmbiguityReviewPrivate({
            sealedState: row.sealed_state,
            secret: this.secret,
            actorWhatsappId,
            clock: this.clock
        });
    }

    inspectPublicReply({ actorWhatsappId } = {}) {
        const normalizedActor = String(actorWhatsappId || '').trim();
        if (!normalizedActor) return { eligible: false, financial_writes: 0 };
        const resolvedActorRef = actorRef(this.secret, normalizedActor);
        if (!this.authorizedActorRefs.includes(resolvedActorRef)) {
            return { eligible: false, financial_writes: 0 };
        }
        this.purgeExpired();
        const row = this.#latestRow();
        if (!row) return { eligible: false, financial_writes: 0 };
        this.#assertRow(row);
        const state = openState(row.sealed_state, this.secret);
        const staleSelection = Boolean(state.selected_item_refs[resolvedActorRef]);
        return {
            eligible: state.status === 'pending' || staleSelection,
            review_ref: row.review_ref,
            actor_ref: resolvedActorRef,
            review_state: state.status,
            stale_selection: staleSelection,
            financial_writes: 0
        };
    }

    close() {
        this.#hardenFiles();
        this.db.close();
        this.#hardenFiles();
    }
}

module.exports = {
    OpenFinanceHistoricalAmbiguityReviewStore,
    buildOpenFinanceHistoricalAmbiguityReview,
    handleOpenFinanceHistoricalAmbiguityReviewReply,
    readOpenFinanceHistoricalAmbiguityReviewPrivate
};
