'use strict';
const { createHash } = require('node:crypto');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const { copyData } = require('./observationContract');
const { artifactContents } = require('./artifactLoader');
const { types } = require('node:util');
const fail = code => { throw new Error('selected_day_ticket_' + code); };
const hash = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const dataHash = value => hash(canonicalValue(value));
const isHash = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
function keys(value, names) {
    if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...names].sort().join(',')) fail('shape');
}
function decode(source) {
    if (typeof source !== 'string' || Buffer.byteLength(source) > 1048576) fail('size');
    let data; try { data = structuredClone(copyData(JSON.parse(source))); } catch { fail('data'); }
    if (canonicalValue(data) !== source) fail('canonical');
    return data;
}
function own(raw, names) {
    if (!raw || types.isProxy(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
// This is structural verification of the hash-bound BUILD inventory, not a
// source re-parser or an independent execution of its trusted build platform.
function validateSelectedEventDayBuildRecipe(source) {
    const build = decode(source);
    keys(build, ['schema_version', 'boundary', 'entrypoints', 'sources', 'imports',
        'module_inventory_complete', 'independent_BUILD_execution']);
    if (build.schema_version !== 1 || build.boundary !== 'trusted_BUILD_platform_current_sources_not_independent_execution'
        || build.module_inventory_complete !== true || build.independent_BUILD_execution !== false
        || !Array.isArray(build.sources) || !build.sources.length || build.sources.length > 514
        || !Array.isArray(build.imports) || !Array.isArray(build.entrypoints) || !build.entrypoints.length) fail('build');
    const paths = new Set(); let previous;
    for (const row of build.sources) {
        keys(row, ['path', 'sha256']);
        if (typeof row.path !== 'string' || !isHash(row.sha256) || previous !== undefined && previous >= row.path) fail('build');
        previous = row.path; paths.add(row.path);
    }
    if (canonicalValue(build.entrypoints) !== canonicalValue([...new Set(build.entrypoints)].sort())
        || build.entrypoints.some(entry => !paths.has(entry))) fail('build');
    const links = new Map(); previous = undefined;
    for (const row of build.imports) {
        keys(row, ['source', 'specifier', 'target']);
        const key = canonicalValue(row);
        if (!paths.has(row.source) || typeof row.specifier !== 'string' || typeof row.target !== 'string'
            || !paths.has(row.target) && !/^node:[a-z_]+(?:\/[a-z_]+)*$/.test(row.target)
            || previous !== undefined && previous >= key) fail('build');
        previous = key;
        if (!links.has(row.source)) links.set(row.source, []);
        if (paths.has(row.target)) links.get(row.source).push(row.target);
    }
    const visited = new Set(), queue = [...build.entrypoints];
    while (queue.length) {
        const entry = queue.shift(); if (visited.has(entry)) continue;
        visited.add(entry); queue.push(...(links.get(entry) ?? []));
    }
    if ([...paths].some(file => !visited.has(file) && !['package.json', 'package-lock.json'].includes(file))) fail('build');
    return freezeDeep(build);
}
// Admission after exact outer negative artifact identity, before handles.
// This validates a candidate ticket, not reviewed source authority, independent
// BUILD execution, witness credit, receipt or a positive financial package.
function admitSelectedEventDayExecutionTicket(raw) {
    const input = own(raw, ['source', 'expectedHash', 'packet', 'compiler', 'artifactReceipt', 'nativeRuntime', 'recipe']);
    const { source, expectedHash } = input;
    if (typeof source !== 'string' || !isHash(expectedHash)) fail('identity');
    const packet = structuredClone(copyData(input.packet)), compiler = structuredClone(copyData(input.compiler));
    const nativeRuntime = structuredClone(copyData(input.nativeRuntime)), recipe = structuredClone(copyData(input.recipe));
    const { files } = artifactContents(input.artifactReceipt);
    const ticketFile = files.find(file => file.path === 'selected-day-ticket.json');
    if (hash(source) !== expectedHash || !ticketFile || ticketFile.observed_sha256 !== expectedHash
        || ticketFile.source !== source) fail('identity');
    const ticket = decode(source);
    keys(ticket, ['schema_version', 'profile_id', 'normative_commit', 'quarantine_origin', 'precommit_hash',
        'packet_sha256', 'program_artifact_root', 'program_sha256', 'dispatch_artifact_root', 'metric_artifact_root',
        'metric_contract_sha256', 'compiler_artifact_root', 'build_recipe_sha256', 'authorship', 'worlds',
        'program_conformance', 'executable_leaves', 'native_runtime', 'profile_witness_qualified',
        'semantic_mutation_credit', 'financial_release_eligible']);
    keys(ticket.authorship, ['precommit', 'plan', 'patch', 'worlds']);
    if (!ticket.authorship.precommit || Array.isArray(ticket.authorship.precommit)) fail('precommit');
    if (ticket.schema_version !== 1 || ticket.profile_id !== packet.profile_id || ticket.normative_commit !== packet.normative_commit
        || ticket.quarantine_origin !== 'negative_qualification' || ticket.profile_witness_qualified !== false
        || ticket.semantic_mutation_credit !== 0 || ticket.financial_release_eligible !== false
        || ticket.precommit_hash !== packet.precommit_hash || dataHash(ticket.authorship.precommit) !== packet.precommit_hash
        || ticket.program_sha256 !== packet.program_sha256 || ticket.compiler_artifact_root !== compiler.compiler_artifact_root
        || canonicalValue(ticket.native_runtime) !== canonicalValue(nativeRuntime)
        || ticket.packet_sha256 !== hash(recipe.packet_source)
        || ['program_artifact_root', 'metric_artifact_root', 'dispatch_artifact_root', 'metric_contract_sha256']
            .some(name => ticket[name] !== recipe[name])) fail('identity');
    for (const name of ['packet_sha256', 'program_artifact_root', 'program_sha256', 'dispatch_artifact_root',
        'metric_artifact_root', 'metric_contract_sha256', 'compiler_artifact_root', 'build_recipe_sha256'])
        if (!isHash(ticket[name])) fail('digest');
    const precommit = ticket.authorship.precommit;
    if (precommit.profile !== packet.profile_id || precommit.normative_commit !== packet.normative_commit
        || precommit.quarantine_origin !== ticket.quarantine_origin || precommit.dp_execution !== false
        || precommit.profile_witness_qualified !== false || precommit.semantic_mutation_credit !== 0
        || precommit.financial_release_eligible !== false || !Number.isSafeInteger(precommit.selected_candidate_index)
        || precommit.selected_candidate_index < 0 || ['candidate_order_hash', 'references_hash', 'world_hash', 'plan_hash', 'claims_hash']
            .some(name => !isHash(precommit[name]))) fail('precommit');
    keys(ticket.authorship.patch, ['location', 'before', 'after']);
    const plan = ticket.authorship.plan;
    if (dataHash(plan) !== precommit.plan_hash || plan.profile !== packet.profile_id
        || canonicalValue(ticket.authorship.patch.location) !== '["args",0,"field"]'
        || canonicalValue(ticket.authorship.patch.before) !== canonicalValue(plan.before)
        || canonicalValue(ticket.authorship.patch.after) !== canonicalValue(plan.after)
        || ['C', 'M', 'S'].some(variant => canonicalValue(plan.fringe[variant])
            !== canonicalValue(packet.variants[variant].plan.fringe))) fail('patch');
    const conformance = ticket.program_conformance;
    keys(conformance, ['expected_source_sha256', 'expected_ir_hashes', 'helper_sources', 'common_program_identity', 'dispatch_interface', 'executable_absence']);
    if (conformance.expected_source_sha256 !== packet.program_sha256 || conformance.common_program_identity !== true
        || conformance.dispatch_interface !== true || canonicalValue(conformance.helper_sources) !== canonicalValue(packet.helper_sources)) fail('program');
    const absence = conformance.executable_absence;
    keys(absence, ['schema_version', 'analysis', 'scope', 'program_sha256', 'selected_set', 'analysis_contract_sha256',
        'closed_guest_bundles', 'closed_factory_sources', 'closed_import_edges', 'discarded_selection_calls',
        'local_boolean_dispatches', 'selected_view_consumers', 'boolean_result_external_consumers',
        'executable_closure_absence_proved', 'profile_witness_qualified', 'semantic_mutation_credit', 'financial_release_eligible']);
    if (absence.schema_version !== 1 || absence.analysis !== 'closed_guest_selection_effects/v1'
        || absence.scope !== 'common_C_M_S_guest_and_finite_helpers_conjoined_with_whole_program_conformance'
        || absence.program_sha256 !== packet.program_sha256 || !isHash(absence.analysis_contract_sha256)
        || ['C', 'M', 'S'].some(v => absence.selected_set !== packet.variants[v].plan.selected_set)
        || absence.closed_guest_bundles !== 4 || absence.discarded_selection_calls !== 3
        || !Number.isSafeInteger(absence.closed_factory_sources) || absence.closed_factory_sources < 4
        || !Number.isSafeInteger(absence.closed_import_edges) || absence.closed_import_edges < 0
        || !Number.isSafeInteger(absence.local_boolean_dispatches) || absence.local_boolean_dispatches < 1
        || absence.selected_view_consumers !== 0 || absence.boolean_result_external_consumers !== 0
        || absence.executable_closure_absence_proved !== true || absence.profile_witness_qualified !== false
        || absence.semantic_mutation_credit !== 0 || absence.financial_release_eligible !== false) fail('executable_absence');
    // Structural verification of the captured external certificate, not an
    // independent analysis/replay at runtime. Its implementation bytes are
    // included in the closed BUILD recipe; outer negative identity is required.
    if (!Array.isArray(ticket.worlds) || ticket.worlds.map(row => row.variant).join(',') !== 'C,M,S'
        || !Array.isArray(ticket.authorship.worlds) || ticket.authorship.worlds.map(row => row.variant).join(',') !== 'C,M,S') fail('worlds');
    ticket.worlds.forEach((world, index) => {
        keys(world, ['variant', 'package_root', 'ir_sha256', 'compiler_artifact_root']);
        const authored = ticket.authorship.worlds[index]; keys(authored, ['variant', 'expected_ir_hash', 'authority']);
        if (canonicalValue(world) !== canonicalValue(compiler.worlds[index]) || !Array.isArray(authored.authority)
            || !authored.authority.length || dataHash(authored.authority) !== world.package_root
            || authored.expected_ir_hash !== packet.variants[world.variant].expected_ir_hash
            || world.ir_sha256 !== authored.expected_ir_hash || conformance.expected_ir_hashes[world.variant] !== authored.expected_ir_hash) fail('world');
        let previous;
        for (const row of authored.authority) {
            keys(row, ['path', 'sha256']);
            if (typeof row.path !== 'string' || !isHash(row.sha256) || previous !== undefined && previous >= row.path) fail('authority');
            previous = row.path;
        }
    });
    const leaves = ['selected-day-adjudicator.js', 'selected-day-launcher.js', 'selected-day-proof-child.js', 'selected-day-proof-host.js'];
    if (!Array.isArray(ticket.executable_leaves) || ticket.executable_leaves.map(row => row.path).join(',') !== leaves.join(',')) fail('closure');
    for (const row of ticket.executable_leaves) {
        keys(row, ['path', 'sha256']);
        if (!isHash(row.sha256) || files.find(file => file.path === row.path)?.observed_sha256 !== row.sha256) fail('closure');
    }
    const recipeFile = files.find(file => file.path === 'selected-day-build-recipe.json');
    if (!recipeFile || recipeFile.observed_sha256 !== ticket.build_recipe_sha256) fail('build');
    validateSelectedEventDayBuildRecipe(recipeFile.source);
    return freezeDeep({ stage: 'selected_day_private_execution_ticket_candidate_only', observed_sha256: expectedHash,
        execution_ticket_candidate_complete: true, profile_witness_qualified: false,
        semantic_mutation_credit: 0, financial_release_eligible: false });
}
module.exports = { admitSelectedEventDayExecutionTicket, validateSelectedEventDayBuildRecipe };
