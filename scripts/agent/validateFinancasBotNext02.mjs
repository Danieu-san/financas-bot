import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { run } from 'node:test';
import { tap } from 'node:test/reporters';
import policy from './financasBotNext02ValidationPolicy.js';
import prior from './financasBotNext01ValidationPolicy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const slice = args.includes('--slice') ? args[args.indexOf('--slice') + 1] : 'N02-A';
const checkpoint = args.includes('--checkpoint') ? args[args.indexOf('--checkpoint') + 1] : null;
if (checkpoint !== null && (checkpoint !== 'CP-01' || slice !== 'N02-E')) {
    throw new Error('unsupported_checkpoint');
}
const contract = policy.sliceContract(slice);
const inheritedTestFiles = checkpoint === 'CP-01'
    ? ['next01SkeletonRed', 'conversationReplayRed', 'toolBudgetRed', 'validatorGate']
        .map(name => 'tests/next/' + name + '.cases.js') : [];
const base = checkpoint === 'CP-01' ? '5239c342b5705e64d3fb6412048382d665bcb6a4' :
    slice === 'N02-E' ? 'c0c762786d81db71cf82681915750efb2f23f9e7' :
    slice === 'N02-D' ? '3bb1f93aeacecab547cc1402c9e04c01f6ddb5a2' :
    slice === 'N02-C' ? '8d987dab960e0ad8f9b112326464b69caa5dfe58' :
    slice === 'N02-B' ? '4a6396000d15d98969b8291d6c162e5aafcd04b9' :
    '5d4339f46a9ec412d6c86894853435c7238dbcf1';
const allowed = checkpoint === 'CP-01' ? [
    'src/next/policy/toolBudget.js',
    'src/next/tools/readOnlyToolGateway.js',
    'scripts/agent/financasBotNext01ValidationPolicy.js',
    'scripts/agent/validateFinancasBotNext02.mjs',
    'tests/next/toolBudgetRed.cases.js',
    'tests/next/validatorGate.cases.js',
    'tests/next02ObservationKernel.test.js',
    'tests/next02BillingReadModel.test.js',
    'tests/next02Subcategories.test.js',
    'docs/plans/workstreams/financasbot-cp01-corrections-v1.md',
    'docs/agent-memory/workstreams/financasbot-cp01-corrections.md',
    'docs/agent-memory/workstreams/index.md'
] : slice === 'N02-E' ? [
    'tests/next02GoldenExpenses.test.js',
    'tests/fixtures/financasbot-next/next02-expense-observations-v1.json',
    'tests/fixtures/financasbot-next/next02-expense-expectations-v1.json',
    'tests/fixtures/financasbot-next/next02-golden-traceability-v1.json',
    'scripts/agent/financasBotNext02ValidationPolicy.js',
    'scripts/agent/validateFinancasBotNext02.mjs',
    'docs/agent-memory/workstreams/financasbot-next-02.md',
    'docs/plans/workstreams/financasbot-next-02.md',
    'docs/plans/workstreams/financasbot-next-02-validation-v1.md',
    'docs/plans/workstreams/financasbot-next-02-golden-reconciliation-v1.md'
] : [
    'src/next/kernel/canonicalValue.js', 'src/next/kernel/observationKernel.js',
    'src/next/kernel/expenseReadModel.js', 'tests/next02ObservationKernel.test.js',
    'tests/next/validatorGate.cases.js',
    'scripts/agent/financasBotNext01ValidationPolicy.js',
    'scripts/agent/financasBotNext02ValidationPolicy.js', 'scripts/agent/validateFinancasBotNext02.mjs',
    'docs/plans/workstreams/financasbot-next-02.md',
    'docs/plans/workstreams/financasbot-next-02-kernel-reuse-v1.md',
    'docs/plans/workstreams/financasbot-next-02-validation-v1.md',
    'docs/agent-memory/workstreams/financasbot-next-02.md',
    ...(slice !== 'N02-A' ? ['src/next/kernel/installmentSchedule.js',
        'tests/next02InstallmentSchedule.test.js'] : []),
    ...(['N02-C', 'N02-D'].includes(slice) ? ['tests/next02BillingReadModel.test.js',
        'docs/plans/workstreams/financasbot-next-02-n02c-billing-read-v1.md'] : []),
    ...(slice === 'N02-D' ? ['tests/next02Subcategories.test.js',
        'docs/plans/workstreams/financasbot-next-02-n02d-subcategories-v1.md'] : [])
];
const worktree = args.includes('--worktree');
const value = name => args[args.indexOf(name) + 1];
const git = (...params) => execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'),
    '-C', root, ...params], { encoding: 'utf8' }).trim();
const errors = [];
const head = git('rev-parse', 'HEAD');
const expectedHead = args.includes('--expected-head') ? value('--expected-head') : null;
const expectedParent = args.includes('--expected-parent') ? value('--expected-parent') : null;
if (!worktree) {
    if (!/^[a-f0-9]{40}$/.test(expectedHead || '') || expectedParent !== base) errors.push('immutable_binding_required');
    errors.push(...prior.validateGitBindingEvidence({
        expectedHead, expectedParent, actualHead: head,
        parentLine: git('rev-list', '--parents', '-n', '1', 'HEAD'),
        dirtyStatus: git('status', '--porcelain'),
        requiredFiles: [...allowed, ...inheritedTestFiles, ...contract.paths.map(p => 'src/next/' + p),
            ...new Set(contract.properties.map(p => 'tests/' + p.file))],
        trackedFiles: new Set(git('ls-tree', '-r', '--name-only', 'HEAD').split('\n')),
        ignoredPaths: git('ls-files', '--others', '--ignored', '--exclude-standard', '--', 'src/next', ...inheritedTestFiles,
            ...new Set(contract.properties.map(p => 'tests/' + p.file)))
            .split('\n').filter(Boolean)
    }));
}
const changed = new Set([
    ...git('diff', '--name-only', base).split('\n'),
    ...git('ls-files', '--others', '--exclude-standard').split('\n')
].filter(Boolean));
for (const file of changed) if (!allowed.includes(file)) errors.push('path_outside_slice:' + file);
for (const file of allowed) if (!fs.existsSync(path.join(root, file))) errors.push('required_file_missing:' + file);
const analysis = policy.inspectSources(path.join(root, 'src/next'), slice);
errors.push(...analysis.errors);
if (!errors.length) {
    const events = [];
    const stream = run({
        files: [...new Set(contract.properties.map(p => path.join(root, 'tests', p.file)))], concurrency: 1,
        setup(testStream) {
            for (const type of ['test:pass', 'test:fail']) {
                testStream.on(type, data => events.push({ type, data }));
            }
        }
    });
    let diagnostic = '';
    for await (const chunk of stream.compose(tap)) diagnostic += String(chunk);
    const proof = policy.validatePropertyEvents(events, slice);
    errors.push(...proof.errors);
    if (errors.length) process.stderr.write(diagnostic);
    else console.log('property_ids=' + proof.approvedIds.length + '/' + contract.properties.length);
}
if (errors.length) {
    console.error('NEXT-02 ' + slice + ': FAIL\n' + errors.join('\n'));
    process.exitCode = 1;
} else if (checkpoint === 'CP-01') {
    const events = [];
    const stream = run({
        files: inheritedTestFiles.map(file => path.join(root, file)),
        concurrency: 1,
        setup(testStream) {
            for (const type of ['test:pass', 'test:fail']) {
                testStream.on(type, data => events.push({ type, name: data.name,
                    nesting: data.nesting, skip: data.skip || false, todo: data.todo || false,
                    testType: data.details?.type,
                    file: data.file ? path.relative(root, data.file).replaceAll('\\', '/') : null }));
            }
        }
    });
    let diagnostic = '';
    for await (const chunk of stream.compose(tap)) diagnostic += String(chunk);
    const evidence = prior.validateExecutedPropertyEvents(events);
    errors.push(...evidence.errors);
    if (errors.length) {
        console.error('CP-01: FAIL\n' + errors.join('\n'));
        process.stderr.write(diagnostic);
        process.exitCode = 1;
    } else {
        console.log('CP-01 ' + (worktree ? 'PRECOMMIT: PASS' : 'GATE: PASS'));
        console.log('inherited_property_ids=' + evidence.observedIds.length + '/25');
        console.log('reviewed_source_matches=' + analysis.reviewedSourceMatches + '/15');
        console.log('static_pattern_analysis=diagnostic; source_admission=reviewed_content_sha256');
        console.log('scope=CP-01_only; NEXT-02_full_gate=pending');
        if (!worktree) console.log('head_bound=' + head + '\nparent_bound=' + expectedParent);
    }
} else {
    console.log('NEXT-02 ' + slice + (worktree ? ' PRECOMMIT: PASS' : ' GATE: PASS'));
    console.log('source_tree_entries=' + contract.paths.length);
    console.log('runtime_v1_imports=' + analysis.runtimeV1Imports);
    console.log('unclassified_module_loaders=' + analysis.unclassifiedModuleLoaders);
    console.log('forbidden_effect_imports=' + analysis.forbiddenEffectImports);
    console.log('classified_hermetic_runtime_loaders=' + analysis.classifiedHermeticRuntimeLoaders);
    console.log('scope=' + slice + '_only; NEXT-02_full_gate=pending');
    if (!worktree) console.log('head_bound=' + head + '\nparent_bound=' + expectedParent);
}
