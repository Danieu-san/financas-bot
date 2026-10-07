'use strict';
// Closed DATA codec only. Parsing/hash equality cannot grant private execution
// authority, normal graph acceptance, financial receipts or profile credit.
const { copyData, decodeObservation, identifier } = require('./observationContract');
const { canonicalValue, digest, freezeDeep } = require('../kernel/canonicalValue');
const PACKET_PATH = 'qualification/selected-event-day-path-v1.json';
const PROFILE = 'selected-event-day-path/v1';
const NORMATIVE_COMMIT = 'f1a8cd4629b245009b9dd8fbb8dce83da77ba3d4';
const fail = code => { throw new Error('selected_day_packet_' + code); };
const hash = value => 'sha256:' + digest(value);
const isHash = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
function keys(value, names) {
    if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...names].sort().join(',')) fail('shape');
}
function decodeSelectedEventDayPacket(source) {
    if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > 65536) fail('source');
    // Admit passive descriptors first, then materialize ordinary data records
    // for the existing canonical JSON contract (which excludes null prototypes).
    let data; try { data = structuredClone(copyData(JSON.parse(source))); } catch { fail('shape'); }
    keys(data, ['schema_version', 'profile_id', 'normative_commit', 'quarantine_origin', 'precommit_hash',
        'program_sha256', 'phase_sha256', 'registry_sha256', 'helper_sources', 'variants']);
    if (canonicalValue(data) !== source || data.schema_version !== 1 || data.profile_id !== PROFILE
        || data.normative_commit !== NORMATIVE_COMMIT || data.quarantine_origin !== 'negative_qualification'
        || [data.precommit_hash, data.program_sha256, data.phase_sha256, data.registry_sha256].some(v => !isHash(v))) fail('identity');
    keys(data.variants, ['C', 'M', 'S']);
    const paths = new Set();
    if (!Array.isArray(data.helper_sources) || !data.helper_sources.length || data.helper_sources.length > 64) fail('helpers');
    for (const helper of data.helper_sources) {
        keys(helper, ['path', 'sha256']);
        if (typeof helper.path !== 'string' || !/^(provenance|kernel)\/[A-Za-z][A-Za-z0-9]*\.js$/.test(helper.path)
            || paths.has(helper.path) || !isHash(helper.sha256)) fail('helpers');
        paths.add(helper.path);
    }
    for (const variant of ['C', 'M', 'S']) {
        const row = data.variants[variant]; keys(row, ['expected_ir_hash', 'plan_hash', 'plan']);
        if (!isHash(row.expected_ir_hash) || !isHash(row.plan_hash) || hash(row.plan) !== row.plan_hash) fail('plan_hash');
        const plan = row.plan;
        keys(plan, ['profile', 'variant', 'precommit_hash', 'expected_ir_hash', 'queue', 'fringe',
            'guard_count', 'candidate_set', 'selected_set']);
        if (plan.profile !== PROFILE || plan.variant !== variant || plan.precommit_hash !== data.precommit_hash
            || plan.expected_ir_hash !== row.expected_ir_hash || !Array.isArray(plan.fringe) || plan.fringe.length !== 4
            || !Array.isArray(plan.queue) || !plan.queue.length || plan.queue.length > 32768
            || !Number.isSafeInteger(plan.guard_count) || plan.guard_count < 1 || plan.guard_count >= plan.queue.length) fail('plan');
        if ([plan.candidate_set, plan.selected_set].some(n => typeof n !== 'string' || !/^[a-z][a-z0-9_]*$/.test(n))
            || plan.candidate_set === plan.selected_set) fail('selection');
        const sites = new Set(), targets = [];
        plan.queue.forEach((site, index) => {
            keys(site, ['site', 'predicate_id', 'selection_guard', 'target', 'truth']);
            const guard = index < plan.guard_count;
            if (!identifier(site.predicate_id) || site.selection_guard !== guard || typeof site.target !== 'boolean'
                || site.truth !== (site.target ? variant !== 'M' : true)
                || site.site !== (guard ? 'selection/0/candidate/0/guard/' : 'assertion/') + site.predicate_id
                || sites.has(site.site)) fail('site');
            sites.add(site.site); if (site.target) targets.push(site);
        });
        if (targets.length !== 2 || !targets[0].selection_guard || targets[1].selection_guard
            || targets[0].predicate_id !== targets[1].predicate_id) fail('target_sites');
        const tuples = plan.fringe.map((row, index) => {
            keys(row, ['site', 'operand', 'tuple']);
            const expectedSites = [targets[0].site, 'selection/0/member/0', 'selection/0/return', targets[1].site];
            if (row.site !== expectedSites[index] || row.operand !== ([0, null, null, 0][index])) fail('fringe_site');
            try { return decodeObservation(row.tuple); } catch { fail('fringe_tuple'); }
        });
        const role = 'proof/set/' + plan.candidate_set, operandAlias = 'operand/' + role;
        const member = tuples[1], returned = tuples[2];
        if (member[1] !== 'select_member' || member[2] !== operandAlias || member[3] !== role
            || canonicalValue(member[4]) !== '[0]' || member[5] !== 'operand_set'
            || member[6][2] !== (variant !== 'M')) fail('member');
        const aliases = variant === 'M' ? [] : [member[6][1]];
        const view = 'view_' + digest({ role, aliases });
        if (canonicalValue(returned) !== canonicalValue(['I', 'select_return', operandAlias, role,
            [], 'operand_set', ['selected', view, ...aliases]])) fail('return');
        for (const index of [0, 3]) {
            const tuple = tuples[index];
            if (tuple[1] !== 'get' || tuple[3] !== (index === 0 && variant !== 'M' ? role : 'proof/snapshot')
                || canonicalValue(tuple[4]) !== '["date"]' || tuple[5] !== 'data'
                || tuple[6][0] !== 'scalar' || typeof tuple[6][1] !== 'string'
                || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(tuple[6][1])
                || variant !== 'M' && tuple[2] !== member[6][1]) fail('date_operand');
        }
        if (tuples[0][2] !== tuples[3][2] || tuples[0][6][1] !== tuples[3][6][1]) fail('date_occurrences');
    }
    // This decoder deliberately does not claim that a self-rehashed packet
    // came from the sealed authorship. A measured host must require the exact
    // precommitted packet bytes, complete compiler/program ticket and roots.
    return freezeDeep(data);
}
module.exports = { PACKET_PATH, decodeSelectedEventDayPacket };
