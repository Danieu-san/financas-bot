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
const STATE_SNAPSHOT_AAD = Buffer.from('financasbot-state:v1', 'utf8');
const STATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;
const DEFAULT_HEALTH_ATTEMPTS = 12;
const MAX_HEALTH_ATTEMPTS = 60;
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

function temporaryBase() {
    const configured = process.env.EXHAUSTIVE_AUDIT_TEMP_ROOT;
    if (!configured) return os.tmpdir();
    if (!path.isAbsolute(configured) ||
        !fs.existsSync(configured) ||
        !fs.statSync(configured).isDirectory()) {
        throw new Error('oci_release_audit_temp_root_invalid');
    }
    return fs.realpathSync(configured);
}

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

function parseEnvPayload(payload) {
    const lines = String(payload || '').split(/\r?\n/);
    const indexes = [];
    lines.forEach((line, index) => {
        if (/^STATE_STORE_ENCRYPTION_KEY=/.test(line)) indexes.push(index);
    });
    if (indexes.length > 1) {
        throw new Error('oci_release_state_store_key_duplicated');
    }
    const rawKey = indexes.length === 1
        ? lines[indexes[0]].slice('STATE_STORE_ENCRYPTION_KEY='.length).trim()
        : '';
    return { lines, indexes, rawKey };
}

function decodeStateEncryptionKey(raw) {
    const value = String(raw || '').trim();
    if (!value) return null;
    const candidates = [];
    if (/^[a-f0-9]{64}$/i.test(value)) {
        candidates.push(Buffer.from(value, 'hex'));
    }
    candidates.push(Buffer.from(value, 'base64'));
    const key = candidates.find(candidate => candidate.length === 32);
    if (!key) throw new Error('oci_release_state_store_key_invalid');
    return key;
}

function buildEncryptedEmptyStateSnapshot(key, {
    randomBytes = crypto.randomBytes
} = {}) {
    const iv = randomBytes(12);
    if (!Buffer.isBuffer(iv) || iv.length !== 12) {
        throw new Error('oci_release_state_store_iv_invalid');
    }
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(STATE_SNAPSHOT_AAD);
    const ciphertext = Buffer.concat([
        cipher.update('{}', 'utf8'),
        cipher.final()
    ]);
    return `${JSON.stringify({
        format: 'financasbot-state',
        version: 1,
        algorithm: 'aes-256-gcm',
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64')
    }, null, 2)}\n`;
}

function decodeCanonicalBase64(value, expectedLength = null) {
    if (typeof value !== 'string' ||
        !value ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
        throw new Error('oci_release_state_store_snapshot_invalid');
    }
    const decoded = Buffer.from(value, 'base64');
    if (decoded.toString('base64') !== value ||
        (expectedLength !== null && decoded.length !== expectedLength)) {
        throw new Error('oci_release_state_store_snapshot_invalid');
    }
    return decoded;
}

function parseStateSnapshotEnvelope(payload) {
    let envelope;
    try {
        envelope = JSON.parse(String(payload || ''));
    } catch {
        throw new Error('oci_release_state_store_snapshot_invalid');
    }
    const expectedKeys = [
        'algorithm',
        'ciphertext',
        'format',
        'iv',
        'tag',
        'version'
    ];
    if (!envelope || Array.isArray(envelope) ||
        JSON.stringify(Object.keys(envelope).sort()) !== JSON.stringify(expectedKeys) ||
        envelope.format !== 'financasbot-state' ||
        envelope.version !== 1 ||
        envelope.algorithm !== 'aes-256-gcm') {
        throw new Error('oci_release_state_store_snapshot_invalid');
    }
    return {
        iv: decodeCanonicalBase64(envelope.iv, 12),
        tag: decodeCanonicalBase64(envelope.tag, 16),
        ciphertext: decodeCanonicalBase64(envelope.ciphertext)
    };
}

function decryptStateSnapshot(payload, key) {
    const envelope = parseStateSnapshotEnvelope(payload);
    try {
        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            key,
            envelope.iv,
            { authTagLength: 16 }
        );
        decipher.setAAD(STATE_SNAPSHOT_AAD);
        decipher.setAuthTag(envelope.tag);
        return Buffer.concat([
            decipher.update(envelope.ciphertext),
            decipher.final()
        ]).toString('utf8');
    } catch {
        throw new Error('oci_release_state_store_snapshot_invalid');
    }
}

function assertStatePayloadCompatible(payload) {
    let clear;
    try {
        clear = JSON.parse(payload);
    } catch {
        throw new Error('oci_release_state_store_payload_invalid');
    }
    if (!clear || Array.isArray(clear) || typeof clear !== 'object') {
        throw new Error('oci_release_state_store_payload_invalid');
    }
    for (const [userId, wrapper] of Object.entries(clear)) {
        if (!userId ||
            !wrapper ||
            Array.isArray(wrapper) ||
            typeof wrapper !== 'object' ||
            !Object.hasOwn(wrapper, 'data')) {
            throw new Error('oci_release_state_store_payload_invalid');
        }
    }
    return clear;
}

function snapshotDigest(payload) {
    const envelope = parseStateSnapshotEnvelope(payload);
    return crypto.createHash('sha256')
        .update(STATE_SNAPSHOT_AAD)
        .update(envelope.iv)
        .update(envelope.tag)
        .update(envelope.ciphertext)
        .digest('hex');
}

function assertReplayJournalCompatible(file, key, protectedPayload) {
    if (!fs.existsSync(file)) return;
    let journal;
    try {
        journal = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        throw new Error('oci_release_state_store_replay_invalid');
    }
    const expectedKeys = ['format', 'mac', 'revoked', 'version'];
    if (!journal ||
        Array.isArray(journal) ||
        JSON.stringify(Object.keys(journal).sort()) !== JSON.stringify(expectedKeys) ||
        journal.format !== 'financasbot-state-replay' ||
        journal.version !== 2 ||
        !Array.isArray(journal.revoked) ||
        journal.revoked.length > 10_000 ||
        journal.revoked.some(item =>
            !item ||
            Array.isArray(item) ||
            JSON.stringify(Object.keys(item).sort()) !==
                JSON.stringify(['digest', 'expiresAt']) ||
            !/^[a-f0-9]{64}$/.test(item.digest) ||
            !Number.isSafeInteger(item.expiresAt) ||
            item.expiresAt <= 0
        ) ||
        new Set(journal.revoked.map(item => item.digest)).size !==
            journal.revoked.length ||
        !/^[a-f0-9]{64}$/.test(journal.mac)) {
        throw new Error('oci_release_state_store_replay_invalid');
    }
    const expectedMac = crypto.createHmac('sha256', key)
        .update(JSON.stringify(journal.revoked))
        .digest('hex');
    if (journal.mac !== expectedMac ||
        journal.revoked.some(item =>
            item.expiresAt > Date.now() &&
            item.digest === snapshotDigest(protectedPayload)
        )) {
        throw new Error('oci_release_state_store_replay_invalid');
    }
}

function inspectStateStorePromotion(targetRoot) {
    const root = path.resolve(targetRoot);
    const envPath = path.join(root, '.env');
    const statePath = path.join(root, 'state_store.json');
    const tempPaths = [
        path.join(root, 'state_store.tmp'),
        path.join(root, 'state_store.replay.tmp')
    ];
    if (!fs.existsSync(envPath) || !fs.existsSync(statePath)) {
        throw new Error('oci_release_state_store_prerequisite_missing');
    }
    if (tempPaths.some(file => fs.existsSync(file))) {
        throw new Error('oci_release_state_store_interrupted_write');
    }
    const envPayload = fs.readFileSync(envPath, 'utf8');
    const statePayload = fs.readFileSync(statePath, 'utf8');
    const { rawKey } = parseEnvPayload(envPayload);
    const key = decodeStateEncryptionKey(rawKey);
    let parsed;
    try {
        parsed = JSON.parse(statePayload);
    } catch {
        throw new Error('oci_release_state_store_snapshot_invalid');
    }
    if (parsed?.format === 'financasbot-state') {
        if (!key) throw new Error('oci_release_state_store_key_required');
        assertStatePayloadCompatible(decryptStateSnapshot(statePayload, key));
        assertReplayJournalCompatible(
            path.join(root, 'state_store.replay.json'),
            key,
            statePayload
        );
        return Object.freeze({
            ready: true,
            bootstrap_required: false,
            encrypted: true,
            legacy_empty: false
        });
    }
    if (parsed && !Array.isArray(parsed) && typeof parsed === 'object' &&
        Object.keys(parsed).length === 0) {
        return Object.freeze({
            ready: false,
            bootstrap_required: true,
            encrypted: false,
            legacy_empty: true
        });
    }
    throw new Error('oci_release_state_store_legacy_nonempty');
}

function syncDirectory(directory) {
    if (process.platform === 'win32') return;
    const fd = fs.openSync(directory, 'r');
    try {
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
}

function writeAtomicPrivate(file, payload, mode = STATE_FILE_MODE) {
    const directory = path.dirname(file);
    const temp = path.join(
        directory,
        `.${path.basename(file)}.oci-release-${process.pid}-${crypto.randomUUID()}`
    );
    const fd = fs.openSync(temp, 'wx', mode);
    try {
        fs.writeFileSync(fd, payload, 'utf8');
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
    fs.chmodSync(temp, mode);
    fs.renameSync(temp, file);
    syncDirectory(directory);
}

function ensurePrivateDirectory(directory) {
    const existed = fs.existsSync(directory);
    fs.mkdirSync(directory, {
        recursive: true,
        mode: PRIVATE_DIRECTORY_MODE
    });
    fs.chmodSync(directory, PRIVATE_DIRECTORY_MODE);
    if (!existed) syncDirectory(path.dirname(directory));
    syncDirectory(directory);
}

function assertPrivateMode(file, expectedMode) {
    if (process.platform === 'win32') return;
    if ((fs.statSync(file).mode & 0o777) !== expectedMode) {
        throw new Error('oci_release_private_mode_invalid');
    }
}

function writeAtomicPrivateNew(file, payload) {
    const directory = path.dirname(file);
    const temp = path.join(
        directory,
        `.${path.basename(file)}.oci-release-${process.pid}-${crypto.randomUUID()}`
    );
    const fd = fs.openSync(temp, 'wx', STATE_FILE_MODE);
    let published = false;
    try {
        fs.writeFileSync(fd, payload, 'utf8');
        fs.fsyncSync(fd);
        fs.chmodSync(temp, STATE_FILE_MODE);
        fs.closeSync(fd);
        fs.linkSync(temp, file);
        published = true;
    } finally {
        try {
            fs.closeSync(fd);
        } catch {
            // The descriptor was already closed after its durable write.
        }
        try {
            fs.unlinkSync(temp);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        if (published) syncDirectory(directory);
    }
    assertPrivateMode(file, STATE_FILE_MODE);
}

function bootstrapEncryptedEmptyStateStore(targetRoot, {
    randomBytes = crypto.randomBytes,
    now = () => new Date(),
    assertProcessStopped
} = {}) {
    if (typeof assertProcessStopped !== 'function' ||
        assertProcessStopped() !== true) {
        throw new Error('oci_release_state_store_process_not_stopped');
    }
    const root = path.resolve(targetRoot);
    const inspection = inspectStateStorePromotion(root);
    if (!inspection.bootstrap_required) {
        return { changed: false, transaction: null, inspection };
    }
    const envPath = path.join(root, '.env');
    const statePath = path.join(root, 'state_store.json');
    const envPayload = fs.readFileSync(envPath, 'utf8');
    const statePayload = fs.readFileSync(statePath, 'utf8');
    const parsedEnv = parseEnvPayload(envPayload);
    const key = decodeStateEncryptionKey(parsedEnv.rawKey) || randomBytes(32);
    if (!Buffer.isBuffer(key) || key.length !== 32) {
        throw new Error('oci_release_state_store_key_generation_failed');
    }
    const encodedKey = key.toString('base64');
    const newline = envPayload.includes('\r\n') ? '\r\n' : '\n';
    const nextLines = [...parsedEnv.lines];
    if (parsedEnv.indexes.length === 1) {
        nextLines[parsedEnv.indexes[0]] = `STATE_STORE_ENCRYPTION_KEY=${encodedKey}`;
    } else {
        if (nextLines.at(-1) === '') nextLines.pop();
        nextLines.push(`STATE_STORE_ENCRYPTION_KEY=${encodedKey}`, '');
    }
    const nextEnv = nextLines.join(newline);
    const nextState = buildEncryptedEmptyStateSnapshot(key, { randomBytes });
    const stamp = now().toISOString().replace(/[:.]/g, '-');
    const dataRoot = path.join(root, 'data');
    const backupRoot = path.join(dataRoot, 'backups');
    ensurePrivateDirectory(dataRoot);
    ensurePrivateDirectory(backupRoot);
    assertPrivateMode(backupRoot, PRIVATE_DIRECTORY_MODE);
    const envBackup = path.join(backupRoot, `.env.pre-state-bootstrap-${stamp}`);
    const stateBackup = path.join(
        backupRoot,
        `state_store.pre-state-bootstrap-${stamp}.json`
    );
    writeAtomicPrivateNew(envBackup, envPayload);
    writeAtomicPrivateNew(stateBackup, statePayload);
    const transaction = {
        envPath,
        statePath,
        envPayload,
        statePayload,
        envBackup,
        stateBackup
    };
    try {
        writeAtomicPrivate(envPath, nextEnv, STATE_FILE_MODE);
        writeAtomicPrivate(statePath, nextState, STATE_FILE_MODE);
        assertPrivateMode(envPath, STATE_FILE_MODE);
        assertPrivateMode(statePath, STATE_FILE_MODE);
        const after = inspectStateStorePromotion(root);
        if (!after.ready) throw new Error('oci_release_state_store_bootstrap_failed');
        return {
            changed: true,
            transaction,
            inspection: after,
            backup_files: [
                path.relative(root, envBackup),
                path.relative(root, stateBackup)
            ]
        };
    } catch (error) {
        writeAtomicPrivate(envPath, envPayload, STATE_FILE_MODE);
        writeAtomicPrivate(statePath, statePayload, STATE_FILE_MODE);
        throw error;
    }
}

function rollbackStateStoreBootstrap(transaction) {
    if (!transaction) return false;
    writeAtomicPrivate(
        transaction.envPath,
        transaction.envPayload,
        STATE_FILE_MODE
    );
    writeAtomicPrivate(
        transaction.statePath,
        transaction.statePayload,
        STATE_FILE_MODE
    );
    return true;
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
    const auditedExecutable = {
        git: process.env.EXHAUSTIVE_LOCAL_GIT_PATH,
        tar: process.env.EXHAUSTIVE_LOCAL_TAR_PATH
    }[command];
    const executable = auditedExecutable || command;
    const result = spawnSync(executable, args, {
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
    const scratch = fs.mkdtempSync(
        path.join(temporaryBase(), 'financasbot-build-')
    );
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
    const scratch = fs.mkdtempSync(
        path.join(temporaryBase(), 'financasbot-verify-')
    );
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
    healthDelayMs = 5000,
    bootstrapEmptyStateStore = false
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
    const stateStoreInspection = inspectStateStorePromotion(targetRoot);
    if (stateStoreInspection.bootstrap_required && !bootstrapEmptyStateStore) {
        throw new Error('oci_release_state_store_bootstrap_confirmation_required');
    }
    let oldProcessDeleted = false;
    let candidateStartAttempted = false;
    let stateStoreBootstrap = null;
    try {
        await runCommand('pm2', ['delete', processName], { cwd: targetRoot });
        oldProcessDeleted = true;
        if (stateStoreInspection.bootstrap_required) {
            stateStoreBootstrap = bootstrapEncryptedEmptyStateStore(targetRoot, {
                assertProcessStopped: () => oldProcessDeleted
            });
        }
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
            rollback_performed: false,
            state_store_bootstrapped: Boolean(stateStoreBootstrap?.changed),
            state_store_backup_files: stateStoreBootstrap?.backup_files || []
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
        if (stateStoreBootstrap?.transaction) {
            rollbackStateStoreBootstrap(stateStoreBootstrap.transaction);
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

function parseHealthAttempts(args) {
    const raw = String(argumentValue(
        args,
        '--health-attempts',
        DEFAULT_HEALTH_ATTEMPTS
    ));
    if (!/^\d+$/.test(raw)) {
        throw new Error('oci_release_health_attempts_invalid');
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) ||
        value < DEFAULT_HEALTH_ATTEMPTS ||
        value > MAX_HEALTH_ATTEMPTS) {
        throw new Error('oci_release_health_attempts_invalid');
    }
    return value;
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
                'financas-bot'
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
            ),
            healthAttempts: parseHealthAttempts(args),
            bootstrapEmptyStateStore: args.includes(
                '--confirm-empty-state-bootstrap'
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
    bootstrapEncryptedEmptyStateStore,
    extractArchive,
    listArchiveEntries,
    parseCurrentPm2Process,
    parseHealthAttempts,
    inspectStateStorePromotion,
    prepareArtifact,
    prepareExtractedRelease,
    promotePreparedRelease,
    rollbackStateStoreBootstrap,
    readAndVerifyReleaseManifest,
    readAndVerifyPreparedRelease,
    sha256File,
    verifyChecksumFile
};
