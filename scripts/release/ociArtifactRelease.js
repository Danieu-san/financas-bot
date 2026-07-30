const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const MANIFEST_NAME = '.release-manifest.json';
const PREPARED_NAME = '.release-prepared.json';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const PROTECTED_EXACT = new Set([
    '.env',
    'credentials.json',
    'token.json',
    'state_store.json',
    'state_store.tmp',
    'state_store.replay.json',
    'state_store.replay.tmp'
]);
const PROTECTED_PREFIXES = [
    '.wwebjs_auth/',
    '.wwebjs_cache/',
    'backups/',
    'data/',
    'logs/',
    'node_modules/',
    'private/'
];

function normalizeArtifactPath(value) {
    let normalized = String(value || '').replaceAll('\\', '/');
    while (normalized.startsWith('./')) normalized = normalized.slice(2);
    normalized = normalized.replace(/\/+/g, '/');
    return normalized.replace(/\/$/, '');
}

function isProtectedArtifactPath(relativePath) {
    const normalized = normalizeArtifactPath(relativePath).toLowerCase();
    return PROTECTED_EXACT.has(normalized) ||
        PROTECTED_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

function assertArtifactPathsSafe(paths) {
    for (const rawPath of paths || []) {
        const raw = String(rawPath || '');
        const normalized = normalizeArtifactPath(raw);
        const segments = normalized.split('/');
        const absolute = raw.startsWith('/') ||
            raw.startsWith('\\') ||
            /^[a-zA-Z]:[\\/]/.test(raw) ||
            normalized.startsWith('/') ||
            /^[a-zA-Z]:\//.test(normalized);
        if (!normalized ||
            absolute ||
            segments.includes('..') ||
            normalized.includes('\0') ||
            isProtectedArtifactPath(normalized) ||
            normalized === MANIFEST_NAME ||
            normalized === PREPARED_NAME) {
            throw new Error(`unsafe_oci_artifact_path:${normalized || raw}`);
        }
    }
    return true;
}

function sha256File(file) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(file));
    return hash.digest('hex');
}

function listFiles(root, {
    ignore = new Set([MANIFEST_NAME]),
    ignorePrefixes = []
} = {}) {
    const files = [];
    const visit = directory => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const absolute = path.join(directory, entry.name);
            const relative = normalizeArtifactPath(path.relative(root, absolute));
            if (ignore.has(relative)) continue;
            if (ignorePrefixes.some(prefix => relative.startsWith(prefix))) {
                continue;
            }
            if (entry.isSymbolicLink()) {
                throw new Error(`oci_release_symlink_forbidden:${relative}`);
            }
            if (entry.isDirectory()) {
                visit(absolute);
            } else if (entry.isFile()) {
                files.push(relative);
            } else {
                throw new Error(`oci_release_special_file_forbidden:${relative}`);
            }
        }
    };
    visit(root);
    return files.sort();
}

function createReleaseManifest({ root, commitSha }) {
    if (!COMMIT_PATTERN.test(String(commitSha || ''))) {
        throw new Error('oci_release_full_commit_required');
    }
    const files = listFiles(root);
    assertArtifactPathsSafe(files);
    if (!files.includes('index.js') || !files.includes('package.json')) {
        throw new Error('oci_release_required_entry_missing');
    }
    return Object.freeze({
        schema_version: 1,
        commit_sha: commitSha,
        entrypoint: 'index.js',
        protected_paths: Object.freeze([
            ...PROTECTED_EXACT,
            ...PROTECTED_PREFIXES.map(prefix => `${prefix}**`)
        ].sort()),
        files: Object.freeze(files.map(relativePath => {
            const absolute = path.join(root, ...relativePath.split('/'));
            return Object.freeze({
                path: relativePath,
                size: fs.statSync(absolute).size,
                sha256: sha256File(absolute)
            });
        }))
    });
}

function readAndVerifyReleaseManifest(root) {
    const manifestPath = path.join(root, MANIFEST_NAME);
    if (!fs.existsSync(manifestPath)) {
        throw new Error('oci_release_manifest_missing');
    }
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
        throw new Error('oci_release_manifest_invalid');
    }
    if (manifest?.schema_version !== 1 ||
        !COMMIT_PATTERN.test(String(manifest?.commit_sha || '')) ||
        manifest?.entrypoint !== 'index.js' ||
        !Array.isArray(manifest?.files)) {
        throw new Error('oci_release_manifest_invalid');
    }
    const declaredPaths = manifest.files.map(file => normalizeArtifactPath(file?.path));
    assertArtifactPathsSafe(declaredPaths);
    if (new Set(declaredPaths).size !== declaredPaths.length) {
        throw new Error('oci_release_manifest_duplicate_path');
    }
    const actualFiles = listFiles(root);
    const declared = new Map(manifest.files.map(file => [
        normalizeArtifactPath(file.path),
        file
    ]));
    for (const actual of actualFiles) {
        if (!declared.has(actual)) {
            throw new Error(`oci_release_unlisted_file:${actual}`);
        }
    }
    for (const [relativePath, expected] of declared) {
        const absolute = path.join(root, ...relativePath.split('/'));
        if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
            throw new Error(`oci_release_declared_file_missing:${relativePath}`);
        }
        if (!Number.isSafeInteger(expected.size) ||
            expected.size !== fs.statSync(absolute).size ||
            !SHA256_PATTERN.test(String(expected.sha256 || '')) ||
            expected.sha256 !== sha256File(absolute)) {
            throw new Error(`oci_release_file_hash_mismatch:${relativePath}`);
        }
    }
    return manifest;
}

function runChecked(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: options.cwd,
        encoding: 'utf8',
        env: options.env || process.env,
        windowsHide: true
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        const detail = String(result.stderr || result.stdout || '').trim();
        throw new Error(
            `oci_release_command_failed:${command}:${result.status}:${detail}`
        );
    }
    return String(result.stdout || '').trim();
}

async function defaultRunCommand(command, args, options = {}) {
    return {
        stdout: runChecked(command, args, options)
    };
}

function resolveCommit(repoRoot, commitRef) {
    const requested = String(commitRef || '');
    if (!COMMIT_PATTERN.test(requested)) {
        throw new Error('oci_release_literal_full_commit_required');
    }
    const commitSha = runChecked(
        'git',
        ['rev-parse', '--verify', `${requested}^{commit}`],
        { cwd: repoRoot }
    );
    if (!COMMIT_PATTERN.test(commitSha) || commitSha !== requested) {
        throw new Error('oci_release_full_commit_required');
    }
    return commitSha;
}

function readTarString(buffer, offset, length) {
    const end = buffer.indexOf(0, offset);
    const boundedEnd = end < 0 || end >= offset + length
        ? offset + length
        : end;
    return buffer.subarray(offset, boundedEnd).toString('utf8');
}

function readTarOctal(buffer, offset, length, field) {
    const bytes = buffer.subarray(offset, offset + length);
    if (bytes[0] & 0x80) {
        throw new Error(`oci_release_tar_base256_forbidden:${field}`);
    }
    const text = bytes.toString('ascii').replace(/\0.*$/, '').trim();
    if (!text) return 0;
    if (!/^[0-7]+$/.test(text)) {
        throw new Error(`oci_release_tar_number_invalid:${field}`);
    }
    const value = Number.parseInt(text, 8);
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`oci_release_tar_number_invalid:${field}`);
    }
    return value;
}

function assertTarHeaderChecksum(header) {
    const expected = readTarOctal(header, 148, 8, 'checksum');
    let actual = 0;
    for (let index = 0; index < header.length; index += 1) {
        actual += index >= 148 && index < 156 ? 32 : header[index];
    }
    if (actual !== expected) {
        throw new Error('oci_release_tar_header_checksum_invalid');
    }
}

function parsePaxRecords(content) {
    const records = {};
    let offset = 0;
    while (offset < content.length) {
        const space = content.indexOf(0x20, offset);
        if (space < 0) throw new Error('oci_release_pax_record_invalid');
        const lengthText = content.subarray(offset, space).toString('ascii');
        if (!/^[1-9][0-9]*$/.test(lengthText)) {
            throw new Error('oci_release_pax_record_invalid');
        }
        const length = Number(lengthText);
        const end = offset + length;
        if (!Number.isSafeInteger(length) ||
            end > content.length ||
            content[end - 1] !== 0x0a) {
            throw new Error('oci_release_pax_record_invalid');
        }
        const record = content.subarray(space + 1, end - 1).toString('utf8');
        const separator = record.indexOf('=');
        if (separator <= 0) throw new Error('oci_release_pax_record_invalid');
        records[record.slice(0, separator)] = record.slice(separator + 1);
        offset = end;
    }
    return records;
}

function readTarEntries(tarBuffer) {
    const entries = [];
    const seen = new Set();
    let offset = 0;
    let globalPax = {};
    let pendingPax = {};
    let pendingLongName = null;
    let pendingLongLink = null;
    while (offset + 512 <= tarBuffer.length) {
        const header = tarBuffer.subarray(offset, offset + 512);
        if (header.every(byte => byte === 0)) break;
        assertTarHeaderChecksum(header);
        const size = readTarOctal(header, 124, 12, 'size');
        const mode = readTarOctal(header, 100, 8, 'mode');
        const dataStart = offset + 512;
        const dataEnd = dataStart + size;
        if (dataEnd > tarBuffer.length) {
            throw new Error('oci_release_tar_truncated');
        }
        const type = String.fromCharCode(header[156] || 0);
        const name = readTarString(header, 0, 100);
        const prefix = readTarString(header, 345, 155);
        const headerPath = prefix ? `${prefix}/${name}` : name;
        const headerLink = readTarString(header, 157, 100);
        const content = tarBuffer.subarray(dataStart, dataEnd);
        if (type === 'x' || type === 'g') {
            const records = parsePaxRecords(content);
            if (type === 'g') globalPax = { ...globalPax, ...records };
            else pendingPax = records;
        } else if (type === 'L' || type === 'K') {
            const value = content.toString('utf8').replace(/\0.*$/, '')
                .replace(/\n$/, '');
            if (type === 'L') pendingLongName = value;
            else pendingLongLink = value;
        } else {
            const metadata = { ...globalPax, ...pendingPax };
            const rawPath = metadata.path || pendingLongName || headerPath;
            const linkPath = metadata.linkpath ||
                pendingLongLink ||
                headerLink;
            const relativePath = normalizeArtifactPath(rawPath);
            const rootEntry = type === '5' &&
                (relativePath === '.' || relativePath === '');
            if (!rootEntry) {
                if (relativePath !== MANIFEST_NAME) {
                    assertArtifactPathsSafe([relativePath]);
                }
                if (type !== '0' && type !== '\0' && type !== '5') {
                    throw new Error(
                        `oci_release_unsafe_tar_type:${type}:${relativePath}`
                    );
                }
                if (linkPath) {
                    throw new Error(
                        `oci_release_tar_link_forbidden:${relativePath}`
                    );
                }
                if (seen.has(relativePath)) {
                    throw new Error(
                        `oci_release_tar_duplicate_path:${relativePath}`
                    );
                }
                seen.add(relativePath);
                entries.push({
                    path: relativePath,
                    type: type === '5' ? 'directory' : 'file',
                    mode,
                    content
                });
            }
            pendingPax = {};
            pendingLongName = null;
            pendingLongLink = null;
        }
        offset = Math.ceil(dataEnd / 512) * 512;
    }
    return entries;
}

function readArchiveEntries(artifactPath, { gzip = true } = {}) {
    const bytes = fs.readFileSync(artifactPath);
    const tarBuffer = gzip ? zlib.gunzipSync(bytes) : bytes;
    return readTarEntries(tarBuffer);
}

function listArchiveEntries(artifactPath, options) {
    return readArchiveEntries(artifactPath, options)
        .map(entry => entry.path)
        .filter(entry => entry !== MANIFEST_NAME);
}

function verifyChecksumFile(artifactPath, checksumPath) {
    const line = fs.readFileSync(checksumPath, 'utf8').trim();
    const match = /^([a-f0-9]{64})  ([^\r\n]+)$/.exec(line);
    if (!match || match[2] !== path.basename(artifactPath)) {
        throw new Error('oci_release_checksum_file_invalid');
    }
    const actual = sha256File(artifactPath);
    if (actual !== match[1]) {
        throw new Error('oci_release_archive_checksum_mismatch');
    }
    return actual;
}

function extractArchive(artifactPath, destination, options) {
    const entries = readArchiveEntries(artifactPath, options);
    fs.mkdirSync(destination, { recursive: true });
    if (fs.readdirSync(destination).length !== 0) {
        throw new Error('oci_release_extract_destination_not_empty');
    }
    const root = path.resolve(destination);
    for (const entry of entries) {
        const target = path.resolve(root, ...entry.path.split('/'));
        if (!target.startsWith(`${root}${path.sep}`)) {
            throw new Error(`unsafe_oci_artifact_path:${entry.path}`);
        }
        if (entry.type === 'directory') {
            fs.mkdirSync(target, { recursive: true });
            continue;
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, entry.content, {
            flag: 'wx',
            mode: entry.mode & 0o111 ? 0o755 : 0o644
        });
    }
}

async function buildArtifact({
    repoRoot,
    commitRef,
    outputDir
}) {
    const absoluteRepo = path.resolve(repoRoot);
    const absoluteOutput = path.resolve(outputDir);
    const commitSha = resolveCommit(absoluteRepo, commitRef);
    const tracked = runChecked(
        'git',
        ['ls-tree', '-r', '--name-only', commitSha],
        { cwd: absoluteRepo }
    ).split(/\r?\n/).filter(Boolean);
    assertArtifactPathsSafe(tracked);

    fs.mkdirSync(absoluteOutput, { recursive: true });
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-build-'));
    try {
        const sourceTar = path.join(scratch, 'source.tar');
        const tree = path.join(scratch, 'tree');
        fs.mkdirSync(tree);
        runChecked(
            'git',
            ['archive', '--format=tar', `--output=${sourceTar}`, commitSha],
            { cwd: absoluteRepo }
        );
        extractArchive(sourceTar, tree, { gzip: false });
        const manifest = createReleaseManifest({
            root: tree,
            commitSha
        });
        fs.writeFileSync(
            path.join(tree, MANIFEST_NAME),
            `${JSON.stringify(manifest, null, 2)}\n`
        );

        const artifactName = `financas-bot-${commitSha}.tar.gz`;
        const artifactPath = path.join(absoluteOutput, artifactName);
        const checksumPath = `${artifactPath}.sha256`;
        runChecked('tar', ['-czf', artifactPath, '-C', tree, '.']);
        const artifactSha256 = sha256File(artifactPath);
        fs.writeFileSync(
            checksumPath,
            `${artifactSha256}  ${artifactName}\n`
        );

        const installerSource = path.join(
            tree,
            'scripts',
            'release',
            'ociArtifactRelease.js'
        );
        let installerPath = null;
        let installerChecksumPath = null;
        if (fs.existsSync(installerSource)) {
            installerPath = path.join(
                absoluteOutput,
                `oci-artifact-release-${commitSha}.js`
            );
            installerChecksumPath = `${installerPath}.sha256`;
            fs.copyFileSync(installerSource, installerPath);
            fs.writeFileSync(
                installerChecksumPath,
                `${sha256File(installerPath)}  ${path.basename(installerPath)}\n`
            );
        }

        listArchiveEntries(artifactPath);
        verifyChecksumFile(artifactPath, checksumPath);
        const verifyRoot = path.join(scratch, 'verify');
        extractArchive(artifactPath, verifyRoot);
        const verifiedManifest = readAndVerifyReleaseManifest(verifyRoot);
        return {
            commit_sha: commitSha,
            artifact_path: artifactPath,
            checksum_path: checksumPath,
            artifact_sha256: artifactSha256,
            installer_path: installerPath,
            installer_checksum_path: installerChecksumPath,
            verified_manifest: verifiedManifest
        };
    } finally {
        fs.rmSync(scratch, { recursive: true, force: true });
    }
}

async function prepareExtractedRelease({
    extractedRoot,
    targetRoot,
    runCommand = defaultRunCommand
}) {
    const manifest = readAndVerifyReleaseManifest(extractedRoot);
    const releasesRoot = path.join(targetRoot, 'releases');
    const finalDir = path.join(releasesRoot, manifest.commit_sha);
    if (fs.existsSync(finalDir)) {
        throw new Error('oci_release_slot_exists');
    }
    fs.mkdirSync(releasesRoot, { recursive: true });
    const incoming = path.join(
        releasesRoot,
        `.incoming-${manifest.commit_sha}-${crypto.randomUUID()}`
    );
    try {
        fs.cpSync(extractedRoot, incoming, {
            recursive: true,
            errorOnExist: true,
            force: false
        });
        readAndVerifyReleaseManifest(incoming);
        await runCommand('npm', ['ci', '--omit=dev'], {
            cwd: incoming,
            env: {
                ...process.env,
                PUPPETEER_SKIP_DOWNLOAD: 'true'
            }
        });
        await runCommand(process.execPath, ['--check', 'index.js'], {
            cwd: incoming
        });
        const runtimePreflight = path.join(
            incoming,
            'scripts',
            'release',
            'verifyOciReleaseRuntime.js'
        );
        if (fs.existsSync(runtimePreflight)) {
            await runCommand(
                process.execPath,
                ['scripts/release/verifyOciReleaseRuntime.js'],
                { cwd: incoming }
            );
        }
        fs.writeFileSync(
            path.join(incoming, PREPARED_NAME),
            `${JSON.stringify({
                schema_version: 1,
                commit_sha: manifest.commit_sha,
                prepared_at: new Date().toISOString(),
                entrypoint: path.join(incoming, 'index.js')
            }, null, 2)}\n`
        );
        fs.renameSync(incoming, finalDir);
        return {
            commit_sha: manifest.commit_sha,
            release_dir: finalDir,
            entrypoint: path.join(finalDir, 'index.js'),
            cwd: targetRoot,
            production_changed: false
        };
    } finally {
        fs.rmSync(incoming, { recursive: true, force: true });
    }
}

function readAndVerifyPreparedRelease(releaseDir, expectedCommitSha) {
    const manifestPath = path.join(releaseDir, MANIFEST_NAME);
    const preparedPath = path.join(releaseDir, PREPARED_NAME);
    if (!fs.existsSync(manifestPath) || !fs.existsSync(preparedPath)) {
        throw new Error('oci_release_slot_not_prepared');
    }
    let manifest;
    let prepared;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        prepared = JSON.parse(fs.readFileSync(preparedPath, 'utf8'));
    } catch {
        throw new Error('oci_release_slot_receipt_invalid');
    }
    if (manifest?.schema_version !== 1 ||
        manifest?.commit_sha !== expectedCommitSha ||
        manifest?.entrypoint !== 'index.js' ||
        !Array.isArray(manifest?.files) ||
        prepared?.commit_sha !== expectedCommitSha ||
        prepared?.schema_version !== 1) {
        throw new Error('oci_release_slot_commit_mismatch');
    }
    const declaredPaths = manifest.files.map(file =>
        normalizeArtifactPath(file?.path));
    assertArtifactPathsSafe(declaredPaths);
    if (new Set(declaredPaths).size !== declaredPaths.length) {
        throw new Error('oci_release_manifest_duplicate_path');
    }
    const actualSourceFiles = listFiles(releaseDir, {
        ignore: new Set([MANIFEST_NAME, PREPARED_NAME]),
        ignorePrefixes: ['node_modules/']
    });
    const declared = new Map(manifest.files.map(file => [file.path, file]));
    for (const actual of actualSourceFiles) {
        if (!declared.has(actual)) {
            throw new Error(`oci_release_unlisted_file:${actual}`);
        }
    }
    for (const [relativePath, expected] of declared) {
        const absolute = path.join(releaseDir, ...relativePath.split('/'));
        if (!fs.existsSync(absolute) ||
            expected.size !== fs.statSync(absolute).size ||
            expected.sha256 !== sha256File(absolute)) {
            throw new Error(`oci_release_file_hash_mismatch:${relativePath}`);
        }
    }
    const entrypoint = path.join(releaseDir, 'index.js');
    if (!fs.existsSync(entrypoint)) {
        throw new Error('oci_release_required_entry_missing');
    }
    return { manifest, prepared, entrypoint };
}

async function prepareArtifact({
    artifactPath,
    checksumPath,
    targetRoot,
    runCommand
}) {
    verifyChecksumFile(artifactPath, checksumPath);
    listArchiveEntries(artifactPath);
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-verify-'));
    try {
        extractArchive(artifactPath, scratch);
        return await prepareExtractedRelease({
            extractedRoot: scratch,
            targetRoot,
            runCommand
        });
    } finally {
        fs.rmSync(scratch, { recursive: true, force: true });
    }
}

function posixJoin(root, ...parts) {
    if (String(root).includes('/')) return path.posix.join(root, ...parts);
    return path.join(root, ...parts);
}

function createPromotionPlan({
    targetRoot,
    commitSha,
    previousScript,
    processName = 'financas-bot'
}) {
    if (!COMMIT_PATTERN.test(String(commitSha || ''))) {
        throw new Error('oci_release_full_commit_required');
    }
    const root = String(targetRoot || '').replace(/[\\/]+$/, '');
    const previous = String(previousScript || '');
    const normalizedRoot = root.replaceAll('\\', '/');
    const normalizedPrevious = previous.replaceAll('\\', '/');
    if (!root ||
        !normalizedPrevious.startsWith(`${normalizedRoot}/`) ||
        !normalizedPrevious.endsWith('/index.js')) {
        throw new Error('oci_release_previous_script_outside_target');
    }
    const nextScript = posixJoin(root, 'releases', commitSha, 'index.js');
    return Object.freeze({
        provider: 'oracle_oci',
        process_name: processName,
        cwd: root,
        app_commit_sha: commitSha,
        previous_script: previous,
        next_script: nextScript,
        preconditions: Object.freeze([
            'prepared_release_manifest_verified',
            'single_pm2_process_confirmed',
            'aws_pm2_stopped',
            'rollback_script_exists',
            'production_state_paths_unchanged'
        ]),
        rollback: Object.freeze({
            script: previous,
            cwd: root,
            reason: 'health_or_whatsapp_smoke_failed'
        })
    });
}

function parseCurrentPm2Process(output, {
    processName = 'financas-bot',
    targetRoot
} = {}) {
    let processes;
    try {
        processes = JSON.parse(
            typeof output === 'string' ? output : output?.stdout
        );
    } catch {
        throw new Error('oci_release_pm2_inventory_invalid');
    }
    const matches = (processes || []).filter(process =>
        process?.name === processName);
    if (matches.length !== 1) {
        throw new Error('oci_release_single_pm2_process_required');
    }
    const current = matches[0];
    const env = current.pm2_env || {};
    const script = String(env.pm_exec_path || '');
    const cwd = String(env.pm_cwd || '');
    const normalizedRoot = String(targetRoot || '').replaceAll('\\', '/')
        .replace(/\/+$/, '');
    if (env.status !== 'online' ||
        cwd.replaceAll('\\', '/') !== normalizedRoot ||
        !script.replaceAll('\\', '/').startsWith(`${normalizedRoot}/`) ||
        !script.replaceAll('\\', '/').endsWith('/index.js')) {
        throw new Error('oci_release_current_pm2_contract_invalid');
    }
    return {
        script,
        cwd,
        appCommitSha: String(
            env.env?.APP_COMMIT_SHA ||
            env.APP_COMMIT_SHA ||
            'legacy-unversioned'
        )
    };
}

async function defaultHealthCheck(url) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.ok === true && body?.sqlite === true;
}

async function waitForHealthy({
    healthCheck,
    healthUrl,
    attempts,
    delayMs
}) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            if (await healthCheck(healthUrl)) return true;
        } catch {
            // Retry until the bounded startup window ends.
        }
        if (attempt < attempts) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    return false;
}

async function promotePreparedRelease({
    targetRoot,
    commitSha,
    processName = 'financas-bot',
    healthUrl = 'http://127.0.0.1:8787/dashboard/health',
    runCommand = defaultRunCommand,
    healthCheck = defaultHealthCheck,
    healthAttempts = 12,
    healthDelayMs = 5000
}) {
    const releaseDir = path.join(targetRoot, 'releases', commitSha);
    const verified = readAndVerifyPreparedRelease(releaseDir, commitSha);
    const inventory = await runCommand('pm2', ['jlist'], { cwd: targetRoot });
    const previous = parseCurrentPm2Process(inventory, {
        processName,
        targetRoot
    });
    const plan = createPromotionPlan({
        targetRoot,
        commitSha,
        previousScript: previous.script,
        processName
    });
    let oldProcessDeleted = false;
    let candidateStartAttempted = false;
    try {
        await runCommand('pm2', ['delete', processName], { cwd: targetRoot });
        oldProcessDeleted = true;
        candidateStartAttempted = true;
        await runCommand(
            'pm2',
            [
                'start',
                verified.entrypoint,
                '--name',
                processName,
                '--cwd',
                targetRoot,
                '--update-env'
            ],
            {
                cwd: targetRoot,
                env: {
                    ...process.env,
                    APP_COMMIT_SHA: commitSha
                }
            }
        );
        if (!await waitForHealthy({
            healthCheck,
            healthUrl,
            attempts: healthAttempts,
            delayMs: healthDelayMs
        })) {
            throw new Error('oci_release_new_health_failed');
        }
        await runCommand('pm2', ['save'], { cwd: targetRoot });
        return {
            promoted: true,
            commit_sha: commitSha,
            previous_script: previous.script,
            current_script: verified.entrypoint,
            health_url: healthUrl,
            rollback_performed: false
        };
    } catch (error) {
        if (!oldProcessDeleted) throw error;
        if (candidateStartAttempted) {
            try {
                await runCommand(
                    'pm2',
                    ['delete', processName],
                    { cwd: targetRoot }
                );
            } catch (rollbackDeleteError) {
                throw new Error(
                    'oci_release_rollback_candidate_delete_failed:' +
                    `${rollbackDeleteError.message}:${error.message}`
                );
            }
        }
        await runCommand(
            'pm2',
            [
                'start',
                previous.script,
                '--name',
                processName,
                '--cwd',
                previous.cwd,
                '--update-env'
            ],
            {
                cwd: targetRoot,
                env: {
                    ...process.env,
                    APP_COMMIT_SHA: previous.appCommitSha
                }
            }
        );
        if (!await waitForHealthy({
            healthCheck,
            healthUrl,
            attempts: healthAttempts,
            delayMs: healthDelayMs
        })) {
            throw new Error(
                `oci_release_rollback_health_failed:${error.message}`
            );
        }
        await runCommand('pm2', ['save'], { cwd: targetRoot });
        throw new Error(`oci_release_promote_rolled_back:${error.message}`);
    }
}

function argumentValue(args, name, fallback = null) {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : fallback;
}

async function main(args = process.argv.slice(2)) {
    const command = args[0];
    if (command === 'build') {
        const result = await buildArtifact({
            repoRoot: argumentValue(args, '--repo', process.cwd()),
            commitRef: argumentValue(args, '--commit', args[1]),
            outputDir: argumentValue(
                args,
                '--output',
                args[2] || path.join(process.cwd(), 'release-artifacts')
            )
        });
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
    }
    if (command === 'verify') {
        const artifactPath = path.resolve(
            argumentValue(args, '--artifact', args[1])
        );
        const checksumPath = path.resolve(
            argumentValue(args, '--checksum', args[2])
        );
        verifyChecksumFile(artifactPath, checksumPath);
        listArchiveEntries(artifactPath);
        const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-verify-'));
        try {
            extractArchive(artifactPath, scratch);
            const manifest = readAndVerifyReleaseManifest(scratch);
            process.stdout.write(`${JSON.stringify({
                verified: true,
                commit_sha: manifest.commit_sha,
                files: manifest.files.length
            }, null, 2)}\n`);
        } finally {
            fs.rmSync(scratch, { recursive: true, force: true });
        }
        return;
    }
    if (command === 'prepare') {
        const result = await prepareArtifact({
            artifactPath: path.resolve(
                argumentValue(args, '--artifact', args[1])
            ),
            checksumPath: path.resolve(
                argumentValue(args, '--checksum', args[2])
            ),
            targetRoot: path.resolve(
                argumentValue(args, '--target', args[3])
            )
        });
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
    }
    if (command === 'plan') {
        const result = createPromotionPlan({
            targetRoot: argumentValue(args, '--target', args[1]),
            commitSha: argumentValue(args, '--commit', args[2]),
            previousScript: argumentValue(
                args,
                '--previous-script',
                args[3]
            ),
            processName: argumentValue(
                args,
                '--process',
                args[4] || 'financas-bot'
            )
        });
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
    }
    if (command === 'promote') {
        if (!args.includes('--confirm-process-restart')) {
            throw new Error('oci_release_process_restart_confirmation_required');
        }
        const result = await promotePreparedRelease({
            targetRoot: path.resolve(argumentValue(args, '--target')),
            commitSha: argumentValue(args, '--commit'),
            processName: argumentValue(args, '--process', 'financas-bot'),
            healthUrl: argumentValue(
                args,
                '--health-url',
                'http://127.0.0.1:8787/dashboard/health'
            )
        });
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
    }
    throw new Error('usage: build|verify|prepare|plan|promote');
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    });
}

module.exports = {
    MANIFEST_NAME,
    assertArtifactPathsSafe,
    buildArtifact,
    createPromotionPlan,
    createReleaseManifest,
    extractArchive,
    listArchiveEntries,
    parseCurrentPm2Process,
    prepareArtifact,
    prepareExtractedRelease,
    promotePreparedRelease,
    readAndVerifyReleaseManifest,
    readAndVerifyPreparedRelease,
    sha256File,
    verifyChecksumFile
};
