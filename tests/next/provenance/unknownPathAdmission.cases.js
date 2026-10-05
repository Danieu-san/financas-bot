'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
const { materializeUnknownPredicatePath } = require('../../../src/next/provenance/mutationWitnesses');
const { compilePredicateTypes, readPredicateTypeDiagnostic } = require('../../../src/next/provenance/predicateTypes');
const prefix = 'docs/contracts/next/provenance-v2/';

test('N02G:UNKNOWN-PATH-006 every template coordinate preserves bindings and rejects only the mutated native path', async () => {
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const { validateTemplateReferences, readTemplateReferenceDiagnostic } = require('../../../src/next/provenance/templateReferences');
    const receipt = loadLocalAuthoringPackage();
    const docs = new Map(admittedDocuments(receipt).map(row => [row.path, row.value]));
    const corpus = docs.get(prefix + 'graphs-v2.json');
    const context = { templates: docs.get(prefix + 'predicate-templates-v1.json'),
        operators: docs.get(corpus.operator_registry.path).operators,
        materialRegistry: docs.get(corpus.material_registry.path),
        claims: docs.get(corpus.claim_contract.path).claims };
    let coordinates = 0;
    for (const graph of corpus.graphs) for (const predicate of graph.predicates)
        for (let operand_index = 0; operand_index < predicate.args.length; operand_index++) {
            const original = predicate.args[operand_index];
            if (!original.template) continue;
            const names = Object.keys(original.bindings).filter(name => original.bindings[name].selector).sort();
            assert.ok(names.length > 0);
            const binding_name = names[0];
            const expectedDiagnostic = Object.freeze({ checker: 'template_references', code: 'binding_field',
                fact_key: graph.fact_key, predicate_id: predicate.id, operand_index, binding_name });
            const generated = materializeUnknownPredicatePath({ packageReceipt: receipt, fact_key: graph.fact_key,
                predicate_id: predicate.id, operand_index });
            const expected = structuredClone(graph);
            const location = ['bindings', binding_name, 'selector', 'segments'];
            const after = [...original.bindings[binding_name].selector.segments.slice(0, -1),
                'unknown_' + generated.mutation_id.slice(7, 23)];
            expected.predicates.find(row => row.id === predicate.id).args[operand_index]
                .bindings[binding_name].selector.segments = after;
            assert.deepEqual(generated.graph, expected);
            assert.deepEqual(generated.patch.location, location);
            assert.equal(validateTemplateReferences({ ...context, graphs: [graph] }).stage, 'template_references_checked_only');
            let error;
            try { validateTemplateReferences({ ...context, graphs: [generated.graph] }); } catch (caught) { error = caught; }
            assert.ok(error);
            assert.deepEqual(readTemplateReferenceDiagnostic(error), expectedDiagnostic);
            assert.equal(readTemplateReferenceDiagnostic(new Error(error.message)), null);
            assert.notDeepEqual(readTemplateReferenceDiagnostic(error), { ...expectedDiagnostic, operand_index: operand_index + 1 });
            assert.deepEqual(generated.graph.predicates.find(row => row.id === predicate.id).args[operand_index].template, original.template);
            assert.equal(generated.semantic_mutation_credit, 0);
            coordinates++;
        }
    assert.equal(coordinates, 28);
});

test('N02G:UNKNOWN-PATH-001 path negatives preserve the operand form and expose an authentic coordinate diagnostic', async () => {
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const receipt = loadLocalAuthoringPackage();
    const docs = new Map(admittedDocuments(receipt).map(row => [row.path, row.value]));
    const corpus = docs.get(prefix + 'graphs-v2.json');
    const context = { claims: docs.get(corpus.claim_contract.path).claims,
        snapshots: docs.get(corpus.snapshot_manifest.path).snapshots,
        materialRegistry: docs.get(corpus.material_registry.path),
        operatorRegistry: docs.get(corpus.operator_registry.path),
        claimSchema: docs.get(prefix + 'claim-contract.schema.json') };
    const original = corpus.graphs.find(row => row.fact_key === 'F-01#1#1');
    const target = original.predicates.find(row => row.args.some(arg => arg.field));
    const operand_index = target.args.findIndex(arg => arg.field);
    const request = { packageReceipt: receipt, fact_key: original.fact_key, predicate_id: target.id, operand_index };
    const generated = materializeUnknownPredicatePath(request);
    const expected = structuredClone(original);
    expected.predicates.find(row => row.id === target.id).args[operand_index].field.segments = generated.patch.after;
    assert.deepEqual(generated.graph, expected);
    assert.deepEqual(materializeUnknownPredicatePath(request), generated);
    assert.equal(generated.dp_execution, false);
    assert.equal(generated.semantic_mutation_credit, 0);
    assert.equal(Object.hasOwn(generated, 'expected_violations'), false);
    assert.equal(compilePredicateTypes({ ...context, graphs: [original] }).unresolved, 0);
    let observed;
    try { compilePredicateTypes({ ...context, graphs: [generated.graph] }); } catch (error) { observed = error; }
    assert.ok(observed);
    assert.deepEqual(readPredicateTypeDiagnostic(observed), {
        checker: 'predicate_types', code: 'field_material', fact_key: original.fact_key,
        predicate_id: target.id, operand_index });
    assert.equal(readPredicateTypeDiagnostic(new Error(observed.message)), null);
    assert.equal(readPredicateTypeDiagnostic({ message: observed.message, code: 'field_material' }), null);
    assert.deepEqual(corpus.graphs.find(row => row.fact_key === original.fact_key), original);
    const literal = original.predicates.find(row => row.args.some(arg => arg.literal));
    assert.throws(() => materializeUnknownPredicatePath({ ...request, predicate_id: literal.id,
        operand_index: literal.args.findIndex(arg => arg.literal) }), /unknown_path_form/);
    let effects = 0;
    const active = { ...request };
    Object.defineProperty(active, 'packageReceipt', { enumerable: true, get() { effects++; return receipt; } });
    assert.throws(() => materializeUnknownPredicatePath(active));
    assert.throws(() => materializeUnknownPredicatePath(new Proxy(request, { ownKeys() { effects++; return []; } })));
    assert.throws(() => materializeUnknownPredicatePath({ ...request, packageReceipt: { ...receipt } }));
    assert.equal(effects, 0);
});

test('N02G:UNKNOWN-PATH-002 each supported path form has its own diagnostic and restore control', async () => {
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const receipt = loadLocalAuthoringPackage();
    const docs = new Map(admittedDocuments(receipt).map(row => [row.path, row.value]));
    const corpus = docs.get(prefix + 'graphs-v2.json');
    const context = { claims: docs.get(corpus.claim_contract.path).claims,
        snapshots: docs.get(corpus.snapshot_manifest.path).snapshots,
        materialRegistry: docs.get(corpus.material_registry.path),
        operatorRegistry: docs.get(corpus.operator_registry.path),
        claimSchema: docs.get(prefix + 'claim-contract.schema.json') };
    for (const form of ['field', 'claim', 'presence', 'selector', 'ref_set']) {
        let coordinate;
        for (const graph of corpus.graphs) {
            const predicate = graph.predicates.find(row => row.args.some(arg => form === 'ref_set' ? arg.ref_set?.field : arg[form]));
            if (predicate) { coordinate = { graph, predicate, index: predicate.args.findIndex(arg => form === 'ref_set' ? arg.ref_set?.field : arg[form]) }; break; }
        }
        assert.ok(coordinate, form);
        const { graph, predicate, index } = coordinate;
        const generated = materializeUnknownPredicatePath({ packageReceipt: receipt, fact_key: graph.fact_key,
            predicate_id: predicate.id, operand_index: index });
        let error;
        try { compilePredicateTypes({ ...context, graphs: [generated.graph] }); } catch (caught) { error = caught; }
        assert.deepEqual(readPredicateTypeDiagnostic(error), { checker: 'predicate_types',
            code: form === 'claim' ? 'claim_path' : 'field_material',
            fact_key: graph.fact_key, predicate_id: predicate.id, operand_index: index }, form);
        assert.equal(compilePredicateTypes({ ...context, graphs: [graph] }).unresolved, 0, 'restore ' + form);
        const wrong = { ...readPredicateTypeDiagnostic(error), operand_index: index + 1 };
        assert.notDeepEqual(readPredicateTypeDiagnostic(error), wrong);
    }
});

test('N02G:UNKNOWN-PATH-003 scoped matrix rejects active and forged receipt verdicts', async () => {
    const { executeUnknownPathAdmissionMatrix } = await import('../../../scripts/agent/executeUnknownPathAdmissionMatrix.mjs');
    let effects = 0;
    const active = {};
    Object.defineProperty(active, 'documents', { enumerable: true, get() { effects++; throw new Error('effect'); } });
    const proxy = new Proxy({}, { get() { effects++; throw new Error('effect'); }, ownKeys() { effects++; throw new Error('effect'); } });
    for (const receipt of [{}, active, proxy, { valid: true, matched: true, expected: 0 }])
        assert.throws(() => executeUnknownPathAdmissionMatrix(receipt));
    assert.equal(effects, 0);
});

test('N02G:UNKNOWN-PATH-004 unknown references preserve their namespace and hit the owning operand', async () => {
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const receipt = loadLocalAuthoringPackage();
    const docs = new Map(admittedDocuments(receipt).map(row => [row.path, row.value]));
    const corpus = docs.get(prefix + 'graphs-v2.json');
    const context = { claims: docs.get(corpus.claim_contract.path).claims,
        snapshots: docs.get(corpus.snapshot_manifest.path).snapshots,
        materialRegistry: docs.get(corpus.material_registry.path),
        operatorRegistry: docs.get(corpus.operator_registry.path),
        claimSchema: docs.get(prefix + 'claim-contract.schema.json') };
    for (const form of ['node', 'edge', 'set', 'period_ref', 'period_bound']) {
        let coordinate;
        for (const graph of corpus.graphs) {
            const predicate = graph.predicates.find(row => row.args.some(arg => Object.hasOwn(arg, form)));
            if (predicate) { coordinate = { graph, predicate, index: predicate.args.findIndex(arg => Object.hasOwn(arg, form)) }; break; }
        }
        assert.ok(coordinate);
        const { graph, predicate, index } = coordinate;
        const generated = materializeUnknownPredicatePath({ packageReceipt: receipt,
            fact_key: graph.fact_key, predicate_id: predicate.id, operand_index: index });
        const changed = generated.graph.predicates.find(row => row.id === predicate.id).args[index];
        assert.deepEqual(Object.keys(changed), Object.keys(predicate.args[index]));
        if (form === 'period_bound') assert.equal(changed.period_bound.bound, predicate.args[index].period_bound.bound);
        let error;
        try { compilePredicateTypes({ ...context, graphs: [generated.graph] }); } catch (caught) { error = caught; }
        const code = form === 'node' ? 'node_missing' : form === 'edge' ? 'edge_missing'
            : form === 'set' ? ['set_eq', 'set_subset'].includes(predicate.op) ? 'set_missing' : 'set_kind_unresolved'
            : 'window_missing';
        assert.deepEqual(readPredicateTypeDiagnostic(error), { checker: 'predicate_types', code,
            fact_key: graph.fact_key, predicate_id: predicate.id, operand_index: index }, form);
        assert.equal(compilePredicateTypes({ ...context, graphs: [graph] }).unresolved, 0);
        assert.equal(readPredicateTypeDiagnostic(new Error(error.message)), null);
    }
});

test('N02G:UNKNOWN-PATH-005 template set inference attributes the absent set to its own operand', async () => {
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const receipt = loadLocalAuthoringPackage();
    const docs = new Map(admittedDocuments(receipt).map(row => [row.path, row.value]));
    const corpus = docs.get(prefix + 'graphs-v2.json');
    const graph = corpus.graphs.find(row => row.fact_key === 'S-05#1#1');
    const predicate = graph.predicates.find(row => row.id === 'r0006_outside_window');
    const index = predicate.args.findIndex(arg => arg.set);
    assert.ok(predicate.args.some(arg => arg.template && Object.values(arg.bindings).some(binding => binding.selector)));
    const generated = materializeUnknownPredicatePath({ packageReceipt: receipt, fact_key: graph.fact_key,
        predicate_id: predicate.id, operand_index: index });
    const context = { claims: docs.get(corpus.claim_contract.path).claims,
        snapshots: docs.get(corpus.snapshot_manifest.path).snapshots,
        materialRegistry: docs.get(corpus.material_registry.path),
        operatorRegistry: docs.get(corpus.operator_registry.path),
        claimSchema: docs.get(prefix + 'claim-contract.schema.json') };
    let error;
    try { compilePredicateTypes({ ...context, graphs: [generated.graph] }); } catch (caught) { error = caught; }
    assert.deepEqual(readPredicateTypeDiagnostic(error), { checker: 'predicate_types', code: 'set_missing',
        fact_key: graph.fact_key, predicate_id: predicate.id, operand_index: index });
    assert.equal(compilePredicateTypes({ ...context, graphs: [graph] }).unresolved, 0);
});
