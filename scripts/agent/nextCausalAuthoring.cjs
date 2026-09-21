'use strict';

// Offline authorship candidate generator, NOT a gate or normative updater.
// No evaluator, recorder, trace comparator or oracle may be imported here.
const { createHash } = require('node:crypto');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
// Pure canonical JSON hashing only; no executable metric/proof dependencies.
const { digest: semanticDigest } = require('../../src/next/kernel/canonicalValue');
const fail = code => { throw new Error(`causal_authoring_${code}`); };
const supported = new Set(['consumption_by_instrument', 'statement_total']);
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$/;
const own = (object, key) => Object.hasOwn(object, key);
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function parse(text) {
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 8 * 1024 * 1024) fail('serialized_input');
    let value; try { value = JSON.parse(text); } catch { fail('json'); }
    if (!record(value)) fail('object');
    return value;
}
function exact(value, keys) {
    if (!record(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail('shape');
}
function id(value) {
    if (typeof value !== 'string' || !identifierPattern.test(value)) fail('identifier');
    return value;
}
function digest(value) {
    if (typeof value !== 'string' || !digestPattern.test(value)) fail('digest');
    return value;
}
function version(value) {
    if (!Number.isSafeInteger(value) || value < 1) fail('version');
    return value;
}
function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (!record(value)) return value;
    const result = Object.create(null);
    for (const key of Object.keys(value).sort()) result[key] = canonical(value[key]);
    return result;
}
function freeze(value) {
    if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
    return value;
}

// This adapter is allowed to see the authored source document. Its OUTPUT is
// the only graph/claim input a later kernel may receive. Do not copy nested
// objects wholesale: even an annotation could smuggle an old expected value.
// Source-file hashes and old expectations belong to a separate, later diff
// envelope; changing them must not change these projected kernel bytes.
function projectAuthoringInputs(graphText, claimText) {
    const graph = parse(graphText); const source = parse(claimText);
    if (!supported.has(source.metric) || source.unit !== 'BRL_minor') fail('metric');
    if (own(source, 'filters')) fail('unsupported_claim_filters');
    if (!record(graph.nodes) || !Object.keys(graph.nodes).length || Object.keys(graph.nodes).length > 512
        || !Array.isArray(graph.edges) || graph.edges.length > 4096) fail('topology');
    const nodes = Object.create(null);
    for (const [alias, node] of Object.entries(graph.nodes)) {
        id(alias);
        if (alias === 'claim') fail('reserved_alias');
        if (!record(node) || node.binding !== 'snapshot') fail('node_binding');
        nodes[alias] = { binding: 'snapshot', kind: id(node.kind), ref_id: id(node.ref_id), version: digest(node.version) };
    }
    const edgeIds = new Set(); const relations = new Set();
    const edges = graph.edges.map(edge => {
        if (!record(edge) || edge.relation !== 'material_ref') fail('edge_relation');
        const value = { id: id(edge.id), source: id(edge.source), field: id(edge.field), target: id(edge.target), relation: 'material_ref' };
        const relation = JSON.stringify([value.source, value.field, value.target]);
        if (!own(nodes, value.source) || !own(nodes, value.target) || edgeIds.has(value.id) || relations.has(relation)) fail('edge');
        edgeIds.add(value.id); relations.add(relation); return value;
    }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    exact(source.evaluator_ref, ['evaluator_id', 'evaluator_version']);
    if (!record(source.operand_bindings)) fail('roles');
    const expectedRoles = source.metric === 'consumption_by_instrument'
        ? ['context', 'events', 'categories', 'instrument'] : ['context', 'events', 'categories', 'card', 'policy'];
    exact(source.operand_bindings, expectedRoles);
    const bindings = Object.create(null);
    for (const [role, binding] of Object.entries(source.operand_bindings)) {
        if (!record(binding)) fail('binding');
        if (binding.kind === 'claim_context') {
            exact(binding, ['kind']); if (role !== 'context') fail('context_role');
            bindings[role] = { kind: 'claim_context' };
        } else if (binding.kind === 'node') {
            exact(binding, ['kind', 'alias']); const alias = id(binding.alias);
            if (!own(nodes, alias) || !['instrument', 'card', 'policy'].includes(role)) fail('node_role');
            const kinds = { instrument: ['account', 'card'], card: ['card'], policy: ['evaluation_policy'] }[role];
            if (!kinds.includes(nodes[alias].kind)) fail('node_role_kind');
            bindings[role] = { kind: 'node', alias };
        } else if (binding.kind === 'node_set') {
            exact(binding, ['kind', 'aliases']);
            if (!['events', 'categories'].includes(role) || !Array.isArray(binding.aliases) || binding.aliases.length > 512) fail('set_role');
            const aliases = binding.aliases.map(id);
            const kind = role === 'events' ? 'event' : 'category';
            if (new Set(aliases).size !== aliases.length || aliases.some(alias => !own(nodes, alias) || nodes[alias].kind !== kind)) fail('set_role_members');
            bindings[role] = { kind: 'node_set', aliases };
        } else fail('binding_kind');
    }
    exact(source.subject, ['kind', 'ref_id']); exact(source.period, ['kind', 'value']);
    if (!['account', 'card'].includes(source.subject.kind)
        || source.metric === 'statement_total' && source.subject.kind !== 'card') fail('subject');
    if (source.period.kind !== (source.metric === 'statement_total' ? 'statement_due' : 'month')
        || typeof source.period.value !== 'string') fail('period');
    const claim = { metric: source.metric, unit: source.unit,
        subject: { kind: source.subject.kind, ref_id: id(source.subject.ref_id) },
        period: { kind: source.period.kind, value: source.period.value }, time_basis: id(source.time_basis),
        coverage: id(source.coverage), evidence_state: id(source.evidence_state),
        evaluator_ref: { evaluator_id: id(source.evaluator_ref.evaluator_id), evaluator_version: version(source.evaluator_ref.evaluator_version) },
        operand_bindings: bindings };
    // No trace_contract, sets, selections, predicates, selected_nodes, fact_key,
    // claim_id, output, fingerprint annotations or proof descriptors cross here.
    return JSON.stringify(canonical({ claim, topology: { nodes, edges } }));
}

// A binding check only. Authority/schema admission and semantic profile
// interpretation are separate prerequisites. A caller cannot
// turn this return value into permission to emit or apply normative deltas.
function bindAuthoringProfile(profileText, entryText, contractText) {
    const profile = parse(profileText); const entry = parse(entryText); const contract = parse(contractText);
    exact(profile, ['profile_version', 'evaluator_id', 'evaluator_version', 'metric', 'contract_hash', 'foreign_reference_policy', 'program']);
    if (profile.profile_version !== 1 || !supported.has(profile.metric)) fail('profile');
    if (!['identity_for_every_resolved_target', 'identity_version_only_for_matching_id'].includes(profile.foreign_reference_policy)) fail('reference_policy');
    validateProgram(profile.program);
    if (id(profile.evaluator_id) !== id(entry.evaluator_id) || version(profile.evaluator_version) !== version(entry.evaluator_version)
        || profile.metric !== entry.metric || contract.metric !== profile.metric
        || digest(profile.contract_hash) !== digest(entry.evaluator_contract_hash)
        || hash(contractText) !== profile.contract_hash) fail('profile_contract');
    return freeze({ stage: 'authoring_profile_binding_only', executable: false, normative_application_allowed: false,
        profile_sha256: hash(profileText), contract_sha256: profile.contract_hash,
        evaluator_id: profile.evaluator_id, evaluator_version: profile.evaluator_version, metric: profile.metric,
        foreign_reference_policy: profile.foreign_reference_policy });
}

function authorityPath(value) {
    if (typeof value !== 'string' || value.length > 512 || !value.endsWith('.json')
        || value.split('/').some(segment => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment)
            || segment.endsWith('.') || segment === '.' || segment === '..')) fail('authority_path');
    return value;
}
function freezeDocument(value) {
    const queue = [[value, 0]]; let count = 0;
    for (let i = 0; i < queue.length; i++) {
        const [current, depth] = queue[i];
        if (++count > 65536 || depth > 64) fail('document_limits');
        if (current && typeof current === 'object') {
            for (const child of Object.values(current)) queue.push([child, depth + 1]);
            Object.freeze(current);
        }
    }
    return value;
}

// Byte consistency for offline authorship only. The supplied manifest is NOT
// an authenticated root: this does not attest host identity or schema validity.
// Interpretation must separately validate these pinned schemas/registries and
// build a whitelisted data projection before calling a future generator.
function pinAuthoringAuthorities(manifestText, documentText) {
    const manifest = parse(manifestText); const input = parse(documentText);
    const slots = ['claim_schema', 'snapshot_schema', 'material_registry', 'metric_registry', 'evaluator_contract', 'profile', 'snapshot_manifest'];
    exact(manifest, [...slots, 'snapshot_sources']); exact(input, ['documents']);
    if (!Array.isArray(manifest.snapshot_sources) || !manifest.snapshot_sources.length || manifest.snapshot_sources.length > 128
        || !Array.isArray(input.documents) || input.documents.length > 135) fail('authority_inventory');
    const paths = new Set(); const foldedPaths = new Set();
    const references = [...slots.map(slot => [slot, manifest[slot]]), ...manifest.snapshot_sources.map((ref, i) => [`snapshot/${i}`, ref])];
    for (const [, ref] of references) {
        exact(ref, ['path', 'sha256']); authorityPath(ref.path); digest(ref.sha256);
        if (paths.has(ref.path) || foldedPaths.has(ref.path.toLowerCase())) fail('authority_duplicate');
        paths.add(ref.path); foldedPaths.add(ref.path.toLowerCase());
    }
    const documents = new Map();
    for (const document of input.documents) {
        exact(document, ['path', 'content']); authorityPath(document.path);
        if (!paths.has(document.path) || documents.has(document.path) || typeof document.content !== 'string') fail('document_inventory');
        documents.set(document.path, document.content);
    }
    if (documents.size !== paths.size) fail('document_missing');
    const authorities = Object.create(null);
    for (const [slot, ref] of references) {
        const bytes = documents.get(ref.path);
        if (hash(bytes) !== ref.sha256) fail('document_digest');
        authorities[slot] = { path: ref.path, sha256: ref.sha256, value: freezeDocument(parse(bytes)) };
    }
    return freeze({ stage: 'authoring_document_pins_only', authenticated: false, executable: false,
        normative_application_allowed: false, manifest_sha256: hash(manifestText), authorities });
}

function validateAuthoringInput(projectedText, manifestText, documentText) {
    const projected = parse(projectedText);
    exact(projected, ['claim', 'topology']); exact(projected.topology, ['nodes', 'edges']);
    const rebuilt = projectAuthoringInputs(JSON.stringify(projected.topology), JSON.stringify(projected.claim));
    if (rebuilt !== JSON.stringify(canonical(projected))) fail('projection_extra');
    const pins = pinAuthoringAuthorities(manifestText, documentText);
    const authority = slot => pins.authorities[slot].value;
    const texts = new Map(parse(documentText).documents.map(d => [d.path, d.content]));
    const registry = authority('metric_registry'); const material = authority('material_registry');
    const manifest = authority('snapshot_manifest');
    if (!Array.isArray(registry.entries) || !record(material.kinds) || material.closed_world !== true
        || !Array.isArray(material.field_classes) || !Array.isArray(material.types)
        || !Array.isArray(manifest.snapshots) || !Array.isArray(manifest.sources)
        || manifest.material_registry_version !== material.registry_version) fail('authorities');
    const entries = registry.entries.filter(entry => entry.metric === projected.claim.metric);
    if (entries.length !== 1) fail('evaluator_entry');
    const entry = entries[0];
    if (entry.evaluator_id !== projected.claim.evaluator_ref.evaluator_id
        || entry.evaluator_version !== projected.claim.evaluator_ref.evaluator_version
        || entry.contract_path !== pins.authorities.evaluator_contract.path
        || entry.unit !== projected.claim.unit || !Array.isArray(entry.roles)) fail('evaluator_binding');
    const binding = bindAuthoringProfile(texts.get(pins.authorities.profile.path), JSON.stringify(entry),
        texts.get(pins.authorities.evaluator_contract.path));
    const roles = new Set();
    for (const role of entry.roles) {
        if (!record(role) || roles.has(role.role_id) || !own(projected.claim.operand_bindings, role.role_id)
            || role.input_kind !== projected.claim.operand_bindings[role.role_id].kind
            || role.cardinality !== (role.input_kind === 'node_set' ? 'many' : 'one')) fail('registry_roles');
        roles.add(role.role_id);
    }
    if (roles.size !== Object.keys(projected.claim.operand_bindings).length) fail('registry_roles');

    const claimSchema = authority('claim_schema'); const snapshotSchema = authority('snapshot_schema');
    if (!record(claimSchema.definitions?.claim?.properties) || !Array.isArray(claimSchema.definitions.claim.required)
        || !record(snapshotSchema.definitions)) fail('schema_authority');
    // Type only the whitelisted claim fields using the pinned claim authority;
    // excluded identifiers/results are not reintroduced into the kernel input.
    const properties = Object.create(null);
    for (const key of Object.keys(projected.claim)) {
        if (!own(claimSchema.definitions.claim.properties, key)) fail('claim_field_authority');
        properties[key] = claimSchema.definitions.claim.properties[key];
    }
    let validateClaim; let validateSnapshot;
    try {
        const ajv = new Ajv({ strict: false, strictSchema: true, strictNumbers: true, allErrors: false });
        addFormats(ajv);
        validateClaim = ajv.compile({ type: 'object', additionalProperties: false, properties,
            required: Object.keys(properties), definitions: claimSchema.definitions });
        validateSnapshot = ajv.compile(snapshotSchema);
    } catch { fail('schema_compile'); }
    if (!validateClaim(projected.claim)) fail('claim_schema');

    const pinnedSources = Object.entries(pins.authorities).filter(([slot]) => slot.startsWith('snapshot/'));
    const sources = new Map();
    for (const ref of manifest.sources) {
        exact(ref, ['path', 'sha256']); authorityPath(ref.path); digest(ref.sha256);
        if (sources.has(ref.path)) fail('snapshot_source_duplicate');
        sources.set(ref.path, ref.sha256);
    }
    if (sources.size !== pinnedSources.length || pinnedSources.some(([, ref]) => sources.get(ref.path) !== ref.sha256)) fail('snapshot_sources');
    const versions = new Set(sources.values()); const snapshotsByIdentity = new Map();
    const identityKey = node => JSON.stringify([node.kind, node.ref_id, node.version]);
    for (const snapshot of manifest.snapshots) {
        if (!record(snapshot)) fail('snapshot');
        const value = { ref_id: snapshot.ref_id, kind: snapshot.kind, version: snapshot.version, payload: snapshot.payload };
        if (!validateSnapshot(value)) fail('snapshot_schema');
        const key = identityKey(value);
        if (snapshotsByIdentity.has(key) || !versions.has(value.version) || value.payload.id !== value.ref_id) fail('snapshot_identity');
        const fields = material.kinds[value.kind]?.fields;
        if (!record(fields) || fields.id?.class !== 'identity' || fields.id?.type !== 'id') fail('material_kind');
        for (const [name, field] of Object.entries(fields)) {
            if (!record(field) || !material.field_classes.includes(field.class) || !material.types.includes(field.type)
                || typeof field.required !== 'boolean' || field.required && !own(value.payload, name)) fail('material_field');
        }
        const payload = Object.create(null);
        for (const [name, item] of Object.entries(value.payload)) {
            if (!own(fields, name)) fail('material_field');
            if (fields[name].class !== 'non_material') payload[name] = item;
        }
        let fingerprint;
        try {
            fingerprint = `sha256:${semanticDigest({ registry_version: material.registry_version,
                kind: value.kind, ref_id: value.ref_id, version: value.version,
                payload: Object.fromEntries(Object.entries(payload)) })}`;
        } catch { fail('snapshot_fingerprint'); }
        if (snapshot.semantic_fingerprint !== fingerprint) fail('snapshot_fingerprint');
        snapshotsByIdentity.set(key, { kind: value.kind, ref_id: value.ref_id, version: value.version, payload });
    }
    const snapshots = Object.create(null); const aliases = new Set();
    for (const [alias, node] of Object.entries(projected.topology.nodes)) {
        const key = identityKey(node); const value = snapshotsByIdentity.get(key);
        if (!value || aliases.has(key)) fail('node_snapshot');
        aliases.add(key); snapshots[alias] = value;
    }
    for (const edge of projected.topology.edges) {
        const source = snapshots[edge.source]; const target = snapshots[edge.target];
        const field = material.kinds[source.kind].fields[edge.field];
        if (!field || field.class !== 'edge' || !Array.isArray(field.targets) || !field.targets.includes(target.kind)) fail('edge_target');
        const raw = source.payload[edge.field];
        const refs = field.type === 'ref' ? [raw] : field.type === 'ref_list' ? raw
            : field.type === 'role_ref_list' && Array.isArray(raw) ? raw.map(item => item.parent_ref) : null;
        if (!Array.isArray(refs) || !refs.includes(target.ref_id)) fail('edge_payload');
    }
    return freeze({ stage: 'causal_authoring_inputs_validated_only', authenticated: false, executable: false,
        normative_application_allowed: false, projected_sha256: hash(rebuilt), manifest_sha256: pins.manifest_sha256,
        profile_binding: binding, claim: projected.claim, topology: projected.topology, snapshots,
        field_types: Object.fromEntries(Object.entries(material.kinds).map(([kind, value]) => [kind,
            Object.fromEntries(Object.entries(value.fields).map(([name, field]) => [name,
                Object.fromEntries(Object.entries(field).filter(([key]) => ['class', 'type', 'required', 'values', 'targets', 'maximum'].includes(key)))]))])) });
}

function names(values) {
    if (!Array.isArray(values) || !values.length || values.length > 32
        || new Set(values).size !== values.length) fail('program_values');
    values.forEach(id);
}
function validateProgram(program) {
    const order = ['claim_context', 'instrument', 'civil_window', 'classification_population', 'economic_candidates', 'contribution'];
    if (!Array.isArray(program) || program.length !== order.length) fail('program');
    for (let i = 0; i < program.length; i++) {
        const op = program[i]; if (!record(op) || op.op !== order[i]) fail('program_order');
        switch (op.op) {
        case 'claim_context':
            exact(op, ['op', 'required']); exact(op.required, ['coverage', 'evidence_state', 'time_basis']);
            Object.values(op.required).forEach(names); break;
        case 'instrument':
            exact(op, ['op', 'role', 'kinds']); id(op.role); names(op.kinds); break;
        case 'civil_window':
            if (op.rule === 'claim_month') exact(op, ['op', 'rule']);
            else if (op.rule === 'previous_close_exclusive_current_close_inclusive') {
                exact(op, ['op', 'rule', 'policy_role', 'calendar_field', 'calendar', 'closing_field', 'due_field']);
                for (const key of ['policy_role', 'calendar_field', 'closing_field', 'due_field']) id(op[key]);
                if (op.calendar !== 'proleptic_gregorian') fail('program_calendar');
            } else fail('program_window');
            break;
        case 'classification_population':
            exact(op, ['op', 'role', 'kind', 'field', 'values']);
            for (const key of ['role', 'kind', 'field']) id(op[key]); names(op.values); break;
        case 'economic_candidates':
            exact(op, ['op', 'role', 'kind', 'date_field', 'state_field', 'required_state', 'reference_by_kind',
                'category_field', 'compensation_field', 'eligible_class', 'compensation_class', 'guards']);
            for (const key of ['role', 'kind', 'date_field', 'state_field', 'required_state', 'category_field',
                'compensation_field', 'eligible_class', 'compensation_class']) id(op[key]);
            if (!record(op.reference_by_kind) || !Object.keys(op.reference_by_kind).length) fail('program_references');
            for (const [kind, field] of Object.entries(op.reference_by_kind)) { id(kind); id(field); }
            if (op.guards !== 'observe_all_before_filtering') fail('program_guards');
            break;
        case 'contribution':
            exact(op, ['op', 'field']); id(op.field);
            break;
        default: fail('program_operation');
        }
    }
}

// Civil dates are tuples, never local Date/UTC instants or ambient timezone.
function civilDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('civil_date');
    const [year, month, day] = value.split('-').map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) fail('civil_date');
    return { year, month, day, value };
}
function dateText(year, month, day) {
    return civilDate(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`).value;
}

function validateProgramTypes(input, profile) {
    const [, scope, window, categories, events, contribution] = profile.program;
    const field = (kind, name, type, classification, target) => {
        const descriptor = input.field_types[kind]?.[name];
        if (!descriptor || descriptor.type !== type || descriptor.class !== classification
            || target && (!Array.isArray(descriptor.targets) || descriptor.targets.length !== 1 || descriptor.targets[0] !== target)) fail('program_field_type');
        return descriptor;
    };
    const values = field(categories.kind, categories.field, 'enum', 'dimension').values;
    if (!Array.isArray(values) || JSON.stringify([...values].sort()) !== JSON.stringify([...categories.values].sort())
        || !values.includes(events.eligible_class) || !values.includes(events.compensation_class)
        || events.eligible_class === events.compensation_class) fail('program_class_values');
    field(categories.kind, 'id', 'id', 'identity'); field(events.kind, 'id', 'id', 'identity');
    field(events.kind, events.date_field, 'date', 'dimension');
    const states = field(events.kind, events.state_field, 'enum', 'dimension').values;
    if (!Array.isArray(states) || !states.includes(events.required_state)) fail('program_state_value');
    field(events.kind, events.category_field, 'ref', 'edge', categories.kind);
    if (field(events.kind, events.compensation_field, 'ref', 'edge', events.kind).required !== false) fail('program_optional_reference');
    if (JSON.stringify(Object.keys(events.reference_by_kind).sort()) !== JSON.stringify([...scope.kinds].sort())) fail('program_reference_kinds');
    for (const kind of scope.kinds) {
        field(kind, 'id', 'id', 'identity');
        if (field(events.kind, events.reference_by_kind[kind], 'ref', 'edge', kind).required !== false) fail('program_optional_reference');
    }
    field(events.kind, contribution.field, 'money_minor', 'dimension');
    if (window.rule !== 'claim_month') {
        const policy = input.claim.operand_bindings[window.policy_role];
        if (!policy || policy.kind !== 'node') fail('program_policy_role');
        const kind = input.snapshots[policy.alias].kind;
        if (kind !== 'evaluation_policy' || !field(kind, window.calendar_field, 'enum', 'dimension').values?.includes(window.calendar)) fail('program_calendar');
        for (const kind of scope.kinds) {
            field(kind, window.closing_field, 'positive_integer', 'dimension');
            field(kind, window.due_field, 'positive_integer', 'dimension');
        }
    }
}

// The kernel receives only the admitted projection. No financial value R is
// calculated, no selected set is emitted, and no previous expected is an input.
function interpretCandidate(input, profile) {
    if (profile.foreign_reference_policy !== 'identity_for_every_resolved_target') fail('reference_policy_not_implemented');
    validateProgramTypes(input, profile);
    const groups = Object.fromEntries(['required_nodes', 'required_reads', 'required_claim_reads', 'required_edges', 'required_structural'].map(k => [k, new Map()]));
    let reason;
    const note = (group, value, role, path) => {
        const key = JSON.stringify(canonical(value)); const map = groups[group];
        if (!map.has(key)) map.set(key, { value, reasons: new Map() });
        const why = { rule: reason, role, path }; map.get(key).reasons.set(JSON.stringify(why), why);
    };
    const snapshot = alias => { if (!own(input.snapshots, alias)) fail('program_node'); return input.snapshots[alias]; };
    const read = (alias, field, role) => {
        const node = snapshot(alias); const descriptor = input.field_types[node.kind]?.[field];
        if (!descriptor || descriptor.class === 'non_material' || !own(node.payload, field)) fail('program_field');
        note('required_nodes', alias, role, [alias, field]);
        note('required_reads', { node: alias, segments: [field] }, role, [alias, field]);
        return node.payload[field];
    };
    const identity = (alias, kind, role) => {
        const node = snapshot(alias); if (kind && node.kind !== kind) fail('program_kind');
        const identifier = read(alias, 'id', role);
        if (identifier !== node.ref_id || !digestPattern.test(node.version)) fail('program_identity');
        return { alias, kind: node.kind, id: identifier };
    };
    const presence = (alias, field, role) => {
        const node = snapshot(alias);
        const descriptor = input.field_types[node.kind]?.[field];
        if (!descriptor || descriptor.class === 'non_material' || descriptor.required !== false) fail('program_presence_field');
        note('required_nodes', alias, role, [alias, field]);
        note('required_structural', { node: alias, operation: 'has', segments: [field] }, role, [alias, field]);
        return own(node.payload, field);
    };
    const claimRead = (...segments) => {
        let value = input.claim;
        for (const segment of segments) { if (!record(value) || !own(value, segment)) fail('program_claim'); value = value[segment]; }
        note('required_claim_reads', { segments }, 'context', ['claim', ...segments]); return value;
    };
    const roleNode = role => {
        const binding = input.claim.operand_bindings[role]; if (!binding || binding.kind !== 'node') fail('program_role');
        return binding.alias;
    };
    const roleSet = role => {
        const binding = input.claim.operand_bindings[role]; if (!binding || binding.kind !== 'node_set') fail('program_role');
        return binding.aliases;
    };
    const resolve = (alias, field, kind, role) => {
        const ref = read(alias, field, role);
        const edges = input.topology.edges.filter(e => e.source === alias && e.field === field);
        if (edges.length !== 1 || snapshot(edges[0].target).ref_id !== ref) fail('reference');
        const edge = edges[0]; note('required_edges', edge.id, role, [alias, field, edge.target]);
        return identity(edge.target, kind, role);
    };
    let instrument; let window; let classification; let categoryOp; let eligible;
    for (let index = 0; index < profile.program.length; index++) {
        const op = profile.program[index]; reason = `program/${index}/${op.op}`;
        switch (op.op) {
        case 'claim_context':
            for (const [field, values] of Object.entries(op.required)) if (!values.includes(claimRead(field))) fail('program_context');
            break;
        case 'instrument': {
            instrument = identity(roleNode(op.role), null, op.role);
            if (!op.kinds.includes(instrument.kind) || instrument.kind !== claimRead('subject', 'kind')
                || instrument.id !== claimRead('subject', 'ref_id')) fail('program_subject');
            break;
        }
        case 'civil_window': {
            const kind = claimRead('period', 'kind'); const value = claimRead('period', 'value');
            if (op.rule === 'claim_month') {
                if (kind !== 'month' || !/^\d{4}-\d{2}$/.test(value)) fail('program_period');
                civilDate(value + '-01'); window = date => date.slice(0, 7) === value;
            } else {
                if (kind !== 'statement_due') fail('program_period');
                const policy = identity(roleNode(op.policy_role), 'evaluation_policy', op.policy_role);
                if (read(policy.alias, op.calendar_field, op.policy_role) !== op.calendar) fail('program_calendar');
                const closing = read(instrument.alias, op.closing_field, 'window');
                const due = read(instrument.alias, op.due_field, 'window');
                const date = civilDate(value); if (date.day !== due) fail('program_due');
                const end = dateText(date.year, date.month, closing);
                const start = dateText(date.month === 1 ? date.year - 1 : date.year, date.month === 1 ? 12 : date.month - 1, closing);
                window = day => day > start && day <= end;
            }
            break;
        }
        case 'classification_population': {
            classification = new Map(); categoryOp = op;
            for (const alias of roleSet(op.role)) {
                const node = identity(alias, op.kind, op.role); const value = read(alias, op.field, op.role);
                if (classification.has(node.id) || !op.values.includes(value)) fail('program_classification');
                classification.set(node.id, { alias, value });
            }
            break;
        }
        case 'economic_candidates': {
            eligible = []; const seen = new Set(); const field = op.reference_by_kind[instrument.kind];
            if (!field || !classification) fail('program_reference_kind');
            const category = alias => {
                const node = resolve(alias, op.category_field, categoryOp.kind, op.role);
                const entry = classification.get(node.id);
                if (!entry || entry.alias !== node.alias) fail('program_classification_membership');
                return entry.value;
            };
            for (const alias of roleSet(op.role)) {
                const node = identity(alias, op.kind, op.role);
                if (seen.has(node.id)) fail('program_duplicate'); seen.add(node.id);
                const date = civilDate(read(alias, op.date_field, op.role)).value;
                const state = read(alias, op.state_field, op.role);
                const target = presence(alias, field, op.role) ? resolve(alias, field, instrument.kind, op.role) : null;
                const ownClass = category(alias);
                const compensation = presence(alias, op.compensation_field, op.role);
                let effectiveClass = ownClass;
                if (compensation) {
                    if (ownClass !== op.compensation_class) fail('program_compensation_class');
                    const source = resolve(alias, op.compensation_field, op.kind, op.role);
                    if (source.id === node.id || presence(source.alias, op.compensation_field, op.role)) fail('program_compensation_chain');
                    effectiveClass = category(source.alias);
                } else if (ownClass === op.compensation_class) fail('program_compensation_source');
                // Observe ALL declared guards first; no implicit short circuit
                // changes obligations for an excluded financial candidate.
                if (state === op.required_state && target?.id === instrument.id && window(date)
                    && effectiveClass === op.eligible_class) eligible.push(alias);
            }
            break;
        }
        case 'contribution':
            if (!eligible) fail('program_contributions');
            // Declare the monetary read, but never derive R or introduce a
            // financial acceptance/sign policy absent from the scoped profile.
            for (const alias of eligible) read(alias, op.field, 'contribution');
            break;
        default: fail('program_operation');
        }
    }
    const obligations = {}; const justifications = [];
    for (const [group, entries] of Object.entries(groups)) {
        const ordered = [...entries.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
        obligations[group] = ordered.map(([, entry]) => entry.value);
        for (const [, entry] of ordered) justifications.push({ dimension: group, obligation: entry.value,
            reasons: [...entry.reasons.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, value]) => value) });
    }
    return { obligations, justifications };
}

function generateAuthoringCandidate(projectedText, manifestText, documentText) {
    const input = validateAuthoringInput(projectedText, manifestText, documentText);
    const manifest = parse(manifestText); const documents = parse(documentText).documents;
    const profile = parse(documents.find(d => d.path === manifest.profile.path).content);
    const result = interpretCandidate(input, profile);
    return JSON.stringify(canonical({ stage: 'offline_authoring_candidate', authenticated: false, graph_accepted: false,
        normative_application_allowed: false, projected_sha256: input.projected_sha256,
        manifest_sha256: input.manifest_sha256, profile_sha256: input.profile_binding.profile_sha256,
        obligations_sha256: hash(JSON.stringify(canonical(result.obligations))), ...result }));
}

module.exports = { projectAuthoringInputs, bindAuthoringProfile, pinAuthoringAuthorities, validateAuthoringInput, generateAuthoringCandidate };
