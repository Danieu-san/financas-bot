'use strict';
// Mechanical immutable transport. No source edits, npm install, secrets or approval.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const candidate = process.argv[2];
assert.equal(process.argv.length, 3); assert.match(candidate, /^[a-f0-9]{40}$/);
const parent = '42a16c8516373d1c5fc49a3836f0eba54e61d4c5';
const corpusBase = '207ca56b87381d69a922224332fcdda3a629d822';
const proposalCommit = '629a6871ffbdaa581fb64bd59165589bae04c92a';
const evidence = 'docs/audit-evidence/n02g-causal-authoring-profile/';
const graphPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const proposalPath = evidence + 'account-installment-observation-proposal.json';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const env = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' };
for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[name];
const gitAt = (dir, args, input) => execFileSync('git', ['-c', `safe.directory=${dir}`, '-C', dir, ...args],
    { env, input, maxBuffer: 24 * 1024 * 1024, windowsHide: true });
const git = (...args) => gitAt(root, args);
assert.equal(git('rev-parse', `${candidate}^`).toString().trim(), parent);
const proposal = JSON.parse(git('cat-file', 'blob', `${proposalCommit}:${proposalPath}`));
assert.equal(proposal.records.length, 11);
const temp = path.join(root, '.codex-temp');
assert.ok(fs.existsSync(temp) && !fs.lstatSync(temp).isSymbolicLink());
const packet = fs.mkdtempSync(path.join(temp, `ai-code-${candidate.slice(0, 7)}-`));
gitAt(root, ['init', '--quiet', '--template=', packet]);
gitAt(packet, ['config', 'core.autocrlf', 'false']);
gitAt(packet, ['config', 'core.longpaths', 'true']);
const objects = new Map(); const files = new Map();
function copyObject(oid) {
    if (objects.has(oid)) return;
    assert.match(oid, /^[a-f0-9]{40}$/);
    const type = git('cat-file', '-t', oid).toString().trim();
    assert.ok(['commit', 'tree', 'blob'].includes(type));
    const bytes = git('cat-file', type, oid);
    assert.equal(gitAt(packet, ['hash-object', '-w', '-t', type, '--stdin'], bytes).toString().trim(), oid);
    objects.set(oid, { oid, type, bytes: bytes.length, sha256: digest(bytes) });
}
function addFile(commit, file, materialize) {
    const key = `${commit}:${file}`; if (files.has(key)) return;
    assert.ok(!path.isAbsolute(file) && !file.split('/').some(part => !part || part === '..'));
    copyObject(commit); const parts = file.split('/');
    for (let i = 0; i < parts.length; i++) copyObject(git('rev-parse', i ? `${commit}:${parts.slice(0, i).join('/')}` : `${commit}^{tree}`).toString().trim());
    const blob = git('rev-parse', `${commit}:${file}`).toString().trim(); copyObject(blob);
    const bytes = git('cat-file', 'blob', blob);
    if (materialize) {
        const target = path.join(packet, file); fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes, { flag: 'wx' });
    }
    files.set(key, { commit, path: file, blob, bytes: bytes.length, sha256: digest(bytes), materialized: materialize });
}
for (const file of Object.keys(proposal.documents)) { addFile(corpusBase, file, false); addFile(candidate, file, true); }
addFile(proposalCommit, proposalPath, false);
const sources = git('ls-tree', '-r', '--name-only', candidate, 'src/next').toString().trim().split(/\r?\n/);
assert.ok(sources.length > 20 && sources.every(file => /^src\/next\/[A-Za-z0-9_./-]+\.js$/.test(file)));
for (const file of sources) addFile(candidate, file, true);
for (const file of [
    'tests/next/provenance/metricInstallments.cases.js', 'tests/next/provenance/authoringIndex.cases.js',
    'tests/helpers/exhaustiveNetworkTripwire.js', 'tests/helpers/exhaustiveNodeOptions.js',
    'tests/exhaustiveLocalTestCoverageRunner.test.js', 'scripts/runExhaustiveLocalTestCoverage.js',
    'tests/exhaustiveLocalTestAggregates.json', 'scripts/agent/prepareN02gAccountInstallmentCodeAuditPacket.cjs',
    'docs/contracts/next/provenance-v2/graph-binding-contract-v1.md',
    'docs/contracts/next/provenance-v2/predicate-templates-v1.json',
    'docs/contracts/next/provenance-v2/claim-contract.schema.json',
    'docs/contracts/next/provenance-v2/evidence-snapshot.schema.json',
    'docs/plans/workstreams/financasbot-n02g-metric-observation-alignment-decision-v1.md',
    ...['account-installment-observation-proposal.json', 'account-installment-selection-witness.json',
        'prepare-account-installment-observation-proposal.cjs', 'prepare-account-installment-selection-witness.cjs',
        'prepare-account-installment-application.cjs', 'prepare-account-installment-validation.cjs',
        'run-account-installment-wide.cjs', 'account-installment-application-validation.json',
        'account-installment-independent-review.md', 'account-installment-code-review-request.md'].map(name => evidence + name)
]) addFile(candidate, file, true);
for (const file of ['src/next/provenance/metricInstallments.js', 'src/next/provenance/graphCompiler.js',
    'src/next/provenance/proofOperators.js', graphPath, 'src/utils/budgetCycle.js',
    'src/services/userSheetAnalyticsService.js', 'src/query/financialQueryEngine.js', 'tests/freeBudgetCardEligibility.test.js']) {
    addFile(parent, file, false);
    if (!files.has(`${candidate}:${file}`)) addFile(candidate, file, true);
}
fs.writeFileSync(path.join(packet, '.git/HEAD'), candidate + '\n');
const manifest = { schema: 'n02g_code_offline_transport_v1', status: 'transport_only_not_independent_verdict',
    candidate, parent, corpusBase, proposalCommit, files: [...files.values()], objects: [...objects.values()] };
fs.writeFileSync(path.join(packet, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const verifier = `'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');const root=__dirname;
const env={...process.env,GIT_NO_REPLACE_OBJECTS:'1'};
for(const n of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES'])delete env[n];
const git=(...a)=>execFileSync('git',['-c','safe.directory='+root,'-C',root,...a],{env,maxBuffer:24*1024*1024});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
assert.equal(m.candidate,${JSON.stringify(candidate)});assert.equal(m.parent,${JSON.stringify(parent)});
assert.equal(git('rev-parse',m.candidate+'^').toString().trim(),m.parent);
for(const o of m.objects){const b=git('cat-file',o.type,o.oid);assert.equal(crypto.createHash('sha1').update(Buffer.from(o.type+' '+b.length+'\\0')).update(b).digest('hex'),o.oid);assert.equal(sha(b),o.sha256);assert.equal(b.length,o.bytes);}
for(const f of m.files){assert.ok([m.candidate,m.parent,m.corpusBase,m.proposalCommit].includes(f.commit));const b=git('cat-file','blob',f.commit+':'+f.path);assert.equal(git('rev-parse',f.commit+':'+f.path).toString().trim(),f.blob);assert.equal(sha(b),f.sha256);if(f.materialized)assert.deepEqual(fs.readFileSync(path.join(root,f.path)),b);}
console.log('immutable_transport=PASS files='+m.files.length+' objects='+m.objects.length);
`;
fs.writeFileSync(path.join(packet, 'verify-packet.cjs'), verifier);
fs.writeFileSync(path.join(packet, 'README.md'), [
    '# Revisão focal de código N02-G', `Candidato: ${candidate}; pai: ${parent}.`,
    'Git PARCIAL com OIDs originais; não é clone completo, não requer fsck/log de ancestrais.',
    'Sem autenticação, remotes, node_modules, dados reais ou árvore local suja.',
    'Node 22.17.0 + Git para reproduções abaixo; informe qualquer runtime diferente.',
    'node verify-packet.cjs', `node ${evidence}prepare-account-installment-application.cjs --check`,
    `node ${evidence}prepare-account-installment-validation.cjs --check`,
    'node --test tests/next/provenance/metricInstallments.cases.js',
    `Leia ${evidence}account-installment-code-review-request.md para limites e perguntas.`,
    'Os checks validam bytes/corpus/registros; não reexecutam a ampla. Só o comando kernel executa seus testes.',
    'Ampla integral permanece RED: 2413 PASS/3 FAIL/10 SKIP, três defeitos LEGADOS reproduzidos na base limpa.',
    'A suíte completa exige dependências não incluídas; não infira sua execução.',
    'Nenhum GO global, aceitação de grafo/host, deploy ou produção.'
].join('\n') + '\n');
const replay = ['verify-packet.cjs', evidence + 'prepare-account-installment-application.cjs',
    evidence + 'prepare-account-installment-validation.cjs'].map(file => ({ file,
    result: execFileSync(process.execPath, [path.join(packet, file), ...(file === 'verify-packet.cjs' ? [] : ['--check'])],
        { cwd: packet, env, encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim() }));
const zip = packet + '.zip';
execFileSync('tar', ['-a', '-cf', zip, '-C', temp, path.basename(packet)], { env, maxBuffer: 1024 * 1024 });
console.log(JSON.stringify({ status: 'locally_replayed_transport_not_independent_verdict', candidate, parent,
    packet, zip, zip_sha256: digest(fs.readFileSync(zip)), zip_bytes: fs.statSync(zip).size,
    files: files.size, objects: objects.size, replay }, null, 2));
