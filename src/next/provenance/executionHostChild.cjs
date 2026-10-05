'use strict';

// Disposable trusted child. This module, SES and the proxy are TCB bytes that
// must be measured by the future validation_tcb_root. No guest source is
// accepted from argv, a path or a Node loader.
const { EXECUTION_PROFILE } = require('./executionProfile');
const { admitArtifact, artifactContents } = require('./artifactLoader');
const { createInstrumentedAccess, createNodeSetAccess, createDerivedParentAccess } = require('./instrumentedAccess');
const { copyTypedFunctionalResult } = require('./claimBinding');
const { bindObservedContext } = require('./proofContextBinding');
const { bindObservedParents } = require('./proofParentBinding');
const { validatePhaseArtifactInputs, PROFILE_PATH } = require('./phaseCompositionProfile');
const { validateClaimMonthArtifact, QUALIFICATION_PATH } = require('./claimMonthIsolatedProfile');
const { digest } = require('../kernel/canonicalValue');
const { types } = require('node:util');
require('ses');

const pinned = EXECUTION_PROFILE.native_timezone;
const qualifiedMode = process.argv[2] === '--run-qualified-graph';
if (!['--run-admitted-invocation', '--run-admitted-graph', '--run-qualified-graph'].includes(process.argv[2]) || typeof process.send !== 'function'
    || process.versions.node !== EXECUTION_PROFILE.node_version
    || process.versions.icu !== pinned.icu || process.versions.tz !== pinned.tz
    || process.versions.cldr !== pinned.cldr || process.versions.unicode !== pinned.unicode) {
    throw new Error('host_child_runtime_mismatch');
}
lockdown(EXECUTION_PROFILE.lockdown);

function compartment(operands) {
    const guest = new Compartment({ globals: { operands }, __options__: true });
    for (const name of EXECUTION_PROFILE.denied_globals) {
        Object.defineProperty(guest.globalThis, name,
            { value: undefined, writable: false, configurable: false });
    }
    Object.freeze(guest.globalThis);
    return guest;
}

// Inspect data descriptors before any clone/coercion. The allowed prototypes
// are captured from this very compartment before executing admitted guest code.
function copyGuestResult(raw, objectPrototype, arrayPrototype) {
    const invalid = () => { throw new Error('host_child_result'); };
    if (!raw || typeof raw !== 'object' || types.isProxy(raw)
        || ![null, objectPrototype].includes(Object.getPrototypeOf(raw))) invalid();
    const fields = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(fields).length !== 3 || ['unit', 'kind', 'value'].some(key =>
        !fields[key] || !fields[key].enumerable || !Object.hasOwn(fields[key], 'value'))) invalid();
    let value = fields.value.value;
    if (Array.isArray(value)) {
        if (types.isProxy(value) || Object.getPrototypeOf(value) !== arrayPrototype) invalid();
        const items = Object.getOwnPropertyDescriptors(value);
        const length = items.length?.value;
        if (!Number.isSafeInteger(length) || length < 0 || length > 512
            || Reflect.ownKeys(items).length !== length + 1) invalid();
        value = Array.from({ length }, (_, index) => {
            const item = items[String(index)];
            if (!item || !item.enumerable || !Object.hasOwn(item, 'value')
                || typeof item.value !== 'string') invalid();
            return item.value;
        });
    }
    return copyTypedFunctionalResult({ unit: fields.unit.value,
        kind: fields.kind.value, value });
}

let failureStage = 'admission';
function inputEntries(message) {
    if (message.profileSource !== null && (typeof message.profileSource !== 'string'
        || Buffer.byteLength(message.profileSource, 'utf8') > 65536)) throw new Error('host_child_protocol');
    if (message.qualificationSource !== null && (!qualifiedMode || message.phase !== 'proof'
        || typeof message.qualificationSource !== 'string' || Buffer.byteLength(message.qualificationSource) > 65536)) throw new Error('host_child_protocol');
    return [{ path: 'bundle.js', bytes: Buffer.from(message.source, 'utf8') },
        ...(message.profileSource === null ? [] : [{ path: PROFILE_PATH, bytes: Buffer.from(message.profileSource, 'utf8') }]),
        ...(message.qualificationSource === null ? [] : [{ path: QUALIFICATION_PATH, bytes: Buffer.from(message.qualificationSource, 'utf8') }])];
}
function validateInvocationArtifact(contents) {
    if (contents.files.length === 3) {
        if (!qualifiedMode) throw new Error('host_child_artifact');
        return validateClaimMonthArtifact(contents);
    }
    validatePhaseArtifactInputs(contents); return null;
}
function run(message, guardMessage) {
    failureStage = 'admission';
    if (!message || Object.keys(message).sort().join(',') !== 'bindings,derivationBindings,directGroups,directLinks,expectedRoot,kind,manifest,nodeSets,operandAliases,parentGroups,phase,profileSource,proofParentEdges,proofParentMaterials,proofSelections,proofSets,qualificationSource,source'
        || message.kind !== 'run' || typeof message.manifest !== 'string'
        || !['derivation', 'proof'].includes(message.phase)
        || typeof message.source !== 'string'
        || Buffer.byteLength(message.source, 'utf8') > 8 * 1024 * 1024) {
        throw new Error('host_child_protocol');
    }
    const receipt = admitArtifact({ manifestBytes: Buffer.from(message.manifest, 'utf8'),
        expectedRoot: message.expectedRoot,
        entries: inputEntries(message) });
    const contents = artifactContents(receipt);
    const proof = message.phase === 'proof';
    const qualification = validateInvocationArtifact(contents);
    const qualificationState = qualification ? { active: null, index: 0, results: [] } : null;
    if (contents.kind !== (proof ? 'proof' : 'metric')) {
        throw new Error('host_child_artifact');
    }
    process.send({ kind: 'measurement', event: ['M', proof ? 'proof_engine_artifact_root' : 'evaluator_artifact_root', receipt.observed_root] });
    let guardContents;
    if (!proof && message.derivationBindings !== null) {
        if (!guardMessage || guardMessage.phase !== 'proof' || typeof guardMessage.source !== 'string'
            || typeof guardMessage.manifest !== 'string') throw new Error('host_child_guard');
        const guardReceipt = admitArtifact({ manifestBytes: Buffer.from(guardMessage.manifest, 'utf8'),
            expectedRoot: guardMessage.expectedRoot,
            entries: inputEntries(guardMessage) });
        guardContents = artifactContents(guardReceipt);
        validateInvocationArtifact(guardContents);
        if (guardContents.kind !== 'proof')
            throw new Error('host_child_guard');
        process.send({ kind: 'measurement', event: ['M', 'proof_engine_artifact_root', guardReceipt.observed_root] });
    }
    failureStage = 'operands';
    const emit = event => process.send({ kind: 'observation', event });
    const controls = [];
    const operands = Object.create(null);
    const derivationNodes = new Map(); const selected = new Map();
    let derivationFailed = false;
    const invalidDerivation = () => { derivationFailed = true; throw new Error('host_child_derivation_guard'); };
    const derivationLinks = [...message.directLinks, ...message.directGroups.flatMap(group => group.links),
        ...message.nodeSets.flatMap(set => set.links)];
    function remember(access, bindings) {
        if (message.derivationBindings !== null) for (const binding of bindings)
            if (!derivationNodes.has(binding.alias)) derivationNodes.set(binding.alias, access.handle(binding.alias));
    }
    let proofFailed = false;
    if (proof) {
        if (message.directGroups.length || message.nodeSets.length || message.parentGroups.length || message.operandAliases.length
            || message.bindings.some(binding => binding.role !== (binding.alias === 'claim/context' ? 'proof/context' : 'proof/snapshot')))
            throw new Error('host_child_proof_config');
        const access = createInstrumentedAccess({ bindings: message.bindings, links: message.directLinks, emit });
        controls.push(access);
        const context = message.bindings.find(binding => binding.alias === 'claim/context');
        if (context) bindObservedContext(context.value, access.handle('claim/context'));
        let auxiliary;
        if (qualification) {
            if (!context || 'sha256:' + digest(context.value) !== qualification.core_context_hash) throw new Error('host_child_qualification_context');
            const role = `proof/qualification/${qualification.predicate_id}`;
            auxiliary = createInstrumentedAccess({ bindings: [{ alias: 'qualification/context', role,
                value: qualification.sidecar, shape: { type: 'record', fields: { qualification: { type: 'record', fields: {
                    alternative_period: { type: 'record', fields: { kind: { type: 'scalar' }, value: { type: 'scalar' } } }
                } } } } }], emit: event => {
                if (qualificationState.active !== qualification.predicate_id || qualification.variant !== 'M') throw new Error('host_child_qualification_scope');
                process.send({ kind: 'qualification_observation', event });
            } });
            controls.push(auxiliary);
        }
        if (!Array.isArray(message.proofParentEdges)) throw new Error('host_child_proof_parent');
        const parentAccess = message.proofParentEdges.length ? createDerivedParentAccess({ phase: 'proof', emit,
            bindings: message.proofParentEdges.map(edge => {
                const matches = message.bindings.filter(binding => binding.alias === edge.target);
                if (matches.length !== 1) throw new Error('host_child_proof_parent');
                return matches[0];
            }), edges: message.proofParentEdges }) : undefined;
        if (parentAccess) controls.push(parentAccess);
        bindObservedParents(message.proofParentMaterials, id => parentAccess.traverse(id));
        const invalid = () => { proofFailed = true; throw new Error('host_child_proof_access'); };
        function resolveReference(alias, field, ref) {
            if (typeof alias !== 'string' || typeof field !== 'string' || typeof ref !== 'string') invalid();
            const matches = message.directLinks.filter(link => link.source === alias && link.field === field
                && message.bindings.some(binding => binding.alias === link.target && binding.identity?.ref_id === ref));
            if (matches.length !== 1) invalid();
            return access.handle(alias).traverse(matches[0].id);
        }
        const proofSets = new Map();
        const materialBindings = message.bindings.filter(binding => binding.alias !== 'claim/context');
        for (const set of message.proofSets) {
            if (!set || Object.keys(set).sort().join(',') !== 'name,roster'
                || typeof set.name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(set.name)
                || proofSets.has(set.name) || !Array.isArray(set.roster)
                || set.roster.some(alias => !materialBindings.some(binding => binding.alias === alias && binding.identity))) invalid();
            const role = `proof/set/${set.name}`;
            const control = createNodeSetAccess({ role, roster: set.roster,
                bindings: materialBindings.map(binding => ({ ...binding, role })), links: message.directLinks, emit });
            controls.push(control); proofSets.set(set.name, control.handle);
        }
        const selections = new Map(); const selected = new Map(); let selectionBusy = false;
        if (!Array.isArray(message.proofSelections)) invalid();
        for (const selection of message.proofSelections) {
            if (!selection || Object.keys(selection).sort().join(',') !== 'candidate_set,selected_set'
                || typeof selection.selected_set !== 'string' || !/^[a-z][a-z0-9_]*$/.test(selection.selected_set)
                || !proofSets.has(selection.candidate_set) || proofSets.has(selection.selected_set)
                || selections.has(selection.selected_set)) invalid();
            selections.set(selection.selected_set, selection.candidate_set);
        }
        Object.defineProperties(operands, {
            phase: { enumerable: true, value: 'proof' },
            node: { enumerable: true, value: alias => access.handle(alias) },
            claim: { enumerable: true, value: () => access.handle('claim/context') },
            set: { enumerable: true, value: name => {
                if (selected.has(name)) return selected.get(name);
                if (typeof name !== 'string' || !proofSets.has(name)) invalid();
                return proofSets.get(name);
            } },
            select: { enumerable: true, value: (candidate, target, predicate) => {
                if (selectionBusy || typeof predicate !== 'function' || selected.has(target)
                    || selections.get(target) !== candidate || !proofSets.has(candidate)) invalid();
                selectionBusy = true;
                try {
                    const view = proofSets.get(candidate).select(predicate);
                    for (const control of controls) control.assertHealthy();
                    if (proofFailed) invalid();
                    selected.set(target, view); return view;
                } finally { selectionBusy = false; }
            } },
            resolveReference: { enumerable: true, value: resolveReference },
            memberEdge: { enumerable: true, value: (member, field) => {
                if (typeof field !== 'string') invalid();
                const owners = controls.filter(control => typeof control.rootAliasIfOwned === 'function')
                    .map(control => control.rootAliasIfOwned(member)).filter(alias => alias !== undefined);
                if (owners.length !== 1) invalid();
                const tuple = ['kind', 'ref_id', 'version'].map(key => member.identity(key));
                const aliases = message.bindings.filter(binding => binding.identity
                    && JSON.stringify(['kind', 'ref_id', 'version'].map(key => binding.identity[key])) === JSON.stringify(tuple));
                if (aliases.length !== 1 || aliases[0].alias !== owners[0]) invalid();
                return resolveReference(owners[0], field, member.get(field));
            } },
            edge: { enumerable: true, value: id => {
                if (message.proofParentEdges.some(edge => edge.id === id)) return parentAccess.traverse(id);
                const matches = message.directLinks.filter(link => link.id === id);
                if (matches.length !== 1) invalid();
                return access.handle(matches[0].source).traverse(id);
            } }
        });
        if (qualification) Object.defineProperties(operands, {
            qualification: { enumerable: true, value: () => {
                if (qualification.variant !== 'M' || qualificationState.active !== qualification.predicate_id) invalid();
                return auxiliary.handle('qualification/context');
            } },
            assertion: { enumerable: true, value: (id, callback) => {
                if (qualificationState.active !== null || typeof callback !== 'function'
                    || id !== qualification.predicate_ids[qualificationState.index]) invalid();
                qualificationState.active = id;
                process.send({ kind: 'proof_site_start', site: id });
                try {
                    const satisfied = callback();
                    if (typeof satisfied !== 'boolean') invalid();
                    qualificationState.results.push(satisfied); qualificationState.index++;
                    process.send({ kind: 'proof_site_result', site: id, satisfied }); return satisfied;
                } finally { qualificationState.active = null; }
            } }
        });
    } else if (message.directGroups.length) {
        for (const group of message.directGroups) {
            if (Object.hasOwn(operands, group.role)) throw new Error('host_child_role');
            const access = createInstrumentedAccess({ bindings: group.bindings, links: group.links, emit });
            controls.push(access);
            remember(access, group.bindings);
            Object.defineProperty(operands, group.role,
                { value: access.handle(group.alias), enumerable: true });
        }
    } else {
        const access = createInstrumentedAccess({ bindings: message.bindings,
            links: message.directLinks, emit });
        controls.push(access);
        remember(access, message.bindings);
        for (const operand of message.operandAliases) {
            if (Object.hasOwn(operands, operand.role)) throw new Error('host_child_role');
            Object.defineProperty(operands, operand.role,
                { value: access.handle(operand.alias), enumerable: true });
        }
    }
    for (const set of message.nodeSets) {
        if (Object.hasOwn(operands, set.role)) throw new Error('host_child_role');
        if (message.derivationBindings !== null && set.bindings.length) {
            const access = createInstrumentedAccess({ bindings: set.bindings, links: set.links, emit });
            controls.push(access); remember(access, set.bindings);
        }
        const control = createNodeSetAccess({ role: set.role, bindings: set.bindings,
            roster: set.roster, links: set.links, emit });
        controls.push(control);
        let handle = control.handle;
        if (message.derivationBindings !== null) {
            const selections = message.derivationBindings.selections.filter(row => row.role === set.role);
            handle = Object.freeze(Object.create(control.handle, { select: { value: predicate => {
                if (selections.some(row => selected.has(row.selected_set))) invalidDerivation();
                const view = control.handle.select(predicate);
                for (const row of selections) selected.set(row.selected_set, view);
                return view;
            } } }));
        }
        Object.defineProperty(operands, set.role, { value: handle, enumerable: true });
    }
    for (const group of message.parentGroups) {
        if (Object.hasOwn(operands, group.role)) throw new Error('host_child_role');
        const control = createDerivedParentAccess({ phase: 'derivation', emit,
            bindings: group.bindings, edges: group.edges });
        controls.push(control);
        Object.defineProperty(operands, group.role,
            { value: control.traverse(group.edgeId), enumerable: true });
    }
    harden(operands);
    failureStage = 'compartment';
    const guest = compartment(operands);
    const objectPrototype = guest.evaluate('Object.prototype');
    const arrayPrototype = guest.evaluate('Array.prototype');
    const evaluator = guest.evaluate(contents.files[0].source, EXECUTION_PROFILE.evaluate);
    if (typeof evaluator !== 'function') throw new Error('host_child_entry');
    failureStage = 'evaluation';
    const rawResult = evaluator(operands);
    if (qualificationState && (qualificationState.active !== null || qualificationState.index !== qualification.predicate_ids.length
        || rawResult !== qualificationState.results.every(Boolean))) throw new Error('host_child_qualification_sites');
    if (guardContents) {
        failureStage = 'evaluation';
        if (derivationFailed) invalidDerivation();
        const invalid = invalidDerivation;
        const inputSets = new Map();
        function inputSet(set) {
            if (set.aliases.some(alias => !derivationNodes.has(alias))) invalid();
            const members = set.aliases.map(alias => derivationNodes.get(alias));
            // Same admitted, non-selected input-population facade as the
            // compiler's native selection-observation path. No expected roster.
            const view = Object.freeze({ length: () => members.length, at: index => {
                if (!Number.isSafeInteger(index) || index < 0 || index >= members.length) invalid(); return members[index];
            }, [Symbol.iterator]() {
                let index = 0; let closed = false;
                return Object.freeze({ next() {
                    if (closed || index === members.length) { closed = true; return { value: undefined, done: true }; }
                    return { value: members[index++], done: false };
                }, return() { closed = true; return { value: undefined, done: true }; }, [Symbol.iterator]() { return this; } });
            } });
            inputSets.set(set.name, view); return view;
        }
        for (const row of message.derivationBindings.selections) if (!selected.has(row.selected_set)) invalid();
        const node = alias => { if (!derivationNodes.has(alias)) invalid(); return derivationNodes.get(alias); };
        const edge = id => {
            const matches = derivationLinks.filter(row => row.id === id);
            // A link can occur in several admitted role projections. Its
            // structural identity must remain identical, then use the first
            // reachable source handle, as the compiler does.
            if (!matches.length || matches.some(row => JSON.stringify(row) !== JSON.stringify(matches[0]))) invalid();
            return { relation: matches[0], handle: node(matches[0].source).traverse(id) };
        };
        const guardOperands = harden({ phase: 'derivation', node,
            claim: () => node('claim/context'), set: name => {
                if (selected.has(name)) return selected.get(name);
                if (inputSets.has(name)) return inputSets.get(name);
                const declared = message.derivationBindings.sets.find(set => set.name === name);
                if (!declared) invalid(); return inputSet(declared);
            }, edge: id => edge(id).handle, edgeTargetInSet: (id, name) => {
                const relation = edge(id).relation;
                const set = message.derivationBindings.sets.find(row => row.name === name);
                if (!set) invalid(); return set.aliases.includes(relation.target);
            } });
        const guard = guest.evaluate(guardContents.files[0].source, EXECUTION_PROFILE.evaluate);
        if (typeof guard !== 'function' || guard(guardOperands) !== true) invalid();
    }
    for (const control of controls) { control.revoke(); control.assertHealthy(); }
    if (proofFailed) throw new Error('host_child_proof_failed');
    failureStage = 'result';
    if (proof && typeof rawResult !== 'boolean') throw new Error('host_child_proof_result');
    const result = proof ? rawResult : copyGuestResult(rawResult, objectPrototype, arrayPrototype);
    return result;
}

process.once('message', message => {
    try {
        if (['--run-admitted-graph', '--run-qualified-graph'].includes(process.argv[2])) {
            if (!message || Object.keys(message).sort().join(',') !== 'derivation,kind,proof'
                || message.kind !== 'run_graph' || message.derivation?.phase !== 'derivation'
                || message.proof?.phase !== 'proof') throw new Error('host_child_protocol');
            for (const phase of ['derivation', 'proof']) {
                process.send({ kind: 'phase_start', phase });
                const value = run(message[phase], phase === 'derivation' ? message.proof : undefined);
                process.send({ kind: 'phase_result', phase, value });
            }
            process.send({ kind: 'graph_done' }, error => {
                if (error) process.exitCode = 1;
                process.disconnect();
            });
        } else {
            const value = run(message);
            process.send({ kind: 'result', value }, error => {
                if (error) process.exitCode = 1;
                process.disconnect();
            });
        }
    }
    catch {
        process.exitCode = 1;
        // Closed TCB stage codes only: never transport a guest's error text,
        // stack, payload or private identifier as diagnostic information.
        process.send({ kind: 'failure', stage: failureStage }, () => process.disconnect());
    }
});
process.send({ kind: 'ready' });
