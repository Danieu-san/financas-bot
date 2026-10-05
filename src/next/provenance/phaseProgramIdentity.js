'use strict';
const { createHash } = require('node:crypto');
const { canonicalValue } = require('../kernel/canonicalValue');
const { copyData } = require('./observationContract');
// Same positive program identity for normal acceptance and negative baseline
// binding. Moving this pure function does not change the identity domain.
function proofProgramIdentity(proof, derivation, profileRoot) {
    const input = JSON.parse(JSON.stringify(copyData({ proof, derivation, profile_root: profileRoot })));
    if (!/^sha256:[a-f0-9]{64}$/.test(input.profile_root)) throw new Error('financial_host_program_identity');
    return 'sha256:' + createHash('sha256').update(canonicalValue({ domain: 'financasbot.provenance.phase-program.v1', ...input })).digest('hex');
}
module.exports = { proofProgramIdentity };
