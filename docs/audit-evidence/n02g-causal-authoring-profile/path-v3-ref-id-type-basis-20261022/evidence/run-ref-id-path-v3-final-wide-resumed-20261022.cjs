'use strict';
// Mechanical continuation after a computer restart, not a partial test resume.
// Keep the original runner, native hooks, limits, bootstrap and final validation.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = fs.readFileSync(path.join(__dirname, 'run-ref-id-path-v3-final-wide-20261022.cjs'));
assert.equal(sha(bytes), 'd84d0177b3cd9d2bc2cd4f8fb64c59d065d99e69a2eaf30511cdf89e72803380');
let source = bytes.toString('utf8');
function once(from, to) {
  assert.equal(source.split(from).length, 2, 'exactly one mechanical replacement: ' + from);
  source = source.replace(from, to);
}
once("\"prefix=path.join(__dirname,'ref-id-path-v3-final-wide-20261022');\"",
     "\"prefix=path.join(__dirname,'ref-id-path-v3-final-wide-resumed-20261022');\"");
once('function newManifest() {', `function newManifest() {
    const interruptedPreflightBytes = local('ref-id-path-v3-final-wide-20261022.preflight.json');
    assert.equal(sha(interruptedPreflightBytes), '55225ecc8e73b8cfbc984b70b982e2f127e0661615b9499ab6040d7105d9c315');
    const interruptedPreflight = JSON.parse(interruptedPreflightBytes);
    assert.equal(interruptedPreflight.proof_bindings.length, 32);
    for (const row of interruptedPreflight.proof_bindings) {
        const data = read(row.path); assert.equal(data.length, row.bytes); assert.equal(sha(data), row.sha256);
    }
    const interruption = JSON.parse(local('ref-id-path-v3-final-wide-20261022.interruption.json'));
    assert.equal(interruption.state, 'interrupted_computer_restart');
    assert.equal(interruption.final_report_absent, true);
    assert.equal(interruption.partial_outputs_preserved_not_merged, true);
    assert.equal(interruption.sources_current_sha256, interruptedPreflight.measured_sources_sha256);
    assert.equal(fs.existsSync(path.join(__dirname, 'ref-id-path-v3-final-wide-20261022.json')), false);
    const interruptedJobBytes = local('ref-id-path-v3-final-wide-20261022.job.json');
    assert.equal(sha(interruptedJobBytes), interruption.old_job_sha256);
    const interruptedJob = JSON.parse(interruptedJobBytes);
    for (const [kind, file] of Object.entries(interruptedJob.live_output)) {
        const data = fs.readFileSync(file), expected = interruption.partial_outputs[kind];
        assert.equal(data.length, expected.bytes); assert.equal(sha(data), expected.sha256);
    }
`);
once("    const files = old.map(row => ({ path: row.path, sha256: sha(read(row.path)) }));",
     "    const files = old.map(row => ({ path: row.path, sha256: sha(read(row.path)) }));\n" +
     "    assert.equal(sha(JSON.stringify(files)), interruptedPreflight.measured_sources_sha256);\n" +
     "    assert.equal(sha(JSON.stringify(files)), '533d1d3a095dd3d71a72178965f9ed75968b009e889be9991808719472c1c652');");
once('    const proofBindings = proofNames.map(file => { const data = local(file);',
     "    assert.equal(proofNames.length, 32);\n" +
     "    proofNames.push('run-ref-id-path-v3-final-wide-resumed-20261022.cjs', 'ref-id-path-v3-final-wide-20261022.interruption.json');\n" +
     '    const proofBindings = proofNames.map(file => { const data = local(file);');
const reused = new Module(__filename, module);
reused.filename = __filename; reused.paths = module.paths;
reused._compile(source, __filename);
