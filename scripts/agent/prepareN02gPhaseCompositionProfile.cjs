'use strict';

// Offline materialization of the independently reviewed proposal. Never called
// during admission; never derives policy from the current candidate/trace.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const proposalSha = '8741d57e39a60b1bf5e8390bd8aa585df3f212c5';
const witnessPath = 'docs/audit-evidence/n02g-phase-composition/phase-witness.json';
const target = 'docs/contracts/next/provenance-v2/phase-composition-profile-v1.json';
const witness = JSON.parse(execFileSync('git', ['show', `${proposalSha}:${witnessPath}`], {
    cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024
}));
assert.equal(witness.registry_entry_count, 39);
assert.equal(witness.proposed_profile_inventory.length, 39);
const profile = {
    schema_version: 1,
    profile_id: 'phase_composition',
    profile_version: 1,
    reviewed_proposal_sha: proposalSha,
    registry_path: 'docs/contracts/next/provenance-v2/metric-evaluator-registry-v1.json',
    entries: witness.proposed_profile_inventory.map(({ proposed_derivation_mode, ...identity }) => ({
        ...identity, derivation_mode: proposed_derivation_mode
    }))
};
const source = JSON.stringify(profile, null, 2) + '\n';
if (process.argv.length !== 3 || !['--write', '--check'].includes(process.argv[2])) throw new Error('usage: --write|--check');
if (process.argv[2] === '--write') fs.writeFileSync(path.join(root, target), source, 'utf8');
assert.equal(fs.readFileSync(path.join(root, target), 'utf8'), source);
console.log(JSON.stringify({ valid: true, entries: 39, source: proposalSha, profile_path: target,
    profile_sha256: `sha256:${createHash('sha256').update(source, 'utf8').digest('hex')}` }));
