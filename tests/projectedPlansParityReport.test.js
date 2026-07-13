const test = require('node:test');
const assert = require('node:assert');

const { adaptLegacyDebtRow } = require('../src/plans/projectedPlansContract');
const { buildProjectedPlansParityReport } = require('../src/plans/projectedPlansParityReport');

const CURRENT_GOAL_HEADERS = [
    'Nome', 'Valor Alvo', 'Valor Atual', '% Progresso', 'Valor Mensal',
    'Data Fim', 'Status', 'Prioridade', 'user_id', 'Escopo', 'Última Movimentação'
];
const CURRENT_DEBT_HEADERS = [
    'Nome', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Parcela', 'Juros',
    'Vencimento', 'Início', 'Total Parcelas', 'Status', 'Responsável', 'Observações',
    '% Quitado', 'Próximo Vencimento', 'Atraso (Dias)', 'Data Prevista para Quitação', 'user_id'
];
const MOVEMENT_HEADERS = [
    'Data', 'Meta', 'Tipo', 'Valor', 'Valor Antes', 'Valor Depois',
    'Observação', 'Responsável', 'user_id', 'goal_user_id'
];

function realShapeFixture() {
    return {
        metasData: [
            CURRENT_GOAL_HEADERS,
            ['Reserva Sigilosa', '10.000,00', '1.500,25', '', '', '31/12/2027', 'Em andamento', 'Alta', 'private-user-123', 'personal', '10/07/2026']
        ],
        dividasData: [
            CURRENT_DEBT_HEADERS,
            ['Financiamento Privado', 'Banco Confidencial', 'Financiamento', '250.000,00', '198.765,43', '2.150,00', '1,5', '10', '01/02/2024', '240', 'Em dia', 'Pessoa Privada', 'Nota secreta', '', '10/08/2026', '', '01/02/2044', 'private-user-123']
        ],
        movimentacoesMetasData: [
            MOVEMENT_HEADERS,
            ['10/07/2026', 'Reserva Sigilosa', 'Aporte', '500,25', '1.000,00', '1.500,25', 'Nota privada', 'Pessoa Privada', 'private-user-123', 'private-user-123']
        ]
    };
}

test('5A real-shape parity is exact and sanitized while provisional identity blocks cutover', () => {
    const report = buildProjectedPlansParityReport(realShapeFixture(), {
        runId: 'PHASE5A_TEST',
        generatedAt: '2026-07-13T22:00:00.000Z'
    });

    assert.strictEqual(report.parity.decision, 'GO');
    assert.strictEqual(report.parity.mismatch_count, 0);
    assert.strictEqual(report.parity.missing_projection_count, 0);
    assert.strictEqual(report.storage.replay_idempotent, true);
    assert.strictEqual(report.storage.backup_restore_exact, true);
    assert.strictEqual(report.decision, 'NO-GO');
    assert.deepStrictEqual(report.blockers, ['provisional_identities']);
    assert.strictEqual(report.projection.provisional_identity_count, 2);
    assert.strictEqual(report.privacy.ok, true);

    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /Reserva Sigilosa|Banco Confidencial|Pessoa Privada|private-user-123|250\.000/i);
    assert.doesNotMatch(serialized, /user_id|plan_id|legacy_ref|operation_key/i);
});

test('5A current debt headers do not fall through into unrelated legacy metadata positions', () => {
    const row = realShapeFixture().dividasData[1];
    const plan = adaptLegacyDebtRow({
        headers: CURRENT_DEBT_HEADERS,
        row,
        rowIndex: 2,
        householdId: 'household-private'
    });

    assert.strictEqual(plan.metadata.strategy, null);
    assert.strictEqual(plan.metadata.last_payment_on, null);
    assert.strictEqual(plan.terms.next_due_on, '2026-08-10');
    assert.strictEqual(plan.status, 'active');
});

test('5A parity report never serializes alternate raw financial values', () => {
    const fixture = realShapeFixture();
    const originalBuilder = fixture.metasData[1][2];
    fixture.metasData[1][2] = '1.500,26';
    const report = buildProjectedPlansParityReport(fixture, { runId: 'PHASE5A_MISMATCH' });

    assert.strictEqual(report.parity.decision, 'GO');
    assert.strictEqual(report.privacy.ok, true);
    assert.doesNotMatch(JSON.stringify(report), new RegExp(originalBuilder.replace('.', '\\.')));
});

test('5A empty intermediary rows are ignored instead of becoming invented plans', () => {
    const fixture = realShapeFixture();
    fixture.metasData.splice(1, 0, []);
    fixture.dividasData.splice(1, 0, ['', '', '']);
    fixture.movimentacoesMetasData.splice(1, 0, []);
    const report = buildProjectedPlansParityReport(fixture, { runId: 'PHASE5A_EMPTY_ROWS' });

    assert.strictEqual(report.source.observed_rows.goals, 1);
    assert.strictEqual(report.source.observed_rows.debts, 1);
    assert.strictEqual(report.source.observed_rows.goal_movements, 1);
    assert.strictEqual(report.parity.decision, 'GO');
});
