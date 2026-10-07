'use strict';
const { runInThisContext } = require('node:vm');
const { types } = require('node:util');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const { copyData, identifier } = require('./observationContract');
const { admitExecutionFreeze, admitFrozenArtifact } = require('./freezeContract');
const { artifactContents, admitArtifact } = require('./artifactLoader');
const { verifyNativeRuntime, verifiedNodeExecutable } = require('./nativeRuntime');
const { decodeSelectedEventDayPacket } = require('./selectedEventDayPacket');
const { admitSelectedEventDayExecutionTicket } = require('./selectedEventDayExecutionTicket');
const { freezeContents } = require('./freezeContract');
const natives = Object.freeze({ 'node:crypto': require('node:crypto'), 'node:util': require('node:util'),
    'node:process': require('node:process'), 'node:child_process': require('node:child_process') });
const fail = code => { throw new Error('selected_day_launcher_' + code); };
function own(raw, names) {
    if (!raw || types.isProxy(raw) || Array.isArray(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
// External precondition: identify this exact candidate leaf before evaluating
// it. The BUILD binding supplies the fixed negative freeze, never a request.
// Native Node/V8/OS is a declared trust boundary, not an OS isolation claim or
// protection against a compromised platform replacing the executable later.
function launch(raw) {
    const { freezeBytes, expectedFreezeHash, tcbArtifact } = own(raw, ['freezeBytes', 'expectedFreezeHash', 'tcbArtifact']);
    const freeze = admitExecutionFreeze({ bytes: freezeBytes, expectedHash: expectedFreezeHash });
    const artifact = own(tcbArtifact, ['manifestBytes', 'entries']);
    const artifactReceipt = admitFrozenArtifact({ freezeReceipt: freeze, kind: 'tcb', programId: null, ...artifact });
    const contents = artifactContents(artifactReceipt);
    const paths = ['selected-day-adjudicator.js', 'selected-day-build-recipe.json', 'selected-day-compiler-binding.json', 'selected-day-compiler-recipe.json',
        'selected-day-compiler.js', 'selected-day-launcher.js', 'selected-day-proof-child.js',
        'selected-day-proof-host.js', 'selected-day-recipe.json', 'selected-day-ticket.json'];
    if (contents.entry !== 'selected-day-launcher.js' || contents.files.map(file => file.path).join(',') !== paths.join(',')
        || contents.files.some(file => file.media_type !== (file.path.endsWith('.json') ? 'application/json' : 'text/javascript'))) fail('inventory');
    const source = name => contents.files.find(file => file.path === name).source;
    const recipe = freezeDeep(structuredClone(copyData(JSON.parse(source('selected-day-recipe.json')))));
    const packet = decodeSelectedEventDayPacket(recipe.packet_source);
    if (canonicalValue(recipe) !== source('selected-day-recipe.json') || recipe.quarantine_origin !== 'negative_qualification'
        || recipe.profile_id !== packet.profile_id || recipe.normative_commit !== packet.normative_commit
        || recipe.packet_sha256 !== contentsHash(recipe.packet_source)
        || recipe.profile_witness_qualified !== false || recipe.financial_release_eligible !== false) fail('quarantine');
    // Compiler bytes are the exact closed source that performed the private
    // BUILD compilation, not a runtime compiler replacement. Validate their
    // certificate/leaf linkage before any host handle; never execute a caller
    // compiler, import its financial tools or claim independent rerun here.
    const bindingSource = source('selected-day-compiler-binding.json');
    const binding = freezeDeep(structuredClone(copyData(JSON.parse(bindingSource))));
    if (canonicalValue(binding) !== bindingSource || contentsHash(bindingSource) !== recipe.compiler_binding_sha256
        || binding.compiler_artifact_root !== recipe.compiler_artifact_root
        || binding.precommit_hash !== packet.precommit_hash
        || binding.normal_compile_worlds !== 3 || binding.independent_compiler_execution !== false
        || binding.executable_ticket_complete !== false || binding.worlds.map(row => row.variant).join(',') !== 'C,M,S'
        || binding.worlds.some(row => row.compiler_artifact_root !== binding.compiler_artifact_root
            || row.ir_sha256 !== packet.variants[row.variant].expected_ir_hash)
        || binding.entries.length !== 2 || binding.entries.map(row => row.path).join(',') !== 'selected-day-compiler-recipe.json,selected-day-compiler.js'
        || binding.entries.some(row => row.sha256 !== contentsHash(source(row.path)))) fail('compiler_binding');
    admitArtifact({ manifestBytes: Buffer.from(binding.compiler_manifest), expectedRoot: binding.compiler_artifact_root,
        entries: binding.entries.map(row => ({ path: row.path, bytes: Buffer.from(source(row.path)) })) });
    const ticket = admitSelectedEventDayExecutionTicket({ source: source('selected-day-ticket.json'), expectedHash: recipe.ticket_sha256,
        packet, compiler: binding, artifactReceipt, nativeRuntime: freezeContents(freeze).native_runtime, recipe });
    for (const allowed of [recipe.host_native_externals, recipe.adjudicator_native_externals])
        if (!Array.isArray(allowed) || new Set(allowed).size !== allowed.length || allowed.some(name => !Object.hasOwn(natives, name))) fail('native_import');
    // Negative origin and all bytes admitted before loading a host factory or
    // returning any run handle. Remeasure the executable before each spawn.
    const native = verifyNativeRuntime(freeze);
    const load = (file, allowed) => runInThisContext(source(file))(name => {
        if (!allowed.includes(name)) fail('native_import'); return natives[name];
    });
    const host = load('selected-day-proof-host.js', recipe.host_native_externals);
    const adjudicate = load('selected-day-adjudicator.js', recipe.adjudicator_native_externals);
    if (typeof host !== 'function' || typeof adjudicate !== 'function') fail('entry');
    const used = new Set(), invocationIds = new Set(), records = Object.create(null);
    let executionId, poisoned = false, busy = false;
    return Object.freeze({ stage: 'captured_negative_launcher_only', financial_acceptance: false,
        async run(rawInvocation) {
            if (poisoned || busy) { poisoned = true; fail('poisoned'); }
            try {
                const { variant, scope: input, mode } = own(rawInvocation, ['variant', 'scope', 'mode']);
                const scope = structuredClone(copyData(own(input, ['executionId', 'invocationId'])));
                if (!['C', 'M', 'S'].includes(variant) || !['proof', 'graph'].includes(mode)
                    || !identifier(scope.executionId) || !identifier(scope.invocationId) || used.has(variant) || invocationIds.has(scope.invocationId)
                    || executionId !== undefined && executionId !== scope.executionId) fail('slot');
                executionId = scope.executionId; used.add(variant); invocationIds.add(scope.invocationId); busy = true;
                verifiedNodeExecutable(native);
                const result = await host({ variant, scope, mode });
                if (poisoned) fail('poisoned');
                const out = freezeDeep({ ...result, native_runtime_verified_before_handles: true,
                    execution_ticket_bound_before_handles: true, observed_execution_ticket_sha256: ticket.observed_sha256,
                    observed_native_runtime_sha256: native.observed_sha256 });
                records[variant] = { mode, result: out }; return out;
            } catch (error) { poisoned = true; throw error; } finally { busy = false; }
        },
        adjudicate() {
            if (arguments.length || poisoned || ['C', 'M', 'S'].some(v => records[v]?.mode !== 'graph')) fail('worlds');
            // No caller result/expected source can enter the captured adjudicator.
            return adjudicate({ results: Object.fromEntries(['C', 'M', 'S'].map(v => [v, records[v].result])) });
        } });
}
function contentsHash(source) {
    return 'sha256:' + natives['node:crypto'].createHash('sha256').update(source, 'utf8').digest('hex');
}
module.exports = { launch };
