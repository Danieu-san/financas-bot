'use strict';
// Local test evidence only. Not a measured launcher or release/graph approval.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const files = [
    'docs/contracts/next/provenance-v2/graphs-v2.json',
    'src/next/provenance/graphCompiler.js',
    'src/next/provenance/metricInstallments.js',
    'src/next/provenance/proofOperators.js',
    'tests/next/provenance/authoringIndex.cases.js',
    'tests/next/provenance/metricInstallments.cases.js',
    'tests/helpers/exhaustiveNetworkTripwire.js',
    'tests/exhaustiveLocalTestCoverageRunner.test.js',
    'docs/audit-evidence/n02g-causal-authoring-profile/prepare-account-installment-application.cjs',
    'docs/audit-evidence/n02g-causal-authoring-profile/run-account-installment-wide.cjs'
];
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function hashes() {
    return Object.fromEntries(files.map(file => {
        const bytes = fs.readFileSync(path.join(root, file));
        return [file, { raw_sha256: sha(bytes), lf_sha256: sha(bytes.toString('utf8').replaceAll('\r\n', '\n')) }];
    }));
}
function git(...args) {
    return execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, ...args],
        { encoding: 'utf8', windowsHide: true }).trim();
}
function run() {
    assert.equal(process.argv.length, 2, 'no caller-selected sources or output path');
    require('../../../src/next/provenance/pinnedCivilTimezone').checkTimezoneRuntime(
        process.versions, process.config.variables, process.env, process.execArgv);
    const originalBase = '42a16c8516373d1c5fc49a3836f0eba54e61d4c5';
    const beforeHead = git('rev-parse', 'HEAD');
    assert.equal(beforeHead, originalBase);
    const stem = path.join(root, '.codex-temp/wide-n02g-account-installment-20260930-v2');
    assert.equal(fs.existsSync(`${stem}.json`), false, 'do not overwrite a completed suite');
    const started = { format: 'financasbot.n02g.local-wide-start', started_at: new Date().toISOString(),
        pid: process.pid, branch: git('branch', '--show-current'), base: beforeHead,
        node: process.versions.node, runtime_sha256: sha(fs.readFileSync(process.execPath)),
        tested_hashes: hashes(), graph_accepted: false, releaseEligible: false };
    fs.writeFileSync(`${stem}-start.json`, JSON.stringify(started, null, 2) + '\n', { flag: 'wx' });
    let result; let exception = null;
    try { result = require('../../../scripts/runExhaustiveLocalTestCoverage').runLocalCoverage(); }
    catch (error) { exception = String(error.message); }
    const afterHead = git('rev-parse', 'HEAD'); const after = hashes();
    const unchanged = beforeHead === afterHead && JSON.stringify(started.tested_hashes) === JSON.stringify(after);
    const record = { format: 'financasbot.n02g.account-installment-wide',
        provenance: 'locally_executed_not_external_verdict', ...started,
        finished_at: new Date().toISOString(), head_after: afterHead, hashes_after: after,
        causal_inputs_unchanged: unchanged, result: result || null, exception,
        valid: unchanged && !exception && result?.valid === true && result?.exit_status === 0,
        graph_accepted: false, releaseEligible: false };
    fs.writeFileSync(`${stem}.json`, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    process.stdout.write(JSON.stringify({ valid: record.valid, tap: result?.tap, exception, unchanged }) + '\n');
    process.exitCode = record.valid ? 0 : 1;
}
if (require.main === module) run();
module.exports = { files, hashes };
