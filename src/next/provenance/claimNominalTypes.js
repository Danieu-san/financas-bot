'use strict';
// Pure nominal rule shared by descriptor requirements and the typed pass.
// No compiler/profile imports: the captured TCB dependency graph stays closed
// and acyclic without duplicating this identity classification.
const subjectKinds = Object.freeze({ source: 'source_state', merchant: 'merchant_identity', transfer_pair: 'transfer_identity' });
function claimReferenceKind(claim, segments) {
    const path = segments.join('.');
    if (path === 'subject.ref_id') return subjectKinds[claim.subject.kind] || claim.subject.kind;
    if (/^subject\.(family|person|category|budget)_id$/.test(path)) return segments[1].slice(0, -3);
    if (path === 'subject.person_ids') return 'person';
    return `claim.${path}`;
}
module.exports = { claimReferenceKind };
