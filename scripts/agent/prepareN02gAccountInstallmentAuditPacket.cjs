'use strict';
// Transport for offline independent review. No normative change or approval.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const candidate = '041da0dfefe8602b85d0168582da722cf74f9a53';
const proposalCommit = '629a6871ffbdaa581fb64bd59165589bae04c92a';
const base = '207ca56b87381d69a922224332fcdda3a629d822';
const evidence = 'docs/audit-evidence/n02g-causal-authoring-profile/';
const proposalPath = evidence + 'account-installment-observation-proposal.json';
const graphPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const gitEnv = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' };
for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete gitEnv[name];
function gitAt(dir, args, input) {
    return execFileSync('git', ['-c', `safe.directory=${dir}`, '-C', dir, ...args],
        { input, env: gitEnv, maxBuffer: 24 * 1024 * 1024 });
}
const git = (...args) => gitAt(root, args);
const proposalBytes = git('show', `${proposalCommit}:${proposalPath}`);
const proposal = JSON.parse(proposalBytes);
assert.equal(proposal.base, base);
assert.equal(proposal.records.length, 11);
assert.equal(git('rev-parse', `${candidate}^`).toString().trim(), proposalCommit);
assert.equal(git('merge-base', '--is-ancestor', base, candidate).length, 0);
const temp = path.join(root, '.codex-temp');
assert.ok(fs.existsSync(temp) && !fs.lstatSync(temp).isSymbolicLink());
const packet = fs.mkdtempSync(path.join(temp, 'ai-041da0d-'));
gitAt(root, ['init', '--quiet', '--template=', packet]);
gitAt(packet, ['config', 'core.autocrlf', 'false']);
gitAt(packet, ['config', 'core.longpaths', 'true']);
const objects = new Map();
const files = [];
function copyObject(oid) {
    if (objects.has(oid)) return;
    assert.match(oid, /^[0-9a-f]{40}$/);
    const type = git('cat-file', '-t', oid).toString().trim();
    assert.ok(['commit', 'tree', 'blob'].includes(type));
    const bytes = git('cat-file', type, oid);
    const written = gitAt(packet, ['hash-object', '-w', '-t', type, '--stdin'], bytes)
        .toString().trim();
    assert.equal(written, oid);
    objects.set(oid, { oid, type, bytes: bytes.length, sha256: digest(bytes) });
}
function addFile(commit, file, materialize) {
    assert.ok(!file.includes('..') && !path.isAbsolute(file));
    copyObject(commit);
    const parts = file.split('/');
    for (let i = 0; i < parts.length; i++) {
        const selector = i ? `${commit}:${parts.slice(0, i).join('/')}` : `${commit}^{tree}`;
        copyObject(git('rev-parse', selector).toString().trim());
    }
    const oid = git('rev-parse', `${commit}:${file}`).toString().trim();
    copyObject(oid);
    const bytes = git('cat-file', 'blob', oid);
    if (materialize) {
        const target = path.join(packet, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes, { flag: 'wx' });
    }
    files.push({ commit, path: file, blob: oid, bytes: bytes.length,
        sha256: digest(bytes), materialized: materialize });
}
for (const file of Object.keys(proposal.documents)) {
    addFile(base, file, false);
    const source = git('show', `${base}:${file}`).toString().replaceAll('\r\n', '\n');
    assert.equal('sha256:' + digest(Buffer.from(source)), proposal.documents[file].sha256_lf);
}
for (const file of [
    evidence + 'prepare-account-installment-observation-proposal.cjs',
    evidence + 'prepare-account-installment-selection-witness.cjs',
    proposalPath,
    evidence + 'account-installment-selection-witness.json',
    evidence + 'account-installment-selection-summary.md',
    'docs/plans/workstreams/financasbot-n02g-metric-observation-alignment-decision-v1.md'
]) addFile(candidate, file, true);
addFile(proposalCommit, proposalPath, false);
addFile(base, 'docs/contracts/next/provenance-v2/graph-binding-contract-v1.md', false);
// No history, working changes, credentials, remotes, runtime or evaluator bytes.
// Original trees retain hash-authenticated path metadata. Unselected blobs and
// ancestor commits are deliberately absent; this is not a complete clone.
fs.writeFileSync(path.join(packet, '.git/HEAD'), candidate + '\n');
const manifest = { schema: 'n02g_offline_review_transport_v1',
    status: 'transport_only_not_independent_verdict', candidate, proposalCommit, base,
    original_graph_blob: files.find(f => f.commit === base && f.path === graphPath).blob,
    files, objects: [...objects.values()].sort((a, b) => a.oid.localeCompare(b.oid)) };
fs.writeFileSync(path.join(packet, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const verifier = String.raw`'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = __dirname;
const env = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' };
for (const name of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[name];
const git = (...args) => execFileSync('git', ['-c', 'safe.directory=' + root,
    '-C', root, ...args], { env, maxBuffer: 24 * 1024 * 1024 });
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
assert.equal(m.candidate, '041da0dfefe8602b85d0168582da722cf74f9a53');
assert.equal(m.proposalCommit, '629a6871ffbdaa581fb64bd59165589bae04c92a');
assert.equal(m.base, '207ca56b87381d69a922224332fcdda3a629d822');
for (const o of m.objects) {
    const bytes = git('cat-file', o.type, o.oid);
    const header = Buffer.from(o.type + ' ' + bytes.length + '\0');
    assert.equal(crypto.createHash('sha1').update(header).update(bytes).digest('hex'), o.oid);
    assert.equal(bytes.length, o.bytes); assert.equal(sha(bytes), o.sha256);
}
for (const f of m.files) {
    assert.ok([m.candidate, m.proposalCommit, m.base].includes(f.commit));
    const bytes = git('show', f.commit + ':' + f.path);
    assert.equal(git('rev-parse', f.commit + ':' + f.path).toString().trim(), f.blob);
    assert.equal(bytes.length, f.bytes); assert.equal(sha(bytes), f.sha256);
    if (f.materialized) assert.deepEqual(fs.readFileSync(path.join(root, f.path)), bytes);
}
const corpus = JSON.parse(git('show', m.base + ':docs/contracts/next/provenance-v2/graphs-v2.json'));
assert.equal(corpus.graphs.length, 76);
console.log('immutable_transport=PASS files=' + m.files.length + ' objects=' + m.objects.length + ' graphs=76');
`;
fs.writeFileSync(path.join(packet, 'verify-packet.cjs'), verifier);
fs.writeFileSync(path.join(packet, 'README.md'), [
    '# Pacote offline para revisão documental independente', '',
    `Candidato original: ${candidate}; parent: ${proposalCommit}; corpus-base: ${base}.`,
    'Git parcial: os commits, árvores de caminhos e blobs incluídos preservam os OIDs originais.',
    'Não é clone completo; fsck/log de ancestrais não estão no escopo. Nenhum objeto deriva da árvore suja.',
    'Requisitos: Node.js 24 e Git. Nenhuma instalação npm ou rede é necessária.', '',
    'Execute da pasta extraída:', '', '```', 'node verify-packet.cjs',
    'node docs/audit-evidence/n02g-causal-authoring-profile/prepare-account-installment-observation-proposal.cjs --check',
    'node docs/audit-evidence/n02g-causal-authoring-profile/prepare-account-installment-selection-witness.cjs --check',
    'git show 207ca56b87381d69a922224332fcdda3a629d822:docs/contracts/next/provenance-v2/graphs-v2.json',
    '```', '',
    'O manifest é inventário auxiliar; o verificador reconfirma objetos Git, caminhos e bytes.',
    'Leia os dois helpers e faça verificações próprias do corpus e da composição. PASS local não é parecer independente.',
    'Se Node/Git não estiverem disponíveis ao auditor, informe o limite; não infira execução.',
    'Nada aplica a proposta ao corpus ou aprova código local, grafo, host, N02-G global ou produção.', ''
].join('\n'));
const replay = [
    'verify-packet.cjs',
    evidence + 'prepare-account-installment-observation-proposal.cjs',
    evidence + 'prepare-account-installment-selection-witness.cjs'
].map(file => ({ file, result: execFileSync(process.execPath,
    [path.join(packet, file), ...(file === 'verify-packet.cjs' ? [] : ['--check'])],
    { cwd: packet, env: gitEnv, encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim() }));
const zip = packet + '.zip';
assert.ok(!fs.existsSync(zip));
execFileSync('tar', ['-a', '-cf', zip, '-C', temp, path.basename(packet)],
    { env: gitEnv, maxBuffer: 1024 * 1024 });
const entries = execFileSync('tar', ['-tf', zip], { encoding: 'utf8' }).split(/\r?\n/);
assert.ok(entries.some(p => p.endsWith('/.git/HEAD')));
assert.ok(entries.some(p => p.endsWith('/verify-packet.cjs')));
console.log(JSON.stringify({ status: 'locally_replayed_not_independent_verdict', packet, zip,
    zip_bytes: fs.statSync(zip).size, zip_sha256: digest(fs.readFileSync(zip)),
    candidate, base, original_graph_blob: manifest.original_graph_blob,
    files: files.length, objects: objects.size, replay }, null, 2));
