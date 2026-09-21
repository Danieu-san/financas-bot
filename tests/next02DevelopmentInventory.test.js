'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const policy = require('../scripts/agent/financasBotNext02ValidationPolicy');
const prior = require('../scripts/agent/financasBotNext01ValidationPolicy');
const sourceRoot = path.resolve(__dirname, '../src/next');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'next02-dev-inventory-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.cpSync(sourceRoot, root, { recursive: true });
    return root;
}

test('development inventory preserves reviewed hashes and reports pending sources without release approval', () => {
    const result = policy.inspectDevelopmentSources(sourceRoot, 'N02-E');
    assert.deepEqual(result.errors, []);
    assert.equal(result.reviewedSourceMatches, 15);
    assert.equal(result.releaseEligible, false);
    assert.equal(result.scope, 'development-regression');
    assert.equal(result.pendingReviewPaths.length, 30);
    assert.ok(result.pendingReviewPaths.includes('provenance/metricReferences.js'));
    assert.equal(Object.hasOwn(prior.REVIEWED_SOURCE_SHA256, 'provenance/metricReferences.js'), false);
    assert.deepEqual(Object.keys(prior.REVIEWED_SOURCE_SHA256).sort(),
        [...policy.sliceContract('N02-E').paths].sort());
    assert.deepEqual(policy.inspectSources(sourceRoot, 'N02-E').errors,
        result.pendingReviewPaths.map(file => 'unexpected_executable_source:' + file));
});

test('development inventory rejects extra files, missing candidates and redirected source entries', t => {
    const root = fixture(t);
    for (const relative of ['provenance/extra.js', 'provenance/extra.node', 'unexpected.json']) {
        const file = path.join(root, relative);
        fs.writeFileSync(file, '');
        assert.ok(policy.inspectDevelopmentSources(root, 'N02-E').errors
            .includes('unexpected_executable_source:' + relative));
        fs.unlinkSync(file);
    }
    const candidate = path.join(root, 'provenance/civilCalendar.js');
    fs.unlinkSync(candidate);
    assert.ok(policy.inspectDevelopmentSources(root, 'N02-E').errors
        .includes('missing_executable_source:provenance/civilCalendar.js'));
    fs.copyFileSync(path.join(sourceRoot, 'provenance/civilCalendar.js'), candidate);
    const provenance = path.join(root, 'provenance');
    fs.renameSync(provenance, path.join(root, 'saved-provenance'));
    fs.symlinkSync(path.join(root, 'saved-provenance'), provenance, 'junction');
    const redirected = policy.inspectDevelopmentSources(root, 'N02-E');
    assert.ok(redirected.errors.includes('unexpected_source_entry_type:provenance:other'));
    assert.equal(redirected.releaseEligible, false);
});

test('development inventory rejects changed reviewed bytes and imports into pending sources', t => {
    const root = fixture(t);
    const relative = 'contracts/reuseManifest.js';
    const file = path.join(root, relative);
    const source = fs.readFileSync(file, 'utf8');
    for (const suffix of ['\nvoid 42;\n', "\nrequire('../provenance/civilCalendar');\n"]) {
        fs.writeFileSync(file, source + suffix);
        const result = policy.inspectDevelopmentSources(root, 'N02-E');
        assert.ok(result.errors.includes('reviewed_source_mismatch:' + relative));
        assert.equal(result.releaseEligible, false);
        if (suffix.includes('require')) assert.ok(result.errors.includes(
            'relative_import_target_not_in_inventory:' + relative + ':../provenance/civilCalendar'));
    }
});

test('development inventory does not promote pending bytes to reviewed sources', t => {
    const root = fixture(t);
    fs.appendFileSync(path.join(root, 'provenance/civilCalendar.js'), '\nvoid 42;\n');
    const result = policy.inspectDevelopmentSources(root, 'N02-E');
    assert.deepEqual(result.errors, []);
    assert.equal(result.reviewedSourceMatches, 15);
    assert.equal(result.releaseEligible, false);
    assert.ok(result.pendingReviewPaths.includes('provenance/civilCalendar.js'));
    assert.ok(policy.inspectSources(root, 'N02-E').errors.length > 0);
});
