const test = require('node:test');
const assert = require('node:assert/strict');
const { extractImports, runAudit } = require('../scripts/runLegacyEntrypointAudit');

test('entrypoint audit recognizes static and literal dynamic imports', () => {
    assert.deepEqual(extractImports(`
        const a = require('./a');
        import b from './b.js';
        const c = import('./c.mjs');
    `), ['./a', './b.js', './c.mjs']);
});

test('entrypoint audit classifies quarantine candidates and requires tripwires', () => {
    const report = runAudit();
    assert.equal(report.entrypoints_covered, true);
    assert.equal(report.candidates.length, 7);
    const undo = report.candidates.find(item => item.id === 'financial_undo_service');
    const debtUpdate = report.candidates.find(item => item.id === 'debt_update_handler');
    assert.equal(undo.runtime_reachable, false);
    assert.equal(undo.test_reachable, true);
    assert.equal(debtUpdate.runtime_reachable, false);
    assert.equal(debtUpdate.decision, 'investigate_mutating');
});
