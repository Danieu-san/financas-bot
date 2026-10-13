// Trusted BUILD conformance of the finite NORMAL proof-program grammar.
// No graphCompiler/lowerNextProofProgram/observed IR/source/result/trace imports.
// Authored expressions and declared nominal types are projected before lowering.
// Shared closed packaging and primitive bytes are explicit foundations, not an
// independent compiler, execution replay, general JavaScript proof or reviewed TCB.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { buildCommonJsGuestBundle } from './buildNextProvenanceArtifacts.mjs';
import { buildAvailableMetricArtifacts } from './buildNextMetricArtifacts.mjs';
import { inspectPathExecutableClosure } from './pathExecutableClosureContract.mjs';
import { projectPathReceiverOrigins, composePathReceiverEffects } from './pathReceiverOriginContract.mjs';
import { capturePathNormalCapabilityReference, readPathNormalCapabilityReference,
    recheckPathNormalCapabilityReference, verifyPathNormalCapabilityBuildBinding,
    capturePathNormalChildABIReference, readPathNormalChildABIReference,
    recheckPathNormalChildABIReference, verifyPathNormalChildABIBuildBinding } from './pathCapabilityEffectContract.mjs';
import { readPathProofAuthorship, readPathPhaseAuthorship,
    readPathCandidateProgramAuthorship } from '../../src/next/provenance/pathQualificationV3.js';
import { materialFieldType } from '../../src/next/provenance/materialFieldTypes.js';
import { canonicalValue, freezeDeep } from '../../src/next/kernel/canonicalValue.js';
import { copyData } from '../../src/next/provenance/observationContract.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const seals = new WeakMap();
const phaseSeals = new WeakMap();
const familySeals = new WeakMap(), commonPhaseSeals = new WeakMap();
const receiverProjectionCache = new Map();
const familyFailures = new WeakMap();
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const q = JSON.stringify;
const fail = code => { throw new Error('path_proof_program_' + code); };
const recipe = ['scalarProofCore', 'proofProgramData', 'proofObservedValues', 'observationScalars',
    'operatorTypes', 'literalTypes', 'civilCalendar', 'materialFingerprintCore', 'proofSha256', 'collectionProofCore'];
function fields(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable || !Object.hasOwn(d[name], 'value')))
        fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
function captured(file) {
    const bytes = fs.readFileSync(path.join(root, file)), source = bytes.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(bytes)) fail('helper_utf8');
    return source;
}
// Prescribed helper environment of the normal closed guest bundle. It is not
// copied from the actual program being checked; changes invalidate the seal.
const prologue = `'use strict';
const { createScalarProofPrimitives } = require('./scalarProofCore');
const { copyProgramData } = require('./proofProgramData');
const { canonicalValue } = require('../kernel/canonicalJson');
const { sha256Utf8 } = require('./proofSha256');
const { createMaterialFingerprint } = require('./materialFingerprintCore');
const { createCollectionProofPrimitives } = require('./collectionProofCore');
const { validateLiteral } = require('./literalTypes');
const { readObservedIdentity: identity, sequence, period } = require('./proofObservedValues');
const primitives = createScalarProofPrimitives(copyProgramData, canonicalValue);
const scalar=primitives.evaluateScalarProof; const collection=createCollectionProofPrimitives(primitives.compareTypedScalars);
function validated(value,type) { primitives.compareTypedScalars(type,value,value);return value; }
const fingerprint = createMaterialFingerprint(copyProgramData,value=>sha256Utf8(canonicalValue(value)));
function checkedNode(handle,kind) { if (identity(handle).kind!==kind) throw new Error('proof_program_node_kind'); return handle; }
function checkedPeriod(value) { scalar({id:"period_eq",args:["period","period"],semantics:"equal_period_kind_and_fields"},[{type:{form:"period"},value},{type:{form:"period"},value}]); return value; }
`;
function expectedEntry(input, phase = 'proof') {
    const operators = new Map(input.operators.map(row => [row.id, row]));
    const kinds = new Map(Object.values(input.materials).map(row => [row.kind, row]));
    function parts(e, receiver) {
        if (!['field_ref', 'claim_ref'].includes(e.kind) || !e.segments?.length) fail('path_form');
        let base = receiver ?? (e.kind === 'field_ref' ? `operands.node(${q(e.alias)})` : 'operands.claim()');
        for (const segment of e.segments.slice(0, -1)) base += `.get(${q(segment)})`;
        return { base, field: e.segments.at(-1) };
    }
    function pathRead(e, presence = false, receiver) {
        const p = parts(e, receiver);
        return `${p.base}.${presence ? 'has' : 'get'}(${q(p.field)})`;
    }
    function window(name) {
        const w = input.windows[name];
        if (!w) fail('window');
        if (w.kind === 'month') return `checkedPeriod({kind:"month",value:${read(w.value, { form: 'scalar', type: 'month' })}})`;
        if (w.kind === 'range') return `checkedPeriod({kind:"range",start:${read(w.start, { form: 'scalar', type: 'date' })},`
            + `end:${read(w.end, { form: 'scalar', type: 'date' })},start_inclusive:${w.start_inclusive},end_inclusive:${w.end_inclusive}})`;
        fail('window_form');
    }
    function read(e, t) {
        switch (e.kind) {
        case 'literal': return q(e.value);
        case 'period_literal': return q(e.period);
        case 'field_ref': case 'claim_ref': {
            const value = pathRead(e);
            // Normal derivation reads declared period fields without the
            // proof-only key enumeration. Phase affects every period reader,
            // not a fact-specific exception or a trace reconstructed post-run.
            if (['period', 'range'].includes(t.form)) return `period(${value},${phase === 'proof'})`;
            return ['sequence', 'set'].includes(t.form) ? `sequence(${value},value=>value)` : value;
        }
        case 'node_ref': return `identity(operands.node(${q(e.alias)}))`;
        case 'edge_ref': return `identity(operands.edge(${q(e.id)}))`;
        case 'field_presence': return pathRead(e.field, true);
        case 'set_ref': return `sequence(operands.set(${q(e.name)}),identity)`;
        case 'reference_set': {
            const field = e.field;
            return `(()=>{const refs=sequence(${pathRead(field)},ref=>{validateLiteral({type:"id",value:ref});return ref;});`
                + `return refs.map(ref=>{const target=identity(operands.resolveReference(${q(field.alias)},${q(field.segments[0])},ref));`
                + `if(target.ref_id!==ref)throw new Error('proof_program_reference');return target;});})()`;
        }
        case 'projection': {
            const field = pathRead({ kind: 'field_ref', segments: e.selector.segments }, false, 'member');
            return `sequence(operands.set(${q(e.set.name)}),member=>{if(identity(member).kind!==${q(e.selector.node_kind)})`
                + `throw new Error('proof_program_projection_kind');return ${field};})`;
        }
        case 'window_ref': return window(e.name);
        case 'window_bound': return `(${window(e.name)}).${e.bound}`;
        default: fail('unclassified_expression');
        }
    }
    const members = operand => `collection.members(operands.set(${q(operand.expression.name)}),${q(operand.type)})`;
    function selector(e, kind) {
        const type = materialFieldType(kind, e.segments, kinds.get(kind)?.fields[e.segments[0]]);
        return { type, path: pathRead({ kind: 'field_ref', segments: e.segments }, false, 'member') };
    }
    const values = (source, key) => `${source}.map(member=>validated(${key.path},${q(key.type)}))`;
    function collection(p) {
        const [a, b, c, d] = p.operands, kind = a.type.item.kind, nodes = members(a);
        switch (p.operator.id) {
        case 'same_field': {
            const key = selector(b.expression, kind);
            return `collection.sameField(${values(nodes, key)},${q(key.type)})`;
        }
        case 'join_eq': {
            const left = selector(c.expression, kind), right = selector(d.expression, b.type.item.kind);
            return `(()=>{const left=${nodes};const right=${members(b)};return collection.join(`
                + `${values('left', left)},${values('right', right)},${q(left.type)});})()`;
        }
        case 'ordered_by': {
            const keys = b.expression.keys.map(key => ({ ...selector(key.selector, kind), direction: key.direction }));
            const rows = `${nodes}.map(member=>({identity:identity(member),values:[${keys.map(key => `validated(${key.path},${q(key.type)})`).join(',')}]}))`;
            return `collection.ordered(${rows},${q(keys.map(({ type, direction }) => ({ type, direction })))})`;
        }
        case 'edge_pair_complete': {
            const equal = { id: 'same_identity', args: ['node:K', 'node:K'], semantics: 'same_kind_ref_version' };
            return `(()=>{const nodes=${nodes};const expected=${read(c.expression, c.type)};`
                + `scalar(${q(equal)},[{type:${q(c.type)},value:expected},{type:${q(c.type)},value:expected}]);`
                + `let equal=true;for(const member of nodes){const target=identity(operands.memberEdge(member,${q(b.expression.segments[0])}));`
                + `if(!scalar(${q(equal)},[{type:${q(c.type)},value:target},{type:${q(c.type)},value:expected}]))equal=false;}`
                + `return nodes.length===2&&equal;})()`;
        }
        case 'all_match': case 'none_match': {
            const guards = b.expression.body.map(guard => {
                const [field, value] = guard.operands, op = operators.get(guard.op), selected = selector(field, kind);
                if (!op || !['eq', 'state_is', 'date_in_period'].includes(op.id)) fail('template_operator');
                const left = op.id === 'state_is' ? { form: 'field', value: selected.type } : selected.type;
                const right = op.id === 'date_in_period' ? { form: 'period' } : op.id === 'state_is' ? { form: 'state_literal' } : selected.type;
                return `if(!scalar(${q(op)},[{type:${q(left)},value:${selected.path}},{type:${q(right)},value:${read(value, right)}}])) conjunction=false;`;
            });
            const result = `collection.quantify(${nodes},member=>{let conjunction=true;${guards.join('')}return conjunction;})`;
            return p.operator.id === 'all_match' ? `${result}.all` : `!${result}.any`;
        }
        default: fail('unclassified_collection');
        }
    }
    function statement(p) {
        const op = p.operator;
        if (phase === 'derivation' && op.id === 'edge_target_in_set') {
            const [edge, set] = p.operands;
            if (edge.expression.kind !== 'edge_ref' || set.expression.kind !== 'set_ref') fail('derivation_membership');
            return `if(!operands.edgeTargetInSet(${q(edge.expression.id)},${q(set.expression.name)}))all=false;`;
        }
        if (['same_field', 'join_eq', 'ordered_by', 'all_match', 'none_match', 'edge_pair_complete'].includes(op.id))
            return `if(!(${collection(p)})) all=false;`;
        if (op.id === 'fingerprint_is') {
            const [node, digest] = p.operands, alias = node.expression.alias;
            return `if (fingerprint(checkedNode(operands.node(${q(alias)}),${q(node.type.kind)}),`
                + `${q(input.materials[alias])},"enumerated_presence") !== ${read(digest.expression, digest.type)}) all = false;`;
        }
        if (op.id === 'civil_date_matches') {
            const [instant, date, timezone, calendar] = p.operands, source = parts(instant.expression);
            const equal = { id: 'eq', args: ['scalar:T', 'scalar:T'], semantics: 'typed_equal' };
            return `if(!(()=>{const date=${read(date.expression, date.type)};`
                + `const timezone=${read(timezone.expression, timezone.type)};const calendar=${read(calendar.expression, calendar.type)};`
                + `validateLiteral({type:"date",value:date});`
                + `const converted=${source.base}.civilDate(${q(source.field)},timezone,calendar);`
                + `return scalar(${q(equal)},[{type:${q(date.type)},value:converted},{type:${q(date.type)},value:date}]);})())all=false;`;
        }
        return `if (!scalar(${q(op)},[${p.operands.map(row => `{type:${q(row.type)},value:${read(row.expression, row.type)}}`).join(',')}])) all = false;`;
    }
    const statements = new Map(input.predicates.map(p => [p.id, statement(p)]));
    const mark = (role, id, suffix = '') => {
        if (!statements.has(id)) fail('predicate_identity');
        return `${role}_${Buffer.from(id, 'utf8').toString('hex')}${suffix}:{${statements.get(id)}}`;
    };
    const selections = input.selections.map((s, si) => {
        const cases = s.cases.map((c, ci) => `case ${ci}:{const observed=identity(member);`
            + `if(observed.kind!==${q(c.identity.kind)}||observed.ref_id!==${q(c.identity.ref_id)}||observed.version!==${q(c.identity.version)})throw new Error('proof_program_selection_identity');`
            + `const operands=Object.freeze({node:alias=>alias===${q(c.node)}?member:rootOperands.node(alias),`
            + `claim:()=>rootOperands.claim(),set:name=>rootOperands.set(name),edge:id=>rootOperands.edge(id),`
            + `resolveReference:(alias,field,ref)=>rootOperands.resolveReference(alias,field,ref),memberEdge:(node,field)=>rootOperands.memberEdge(node,field)});`
            + `let all=true;${c.predicates.map(id => mark('proof_selection', id, `_${si}_${ci}`)).join('\n')}return ${c.mode === 'include_if_all' ? 'all' : '!all'};}`);
        return `{let seen=0;operands.select(${q(s.candidate_set)},${q(s.selected_set)},(member,index)=>{seen++;switch(index){`
            + `${cases.join('\n')}default:throw new Error('proof_program_selection_candidate');}});`
            + `if(seen!==${s.cases.length})throw new Error('proof_program_selection_roster');}`;
    });
    return prologue + `function run(operands) { const rootOperands=operands;\n${selections.join('\n')}\nlet all = true;\n`
        + input.predicates.map(p => mark(phase === 'proof' ? 'proof_assertion' : 'derivation_guard', p.id)).join('\n') + '\nreturn all; }\nmodule.exports = {run};\n';
}
function captureHelpers() {
    const helpers = recipe.map(name => ({ path: `provenance/${name}.js`, source: captured(`src/next/provenance/${name}.js`) }));
    helpers.push({ path: 'kernel/canonicalJson.js', source: captured('src/next/kernel/canonicalJson.js') });
    return helpers;
}
function expectedBundle(input, helpers, phase = 'proof') {
    return buildCommonJsGuestBundle({ sources: [...helpers, { path: 'provenance/program.js', source: expectedEntry(input, phase) }],
        entry: 'provenance/program.js', exportName: 'run' });
}
function assertionSites(input, phase) {
    const predicates = new Map(input.predicates.map(row => [row.id, row]));
    const mark = (role, id, suffix = '') => {
        const predicate = predicates.get(id);
        if (!predicate) fail('assertion_predicate');
        return { site: `${role}_${Buffer.from(id, 'utf8').toString('hex')}${suffix}`,
            role, predicate_id: id, operator: predicate.operator.id, operands: predicate.operands };
    };
    // Normal metadata lists main assertions before the selection case sites,
    // even though selection statements occur before main assertions in source.
    return [...input.predicates.map(row => mark(phase === 'proof' ? 'proof_assertion' : 'derivation_guard', row.id)),
        ...input.selections.flatMap((selection, si) => selection.cases.flatMap((row, ci) =>
            row.predicates.map(id => mark('proof_selection', id, `_${si}_${ci}`))))];
}
export function sealPathProofProgramExpectation(raw) {
    const { authorship } = fields(raw, ['authorship']);
    const input = readPathProofAuthorship({ authorship });
    const helpers = captureHelpers();
    const entry = expectedEntry(input);
    const expected = buildCommonJsGuestBundle({ sources: [...helpers, { path: 'provenance/program.js', source: entry }],
        entry: 'provenance/program.js', exportName: 'run' });
    const receipt = freezeDeep({ stage: 'path_v3_proof_program_expectation_sealed_before_lowering',
        fact_key: authorship.fact_key, method_authority: authorship.method_authority,
        authored_graph_sha256: authorship.authored_graph_sha256, authored_input_sha256: authorship.input_sha256,
        expected_source_sha256: sha(expected.source), entry_sha256: sha(entry),
        helper_sources: helpers.map(row => ({ path: row.path, sha256: sha(row.source) })),
        imports: expected.imports, sources: expected.sourceHashes,
        shared_packaging_and_primitives: true, independent_compiler: false, independent_execution: false,
        scope: 'complete_normal_proof_phase_only_not_derivation_or_whole_qualification',
        qualified: false, semantic_mutation_credit: 0 });
    seals.set(receipt, receipt);
    return receipt;
}
export function sealPathPhaseProgramExpectation(raw) {
    const { authorship } = fields(raw, ['authorship']);
    return sealPhaseAuthorship(authorship, captureHelpers());
}
function sealPhaseAuthorship(authorship, helpers) {
    const input = readPathPhaseAuthorship({ authorship });
    if (input.derivation.selections.length) fail('derivation_selection');
    const derivation = expectedBundle(input.derivation, helpers, 'derivation'),
        proof = expectedBundle(input.proof, helpers), profile = input.profile;
    const source = `/* phase-profile ${profile.sha256}; registry ${profile.registry_sha256} */\n`
        + `(function(operands){'use strict';if(operands.phase==="derivation")return (${derivation.source})(operands);`
        + `if(operands.phase==="proof")return (${proof.source})(operands);throw new Error('proof_program_phase');})`;
    const sources = new Map();
    for (const [phase, program] of [['derivation', derivation], ['proof', proof]]) for (const row of program.sourceHashes) {
        const name = row.path === 'provenance/program.js' ? `provenance/${phase}-program.js` : row.path;
        if (sources.has(name) && sources.get(name).sha256 !== row.sha256) fail('phase_helper_mismatch');
        sources.set(name, { path: name, sha256: row.sha256 });
    }
    sources.set(profile.path, { path: profile.path, sha256: profile.sha256 });
    const sourceHashes = [...sources.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const manifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'proof', entry: 'bundle.js',
        files: [{ path: 'bundle.js', media_type: 'text/javascript', sha256: sha(source) },
            { path: profile.path, media_type: 'application/json', sha256: profile.sha256 }] });
    const metadata = freezeDeep({ stage: 'phase_proof_program_candidate_only', executable: false,
        artifact_root: sha(manifest), predicateCount: input.proof.predicates.length,
        derivationPredicateCount: input.derivation.predicates.length, profileInput: profile,
        assertionSites: [...assertionSites(input.derivation, 'derivation'), ...assertionSites(input.proof, 'proof')],
        negative_witness_only: false, sourceHashes });
    const receipt = freezeDeep({ stage: 'path_v3_phase_program_expectation_sealed_before_lowering', fact_key: authorship.fact_key,
        method_authority: authorship.method_authority, authored_input_sha256: authorship.input_sha256,
        derivation_mode: authorship.derivation_mode, profile_sha256: profile.sha256, registry_sha256: profile.registry_sha256,
        expected_source_sha256: sha(source), expected_manifest_sha256: sha(manifest),
        expected_metadata_sha256: sha(canonicalValue(metadata)), expected_artifact_root: metadata.artifact_root,
        helper_sources: helpers.map(row => ({ path: row.path, sha256: sha(row.source) })),
        shared_packaging_and_primitives: true, shared_reviewed_phase_profile: true,
        independent_compiler: false, independent_execution: false, qualified: false, semantic_mutation_credit: 0 });
    phaseSeals.set(receipt, { receipt, source, manifest, metadata });
    return receipt;
}
export function sealPathCandidateProgramExpectation(raw) {
    const { authorship } = fields(raw, ['authorship']);
    const family = readPathCandidateProgramAuthorship({ authorship });
    // Bind complete physical checker bodies to the genuine pre-M authorial
    // frontier. This is byte conformance only: neither read coverage nor rule
    // discharge is inferred from code, checksums or a compiler success on M.
    const normalAdmissionSources = [...new Set(family.admissionFoundation.passes.flatMap(pass => pass.checker_sources))]
        .sort().map(file => { const source = captured(file); return { path: file, source, sha256: sha(source) }; });
    const structuralContract = family.admissionFoundation.normal_structural_locator_contract;
    for (const binding of structuralContract.source_bindings)
        if (normalAdmissionSources.find(source => source.path === binding.path)?.sha256 !== binding.sha256)
            fail('admission_checker_structure_contract_pin');
    const normalStructuralLocatorContract = { ...structuralContract, source_bindings_verified: true,
        classification_complete: family.admissionFoundation.sites.every(site => site.domain_complete
            && site.frames.every(frame => frame.single_site_frame_verified
                && frame.structural_locator_constraint.contract_sha256 === sha(canonicalValue(structuralContract))
                && frame.structural_locator_constraint.baseline_locator_resolved
                && ['present_authored_locator', 'absent_authored_claim_path'].includes(frame.structural_locator_constraint.resolution))),
        normal_baseline_admission_verified: false, discharged: false };
    const normalReadContracts = family.admissionFoundation.normal_read_rule_contracts.map(contract => {
        for (const binding of contract.source_bindings)
            if (normalAdmissionSources.find(source => source.path === binding.path)?.sha256 !== binding.sha256)
                fail('admission_checker_read_contract_pin');
        const completeFrames = family.admissionFoundation.sites.every(site => site.domain_complete
            && site.frames.every(frame => frame.single_site_frame_verified
                && frame.rule_dependency_frames.some(rule => rule.pass_id === contract.pass_id
                    && rule.normal_read_rule_contract_sha256 === sha(canonicalValue(contract))
                    && rule.dependency_frame_verified && rule.conditional_preservation_verified)));
        return { ...contract, source_bindings_verified: true,
            normal_checker_read_coverage_verified: true,
            conditional_preservation_verified: completeFrames,
            // The lemma binds inputs/bodies. No compiler/guest result is used
            // here to invent a baseline or discharge a rule on the candidate.
            normal_baseline_admission_verified: false, discharged: false };
    });
    const primitiveTypeContract = family.admissionFoundation.normal_primitive_type_contract;
    for (const binding of primitiveTypeContract.source_bindings)
        if (normalAdmissionSources.find(source => source.path === binding.path)?.sha256 !== binding.sha256)
            fail('admission_checker_primitive_type_contract_pin');
    const normalPrimitiveTypeContract = { ...primitiveTypeContract, source_bindings_verified: true,
        conditional_preservation_complete: family.admissionFoundation.sites.every(site => site.domain_complete
            && site.frames.every(frame => frame.single_site_frame_verified
                && frame.structural_locator_constraint.primitive_type_constraint.contract_sha256 === sha(canonicalValue(primitiveTypeContract))
                && frame.structural_locator_constraint.primitive_type_constraint.conditional_preservation_verified)),
        normal_baseline_admission_verified: false, discharged: false };
    const schemaContract = family.admissionFoundation.normal_package_schema_contract;
    const schemaReferenceSources = [...schemaContract.source_bindings, ...schemaContract.schema_sources].map(binding => {
        const source = captured(binding.path);
        if (sha(source) !== binding.sha256
            || schemaContract.schema_sources.includes(binding)
                && family.admissionFoundation.documents.find(row => row.path === binding.path)?.sha256 !== binding.sha256)
            fail('admission_checker_schema_contract_pin');
        return { ...binding, source };
    });
    const normalPackageSchemaContract = { ...schemaContract, source_bindings_verified: true,
        conditional_preservation_complete: family.admissionFoundation.sites.every(site => site.domain_complete
            && site.frames.every(frame => frame.single_site_frame_verified
                && frame.structural_locator_constraint.schema_locator_constraint.contract_sha256 === sha(canonicalValue(schemaContract))
                && frame.structural_locator_constraint.schema_locator_constraint.shape_preservation_verified
                && frame.structural_locator_constraint.schema_locator_constraint.predicate_identity_uniqueness_preserved)),
        normal_baseline_admission_verified: false, discharged: false };
    const normalAdmissionReference = freezeDeep({ format: 'financasbot.path-normal-admission-checker-reference', version: 1,
        method_authority: family.admissionFoundation.method_authority,
        admission_foundation_sha256: sha(canonicalValue(family.admissionFoundation)),
        sources: normalAdmissionSources,
        normal_read_rule_contracts: normalReadContracts,
        normal_structural_locator_contract: normalStructuralLocatorContract,
        normal_primitive_type_contract: normalPrimitiveTypeContract,
        normal_package_schema_contract: normalPackageSchemaContract,
        // This binds the whole per-member composition, not merely its true
        // aggregate. All baseline/control/review premises remain unfulfilled.
        normal_rule_composition: family.admissionFoundation.normal_rule_composition,
        normal_rule_composition_sha256: sha(canonicalValue(family.admissionFoundation.normal_rule_composition)),
        schema_reference_sources: schemaReferenceSources,
        passes: family.admissionFoundation.passes.map(pass => ({ id: pass.id,
            source_bindings: pass.checker_sources.map(file => {
                const source = normalAdmissionSources.find(row => row.path === file);
                return { path: source.path, sha256: source.sha256 };
            }), normal_checker_read_coverage_verified: normalReadContracts.some(contract => contract.pass_id === pass.id),
            discharged: false })),
        byte_policy: 'complete_normal_checker_UTF8_raw_no_line_ending_normalization',
        sealed_before_captured_compile: true, rule_discharge_complete: false,
        independent_checker_semantics: false, qualified: false, semantic_mutation_credit: 0 });
    const capabilityReference = capturePathNormalCapabilityReference();
    const childABIReference = capturePathNormalChildABIReference({ normalReference: capabilityReference });
    // Functional kernels are a DECLARED shared normal BUILD foundation. Their
    // pre-M byte capture is not an independent implementation of the formula,
    // and supplies no oracle, equivalence, execution or acceptance result.
    for (const document of [family.baseline.metricAuthority.registry, ...family.baseline.metricAuthority.contracts])
        if (canonicalValue(JSON.parse(captured(document.path))) !== canonicalValue(document.value))
            fail('metric_authorial_document_binding');
    const metrics = freezeDeep(buildAvailableMetricArtifacts().built);
    const registryEntries = family.baseline.metricAuthority.registry.value.entries;
    if (metrics.length !== registryEntries.length || metrics.some((metric, index) =>
        metric.evaluator_id !== registryEntries[index].evaluator_id
        || metric.evaluator_version !== registryEntries[index].evaluator_version)) fail('metric_full_inventory');
    const metricBindings = family.baseline.metricBindings;
    const metricHash = sha(canonicalValue(metrics)), bindingHash = sha(canonicalValue(metricBindings));
    // Capture one finite helper table before ANY captured C/M/S compile. Common
    // proof reuse is keyed by the genuine full authorial basis AND helper bytes.
    const helpers = captureHelpers(), helperHash = sha(canonicalValue(helpers.map(row => ({
        path: row.path, sha256: sha(row.source) }))));
    let cache = commonPhaseSeals.get(family.baseline.basis);
    if (!cache) { cache = new Map(); commonPhaseSeals.set(family.baseline.basis, cache); }
    let baseline = cache.get(helperHash);
    if (!baseline) {
        baseline = freezeDeep(family.baseline.rows.map(row => ({ fact_key: row.fact_key,
            expectation: sealPhaseAuthorship(row.authorship, helpers) })));
        cache.set(helperHash, baseline);
    }
    const mutant = family.mutant ? { fact_key: family.mutant.fact_key,
        expectation: sealPhaseAuthorship(family.mutant.authorship, helpers) } : null;
    const worlds = { C: baseline, M: mutant ? freezeDeep(baseline.map(row =>
        row.fact_key === mutant.fact_key ? mutant : row)) : null, S: baseline };
    const rows = variant => worlds[variant]?.map(row => ({ fact_key: row.fact_key,
        program_sha256: row.expectation.expected_source_sha256,
        manifest_sha256: row.expectation.expected_manifest_sha256,
        metadata_sha256: row.expectation.expected_metadata_sha256 })) ?? null;
    const metricClosure = Object.freeze(metrics.map(metric => Object.freeze({ evaluator_id: metric.evaluator_id,
        analysis: inspectPathExecutableClosure({ source: metric.source, sourceHashes: metric.sourceHashes, kind: 'metric' }) })));
    const closures = Object.fromEntries(['C', 'M', 'S'].map(variant => [variant, worlds[variant] ? Object.freeze({
        programs: Object.freeze(worlds[variant].map(row => { const phase = phaseSeals.get(row.expectation); return Object.freeze({
            fact_key: row.fact_key, analysis: inspectPathExecutableClosure({ source: phase.source,
                sourceHashes: phase.metadata.sourceHashes, kind: 'phase' }) }); })), metrics: metricClosure }) : null]));
    // Only the genuine authored family and captured child constructor reference
    // can supply root seeds. The loader passes operands without manufacturing
    // capabilities; downstream receiver/return/callback effects remain unknown.
    const rootBindings = freezeDeep(Object.fromEntries(['C', 'M', 'S'].map(variant => [variant, closures[variant]
        ? closures[variant].programs.map(row => {
            const seed = family.baseline.capabilitySeeds.find(seed => seed.fact_key === row.fact_key);
            if (!seed) fail('root_seed_missing');
            return { fact_key: row.fact_key, authored_seed_sha256: sha(canonicalValue(seed)),
                child_abi_reference_sha256: childABIReference.reference_sha256,
                phase_entries: row.analysis.inventories.map((bundle, index) => ({ phase: index === 0 ? 'derivation' : 'proof',
                    entry: bundle.entry, function: bundle.entry_function, bindings: bundle.entry_argument_bindings })),
                functional_entries: metricClosure.filter(metric => metricBindings.some(binding => binding.fact_key === row.fact_key
                    && binding.evaluator_ref.evaluator_id === metric.evaluator_id)).map(metric => ({ evaluator_id: metric.evaluator_id,
                    entry: metric.analysis.inventories[0].entry, function: metric.analysis.inventories[0].entry_function,
                    bindings: metric.analysis.inventories[0].entry_argument_bindings })),
                seed_scope: 'authored_input_roles_and_normal_child_constructor_bindings_not_selected_output_or_live_parent',
                guest_call_provenance_complete: false, executable_consumer_absence_proved: false };
        }) : null])));
    const normalData = readPathNormalCapabilityReference({ reference: capabilityReference });
    const childData = readPathNormalChildABIReference({ reference: childABIReference });
    const projectReceivers = (analysis, rootKind, seed, bundleIndex = 0) => {
        const key = analysis.analysis_sha256 + ':' + bundleIndex + ':' + rootKind + ':' + sha(canonicalValue(seed))
            + ':' + capabilityReference.reference_sha256 + ':' + childABIReference.reference_sha256;
        if (!receiverProjectionCache.has(key)) {
            if (receiverProjectionCache.size >= 512) receiverProjectionCache.delete(receiverProjectionCache.keys().next().value);
            receiverProjectionCache.set(key, projectPathReceiverOrigins(analysis.inventories[bundleIndex], rootKind, seed, normalData, childData));
        }
        return receiverProjectionCache.get(key);
    };
    const receiverOrigins = freezeDeep(Object.fromEntries(['C', 'M', 'S'].map(variant => [variant, closures[variant]
        ? closures[variant].programs.map(row => {
            const seed = family.baseline.capabilitySeeds.find(seed => seed.fact_key === row.fact_key);
            const evaluator = metricBindings.find(binding => binding.fact_key === row.fact_key).evaluator_ref.evaluator_id;
            const functional = metricClosure.find(metric => metric.evaluator_id === evaluator);
            if (!functional) fail('receiver_functional_binding');
            return { fact_key: row.fact_key, phases: [projectReceivers(row.analysis, 'child_derivation_guard', seed, 0),
                projectReceivers(row.analysis, 'child_proof_operands', seed, 1)],
                functional: projectReceivers(functional.analysis, 'metric_operands', seed) };
        }) : null])));
    const effectCompositions = freezeDeep(Object.fromEntries(['C', 'M', 'S'].map(variant => [variant,
        receiverOrigins[variant]?.map(row => ({ fact_key: row.fact_key,
            phases: row.phases.map(composePathReceiverEffects), functional: composePathReceiverEffects(row.functional) })) ?? null])));
    const receipt = freezeDeep({ stage: 'path_v3_whole_program_family_sealed_before_compile',
        invocation_id: family.candidate.invocation_id, candidate_id: family.candidate.candidate_id,
        whole_ir_reference: authorship.whole_ir_reference,
        normal_admission_checker_reference: normalAdmissionReference,
        baseline_basis_sha256: authorship.baseline_basis_sha256, helper_sources_sha256: helperHash,
        profile_sha256: family.profile.sha256, sealed_before_captured_compile: true,
        programs_per_positive_world: baseline.length, shared_programs: baseline.length - (mutant ? 1 : 0),
        common_reuse_scope: authorship.shared_scope,
        metric_reference_scope: 'shared_normal_functional_BUILD_bytes_not_independent_formula_or_oracle',
        metric_byte_policy: 'existing_normal_metric_recipe_UTF8_LF',
        metric_count: metrics.length, metric_artifacts_sha256: metricHash,
        metric_bindings_count: metricBindings.length, metric_bindings_sha256: bindingHash,
        module_closure_reference_sha256: sha(canonicalValue(Object.fromEntries(['C', 'M', 'S']
            .map(variant => [variant, closures[variant] ? closureProjection(closures[variant]) : null])))),
        normal_capability_reference_sha256: capabilityReference.reference_sha256,
        normal_child_abi_reference_sha256: childABIReference.reference_sha256,
        authored_capability_seeds_sha256: sha(canonicalValue(family.baseline.capabilitySeeds)),
        authored_capability_seeds_scope: 'all_unchanged_population_role_and_nominal_bindings_not_selected_runtime_output',
        root_capability_bindings_sha256: sha(canonicalValue(rootBindings)),
        conditional_receiver_origins_sha256: sha(canonicalValue(receiverOrigins)),
        effect_composition_reference_sha256: effectCompositionDigest(effectCompositions),
        effect_composition_status: 'blocked_missing_effect_discharge', effect_closure_complete: false,
        executable_consumer_absence_proved: false, value_flow_proof_complete: false,
        metric_authority_refs: [family.baseline.metricAuthority.registry, ...family.baseline.metricAuthority.contracts]
            .map(({ path, sha256 }) => ({ path, sha256 })),
        worlds: ['C', 'M', 'S'].map(variant => ({ variant,
            package_root: authorship.whole_ir_reference.worlds.find(row => row.variant === variant).package_root,
            program_count: worlds[variant]?.length ?? 0,
            programs_sha256: rows(variant) ? sha(canonicalValue(rows(variant))) : null })),
        independent_compiler: false, independent_execution: false, validation_tcb_complete: false,
        qualified: false, semantic_mutation_credit: 0 });
    familySeals.set(receipt, { candidate: family.candidate, worlds, metrics, metricBindings, closures, capabilityReference,
        normalAdmissionReference,
        childABIReference, capabilitySeeds: family.baseline.capabilitySeeds, rootBindings, receiverOrigins, effectCompositions, phaseProfile: family.phaseProfile,
        profile: family.profile, receipt });
    return receipt;
}
export function readPathCandidateMetricReference(raw) {
    const { expectation } = fields(raw, ['expectation']);
    const seal = familySeals.get(expectation);
    if (!seal) fail('metric_reference_origin');
    return freezeDeep({ metrics: seal.metrics, bindings: seal.metricBindings });
}
export function readPathCandidateCapabilityReference(raw) {
    const { expectation } = fields(raw, ['expectation']);
    const seal = familySeals.get(expectation);
    if (!seal) fail('capability_reference_origin');
    return freezeDeep({ reference: seal.capabilityReference,
        data: readPathNormalCapabilityReference({ reference: seal.capabilityReference }) });
}
export function recheckPathCandidateCapabilities(raw) {
    const { expectation } = fields(raw, ['expectation']);
    const seal = familySeals.get(expectation);
    if (!seal) fail('capability_reference_origin');
    for (const source of seal.normalAdmissionReference.sources)
        if (captured(source.path) !== source.source) fail('admission_checker_physical_drift');
    for (const source of seal.normalAdmissionReference.schema_reference_sources)
        if (captured(source.path) !== source.source) fail('admission_checker_schema_physical_drift');
    recheckPathNormalCapabilityReference({ reference: seal.capabilityReference });
    return recheckPathNormalChildABIReference({ reference: seal.childABIReference });
}
export function verifyPathCandidateCapabilityBuildBinding(raw) {
    const { expectation, sourceHashes, childSourceHashes, schemaSources, schemaBuildSource } = fields(raw,
        ['expectation', 'sourceHashes', 'childSourceHashes', 'schemaSources', 'schemaBuildSource']);
    const seal = familySeals.get(expectation);
    if (!seal) fail('capability_reference_origin');
    const hashes = copyData(sourceHashes);
    if (!Array.isArray(hashes) || hashes.length > 512) fail('admission_BUILD_sources');
    const seen = new Set();
    for (const row of hashes) {
        if (!row || Object.keys(row).sort().join(',') !== 'path,sha256' || typeof row.path !== 'string'
            || typeof row.sha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(row.sha256)
            || seen.has(row.path)) fail('admission_BUILD_sources');
        seen.add(row.path);
    }
    for (const source of seal.normalAdmissionReference.sources)
        if (hashes.find(row => row.path === source.path.slice('src/next/'.length))?.sha256 !== source.sha256)
            fail('admission_checker_BUILD_binding');
    const schemaContract = seal.normalAdmissionReference.normal_package_schema_contract;
    // copyData rejects active transports and returns null-prototype defensive
    // objects. Use the existing plain-JSON bridge; do not weaken the kernel.
    if (canonicalValue(JSON.parse(JSON.stringify(copyData(schemaSources)))) !== canonicalValue(schemaContract.schema_sources)
        || typeof schemaBuildSource !== 'string' || schemaBuildSource !== seal.normalAdmissionReference.schema_reference_sources
            .find(row => row.path === 'scripts/agent/buildNextProvenanceArtifacts.mjs').source)
        fail('admission_checker_schema_BUILD_binding');
    return freezeDeep({ ...verifyPathNormalCapabilityBuildBinding({ reference: seal.capabilityReference, sourceHashes }),
        ...verifyPathNormalChildABIBuildBinding({ reference: seal.childABIReference, sourceHashes: childSourceHashes }),
        normal_admission_checker_source_conformance: true,
        normal_package_schema_source_conformance: true,
        normal_admission_checker_reference_sha256: sha(canonicalValue(seal.normalAdmissionReference)),
        normal_admission_rule_discharge_complete: false });
}
export function readPathCandidateChildABIReference(raw) {
    const { expectation } = fields(raw, ['expectation']);
    const seal = familySeals.get(expectation);
    if (!seal) fail('child_reference_origin');
    return freezeDeep({ reference: seal.childABIReference, data: readPathNormalChildABIReference({ reference: seal.childABIReference }),
        seeds: seal.capabilitySeeds });
}
export function readPathCandidateRootCapabilityBindings(raw) {
    const { expectation, variant } = fields(raw, ['expectation', 'variant']);
    const seal = familySeals.get(expectation);
    if (!seal || typeof variant !== 'string' || !['C', 'M', 'S'].includes(variant) || !seal.rootBindings[variant])
        fail('root_capability_origin_or_no_typed_M');
    return seal.rootBindings[variant];
}
export function readPathCandidateReceiverOrigins(raw) {
    const { expectation, variant } = fields(raw, ['expectation', 'variant']);
    const seal = familySeals.get(expectation);
    if (!seal || typeof variant !== 'string' || !['C', 'M', 'S'].includes(variant) || !seal.receiverOrigins[variant])
        fail('receiver_reference_origin_or_no_typed_M');
    return seal.receiverOrigins[variant];
}
export function readPathCandidateClosureReference(raw) {
    const { expectation, variant } = fields(raw, ['expectation', 'variant']);
    const seal = familySeals.get(expectation);
    if (!seal || typeof variant !== 'string' || !['C', 'M', 'S'].includes(variant) || !seal.closures[variant])
        fail('closure_reference_origin_or_no_typed_M');
    return seal.closures[variant];
}
export function readPathCandidateEffectComposition(raw) {
    const { expectation, variant } = fields(raw, ['expectation', 'variant']);
    const seal = familySeals.get(expectation);
    if (!seal || typeof variant !== 'string' || !['C', 'M', 'S'].includes(variant) || !seal.effectCompositions[variant])
        fail('effect_composition_origin_or_no_typed_M');
    return seal.effectCompositions[variant];
}
function effectCompositionDigest(worlds) {
    return sha(canonicalValue(Object.fromEntries(Object.entries(worlds).map(([variant, rows]) => [variant,
        rows?.map(row => ({ fact_key: row.fact_key, phases: row.phases.map(item => item.composition_sha256),
            functional: row.functional.composition_sha256 })) ?? null]))));
}
export function verifyPathCandidateClosure(raw) {
    const { expectation, variant, programs, metrics } = fields(raw, ['expectation', 'variant', 'programs', 'metrics']);
    const expected = readPathCandidateClosureReference({ expectation, variant });
    verifyPathCandidatePrograms({ expectation, variant, programs });
    verifyPathCandidateMetrics({ expectation, metrics });
    // Whole source uses the existing 8MB program bound, not observation scalar
    // quotas. Metadata is copied independently under the unchanged data limits.
    const actualPrograms = Array.from({ length: expected.programs.length }, (_, index) => {
        const row = fields(Object.getOwnPropertyDescriptor(programs, String(index)).value, ['fact_key', 'candidate']);
        const phase = phaseSeals.get(familySeals.get(expectation).worlds[variant][index].expectation);
        const data = fields(row.candidate, [...Object.keys(phase.metadata), 'source', 'manifest']);
        return { fact_key: row.fact_key, candidate: { source: data.source,
            sourceHashes: JSON.parse(JSON.stringify(copyData(data.sourceHashes))) } };
    });
    const actualMetrics = passiveFamily(metrics, expected.metrics.length);
    const observed = { programs: actualPrograms.map(row => ({ fact_key: row.fact_key,
        analysis: inspectPathExecutableClosure({ source: row.candidate.source,
            sourceHashes: row.candidate.sourceHashes, kind: 'phase' }) })),
    metrics: actualMetrics.map(row => ({ evaluator_id: row.evaluator_id,
        analysis: inspectPathExecutableClosure({ source: row.source, sourceHashes: row.sourceHashes, kind: 'metric' }) })) };
    const digest = sha(canonicalValue(closureProjection(observed)));
    if (digest !== sha(canonicalValue(closureProjection(expected)))) fail('module_closure_conformance');
    // Conformance binds the entire obligation tables to ACTUAL byte inventories.
    // Pure projection reuse is permitted only after whole analyzed source/catalog
    // equality. This is not a rerun of semantic effects, nor a discharged premise.
    const compositions = readPathCandidateEffectComposition({ expectation, variant });
    const origins = readPathCandidateReceiverOrigins({ expectation, variant });
    for (let index = 0; index < observed.programs.length; index++) {
        const program = observed.programs[index], row = compositions[index];
        if (row.fact_key !== program.fact_key) fail('effect_composition_fact');
        const binding = familySeals.get(expectation).metricBindings.find(item => item.fact_key === program.fact_key);
        const metric = observed.metrics.find(item => item.evaluator_id === binding.evaluator_ref.evaluator_id);
        for (const [bundle, composition, origin] of [
            ...program.analysis.inventories.map((bundle, phase) => [bundle, row.phases[phase], origins[index].phases[phase]]),
            [metric.analysis.inventories[0], row.functional, origins[index].functional]
        ]) {
            const sources = bundle.modules.map(module => ({ path: module.path, source_sha256: module.source_sha256,
                effect_sites_sha256: module.effect_sites_sha256 }));
            if (canonicalValue(sources) !== canonicalValue(composition.sources)
                || composition.receiver_reference_sha256 !== 'sha256:' + createHash('sha256').update(canonicalValue(origin)).digest('hex'))
                fail('effect_composition_actual_binding');
        }
    }
    return freezeDeep({ module_closure_conformance: true, module_closure_sha256: digest,
        static_call_binding_conformance: true,
        function_boundary_conformance: true,
        conditional_receiver_reference_conformance: true,
        conditional_receiver_reference_sha256: sha(canonicalValue(readPathCandidateReceiverOrigins({ expectation, variant }))),
        effect_obligation_conformance: true,
        effect_composition_reference_sha256: effectCompositionDigest({ [variant]: compositions }),
        effect_composition_status: 'blocked_missing_effect_discharge', effect_closure_complete: false,
        effect_composition_reuse_scope: 'whole_actual_analyzed_bytes_and_genuine_pre_M_seeds_equal_not_semantic_rerun',
        operational_receiver_authority: false,
        executable_consumer_absence_proved: false, value_flow_proof_complete: false,
        necessary_equivalence_proved: false, qualified: false, semantic_mutation_credit: 0 });
}
function closureProjection(closure) {
    // Each genuine analyzer digest binds its entire inventory plus all summary
    // flags, real source/catalog bytes and scope. Full tables remain retained.
    return { programs: closure.programs.map(row => ({ fact_key: row.fact_key,
        analysis_sha256: row.analysis.analysis_sha256 })),
    metrics: closure.metrics.map(row => ({ evaluator_id: row.evaluator_id,
        analysis_sha256: row.analysis.analysis_sha256 })) };
}
export function verifyPathCandidateMetrics(raw) {
    const { expectation, metrics } = fields(raw, ['expectation', 'metrics']);
    const seal = familySeals.get(expectation);
    if (!seal) fail('metric_reference_origin');
    const admitted = passiveFamily(metrics, seal.metrics.length);
    for (let index = 0; index < admitted.length; index++) {
        const observed = fields(admitted[index], Object.keys(seal.metrics[index]));
        if (canonicalValue(observed) !== canonicalValue(seal.metrics[index])) {
            const error = new Error('path_proof_program_metric_asset_identity');
            familyFailures.set(error, freezeDeep({ metric_index: index,
                evaluator_id: seal.metrics[index].evaluator_id, expected_sha256: sha(canonicalValue(seal.metrics[index])),
                observed_sha256: sha(canonicalValue(observed)), observed }));
            throw error;
        }
    }
    return freezeDeep({ functional_metric_conformance: true, metric_count: admitted.length,
        metric_artifacts_sha256: expectation.metric_artifacts_sha256,
        independent_formula: false, dp_execution: false, qualified: false, semantic_mutation_credit: 0 });
}
export function verifyPathCandidateMetricBindings(raw) {
    const { expectation, variant, bindings } = fields(raw, ['expectation', 'variant', 'bindings']);
    const seal = familySeals.get(expectation);
    if (!seal || typeof variant !== 'string' || !['C', 'M', 'S'].includes(variant)
        || !seal.worlds[variant]) fail('metric_binding_origin_or_no_typed_M');
    const admitted = passiveFamily(bindings, seal.metricBindings.length);
    for (let index = 0; index < admitted.length; index++) {
        if (canonicalValue(admitted[index]) !== canonicalValue(seal.metricBindings[index])) {
            const error = new Error('path_proof_program_metric_binding_identity');
            familyFailures.set(error, freezeDeep({ variant, graph_index: index,
                fact_key: seal.metricBindings[index].fact_key, expected_sha256: sha(canonicalValue(seal.metricBindings[index])),
                observed_sha256: sha(canonicalValue(admitted[index])), observed: admitted[index] }));
            throw error;
        }
    }
    return freezeDeep({ metric_bindings_conformance: true, metric_bindings_count: admitted.length,
        metric_bindings_sha256: expectation.metric_bindings_sha256,
        dp_execution: false, qualified: false, semantic_mutation_credit: 0 });
}
function passiveFamily(raw, count) {
    if (!Array.isArray(raw) || types.isProxy(raw) || Object.getPrototypeOf(raw) !== Array.prototype) fail('metric_rows');
    const descriptors = Object.getOwnPropertyDescriptors(raw);
    if (descriptors.length.value !== count || Reflect.ownKeys(descriptors).length !== count + 1) fail('metric_rows');
    return Array.from({ length: count }, (_, index) => {
        const descriptor = descriptors[index];
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail('metric_row');
        return JSON.parse(JSON.stringify(copyData(descriptor.value)));
    });
}
// Private-origin BUILD bridge; no caller IR, scope, callback or approval flag.
export function resolvePathCandidateProgramExpectation(raw) {
    const { expectation, candidate } = fields(raw, ['expectation', 'candidate']);
    const seal = familySeals.get(expectation);
    if (!seal || seal.candidate !== candidate) fail('program_family_candidate_identity');
    return Object.freeze({ phaseProfile: seal.phaseProfile, profile: seal.profile,
        wholeIRReference: expectation.whole_ir_reference });
}
export function readPathCandidateProgramReference(raw) {
    const { expectation, variant } = fields(raw, ['expectation', 'variant']);
    const seal = familySeals.get(expectation);
    if (!seal || typeof variant !== 'string' || !['C', 'M', 'S'].includes(variant)
        || !seal.worlds[variant]) fail('program_family_origin_or_no_typed_M');
    return freezeDeep(seal.worlds[variant].map(row => ({ fact_key: row.fact_key,
        candidate: { ...readPathPhaseProgramReference({ expectation: row.expectation }).metadata,
            source: phaseSeals.get(row.expectation).source, manifest: phaseSeals.get(row.expectation).manifest } })));
}
export function verifyPathCandidatePrograms(raw) {
    const { expectation, variant, programs } = fields(raw, ['expectation', 'variant', 'programs']);
    const seal = familySeals.get(expectation);
    if (!seal || typeof variant !== 'string' || !['C', 'M', 'S'].includes(variant)
        || !seal.worlds[variant]) fail('program_family_origin_or_no_typed_M');
    const expected = seal.worlds[variant];
    if (!Array.isArray(programs) || types.isProxy(programs) || Object.getPrototypeOf(programs) !== Array.prototype)
        fail('program_family_rows');
    const descriptors = Object.getOwnPropertyDescriptors(programs);
    if (descriptors.length.value !== expected.length || Reflect.ownKeys(descriptors).length !== expected.length + 1)
        fail('program_family_rows');
    for (let index = 0; index < expected.length; index++) {
        const descriptor = descriptors[index];
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail('program_family_row');
        const row = fields(descriptor.value, ['fact_key', 'candidate']);
        if (row.fact_key !== expected[index].fact_key) fail('program_family_fact_identity');
        try { verifyPathPhaseProgram({ expectation: expected[index].expectation, candidate: row.candidate }); }
        catch (error) {
            // Preserve the first passive contradiction, not only an error string
            // or a candidate-supplied digest. The existing per-program bounds
            // still apply; active or malformed transports acquire no snapshot.
            const phase = phaseSeals.get(expected[index].expectation);
            let observed = null;
            try {
                const { source, manifest, ...metadata } = fields(row.candidate,
                    [...Object.keys(phase.metadata), 'source', 'manifest']);
                if (typeof source === 'string' && Buffer.byteLength(source, 'utf8') <= 8 * 1024 * 1024
                    && typeof manifest === 'string' && Buffer.byteLength(manifest, 'utf8') <= 8 * 1024 * 1024)
                    observed = { source, manifest, metadata_canonical_json:
                        canonicalValue(JSON.parse(JSON.stringify(copyData(metadata)))) };
            } catch { /* An active/malformed transport is not evidence bytes. */ }
            familyFailures.set(error, freezeDeep({ variant, graph_index: index,
                fact_key: row.fact_key, expected: expected[index].expectation, observed }));
            throw error;
        }
    }
    return freezeDeep({ stage: 'path_v3_whole_program_family_conformance_not_execution',
        variant, program_count: expected.length, whole_phase_program_conformance: true,
        programs_sha256: expectation.worlds.find(row => row.variant === variant).programs_sha256,
        helper_closure_complete: true, validation_tcb_complete: false,
        qualified: false, semantic_mutation_credit: 0, dp_execution: false });
}
export function readPathCandidateProgramFailure(error) { return familyFailures.get(error) ?? null; }
// Trusted BUILD review/capture of the independently generated pre-lowering
// bytes. A copied reference never acquires the seal's private authority.
export function readPathPhaseProgramReference(raw) {
    const { expectation } = fields(raw, ['expectation']);
    const seal = phaseSeals.get(expectation);
    if (!seal) fail('phase_expectation_origin');
    return freezeDeep({ source: seal.source, manifest: seal.manifest, metadata: seal.metadata });
}
export function verifyPathPhaseProgram(raw) {
    const { expectation, candidate } = fields(raw, ['expectation', 'candidate']);
    const seal = phaseSeals.get(expectation);
    if (!seal) fail('phase_expectation_origin');
    const data = fields(candidate, [...Object.keys(seal.metadata), 'source', 'manifest']);
    const { source, manifest, ...metadata } = data;
    if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > 8 * 1024 * 1024
        || sha(source) !== expectation.expected_source_sha256) fail('phase_whole_source_identity');
    if (typeof manifest !== 'string' || manifest !== seal.manifest) fail('phase_manifest_identity');
    // Bounded/passive transport BEFORE the ordinary canonical encoder. Never
    // serialize an active caller object or relax canonical JSON for null-proto.
    const admitted = JSON.parse(JSON.stringify(copyData(metadata)));
    if (canonicalValue(admitted) !== canonicalValue(seal.metadata)) fail('phase_metadata_identity');
    return freezeDeep({ stage: 'path_v3_whole_normal_phase_program_conformance_only', fact_key: expectation.fact_key,
        program_sha256: expectation.expected_source_sha256, artifact_root: seal.metadata.artifact_root,
        authored_input_sha256: expectation.authored_input_sha256,
        whole_phase_program_conformance: true, whole_proof_program_conformance: true, derivation_conformance: true,
        helper_closure_complete: true, independent_compiler: false, independent_execution: false,
        measured_tcb_admission: false, handles_opened: 0, qualified: false, semantic_mutation_credit: 0,
        dp_execution: false, financial_acceptance: false });
}
export function verifyPathProofProgram(raw) {
    const { expectation, source } = fields(raw, ['expectation', 'source']);
    const expected = seals.get(expectation);
    if (!expected) fail('expectation_origin');
    if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > 8 * 1024 * 1024
        || sha(source) !== expected.expected_source_sha256) fail('whole_source_identity');
    return freezeDeep({ stage: 'path_v3_whole_proof_program_conformance_only', fact_key: expected.fact_key,
        program_sha256: sha(source), authored_input_sha256: expected.authored_input_sha256,
        helper_closure_complete: true, whole_proof_program_conformance: true, derivation_conformance: false,
        independent_compiler: false, independent_execution: false, measured_tcb_admission: false,
        handles_opened: 0, qualified: false, semantic_mutation_credit: 0, dp_execution: false, financial_acceptance: false });
}
