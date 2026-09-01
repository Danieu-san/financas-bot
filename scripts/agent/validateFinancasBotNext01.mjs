import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
    'tests/financasBotNext01.test.js',
    'tests/exhaustiveLocalTestAggregates.json',
    'tests/chatCodexWatcherIgnored.test.js',
    'tests/helpers/exhaustiveNetworkTripwire.js',
    'tests/openFinanceNumericSaveFlow.test.js',
    'tests/openFinanceSaveProposalFinalization.test.js',
    'scripts/agent/validateFinancasBotNext01.mjs'
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

const forbiddenSourcePatterns = [
    /require\(['"][^'"]*(?:handlers|jobs|services[\\/]google|messageHandler|legacyUsageTelemetry)[^'"]*['"]\)/,
    /require\(['"](?:node:)?(?:http|https|net|tls|dns|dgram)['"]\)/,
    /\bfetch\s*\(/
];
for (const file of sourceFiles) {
    const value = fs.readFileSync(file, 'utf8');
    if (file.endsWith(`${path.sep}hermeticReplayRunner.js`)) continue;
    for (const pattern of forbiddenSourcePatterns) {
        if (pattern.test(value)) errors.push(`forbidden_next_dependency:${path.relative(root, file)}`);
    }
}

const ledgerSource = fs.readFileSync(path.join(root, 'src/next/ledger/emptyLedgerStore.js'), 'utf8');
if (/\b(?:write|commit|append|insert|update|delete)\s*[:(]/.test(ledgerSource)) {
    errors.push('empty_ledger_exposes_mutation');
}

const testCount = testFiles.reduce((total, file) => {
    const value = fs.readFileSync(file, 'utf8');
    if (/\b(?:test|describe|it)\.skip\b/.test(value)) errors.push(`skipped_test:${path.relative(root, file)}`);
    return total + (value.match(/^test\(/gm) || []).length;
}, 0);
if (testCount !== 18) errors.push(`unexpected_test_count:${testCount}`);

function git(args) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
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
    console.error('NEXT-01 GATE: FAIL');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
}

const focal = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: root,
    encoding: 'utf8'
});
if (focal.status !== 0) {
    console.error('NEXT-01 GATE: FAIL');
    console.error('focal_tests_failed');
    process.stderr.write(focal.stderr || '');
    process.exit(1);
}

const passCount = (focal.stdout.match(/^# pass (\d+)$/m) || [])[1];
const failCount = (focal.stdout.match(/^# fail (\d+)$/m) || [])[1];
if (passCount !== '18' || failCount !== '0') {
    console.error('NEXT-01 GATE: FAIL');
    console.error(`unexpected_focal_result:pass=${passCount}:fail=${failCount}`);
    process.exit(1);
}

console.log('NEXT-01 GATE: PASS');
console.log(`required_files=${requiredFiles.length}`);
console.log(`source_files=${sourceFiles.length}`);
console.log(`focal_tests=${passCount}/${testCount}`);
console.log(`changed_paths=${changedPaths.size}`);
console.log('runtime_v1_imports=0');
console.log('writer_capabilities=0');
