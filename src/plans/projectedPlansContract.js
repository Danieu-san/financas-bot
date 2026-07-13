const crypto = require('crypto');

const PLAN_SCHEMA_VERSION = 'projected-plan-v1';
const PLAN_MOVEMENT_SCHEMA_VERSION = 'projected-plan-movement-v1';
const PROJECTED_PLANS_SCHEMA_VERSION = 'projected-plans-v1';
const PROJECTED_PLANS_BACKUP_VERSION = 'projected-plans-backup-v1';

const GOAL_HEADERS = Object.freeze([
    'Nome da Meta', 'Valor Alvo', 'Valor Atual', '% Progresso', 'Valor Mensal Sugerido',
    'Data Alvo', 'Status', 'Prioridade', 'user_id', 'Escopo', 'Última Movimentação'
]);
const DEBT_HEADERS = Object.freeze([
    'Nome da Dívida', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Valor da Parcela',
    'Taxa de Juros', 'Dia de Vencimento', 'Data de Início', 'Total de Parcelas',
    'Parcelas Pagas', 'Status', 'Observações', '% Quitado', 'Último Pagamento',
    'Próximo Vencimento', 'Estratégia', 'user_id'
]);
const GOAL_MOVEMENT_HEADERS = Object.freeze([
    'Data', 'Meta', 'Tipo', 'Valor', 'Valor Antes', 'Valor Depois',
    'Observação', 'Responsável', 'user_id', 'goal_user_id'
]);

function normalizeText(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
    }, {});
}

function stableStringify(value) {
    return JSON.stringify(stableValue(value));
}

function hash(value, length = 24) {
    return crypto.createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, length);
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function parseDecimal(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    let normalized = raw.replace(/R\$/gi, '').replace(/\s+/g, '').replace(/%/g, '');
    const comma = normalized.lastIndexOf(',');
    const dot = normalized.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) {
        normalized = comma > dot
            ? normalized.replace(/\./g, '').replace(',', '.')
            : normalized.replace(/,/g, '');
    } else if (comma >= 0) {
        normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else if ((normalized.match(/\./g) || []).length > 1) {
        normalized = normalized.replace(/\./g, '');
    }
    if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function moneyToCents(value) {
    const parsed = parseDecimal(value);
    return parsed === null ? null : Math.round((parsed + Number.EPSILON) * 100);
}

function integerOrNull(value) {
    const parsed = parseDecimal(value);
    return parsed === null ? null : Math.trunc(parsed);
}

function percentageToBasisPoints(value) {
    const numericToken = typeof value === 'string'
        ? value.match(/-?\d+(?:[.,]\d+)?/)?.[0]
        : value;
    const parsed = parseDecimal(numericToken);
    return parsed === null ? null : Math.round((parsed + Number.EPSILON) * 100);
}

function normalizeDate(value) {
    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
    }
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    let year;
    let month;
    let day;
    let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
        [, year, month, day] = match;
    } else {
        match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
        if (!match) return null;
        [, day, month, year] = match;
    }
    const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const parsed = new Date(`${iso}T12:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

function competenceMonth(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date).slice(0, 7) : null;
}

function headerIndex(headers, aliases, fallback = -1) {
    const accepted = new Set(aliases.map(normalizeText));
    const found = (headers || []).findIndex(item => accepted.has(normalizeText(item)));
    if (found >= 0) return found;
    return Array.isArray(headers) && headers.length > 0 ? -1 : fallback;
}

function cell(row, headers, aliases, fallback = -1) {
    const index = headerIndex(headers, aliases, fallback);
    return index >= 0 ? row?.[index] : undefined;
}

function legacyIdentity({ sourceType, legacyRef, rowIndex, householdId, ownerUserId, planId }) {
    const explicitRef = String(legacyRef || '').trim();
    const effectiveRef = explicitRef || `${sourceType}:row:${Number(rowIndex || 0) || 'unknown'}`;
    return {
        id: String(planId || '').trim() || `plan_${hash({ sourceType, legacyRef: effectiveRef, householdId, ownerUserId })}`,
        ref: effectiveRef,
        status: explicitRef ? 'stable' : 'provisional'
    };
}

function normalizePlanStatus(value, type) {
    const status = normalizeText(value);
    if (status.includes('cancel')) return 'cancelled';
    if (status.includes('paus')) return 'paused';
    if (status.includes('quit') || status.includes('conclu') || status.includes('finaliz') || status.includes('atingid')) return 'completed';
    if (!status && type !== 'goal') return 'partial';
    return 'active';
}

function normalizeScope(value) {
    const scope = normalizeText(value);
    return scope === 'family' || scope === 'familia' || scope === 'familiar' ? 'family' : 'personal';
}

function normalizeDebtType(value) {
    const type = normalizeText(value);
    if (type.includes('financi')) return 'financing';
    if (type.includes('consor')) return 'consortium';
    return 'debt';
}

function interestPeriod(value) {
    const raw = normalizeText(value);
    if (!raw) return null;
    if (/a\.?\s*m\.?|mensal|mes/.test(raw)) return 'monthly';
    if (/a\.?\s*a\.?|anual|ano/.test(raw)) return 'annual';
    if (/diari|dia/.test(raw)) return 'daily';
    return null;
}

function amortizationMethod(value) {
    const raw = normalizeText(value);
    if (/\bsac\b/.test(raw)) return 'SAC';
    if (/\bprice\b|frances/.test(raw)) return 'PRICE';
    return null;
}

function basePlan({ identity, version, householdId, ownerUserId, name, type, scope, status, amounts, terms, sourceType, sourceStatus, metadata }) {
    return {
        schema_version: PLAN_SCHEMA_VERSION,
        plan_id: identity.id,
        version: Number(version || 1),
        type,
        scope,
        status,
        name: String(name || '').trim(),
        currency: 'BRL',
        household_id: String(householdId || '').trim() || null,
        owner_user_id: String(ownerUserId || '').trim() || null,
        amounts,
        terms,
        source: {
            type: sourceType,
            legacy_ref: identity.ref,
            identity_status: identity.status,
            data_status: sourceStatus,
            adapter_version: PROJECTED_PLANS_SCHEMA_VERSION
        },
        permissions: {
            mutation_policy: scope === 'family' ? 'household_members' : 'owner_only',
            requires_joint_confirmation: false
        },
        metadata
    };
}

function adaptLegacyGoalRow({ row = [], headers = GOAL_HEADERS, rowIndex = 0, legacyRef = '', householdId = '', planId = '', version = 1 } = {}) {
    const name = cell(row, headers, ['Nome da Meta', 'Nome'], 0);
    const ownerUserId = cell(row, headers, ['user_id'], 8);
    const identity = legacyIdentity({ sourceType: 'sheet.metas', legacyRef, rowIndex, householdId, ownerUserId, planId });
    const sourceStatus = String(name || '').trim() && String(ownerUserId || '').trim() ? 'available' : 'partial';
    return basePlan({
        identity,
        version,
        householdId,
        ownerUserId,
        name,
        type: 'goal',
        scope: normalizeScope(cell(row, headers, ['Escopo'], 9)),
        status: normalizePlanStatus(cell(row, headers, ['Status'], 6), 'goal'),
        amounts: {
            target_cents: moneyToCents(cell(row, headers, ['Valor Alvo', 'Alvo'], 1)),
            current_cents: moneyToCents(cell(row, headers, ['Valor Atual', 'Atual'], 2)),
            scheduled_contribution_cents: moneyToCents(cell(row, headers, ['Valor Mensal Sugerido', 'Valor Mensal', 'Valor Mensal Necessário'], 4)),
            principal_cents: null,
            outstanding_cents: null,
            installment_cents: null
        },
        terms: {
            target_on: normalizeDate(cell(row, headers, ['Data Alvo', 'Data Fim', 'Prazo'], 5)),
            start_on: null,
            next_due_on: null,
            due_day: null,
            term_months: null,
            interest_rate_basis_points: null,
            interest_period: null,
            amortization_method: null
        },
        sourceType: 'sheet.metas',
        sourceStatus,
        metadata: {
            priority: String(cell(row, headers, ['Prioridade'], 7) || '').trim() || null,
            last_movement_on: normalizeDate(cell(row, headers, ['Última Movimentação', 'Ultima Movimentacao'], 10))
        }
    });
}

function adaptLegacyDebtRow({ row = [], headers = DEBT_HEADERS, rowIndex = 0, legacyRef = '', householdId = '', planId = '', version = 1 } = {}) {
    const name = cell(row, headers, ['Nome da Dívida', 'Nome'], 0);
    const ownerUserId = cell(row, headers, ['user_id'], 17);
    const type = normalizeDebtType(cell(row, headers, ['Tipo', 'Tipo de Dívida'], 2));
    const identity = legacyIdentity({ sourceType: 'sheet.dividas', legacyRef, rowIndex, householdId, ownerUserId, planId });
    const sourceStatus = String(name || '').trim() && String(ownerUserId || '').trim() ? 'available' : 'partial';
    const rawInterest = cell(row, headers, ['Taxa de Juros', 'Juros', 'Taxa'], 6);
    const strategy = cell(row, headers, ['Estratégia', 'Estrategia'], 16);
    return basePlan({
        identity,
        version,
        householdId,
        ownerUserId,
        name,
        type,
        scope: 'personal',
        status: normalizePlanStatus(cell(row, headers, ['Status'], 11), type),
        amounts: {
            target_cents: null,
            current_cents: null,
            scheduled_contribution_cents: null,
            principal_cents: moneyToCents(cell(row, headers, ['Valor Original'], 3)),
            outstanding_cents: moneyToCents(cell(row, headers, ['Saldo Atual', 'Saldo Devedor'], 4)),
            installment_cents: moneyToCents(cell(row, headers, ['Valor da Parcela', 'Parcela'], 5))
        },
        terms: {
            target_on: null,
            start_on: normalizeDate(cell(row, headers, ['Data de Início', 'Data de Inicio', 'Início', 'Inicio'], 8)),
            next_due_on: normalizeDate(cell(row, headers, ['Próximo Vencimento', 'Proximo Vencimento'], 15)),
            due_day: integerOrNull(cell(row, headers, ['Dia de Vencimento', 'Vencimento'], 7)),
            term_months: integerOrNull(cell(row, headers, ['Total de Parcelas', 'Total Parcelas'], 9)),
            interest_rate_basis_points: percentageToBasisPoints(rawInterest),
            interest_period: interestPeriod(rawInterest),
            amortization_method: amortizationMethod(strategy)
        },
        sourceType: 'sheet.dividas',
        sourceStatus,
        metadata: {
            creditor: String(cell(row, headers, ['Credor'], 1) || '').trim() || null,
            installments_paid: integerOrNull(cell(row, headers, ['Parcelas Pagas'], 10)),
            strategy: String(strategy || '').trim() || null,
            last_payment_on: normalizeDate(cell(row, headers, ['Último Pagamento', 'Ultimo Pagamento'], 14))
        }
    });
}

function movementType(value) {
    const type = normalizeText(value);
    if (type.includes('estorno') || type.includes('revers')) return 'reversal';
    if (type.includes('retirada') || type.includes('resgate')) return 'withdrawal';
    if (type.includes('ajuste')) return 'adjustment';
    if (type.includes('status')) return 'status_change';
    return 'contribution';
}

function adaptLegacyGoalMovementRow({ row = [], headers = GOAL_MOVEMENT_HEADERS, rowIndex = 0, legacyRef = '', plan } = {}) {
    if (!plan?.plan_id) throw new Error('plan_required_for_legacy_movement');
    const explicitRef = String(legacyRef || '').trim();
    const effectiveRef = explicitRef || `sheet.movimentacoes_metas:row:${Number(rowIndex || 0) || 'unknown'}`;
    const date = normalizeDate(cell(row, headers, ['Data'], 0));
    const type = movementType(cell(row, headers, ['Tipo'], 2));
    const amountCents = moneyToCents(cell(row, headers, ['Valor'], 3));
    const movementId = `movement_${hash({ planId: plan.plan_id, legacyRef: effectiveRef, sourceType: 'sheet.movimentacoes_metas' })}`;
    return {
        schema_version: PLAN_MOVEMENT_SCHEMA_VERSION,
        movement_id: movementId,
        plan_id: plan.plan_id,
        operation_key: `legacy_${hash({ movementId, effectiveRef }, 32)}`,
        type,
        state: 'realized',
        status: 'committed',
        amount_cents: amountCents,
        balance_before_cents: moneyToCents(cell(row, headers, ['Valor Antes'], 4)),
        balance_after_cents: moneyToCents(cell(row, headers, ['Valor Depois'], 5)),
        occurred_on: date,
        effective_on: date,
        competence_month: competenceMonth(date),
        actor_user_id: String(cell(row, headers, ['user_id'], 8) || '').trim() || null,
        reverses_movement_id: null,
        source: {
            type: 'sheet.movimentacoes_metas',
            legacy_ref: effectiveRef,
            identity_status: explicitRef ? 'stable' : 'provisional',
            data_status: date && (amountCents !== null || type === 'status_change') ? 'available' : 'partial'
        },
        metadata: {
            note: String(cell(row, headers, ['Observação', 'Observacao'], 6) || '').trim() || null,
            responsible: String(cell(row, headers, ['Responsável', 'Responsavel'], 7) || '').trim() || null
        }
    };
}

function goalMovementMatchKey(name, ownerUserId) {
    return `${normalizeText(ownerUserId)}::${normalizeText(name)}`;
}

function projectLegacyPlans({ householdId = '', goals = [], debts = [], goalMovements = [] } = {}) {
    const issues = [];
    const plans = [];
    for (const entry of goals) {
        try {
            plans.push(adaptLegacyGoalRow({ householdId, ...entry }));
        } catch (error) {
            issues.push({ code: 'invalid_legacy_goal', row_index: Number(entry?.rowIndex || 0) || null });
        }
    }
    for (const entry of debts) {
        try {
            plans.push(adaptLegacyDebtRow({ householdId, ...entry }));
        } catch (error) {
            issues.push({ code: 'invalid_legacy_debt', row_index: Number(entry?.rowIndex || 0) || null });
        }
    }

    const goalIndex = new Map();
    for (const plan of plans.filter(item => item.type === 'goal')) {
        const key = goalMovementMatchKey(plan.name, plan.owner_user_id);
        if (!goalIndex.has(key)) goalIndex.set(key, []);
        goalIndex.get(key).push(plan);
    }

    const planMovements = [];
    for (const entry of goalMovements) {
        const headers = entry?.headers || GOAL_MOVEMENT_HEADERS;
        const row = entry?.row || [];
        const name = cell(row, headers, ['Meta'], 1);
        const ownerUserId = cell(row, headers, ['goal_user_id'], 9) || cell(row, headers, ['user_id'], 8);
        const matches = goalIndex.get(goalMovementMatchKey(name, ownerUserId)) || [];
        if (matches.length !== 1) {
            issues.push({
                code: matches.length > 1 ? 'ambiguous_legacy_plan_match' : 'legacy_plan_match_not_found',
                movement_row_index: Number(entry?.rowIndex || 0) || null,
                plan_name: String(name || '').trim() || null
            });
            continue;
        }
        try {
            planMovements.push(adaptLegacyGoalMovementRow({ ...entry, plan: matches[0] }));
        } catch (error) {
            issues.push({ code: 'invalid_legacy_plan_movement', movement_row_index: Number(entry?.rowIndex || 0) || null });
        }
    }

    plans.sort((left, right) => left.plan_id.localeCompare(right.plan_id));
    planMovements.sort((left, right) => left.movement_id.localeCompare(right.movement_id));
    return {
        schema_version: PROJECTED_PLANS_SCHEMA_VERSION,
        plans,
        plan_movements: planMovements,
        issues,
        stats: {
            plan_count: plans.length,
            movement_count: planMovements.length,
            issue_count: issues.length
        }
    };
}

function sheetEntries(rows, headers, rowType, sourceType = '', identityBindings = new Map()) {
    if (!Array.isArray(rows) || rows.length <= 1) return [];
    const effectiveHeaders = Array.isArray(rows[0]) && rows[0].length ? rows[0] : headers;
    return rows.slice(1)
        .map((row, offset) => {
            const rowIndex = offset + 2;
            const ref = `${sourceType}:row:${rowIndex}`;
            const binding = identityBindings instanceof Map ? identityBindings.get(ref) : identityBindings?.[ref];
            return {
                row,
                headers: effectiveHeaders,
                rowIndex,
                rowType,
                ...(binding?.planId ? { legacyRef: ref, planId: binding.planId } : {})
            };
        })
        .filter(entry => Array.isArray(entry.row) && entry.row.some(value => String(value ?? '').trim() !== ''));
}

function projectLegacyPlanSheets({ householdId = '', metasData = [], dividasData = [], movimentacoesMetasData = [], identityBindings = new Map() } = {}) {
    return projectLegacyPlans({
        householdId,
        goals: sheetEntries(metasData, GOAL_HEADERS, 'goal', 'sheet.metas', identityBindings),
        debts: sheetEntries(dividasData, DEBT_HEADERS, 'debt', 'sheet.dividas', identityBindings),
        goalMovements: sheetEntries(movimentacoesMetasData, GOAL_MOVEMENT_HEADERS, 'goal_movement', 'sheet.movimentacoes_metas')
    });
}

function assertCents(value, field, { nullable = true } = {}) {
    if (value === null && nullable) return;
    if (!Number.isSafeInteger(value)) throw new Error(`invalid_cents:${field}`);
}

function assertProjectedPlans(projection) {
    if (projection?.schema_version !== PROJECTED_PLANS_SCHEMA_VERSION) throw new Error('invalid_projected_plans_schema');
    if (!Array.isArray(projection.plans) || !Array.isArray(projection.plan_movements)) throw new Error('invalid_projected_plans_collections');
    const planIds = new Set();
    for (const plan of projection.plans) {
        if (plan?.schema_version !== PLAN_SCHEMA_VERSION || !plan.plan_id || planIds.has(plan.plan_id)) throw new Error('invalid_or_duplicate_plan_id');
        if (!Number.isSafeInteger(plan.version) || plan.version < 1) throw new Error('invalid_plan_version');
        planIds.add(plan.plan_id);
        for (const [field, value] of Object.entries(plan.amounts || {})) assertCents(value, field);
    }
    const movementIds = new Set();
    const movementsById = new Map();
    for (const movement of projection.plan_movements) {
        if (movement?.schema_version !== PLAN_MOVEMENT_SCHEMA_VERSION || !movement.movement_id || movementIds.has(movement.movement_id)) throw new Error('invalid_or_duplicate_movement_id');
        if (!planIds.has(movement.plan_id)) throw new Error('movement_without_plan');
        if (movement.state !== 'realized') throw new Error('non_realized_movement_forbidden');
        if (movement.amount_cents === null && movement.source?.data_status !== 'partial') throw new Error('missing_movement_amount_without_partial_source');
        assertCents(movement.amount_cents, 'movement.amount_cents');
        assertCents(movement.balance_before_cents, 'movement.balance_before_cents');
        assertCents(movement.balance_after_cents, 'movement.balance_after_cents');
        movementIds.add(movement.movement_id);
        movementsById.set(movement.movement_id, movement);
    }
    const reversedIds = new Set();
    for (const movement of projection.plan_movements) {
        const targetId = String(movement.reverses_movement_id || '').trim();
        if (movement.type === 'reversal' && !targetId) throw new Error('reversal_target_required');
        if (movement.type !== 'reversal' && targetId) throw new Error('reversal_target_for_non_reversal');
        if (!targetId) continue;
        const target = movementsById.get(targetId);
        if (!target || target.plan_id !== movement.plan_id || target.type === 'reversal') throw new Error('invalid_reversal_target');
        if (reversedIds.has(targetId)) throw new Error('movement_already_reversed');
        if (target.amount_cents === null || movement.amount_cents === null) throw new Error('reversal_amount_required');
        if (movement.amount_cents !== -target.amount_cents) throw new Error('reversal_amount_mismatch');
        reversedIds.add(targetId);
    }
    return true;
}

function createProjectedPlansBackup(projection, { createdAt = new Date().toISOString() } = {}) {
    assertProjectedPlans(projection);
    const payload = deepClone(projection);
    return {
        backup_version: PROJECTED_PLANS_BACKUP_VERSION,
        created_at: String(createdAt),
        checksum: hash(payload, 64),
        payload
    };
}

function restoreProjectedPlansBackup(backup) {
    if (backup?.backup_version !== PROJECTED_PLANS_BACKUP_VERSION || !backup.payload) throw new Error('invalid_projected_plans_backup');
    if (hash(backup.payload, 64) !== backup.checksum) throw new Error('projected_plans_backup_checksum_mismatch');
    assertProjectedPlans(backup.payload);
    return deepClone(backup.payload);
}

function publicPlan(plan) {
    return {
        schema_version: plan.schema_version,
        type: plan.type,
        scope: plan.scope,
        status: plan.status,
        name: plan.name,
        currency: plan.currency,
        amounts: deepClone(plan.amounts),
        terms: deepClone(plan.terms),
        permissions: deepClone(plan.permissions || {}),
        source: {
            identity_status: plan.source?.identity_status || 'unknown',
            data_status: plan.source?.data_status || 'unavailable'
        },
        metadata: deepClone(plan.metadata || {})
    };
}

function publicMovement(movement, plansById) {
    return {
        schema_version: movement.schema_version,
        plan_name: plansById.get(movement.plan_id)?.name || null,
        type: movement.type,
        state: movement.state,
        status: movement.status,
        amount_cents: movement.amount_cents,
        balance_before_cents: movement.balance_before_cents,
        balance_after_cents: movement.balance_after_cents,
        occurred_on: movement.occurred_on,
        effective_on: movement.effective_on,
        competence_month: movement.competence_month,
        source: { data_status: movement.source?.data_status || 'unavailable' },
        metadata: { note: movement.metadata?.note || null }
    };
}

function toPublicProjectedPlansView(projection) {
    assertProjectedPlans(projection);
    const plansById = new Map(projection.plans.map(plan => [plan.plan_id, plan]));
    return {
        schema_version: projection.schema_version,
        plans: projection.plans.map(publicPlan),
        plan_movements: projection.plan_movements.map(item => publicMovement(item, plansById)),
        issues: deepClone(projection.issues || []),
        stats: deepClone(projection.stats || {})
    };
}

module.exports = {
    PLAN_SCHEMA_VERSION,
    PLAN_MOVEMENT_SCHEMA_VERSION,
    PROJECTED_PLANS_SCHEMA_VERSION,
    PROJECTED_PLANS_BACKUP_VERSION,
    adaptLegacyGoalRow,
    adaptLegacyDebtRow,
    adaptLegacyGoalMovementRow,
    projectLegacyPlans,
    projectLegacyPlanSheets,
    assertProjectedPlans,
    createProjectedPlansBackup,
    restoreProjectedPlansBackup,
    toPublicProjectedPlansView,
    __test__: {
        moneyToCents,
        normalizeDate,
        stableStringify
    }
};
