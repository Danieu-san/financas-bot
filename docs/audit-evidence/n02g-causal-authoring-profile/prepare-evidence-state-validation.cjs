'use strict';
// Reproduce the closed delta and check saved LOCAL test evidence. No evaluator,
// graph application, external-verdict generation or acceptance is performed.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { createHash } = require('node:crypto'); const { execFileSync } = require('node:child_process');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const root = path.resolve(__dirname, '../../..');
const base = '6889d2941736a2ee0b88c94873a2055795b16d97';
const prefix = 'docs/contracts/next/provenance-v2/'; const graphPath = prefix + 'graphs-v2.json';
const filename = path.join(__dirname, 'evidence-state-validation.json');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const digest = value => hash(canonicalValue(value));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const tested = [graphPath, 'src/next/provenance/metricSelection.js', 'tests/next/provenance/authoringIndex.cases.js',
    'tests/next/provenance/metricSelection.cases.js'];
function build(mode) {
    const previous = mode === '--check' ? JSON.parse(fs.readFileSync(filename, 'utf8')) : null;
    const local = phase => JSON.parse(read(`.codex-temp/n02g-evidence-state-${phase}.json`));
    const red = previous?.red || local('red'); const initialGreen = previous?.initial_green || local('green');
    const green = previous?.green || local('green-v2'); const affected = previous?.affected || local('affected');
    const wide = previous?.wide || JSON.parse(read('.codex-temp/wide-n02g-evidence-state-20260922.json'));
    assert.equal(red.tap.fail, 2); assert.equal(red.tap.pass, 1); assert.equal(red.exit_status, 1);
    assert.ok(red.failures[0].includes('EVIDENCE-STATE-001')); assert.ok(red.failures[1].includes('EVIDENCE-STATE-002'));
    assert.equal(initialGreen.tap.fail, 1); assert.equal(initialGreen.tap.pass, 3);
    assert.ok(initialGreen.failures[0].includes('EVIDENCE-STATE-004'));
    assert.equal(green.tap.pass, 4);
    for (const record of [green, affected, wide]) {
        assert.equal(record.exit_status, 0); assert.equal(record.tap.fail, 0); assert.equal(record.tap.cancelled, 0);
        assert.equal(record.tap.todo, 0); assert.ok(record.tap.pass > 0);
    }
    assert.equal(green.tap.skipped, 0); assert.equal(affected.tap.skipped, 0);
    assert.equal(wide.valid, true); assert.equal(wide.candidate_unchanged, true); assert.equal(wide.source_head, base);
    assert.deepEqual(wide.candidate_files.map(f => f.path).sort(), tested);
    for (const file of wide.candidate_files) assert.equal(hash(read(file.path)), file.lf_sha256, `tested_bytes_changed:${file.path}`);
    assert.deepEqual(git(['diff', '--name-only', base]).trim().split(/\r?\n/)
        .filter(file => /^(src|scripts|tests|docs\/contracts)\//.test(file)).sort(), tested);
    const beforeText = git(['show', `${base}:${graphPath}`]); const before = JSON.parse(beforeText);
    assert.equal(hash(beforeText), 'sha256:3354494ac13c6210e07a62f1e1472a33701fa6e2f0688b63112e7d5c1cd63ad2');
    const current = JSON.parse(read(graphPath)); const expected = structuredClone(before);
    const claimsPath = prefix + 'claims-v2.json'; const registryPath = prefix + 'metric-evaluator-registry-v1.json';
    const claims = JSON.parse(read(claimsPath)); const registry = JSON.parse(read(registryPath));
    const entry = registry.entries.find(e => e.evaluator_id === 'safe_daily_pace' && e.evaluator_version === 1);
    assert.equal(entry.evaluator_contract_hash, 'sha256:195e3968cc2f7f7dd2e46fdcb2619c19892b5c56a27d0e3c62f76fe08ba9a14d');
    assert.equal(hash(read(entry.contract_path)), entry.evaluator_contract_hash);
    assert.equal(entry.roles.find(r => r.role_id === 'context').input_kind, 'claim_context');
    const protectedPaths = [claimsPath, registryPath, entry.contract_path, prefix + 'claim-contract.schema.json',
        prefix + 'evidence-snapshot.schema.json', prefix + 'material-field-registry-v1.json',
        'src/next/provenance/graphCompiler.js', 'src/next/provenance/packageContract.js'];
    const unchanged = protectedPaths.map(file => {
        assert.equal(read(file), git(['show', `${base}:${file}`]), `protected_file_changed:${file}`);
        return { path: file, lf_sha256: hash(read(file)) };
    });
    const records = [];
    for (const claim of claims.claims.filter(c => c.evaluator_ref.evaluator_id === entry.evaluator_id && c.evaluator_ref.evaluator_version === entry.evaluator_version)) {
        assert.deepEqual(claim.operand_bindings.context, { kind: 'claim_context' }); assert.equal(claim.evidence_state, 'estimated');
        const graph = expected.graphs.find(g => g.fact_key === claim.fact_key); const original = structuredClone(graph);
        const requirement = { segments: ['evidence_state'] }; const equals = r => JSON.stringify(r) === JSON.stringify(requirement);
        assert.equal(graph.trace_contract.derivation.required_claim_reads.filter(equals).length, 0);
        assert.equal(graph.trace_contract.proof.required_claim_reads.filter(equals).length, 1);
        graph.trace_contract.derivation.required_claim_reads.push(requirement);
        records.push({ fact_key: claim.fact_key, requirement, before_graph_sha256: digest(original), after_graph_sha256: digest(graph) });
    }
    assert.equal(records.length, 2); assert.equal(current.graphs.length, 76);
    assert.deepEqual(current, expected, 'only_two_reviewed_claim_reads_may_change');
    const keys = ['recorded_at', 'started_at', 'node', 'source_head', 'candidate_files', 'candidate_unchanged', 'duration_ms',
        'local_only', 'network_guard_scope', 'test_files', 'discovered_test_files', 'exit_status', 'signal', 'valid',
        'validation_reasons', 'tap', 'coverage', 'failures', 'skipped_tests'];
    return { schema: 'n02g-evidence-state-validation-v1', base, status: 'candidate_awaiting_independent_code_audit',
        evidence_kind: 'locally_executed_not_external_verdict', graph_accepted: false, releaseEligible: false,
        scope: { changed_graphs: 2, unchanged_graphs: 74, records, all_other_graph_fields_preserved: true,
            before_lf_sha256: hash(beforeText), after_lf_sha256: hash(read(graphPath)) }, unchanged,
        red, initial_green: initialGreen, green, affected, wide: Object.fromEntries(keys.filter(k => wide[k] !== undefined).map(k => [k, wide[k]])),
        integration: { schema_valid_kernel_context_cases: 102, admitted_safe_pace_cases: 2, invalid_budget_states: 3,
            selection_and_R_preserved: true, removed_required_state_observation_rejected: true,
            expected_frozen_before_execution: true, alternate_claim_not_accepted: true },
        note: 'Initial integration failure was trace_coverage_expected: corrected the harness input to the seven required fields. Historical family/instrument corpus checks explicitly compose the two reviewed reads. Saved local records are not external execution or a global gate verdict.' };
}
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
if (mode === '--write-new') assert.equal(fs.existsSync(filename), false, 'refuse_overwrite');
const record = build(mode);
if (mode === '--write-new') fs.writeFileSync(filename, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(JSON.parse(fs.readFileSync(filename, 'utf8')), record, 'evidence_changed');
console.log(JSON.stringify({ valid: true, mode, base, wide: record.wide.tap, tested_files: tested.length, changed_graphs: record.scope.changed_graphs }));
