'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const policy = require('../scripts/agent/financasBotNext02ValidationPolicy');
const prior = require('../scripts/agent/financasBotNext01ValidationPolicy');
const sourceRoot = path.resolve(__dirname, '../src/next');
const selectedDayPending = Object.freeze([
    'selectedEventDayAdjudicator.js', 'selectedEventDayCoreComparison.js', 'selectedEventDayCoverage.js',
    'selectedEventDayDerivationOperands.js', 'selectedEventDayDispatchCore.js', 'selectedEventDayDispatcher.js',
    'selectedEventDayExecutionTicket.js', 'selectedEventDayIrContract.js', 'selectedEventDayLauncher.js',
    'selectedEventDayOracle.js', 'selectedEventDayPacket.js', 'selectedEventDayProfile.js',
    'selectedEventDayProofChild.cjs', 'selectedEventDayProofHost.js', 'selectedEventDayProofOperands.js',
    'selectedEventDayProofProtocol.js'
].map(file => 'provenance/' + file));

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
    assert.equal(result.pendingReviewPaths.length, 79);
    assert.equal(new Set(result.pendingReviewPaths).size, 79);
    for (const file of result.pendingReviewPaths) assert.equal(Object.hasOwn(prior.REVIEWED_SOURCE_SHA256, file), false);
    assert.ok(result.pendingReviewPaths.includes('kernel/canonicalJson.js'));
    assert.ok(result.pendingReviewPaths.includes('provenance/executionHostChild.cjs'));
    assert.ok(result.pendingReviewPaths.includes('provenance/claimMonthIsolatedProfile.js'));
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
    for (const suffix of ['\nvoid 42;\n', "\nrequire('../provenance/civilCalendar');\n",
        "\nrequire('../provenance/selectedEventDayLauncher');\n"]) {
        fs.writeFileSync(file, source + suffix);
        const result = policy.inspectDevelopmentSources(root, 'N02-E');
        assert.ok(result.errors.includes('reviewed_source_mismatch:' + relative));
        assert.equal(result.releaseEligible, false);
        if (suffix.includes('require')) {
            const target = suffix.includes('selectedEventDayLauncher') ? 'selectedEventDayLauncher' : 'civilCalendar';
            assert.ok(result.errors.includes('relative_import_target_not_in_inventory:' + relative + ':../provenance/' + target));
        }
    }
});

test('selected-day development inventory is explicit pending-only and every omitted path remains an error', t => {
    const root = fixture(t);
    const clean = policy.inspectDevelopmentSources(root, 'N02-E');
    assert.deepEqual(clean.errors, []);
    assert.equal(clean.releaseEligible, false);
    assert.equal(clean.reviewedSourceMatches, 15);
    for (const relative of selectedDayPending) {
        assert.ok(clean.pendingReviewPaths.includes(relative));
        assert.equal(Object.hasOwn(prior.REVIEWED_SOURCE_SHA256, relative), false);
        assert.ok(policy.inspectSources(root, 'N02-E').errors.includes('unexpected_executable_source:' + relative));
        const file = path.join(root, relative), bytes = fs.readFileSync(file);
        fs.unlinkSync(file);
        assert.ok(policy.inspectDevelopmentSources(root, 'N02-E').errors.includes('missing_executable_source:' + relative));
        fs.writeFileSync(file, bytes);
    }
    const candidate = path.join(root, 'provenance/selectedEventDayLauncher.js');
    fs.appendFileSync(candidate, '\nvoid 42;\n');
    const changed = policy.inspectDevelopmentSources(root, 'N02-E');
    assert.deepEqual(changed.errors, []);
    assert.equal(changed.releaseEligible, false);
    assert.equal(changed.reviewedSourceMatches, 15);
    assert.ok(policy.inspectSources(root, 'N02-E').errors.includes('unexpected_executable_source:provenance/selectedEventDayLauncher.js'));
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
