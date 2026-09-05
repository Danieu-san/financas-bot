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
const contract = policy.sliceContract(slice);
const base = slice === 'N02-B' ? '4a6396000d15d98969b8291d6c162e5aafcd04b9' :
    '5d4339f46a9ec412d6c86894853435c7238dbcf1';
const allowed = [
    'src/next/kernel/canonicalValue.js', 'src/next/kernel/observationKernel.js',
    'src/next/kernel/expenseReadModel.js', 'tests/next02ObservationKernel.test.js',
    'tests/next/validatorGate.cases.js',
    'scripts/agent/financasBotNext01ValidationPolicy.js',
    'scripts/agent/financasBotNext02ValidationPolicy.js', 'scripts/agent/validateFinancasBotNext02.mjs',
    'docs/plans/workstreams/financasbot-next-02.md',
    'docs/plans/workstreams/financasbot-next-02-kernel-reuse-v1.md',
    'docs/plans/workstreams/financasbot-next-02-validation-v1.md',
    'docs/agent-memory/workstreams/financasbot-next-02.md',
    ...(slice === 'N02-B' ? ['src/next/kernel/installmentSchedule.js',
        'tests/next02InstallmentSchedule.test.js'] : [])
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
        requiredFiles: [...allowed, ...contract.paths.map(p => 'src/next/' + p)],
        trackedFiles: new Set(git('ls-tree', '-r', '--name-only', 'HEAD').split('\n')),
        ignoredPaths: git('ls-files', '--others', '--ignored', '--exclude-standard', '--', 'src/next',
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
