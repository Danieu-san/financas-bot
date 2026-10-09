'use strict';

// Workflow scope check, not a security boundary or proof of semantic necessity.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const DEFAULT_CONTRACT = 'docs/agent-workflow/active-scope.json';
const INVARIANTS = ['accuracy', 'followups', 'privacy', 'math', 'confirmation', 'idempotency', 'recovery', 'ratified_contracts'];

function validPath(value) {
    return typeof value === 'string' && value.length > 0 && !/[\\:\x00-\x1f*?]/.test(value)
        && !value.startsWith('/') && value.split('/').every(p => p && p !== '.' && p !== '..'
            && !/[. ]$/.test(p) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p));
}

function readBytes(root, relative) {
    if (!validPath(relative)) throw new Error(`invalid_path:${relative}`);
    let current = root;
    for (const segment of relative.split('/')) {
        current = path.join(current, segment);
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) throw new Error(`symlink_not_allowed:${relative}`);
    }
    if (!fs.lstatSync(current).isFile()) throw new Error(`not_regular_file:${relative}`);
    return fs.readFileSync(current);
}

function validateContract(c) {
    const errors = [];
    if (!c || c.schema !== 'financasbot-stage-scope-v1') return ['invalid_contract_schema'];
    for (const key of ['stage_id', 'authorization', 'objective', 'branch']) {
        if (typeof c[key] !== 'string' || !c[key].trim()) errors.push(`missing:${key}`);
    }
    if (!/^[a-f0-9]{40}$/.test(c.base_head || '')) errors.push('invalid_base_head');
    if (!/^[a-f0-9]{64}$/.test(c.baseline_sha256 || '') || !validPath(c.baseline_path)) errors.push('invalid_baseline_binding');
    if (c.unresolved_policy !== 'blocked_not_automatic_requirement') errors.push('unresolved_policy_must_block');
    if (!c.original_first || !/^[a-f0-9]{40}$/.test(c.original_first.head || '')
        || !['keep', 'reuse', 'adapt', 'replace', 'defer'].includes(c.original_first.disposition)
        || !c.original_first.asset || !c.original_first.evidence) errors.push('original_first_required');
    for (const id of INVARIANTS) if (!Array.isArray(c.invariants) || !c.invariants.includes(id)) errors.push(`invariant_missing:${id}`);
    for (const key of ['exit_criteria', 'non_scope']) {
        if (!Array.isArray(c[key]) || !c[key].length || c[key].some(v => typeof v !== 'string' || !v.trim())) errors.push(`missing:${key}`);
    }
    const allowed = Array.isArray(c.allowed_paths) ? c.allowed_paths : [];
    if (!allowed.length || allowed.some(p => !validPath(p)) || new Set(allowed).size !== allowed.length) errors.push('invalid_allowed_paths');
    if (!Number.isSafeInteger(c.max_changed_paths) || c.max_changed_paths < 1 || c.max_changed_paths > allowed.length) errors.push('invalid_scope_budget');
    const covered = new Map(), ids = new Set();
    if (!Array.isArray(c.changes) || !c.changes.length) errors.push('causal_changes_required');
    else for (const change of c.changes) {
        for (const key of ['id', 'cause', 'control', 'reuse', 'evidence', 'exit', 'minimum_sufficient_delta', 'maintenance_cost']) {
            if (typeof change[key] !== 'string' || !change[key].trim()) errors.push(`change_missing:${key}`);
        }
        if (ids.has(change.id)) errors.push(`duplicate_cause:${change.id}`);
        ids.add(change.id);
        if (!Array.isArray(change.paths) || !change.paths.length) errors.push(`change_paths_missing:${change.id}`);
        else for (const p of change.paths) {
            if (!allowed.includes(p)) errors.push(`change_path_not_allowed:${p}`);
            if (covered.has(p)) errors.push(`duplicate_path_authority:${p}`);
            covered.set(p, change.id);
        }
    }
    for (const p of allowed) if (!covered.has(p)) errors.push(`path_without_cause:${p}`);
    return errors;
}

function rowMap(rows) {
    if (!Array.isArray(rows)) throw new Error('invalid_snapshot_rows');
    const map = new Map();
    for (const row of rows) {
        if (!row || !validPath(row.path) || !(row.sha256 === null || /^[a-f0-9]{64}$/.test(row.sha256 || ''))
            || map.has(row.path)) throw new Error('invalid_or_duplicate_snapshot_row');
        map.set(row.path, row.sha256);
    }
    return map;
}

function compareScope(contract, baseline, current) {
    const violations = validateContract(contract);
    if (violations.length) return { ok: false, violations, changed_paths: [] };
    let before, after;
    try { before = rowMap(baseline); after = rowMap(current); }
    catch (error) { return { ok: false, violations: [error.message], changed_paths: [] }; }
    const changed = [...new Set([...before.keys(), ...after.keys()])]
        .filter(p => before.has(p) !== after.has(p) || before.get(p) !== after.get(p)).sort();
    for (const p of changed) if (!contract.allowed_paths.includes(p)) violations.push(`out_of_scope:${p}`);
    for (const p of changed) if (contract.allowed_paths.includes(p) && (!after.has(p) || after.get(p) === null)) {
        violations.push(`deletion_not_authorized:${p}`);
    }
    if (changed.length > contract.max_changed_paths) violations.push('scope_budget_exceeded');
    return { ok: !violations.length, violations, changed_paths: changed };
}

function git(root, args) {
    return execFileSync(process.env.GIT_BIN || 'git', ['-c', `safe.directory=${root}`, ...args],
        { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, windowsHide: true });
}

function captureRepo(root) {
    root = fs.realpathSync(root);
    const head = git(root, ['rev-parse', 'HEAD']).trim();
    const branch = git(root, ['branch', '--show-current']).trim();
    const paths = [...new Set([
        ...git(root, ['diff', '--name-only', '--no-renames', '-z', 'HEAD', '--']).split('\0'),
        ...git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0')
    ].filter(p => p && !p.startsWith('.codex-temp/')))].sort();
    const rows = paths.map(p => {
        if (!validPath(p)) throw new Error(`invalid_git_path:${p}`);
        const absolute = path.join(root, p);
        return { path: p, sha256: fs.existsSync(absolute) ? sha256(readBytes(root, p)) : null };
    });
    return { head, branch, rows };
}

function checkRepository(root, contractPath = DEFAULT_CONTRACT) {
    try {
        root = fs.realpathSync(root);
        const contract = JSON.parse(readBytes(root, contractPath));
        const errors = validateContract(contract);
        if (errors.length) return { ok: false, violations: errors };
        const bytes = readBytes(root, contract.baseline_path);
        if (sha256(bytes) !== contract.baseline_sha256) return { ok: false, violations: ['baseline_hash_mismatch'] };
        const baseline = JSON.parse(bytes);
        const current = captureRepo(root);
        if (current.head !== contract.base_head || baseline.head !== current.head || current.branch !== contract.branch
            || baseline.branch !== current.branch || baseline.schema !== 'financasbot-scope-baseline-v1') {
            return { ok: false, violations: ['git_or_baseline_identity_mismatch'] };
        }
        const result = compareScope(contract, baseline.rows, current.rows);
        return { ...result, stage_id: contract.stage_id, baseline_entries: baseline.rows.length,
            semantic_necessity_proved: false, audited: false, global_go: false };
    } catch (error) { return { ok: false, violations: [`scope_check_failed:${error.message}`] }; }
}

if (require.main === module) {
    const result = checkRepository(path.resolve(__dirname, '../..'));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
}
module.exports = { DEFAULT_CONTRACT, compareScope, validateContract, captureRepo, checkRepository, sha256 };
