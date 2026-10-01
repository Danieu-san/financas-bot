'use strict';
// Offline transport, not a normative authority or an independent verdict.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const candidate = process.argv[2];
assert.equal(process.argv.length, 3);
assert.match(candidate, /^[0-9a-f]{40}$/);
const parent = '37c7e0ced88eb5f9899bddfb31e8f63e2ae82d80';
const base = '6baf88dc8b33326f8e05245e38f9682cc722c0be';
const evidence = 'docs/audit-evidence/n02g-parent-observation/';
const contract = 'docs/contracts/next/provenance-v2/';
const candidatePaths = [
    evidence + 'prepare-parent-observation.cjs', evidence + 'parent-observation-proposal.json',
    'docs/plans/workstreams/financasbot-n02g-parent-result-observation-decision-v2.md',
    'tests/next/provenance/parentObservationAuthoring.cases.js'
];
const basePaths = ['graphs-v2.json', 'claims-v2.json', 'claim-contract.schema.json',
    'material-field-registry-v1.json', 'graph-binding-contract-v1.md'].map(file => contract + file);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const env = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' };
for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[name];
const gitAt = (dir, args, input) => execFileSync('git', ['-c', `safe.directory=${dir}`,
    '-C', dir, ...args], { env, input, maxBuffer: 24 * 1024 * 1024 });
const git = (...args) => gitAt(root, args);
const commitBytes = git('cat-file', 'commit', candidate);
assert.deepEqual(commitBytes.toString().split('\n').filter(line => line.startsWith('parent ')), ['parent ' + parent]);
const temp = path.join(root, '.codex-temp');
if (!fs.existsSync(temp)) fs.mkdirSync(temp);
assert.ok(fs.lstatSync(temp).isDirectory() && !fs.lstatSync(temp).isSymbolicLink());
const packet = fs.mkdtempSync(path.join(temp, 'parent-observation-'));
gitAt(root, ['init', '--quiet', '--template=', packet]);
gitAt(packet, ['config', 'core.autocrlf', 'false']);
gitAt(packet, ['config', 'core.longpaths', 'true']);
const objects = new Map(); const files = [];
function copyObject(oid) {
    if (objects.has(oid)) return;
    assert.match(oid, /^[0-9a-f]{40}$/);
    const type = git('cat-file', '-t', oid).toString().trim();
    assert.ok(['commit', 'tree', 'blob'].includes(type));
    const bytes = git('cat-file', type, oid);
    assert.equal(gitAt(packet, ['hash-object', '-w', '-t', type, '--stdin'], bytes).toString().trim(), oid);
    objects.set(oid, { oid, type, bytes: bytes.length, sha256: digest(bytes) });
}
function addFile(commit, file, materialized) {
    assert.ok(!path.isAbsolute(file) && !file.split('/').includes('..'));
    copyObject(commit);
    const parts = file.split('/');
    for (let i = 0; i < parts.length; i++) copyObject(git('rev-parse', i
        ? `${commit}:${parts.slice(0, i).join('/')}` : `${commit}^{tree}`).toString().trim());
    const blob = git('rev-parse', `${commit}:${file}`).toString().trim();
    copyObject(blob);
    const bytes = git('cat-file', 'blob', blob);
    if (materialized) {
        const target = path.join(packet, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes, { flag: 'wx' });
    }
    files.push({ commit, path: file, blob, bytes: bytes.length, sha256: digest(bytes), materialized });
}
for (const file of basePaths) addFile(base, file, false);
for (const file of candidatePaths) addFile(candidate, file, true);
copyObject(parent);
fs.writeFileSync(path.join(packet, '.git/HEAD'), candidate + '\n');
const manifest = { schema: 'n02g_parent_observation_transport_v1', candidate, parent, base,
    status: 'transport_only_not_independent_verdict', files, objects: [...objects.values()] };
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
const expected = EXPECTED_IDENTITIES;
for (const key of ['candidate', 'parent', 'base']) assert.equal(m[key], expected[key]);
assert.deepEqual(m.files.map(f => [f.commit, f.path, f.materialized]), EXPECTED_FILES);
assert.deepEqual(git('cat-file', 'commit', m.candidate).toString().split('\n')
    .filter(line => line.startsWith('parent ')), ['parent ' + m.parent]);
for (const o of m.objects) {
    const bytes = git('cat-file', o.type, o.oid);
    const header = Buffer.from(o.type + ' ' + bytes.length + '\0');
    assert.equal(crypto.createHash('sha1').update(header).update(bytes).digest('hex'), o.oid);
    assert.equal(bytes.length, o.bytes); assert.equal(sha(bytes), o.sha256);
}
for (const f of m.files) {
    const bytes = git('show', f.commit + ':' + f.path);
    assert.equal(git('rev-parse', f.commit + ':' + f.path).toString().trim(), f.blob);
    assert.equal(bytes.length, f.bytes); assert.equal(sha(bytes), f.sha256);
    if (f.materialized) assert.deepEqual(fs.readFileSync(path.join(root, f.path)), bytes);
}
console.log('immutable_transport=PASS files=' + m.files.length + ' objects=' + m.objects.length);
`.replace('EXPECTED_IDENTITIES', JSON.stringify({ candidate, parent, base }))
    .replace('EXPECTED_FILES', JSON.stringify(files.map(f => [f.commit, f.path, f.materialized])));
fs.writeFileSync(path.join(packet, 'verify-packet.cjs'), verifier);
fs.writeFileSync(path.join(packet, 'README.md'), [
    '# Revisão normativa focal — observação parental', '',
    `Candidato: ${candidate}; parent único: ${parent}; corpus aprovado: ${base}.`,
    'Git parcial com commits, árvores e blobs originais. Não é clone completo.',
    'Só nove arquivos selecionados; sem sessão, credenciais, remoto ou árvore suja.',
    'Node >=22 e Git; sem npm ou acesso à rede. Execute na pasta extraída:', '',
    '```', 'node verify-packet.cjs',
    'node docs/audit-evidence/n02g-parent-observation/prepare-parent-observation.cjs --check',
    'node --test tests/next/provenance/parentObservationAuthoring.cases.js', '```', '',
    'Leia a decisão v2 e helper; consulte os cinco contratos pelo git show do base.',
    'A proposta não altera o corpus. Julgue a norma, não só PASS do helper.',
    'Confirme SHA/parent externamente e mantenha evidência executada separada da relatada.',
    'Sem GO global, implementação já aprovada, NEXT-03, deploy, produção ou dados reais.', ''
].join('\n'));
const replay = [
    ['verify-packet.cjs'], [evidence + 'prepare-parent-observation.cjs', '--check'],
    ['--test', 'tests/next/provenance/parentObservationAuthoring.cases.js']
].map(args => ({ args, result: execFileSync(process.execPath, args,
    { cwd: packet, env, encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim() }));
const zip = packet + '.zip';
assert.ok(!fs.existsSync(zip));
execFileSync('tar', ['-a', '-cf', zip, '-C', temp, path.basename(packet)], { env });
const entries = execFileSync('tar', ['-tf', zip], { encoding: 'utf8' }).split(/\r?\n/);
assert.ok(entries.some(entry => entry.endsWith('/.git/HEAD')));
assert.ok(entries.some(entry => entry.endsWith('/verify-packet.cjs')));
console.log(JSON.stringify({ status: 'locally_replayed_not_independent_verdict', candidate,
    parent, base, packet, zip, zip_bytes: fs.statSync(zip).size,
    zip_sha256: digest(fs.readFileSync(zip)), files: files.length, objects: objects.size, replay }, null, 2));
