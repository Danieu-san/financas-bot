import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { run } from 'node:test';
import { tap } from 'node:test/reporters';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const validationPolicy = require('./financasBotNext01ValidationPolicy');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
process.chdir(root);
const base = '0b988e7d51544dbc02942b237b0d58d12b9af264';
const errors = [];

const requiredFiles = [
    'package.json',
    'package-lock.json',
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

function listTreeEntries(relativeDirectory) {
    const start = path.join(root, relativeDirectory);
    const pending = [start];
    const entries = [];
    while (pending.length > 0) {
        const current = pending.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const absolute = path.join(current, entry.name);
            if (entry.isDirectory()) pending.push(absolute);
            else if (entry.isFile()) entries.push({ absolute, type: 'file' });
            else if (entry.isSymbolicLink()) entries.push({ absolute, type: 'symlink' });
        }
    }
    return entries;
}

const sourceTreeEntries = listTreeEntries('src/next').sort((left, right) =>
    left.absolute.localeCompare(right.absolute)
);
const sourceFiles = sourceTreeEntries
    .filter(entry => entry.type === 'file' && /\.(?:js|mjs|cjs)$/.test(entry.absolute))
    .map(entry => entry.absolute);
const testFiles = listTreeEntries('tests/next')
    .filter(entry => entry.type === 'file' && /\.cases\.js$/.test(entry.absolute))
    .map(entry => entry.absolute)
    .sort();

const sourceInventory = validationPolicy.validateSourceInventory({
    expectedPaths: validationPolicy.EXPECTED_NEXT_SOURCE_PATHS,
    discoveredEntries: sourceTreeEntries.map(entry => ({
        path: path.relative(path.join(root, 'src/next'), entry.absolute).replaceAll('\\', '/'),
        type: entry.type
    }))
});
errors.push(...sourceInventory.errors);

const sourceAnalysis = validationPolicy.analyzeNextSourceFiles({
    nextRoot: path.join(root, 'src/next'),
    sourceFiles,
    expectedSourcePaths: validationPolicy.EXPECTED_NEXT_SOURCE_PATHS
});
errors.push(...sourceAnalysis.errors);

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
    value === 'package.json' ||
    value === 'package-lock.json' ||
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

function normalizeTestEvent(type, data = {}) {
    if (type === 'test:summary') {
        return {
            type,
            counts: { ...(data.counts || {}) },
            file: data.file ? path.relative(root, data.file).replaceAll('\\', '/') : null
        };
    }
    if (type === 'test:stdout' || type === 'test:stderr') {
        return { type, message: String(data.message || ''), file: data.file || null };
    }
    return {
        type,
        name: String(data.name || ''),
        nesting: data.nesting,
        skip: data.skip || false,
        todo: data.todo || false,
        testType: data.details?.type,
        file: data.file ? path.relative(root, data.file).replaceAll('\\', '/') : null
    };
}

async function runFocalTests() {
    const events = [];
    const stream = run({
        files: testFiles,
        concurrency: 1,
        setup(testStream) {
            for (const type of ['test:pass', 'test:fail', 'test:stdout', 'test:stderr']) {
                testStream.on(type, data => events.push(normalizeTestEvent(type, data)));
            }
        }
    });
    let tapOutput = '';
    for await (const chunk of stream.compose(tap)) tapOutput += String(chunk);
    return { events, tapOutput };
}

let focal;
try {
    focal = await runFocalTests();
} catch (error) {
    console.error(allowWorktree ? 'NEXT-01 PRECOMMIT: FAIL' : 'NEXT-01 GATE: FAIL');
    console.error(`focal_runner_error:${error?.message || error}`);
    process.exit(1);
}
const propertyEvidence = validationPolicy.validateExecutedPropertyEvents(focal.events);
if (propertyEvidence.errors.length > 0) {
    console.error(allowWorktree ? 'NEXT-01 PRECOMMIT: FAIL' : 'NEXT-01 GATE: FAIL');
    for (const error of propertyEvidence.errors) console.error(`- ${error}`);
    process.stderr.write(focal.tapOutput);
    process.exit(1);
}
const passCount = propertyEvidence.counts.passed;

console.log(allowWorktree ? 'NEXT-01 PRECOMMIT: PASS' : 'NEXT-01 GATE: PASS');
console.log(`required_files=${requiredFiles.length}`);
console.log(`source_tree_entries=${sourceTreeEntries.length}`);
console.log(`source_files=${sourceFiles.length}`);
console.log(`focal_tests=${passCount}/${validationPolicy.REQUIRED_PROPERTY_IDS.length}`);
console.log(`focal_test_events=${propertyEvidence.counts.tests}`);
console.log(`focal_failures=${propertyEvidence.counts.failed}`);
console.log(`focal_skipped=${propertyEvidence.counts.skipped}`);
console.log(`focal_todo=${propertyEvidence.counts.todo}`);
console.log(`property_ids=${propertyEvidence.observedIds.length}/${validationPolicy.REQUIRED_PROPERTY_IDS.length}`);
console.log(`required_tracked=${requiredFiles.filter(file => trackedFiles.has(file)).length}/${requiredFiles.length}`);
console.log(`changed_paths=${changedPaths.size}`);
console.log(`runtime_v1_imports=${sourceAnalysis.runtimeV1Imports}`);
console.log(`classified_static_module_loads=${sourceAnalysis.classifiedStaticModuleLoads}`);
console.log(`classified_hermetic_runtime_loaders=${sourceAnalysis.classifiedHermeticRuntimeLoaders}`);
console.log(`hermetic_replay_ast_sha256=${sourceAnalysis.hermeticReplayAstSha256}`);
console.log(`unclassified_module_loaders=${sourceAnalysis.unclassifiedModuleLoaders}`);
console.log(`forbidden_effect_capabilities=${sourceAnalysis.forbiddenEffectImports}`);
if (!allowWorktree) {
    console.log(`head_bound=${expectedHead}`);
    console.log(`parent_bound=${expectedParent}`);
}
