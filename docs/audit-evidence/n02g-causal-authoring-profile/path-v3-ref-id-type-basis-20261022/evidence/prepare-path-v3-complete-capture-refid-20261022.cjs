'use strict';
// Mechanical reuse of the already exercised nine-artifact capture driver.
// Only the output prefix changes. No product helper, guest or compiler model.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const { createHash } = require('node:crypto');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const root = path.resolve(__dirname, '..');
for (const mode of ['green', 'affected']) {
    const report = JSON.parse(fs.readFileSync(path.join(__dirname, 'b4-02-ref-id-type-' + mode + '-20261022.json'), 'utf8'));
    if (report.child_exit !== 0 || !report.expected_outcome_confirmed || !report.sources_unchanged) throw Error('causal_validation_required');
    for (const row of report.sources_after)
        if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('validated_source_drift');
}
const original = fs.readFileSync(path.join(__dirname, 'prepare-path-v3-complete-capture-ac08-20261015.cjs'));
if (sha(original) !== 'b1d84b0aab9e7dc2058e78b643109eef8eb1706702aae5301b162337954b98b8') throw Error('mechanical_driver_pin');
const from = 'path-v3-complete-capture-ac08-20261015', to = 'path-v3-complete-capture-refid-20261022';
if (original.toString('utf8').split(from).length !== 2) throw Error('single_output_prefix');
const reused = new Module(__filename, module); reused.filename = __filename; reused.paths = module.paths;
reused._compile(original.toString('utf8').replace(from, to), __filename);
