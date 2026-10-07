import { types } from 'node:util';
import { createHash } from 'node:crypto';
import { canonicalValue, freezeDeep } from '../../src/next/kernel/canonicalValue.js';
import { selectedEventDayProgramFamily, resolveSelectedEventDayLeaseExpectation,
    PROFILE, NORMATIVE_COMMIT } from '../../src/next/provenance/selectedEventDayProfile.js';
import { resolveSelectedEventDayProgramConformance } from './selectedEventDayProgramContract.mjs';
import { PACKET_PATH, decodeSelectedEventDayPacket } from '../../src/next/provenance/selectedEventDayPacket.js';
const fail = code => { throw new Error('selected_day_packet_' + code); };
function fields(value, names) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('input');
    const d = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(d).length !== names.length || names.some(k => !d[k]?.enumerable || !Object.hasOwn(d[k], 'value'))) fail('input');
    return Object.fromEntries(names.map(k => [k, d[k].value]));
}
// Coherent packet preparation, not execution ticket/admission. No caller can
// provide a plan/expected hash instead of genuine presealed opaque receipts.
export function prepareSelectedEventDayPacket(raw) {
    const { expectations, leaseExpectations, programConformance } = fields(raw,
        ['expectations', 'leaseExpectations', 'programConformance']);
    const family = selectedEventDayProgramFamily(expectations);
    const program = resolveSelectedEventDayProgramConformance(programConformance);
    const leases = fields(leaseExpectations, ['C', 'M', 'S']);
    if (program.common_program_identity !== true || program.precommit_hash !== family.C.precommit_hash
        || program.expected_source_sha256 !== programConformance.program_sha256) fail('program');
    const variants = Object.fromEntries(['C', 'M', 'S'].map(variant => {
        const plan = resolveSelectedEventDayLeaseExpectation(leases[variant]);
        if (plan.variant !== variant || plan.precommit_hash !== family[variant].precommit_hash
            || plan.expected_ir_hash !== family[variant].expected_ir_hash
            || program.expected_ir_hashes[variant] !== plan.expected_ir_hash) fail('lease_identity');
        return [variant, { expected_ir_hash: plan.expected_ir_hash, plan_hash: leases[variant].plan_hash, plan }];
    }));
    const data = { schema_version: 1, profile_id: PROFILE, normative_commit: NORMATIVE_COMMIT,
        quarantine_origin: 'negative_qualification', precommit_hash: family.C.precommit_hash,
        program_sha256: program.expected_source_sha256, phase_sha256: family.C.phase.sha256,
        registry_sha256: family.C.phase.registry_sha256, helper_sources: program.helper_sources, variants };
    const source = canonicalValue(data); decodeSelectedEventDayPacket(source);
    return freezeDeep({ stage: 'selected_day_common_negative_packet_prepared_only', path: PACKET_PATH, source,
        sha256: 'sha256:' + createHash('sha256').update(source, 'utf8').digest('hex'),
        executable_ticket_complete: false, measured_tcb_admission: false,
        profile_witness_qualified: false, financial_release_eligible: false });
}
