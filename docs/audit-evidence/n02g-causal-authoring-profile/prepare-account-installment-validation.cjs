'use strict';
// Evidence packaging/checking only. --check does not reexecute any tests.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { reviewedCorpus } = require('./prepare-account-installment-application.cjs');
const root = path.resolve(__dirname, '../../..');
const output = path.join(__dirname, 'account-installment-application-validation.json');
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const read = name => JSON.parse(fs.readFileSync(path.join(root, '.codex-temp', name), 'utf8'));
const legacyNames = [
    'dashboard monthly free budget excludes registered bills paid by card',
    'family dashboard excludes a registered bill paid on the other family member card',
    'financial query monthly free budget excludes registered bills paid by card'
];
const names = list => list.map(value => value.replace(/^not ok \d+ - /, '')).sort();
function summarizeLog(file) {
    const bytes = fs.readFileSync(path.join(root, '.codex-temp', file));
    const text = bytes.toString('utf8'); const tap = {};
    for (const key of ['tests', 'pass', 'fail', 'skipped', 'cancelled']) {
        const matches = [...text.matchAll(new RegExp(`^(?:#|ℹ) ${key} (\\d+)$`, 'gm'))];
        assert.ok(matches.length, `${file}:${key}`); tap[key] = Number(matches.at(-1)[1]);
    }
    return { file, sha256: sha(bytes), tap };
}
function generate() {
    return { format: 'financasbot.n02g.account-installment-validation', version: 1,
        provenance: 'locally_executed_not_external_verdict',
        base: '42a16c8516373d1c5fc49a3836f0eba54e61d4c5',
        normative_review: '041da0dfefe8602b85d0168582da722cf74f9a53',
        status: 'candidate_awaiting_independent_code_review_with_global_wide_red',
        graph_accepted: false, releaseEligible: false, global_go: false,
        phases: Object.fromEntries([
            ['red', 'account-installment-red-v2.log'], ['green', 'account-installment-green.log'],
            ['affected', 'account-installment-affected-v2.log'],
            ['final_focals', 'account-installment-adversarial-v11.log'],
            ['hermetic_reproduction_red', 'wide-failures-focal-v1.log'],
            ['hermetic_reproduction_after', 'wide-failures-focal-v2.log'],
            ['tripwire_affected', 'account-installment-tripwire-affected.log']
        ].map(([phase, file]) => [phase, summarizeLog(file)])),
        wide_initial: read('wide-n02g-account-installment-20260930.json'),
        wide_final: read('wide-n02g-account-installment-20260930-v2.json'),
        legacy_baseline: read('legacy-baseline-42a16c.json'),
        limits: ['wide remains RED; three legacy failures were reproduced on the unchanged base',
            'no legacy runtime/test changes, no forced clock or newly skipped tests',
            'local invocation/predicate observations are not measured-host or graph acceptance',
            'synthetic/kernel variants are not admitted graph mutations',
            'initial RED/GREEN logs did not record the runtime; final affected/wide use pinned Node 22.17.0',
            '--check validates stored records, current hashes and corpus equality; it does not rerun tests'] };
}
function check(record) {
    assert.equal(record.global_go, false); assert.equal(record.graph_accepted, false);
    assert.equal(record.releaseEligible, false);
    const { original, expected, proposal } = reviewedCorpus();
    assert.equal(proposal.records.length, 11); assert.equal(original.graphs.length, 76);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'docs/contracts/next/provenance-v2/graphs-v2.json'))), expected);
    for (const [file, pin] of Object.entries(proposal.documents)) {
        if (file.endsWith('/graphs-v2.json')) continue;
        assert.equal(sha(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')), pin.sha256_lf);
    }
    assert.deepEqual([record.phases.red.tap.pass, record.phases.red.tap.fail], [2, 2]);
    assert.deepEqual([record.phases.green.tap.pass, record.phases.green.tap.fail], [4, 0]);
    assert.deepEqual([record.phases.affected.tap.pass, record.phases.affected.tap.fail], [424, 0]);
    assert.deepEqual([record.phases.final_focals.tap.pass, record.phases.final_focals.tap.fail], [3, 0]);
    assert.deepEqual([record.phases.hermetic_reproduction_after.tap.pass, record.phases.hermetic_reproduction_after.tap.fail], [15, 3]);
    assert.deepEqual([record.phases.tripwire_affected.tap.pass, record.phases.tripwire_affected.tap.fail], [16, 0]);
    for (const wide of [record.wide_initial, record.wide_final]) {
        assert.equal(wide.base, record.base); assert.equal(wide.head_after, record.base);
        assert.equal(wide.valid, false); assert.equal(wide.result.exit_status, 1);
        assert.equal(wide.result.valid, true); // Runner-output validity, NOT test success.
        assert.equal(wide.causal_inputs_unchanged, true);
        assert.deepEqual(wide.tested_hashes, wide.hashes_after);
    }
    assert.deepEqual([record.wide_initial.result.tap.pass, record.wide_initial.result.tap.fail, record.wide_initial.result.tap.skipped], [2398, 17, 10]);
    assert.deepEqual([record.wide_final.result.tap.pass, record.wide_final.result.tap.fail, record.wide_final.result.tap.skipped], [2413, 3, 10]);
    assert.equal(record.legacy_baseline.baseline, record.base);
    assert.deepEqual([record.legacy_baseline.tap.pass, record.legacy_baseline.tap.fail], [0, 3]);
    assert.deepEqual(names(record.legacy_baseline.failures), [...legacyNames].sort());
    assert.deepEqual(names(record.wide_final.result.failures), [...legacyNames].sort());
    assert.equal(Object.keys(record.wide_final.tested_hashes).length, 10);
    for (const [file, pin] of Object.entries(record.wide_final.tested_hashes)) {
        assert.equal(sha(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')), pin.lf_sha256, file);
    }
    return { evidence_checked: true, applied: 11, preserved_graphs: 65, preserved_proofs: 76,
        wide_pass: 2413, wide_fail: 3, wide_is_green: false, failures_equal_legacy_baseline: true,
        graph_accepted: false, global_go: false };
}
if (require.main === module) {
    assert.equal(process.argv.length, 3); const mode = process.argv[2];
    assert.ok(['--write-new', '--check'].includes(mode));
    const record = mode === '--write-new' ? generate() : JSON.parse(fs.readFileSync(output, 'utf8'));
    const result = check(record);
    if (mode === '--write-new') fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify(result));
}
module.exports = { check };
