'use strict';
// Existing non-scalar operator contracts shared by trusted development dispatch
// and build-time lowering. The registry still determines authored operators.
const SPECIAL_PROOF_OPERATORS = Object.freeze(Object.fromEntries(Object.entries({
    fingerprint_is: ['measured_material_fingerprint_equal', ['node:K', 'digest_literal']],
    civil_date_matches: ['instant_local_civil_date_equal', ['datetime', 'date', 'timezone', 'calendar']],
    all_match: ['all_members_satisfy_expanded_conjunction', ['set:node:K', 'predicate_template_ref']],
    none_match: ['no_member_satisfies_expanded_conjunction', ['set:node:K', 'predicate_template_ref']],
    same_field: ['one_distinct_field_value', ['set:node:K', 'field_selector:K:T']],
    join_eq: ['equal_unique_key_domains_and_pairwise_join', ['set:node:A', 'set:node:B', 'field_selector:A:T', 'field_selector:B:T']],
    ordered_by: ['lexicographic_order_with_explicit_ties', ['sequence:node:K', 'sort_key_descriptor:K']],
    edge_pair_complete: ['two_distinct_nodes_share_exact_identity', ['set:node:K', 'edge_selector:K:J', 'node:J']]
}).map(([id, [semantics, args]]) => [id, Object.freeze([semantics, Object.freeze(args)])])));
function matchesSpecialProofOperator(operator) {
    const spec = operator && Object.hasOwn(SPECIAL_PROOF_OPERATORS, operator.id) && SPECIAL_PROOF_OPERATORS[operator.id];
    return Boolean(spec && Object.keys(operator).sort().join(',') === 'args,id,semantics'
        && operator.semantics === spec[0] && JSON.stringify(operator.args) === JSON.stringify(spec[1]));
}
module.exports = { SPECIAL_PROOF_OPERATORS, matchesSpecialProofOperator };
