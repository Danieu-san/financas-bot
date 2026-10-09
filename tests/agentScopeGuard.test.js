'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const modulePath = '../scripts/agent/agentScopeGuard';
const guard = fs.existsSync(path.resolve(__dirname, modulePath + '.js')) ? require(modulePath) : {};
const sha = value => require('node:crypto').createHash('sha256').update(value).digest('hex');
const head = 'a'.repeat(40);

function contract() {
    return {
        schema: 'financasbot-stage-scope-v1', stage_id: 'SCOPE-TEST',
        base_head: head, branch: 'codex/test', authorization: 'human requested finite guard',
        objective: 'Reject undeclared expansion without lowering quality',
        original_first: { head, disposition: 'adapt', asset: 'existing workflow', evidence: 'static inspection' },
        invariants: ['accuracy', 'followups', 'privacy', 'math', 'confirmation', 'idempotency', 'recovery', 'ratified_contracts'],
        allowed_paths: ['scripts/guard.js', 'tests/guard.test.js'],
        changes: [{ id: 'CAUSE-01', paths: ['scripts/guard.js', 'tests/guard.test.js'],
            cause: 'scope previously expands silently', control: 'finite allowlist and prior WIP binding',
            reuse: 'existing workflow', evidence: 'negative scope test', exit: 'undeclared file rejected',
            minimum_sufficient_delta: 'one validator', maintenance_cost: 'one finite contract per stage' }],
        exit_criteria: ['negative causal tests', 'local workflow', 'independent audit before closure'],
        non_scope: ['runtime changes', 'general JS solver', 'production'],
        max_changed_paths: 2, unresolved_policy: 'blocked_not_automatic_requirement',
        baseline_path: 'baseline.json', baseline_sha256: 'b'.repeat(64)
    };
}

test('SCOPE-RED-01: undeclared added file is rejected, existing WIP is preserved', () => {
    assert.equal(typeof guard.compareScope, 'function', 'scope comparison must exist');
    const baseline = [{ path: 'old/wip.js', sha256: sha('old') }];
    const current = [...baseline, { path: 'scripts/guard.js', sha256: sha('new') },
        { path: 'src/new-financial-engine.js', sha256: sha('unrequested') }];
    const result = guard.compareScope(contract(), baseline, current);
    assert.equal(result.ok, false);
    assert.deepEqual(result.violations, ['out_of_scope:src/new-financial-engine.js']);
});

test('SCOPE-RED-02: changed or removed preexisting WIP outside scope is rejected', () => {
    assert.equal(typeof guard.compareScope, 'function');
    for (const current of [[], [{ path: 'old/wip.js', sha256: sha('changed') }]]) {
        assert.deepEqual(guard.compareScope(contract(), [{ path: 'old/wip.js', sha256: sha('old') }], current).violations,
            ['out_of_scope:old/wip.js']);
    }
});

test('SCOPE-03: finite declared delta passes without credit or semantic claims', () => {
    const c = contract(), baseline = [{ path: 'old/wip.js', sha256: sha('old') }];
    const current = [...baseline, { path: 'scripts/guard.js', sha256: sha('new') }];
    assert.equal(guard.compareScope(c, baseline, current).ok, true);
    assert.equal(guard.compareScope(c, baseline, [...current, { path: 'tests/guard.test.js', sha256: null }]).ok, false);
});

test('SCOPE-04: absent cause, original-first, quality or exit and unsafe paths block', () => {
    const variants = [
        c => { c.changes = []; }, c => { c.original_first = null; },
        c => { c.invariants = c.invariants.filter(x => x !== 'accuracy'); },
        c => { c.exit_criteria = []; }, c => { c.unresolved_policy = 'implement_every_gap'; },
        c => { c.allowed_paths.push('../src/escape.js'); }, c => { c.allowed_paths.push('C:/escape.js'); },
        c => { c.allowed_paths.push('scripts/*'); }, c => { c.allowed_paths.push('scripts/CON'); },
        c => { c.allowed_paths.push('scripts/alias.'); },
        c => { c.changes[0].paths.pop(); }, c => { c.max_changed_paths = 1000; },
        c => { c.changes.push({ ...c.changes[0] }); }
    ];
    for (const mutate of variants) {
        const c = contract(); mutate(c);
        assert.equal(guard.compareScope(c, [], []).ok, false);
    }
    assert.equal(guard.compareScope(contract(), [], [{ path: 'scripts/guard.js', sha256: 'bad' }]).ok, false);
    assert.equal(guard.compareScope(contract(), [], [
        { path: 'scripts/guard.js', sha256: sha('a') }, { path: 'scripts/guard.js', sha256: sha('b') }
    ]).ok, false);
});

function gitFixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-scope-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const g = args => execFileSync(process.env.GIT_BIN || 'git', ['-c', `safe.directory=${root}`, ...args],
        { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const write = (p, bytes) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), bytes); };
    g(['init', '-q', '-b', 'codex/test']);
    write('old/wip.js', 'committed\n');
    g(['add', '--', 'old/wip.js']);
    g(['-c', 'user.name=Scope Test', '-c', 'user.email=scope-test@example.invalid', 'commit', '-q', '-m', 'fixture']);
    write('old/wip.js', 'prior WIP\n');
    const snapshot = guard.captureRepo(root);
    const baseline = Buffer.from(JSON.stringify({ schema: 'financasbot-scope-baseline-v1', ...snapshot }) + '\n');
    write('baseline.json', baseline);
    const c = contract(); c.base_head = snapshot.head; c.baseline_sha256 = sha(baseline);
    // These control artifacts are themselves declared, never ignored by the collector.
    c.allowed_paths.push('baseline.json', 'contract.json'); c.max_changed_paths = 4;
    c.changes[0].paths.push('baseline.json', 'contract.json');
    write('contract.json', JSON.stringify(c));
    return { root, g, write, c, baseline, check: () => guard.checkRepository(root, 'contract.json') };
}

test('SCOPE-05: real Git detects untracked, WIP drift, deletion and rename outside scope', t => {
    const f = gitFixture(t);
    assert.equal(f.check().ok, true);
    f.write('src/unauthorized.js', 'outside');
    assert.ok(f.check().violations.includes('out_of_scope:src/unauthorized.js'));
    fs.unlinkSync(path.join(f.root, 'src/unauthorized.js'));
    f.write('old/wip.js', 'altered');
    assert.ok(f.check().violations.includes('out_of_scope:old/wip.js'));
    fs.unlinkSync(path.join(f.root, 'old/wip.js'));
    assert.ok(f.check().violations.includes('out_of_scope:old/wip.js'));
    f.write('old/wip.js', 'prior WIP\n');
    fs.renameSync(path.join(f.root, 'old/wip.js'), path.join(f.root, 'old/renamed.js'));
    assert.ok(f.check().violations.includes('out_of_scope:old/renamed.js'));
});

test('SCOPE-06: baseline bytes, branch and HEAD cannot change silently', t => {
    const f = gitFixture(t);
    f.write('baseline.json', Buffer.concat([f.baseline, Buffer.from(' ')]));
    assert.deepEqual(f.check().violations, ['baseline_hash_mismatch']);
    f.write('baseline.json', f.baseline);
    f.g(['switch', '-q', '-c', 'codex/other']);
    assert.deepEqual(f.check().violations, ['git_or_baseline_identity_mismatch']);
    f.g(['switch', '-q', 'codex/test']);
    f.g(['-c', 'user.name=Scope Test', '-c', 'user.email=scope-test@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'new head']);
    assert.deepEqual(f.check().violations, ['git_or_baseline_identity_mismatch']);
});

test('SCOPE-07: missing contract is fail-closed, budget never expands automatically', t => {
    const f = gitFixture(t);
    assert.equal(guard.checkRepository(f.root, 'missing.json').ok, false);
    f.c.max_changed_paths = 1; f.write('contract.json', JSON.stringify(f.c));
    assert.ok(f.check().violations.includes('scope_budget_exceeded'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'contract.json'))).max_changed_paths, 1);
});

test('SCOPE-08: local raw temp is excluded explicitly; inherited Git exclusions remain intact', t => {
    const f = gitFixture(t), keys = ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0'];
    const prior = keys.map(key => process.env[key]);
    t.after(() => keys.forEach((key, i) => {
        if (prior[i] === undefined) delete process.env[key]; else process.env[key] = prior[i];
    }));
    const exclude = path.join(f.root, '.git', 'info', 'scope-test.exclude');
    fs.writeFileSync(exclude, 'ignored-runtime/\n');
    process.env.GIT_CONFIG_COUNT = '1';
    process.env.GIT_CONFIG_KEY_0 = 'core.excludesFile';
    process.env.GIT_CONFIG_VALUE_0 = exclude;
    f.write('.codex-temp/coverage.json', 'local raw fixture');
    f.write('ignored-runtime/coverage.json', 'ignored fixture');
    assert.equal(guard.captureRepo(f.root).rows.some(row => row.path.startsWith('.codex-temp/') || row.path.startsWith('ignored-runtime/')), false);
    assert.equal(f.check().ok, true);
    assert.equal(process.env.GIT_CONFIG_KEY_0, 'core.excludesFile');
});
