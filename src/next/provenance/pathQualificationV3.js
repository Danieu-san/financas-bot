'use strict';
// BUILD preparation only. Inventory integrity is not domain completeness,
// an executed barrier, a semantic witness or an approved qualification row.
const { createHash, randomUUID } = require('node:crypto');
const { types } = require('node:util');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const { copyData } = require('./observationContract');
const { projectClaimContext } = require('./claimContext');
const { enumeratePathInventoryCandidate, materializePathAdmissionCandidate, projectPathInventoryAuthoredProof,
    projectPathInventoryAuthoredIR, projectPathSingleSiteAuthoredIR, projectPathSingleSiteAuthoredProof, ADDENDUM } = require('./pathMutationInventory');
const { createLocatorDomainEnumeration, readLocatorDomainDiagnostic } = require('./pathLocatorDomainV3');
const { admitPackage, admittedDocuments, admittedPackageEntries } = require('./packageContract');
const { resolvePhaseCompositionMode, phaseCompositionCommitment } = require('./phaseCompositionProfile');
const METHOD = Object.freeze({
    commit: '72fc5a5b707909687da9b5cec892be2dcc892a62',
    blob: '82112f0c4d6eeed21d4823c8b1dd3d3ca8ce1bf2',
    utf8_lf_sha256: 'sha256:0c831d290c0ae47960d1fc11b9ea530d792a926cb2211a1313d7d070f0d24eba'
});
// Private reuse of the same necessary selection projection. It is not a
// caller option or an admission authority. Public preparation still builds
// the full twelve-pass foundation, and the narrow result is never admitted
// into the full-domain verifier's WeakMap.
const NECESSARY_SELECTION_PROJECTION = Symbol('necessary_selection_projection');
// Finite preservation lemmas for the inspected NORMAL bodies, not general
// JavaScript read/effect analysis. Pins are predeclared, never measured from a
// caller's candidate or silently recaptured to bless a changed checker. These
// First four bodies read only retained roots/unchanged documents. The template
// body additionally reads all template arguments and set peers, retained by
// its separate finite query; a changed named binding is NOT an equal frame.
// The obligation body reads all predicate IDs/metadata, identity/integrity and
// reference-target arguments, nodes/edges/trace roots and immutable snapshot
// documents. Parent anchors are node_identity arguments, not a separate
// unretained input. The entire participating list is retained in original order.
// Ordinary claim and collection checks retain every direct claim root and
// every potential descriptor/period or fixture/membership participant, plus
// the entire graph roots and immutable claim/snapshot/registry documents.
// Qualification-specific transported claim locators are NOT covered here.
// Helpers see those declared inputs or freshly constructed output.
// Whole normal baseline admission and the normal primitive/data contracts are
// explicit premises. Construction/byte binding is not independent code audit.
const NORMAL_READ_SOURCE_PINS = Object.freeze({
    'src/next/provenance/graphCompiler.js': 'sha256:fe938a128cfd4dccda0d8ddc1f2e6965b623feecc6d1854ef0306700efda1016',
    'src/next/provenance/operandBindings.js': 'sha256:50cacfb104e9e792d1118428f81fe659b4ae9c07407b979a1c2b122141303e60',
    'src/next/provenance/schemaRegistryProjection.js': 'sha256:282b949ff0c546b3b20ec7cbe6a3b00a3ab28ed19e8d951d5379f011b2ddd84d',
    'src/next/provenance/templateReferences.js': 'sha256:bd5c186192b41d991f8fc1bf74dce0f372d8ff8ac63a845eaa029640a7d3f34f',
    'src/next/provenance/obligationBindings.js': 'sha256:580f9b97e6ef216e5598de5c97aa8d96cc7cda713a5547e249a27f24144baf87',
    'src/next/provenance/claimRequirements.js': 'sha256:2a42d47868a57fad697a0caec0ae0678a338f06dca0ebf77064fab6def182468',
    'src/next/provenance/claimRequirementCore.js': 'sha256:1f23d4c8fb117bb5bd6bf992cc1bf4ea0806c01372853395fb2c341b9968de23',
    'src/next/provenance/claimNominalTypes.js': 'sha256:f37c4367c027d119caf81afcb1de898a05b5edfd6651c8c3a17d3177cff95096',
    'src/next/provenance/collectionRequirements.js': 'sha256:4d6af2b5d830929910622f504126dfea29c3ba6866ff99e21c90e23f12961de3',
    'src/next/provenance/selectionBindings.js': 'sha256:dafa79661a2474ad05c2390c86adcf136dc8ac395d10a28a6a4d7deeccac9815',
    'src/next/provenance/operatorTypes.js': 'sha256:573db750922769a1626fe11c938458271b7cd09fdc5571df5c7b6786fa8d493c',
    'src/next/provenance/literalTypes.js': 'sha256:c99b3a919c995638702325dcb7c2cb1f8e338388700429b3bc9f1cce7a00b4ec',
    'src/next/provenance/civilCalendar.js': 'sha256:b67c689a7dc7f4227336ffbeeda81793c6202ac62cda557db236022903fce899',
    'src/next/kernel/canonicalValue.js': 'sha256:f6d571ddc1c7917f6a0ec8e25b17368c3e23ba10111ea5aa591c692d6739205b'
});
const NORMAL_READ_RULE_CONTRACTS = freezeDeep([
    ['static_evidence', 'validateStaticEvidence', 'src/next/provenance/graphCompiler.js'],
    ['graph_dependencies', 'indexGraphDependencies', 'src/next/provenance/graphCompiler.js'],
    ['operand_bindings', 'compileOperandBindings', 'src/next/provenance/operandBindings.js'],
    ['schema_registry_projection', 'validateSchemaRegistryProjection', 'src/next/provenance/schemaRegistryProjection.js'],
    ['template_references', 'validateTemplateReferences', 'src/next/provenance/templateReferences.js',
        ['src/next/provenance/operatorTypes.js', 'src/next/provenance/literalTypes.js', 'src/next/provenance/civilCalendar.js'],
        'all_template_arguments_set_peers_and_graph_roots_with_unchanged_documents'],
    ['obligation_bindings', 'validateObligationBindings', 'src/next/provenance/obligationBindings.js', [],
        'all_predicate_metadata_participating_arguments_and_entire_graph_roots_with_unchanged_documents'],
    ['claim_requirements', 'validateClaimRequirements', 'src/next/provenance/claimRequirements.js',
        ['src/next/provenance/claimRequirementCore.js', 'src/next/provenance/claimNominalTypes.js'],
        'ordinary_only_all_direct_claim_roots_descriptor_subject_period_arguments_and_graph_roots_with_unchanged_claims'],
    ['collection_requirements', 'validateCollectionRequirements', 'src/next/provenance/collectionRequirements.js', [],
        'all_fixture_membership_anchor_arguments_and_entire_graph_roots_with_unchanged_snapshot_registry_documents'],
    ['selection_bindings', 'validateSelectionBindings', 'src/next/provenance/selectionBindings.js', [],
        'all_selection_referenced_predicate_arguments_metadata_and_entire_graph_roots_with_unchanged_claim_registry_documents']
].map(([pass_id, entrypoint, source, helpers = [],
    read_projection = 'graph_without_predicates_and_unchanged_non_corpus_documents']) => ({ pass_id, entrypoint,
    source_bindings: [source, ...helpers, 'src/next/kernel/canonicalValue.js'].map(path => ({ path, sha256: NORMAL_READ_SOURCE_PINS[path] })),
    scope: 'finite_pinned_normal_body_under_plain_admitted_data_and_normal_primitives',
    read_projection,
    complete_single_site_authorship_family_required: true,
    admitted_plain_data_required: true, normal_primitives_required: true,
    baseline_admission_required: true, checker_byte_binding_required: true, argument_site_only: true,
    conclusion: 'normal_static_success_preserved_under_explicit_baseline_and_byte_premises',
    normal_baseline_admission_verified: false, independent_code_audit: false })));
// The NORMAL structural pass reads a replacement path through one of three
// already declared locator forms. All other arguments, graph relations and
// documents remain in the single-site frame. This finite rule does NOT replace
// type/template/selection/relational admission or execute a candidate compiler.
const NORMAL_STRUCTURAL_LOCATOR_CONTRACT = freezeDeep({
    checker: 'graph_structure', entrypoint: 'validateGraphStructure',
    source_bindings: [
        ['src/next/provenance/graphStructure.js', '927a4e76b6a7c9f8ad8656e21a44766a745c2edd3113b82ff7231a1c2bc79e50'],
        ['src/next/provenance/literalTypes.js', 'c99b3a919c995638702325dcb7c2cb1f8e338388700429b3bc9f1cce7a00b4ec'],
        ['src/next/provenance/civilCalendar.js', 'b67c689a7dc7f4227336ffbeeda81793c6202ac62cda557db236022903fce899'],
        ['src/next/kernel/canonicalValue.js', NORMAL_READ_SOURCE_PINS['src/next/kernel/canonicalValue.js'].slice(7)]
    ].map(([path, value]) => ({ path, sha256: 'sha256:' + value })),
    definitions: ['claimPath', 'fieldPath', 'selector'],
    scope: 'genuine_complete_L_and_single_site_argument_structural_resolution_only',
    baseline_admission_required: true, checker_byte_binding_required: true,
    plain_admitted_data_required: true, normal_primitives_required: true,
    rule_discharge_complete: false, independent_code_audit: false
});
// Finite draft-07 preservation, not a second validator or a new schema.
// The genuine single-site substitution keeps its locator branch and all
// surrounding keys, predicates/graph identities and non-corpus documents.
// Unique predicate identities prevent a changed argument from making two
// complete predicates equal under uniqueItems. A positive whole NORMAL
// baseline and the NORMAL draft-07 validator/dependencies remain premises.
const NORMAL_PACKAGE_SCHEMA_CONTRACT = freezeDeep({
    checker: 'package_schemas', variant: 'ordinary_single_site_locator_only',
    definitions: ['fieldPath', 'selector', 'claimPath'],
    source_bindings: [
        { path: 'src/next/provenance/graphCompiler.js', sha256: NORMAL_READ_SOURCE_PINS['src/next/provenance/graphCompiler.js'] },
        { path: 'scripts/agent/buildNextProvenanceArtifacts.mjs', sha256: 'sha256:a563450252a995a0a35d83dc921c8af931bcb330c642e6de7a92857cd3a2fb2b' },
        { path: 'src/next/kernel/canonicalValue.js', sha256: NORMAL_READ_SOURCE_PINS['src/next/kernel/canonicalValue.js'] }
    ],
    schema_sources: [
        ['claim-contract', 'b69ef61b562061f057a9bf08f47623ae432c723f565e8775f3dbe6eb942ea998'],
        ['evaluator-contract', '2c3bc0a86bf45da2c4466118bb6ad9506f1824a209c419c3c7180718e294a183'],
        ['evaluator-witness-contracts', 'dd5af1b4ab9d29f67d87b7b979076f8b4695cd917062d63ec34da6c12240adaa'],
        ['evidence-snapshot', '054a48930a5f25760f201e8b401f0f34f5a83672366acad6c9c09bdc0ce0b5ef'],
        ['metric-evaluator-registry', 'de5eb3828b8faaf58eeddc9f90d9342b509f86fd32ea8b66f9174448c536e066'],
        ['provenance-graph', '9e3c148c95d6fecd3d93f019ad5a5967126f8bf1cb9bde9d152c70c057a1740b']
    ].map(([stem, hash]) => ({ path: 'docs/contracts/next/provenance-v2/' + stem + '.schema.json', sha256: 'sha256:' + hash })),
    baseline_admission_required: true, complete_single_site_family_required: true,
    unchanged_non_corpus_documents_required: true, unique_predicate_and_graph_identities_required: true,
    shared_normal_draft07_validator_and_dependencies: true, independent_validator: false,
    normal_baseline_admission_verified: false, discharged: false, independent_code_audit: false
});
// Ordinary type preservation for material PRIMITIVES only. The NORMAL
// fieldValue constructor has no reference-target/member lookup on this
// branch. Its nonliteral known value is ignored by signature refinements;
// windows, literals, set hints and all other operands stay in the frame.
// Enum peer membership is preserved by the complete declared enum domain,
// id nominal and money unit by their exact constructors. References, records
// and claim-schema resolution require separate foundations, not this lemma.
const NORMAL_PRIMITIVE_TYPE_CONTRACT = freezeDeep({
    checker: 'predicate_types', entrypoint: 'compilePredicateTypes', variant: 'ordinary_only',
    source_bindings: [
        { path: 'src/next/provenance/predicateTypes.js', sha256: 'sha256:7ec5e1dc0348599bf42aa642a575233bb3642371fb2a48bea77b2558de6a25b8' },
        { path: 'src/next/provenance/claimNominalTypes.js', sha256: 'sha256:f37c4367c027d119caf81afcb1de898a05b5edfd6651c8c3a17d3177cff95096' },
        ...['operatorTypes', 'literalTypes', 'civilCalendar'].map(name => ({
            path: 'src/next/provenance/' + name + '.js', sha256: NORMAL_READ_SOURCE_PINS['src/next/provenance/' + name + '.js'] })),
        { path: 'src/next/kernel/canonicalValue.js', sha256: NORMAL_READ_SOURCE_PINS['src/next/kernel/canonicalValue.js'] }
    ],
    scope: 'finite_material_primitive_constructors_and_unchanged_operator_peer_inputs',
    primitive_types: ['id', 'text', 'date', 'month', 'datetime', 'integer', 'positive_integer',
        'nonnegative_integer', 'money_minor', 'boolean', 'enum', 'digest', 'timezone', 'calendar', 'civil_unit'],
    baseline_admission_required: true, complete_single_site_family_required: true,
    plain_admitted_data_required: true, normal_primitives_required: true,
    checker_byte_binding_required: true, rule_discharge_complete: false,
    independent_code_audit: false
});
const contexts = new WeakMap();
const candidatePackages = new WeakMap();
const staticPlans = new WeakMap();
const historicalMigrations = new WeakMap();
const admissionDomains = new WeakMap();
const selectionControlPlans = new WeakMap();
const proofAuthorships = new WeakMap();
const phaseAuthorships = new WeakMap();
const wholeIRReferences = new WeakMap();
const candidateIRReferences = new WeakMap();
const wholeIRFailures = new WeakMap();
const programAuthorshipFamilies = new WeakMap();
const witnessPreselections = new WeakMap();
// Existing historical evidence only. This pin identifies immutable bytes; it
// does not approve that report, reuse its execution or supply v3 expected.
const HISTORICAL_REPORT = 'sha256:3187e36259bc11fcd2c9063a6a4ba25987f1e1acca18a81a96aee87834b007d0';
const corpusPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const equal = (a, b) => canonicalValue(a) === canonicalValue(b);
const plain = value => JSON.parse(JSON.stringify(copyData(value)));
const fail = code => { throw new Error('path_qualification_v3_' + code); };
function fields(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable
        || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
function passiveRows(raw, count) {
    if (!Array.isArray(raw) || types.isProxy(raw) || Object.getPrototypeOf(raw) !== Array.prototype) fail('rows');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (d.length.value !== count || Reflect.ownKeys(d).length !== count + 1) fail('rows');
    return Array.from({ length: count }, (_, index) => {
        if (!d[index]?.enumerable || !Object.hasOwn(d[index], 'value')) fail('rows');
        // One bounded transport per causal row; no enlarged transport quotas.
        return plain(d[index].value);
    });
}
function preparePathQualificationInventory(raw) {
    const input = fields(raw, ['packageReceipt', 'ir']);
    // Reuse the admitted schema traversal and whole authored/IR conformance.
    // Do NOT reuse the filtered v2 candidate list as a complete L/A/W domain.
    const inventory = enumeratePathInventoryCandidate(input);
    const expectedIR = projectPathInventoryAuthoredIR({ inventoryCandidate: inventory });
    const irSeal = sealWholeIR(expectedIR);
    const wholeIRConformance = assertWholeIR(input.ir, irSeal);
    const enumerateDomain = createLocatorDomainEnumeration(input.packageReceipt);
    const targets = inventory.requirements.filter(row => row.family === 'predicate_path_semantic');
    const grouped = new Map();
    for (const site of inventory.sites.filter(row => row.class === 'path')) {
        const key = canonicalValue([site.fact_key, site.predicate_id]);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(site);
    }
    const rows = targets.map(target => {
        const sites = grouped.get(canonicalValue([target.target.fact_key, target.target.predicate_id]));
        if (!sites?.length) fail('target_without_site');
        return {
            qualification_id: sha(canonicalValue({ domain: 'financasbot.path-qualification.v3',
                target_id: target.mutation_id, authority: METHOD })),
            target_id: target.mutation_id, target: plain(target.target),
            old_authority: ADDENDUM, v2_inventory_realization: target.realization,
            historical_evidence: null,
            sites: sites.map(site => {
                let domain = null, domainReason = null;
                try { domain = enumerateDomain.enumerateSite(target.target, site); }
                catch (error) {
                    domainReason = readLocatorDomainDiagnostic(error);
                    if (!domainReason) throw error;
                }
                return { authored_site: plain(site), domain, domain_complete: domain !== null,
                    domain_reason: domainReason, admitted_domain_complete: false,
                    admission_controls: null, necessary_equivalence: null };
            }),
            disposition: 'blocked', status: 'blocked',
            reasons: ['complete_locator_domain_and_qualification_evidence_pending'],
            dp_execution: false, semantic_mutation_credit: 0,
            historical_state_changed: false
        };
    });
    const targetIds = rows.map(row => row.target_id);
    const siteCount = rows.reduce((n, row) => n + row.sites.length, 0);
    if (new Set(targetIds).size !== rows.length || siteCount !== inventory.sites.filter(row => row.class === 'path').length)
        fail('exact_partition');
    const header = { format: 'financasbot.path-qualification.inventory', version: 3,
        stage: 'prepared_inventory_not_qualified', method_authority: METHOD,
        old_authority: ADDENDUM, authority_refs: inventory.authority_refs,
        expected_predicates: rows.length, enumerated_predicates: rows.length,
        authored_sites: siteCount, target_ids_sha256: sha(canonicalValue(targetIds)),
        rows_sha256: sha(canonicalValue(rows)), whole_ir_conformance: wholeIRConformance,
        verified: 0, blocked: rows.length,
        semantic_mutation_credit: 0, activated: false, global_g11: false,
        financial_receipt: false, validation_tcb_complete: false };
    const result = freezeDeep({ ...header, rows });
    contexts.set(result, { header, rows, inventory, packageReceipt: input.packageReceipt, irSeal });
    return result;
}
function sealWholeIR(expected) {
    const { graphs, ...header } = expected;
    return { expected, header: canonicalValue(header), graphs: graphs.map(row => canonicalValue(row)),
        sha256: sha(canonicalValue(expected)) };
}
function assertWholeIR(raw, seal) {
    const { graphs, ...header } = fields(raw, Object.keys(seal.expected));
    const actualHeader = canonicalValue(plain(header));
    if (actualHeader !== seal.header) wholeIRFailure('whole_ir_header_identity', null, seal.header, actualHeader);
    if (!Array.isArray(graphs) || types.isProxy(graphs) || Object.getPrototypeOf(graphs) !== Array.prototype)
        fail('whole_ir_graphs');
    const descriptors = Object.getOwnPropertyDescriptors(graphs);
    if (descriptors.length.value !== seal.graphs.length || Reflect.ownKeys(descriptors).length !== seal.graphs.length + 1)
        fail('whole_ir_graphs');
    for (let index = 0; index < seal.graphs.length; index++) {
        const descriptor = descriptors[index];
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail('whole_ir_graph_identity');
        const actual = canonicalValue(plain(descriptor.value));
        if (actual !== seal.graphs[index]) wholeIRFailure('whole_ir_graph_identity', index, seal.graphs[index], actual);
    }
    return freezeDeep({ whole_ir_conformance: true, ir_sha256: seal.sha256, graphs: seal.graphs.length,
        independent_compiler: false, qualified: false, semantic_mutation_credit: 0 });
}
function wholeIRFailure(code, graphIndex, expected, actual) {
    const error = new Error('path_qualification_v3_' + code);
    wholeIRFailures.set(error, freezeDeep({ code, graph_index: graphIndex,
        expected_sha256: sha(expected), observed_sha256: sha(actual),
        observed_canonical_json: actual, qualified: false, semantic_mutation_credit: 0 }));
    throw error;
}
function readPathWholeIRFailure(error) { return wholeIRFailures.get(error) ?? null; }
function preparePathWholeIRReference(raw) {
    const { preparation } = fields(raw, ['preparation']);
    const context = contexts.get(preparation);
    if (!context) fail('whole_ir_preparation_origin');
    const receipt = freezeDeep({ stage: 'path_v3_whole_authored_ir_reference_before_mutant', method_authority: METHOD,
        authority_refs: context.inventory.authority_refs, ir_sha256: context.irSeal.sha256,
        graphs: context.irSeal.graphs.length,
        source_basis: 'authored_documents_shared_declared_nominal_types_not_observed_IR',
        independent_compiler: false, qualified: false, semantic_mutation_credit: 0 });
    wholeIRReferences.set(receipt, context.irSeal);
    return receipt;
}
function verifyPathWholeIRReference(raw) {
    const { reference, ir } = fields(raw, ['reference', 'ir']);
    const seal = wholeIRReferences.get(reference);
    if (!seal) fail('whole_ir_reference_origin');
    return assertWholeIR(ir, seal);
}
function readPathWholeIRReference(raw) {
    const { reference } = fields(raw, ['reference']);
    const seal = wholeIRReferences.get(reference);
    if (!seal) fail('whole_ir_reference_origin');
    return seal.expected;
}
function preparePathCandidateWholeIRReference(raw) {
    const { candidate } = fields(raw, ['candidate']);
    const context = candidatePackages.get(candidate);
    if (!context) fail('candidate_whole_ir_origin');
    return context.wholeIRReference;
}
function verifyPathCandidateWholeIRReference(raw) {
    const { reference, variant, ir } = fields(raw, ['reference', 'variant', 'ir']);
    const seals = candidateIRReferences.get(reference);
    if (!seals || typeof variant !== 'string' || !['C', 'M', 'S'].includes(variant)) fail('candidate_whole_ir_origin');
    const seal = seals[variant];
    if (!seal) fail('native_rejection_only_no_mutant_ir');
    return assertWholeIR(ir, seal);
}
function verifyPathQualificationInventory(raw) {
    const input = fields(raw, ['preparation', 'candidate']);
    const context = contexts.get(input.preparation);
    if (!context) fail('preparation_authority');
    const candidate = fields(input.candidate, [...Object.keys(context.header), 'rows']);
    const { rows: rawRows, ...rawHeader } = candidate;
    if (!equal(plain(rawHeader), context.header)) fail('header_identity');
    const rows = passiveRows(rawRows, context.rows.length);
    if (!equal(rows, context.rows)) fail('exact_target_site_identity');
    return freezeDeep({ inventory_integrity: true, verified: false,
        expected_predicates: context.rows.length, blocked: context.rows.length,
        semantic_mutation_credit: 0, global_g11: false, activated: false });
}
function preparePathQualificationHistoricalMigration(raw) {
    const { preparation, historicalSource } = fields(raw, ['preparation', 'historicalSource']);
    const context = contexts.get(preparation);
    if (!context) fail('historical_preparation_authority');
    if (typeof historicalSource !== 'string' || Buffer.byteLength(historicalSource, 'utf8') > 32 * 1024 * 1024
        || sha(historicalSource) !== HISTORICAL_REPORT) fail('historical_source_identity');
    const old = JSON.parse(historicalSource);
    if (!Array.isArray(old.rows)) fail('historical_format');
    const byId = new Map();
    for (const record of old.rows) {
        if (typeof record.mutation_id !== 'string' || byId.has(record.mutation_id)) fail('historical_duplicate');
        byId.set(record.mutation_id, record);
    }
    if (byId.size !== context.rows.length || context.rows.some(row => !byId.has(row.target_id)))
        fail('historical_exact_membership_requires_new_migration_decision');
    const graphs = admittedDocuments(context.packageReceipt).find(entry => entry.path === corpusPath)?.value.graphs;
    const graphMap = new Map(graphs.map(graph => [graph.fact_key, graph]));
    const rows = context.rows.map(row => {
        const record = byId.get(row.target_id);
        const predicate = graphMap.get(row.target.fact_key)?.predicates.find(predicate => predicate.id === row.target.predicate_id);
        if (!equal(row.target, record.target) || !predicate || !equal(record.expected_violations, [predicate.atom]))
            fail('historical_target_or_atom_changed_requires_new_migration_decision');
        // Preserve the COMPLETE old row, including missing/present cause,
        // references, trace/outcome hashes and all diagnostic flags. No rewrite
        // of matched/UNSAT/RED/valid; no evidence promoted across authorities.
        const historicalRecord = plain(record);
        return { target_id: row.target_id, target: row.target, qualification_id: row.qualification_id,
            historical_report_sha256: HISTORICAL_REPORT, historical_record_sha256: sha(canonicalValue(historicalRecord)),
            historical_record: historicalRecord, old_authority: ADDENDUM, method_authority: METHOD,
            new_disposition: 'blocked', new_evidence_ids: [], historical_state_changed: false,
            evidence_reused_for_v3: false, dp_execution: false, semantic_mutation_credit: 0 };
    });
    const flagNames = ['stage', 'global_g11', 'predicate_atom_credit', 'batch_complete', 'graph_accepted',
        'financial_receipt', 'accounting_complete', 'measured_sources_unchanged', 'migration_verified', 'activated', 'valid'];
    const flags = Object.fromEntries(flagNames.map(name => {
        if (!Object.hasOwn(old, name)) fail('historical_flags');
        return [name, old[name]];
    }));
    const header = { format: 'financasbot.path-qualification.historical-migration', version: 3,
        stage: 'total_historical_mapping_not_qualified', method_authority: METHOD, old_authority: ADDENDUM,
        historical_report_sha256: HISTORICAL_REPORT, historical_report_flags: flags,
        expected_predicates: context.rows.length, exact_old_membership: true,
        target_ids_sha256: context.header.target_ids_sha256, rows_sha256: sha(canonicalValue(rows)),
        evidence_reuse_policy: 'none_new_qualification_required_under_v3',
        baseline_raw_identity_reused: false, qualified: false, activated: false,
        semantic_mutation_credit: 0, verified_rows: 0, blocked: context.rows.length, global_g11: false };
    const result = freezeDeep({ ...header, rows });
    historicalMigrations.set(result, { header, rows });
    return result;
}
function verifyPathQualificationHistoricalMigration(raw) {
    const { migration, candidate } = fields(raw, ['migration', 'candidate']);
    const stored = historicalMigrations.get(migration);
    if (!stored) fail('historical_migration_authority');
    const { rows: rawRows, ...rawHeader } = fields(candidate, [...Object.keys(stored.header), 'rows']);
    if (!equal(plain(rawHeader), stored.header)) fail('historical_migration_header');
    if (!equal(passiveRows(rawRows, stored.rows.length), stored.rows)) fail('historical_state_or_evidence_changed');
    return freezeDeep({ migration_integrity: true, exact_old_membership: true, rows: stored.rows.length,
        historical_report_sha256: HISTORICAL_REPORT, rows_sha256: stored.header.rows_sha256,
        qualified: false, activated: false, semantic_mutation_credit: 0, global_g11: false });
}
function authoredSelectionConcern(graph) {
    const edges = new Map(graph.edges.map(edge => [edge.id, edge]));
    // Independently project the authored relationship, not the compiler's
    // selected/candidate error or its observed IR selection program. Same
    // identity is not inferred from equal fixture values. No graph reachability
    // beyond the explicitly declared material and compensation/category links.
    function touches(predicate) {
        const aliases = new Set();
        for (const arg of predicate.args) {
            if (arg.node) aliases.add(arg.node);
            if (arg.field) aliases.add(arg.field.node);
            if (arg.presence) aliases.add(arg.presence.node);
            if (arg.ref_set) aliases.add(arg.ref_set.field.node);
            const setName = arg.set ?? arg.projection?.set;
            if (setName) for (const alias of graph.sets[setName]) aliases.add(alias);
            if (arg.edge) aliases.add(edges.get(arg.edge).source);
        }
        return aliases;
    }
    const allowedAliases = new Map();
    function concernAliases(alias) {
        if (allowedAliases.has(alias)) return allowedAliases.get(alias);
        const allowed = new Set([alias]);
        const direct = graph.edges.filter(edge => edge.relation === 'material_ref' && edge.source === alias);
        for (const edge of direct) allowed.add(edge.target);
        for (const compensation of direct.filter(edge => edge.field === 'compensates'
            && graph.nodes[alias].kind === 'event' && graph.nodes[edge.target].kind === 'event')) {
            for (const category of graph.edges.filter(edge => edge.relation === 'material_ref'
                && edge.source === compensation.target && edge.field === 'category_id'
                && graph.nodes[edge.target].kind === 'category')) allowed.add(category.target);
        }
        allowedAliases.set(alias, allowed);
        return allowed;
    }
    const concerns = (predicate, alias) => [...touches(predicate)].some(node => concernAliases(alias).has(node));
    return { concerns, concernAliases };
}
function preparePathQualificationAdmissionDomain(raw) {
    const privateProjection = arguments[1];
    if (arguments.length > 2 || (privateProjection !== undefined && privateProjection !== NECESSARY_SELECTION_PROJECTION))
        fail('admission_foundation_projection_authority');
    const { preparation, rowIndex } = fields(raw, ['preparation', 'rowIndex']);
    const context = contexts.get(preparation);
    if (!context || !Number.isSafeInteger(rowIndex) || rowIndex < 0 || !context.rows[rowIndex])
        fail('admission_foundation_authority');
    const row = context.rows[rowIndex];
    const corpus = admittedDocuments(context.packageReceipt).find(entry => entry.path === corpusPath).value;
    const graph = corpus.graphs.find(graph => graph.fact_key === row.target.fact_key);
    const original = graph.predicates.find(predicate => predicate.id === row.target.predicate_id);
    const predicates = new Map(graph.predicates.map(predicate => [predicate.id, predicate]));
    const { concerns, concernAliases } = authoredSelectionConcern(graph);
    const requirements = [];
    graph.selections.forEach((selection, selectionIndex) => {
        if (selection.selected_predicates.includes(original.id)) {
            const selected = graph.sets[selection.selected_set];
            requirements.push({ selection_index: selectionIndex, mode: 'included_predicate_concerns_selected_member',
                required_nodes: [...selected] });
            for (const alias of selected) {
                const otherCover = selection.selected_predicates.filter(id => id !== original.id)
                    .some(id => concerns(predicates.get(id), alias));
                if (!otherCover) requirements.push({ selection_index: selectionIndex,
                    mode: 'selected_member_retains_authored_reason', required_nodes: [alias] });
            }
        }
        for (const excluded of selection.excluded) if (excluded.predicates.includes(original.id))
            requirements.push({ selection_index: selectionIndex, mode: 'excluded_reason_concerns_own_candidate',
                required_nodes: [excluded.node] });
    });
    const satisfied = (predicate, requirement) => requirement.required_nodes.some(alias => concerns(predicate, alias));
    if (requirements.some(requirement => !satisfied(original, requirement))) fail('baseline_selection_foundation');
    const graphHash = sha(canonicalValue(graph));
    const sites = row.sites.map((site, siteIndex) => {
        if (!site.domain_complete) return { site_index: siteIndex, domain_complete: false,
            excluded: [], unclassified_locator_indices: null, admitted_locator_indices: null, admitted_domain_complete: false };
        const excluded = [], unclassified = [];
        site.domain.locators.forEach((locator, locatorIndex) => {
            const predicate = JSON.parse(JSON.stringify(original));
            let container = predicate;
            for (const token of site.domain.location.slice(0, -1)) container = container[token];
            container[site.domain.location.at(-1)] = JSON.parse(JSON.stringify(locator));
            const failed = requirements.filter(requirement => !satisfied(predicate, requirement));
            if (!failed.length) { unclassified.push(locatorIndex); return; }
            excluded.push({ locator_index: locatorIndex, locator, site_path: site.authored_site.site_path,
                rule: { id: 'selection_requires_authored_candidate_concern', method_authority: METHOD,
                    existing_constraint: 'normal_selection_binding_selected_and_candidate',
                    constraint_source: 'src/next/provenance/selectionBindings.js',
                    normative_confrontation: 'PATHv3_sections_3_and_5_existing_binding_and_requirement_contracts',
                    compiler_bytes_and_normative_binding_required: true },
                instances: failed.map(requirement => ({ ...requirement, predicate_id: original.id,
                    allowed_aliases: requirement.required_nodes.map(alias => ({ node: alias,
                        allowed: [...concernAliases(alias)].sort() })) })),
                unchanged_authorship_sha256: graphHash,
                basis: 'unchanged_authored_bindings_only_not_compiler_result',
                compiler_barrier_verified: false, expected_native_coordinate: null });
        });
        const complete = unclassified.length === 0;
        return { site_index: siteIndex, domain_complete: true, excluded,
            unclassified_locator_indices: unclassified, admitted_locator_indices: complete ? [] : null,
            admitted_domain_complete: complete };
    });
    // Selection controls consume only the necessary exclusions above. Do not
    // recompute a complete admission proof for every corpus row merely to
    // bind that control. The full public preparation remains unchanged.
    const admissionFoundation = privateProjection === NECESSARY_SELECTION_PROJECTION
        ? null : projectAdmissionFoundation(context, row, graph, original);
    const result = freezeDeep({ stage: 'path_v3_necessary_selection_foundation_not_qualified',
        target_id: row.target_id, qualification_id: row.qualification_id, method_authority: METHOD,
        domain_sha256: sha(canonicalValue(row.sites.map(site => site.domain))), sites,
        admission_foundation: admissionFoundation,
        admitted_domain_complete: sites.every(site => site.admitted_domain_complete),
        scope: 'necessary_authored_selection_constraints_only_unclassified_is_not_admitted',
        qualified: false, semantic_mutation_credit: 0, dp_execution: false });
    if (admissionFoundation !== null) admissionDomains.set(result, result);
    return result;
}
// Declaration of the COMPLETE normal admission frontier, not a replicated
// compiler or success of a check on M. Every pass remains an explicit proof
// obligation until its rules and instances are discharged and its actual
// checker binding has been confronted. A single-site authorship frame proves
// only unchanged bytes outside that site, NOT invariance of relational rules.
function projectAdmissionFoundation(context, row, graph, predicate) {
    const structuralDocuments = new Map(admittedDocuments(context.packageReceipt).map(entry => [entry.path, entry.value]));
    const structuralCorpus = structuralDocuments.get(corpusPath);
    const structuralBasis = { registry: structuralDocuments.get(structuralCorpus.material_registry.path),
        operatorRegistry: structuralDocuments.get(structuralCorpus.operator_registry.path),
        claim: structuralDocuments.get(structuralCorpus.claim_contract.path).claims.find(value => value.fact_key === graph.fact_key) };
    const prefix = 'src/next/provenance/';
    const declarations = [
        ['package_schemas', ['graphCompiler.js'], 'normal_document_schema_and_closed_authority'],
        ['schema_registry_projection', ['schemaRegistryProjection.js'], 'registry_schema_consistency'],
        ['static_evidence', ['graphCompiler.js'], 'snapshot_and_authored_material_identity'],
        ['graph_dependencies', ['graphCompiler.js'], 'claims_evaluators_roles_and_parent_dependencies'],
        ['operand_bindings', ['operandBindings.js'], 'evaluator_roles_and_authored_bindings'],
        ['graph_structure', ['graphStructure.js'], 'all_authored_references_and_relations'],
        ['template_references', ['templateReferences.js'], 'template_parameters_members_and_body'],
        ['predicate_types', ['predicateTypes.js', 'operatorTypes.js'], 'nominal_signatures_refinements_and_peer_relations'],
        ['obligation_bindings', ['obligationBindings.js'], 'identity_material_read_and_reference_bindings'],
        ['claim_requirements', ['claimRequirements.js', 'claimRequirementCore.js'], 'claim_roots_literals_subject_and_period_anchors'],
        ['selection_bindings', ['selectionBindings.js'], 'selection_concern_state_guards_and_coverage'],
        ['collection_requirements', ['collectionRequirements.js'], 'fixture_anchors_membership_and_candidate_bindings']
    ];
    const graphHash = sha(canonicalValue(graph));
    const predicateIndex = graph.predicates.findIndex(value => value.id === predicate.id);
    if (predicateIndex < 0) fail('admission_foundation_target');
    const passes = declarations.map(([id, sources, obligation]) => ({ id,
        checker_sources: [...new Set([...sources.map(source => prefix + source),
            ...(NORMAL_READ_RULE_CONTRACTS.find(contract => contract.pass_id === id)?.source_bindings.map(row => row.path) ?? []),
            ...(id === 'graph_structure' ? NORMAL_STRUCTURAL_LOCATOR_CONTRACT.source_bindings.map(row => row.path) : []),
            ...(id === 'predicate_types' ? NORMAL_PRIMITIVE_TYPE_CONTRACT.source_bindings.map(row => row.path) : [])])], obligation,
        instance: { fact_key: graph.fact_key, predicate_id: predicate.id,
            graph_sha256: graphHash, predicate: plain(predicate) },
        status: 'pending_normative_rule_discharge', discharged: false }));
    const replace = (value, location, expected, replacement) => {
        const output = JSON.parse(JSON.stringify(value)); let container = output;
        for (const token of location.slice(0, -1)) {
            if (!container || !Object.hasOwn(container, token)) fail('admission_frame_coordinate');
            container = container[token];
        }
        const leaf = location.at(-1);
        if (!container || !Object.hasOwn(container, leaf) || !equal(container[leaf], expected))
            fail('admission_frame_locator');
        container[leaf] = replacement;
        return output;
    };
    const sites = row.sites.map((site, siteIndex) => {
        if (!site.domain_complete) return { site_index: siteIndex, graph_location: null,
            unchanged_authorship_sha256: null, frames: null, domain_complete: false };
        const location = ['predicates', predicateIndex, ...site.domain.location];
        const erasedHash = sha(canonicalValue(replace(graph, location, site.domain.original, null)));
        const frames = site.domain.locators.map((locator, locatorIndex) => {
            const mutant = replace(graph, location, site.domain.original, plain(locator));
            const unchanged = sha(canonicalValue(replace(mutant, location, locator, null)));
            if (unchanged !== erasedHash) fail('admission_frame_changed');
            return { locator_index: locatorIndex,
                original_locator_sha256: sha(canonicalValue(site.domain.original)),
                alternative_locator_sha256: sha(canonicalValue(locator)),
                mutant_authorship_sha256: sha(canonicalValue(mutant)),
                unchanged_authorship_sha256: unchanged,
                rule_dependency_frames: projectAdmissionRuleDependencyFrames(graph, mutant, predicateIndex),
                structural_locator_constraint: projectStructuralLocatorConstraint(structuralBasis, graph, predicate, site, locator),
                single_site_frame_verified: true, normal_rule_frame_proved: false };
        });
        return { site_index: siteIndex, domain_complete: true, graph_location: location,
            unchanged_authorship_sha256: erasedHash, frames };
    });
    // Compose the already declared finite lemmas for EVERY genuine L member.
    // Query equality and a matching primitive/schema branch are conditional
    // preservation, not a positive baseline, executed barrier or reviewed
    // checker authority. Missing coverage cannot be hidden by an aggregate
    // count, a duplicated rule or success of a later compile on M.
    const compositionSites = sites.map(site => ({ site_index: site.site_index,
        domain_complete: site.domain_complete,
        unchanged_authorship_sha256: site.unchanged_authorship_sha256,
        locators: site.frames?.map(frame => {
            const reads = frame.rule_dependency_frames, constraint = frame.structural_locator_constraint;
            const readTableComplete = reads.length === NORMAL_READ_RULE_CONTRACTS.length
                && new Set(reads.map(rule => rule.pass_id)).size === reads.length
                && reads.every(rule => NORMAL_READ_RULE_CONTRACTS.some(contract => contract.pass_id === rule.pass_id));
            const passCoverage = passes.map(pass => {
                const contract = NORMAL_READ_RULE_CONTRACTS.find(contract => contract.pass_id === pass.id);
                const query = reads.find(rule => rule.pass_id === pass.id);
                const special = pass.id === 'package_schemas' ? {
                    contract: NORMAL_PACKAGE_SCHEMA_CONTRACT,
                    verified: constraint.schema_locator_constraint.contract_sha256 === sha(canonicalValue(NORMAL_PACKAGE_SCHEMA_CONTRACT))
                        && constraint.schema_locator_constraint.locator_sha256 === frame.alternative_locator_sha256
                        && constraint.schema_locator_constraint.shape_preservation_verified
                        && constraint.schema_locator_constraint.predicate_identity_uniqueness_preserved
                } : pass.id === 'graph_structure' ? {
                    contract: NORMAL_STRUCTURAL_LOCATOR_CONTRACT,
                    verified: constraint.contract_sha256 === sha(canonicalValue(NORMAL_STRUCTURAL_LOCATOR_CONTRACT))
                        && constraint.locator_sha256 === frame.alternative_locator_sha256
                        && constraint.baseline_locator_resolved && constraint.resolution === 'present_authored_locator'
                } : pass.id === 'predicate_types' ? {
                    contract: NORMAL_PRIMITIVE_TYPE_CONTRACT,
                    verified: constraint.primitive_type_constraint.contract_sha256 === sha(canonicalValue(NORMAL_PRIMITIVE_TYPE_CONTRACT))
                        && constraint.primitive_type_constraint.locator_sha256 === frame.alternative_locator_sha256
                        && constraint.primitive_type_constraint.conditional_preservation_verified
                } : null;
                return { pass_id: pass.id,
                    contract_sha256: contract ? sha(canonicalValue(contract)) : special ? sha(canonicalValue(special.contract)) : null,
                    conditional_preservation_verified: frame.single_site_frame_verified && readTableComplete
                        && (contract ? !!query && query.normal_read_rule_contract_sha256 === sha(canonicalValue(contract))
                            && query.dependency_frame_verified && query.conditional_preservation_verified
                            && query.baseline_projection_sha256 === query.mutant_projection_sha256
                            : special?.verified === true),
                    baseline_projection_sha256: query?.baseline_projection_sha256 ?? null,
                    mutant_projection_sha256: query?.mutant_projection_sha256 ?? null,
                    discharged: false };
            });
            const covered = passCoverage.every(pass => pass.conditional_preservation_verified);
            return { locator_index: frame.locator_index,
                alternative_locator_sha256: frame.alternative_locator_sha256,
                mutant_authorship_sha256: frame.mutant_authorship_sha256,
                pass_coverage: passCoverage,
                status: covered ? 'conditionally_preserved_pending_baseline_binding_and_controls'
                    : 'blocked_incomplete_normal_rule_coverage', admitted: false, discharged: false };
        }) ?? null }));
    const normalRuleComposition = {
        format: 'financasbot.path-normal-rule-composition', version: 1,
        method_authority: METHOD, graph_sha256: graphHash,
        domain_sha256: sha(canonicalValue(row.sites.map(site => site.domain))),
        pass_ids: passes.map(pass => pass.id), sites: compositionSites,
        conditional_coverage_complete: compositionSites.every(site => site.domain_complete
            && site.locators.every(member => member.status === 'conditionally_preserved_pending_baseline_binding_and_controls')),
        required_premises: { normal_baseline_admission_verified: false, normal_checker_binding_verified: false,
            independent_reviewed_rule_basis_verified: false, site_admission_controls_verified: false,
            whole_actual_program_conformance_verified: false, normal_positive_restoration_verified: false },
        scope: 'complete_finite_conditional_preservation_only_not_admitted_A_or_executed_W',
        admitted_domain_complete: false, compiler_result_used: false,
        qualified: false, semantic_mutation_credit: 0, dp_execution: false
    };
    return { format: 'financasbot.path-admission-foundation', version: 1,
        stage: 'normal_rule_obligations_and_single_site_frames_before_mutant',
        method_authority: METHOD, graph_sha256: graphHash,
        documents: admittedDocuments(context.packageReceipt).map(entry => ({ path: entry.path, sha256: entry.sha256 })),
        normal_read_rule_contracts: NORMAL_READ_RULE_CONTRACTS,
        normal_structural_locator_contract: NORMAL_STRUCTURAL_LOCATOR_CONTRACT,
        normal_package_schema_contract: NORMAL_PACKAGE_SCHEMA_CONTRACT,
        normal_primitive_type_contract: NORMAL_PRIMITIVE_TYPE_CONTRACT,
        normal_rule_composition: normalRuleComposition,
        passes, sites, normal_pipeline_binding_verified: false,
        rule_discharge_complete: false, compiler_result_used: false,
        qualified: false, semantic_mutation_credit: 0, dp_execution: false };
}
function projectStructuralLocatorConstraint({ registry, claim, operatorRegistry }, graph, predicate, site, locator) {
    const definition = site.authored_site.definition;
    const resolve = path => {
        if (definition === 'claimPath') {
            let value = claim;
            if (!Array.isArray(path.segments) || !path.segments.length) return false;
            for (const key of path.segments) {
                if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, key)) return false;
                value = value[key];
            }
            return true;
        }
        if (!['fieldPath', 'selector'].includes(definition)) fail('structural_locator_definition');
        const anchored = definition === 'fieldPath';
        const kind = anchored ? graph.nodes[path.node]?.kind : path.kind;
        const originalKind = anchored ? graph.nodes[site.domain.original.node]?.kind : site.domain.original.kind;
        const descriptor = registry.kinds[kind]?.fields?.[path.segments?.[0]];
        // Complete L already preserves kind, nominal type, unit and form. The
        // normal argument resolver additionally requires an authored material
        // field. It does not require this field to exist in a snapshot payload.
        if (!kind || kind !== originalKind || !Array.isArray(path.segments) || path.segments.length !== 1
            || !descriptor || descriptor.class === 'non_material') fail('structural_locator_material_L');
        return true;
    };
    if (!resolve(site.domain.original)) fail('structural_locator_baseline');
    const present = resolve(locator);
    const primitiveNominal = path => {
        if (definition === 'claimPath') return null;
        const kind = definition === 'fieldPath' ? graph.nodes[path.node]?.kind : path.kind;
        const name = path.segments[0], descriptor = registry.kinds[kind]?.fields?.[name];
        if (!descriptor || descriptor.class === 'non_material'
            || !NORMAL_PRIMITIVE_TYPE_CONTRACT.primitive_types.includes(descriptor.type)) return null;
        const type = { form: 'scalar', type: descriptor.type };
        if (descriptor.type === 'id') type.kind = name === 'id' ? kind : kind + '.' + name;
        if (descriptor.type === 'money_minor') type.unit = 'BRL_minor';
        if (descriptor.type === 'enum') type.domain = JSON.stringify([...descriptor.values].sort());
        return type;
    };
    const baselineNominal = primitiveNominal(site.domain.original), alternativeNominal = primitiveNominal(locator);
    const operator = operatorRegistry.operators.find(operator => operator.id === predicate.op);
    if (!operator) fail('primitive_type_operator');
    const typePreserved = !!baselineNominal && !!alternativeNominal
        && equal(baselineNominal, site.domain.original_nominal) && equal(baselineNominal, alternativeNominal);
    const primitiveTypeConstraint = {
        checker: 'predicate_types', contract_sha256: sha(canonicalValue(NORMAL_PRIMITIVE_TYPE_CONTRACT)),
        definition, locator_sha256: sha(canonicalValue(locator)),
        baseline_nominal: baselineNominal, alternative_nominal: alternativeNominal,
        operator_instance: plain(operator),
        status: typePreserved ? 'same_normal_material_primitive_type_under_explicit_premises'
            : definition === 'claimPath' ? 'blocked_claim_type_basis' : 'blocked_reference_record_or_nominal_basis',
        conditional_preservation_verified: typePreserved,
        window_and_set_inference_unchanged: true,
        nonliteral_material_known_values_used_for_refinement: false,
        normal_baseline_admission_verified: false, normal_checker_binding_verified: false,
        compiler_result_used: false, discharged: false, qualified: false
    };
    const keys = definition === 'fieldPath' ? ['node', 'segments']
        : definition === 'selector' ? ['kind', 'segments'] : ['segments'];
    const shape = Object.keys(locator).sort().join(',') === [...keys].sort().join(',')
        && Array.isArray(locator.segments) && locator.segments.length > 0
        && locator.segments.every(key => typeof key === 'string' && /^[a-z][a-z0-9_]*$/.test(key))
        && (definition !== 'fieldPath' || typeof locator.node === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(locator.node))
        && (definition !== 'selector' || ['family', 'person', 'account', 'card', 'category', 'event', 'budget', 'bill',
            'source_state', 'proposal', 'reminder', 'calendar_event', 'side_effect', 'merchant_rule', 'fixture', 'collection',
            'source_origin', 'merchant_identity', 'transfer_identity', 'installment_plan', 'turn', 'derived_claim',
            'evaluation_policy'].includes(locator.kind));
    const schemaLocatorConstraint = {
        checker: 'package_schemas', contract_sha256: sha(canonicalValue(NORMAL_PACKAGE_SCHEMA_CONTRACT)),
        definition, locator_sha256: sha(canonicalValue(locator)),
        shape_preservation_verified: shape,
        predicate_identity_uniqueness_preserved: new Set(graph.predicates.map(row => row.id)).size === graph.predicates.length,
        basis: 'same_schema_locator_branch_and_whole_single_site_frame_under_positive_normal_baseline',
        normal_baseline_admission_verified: false, normal_checker_binding_verified: false,
        compiler_result_used: false, discharged: false, qualified: false
    };
    return { checker: 'graph_structure', contract_sha256: sha(canonicalValue(NORMAL_STRUCTURAL_LOCATOR_CONTRACT)),
        definition, locator_sha256: sha(canonicalValue(locator)),
        baseline_locator_resolved: true,
        resolution: present ? 'present_authored_locator' : 'absent_authored_claim_path',
        expected_native_coordinate: present ? null : { checker: 'graph_structure', code: 'claim_path',
            fact_key: graph.fact_key, predicate_id: predicate.id, operand_index: site.authored_site.site_path[1],
            site_path: plain(site.authored_site.site_path) },
        basis: 'whole_authored_claim_or_material_registry_and_genuine_L_not_compiler_result',
        primitive_type_constraint: primitiveTypeConstraint,
        schema_locator_constraint: schemaLocatorConstraint,
        normal_baseline_admission_verified: false, normal_checker_binding_verified: false,
        compiler_result_used: false, qualified: false };
}
// Closed declarative read queries of the existing relational rules. They
// retain every potentially participating predicate BEFORE matching its args:
// selecting only currently matching anchors would miss membership changes.
// Query equality is a dependency frame, not an admission result. Its claimed
// read coverage still requires binding/confrontation with the real checker.
function projectAdmissionRuleDependencyFrames(baseline, mutant, predicateIndex) {
    const metadata = predicate => ({ id: predicate.id, op: predicate.op,
        obligation: predicate.obligation, atom: predicate.atom });
    const withoutPredicates = graph => {
        const { predicates, ...unchanged } = graph;
        return unchanged;
    };
    const relations = [
        { id: 'static_evidence', basis: 'unchanged_graph_and_documents_no_predicate_argument_reads',
            project: withoutPredicates },
        { id: 'graph_dependencies', basis: 'unchanged_graph_and_documents_no_predicate_argument_reads',
            project: withoutPredicates },
        { id: 'operand_bindings', basis: 'unchanged_graph_and_documents_no_predicate_argument_reads',
            project: withoutPredicates },
        { id: 'schema_registry_projection', basis: 'unchanged_non_corpus_schema_registry_documents_no_graph_argument_reads',
            project: withoutPredicates },
        { id: 'template_references', basis: 'all_template_arguments_and_set_peer_operands_with_nodes_sets_windows_and_unchanged_documents',
            project: graph => ({ fact_key: graph.fact_key, nodes: graph.nodes, sets: graph.sets, windows: graph.windows,
                predicates: graph.predicates.map(predicate => ({ id: predicate.id,
                    // Only genuine locator leaves change. Top-level template
                    // or set membership cannot be created/erased by that
                    // replacement. Retain ALL templates and set peers, not
                    // merely the template currently matching this target.
                    args: predicate.args.map(arg => Object.hasOwn(arg, 'template') || Object.hasOwn(arg, 'set') ? arg : null) })) }) },
        { id: 'obligation_bindings', basis: 'all_predicate_metadata_participating_arguments_and_entire_graph_roots_with_unchanged_documents',
            project: graph => ({ ...withoutPredicates(graph),
                predicates: graph.predicates.map(predicate => {
                    const sensitive = ['node_identity', 'semantic_integrity'].includes(predicate.obligation)
                        || ['kind_is', 'fingerprint_is', 'ref_targets_node'].includes(predicate.op);
                    return { ...metadata(predicate), participating_arguments: sensitive ? predicate.args : null };
                }) }) },
        { id: 'claim_requirements', basis: 'ordinary_all_direct_claim_roots_descriptor_subject_period_arguments_and_graph_roots_with_unchanged_claims',
            project: graph => ({ ...withoutPredicates(graph),
                predicates: graph.predicates.map(predicate => ({ ...metadata(predicate),
                    direct_claim_roots: predicate.args.map(arg => arg.claim?.segments?.[0] ?? null),
                    // Conservative full arguments for all potential anchors,
                    // including failure attribution; never just the target.
                    participating_arguments: ['subject_scope', 'period', 'time_basis', 'coverage', 'evidence_state']
                        .includes(predicate.obligation) ? predicate.args : null })) }) },
        { id: 'collection_requirements', basis: 'all_fixture_membership_anchor_arguments_and_entire_graph_roots_with_unchanged_snapshot_registry_documents',
            project: graph => ({ ...withoutPredicates(graph),
                predicates: graph.predicates.map(predicate => ({ ...metadata(predicate),
                    participating_arguments: ['coverage', 'evidence_set'].includes(predicate.obligation) ? predicate.args : null })) }) },
        { id: 'selection_bindings', basis: 'all_selection_referenced_predicate_arguments_metadata_and_entire_graph_roots_with_unchanged_claim_registry_documents',
            project: graph => {
                // The normal pass resolves IDs from the entire ordered map,
                // but reads argument bodies only for included/excluded IDs.
                // Retain ALL such predicates and all roots, not merely the
                // currently selected target or a sampled selection.
                const referenced = new Set(graph.selections.flatMap(selection => [
                    ...selection.selected_predicates, ...selection.excluded.flatMap(row => row.predicates)]));
                return { ...withoutPredicates(graph), predicates: graph.predicates.map(predicate => ({ ...metadata(predicate),
                    participating_arguments: referenced.has(predicate.id) ? predicate.args : null })) };
            } }
    ];
    return relations.map(({ id, basis, project }) => {
        const before = sha(canonicalValue(project(baseline))), after = sha(canonicalValue(project(mutant)));
        const contract = NORMAL_READ_RULE_CONTRACTS.find(contract => contract.pass_id === id);
        return { pass_id: id, basis, baseline_projection_sha256: before, mutant_projection_sha256: after,
            dependency_frame_verified: before === after,
            normal_read_rule_contract_sha256: contract ? sha(canonicalValue(contract)) : null,
            conditional_preservation_verified: !!contract && before === after,
            normal_checker_read_coverage_verified: false, discharged: false };
    });
}
function verifyPathQualificationAdmissionDomain(raw) {
    const { domain, candidate } = fields(raw, ['domain', 'candidate']);
    const expected = admissionDomains.get(domain);
    if (!expected) fail('admission_foundation_origin');
    fields(candidate, Object.keys(expected));
    if (!equal(plain(candidate), expected)) fail('admission_foundation_changed');
    return freezeDeep({ foundation_integrity: true, admitted_domain_complete: expected.admitted_domain_complete,
        qualified: false, semantic_mutation_credit: 0, dp_execution: false });
}
// Trusted BUILD preselection, not an admitted W domain or guest execution
// authority. Reuse the existing independent frozen-world reference unchanged.
// In particular, unclassified A members never become admitted by discrimination.
function preparePathQualificationWitnessPreselection(raw) {
    const { preparation, rowIndex } = fields(raw, ['preparation', 'rowIndex']);
    const context = contexts.get(preparation);
    if (!context || !Number.isSafeInteger(rowIndex) || rowIndex < 0 || !context.rows[rowIndex])
        fail('witness_preparation_authority');
    const started = context.witnessPreselectionRows ||= new Set();
    if (started.has(rowIndex)) fail('witness_preselection_replay');
    // Commit before any materialization/reference. Failure cannot be retried
    // on this preparation to pick a different candidate after an observation.
    started.add(rowIndex);
    const row = context.rows[rowIndex];
    if (!row.sites.every(site => site.domain_complete)) fail('witness_locator_domain_incomplete');
    const admission = preparePathQualificationAdmissionDomain({ preparation, rowIndex });
    const ruleComposition = admission.admission_foundation.normal_rule_composition;
    const { sealPathQualificationReference, readPathSemanticReference } = require('./pathSemanticReference');
    const entries = [], partitionEntries = [];
    let selected = null, selectedCandidate = null;
    row.sites.forEach((site, siteIndex) => {
        const exclusions = new Set(admission.sites[siteIndex].excluded.map(entry => entry.locator_index));
        site.domain.locators.forEach((locator, locatorIndex) => {
            const base = { entry_index: entries.length, site_index: siteIndex, locator_index: locatorIndex,
                authored_site: site.authored_site, locator };
            const ruleBasis = ruleComposition.sites[siteIndex]?.locators?.[locatorIndex];
            const conditionalRules = !!ruleBasis
                && ruleBasis.locator_index === locatorIndex
                && ruleBasis.alternative_locator_sha256 === sha(canonicalValue(locator))
                && ruleBasis.status === 'conditionally_preserved_pending_baseline_binding_and_controls'
                && canonicalValue(ruleBasis.pass_coverage.map(pass => pass.pass_id)) === canonicalValue(ruleComposition.pass_ids)
                && ruleBasis.pass_coverage.every(pass => pass.conditional_preservation_verified === true);
            const partitionBase = { entry_index: base.entry_index, site_index: siteIndex, locator_index: locatorIndex,
                locator_sha256: sha(canonicalValue(locator)),
                normal_rule_basis_sha256: ruleBasis ? sha(canonicalValue(ruleBasis)) : null,
                conditional_rule_preservation_verified: conditionalRules };
            if (exclusions.has(locatorIndex)) {
                entries.push({ ...base, admission: 'necessary_exclusion_not_native_control',
                    reference: null, candidate_id: null, invocation_id: null });
                partitionEntries.push({ ...partitionBase, reference_sha256: null,
                    classification: conditionalRules ? 'blocked_contradictory_rule_partition'
                        : 'necessary_exclusion_pending_native_barrier' });
                return;
            }
            const candidate = materializePathQualificationLocator({ preparation, rowIndex, siteIndex, locatorIndex });
            const reference = sealPathQualificationReference({ candidate });
            if (readPathSemanticReference(reference) !== reference || reference.method_version !== 3
                || reference.invocation_id !== candidate.invocation_id || reference.candidate_id !== candidate.candidate_id
                || reference.mutation_id !== row.target_id) fail('witness_reference_identity');
            const entry = { ...base, admission: 'unclassified', reference,
                candidate_id: candidate.candidate_id, invocation_id: candidate.invocation_id };
            entries.push(entry);
            const available = reference.available === true && reference.baseline_satisfied === true
                && typeof reference.mutant_satisfied === 'boolean';
            const classification = !conditionalRules ? 'blocked_normal_rule_coverage'
                : !available ? 'blocked_semantic_reference'
                    : reference.discriminating === true && reference.mutant_satisfied === false ? 'conditional_witness'
                        : reference.discriminating === false && reference.mutant_satisfied === true ? 'conditional_non_witness'
                            : 'blocked_semantic_reference_relation';
            partitionEntries.push({ ...partitionBase, reference_sha256: sha(canonicalValue(reference)), classification });
            // A known discriminant with missing normal-rule coverage cannot
            // be selected. This is still conditional, not a proved A/W or a
            // fallback after observing M; every entry precedes compilation.
            if (selected === null && classification === 'conditional_witness') {
                selected = { entry_index: entry.entry_index, site_index: siteIndex, locator_index: locatorIndex,
                    candidate_id: candidate.candidate_id, invocation_id: candidate.invocation_id,
                    reference_sha256: sha(canonicalValue(reference)) };
                selectedCandidate = candidate;
            }
        });
    });
    const conditionalAdmissionComplete = partitionEntries.every(entry =>
        entry.classification === 'necessary_exclusion_pending_native_barrier'
        || (entry.conditional_rule_preservation_verified && entry.classification !== 'blocked_contradictory_rule_partition'));
    const conditionalPartition = freezeDeep({ stage: 'path_v3_conditional_admission_witness_partition_sealed_before_compile',
        method_authority: METHOD, target_id: row.target_id, domain_sha256: admission.domain_sha256,
        normal_rule_composition_sha256: sha(canonicalValue(ruleComposition)), entries: partitionEntries,
        conditional_admission_partition_complete: conditionalAdmissionComplete,
        conditional_witness_partition_complete: conditionalAdmissionComplete
            && partitionEntries.every(entry => !entry.classification.startsWith('blocked_')),
        first_conditional_witness_entry_index: selected?.entry_index ?? null,
        required_premises: ruleComposition.required_premises,
        scope: 'finite_conditional_partition_only_not_admitted_A_proved_W_or_execution_authority',
        admitted_domain_complete: false, witness_domain_complete: false, first_witness_proved: false,
        compiler_result_used: false, qualified: false, semantic_mutation_credit: 0, dp_execution: false });
    // Reuse the existing v2 unknown_path materializer and native-control
    // transport for EVERY authored site, including a row with typed L. These
    // are admission negatives, never typed L members or semantic witnesses.
    // Coordinates and the namespace are committed before any normal compile.
    const siteAdmissionControlPlan = freezeDeep({ stage: 'path_v3_witness_site_native_controls_prepared_not_qualified',
        target_id: row.target_id, qualification_id: row.qualification_id,
        domain_sha256: admission.domain_sha256, method_authority: METHOD, admission_authority: ADDENDUM,
        locator_domain_empty: row.sites.every(site => site.domain.locators.length === 0),
        controls: row.sites.map(site => ({ admission_id: site.authored_site.mutation_id,
            namespace: site.domain.namespace, authored_site: site.authored_site,
            expected_diagnostic: { checker: 'graph_structure',
                code: site.authored_site.definition === 'claimPath' ? 'claim_path' : 'path_missing',
                fact_key: row.target.fact_key, predicate_id: row.target.predicate_id,
                operand_index: site.authored_site.site_path[1], site_path: site.authored_site.site_path } })),
        scope: 'per_site_normal_native_admission_controls_not_empty_A_or_semantic_W',
        qualified: false, semantic_mutation_credit: 0, dp_execution: false });
    staticPlans.set(siteAdmissionControlPlan, { context, row, rowIndex,
        controls: siteAdmissionControlPlan.controls, purpose: 'witness_site_admission', usedSites: new Set() });
    const selectionAdmissionControlPlan = preparePathSelectionAdmissionControls({ preparation, rowIndex });
    selectionControlPlans.get(selectionAdmissionControlPlan).usedControls = new Set();
    const result = freezeDeep({ stage: 'path_v3_independent_reference_preselection_before_compile',
        method_authority: METHOD, qualification_id: row.qualification_id, target_id: row.target_id,
        baseline_package: preparation.authority_refs, row_index: rowIndex,
        domain_sha256: admission.domain_sha256, admission_foundation: admission,
        entries, entries_sha256: sha(canonicalValue(entries)), selected,
        conditional_domain_partition: conditionalPartition,
        conditional_domain_partition_sha256: sha(canonicalValue(conditionalPartition)),
        site_admission_control_plan: siteAdmissionControlPlan,
        site_admission_control_plan_sha256: sha(canonicalValue(siteAdmissionControlPlan)),
        selection_admission_control_plan: selectionAdmissionControlPlan,
        selection_admission_control_plan_sha256: sha(canonicalValue(selectionAdmissionControlPlan)),
        selection_rule: 'first_conditionally_preserved_known_discriminating_reference_in_authored_site_locator_order_not_first_proved_W',
        expected_violations: selected ? entries[selected.entry_index].reference.expected_violations : null,
        locator_domain_complete: true, admitted_domain_complete: admission.admitted_domain_complete,
        witness_domain_complete: false, first_witness_proved: false, normal_admission_verified: false,
        disposition: 'blocked', status: selected ? 'preselected_discriminating_reference_not_qualified'
            : entries.some(entry => entry.reference?.discriminating === true)
                ? 'blocked_known_discriminant_without_normal_rule_coverage_not_equivalence'
                : 'blocked_no_known_discriminating_reference_not_equivalence',
        qualified: false, semantic_mutation_credit: 0, dp_execution: false,
        effect_closure_complete: false, validation_tcb_complete: false, global_g11: false });
    witnessPreselections.set(result, { candidate: selectedCandidate, consumed: false });
    return result;
}
function takePathQualificationWitnessPreselection(raw) {
    const { plan } = fields(raw, ['plan']);
    const stored = witnessPreselections.get(plan);
    if (!stored || stored.consumed) fail('witness_preselection_origin_or_replay');
    stored.consumed = true;
    if (!stored.candidate) fail('witness_preselection_missing_candidate');
    // Only the preselected genuine candidate is released. No observed result,
    // selected index or caller reference is accepted; no fallback iterator.
    return stored.candidate;
}
function preparePathProofAuthorship(raw) {
    const { preparation, factKey } = fields(raw, ['preparation', 'factKey']);
    const context = contexts.get(preparation);
    if (!context) fail('proof_authorship_preparation');
    const projected = projectPathInventoryAuthoredProof({ inventoryCandidate: context.inventory, factKey });
    return proofAuthorship(projected);
}
function proofAuthorship(projected) {
    const { graph } = projected, { concerns } = authoredSelectionConcern(graph);
    const predicates = new Map(graph.predicates.map(predicate => [predicate.id, predicate]));
    const selections = graph.selections.map(selection => {
        const excluded = new Map(selection.excluded.map(row => [row.node, row]));
        return { candidate_set: selection.candidate_set, selected_set: selection.selected_set,
            cases: graph.sets[selection.candidate_set].map(node => ({ node,
                identity: { kind: graph.nodes[node].kind, ref_id: graph.nodes[node].ref_id, version: graph.nodes[node].version },
                mode: excluded.has(node) ? 'exclude_if_all' : 'include_if_all',
                predicates: excluded.has(node) ? [...excluded.get(node).predicates]
                    : selection.selected_predicates.filter(id => concerns(predicates.get(id), node)) })) };
    });
    const input = freezeDeep({ ...projected.input, selections });
    const receipt = freezeDeep({ stage: 'path_v3_proof_authorship_projection_not_qualified', fact_key: graph.fact_key,
        method_authority: METHOD, authority_refs: projected.authority_refs,
        authored_graph_sha256: sha(canonicalValue(graph)), input_sha256: sha(canonicalValue(input)),
        typed_foundation: projected.basis, independent_compiler: false, qualified: false, semantic_mutation_credit: 0 });
    proofAuthorships.set(receipt, input);
    return receipt;
}
function readPathProofAuthorship(raw) {
    const { authorship } = fields(raw, ['authorship']);
    const input = proofAuthorships.get(authorship);
    if (!input) fail('proof_authorship_origin');
    return input;
}
function preparePathPhaseAuthorship(raw) {
    const { preparation, factKey, phaseProfile } = fields(raw, ['preparation', 'factKey', 'phaseProfile']);
    const context = contexts.get(preparation);
    if (!context) fail('phase_authorship_preparation');
    return phaseAuthorship(context, factKey, phaseProfile,
        projectPathInventoryAuthoredProof({ inventoryCandidate: context.inventory, factKey }));
}
function phaseAuthorship(context, factKey, phaseProfile, projected) {
    const proof = proofAuthorship(projected);
    const input = readPathProofAuthorship({ authorship: proof });
    const documents = new Map(admittedDocuments(context.packageReceipt).map(row => [row.path, row.value]));
    const corpus = documents.get(corpusPath), graph = corpus.graphs.find(row => row.fact_key === factKey);
    const claim = documents.get(corpus.claim_contract.path).claims.find(row => row.fact_key === factKey);
    const registry = [...documents.values()].find(row => row.registry_id === 'metric_evaluator_registry');
    if (!graph || !claim || !registry) fail('phase_authorship_inventory');
    // The existing pinned profile is an explicit shared normative foundation.
    // This does not infer a mode from compiled IR or from the observed program.
    const mode = resolvePhaseCompositionMode(phaseProfile, registry, claim.evaluator_ref, claim.metric);
    const profile = phaseCompositionCommitment(phaseProfile);
    const associations = graph.selections.flatMap(selection => {
        const candidates = graph.sets[selection.candidate_set];
        const roles = Object.entries(claim.operand_bindings).filter(([, row]) => row.kind === 'node_set'
            && equal(row.aliases, candidates));
        if (roles.length > 1) fail('phase_authorship_role_ambiguity');
        return roles.length ? [{ role: roles[0][0], candidate_set: selection.candidate_set,
            selected_set: selection.selected_set }] : [];
    });
    const predicateIds = new Set((mode === 'formula_plus_selection_guards' ? graph.selections : [])
        .filter(selection => associations.some(row => row.candidate_set === selection.candidate_set
            && row.selected_set === selection.selected_set))
        .flatMap(selection => [...selection.selected_predicates, ...selection.excluded.flatMap(row => row.predicates)]));
    const predicates = input.predicates.filter(row => predicateIds.has(row.id));
    if (predicates.length !== predicateIds.size) fail('phase_authorship_predicate_inventory');
    const derivation = freezeDeep({ ...input, predicates, selections: [] });
    const receipt = freezeDeep({ stage: 'path_v3_phase_authorship_projection_not_qualified', fact_key: factKey,
        method_authority: METHOD, authority_refs: proof.authority_refs,
        authored_graph_sha256: proof.authored_graph_sha256,
        input_sha256: sha(canonicalValue({ derivation, proof: input })),
        derivation_mode: mode, derivation_predicate_ids: predicates.map(row => row.id),
        authored_role_associations: associations,
        profile_sha256: profile.sha256, registry_sha256: profile.registry_sha256,
        shared_reviewed_phase_profile: true, independent_compiler: false, qualified: false, semantic_mutation_credit: 0 });
    phaseAuthorships.set(receipt, freezeDeep({ derivation, proof: input, profile }));
    return receipt;
}
function readPathPhaseAuthorship(raw) {
    const { authorship } = fields(raw, ['authorship']);
    const input = phaseAuthorships.get(authorship);
    if (!input) fail('phase_authorship_origin');
    return input;
}
function preparePathCandidateProgramAuthorship(raw) {
    const { candidate, phaseProfile } = fields(raw, ['candidate', 'phaseProfile']);
    const stored = candidatePackages.get(candidate);
    if (!stored || stored.consumed) fail('program_family_candidate_origin_or_late');
    const context = stored.sourceContext, profile = phaseCompositionCommitment(phaseProfile);
    const admissionRow = context.rows.find(row => row.target_id === candidate.target_id);
    const admissionGraph = admittedDocuments(context.packageReceipt).find(entry => entry.path === corpusPath)
        .value.graphs.find(graph => graph.fact_key === candidate.target.fact_key);
    const admissionPredicate = admissionGraph?.predicates.find(predicate => predicate.id === candidate.target.predicate_id);
    if (!admissionRow || !admissionGraph || !admissionPredicate) fail('program_family_admission_target');
    const admissionFoundation = freezeDeep(projectAdmissionFoundation(context, admissionRow, admissionGraph, admissionPredicate));
    const bases = context.programBases ||= new Map();
    let baseline = bases.get(phaseProfile);
    if (!baseline) {
        const rows = context.irSeal.expected.order.map(factKey => ({ fact_key: factKey,
            authorship: phaseAuthorship(context, factKey, phaseProfile,
                projectPathInventoryAuthoredProof({ inventoryCandidate: context.inventory, factKey })) }));
        const basis = freezeDeep({ authority_refs: context.inventory.authority_refs,
            profile_sha256: profile.sha256, registry_sha256: profile.registry_sha256,
            inputs: rows.map(row => ({ fact_key: row.fact_key, authored_input_sha256: row.authorship.input_sha256,
                authored_graph_sha256: row.authorship.authored_graph_sha256 })) });
        const documents = admittedDocuments(context.packageReceipt);
        const claimSchema = documents.find(row => row.path === 'docs/contracts/next/provenance-v2/claim-contract.schema.json');
        if (!claimSchema) fail('claim_shape_authorial_schema');
        const registry = documents.find(row => row.value?.registry_id === 'metric_evaluator_registry');
        if (!registry) fail('metric_authorial_registry');
        const contracts = registry.value.entries.map(entry => {
            const document = documents.find(row => row.path === entry.contract_path);
            if (!document) fail('metric_authorial_contract');
            return { path: document.path, sha256: document.sha256, value: document.value };
        });
        const metricBindings = rows.map(row => {
            // irSeal.expected is the independent AUTHORIAL projection, never
            // the observed compiler IR. The single-site patch changes neither
            // claim roles nor populations/evaluator identity.
            const graph = context.irSeal.expected.graphs.find(graph => graph.fact_key === row.fact_key);
            const selected = new Set(graph.selections.map(selection => selection.selected_set));
            return { fact_key: row.fact_key, evaluator_ref: graph.evaluator_ref,
                claim: graph.claim, operands: graph.operands, derivation_bindings: {
                    sets: Object.entries(graph.sets).filter(([name]) => !selected.has(name))
                        .map(([name, aliases]) => ({ name, aliases })),
                    selections: row.authorship.authored_role_associations } };
        });
        const capabilitySeeds = rows.map(row => {
            const graph = context.irSeal.expected.graphs.find(graph => graph.fact_key === row.fact_key);
            const selected = new Set(graph.selections.map(selection => selection.selected_set));
            return { fact_key: graph.fact_key, nodes: graph.nodes, edges: graph.edges, operands: graph.operands,
                input_sets: Object.entries(graph.sets).filter(([name]) => !selected.has(name))
                    .map(([name, aliases]) => ({ name, aliases })),
                selected_sets: graph.selections.map(selection => ({ candidate_set: selection.candidate_set,
                    selected_set: selection.selected_set, runtime_membership_not_pinned_to_authored_output: true })),
                material_descriptors: readPathPhaseAuthorship({ authorship: row.authorship }).proof.materials,
                // Reuse the NORMAL admitted projection, not a new schema
                // interpreter. Retain shape only, never the backing value or R.
                claim_context: { shape: plain(projectClaimContext(graph.claim, claimSchema.value).shape),
                    schema_path: claimSchema.path, schema_sha256: claimSchema.sha256,
                    authored_claim_sha256: sha(canonicalValue(graph.claim)),
                    scope: 'shared_normal_admitted_shape_not_presence_effects_or_financial_result' },
                claim_context_origin: 'admitted_claim_context_not_guest_backing_object',
                parent_receipts_admitted: false };
        });
        baseline = freezeDeep({ basis, rows, metricBindings, capabilitySeeds, metricAuthority: {
            registry: { path: registry.path, sha256: registry.sha256, value: registry.value }, contracts } });
        bases.set(phaseProfile, baseline);
    }
    const mutant = ['unknown_path_control_for_empty_L', 'unknown_path_control_for_witness_site'].includes(candidate.candidate_kind) ? null : {
        fact_key: candidate.target.fact_key,
        authorship: phaseAuthorship({ ...context, packageReceipt: stored.packageReceipt }, candidate.target.fact_key,
            phaseProfile, projectPathSingleSiteAuthoredProof({ inventoryCandidate: context.inventory,
                packageReceipt: stored.packageReceipt, changedFactKey: candidate.target.fact_key,
                factKey: candidate.target.fact_key })) };
    const receipt = freezeDeep({ stage: 'path_v3_whole_program_authorship_family_before_compile',
        invocation_id: candidate.invocation_id, candidate_id: candidate.candidate_id,
        whole_ir_reference: stored.wholeIRReference, baseline_basis_sha256: sha(canonicalValue(baseline.basis)),
        mutant_authored_input_sha256: mutant?.authorship.input_sha256 ?? null,
        changed_fact_key: candidate.target.fact_key, profile_sha256: profile.sha256,
        program_order: baseline.rows.map(row => row.fact_key),
        shared_scope: 'all_unchanged_authored_graphs_and_same_declared_foundations',
        qualified: false, semantic_mutation_credit: 0 });
    programAuthorshipFamilies.set(receipt, freezeDeep({ candidate, baseline, mutant, phaseProfile, profile, admissionFoundation }));
    return receipt;
}
function readPathCandidateProgramAuthorship(raw) {
    const { authorship } = fields(raw, ['authorship']);
    const family = programAuthorshipFamilies.get(authorship);
    if (!family || candidatePackages.get(family.candidate)?.consumed) fail('program_family_origin_or_late');
    return family;
}
function preparePathSelectionAdmissionControls(raw) {
    const { preparation, rowIndex } = fields(raw, ['preparation', 'rowIndex']);
    const domain = preparePathQualificationAdmissionDomain({ preparation, rowIndex }, NECESSARY_SELECTION_PROJECTION);
    const context = contexts.get(preparation), row = context.rows[rowIndex];
    const controls = domain.sites.flatMap(site => site.excluded.map(exclusion => {
        // The first failed authored requirement is sealed without invoking M.
        // Other normal passes can contradict this expectation; they do not
        // rewrite it or turn an unrelated rejection into a valid barrier.
        const instance = exclusion.instances[0];
        const mode = instance.mode;
        const expected = { checker: 'selection_bindings', fact_key: row.target.fact_key,
            predicate_id: mode === 'selected_member_retains_authored_reason' ? null : row.target.predicate_id,
            selection_index: instance.selection_index, mode,
            node: mode === 'included_predicate_concerns_selected_member' ? null : instance.required_nodes[0] };
        return { site_index: site.site_index, locator_index: exclusion.locator_index,
            authored_site: row.sites[site.site_index].authored_site,
            rule: exclusion.rule, instances: exclusion.instances,
            unchanged_authorship_sha256: exclusion.unchanged_authorship_sha256,
            expected_diagnostic: expected,
            coordinate_scope: 'native_selection_instance_single_authored_patch_not_operand_reader',
            compiler_barrier_verified: false };
    }));
    const result = freezeDeep({ stage: 'path_v3_selection_barrier_controls_prepared_not_qualified',
        row_index: rowIndex, target_id: row.target_id, qualification_id: row.qualification_id,
        method_authority: METHOD, domain_sha256: domain.domain_sha256,
        foundation_sha256: sha(canonicalValue(domain)), controls,
        admitted_domain_complete: domain.admitted_domain_complete,
        qualified: false, semantic_mutation_credit: 0, dp_execution: false });
    selectionControlPlans.set(result, { context, row, rowIndex, controls });
    return result;
}
function materializePathSelectionAdmissionControl(raw) {
    const { plan, controlIndex } = fields(raw, ['plan', 'controlIndex']);
    const stored = selectionControlPlans.get(plan);
    if (!stored || !Number.isSafeInteger(controlIndex) || controlIndex < 0 || !stored.controls[controlIndex])
        fail('selection_control_authority');
    if (stored.usedControls) {
        if (stored.usedControls.has(controlIndex)) fail('selection_control_replay');
        stored.usedControls.add(controlIndex);
    }
    const control = stored.controls[controlIndex];
    const domain = stored.row.sites[control.site_index].domain;
    const original = admittedDocuments(stored.context.packageReceipt).find(entry => entry.path === corpusPath).value;
    const graph = JSON.parse(JSON.stringify(original.graphs.find(graph => graph.fact_key === stored.row.target.fact_key)));
    const predicate = graph.predicates.find(predicate => predicate.id === stored.row.target.predicate_id);
    const after = domain.locators[control.locator_index];
    let container = predicate;
    for (const token of domain.location.slice(0, -1)) container = container[token];
    container[domain.location.at(-1)] = JSON.parse(JSON.stringify(after));
    const candidate = constructCandidate(stored.context, stored.row,
        { rowIndex: stored.rowIndex, siteIndex: control.site_index, locatorIndex: control.locator_index }, graph,
        { location: domain.location, before: domain.original, after },
        'typed_locator_exclusion_control', control.expected_diagnostic);
    const context = candidatePackages.get(candidate);
    context.referenceStarted = true;
    // Exclusion is derived from the authored necessary relationship, not from
    // reference fixture equality or observed M. This is still a BUILD control,
    // not a complete A/W/static proof, reviewed rule or execution authority.
    context.reference = freezeDeep({ stage: 'path_v3_authored_exclusion_sealed_before_native_control',
        invocation_id: candidate.invocation_id, mutation_id: candidate.target_id, candidate_id: candidate.candidate_id,
        domain_sha256: plan.domain_sha256, foundation_sha256: plan.foundation_sha256,
        control_sha256: sha(canonicalValue(control)), method_version: 3,
        exclusion_basis: 'necessary_authored_selection_relationship_not_observed_M',
        independent_semantic_reference: false, qualified: false, semantic_mutation_credit: 0 });
    return candidate;
}
function materializePathQualificationLocator(raw) {
    const input = fields(raw, ['preparation', 'rowIndex', 'siteIndex', 'locatorIndex']);
    const context = contexts.get(input.preparation);
    if (!context) fail('preparation_authority');
    for (const name of ['rowIndex', 'siteIndex', 'locatorIndex']) {
        if (!Number.isSafeInteger(input[name]) || input[name] < 0) fail('candidate_index');
    }
    const row = context.rows[input.rowIndex];
    const site = row?.sites[input.siteIndex];
    const domain = site?.domain;
    if (!domain || !domain.complete || !Object.hasOwn(domain.locators, input.locatorIndex)) fail('candidate_domain');
    // All sources come from the genuine admission; no caller graph, patch,
    // expected result, alternate namespace or filesystem reconstruction.
    const original = admittedDocuments(context.packageReceipt).find(entry => entry.path === corpusPath)?.value;
    if (!original) fail('corpus_identity');
    const corpus = JSON.parse(JSON.stringify(original));
    const graph = corpus.graphs.find(graph => graph.fact_key === row.target.fact_key);
    const predicate = graph?.predicates.find(predicate => predicate.id === row.target.predicate_id);
    if (!predicate || !domain.location.length) fail('candidate_site');
    let container = predicate;
    for (const token of domain.location.slice(0, -1)) {
        if (!Object.hasOwn(container, token)) fail('candidate_site');
        container = container[token];
    }
    const leaf = domain.location.at(-1);
    if (!Object.hasOwn(container, leaf) || !equal(container[leaf], domain.original)) fail('candidate_baseline');
    const after = JSON.parse(JSON.stringify(domain.locators[input.locatorIndex]));
    container[leaf] = after;
    return constructCandidate(context, row, input, graph,
        { location: domain.location, before: domain.original, after }, 'typed_locator_alternative');
}
function constructCandidate(context, row, input, graph, patch, kind, expectedDiagnostic = null) {
    const original = admittedDocuments(context.packageReceipt).find(entry => entry.path === corpusPath)?.value;
    const corpus = { ...original, graphs: original.graphs.map(baseline => baseline.fact_key === row.target.fact_key ? graph : baseline) };
    const bytes = Buffer.from(JSON.stringify(corpus) + '\n', 'utf8');
    const entries = admittedPackageEntries(context.packageReceipt)
        .map(entry => entry.path === corpusPath ? { path: entry.path, bytes } : entry);
    // This table admits a constructed BUILD candidate, not independent review
    // or the expected semantic outcome. Normal schemas/compiler still run next.
    const authority = entries.map(entry => ({ path: entry.path, sha256: sha(entry.bytes) }))
        .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const packageReceipt = admitPackage({ entries, authority });
    const baselinePackage = admittedDocuments(context.packageReceipt).map(entry => ({ path: entry.path, sha256: entry.sha256 }));
    const candidateId = sha(canonicalValue({ domain: 'financasbot.path-qualification.locator.v3', kind,
        method: METHOD, target_id: row.target_id, patch,
        baseline_package: baselinePackage }));
    const result = freezeDeep({ format: 'financasbot.path-qualification.locator-candidate', version: 3,
        invocation_id: randomUUID(), candidate_id: candidateId, qualification_id: row.qualification_id, target_id: row.target_id,
        target: row.target, row_index: input.rowIndex, site_index: input.siteIndex, locator_index: input.locatorIndex,
        patch, candidate_kind: kind, expected_diagnostic: expectedDiagnostic,
        baseline_package: baselinePackage,
        candidate_package: authority, method_authority: METHOD,
        stage: 'constructed_single_site_candidate_not_compiled',
        qualified: false, semantic_mutation_credit: 0, dp_execution: false, global_g11: false });
    // Invalid-path controls have no normal typed M IR. This is committed from
    // the control's authored kind, never inferred from an observed rejection.
    // Other candidates must have a complete authorial projection or stay blocked.
    const mutantSeal = ['unknown_path_control_for_empty_L', 'unknown_path_control_for_witness_site'].includes(kind) ? null : sealWholeIR(
        projectPathSingleSiteAuthoredIR({ inventoryCandidate: context.inventory, packageReceipt,
            factKey: row.target.fact_key }));
    const seals = { C: context.irSeal, M: mutantSeal, S: context.irSeal };
    const wholeIRReference = freezeDeep({ stage: 'path_v3_single_site_whole_ir_sealed_before_compile',
        invocation_id: result.invocation_id, candidate_id: candidateId, target_id: row.target_id,
        method_authority: METHOD, sealed_before_captured_compile: true,
        worlds: ['C', 'M', 'S'].map(variant => ({ variant,
            authority_refs: variant === 'M' ? authority : baselinePackage,
            package_root: sha(canonicalValue(variant === 'M' ? authority : baselinePackage)),
            ir_sha256: seals[variant]?.sha256 ?? null,
            expectation: seals[variant] ? 'whole_authored_ir' : 'native_rejection_only_no_typed_ir' })),
        independent_compiler: false, qualified: false, semantic_mutation_credit: 0 });
    candidateIRReferences.set(wholeIRReference, seals);
    candidatePackages.set(result, { packageReceipt, restorationReceipt: context.packageReceipt, consumed: false,
        graph, baselineGraph: original.graphs.find(graph => graph.fact_key === row.target.fact_key),
        wholeIRReference, sourceContext: context, referenceStarted: false, reference: null });
    return result;
}
function preparePathStaticDomainControls(raw) {
    const { preparation, rowIndex } = fields(raw, ['preparation', 'rowIndex']);
    const context = contexts.get(preparation);
    if (!context || !Number.isSafeInteger(rowIndex) || rowIndex < 0) fail('static_preparation');
    const row = context.rows[rowIndex];
    if (!row || !row.sites.every(site => site.domain_complete && site.domain.locators.length === 0))
        fail('static_L_not_empty_or_incomplete');
    const controls = row.sites.map(site => {
        const target = site.authored_site;
        // The exact v2 unknown_path namespace/coordinate is committed before
        // M. A native observed error can contradict it, never rewrite it.
        return { admission_id: target.mutation_id, namespace: site.domain.namespace,
            authored_site: target, expected_diagnostic: {
                checker: 'graph_structure', code: target.definition === 'claimPath' ? 'claim_path' : 'path_missing',
                fact_key: row.target.fact_key, predicate_id: row.target.predicate_id,
                operand_index: target.site_path[1], site_path: target.site_path } };
    });
    const plan = freezeDeep({ stage: 'path_v3_empty_L_controls_prepared_not_qualified',
        target_id: row.target_id, qualification_id: row.qualification_id,
        domain_sha256: sha(canonicalValue(row.sites.map(site => site.domain))), controls,
        method_authority: METHOD, admission_authority: ADDENDUM,
        predicted_domain_reason: 'all_L_empty_before_M',
        qualified: false, semantic_mutation_credit: 0, dp_execution: false });
    staticPlans.set(plan, { context, row, rowIndex, controls });
    return plan;
}
function materializePathStaticDomainControl(raw) {
    const { plan, siteIndex } = fields(raw, ['plan', 'siteIndex']);
    const stored = staticPlans.get(plan);
    if (!stored || !Number.isSafeInteger(siteIndex) || siteIndex < 0 || !stored.controls[siteIndex]) fail('static_plan_authority');
    if (stored.purpose === 'witness_site_admission') {
        if (stored.usedSites.has(siteIndex)) fail('site_native_control_replay');
        stored.usedSites.add(siteIndex);
    }
    const control = stored.controls[siteIndex];
    const generated = materializePathAdmissionCandidate({ inventoryCandidate: stored.context.inventory,
        mutation_id: control.admission_id });
    const candidate = constructCandidate(stored.context, stored.row,
        { rowIndex: stored.rowIndex, siteIndex, locatorIndex: null }, generated.graph, generated.patch,
        stored.purpose === 'witness_site_admission' ? 'unknown_path_control_for_witness_site'
            : 'unknown_path_control_for_empty_L', control.expected_diagnostic);
    const context = candidatePackages.get(candidate);
    context.referenceStarted = true;
    // Empty-L controls retain their historical scope. For witness-site
    // controls this is NOT an empty-L/W claim or a semantic reference.
    context.reference = freezeDeep({ stage: stored.purpose === 'witness_site_admission'
        ? 'path_v3_witness_site_native_control_sealed_before_compile' : 'path_v3_empty_L_sealed_before_native_control',
        invocation_id: candidate.invocation_id, mutation_id: candidate.target_id, candidate_id: candidate.candidate_id,
        domain_sha256: plan.domain_sha256, method_version: 3, discriminating: false,
        ...(stored.purpose === 'witness_site_admission' ? { locator_domain_empty: plan.locator_domain_empty } : {}),
        qualified: false, semantic_mutation_credit: 0 });
    return candidate;
}
// Trusted BUILD bridge only. A genuine one-use package does not establish A,
// W, a native barrier, restored positive compilation or execution authority.
function takePathQualificationCandidatePackage(raw) {
    const input = fields(raw, ['candidate']);
    const context = candidatePackages.get(input.candidate);
    if (!context || context.consumed) fail('candidate_authority_or_replay');
    if (!context.reference) fail('reference_not_sealed_before_m');
    context.consumed = true;
    return Object.freeze({ packageReceipt: context.packageReceipt,
        restorationReceipt: context.restorationReceipt, reference: context.reference,
        wholeIRReference: context.wholeIRReference,
        qualified: false, semantic_mutation_credit: 0 });
}
// Closed reference bridge, not a caller-authored semantic candidate. Once a
// reference starts, failure is monotone: no retry or M package release follows.
function beginPathQualificationReference(raw) {
    const input = fields(raw, ['candidate']);
    const candidate = input.candidate, context = candidatePackages.get(candidate);
    if (!context || context.consumed || context.referenceStarted) fail('reference_authority_or_replay');
    context.referenceStarted = true;
    const view = freezeDeep({ target: candidate.target, graph: context.graph, patch: candidate.patch });
    const capability = freezeDeep({ mutation_id: candidate.target_id, candidate_id: candidate.candidate_id,
        graph_sha256: sha(JSON.stringify(context.graph)), baseline_graph_sha256: sha(JSON.stringify(context.baselineGraph)),
        authority_refs: candidate.baseline_package });
    return Object.freeze({ packageReceipt: context.restorationReceipt, candidate: view, capability,
        invocation_id: candidate.invocation_id, complete(reference) {
            const { readPathSemanticReference } = require('./pathSemanticReference');
            if (context.reference || context.consumed || readPathSemanticReference(reference) !== reference
                || reference.method_version !== 3 || reference.invocation_id !== candidate.invocation_id
                || reference.candidate_id !== candidate.candidate_id || reference.mutation_id !== candidate.target_id)
                fail('reference_identity');
            context.reference = reference;
            return reference;
        } });
}
module.exports = { preparePathQualificationInventory, verifyPathQualificationInventory,
    materializePathQualificationLocator, takePathQualificationCandidatePackage, beginPathQualificationReference,
    preparePathStaticDomainControls, materializePathStaticDomainControl,
    preparePathQualificationHistoricalMigration, verifyPathQualificationHistoricalMigration,
    preparePathQualificationAdmissionDomain, verifyPathQualificationAdmissionDomain,
    preparePathQualificationWitnessPreselection, takePathQualificationWitnessPreselection,
    preparePathSelectionAdmissionControls, materializePathSelectionAdmissionControl,
    preparePathProofAuthorship, readPathProofAuthorship, preparePathPhaseAuthorship, readPathPhaseAuthorship,
    preparePathWholeIRReference, verifyPathWholeIRReference, readPathWholeIRReference,
    preparePathCandidateWholeIRReference, verifyPathCandidateWholeIRReference, readPathWholeIRFailure,
    preparePathCandidateProgramAuthorship, readPathCandidateProgramAuthorship, METHOD };
