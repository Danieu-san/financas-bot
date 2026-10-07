import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { canonicalValue } from '../../src/next/kernel/canonicalValue.js';
import { buildTrustedCommonJsBundle } from './buildNextProvenanceArtifacts.mjs';
import { prepareSelectedEventDayPacket } from './prepareSelectedEventDayPacket.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = source => 'sha256:' + createHash('sha256').update(source, 'utf8').digest('hex');
// Byte capture of a negative-only controller component, not a complete host,
// child, execution ticket, reviewed validation_tcb_root or financial entry.
export function buildSelectedEventDayDispatchCapsule(raw) {
    const packet = prepareSelectedEventDayPacket(raw);
    const recipe = ['selectedEventDayDispatchCore', 'selectedEventDayPacket', 'observationContract', 'observationScalars'];
    const sources = recipe.map(name => ({ path: 'provenance/' + name + '.js',
        source: fs.readFileSync(path.join(root, 'src/next/provenance/' + name + '.js'), 'utf8') }));
    sources.push({ path: 'kernel/canonicalValue.js', source: fs.readFileSync(path.join(root, 'src/next/kernel/canonicalValue.js'), 'utf8') },
        { path: 'provenance/selectedDayCapturedPacket.js', source: 'module.exports=' + JSON.stringify(packet.source) + ';\n' },
        { path: 'provenance/selectedDayDispatchEntry.js', source:
            `'use strict';const {types}=require('node:util');`
            + `const {decodeSelectedEventDayPacket}=require('./selectedEventDayPacket');`
            + `const {createSelectedEventDayDispatchCore}=require('./selectedEventDayDispatchCore');`
            + `const packet=decodeSelectedEventDayPacket(require('./selectedDayCapturedPacket'));`
            + `function create(raw){const fail=()=>{throw new Error('selected_day_captured_input');};`
            + `if(!raw||typeof raw!=='object'||types.isProxy(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))fail();`
            + `const d=Object.getOwnPropertyDescriptors(raw);if(Reflect.ownKeys(d).length!==3||['variant','scope','emit'].some(k=>!d[k]?.enumerable||!Object.hasOwn(d[k],'value')))fail();`
            + `const variant=d.variant.value;if(!['C','M','S'].includes(variant))fail();`
            + `return createSelectedEventDayDispatchCore({plan:packet.variants[variant].plan,scope:d.scope.value,emit:d.emit.value});}`
            + `module.exports={create};\n` });
    const built = buildTrustedCommonJsBundle({ sources, entry: 'provenance/selectedDayDispatchEntry.js', exportName: 'create' });
    const entry = 'selected-day-dispatch-bootstrap.js', source = built.source;
    const manifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'tcb', entry,
        files: [{ path: entry, media_type: 'text/javascript', sha256: sha(source) }] });
    return Object.freeze({ stage: 'selected_day_negative_dispatch_capsule_build_only', entry, source, manifest,
        artifact_root: sha(manifest), packet_sha256: packet.sha256, sourceHashes: Object.freeze(built.sourceHashes),
        nativeExternals: Object.freeze(built.nativeExternals), executable_ticket_complete: false,
        measured_tcb_admission: false, profile_witness_qualified: false, financial_release_eligible: false });
}
