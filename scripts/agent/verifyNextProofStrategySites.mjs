// Independent build-time AST conformance. Never imports compiler/lowerer,
// scalar primitives or a guest and never executes emitted code.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { copyData } from '../../src/next/provenance/observationContract.js';
const { parse } = createRequire(import.meta.url)('acorn');
const fail = code => { throw new Error(`strategy_sites_${code}`); };
const q = JSON.stringify;
const digest = value => 'sha256:' + createHash('sha256').update(q(value)).digest('hex');
const sealedExpectations = new WeakMap();
function requestFields(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const descriptors = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(descriptors).length !== names.length || names.some(name =>
        !descriptors[name]?.enumerable || !Object.hasOwn(descriptors[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, descriptors[name].value]));
}
function tree(source) {
    if (typeof source !== 'string' || Buffer.byteLength(source) > 8 * 1024 * 1024) fail('source');
    try { return parse(source, { ecmaVersion: 2020 }); } catch { fail('syntax'); }
}
function clean(value) {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !['start', 'end', 'raw'].includes(key))
        .map(([key, item]) => [key, clean(item)]));
}
function visit(node, fn) {
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'string') fn(node);
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(item => visit(item, fn));
    else if (value && typeof value === 'object') visit(value, fn);
}
function sites(ast) {
    const result = new Map();
    visit(ast, node => {
        if (node.type !== 'LabeledStatement' || !/^(proof_assertion|proof_selection|derivation_guard)_/.test(node.label.name)) return;
        if (result.has(node.label.name) || node.body.type !== 'BlockStatement' || node.body.body.length !== 1) fail('duplicate_or_shape');
        result.set(node.label.name, node);
    });
    return result;
}
const label = (role, id, suffix = '') => `${role}_${Buffer.from(id, 'utf8').toString('hex')}${suffix}`;
function read(expression, type) {
    if (expression.kind === 'literal') return q(expression.value);
    if (expression.kind === 'field_presence') {
        const field = expression.field;
        if (field?.kind !== 'field_ref' || !Array.isArray(field.segments) || !field.segments.length
            || type.form !== 'scalar' || type.type !== 'boolean') fail('presence_type');
        let value = `operands.node(${q(field.alias)})`;
        for (const segment of field.segments.slice(0, -1)) value += `.get(${q(segment)})`;
        return `${value}.has(${q(field.segments.at(-1))})`;
    }
    if (['field_ref', 'claim_ref'].includes(expression.kind)) {
        let value = expression.kind === 'field_ref' ? `operands.node(${q(expression.alias)})` : 'operands.claim()';
        for (const field of expression.segments) value += `.get(${q(field)})`;
        if (['period', 'range'].includes(type.form)) value = `period(${value},true)`;
        return value;
    }
    // No guessed lowering: unsupported expression keeps the witness pending.
    fail('operand_pending');
}
function expectedStatement(predicate, op) {
    const operator = { id: op, args: ['scalar:T', 'scalar:T'], semantics: op === 'eq' ? 'typed_equal' : 'typed_unequal' };
    const operands = predicate.operands.map(item => `{type:${q(item.type)},value:${read(item.expression, item.type)}}`);
    return clean(tree(`if(!scalar(${q(operator)},[${operands.join(',')}]))all=false;`).body[0]);
}
function targetFrom(input, predicateId) {
    const predicates = input?.predicates?.filter(row => row.id === predicateId);
    if (typeof predicateId !== 'string' || predicates?.length !== 1 || predicates[0].operator.id !== 'eq'
        || predicates[0].operator.semantics !== 'typed_equal'
        || q(predicates[0].operator.args) !== q(['scalar:T', 'scalar:T'])) fail('target');
    return predicates[0];
}

export function verifyProofAssertionFault(raw) {
    const request = requestFields(raw, ['input', 'baselineSource', 'negativeSource', 'predicateId']);
    try { request.input = copyData(request.input); } catch { fail('input'); }
    return verifyFault(request, []);
}

export function verifyPhaseProofAssertionFault(raw) {
    const request = requestFields(raw, ['input', 'baselineSource', 'negativeSource', 'predicateId']);
    try { request.input = copyData(request.input); } catch { fail('input'); }
    if (Object.keys(request.input).sort().join(',') !== 'derivation,proof') fail('input');
    return verifyFault({ ...request, input: request.input.proof },
        request.input.derivation.predicates.map(row => label('derivation_guard', row.id)));
}

function inventory(input) {
    const phaseInput = input.proof ? input : { proof: input, derivation: { predicates: [] } };
    const rows = phaseInput.proof.predicates.map(row => ({ name: label('proof_assertion', row.id), predicate: row }));
    for (const [selectionIndex, selection] of (phaseInput.proof.selections ?? []).entries())
        for (const [caseIndex, item] of selection.cases.entries()) for (const id of item.predicates) {
            const predicate = phaseInput.proof.predicates.find(row => row.id === id);
            if (!predicate) fail('selection_target');
            rows.push({ name: label('proof_selection', id, `_${selectionIndex}_${caseIndex}`), predicate });
        }
    rows.push(...phaseInput.derivation.predicates.map(row => ({ name: label('derivation_guard', row.id), predicate: row })));
    if (new Set(rows.map(row => row.name)).size !== rows.length) fail('expected_duplicate');
    return rows;
}

// Seal before compiling MUTATED authorship. A receipt cannot be forged by an
// observed IR, emitted site map or caller-provided conformance verdict.
export function sealAuthoredStrategyExpectation(raw) {
    const request = requestFields(raw, ['input', 'baselineSource', 'predicateId', 'authoredPredicate']);
    let input; let authored;
    try { input = copyData(request.input); authored = copyData(request.authoredPredicate); } catch { fail('input'); }
    const proof = input.proof ?? input; const target = targetFrom(proof, request.predicateId);
    if (authored.id !== target.id || authored.op !== 'eq' || authored.args?.length !== target.operands.length) fail('authorship');
    // Independent correspondence to the original authoring grammar. No
    // emitted expression/map is consulted to determine these expectations.
    authored.args.forEach((arg, index) => {
        const operand = target.operands[index]; let expression;
        if (arg.field) expression = { kind: 'field_ref', alias: arg.field.node, segments: arg.field.segments };
        else if (arg.presence) expression = { kind: 'field_presence', field: {
            kind: 'field_ref', alias: arg.presence.node, segments: arg.presence.segments } };
        else if (arg.claim) expression = { kind: 'claim_ref', segments: arg.claim.segments };
        else if (arg.literal) expression = { kind: 'literal', value_type: arg.literal.type, value: arg.literal.value };
        else fail('authorship_operand_pending');
        if (q(expression) !== q(operand.expression) || operand.type.form !== 'scalar') fail('authorship_operand');
        if (arg.literal && operand.type.type !== arg.literal.type) fail('authorship_type');
        if (arg.presence && operand.type.type !== 'boolean') fail('authorship_type');
    });
    const expectedInput = JSON.parse(q(input));
    for (const phase of input.proof ? ['proof', 'derivation'] : [null]) {
        const program = phase === null ? expectedInput : expectedInput[phase];
        for (const predicate of program.predicates) if (predicate.id === target.id)
            predicate.operator = { id: 'not_eq', args: ['scalar:T', 'scalar:T'], semantics: 'typed_unequal' };
    }
    const rows = inventory(input);
    const targetRows = rows.filter(row => row.predicate.id === target.id);
    const expected = targetRows.map(row => ({ name: row.name,
        before: expectedStatement(row.predicate, 'eq'), after: expectedStatement(row.predicate, 'not_eq') }));
    const expectedHash = digest({ authored, expectedInput, expected });
    const baseline = tree(request.baselineSource); const baselineSites = sites(baseline);
    if (q([...baselineSites.keys()].sort()) !== q(rows.map(row => row.name).sort())) fail('site_inventory');
    for (const row of expected) if (q(clean(baselineSites.get(row.name).body.body[0])) !== q(row.before)) fail('baseline_conformance');
    const receipt = Object.freeze({ expected_reference_sha256: expectedHash, predicate_id: target.id });
    sealedExpectations.set(receipt, { expectedInput, expected, baseline: clean(baseline), labels: rows.map(row => row.name) });
    return receipt;
}

export function verifyAuthoredStrategyCompile(raw) {
    const request = requestFields(raw, ['expectation', 'compiledInput', 'compiledSource']);
    const sealed = sealedExpectations.get(request.expectation);
    if (!sealed) fail('expectation');
    let input; try { input = copyData(request.compiledInput); } catch { fail('input'); }
    if (q(input) !== q(sealed.expectedInput)) fail('ir_conformance');
    const compiled = tree(request.compiledSource); const compiledSites = sites(compiled);
    if (q([...compiledSites.keys()].sort()) !== q([...sealed.labels].sort())) fail('site_inventory');
    for (const row of sealed.expected) {
        const site = compiledSites.get(row.name);
        if (q(clean(site.body.body[0])) !== q(row.after)) fail('authoring_lowering');
        site.body.body[0] = row.before;
    }
    if (q(clean(compiled)) !== q(sealed.baseline)) fail('authoring_outside_target');
    return Object.freeze({ matched: true, authoring_ir_conformance_matched: true,
        quarantine_compile_completed: true, expected_reference_sha256: request.expectation.expected_reference_sha256,
        checked_sites: sealed.expected.length, negative_witness_only: true, financial_receipt: false });
}

// A small independent reference over the frozen original authoring/evidence,
// not the compiler's dispatcher, scalar primitive or captured actual result.
export function sealEqualityStrategyReference(raw) {
    const request = requestFields(raw, ['graph', 'claim', 'snapshots', 'predicateId']);
    let graph; let claim; let snapshots;
    try { graph = copyData(request.graph); claim = copyData(request.claim); snapshots = copyData(request.snapshots); }
    catch { fail('reference_input'); }
    const predicates = graph.predicates.filter(row => row.id === request.predicateId);
    if (predicates.length !== 1 || predicates[0].op !== 'eq' || predicates[0].args.length !== 2) fail('reference_target');
    const at = (value, segments, presence = false) => {
        if (!Array.isArray(segments) || !segments.length) fail('reference_path');
        for (const [index, field] of segments.entries()) {
            if (typeof field !== 'string' || ['constructor', 'prototype', '__proto__'].includes(field)
                || !value || typeof value !== 'object') fail('reference_path');
            if (presence && index === segments.length - 1) return Object.hasOwn(value, field);
            if (!Object.hasOwn(value, field)) fail('reference_path');
            value = value[field];
        }
        return value;
    };
    const values = predicates[0].args.map(arg => {
        if (arg.literal) return arg.literal.value;
        if (arg.claim) return at(claim, arg.claim.segments);
        if (arg.field || arg.presence) {
            const ref = arg.field ?? arg.presence;
            const node = graph.nodes[ref.node];
            if (!node || !['snapshot', 'validated_parent'].includes(node.binding)) fail('reference_parent_pending');
            // A validated parent has no authoring ref_id/version: those are
            // resolved by the positive same-execution receipt. Bind the sealed
            // reference to its authored alias and nominal fact_key instead.
            const matches = snapshots.filter(row => node.binding === 'validated_parent'
                ? row.kind === node.kind && row.alias === ref.node
                    && row.payload?.fact_key === node.fact_key && row.payload?.id === row.ref_id
                    && typeof row.version === 'string'
                : row.kind === node.kind && row.ref_id === node.ref_id && row.version === node.version);
            if (matches.length !== 1) fail('reference_snapshot');
            return at(matches[0].payload, ref.segments, !!arg.presence);
        }
        fail('reference_operand_pending');
    });
    if (values.some(value => !['string', 'number', 'boolean'].includes(typeof value)
        || typeof value === 'number' && (!Number.isSafeInteger(value) || Object.is(value, -0)))
        || typeof values[0] !== typeof values[1] || values[0] !== values[1]) fail('reference_not_discriminant');
    return Object.freeze({ predicate_id: request.predicateId, baseline_satisfied: true, mutant_satisfied: false,
        reference_sha256: digest({ predicate: predicates[0], values }), actual_read: false });
}

function verifyFault(request, extraLabels) {
    const { input, predicateId } = request;
    const target = targetFrom(input, predicateId);
    // Expected exists before emitted source is inspected.
    const expectedBefore = expectedStatement(target, 'eq');
    const expectedAfter = expectedStatement(target, 'not_eq');
    const expectedLabels = [...extraLabels, ...input.predicates.map(row => label('proof_assertion', row.id))];
    for (const [selectionIndex, selection] of (input.selections ?? []).entries())
        for (const [caseIndex, item] of selection.cases.entries())
            for (const id of item.predicates) expectedLabels.push(label('proof_selection', id, `_${selectionIndex}_${caseIndex}`));
    if (new Set(expectedLabels).size !== expectedLabels.length) fail('expected_duplicate');
    const baseline = tree(request.baselineSource); const negative = tree(request.negativeSource);
    const before = sites(baseline); const after = sites(negative);
    for (const map of [before, after]) if (q([...map.keys()].sort()) !== q([...expectedLabels].sort())) fail('site_inventory');
    const name = label('proof_assertion', predicateId);
    if (q(clean(before.get(name).body.body[0])) !== q(expectedBefore)
        || q(clean(after.get(name).body.body[0])) !== q(expectedAfter)) fail('target_conformance');
    // A structural replacement in a parsed tree, not string patching. Exact
    // equality of the complete bundle proves no selector/D/helper extra fault.
    after.get(name).body.body[0] = before.get(name).body.body[0];
    if (q(clean(baseline)) !== q(clean(negative))) fail('outside_target');
    return Object.freeze({ matched: true, changed_sites: 1, selection_sites_preserved: true,
        predicate_id: predicateId, expected_reference_sha256: digest({ expectedBefore, expectedAfter, expectedLabels }),
        negative_witness_only: true, financial_receipt: false });
}
