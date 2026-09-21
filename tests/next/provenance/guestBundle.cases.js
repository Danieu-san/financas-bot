'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { validateGuestBundle } = require('../../../scripts/agent/nextProvenanceGuestProfile');
const builder = () => import(pathToFileURL(path.resolve(__dirname, '../../../scripts/agent/buildNextProvenanceArtifacts.mjs')));
const input = () => ({ entry: 'main.js', exportName: 'run', constants: ['total'], sources: [
    { path: 'main.js', source: "const { add } = require('./math'); module.exports = { run: operands => add(operands, 1) };" },
    { path: 'math.js', source: 'module.exports = { add: (a, b) => a + b };' }
] });

test('N02G:GUEST-BUNDLE-001 bundle includes complete source bytes and local import mapping deterministically', async () => {
    const { buildCommonJsGuestBundle } = await builder();
    const f = input(); const result = buildCommonJsGuestBundle(f);
    assert.equal(validateGuestBundle(result.source).stage, 'guest_grammar_only');
    for (const row of f.sources) assert.ok(result.source.includes(row.source));
    assert.deepEqual(result.imports, [{ source: 'main.js', specifier: './math', target: 'math.js' }]);
    assert.deepEqual(buildCommonJsGuestBundle({ ...f, sources: [...f.sources].reverse() }), result);
    const before = createHash('sha256').update(result.source).digest('hex');
    f.sources[1].source += '\n// changed helper bytes\n';
    assert.notEqual(createHash('sha256').update(buildCommonJsGuestBundle(f).source).digest('hex'), before);
    assert.notEqual(buildCommonJsGuestBundle({ ...input(), constants: ['category'] }).source, result.source);
});

test('N02G:GUEST-BUNDLE-002 external, dynamic, ambiguous and unaccounted source closures fail', async () => {
    const { buildCommonJsGuestBundle } = await builder();
    for (const source of ["require('node:fs')", "require(name)", "const alias = require; alias('./math')", "require?.('./math')", "import('./math.js')"]) {
        const f = input(); f.sources[0].source = source;
        assert.throws(() => buildCommonJsGuestBundle(f), /guest_bundle_/);
    }
    for (const change of [f => f.sources.pop(), f => f.sources.push({ path: 'unused.js', source: '' }),
        f => f.sources.push(f.sources[0]), f => { f.sources[0].path = '../main.js'; },
        f => { f.sources[1].source = "require('./main')"; },
        f => f.sources.push({ path: 'math', source: '' }),
        f => { f.exportName = 'constructor'; }]) {
        const f = input(); change(f); assert.throws(() => buildCommonJsGuestBundle(f), /guest_bundle_/);
    }
});

test('N02G:GUEST-BUNDLE-003 consumption bundle closes over civil, literal and reference helpers without a Node dependency', async () => {
    const { buildCommonJsGuestBundle } = await builder();
    const sources = ['metricSelection', 'civilCalendar', 'literalTypes', 'metricReferences'].map(name => ({ path: `${name}.js`,
        source: fs.readFileSync(path.resolve(__dirname, `../../../src/next/provenance/${name}.js`), 'utf8') }));
    const result = buildCommonJsGuestBundle({ sources, entry: 'metricSelection.js', exportName: 'evaluateConsumption', constants: ['total'] });
    assert.equal(validateGuestBundle(result.source).executable, false);
    // Five import edges close over four files (literalTypes is shared).
    assert.equal(result.imports.length, 5);
    assert.equal(result.sourceHashes.length, 4);
    assert.throws(() => buildCommonJsGuestBundle({ sources: sources.filter(s => s.path !== 'metricReferences.js'),
        entry: 'metricSelection.js', exportName: 'evaluateConsumption', constants: ['total'] }), /guest_bundle_/);
});

test('N02G:GUEST-BUNDLE-004 evaluator bundles include the shared reference dependency transitively', async () => {
    const { buildCommonJsGuestBundle } = await builder();
    for (const [entry, exportName, metric, composed] of [
        ['metricDirectReads', 'evaluateDirectMetric', 'due_bills_total', ['metricSelection']],
        ['metricEffects', 'evaluateEffects', 'net_consumption', ['metricSelection']],
        ['metricInstallments', 'evaluateInstallments', 'installments_projected', []]
    ]) {
        const names = [entry, ...composed, 'civilCalendar', 'literalTypes', 'metricReferences'];
        const sources = names.map(name => ({ path: `${name}.js`,
            source: fs.readFileSync(path.resolve(__dirname, `../../../src/next/provenance/${name}.js`), 'utf8') }));
        const input = { sources, entry: `${entry}.js`, exportName, constants: [metric] };
        const bundle = buildCommonJsGuestBundle(input);
        assert.equal(validateGuestBundle(bundle.source).executable, false);
        assert.deepEqual(bundle.sourceHashes.map(s => s.path).sort(), names.map(n => `${n}.js`).sort());
        assert.ok(bundle.imports.some(i => i.source === `${entry}.js` && i.target === 'metricReferences.js'));
        for (const dependency of composed) assert.ok(bundle.imports.some(i => i.source === `${dependency}.js` && i.target === 'metricReferences.js'));
        assert.throws(() => buildCommonJsGuestBundle({ ...input,
            sources: sources.filter(s => s.path !== 'metricReferences.js') }), /guest_bundle_/);
    }
});
