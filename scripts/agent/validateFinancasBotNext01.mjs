import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const validationPolicy = require('./financasBotNext01ValidationPolicy');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const base = '0b988e7d51544dbc02942b237b0d58d12b9af264';
const errors = [];

const requiredFiles = [
    'docs/plans/workstreams/financasbot-next-01.md',
    'docs/plans/workstreams/financasbot-next-01-topology-reuse-v1.md',
    'docs/plans/workstreams/financasbot-next-01-final-validation-v1.md',
    'docs/agent-memory/workstreams/financasbot-next-01.md',
    'src/next/contracts/financialQueryPlan.js',
    'src/next/contracts/modelDataBoundary.js',
    'src/next/contracts/reuseManifest.js',
    'src/next/conversation/conversationGateway.js',
    'src/next/ledger/emptyLedgerStore.js',
    'src/next/observability/sanitizedTraceRecorder.js',
    'src/next/policy/toolBudget.js',
    'src/next/policy/typedEvidenceVerifier.js',
    'src/next/replay/hermeticReplayRunner.js',
    'src/next/session/memorySessionStore.js',
    'src/next/tools/readOnlyToolGateway.js',
    'tests/next/conversationReplayRed.cases.js',
    'tests/next/next01SkeletonRed.cases.js',
    'tests/next/toolBudgetRed.cases.js',
    'tests/next/validatorGate.cases.js',
    'tests/financasBotNext01.test.js',
    'tests/exhaustiveLocalTestAggregates.json',
    'tests/chatCodexWatcherIgnored.test.js',
    'tests/helpers/exhaustiveNetworkTripwire.js',
    'tests/openFinanceNumericSaveFlow.test.js',
    'tests/openFinanceSaveProposalFinalization.test.js',
    'scripts/agent/validateFinancasBotNext01.mjs',
    'scripts/agent/financasBotNext01ValidationPolicy.js'
];

for (const relativePath of requiredFiles) {
    if (!fs.existsSync(path.join(root, relativePath))) errors.push(`required_file_missing:${relativePath}`);
}

function listFiles(relativeDirectory) {
    const start = path.join(root, relativeDirectory);
    const pending = [start];
    const files = [];
    while (pending.length > 0) {
        const current = pending.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const absolute = path.join(current, entry.name);
            if (entry.isDirectory()) pending.push(absolute);
            else if (entry.isFile()) files.push(absolute);
        }
    }
    return files;
}

const sourceFiles = listFiles('src/next').filter(file => /\.js$/.test(file));
const testFiles = listFiles('tests/next').filter(file => /\.cases\.js$/.test(file));

const sourceAnalysis = validationPolicy.analyzeNextSourceFiles({
    nextRoot: path.join(root, 'src/next'),
    sourceFiles
});
errors.push(...sourceAnalysis.errors);

const testSources = testFiles.map(file => {
    const value = fs.readFileSync(file, 'utf8');
    if (/\b(?:test|describe|it)\.skip\b/.test(value)) errors.push(`skipped_test:${path.relative(root, file)}`);
    return value;
});
const propertyEvidence = validationPolicy.validatePropertyIds(testSources);
errors.push(...propertyEvidence.errors);

function git(args) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function option(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : null;
}

const allowWorktree = process.argv.includes('--allow-worktree');
const expectedHead = option('--expected-head');
const expectedParent = option('--expected-parent');
if (!allowWorktree && (!/^[0-9a-f]{40}$/.test(expectedHead || '') || !/^[0-9a-f]{40}$/.test(expectedParent || ''))) {
    errors.push('expected_git_binding_required');
}

const changedPaths = new Set();
for (const args of [
    ['diff', '--name-only', `${base}..HEAD`],
    ['diff', '--name-only'],
    ['diff', '--cached', '--name-only'],
    ['ls-files', '--others', '--exclude-standard']
]) {
    const output = git(args);
    for (const file of output.split(/\r?\n/).filter(Boolean)) changedPaths.add(file.replaceAll('\\', '/'));
}

const allowedPath = value => (
    value === 'docs/plans/workstreams/financasbot-next-01.md' ||
    value === 'docs/plans/workstreams/financasbot-next-01-topology-reuse-v1.md' ||
    value === 'docs/plans/workstreams/financasbot-next-01-final-validation-v1.md' ||
    value === 'docs/agent-memory/workstreams/financasbot-next-01.md' ||
    value === 'scripts/agent/validateFinancasBotNext01.mjs' ||
    value === 'scripts/agent/financasBotNext01ValidationPolicy.js' ||
    value === 'tests/financasBotNext01.test.js' ||
    value === 'tests/exhaustiveLocalTestAggregates.json' ||
    value === 'tests/chatCodexWatcherIgnored.test.js' ||
    value === 'tests/helpers/exhaustiveNetworkTripwire.js' ||
    value === 'tests/openFinanceNumericSaveFlow.test.js' ||
    value === 'tests/openFinanceSaveProposalFinalization.test.js' ||
    value.startsWith('src/next/') ||
    value.startsWith('tests/next/')
);
for (const file of changedPaths) {
    if (!allowedPath(file)) errors.push(`changed_path_outside_gate:${file}`);
}

const trackedFiles = new Set(git(['ls-files']).split(/\r?\n/).filter(Boolean).map(value => value.replaceAll('\\', '/')));
const ignoredOutput = git([
    'ls-files', '--others', '--ignored', '--exclude-standard', '--',
    'src/next', 'tests/next', 'tests/financasBotNext01.test.js',
    'scripts/agent/validateFinancasBotNext01.mjs',
    'scripts/agent/financasBotNext01ValidationPolicy.js',
    'docs/plans/workstreams/financasbot-next-01.md',
    'docs/plans/workstreams/financasbot-next-01-topology-reuse-v1.md',
    'docs/plans/workstreams/financasbot-next-01-final-validation-v1.md',
    'docs/agent-memory/workstreams/financasbot-next-01.md'
]);
const ignoredPaths = ignoredOutput.split(/\r?\n/).filter(Boolean).map(value => value.replaceAll('\\', '/'));
errors.push(...validationPolicy.validateGitBindingEvidence({
    expectedHead: allowWorktree ? null : expectedHead,
    expectedParent: allowWorktree ? null : expectedParent,
    actualHead: git(['rev-parse', 'HEAD']),
    parentLine: git(['rev-list', '--parents', '-n', '1', 'HEAD']),
    dirtyStatus: allowWorktree ? '' : git(['status', '--porcelain']),
    requiredFiles,
    trackedFiles,
    ignoredPaths
}));

const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bAIza[0-9A-Za-z_-]{20,}\b/,
    /\bgh[opsu]_[0-9A-Za-z]{20,}\b/,
    /\bsk-[0-9A-Za-z_-]{20,}\b/,
    /\beyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}\b/
];
for (const relativePath of changedPaths) {
    const absolute = path.join(root, relativePath);
    if (!fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) continue;
    const value = fs.readFileSync(absolute, 'utf8');
    if (secretPatterns.some(pattern => pattern.test(value))) errors.push(`possible_secret:${relativePath}`);
}

if (errors.length > 0) {
    console.error(allowWorktree ? 'NEXT-01 PRECOMMIT: FAIL' : 'NEXT-01 GATE: FAIL');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
}

const focal = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: root,
    encoding: 'utf8'
});
if (focal.status !== 0) {
    console.error(allowWorktree ? 'NEXT-01 PRECOMMIT: FAIL' : 'NEXT-01 GATE: FAIL');
    console.error('focal_tests_failed');
    process.stderr.write(focal.stderr || '');
    process.exit(1);
}

const passCount = (focal.stdout.match(/^# pass (\d+)$/m) || [])[1];
const failCount = (focal.stdout.match(/^# fail (\d+)$/m) || [])[1];
if (passCount !== String(validationPolicy.REQUIRED_PROPERTY_IDS.length) || failCount !== '0') {
    console.error(allowWorktree ? 'NEXT-01 PRECOMMIT: FAIL' : 'NEXT-01 GATE: FAIL');
    console.error(`unexpected_focal_result:pass=${passCount}:fail=${failCount}`);
    process.exit(1);
}

console.log(allowWorktree ? 'NEXT-01 PRECOMMIT: PASS' : 'NEXT-01 GATE: PASS');
console.log(`required_files=${requiredFiles.length}`);
console.log(`source_files=${sourceFiles.length}`);
console.log(`focal_tests=${passCount}/${validationPolicy.REQUIRED_PROPERTY_IDS.length}`);
console.log(`property_ids=${propertyEvidence.observedIds.length}/${validationPolicy.REQUIRED_PROPERTY_IDS.length}`);
console.log(`required_tracked=${requiredFiles.filter(file => trackedFiles.has(file)).length}/${requiredFiles.length}`);
console.log(`changed_paths=${changedPaths.size}`);
console.log(`runtime_v1_imports=${sourceAnalysis.runtimeV1Imports}`);
console.log(`dynamic_module_loads=${sourceAnalysis.dynamicModuleLoads}`);
console.log(`forbidden_effect_capabilities=${sourceAnalysis.forbiddenEffectImports}`);
if (!allowWorktree) {
    console.log(`head_bound=${expectedHead}`);
    console.log(`parent_bound=${expectedParent}`);
}
