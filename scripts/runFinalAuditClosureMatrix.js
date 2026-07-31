const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HASH_PATTERN = /^[a-f0-9]{40}$/;
const REQUIRED_GATE_IDS = Object.freeze([
    'AUTH-01',
    'C-01_FLOW-01_STATE-02',
    'C-02_WGL-01',
    'C-03_WGL-02',
    'DATA-01',
    'DATA-02',
    'WGL-03_WGL-04_AUTH-02',
    'AUTH-03_WGL-07',
    'FLOW-03',
    'STATE-01',
    'PRIV-01',
    'AUTH-04',
    'STATE-04',
    'COV-01',
    'OPS-01',
    'FLOW-02',
    'FLOW-04',
    'STATE-03',
    '9P.0',
    '9P.1',
    '9P.2',
    '9P.3',
    'OPS-02',
    '9P.4',
    'FAMILY-ASSIGNMENT',
    'PAYMENT-MENU',
    'CATEGORY-CREATION',
    'WRITE-ACTIVATION',
    'OPS-03'
]);
const LEGACY_HASH_BINDING_EXCEPTIONS = Object.freeze({
    'AUTH-01': Object.freeze({
        candidate_hash: '7f61aaa0c3f7298cdd85c096b7d2164d7b97df91',
        closure_doc: 'docs/audit/final-report.md'
    }),
    'C-02_WGL-01': Object.freeze({
        candidate_hash: 'c03f7d4db74e9cda9308fe86451748303dfd07cd',
        closure_doc:
            'docs/audit/correction-packets/2026-07-18-c02-oauth-lifecycle-precedence.md'
    })
});

function runGit(repoRoot, args) {
    const result = spawnSync(process.env.EXHAUSTIVE_LOCAL_GIT_PATH || 'git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        windowsHide: true
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(
            `final_audit_git_failed:${args.join('_')}:${result.status}`
        );
    }
    return String(result.stdout || '').trim();
}

function normalizeVerdict(text) {
    return String(text || '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toUpperCase();
}

function hasPositiveGoSignal(text) {
    const normalized = normalizeVerdict(text);
    const withoutNegativeSignals = normalized.replace(
        /\bNO\s*[-–—]?\s*GO\s+(?:TECNICO LOCAL|LOCAL FORMAL|LOCAL INTEGRAL)\b/g,
        ''
    );
    return /\bGO\s+(?:TECNICO LOCAL|LOCAL FORMAL|LOCAL INTEGRAL)\b/
        .test(withoutNegativeSignals);
}

function assertRelativeAuditPath(relativePath) {
    const normalized = String(relativePath || '').replaceAll('\\', '/');
    if (!normalized.startsWith('docs/audit/') ||
        normalized.startsWith('/') ||
        normalized.split('/').includes('..')) {
        throw new Error(`final_audit_closure_path_invalid:${relativePath}`);
    }
    return normalized;
}

function validateClosureManifest({
    repoRoot,
    manifest,
    git = runGit
}) {
    if (manifest?.schema_version !== 1 ||
        !HASH_PATTERN.test(String(manifest?.audit_base || '')) ||
        !HASH_PATTERN.test(String(manifest?.required_head_base || '')) ||
        !Array.isArray(manifest?.closures)) {
        throw new Error('final_audit_manifest_invalid');
    }
    const actualIds = manifest.closures.map(closure => closure?.id);
    if (new Set(actualIds).size !== actualIds.length ||
        actualIds.length !== REQUIRED_GATE_IDS.length ||
        REQUIRED_GATE_IDS.some(id => !actualIds.includes(id))) {
        throw new Error('final_audit_required_gate_set_mismatch');
    }
    const head = git(repoRoot, ['rev-parse', 'HEAD']);
    const baseAncestor = git(
        repoRoot,
        ['merge-base', '--is-ancestor', manifest.required_head_base, head]
    );
    void baseAncestor;
    const rows = manifest.closures.map(closure => {
        const candidateHash = String(closure?.candidate_hash || '');
        if (!HASH_PATTERN.test(candidateHash)) {
            throw new Error(`final_audit_hash_invalid:${closure?.id}`);
        }
        const relativeDoc = assertRelativeAuditPath(closure?.closure_doc);
        if (typeof closure?.hash_documented !== 'boolean') {
            throw new Error(
                `final_audit_hash_documented_invalid:${closure?.id}`
            );
        }
        const legacyException =
            LEGACY_HASH_BINDING_EXCEPTIONS[closure.id] || null;
        if (closure.hash_documented === Boolean(legacyException)) {
            throw new Error(
                `final_audit_legacy_hash_binding_set_mismatch:${closure.id}`
            );
        }
        if (legacyException &&
            (candidateHash !== legacyException.candidate_hash ||
                relativeDoc !== legacyException.closure_doc)) {
            throw new Error(
                `final_audit_legacy_hash_binding_identity_mismatch:${closure.id}`
            );
        }
        const absoluteDoc = path.resolve(repoRoot, ...relativeDoc.split('/'));
        if (!absoluteDoc.startsWith(`${path.resolve(repoRoot)}${path.sep}`) ||
            !fs.existsSync(absoluteDoc)) {
            throw new Error(`final_audit_closure_missing:${closure.id}`);
        }
        const document = fs.readFileSync(absoluteDoc, 'utf8');
        if (!hasPositiveGoSignal(document)) {
            throw new Error(`final_audit_go_signal_missing:${closure.id}`);
        }
        if (closure.hash_documented === true &&
            !document.includes(candidateHash)) {
            throw new Error(`final_audit_hash_not_documented:${closure.id}`);
        }
        git(repoRoot, ['cat-file', '-e', `${candidateHash}^{commit}`]);
        git(repoRoot, ['merge-base', '--is-ancestor', candidateHash, head]);
        return Object.freeze({
            id: closure.id,
            candidate_hash: candidateHash,
            closure_doc: relativeDoc,
            hash_documented: closure.hash_documented === true,
            ancestor_of_head: true,
            go_signal: true
        });
    });
    return Object.freeze({
        schema_version: 1,
        head,
        audit_base: manifest.audit_base,
        required_head_base: manifest.required_head_base,
        closures: rows.length,
        documented_hashes: rows.filter(row => row.hash_documented).length,
        legacy_hash_bindings: rows.filter(row => !row.hash_documented)
            .map(row => row.id),
        all_ancestors: rows.every(row => row.ancestor_of_head),
        all_go_signals: rows.every(row => row.go_signal),
        rows
    });
}

function loadManifest(repoRoot, manifestPath) {
    const absolute = path.resolve(repoRoot, manifestPath);
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function main() {
    const repoRoot = path.resolve(__dirname, '..');
    const manifest = loadManifest(
        repoRoot,
        'docs/audit/final-consolidated-closure-manifest.json'
    );
    const report = validateClosureManifest({ repoRoot, manifest });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    LEGACY_HASH_BINDING_EXCEPTIONS,
    REQUIRED_GATE_IDS,
    hasPositiveGoSignal,
    loadManifest,
    normalizeVerdict,
    validateClosureManifest
};
