const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    adaptLegacyGoalRow,
    projectLegacyPlans
} = require('../src/plans/projectedPlansContract');
const {
    ProjectedPlansStore,
    PROJECTED_PLANS_STORE_SCHEMA_VERSION
} = require('../src/plans/projectedPlansStore');

const GOAL_HEADERS = [
    'Nome da Meta', 'Valor Alvo', 'Valor Atual', '% Progresso', 'Valor Mensal Sugerido',
    'Data Alvo', 'Status', 'Prioridade', 'user_id', 'Escopo', 'Ãšltima MovimentaÃ§Ã£o'
];

const GOAL_MOVEMENT_HEADERS = [
    'Data', 'Meta', 'Tipo', 'Valor', 'Valor Antes', 'Valor Depois',
    'ObservaÃ§Ã£o', 'ResponsÃ¡vel', 'user_id', 'goal_user_id'
];

function tempStore({ writeEnabled = true } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-projected-plans-'));
    const store = new ProjectedPlansStore({
        dbPath: path.join(dir, 'projected-plans.sqlite'),
        writeEnabled,
        clock: () => '2026-07-13T21:00:00.000Z'
    });
    return {
        store,
        cleanup() {
            store.close();
            fs.rmSync(dir, { recursive: true, force: true });
        }
    };
}

function buildProjection({ legacyRef = 'sheet:metas:stable-1', name = 'Reserva', version = 1, planId = '' } = {}) {
    return projectLegacyPlans({
        householdId: 'household-a',
        goals: [{
            headers: GOAL_HEADERS,
            legacyRef,
            planId,
            version,
            row: [name, '10.000,00', '1.500,00', '', '', '31/12/2027', 'Em andamento', 'Alta', 'user-a', 'personal', '10/07/2026']
        }],
        goalMovements: [{
            headers: GOAL_MOVEMENT_HEADERS,
            legacyRef: 'sheet:movimentacoes-metas:stable-1',
            row: ['10/07/2026', name, 'Aporte', '500,00', '1.000,00', '1.500,00', '', 'Daniel', 'user-a', 'user-a']
        }]
    });
}

test('5A shadow store initializes idempotently and keeps all writes disabled by default', () => {
    const context = tempStore({ writeEnabled: false });
    try {
        assert.strictEqual(context.store.initialize(), PROJECTED_PLANS_STORE_SCHEMA_VERSION);
        assert.ok(context.store.listTables().includes('projected_plan_versions'));
        assert.ok(context.store.listTables().includes('projected_plan_identities'));
        assert.throws(() => context.store.persistProjection(buildProjection()), /writes_disabled/);
        assert.strictEqual(context.store.readProjection(), null);
    } finally {
        context.cleanup();
    }
});

test('5A shadow store persists a complete snapshot and replays it without duplicate facts', () => {
    const context = tempStore();
    try {
        const projection = buildProjection();
        const first = context.store.persistProjection(projection);
        const replay = context.store.persistProjection(JSON.parse(JSON.stringify(projection)));

        assert.strictEqual(first.replayed, false);
        assert.strictEqual(first.plans_written, 1);
        assert.strictEqual(first.movements_written, 1);
        assert.strictEqual(replay.replayed, true);
        assert.deepStrictEqual(context.store.readProjection(), projection);
        assert.strictEqual(context.store.listPlanVersions(projection.plans[0].plan_id).length, 1);
        assert.deepStrictEqual(context.store.getReadiness(), {
            total_plan_count: 1,
            provisional_identity_count: 0,
            orphaned_plan_count: 0,
            projection_issue_count: 0,
            cutover_ready: true
        });
    } finally {
        context.cleanup();
    }
});

test('5A persisted identity and idempotency survive process restart', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-projected-plans-restart-'));
    const dbPath = path.join(dir, 'projected-plans.sqlite');
    const projection = buildProjection({ legacyRef: 'sheet:metas:restart-stable' });
    let store = new ProjectedPlansStore({ dbPath, writeEnabled: true, clock: () => '2026-07-13T21:00:00.000Z' });
    try {
        store.persistProjection(projection);
        const planId = projection.plans[0].plan_id;
        store.close();

        store = new ProjectedPlansStore({ dbPath, writeEnabled: true, clock: () => '2026-07-13T21:01:00.000Z' });
        assert.deepStrictEqual(store.readProjection(), projection);
        assert.strictEqual(store.resolveLegacyIdentity({ sourceType: 'sheet.metas', legacyRef: 'sheet:metas:restart-stable' }).plan_id, planId);
        assert.strictEqual(store.persistProjection(projection).replayed, true);
    } finally {
        if (store.db.open) store.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('5A identity registry preserves plan id across explicit row move and rename', () => {
    const context = tempStore();
    try {
        const first = buildProjection({ legacyRef: 'sheet:metas:row-9' });
        const planId = first.plans[0].plan_id;
        context.store.persistProjection(first);

        const rebound = context.store.rebindLegacyIdentity({
            sourceType: 'sheet.metas',
            fromLegacyRef: 'sheet:metas:row-9',
            toLegacyRef: 'sheet:metas:row-10',
            planId
        });
        const moved = buildProjection({
            legacyRef: 'sheet:metas:row-10',
            name: 'Reserva da famÃ­lia',
            version: 2,
            planId: rebound.plan_id
        });
        context.store.persistProjection(moved);

        assert.strictEqual(moved.plans[0].plan_id, planId);
        assert.strictEqual(context.store.resolveLegacyIdentity({ sourceType: 'sheet.metas', legacyRef: 'sheet:metas:row-9' }).state, 'superseded');
        assert.strictEqual(context.store.resolveLegacyIdentity({ sourceType: 'sheet.metas', legacyRef: 'sheet:metas:row-10' }).plan_id, planId);
        assert.strictEqual(context.store.listPlanVersions(planId).length, 2);
        assert.strictEqual(context.store.readProjection().plans[0].name, 'Reserva da famÃ­lia');
    } finally {
        context.cleanup();
    }
});

test('5A shadow store refuses same-version mutation, version gaps and movement idempotency conflicts', () => {
    const context = tempStore();
    try {
        const projection = buildProjection();
        context.store.persistProjection(projection);

        const sameVersionMutation = JSON.parse(JSON.stringify(projection));
        sameVersionMutation.plans[0].name = 'Nome alterado sem versÃ£o';
        assert.throws(() => context.store.persistProjection(sameVersionMutation), /version_conflict/);

        const versionGap = JSON.parse(JSON.stringify(projection));
        versionGap.plans[0].version = 3;
        assert.throws(() => context.store.persistProjection(versionGap), /version_gap/);

        const movementConflict = JSON.parse(JSON.stringify(projection));
        movementConflict.plan_movements[0].amount_cents += 1;
        assert.throws(() => context.store.persistProjection(movementConflict), /idempotency_conflict/);
    } finally {
        context.cleanup();
    }
});

test('5A shadow transaction rolls back a plan version when a later movement conflicts', () => {
    const context = tempStore();
    try {
        const first = buildProjection();
        context.store.persistProjection(first);

        const conflicting = buildProjection({
            legacyRef: first.plans[0].source.legacy_ref,
            name: 'Reserva revisada',
            version: 2,
            planId: first.plans[0].plan_id
        });
        conflicting.plan_movements[0].amount_cents += 1;
        assert.throws(() => context.store.persistProjection(conflicting), /idempotency_conflict/);

        assert.strictEqual(context.store.listPlanVersions(first.plans[0].plan_id).length, 1);
        assert.deepStrictEqual(context.store.readProjection(), first);
    } finally {
        context.cleanup();
    }
});

test('5A shadow store backup restores identity history, versions and exact current projection', () => {
    const source = tempStore();
    const target = tempStore();
    try {
        const first = buildProjection({ legacyRef: 'sheet:metas:row-9' });
        const planId = first.plans[0].plan_id;
        source.store.persistProjection(first);
        source.store.rebindLegacyIdentity({
            sourceType: 'sheet.metas',
            fromLegacyRef: 'sheet:metas:row-9',
            toLegacyRef: 'sheet:metas:row-10',
            planId
        });
        const second = buildProjection({ legacyRef: 'sheet:metas:row-10', name: 'Reserva familiar', version: 2, planId });
        source.store.persistProjection(second);

        const backup = source.store.createBackup({ createdAt: '2026-07-13T21:05:00.000Z' });
        const result = target.store.restoreBackup(JSON.parse(JSON.stringify(backup)));

        assert.deepStrictEqual(result, { restored: true, plan_count: 1, movement_count: 1 });
        assert.deepStrictEqual(target.store.readProjection(), second);
        assert.deepStrictEqual(target.store.listPlanVersions(planId), source.store.listPlanVersions(planId));
        assert.strictEqual(target.store.resolveLegacyIdentity({ sourceType: 'sheet.metas', legacyRef: 'sheet:metas:row-9' }).state, 'superseded');

        const tampered = JSON.parse(JSON.stringify(backup));
        tampered.payload.plans[0].payload_checksum = 'tampered';
        assert.throws(() => target.store.restoreBackup(tampered), /checksum_mismatch/);
    } finally {
        source.cleanup();
        target.cleanup();
    }
});

test('5A readiness blocks provisional identities and unresolved projection issues', () => {
    const provisionalContext = tempStore();
    const issueContext = tempStore();
    try {
        const provisionalPlan = adaptLegacyGoalRow({
            headers: GOAL_HEADERS,
            rowIndex: 9,
            householdId: 'household-a',
            row: ['Reserva', 1000, 100, '', '', '', 'Em andamento', '', 'user-a', 'personal', '']
        });
        provisionalContext.store.persistProjection({
            schema_version: 'projected-plans-v1',
            plans: [provisionalPlan],
            plan_movements: [],
            issues: [],
            stats: { plan_count: 1, movement_count: 0, issue_count: 0 }
        });
        assert.strictEqual(provisionalContext.store.getReadiness().cutover_ready, false);
        assert.strictEqual(provisionalContext.store.getReadiness().provisional_identity_count, 1);

        const withIssue = buildProjection();
        withIssue.issues.push({ code: 'ambiguous_legacy_plan_match' });
        withIssue.stats.issue_count = 1;
        issueContext.store.persistProjection(withIssue);
        assert.strictEqual(issueContext.store.getReadiness().cutover_ready, false);
        assert.strictEqual(issueContext.store.getReadiness().projection_issue_count, 1);
    } finally {
        provisionalContext.cleanup();
        issueContext.cleanup();
    }
});
