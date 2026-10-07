import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalValue, digest, freezeDeep } from '../../src/next/kernel/canonicalValue.js';
import { selectedEventDayClaimInputs } from '../../src/next/provenance/selectedEventDayProfile.js';
import { copyTypedFunctionalResult } from '../../src/next/provenance/claimBinding.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json';
const fail = code => { throw new Error('selected_day_oracle_seal_' + code); };
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
// Fixed local synthetic oracle, sealed BEFORE ANY M compilation/execution.
// No caller may supply expected, oracle bytes, a path, baseline or result.
// Hashes are candidate evidence; reviewed TCB authority remains a later gate.
export function sealSelectedEventDayOracle(raw) {
    if (!raw || types.isProxy(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== 3 || ['C', 'M', 'S'].some(v => !d[v]?.enumerable || !Object.hasOwn(d[v], 'value'))) fail('input');
    const inputs = Object.fromEntries(['C', 'M', 'S'].map(v => [v, selectedEventDayClaimInputs(d[v].value)]));
    if (canonicalValue(inputs.C) !== canonicalValue(inputs.M) || canonicalValue(inputs.C) !== canonicalValue(inputs.S)) fail('family');
    const input = inputs.C, bytes = fs.readFileSync(path.join(root, sourcePath));
    if (!bytes.length || bytes.length > 1024 * 1024 || !Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes)) fail('source');
    const oracle = JSON.parse(bytes.toString('utf8'));
    if (oracle.schema_version !== 1 || oracle.oracle_id !== 'NEXT-GOLDEN-CLAIM-ORACLES-V1' || oracle.synthetic !== true) fail('source');
    const [conversation, turn, ordinal, extra] = input.claim.fact_key.split('#');
    if (extra !== undefined || !/^[1-9][0-9]*$/.test(ordinal ?? '')) fail('fact_key');
    const row = oracle.turns?.[conversation + '#' + turn];
    const fact = row?.facts?.[Number(ordinal) - 1];
    if (row?.disposition !== 'materialized' || !fact || input.claim.period.kind !== 'date'
        || fact.metric !== input.claim.metric || fact.unit !== input.result_signature.unit
        || fact.entity !== input.claim.subject.ref_id || fact.period !== input.claim.period.value
        || ['time_basis', 'coverage', 'evidence_state'].some(k => fact[k] !== input.claim[k])) fail('claim');
    const expectedResult = copyTypedFunctionalResult({ kind: input.result_signature.kind,
        unit: input.result_signature.unit, value: fact.value });
    if (input.result_signature.enum_values?.length && !input.result_signature.enum_values.includes(expectedResult.value)) fail('signature');
    const { claim, ...sealed } = input;
    return freezeDeep({ ...sealed, fact_key: claim.fact_key, source_path: sourcePath, source_sha256: sha(bytes),
        expected_result: expectedResult, expected_result_sha256: 'sha256:' + digest(expectedResult),
        stage: 'selected_day_original_oracle_sealed_only', profile_witness_qualified: false, semantic_mutation_credit: 0 });
}
export function assertSelectedEventDayOracleSource(sealed) {
    if (!sealed || sealed.source_path !== sourcePath || sha(fs.readFileSync(path.join(root, sourcePath))) !== sealed.source_sha256)
        fail('source_changed');
}
