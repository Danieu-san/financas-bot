const {
    parseCanaryAliases,
    parseCanaryActivations
} = require('./openFinanceRolloutPolicy');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { OpenFinanceAlertOutbox } = require('./openFinanceAlertOutbox');
const { OpenFinanceRevocationJournal } = require('./openFinanceRevocationJournal');
const {
    createOpenFinanceStateBackup,
    restoreOpenFinanceStateBackup,
    verifyOpenFinanceStateBackup
} = require('./openFinanceStateBackup');

const MINIMUM_OPERATIONAL_CUTOFF = '2026-07-28T00:00:00.000Z';
const BUNDLE_SCHEMA = 'open-finance-numeric-save-release-v1';
const PERSISTENT_FILES = Object.freeze({
    journal: 'revocation-journal.sqlite',
    anchor: 'revocation-journal.terminal-anchor.sqlite',
    state: 'state_store.json',
    replay: 'state_store.replay.json'
});
const STATE_SNAPSHOT_AAD = Buffer.from('financasbot-state:v1', 'utf8');
const OPEN_FINANCE_STATE_ACTIONS = new Set([
    'awaiting_open_finance_save_selection',
    'awaiting_open_finance_save_confirmation',
    'awaiting_open_finance_save_review',
    'awaiting_open_finance_save_batch_continue',
    'awaiting_open_finance_final_confirmation'
]);

function normalize(value, fallback = '') {
    return String(value ?? fallback).trim().toLowerCase();
}

function unique(values) {
    return [...new Set(values)];
}

function checksum(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function decodeStateStoreKey(value) {
    const raw = String(value || '').trim();
    const candidates = [];
    if (/^[a-f0-9]{64}$/i.test(raw)) candidates.push(Buffer.from(raw, 'hex'));
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) candidates.push(Buffer.from(raw, 'base64'));
    const key = candidates.find(candidate => candidate.length === 32);
    if (!key) throw new Error('numeric_save_release_state_key_invalid');
    return key;
}

function decodeCanonicalBase64(value, expectedLength = null) {
    if (typeof value !== 'string' || !value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
        throw new Error('numeric_save_release_state_envelope_invalid');
    }
    const decoded = Buffer.from(value, 'base64');
    if (decoded.toString('base64') !== value ||
        (expectedLength !== null && decoded.length !== expectedLength)) {
        throw new Error('numeric_save_release_state_envelope_invalid');
    }
    return decoded;
}

function readProtectedStateSnapshot(file, stateStoreKey) {
    let envelope;
    try {
        envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        throw new Error('numeric_save_release_state_envelope_invalid');
    }
    const expectedKeys = ['algorithm', 'ciphertext', 'format', 'iv', 'tag', 'version'];
    if (!envelope || Array.isArray(envelope) ||
        JSON.stringify(Object.keys(envelope).sort()) !== JSON.stringify(expectedKeys) ||
        envelope.format !== 'financasbot-state' || envelope.version !== 1 ||
        envelope.algorithm !== 'aes-256-gcm') {
        throw new Error('numeric_save_release_state_envelope_invalid');
    }
    const iv = decodeCanonicalBase64(envelope.iv, 12);
    const tag = decodeCanonicalBase64(envelope.tag, 16);
    const ciphertext = decodeCanonicalBase64(envelope.ciphertext);
    let cleartext;
    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', decodeStateStoreKey(stateStoreKey), iv, {
            authTagLength: 16
        });
        decipher.setAAD(STATE_SNAPSHOT_AAD);
        decipher.setAuthTag(tag);
        cleartext = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final()
        ]).toString('utf8');
    } catch {
        throw new Error('numeric_save_release_state_decryption_failed');
    }
    let payload;
    try {
        payload = JSON.parse(cleartext);
    } catch {
        throw new Error('numeric_save_release_state_payload_invalid');
    }
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
        throw new Error('numeric_save_release_state_payload_invalid');
    }
    const digest = crypto.createHash('sha256')
        .update(STATE_SNAPSHOT_AAD)
        .update(iv)
        .update(tag)
        .update(ciphertext)
        .digest('hex');
    return { payload, digest };
}

function proposalRefs(values) {
    return Array.isArray(values) ? values.map(value => String(value || '')) : [];
}

function assertProposalRefs(values, { allowEmpty = false } = {}) {
    const refs = proposalRefs(values);
    if ((!allowEmpty && !refs.length) || new Set(refs).size !== refs.length ||
        refs.some(value => !/^[a-f0-9]{32}$/.test(value))) {
        throw new Error('numeric_save_release_conversation_state_invalid');
    }
    return refs;
}

function classifyConversationState(state) {
    const action = String(state?.action || '');
    if (!action.startsWith('awaiting_open_finance_')) return null;
    if (!OPEN_FINANCE_STATE_ACTIONS.has(action) || !state.data ||
        Array.isArray(state.data) || typeof state.data !== 'object') {
        throw new Error('numeric_save_release_conversation_state_invalid');
    }
    if (action === 'awaiting_open_finance_save_selection') {
        const proposals = Array.isArray(state.data.proposals) ? state.data.proposals : [];
        if (!proposals.length || proposals.length > 4 || proposals.some(proposal =>
            !/^[a-f0-9]{32}$/.test(String(proposal?.proposalRef || ''))) ||
            new Set(proposals.map(proposal => proposal.proposalRef)).size !== proposals.length) {
            throw new Error('numeric_save_release_conversation_state_invalid');
        }
        return 'numeric_batch';
    }
    const batch = action === 'awaiting_open_finance_save_batch_continue'
        ? state.data.batch
        : state.data.batch || null;
    if (action !== 'awaiting_open_finance_save_batch_continue' &&
        !/^[a-f0-9]{32}$/.test(String(state.data.proposalRef || ''))) {
        throw new Error('numeric_save_release_conversation_state_invalid');
    }
    if (!batch) return 'legacy_individual';
    if (batch.version !== 1 ||
        !batch.recipientPrincipalByProposal ||
        Array.isArray(batch.recipientPrincipalByProposal) ||
        typeof batch.recipientPrincipalByProposal !== 'object') {
        throw new Error('numeric_save_release_conversation_state_invalid');
    }
    const selected = assertProposalRefs(batch.selectedProposalRefs || []);
    const queued = assertProposalRefs(batch.queuedProposalRefs || [], { allowEmpty: true });
    const known = new Set([...selected, ...queued]);
    if ([...known].some(ref =>
        !['daniel', 'thais'].includes(String(batch.recipientPrincipalByProposal[ref] || '')))) {
        throw new Error('numeric_save_release_conversation_state_invalid');
    }
    if (action === 'awaiting_open_finance_save_batch_continue' && !queued.length) {
        throw new Error('numeric_save_release_conversation_state_invalid');
    }
    return 'numeric_batch';
}

function validateReplayJournal(file, stateStoreKey, currentDigest) {
    if (!file || !fs.existsSync(file)) return false;
    let replay;
    try {
        replay = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        throw new Error('numeric_save_release_replay_journal_invalid');
    }
    const expectedKeys = ['format', 'mac', 'revoked', 'version'];
    const revoked = Array.isArray(replay?.revoked) ? replay.revoked : [];
    const expectedMac = crypto.createHmac('sha256', decodeStateStoreKey(stateStoreKey))
        .update(JSON.stringify(revoked))
        .digest('hex');
    if (!replay || Array.isArray(replay) ||
        JSON.stringify(Object.keys(replay).sort()) !== JSON.stringify(expectedKeys) ||
        replay.format !== 'financasbot-state-replay' || replay.version !== 2 ||
        revoked.length > 10_000 ||
        new Set(revoked.map(item => item?.digest)).size !== revoked.length ||
        revoked.some(item => !/^[a-f0-9]{64}$/.test(String(item?.digest || '')) ||
            !Number.isSafeInteger(item?.expiresAt) || item.expiresAt <= 0) ||
        replay.mac !== expectedMac || revoked.some(item => item.digest === currentDigest)) {
        throw new Error('numeric_save_release_replay_journal_invalid');
    }
    return true;
}

function inspectPersistentConversationState({ statePath, replayPath, stateStoreKey } = {}) {
    const snapshot = readProtectedStateSnapshot(statePath, stateStoreKey);
    const inventory = { legacy_individual: 0, numeric_batch: 0 };
    for (const wrapper of Object.values(snapshot.payload)) {
        if (!wrapper || Array.isArray(wrapper) || typeof wrapper !== 'object' ||
            !Object.hasOwn(wrapper, 'data')) {
            throw new Error('numeric_save_release_state_payload_invalid');
        }
        const classification = classifyConversationState(wrapper.data);
        if (classification) inventory[classification] += 1;
    }
    return {
        ...inventory,
        replay_present: validateReplayJournal(replayPath, stateStoreKey, snapshot.digest),
        financial_writes: 0
    };
}

function ensureEmptyDirectory(directory) {
    if (fs.existsSync(directory) && fs.readdirSync(directory).length) {
        throw new Error('numeric_save_release_destination_not_empty');
    }
    fs.mkdirSync(directory, { recursive: true });
}

function verifySqlite(file) {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
        if (db.pragma('integrity_check', { simple: true }) !== 'ok') {
            throw new Error('numeric_save_release_sqlite_integrity_failed');
        }
    } finally {
        db.close();
    }
}

async function backupSqlite(sourcePath, destinationPath) {
    const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
    try {
        await source.backup(destinationPath);
    } finally {
        source.close();
    }
    const destination = new Database(destinationPath, { fileMustExist: true });
    try {
        destination.pragma('wal_checkpoint(TRUNCATE)');
        destination.pragma('journal_mode = DELETE');
    } finally {
        destination.close();
    }
    fs.chmodSync(destinationPath, 0o600);
    verifySqlite(destinationPath);
}

function persistentEntry(key, file, present) {
    return {
        key,
        filename: `persistent/${PERSISTENT_FILES[key]}`,
        present,
        bytes: present ? fs.statSync(file).size : 0,
        sha256: present ? checksum(file) : null
    };
}

async function createOpenFinanceNumericSaveReleaseBundle({
    databasePaths,
    persistentPaths,
    destinationDirectory,
    revocationJournal,
    stateStoreKey,
    createdAt = new Date().toISOString()
} = {}) {
    if (!databasePaths?.preview || !persistentPaths?.journal || !persistentPaths?.anchor ||
        !persistentPaths?.state ||
        !destinationDirectory || !revocationJournal?.checkpoint) {
        throw new Error('numeric_save_release_paths_required');
    }
    if (!fs.existsSync(persistentPaths.journal) || !fs.existsSync(persistentPaths.anchor) ||
        !fs.existsSync(persistentPaths.state)) {
        throw new Error('numeric_save_release_persistent_state_unavailable');
    }
    const stateInventory = inspectPersistentConversationState({
        statePath: persistentPaths.state,
        replayPath: persistentPaths.replay,
        stateStoreKey
    });
    for (const temporary of [persistentPaths.temp, persistentPaths.replayTemp].filter(Boolean)) {
        if (fs.existsSync(temporary)) throw new Error('numeric_save_release_state_temp_present');
    }
    ensureEmptyDirectory(destinationDirectory);
    try {
        const coreDirectory = path.join(destinationDirectory, 'core');
        const persistentDirectory = path.join(destinationDirectory, 'persistent');
        fs.mkdirSync(persistentDirectory, { recursive: true });
        const core = await createOpenFinanceStateBackup({
            databasePaths,
            destinationDirectory: coreDirectory,
            revocationJournal,
            createdAt,
            retentionDays: 30
        });
        if (core.manifest.schema !== 'open-finance-state-backup-v3') {
            throw new Error('numeric_save_release_preview_backup_required');
        }
        const journalTarget = path.join(persistentDirectory, PERSISTENT_FILES.journal);
        await backupSqlite(persistentPaths.journal, journalTarget);
        const anchorTarget = path.join(persistentDirectory, PERSISTENT_FILES.anchor);
        await backupSqlite(persistentPaths.anchor, anchorTarget);
        const stateTarget = path.join(persistentDirectory, PERSISTENT_FILES.state);
        fs.copyFileSync(persistentPaths.state, stateTarget, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(stateTarget, 0o600);
        const replayPresent = Boolean(persistentPaths.replay && fs.existsSync(persistentPaths.replay));
        const replayTarget = path.join(persistentDirectory, PERSISTENT_FILES.replay);
        if (replayPresent) {
            fs.copyFileSync(persistentPaths.replay, replayTarget, fs.constants.COPYFILE_EXCL);
            fs.chmodSync(replayTarget, 0o600);
        }
        const manifest = {
            schema: BUNDLE_SCHEMA,
            created_at: new Date(createdAt).toISOString(),
            core_manifest: {
                filename: 'core/manifest.json',
                sha256: checksum(core.manifest_path)
            },
            files: [
                persistentEntry('journal', journalTarget, true),
                persistentEntry('anchor', anchorTarget, true),
                persistentEntry('state', stateTarget, true),
                persistentEntry('replay', replayTarget, replayPresent)
            ],
            state_inventory: stateInventory,
            financial_writes: 0
        };
        const manifestPath = path.join(destinationDirectory, 'manifest.json');
        fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
            encoding: 'utf8',
            mode: 0o600,
            flag: 'wx'
        });
        return { manifest_path: manifestPath, manifest, financial_writes: 0 };
    } catch (error) {
        fs.rmSync(destinationDirectory, { recursive: true, force: true });
        throw error;
    }
}

function readBundleManifest(manifestPath) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest?.schema !== BUNDLE_SCHEMA || !Number.isFinite(Date.parse(manifest.created_at)) ||
        manifest?.core_manifest?.filename !== 'core/manifest.json' ||
        !/^[a-f0-9]{64}$/.test(String(manifest?.core_manifest?.sha256 || '')) ||
        !Array.isArray(manifest.files) || manifest.files.length !== 4 ||
        !manifest.state_inventory ||
        !Number.isInteger(manifest.state_inventory.legacy_individual) ||
        manifest.state_inventory.legacy_individual < 0 ||
        !Number.isInteger(manifest.state_inventory.numeric_batch) ||
        manifest.state_inventory.numeric_batch < 0 ||
        typeof manifest.state_inventory.replay_present !== 'boolean' ||
        manifest.state_inventory.financial_writes !== 0 ||
        manifest.financial_writes !== 0) {
        throw new Error('invalid_numeric_save_release_manifest');
    }
    return manifest;
}

function verifyOpenFinanceNumericSaveReleaseBundle(manifestPath) {
    const resolvedManifest = path.resolve(manifestPath);
    const root = path.dirname(resolvedManifest);
    const manifest = readBundleManifest(resolvedManifest);
    const rootEntries = fs.readdirSync(root).sort();
    if (JSON.stringify(rootEntries) !== JSON.stringify(['core', 'manifest.json', 'persistent'])) {
        throw new Error('unexpected_numeric_save_release_file');
    }
    const coreManifest = path.join(root, manifest.core_manifest.filename);
    if (checksum(coreManifest) !== manifest.core_manifest.sha256) {
        throw new Error('numeric_save_release_checksum_mismatch');
    }
    verifyOpenFinanceStateBackup(coreManifest);
    const expectedKeys = new Set(Object.keys(PERSISTENT_FILES));
    const presentFiles = new Set();
    for (const entry of manifest.files) {
        if (!expectedKeys.delete(entry.key) ||
            entry.filename !== `persistent/${PERSISTENT_FILES[entry.key]}` ||
            typeof entry.present !== 'boolean') {
            throw new Error('invalid_numeric_save_release_file');
        }
        const file = path.join(root, entry.filename);
        if (!entry.present) {
            if (entry.bytes !== 0 || entry.sha256 !== null || fs.existsSync(file)) {
                throw new Error('numeric_save_release_absence_mismatch');
            }
            continue;
        }
        if (!fs.existsSync(file) || entry.bytes !== fs.statSync(file).size ||
            entry.sha256 !== checksum(file)) {
            throw new Error('numeric_save_release_checksum_mismatch');
        }
        presentFiles.add(path.basename(file));
        if (entry.key === 'journal' || entry.key === 'anchor') verifySqlite(file);
    }
    if (expectedKeys.size) throw new Error('incomplete_numeric_save_release_bundle');
    const actualPersistent = fs.readdirSync(path.join(root, 'persistent')).sort();
    if (JSON.stringify(actualPersistent) !== JSON.stringify([...presentFiles].sort())) {
        throw new Error('unexpected_numeric_save_release_file');
    }
    return {
        valid: true,
        files: manifest.files.filter(entry => entry.present).length + 4,
        replay_present: manifest.files.find(entry => entry.key === 'replay').present,
        financial_writes: 0
    };
}

function copyPersistentFiles({ root, manifest, destination }) {
    fs.mkdirSync(destination, { recursive: true });
    const restored = {};
    for (const entry of manifest.files) {
        if (!entry.present) {
            restored[entry.key] = null;
            continue;
        }
        const target = path.join(destination, PERSISTENT_FILES[entry.key]);
        fs.copyFileSync(path.join(root, entry.filename), target, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(target, 0o600);
        restored[entry.key] = target;
    }
    return restored;
}

function restoreOpenFinanceNumericSaveReleaseBundle({
    manifestPath,
    destinationDirectory,
    mappings = [],
    secret,
    stateStoreKey,
    clock
} = {}) {
    verifyOpenFinanceNumericSaveReleaseBundle(manifestPath);
    ensureEmptyDirectory(destinationDirectory);
    try {
        const root = path.dirname(path.resolve(manifestPath));
        const manifest = readBundleManifest(manifestPath);
        const persistent = copyPersistentFiles({
            root,
            manifest,
            destination: path.join(destinationDirectory, 'persistent')
        });
        const restoredInventory = inspectPersistentConversationState({
            statePath: persistent.state,
            replayPath: persistent.replay,
            stateStoreKey
        });
        if (JSON.stringify(restoredInventory) !== JSON.stringify(manifest.state_inventory)) {
            throw new Error('numeric_save_release_state_inventory_mismatch');
        }
        const journal = new OpenFinanceRevocationJournal({
            databasePath: persistent.journal,
            terminalAnchorPath: persistent.anchor,
            secret
        });
        try {
            const core = restoreOpenFinanceStateBackup({
                manifestPath: path.join(root, manifest.core_manifest.filename),
                destinationDirectory: path.join(destinationDirectory, 'core'),
                revocationJournal: journal,
                mappings,
                secret,
                clock
            });
            return {
                core: core.restored,
                persistent,
                revocations_reapplied: core.revocations_reapplied,
                preview_terminals_reapplied: core.preview_save_proposal_terminals_reapplied,
                state_inventory: restoredInventory,
                financial_writes: 0
            };
        } finally {
            journal.close();
        }
    } catch (error) {
        fs.rmSync(destinationDirectory, { recursive: true, force: true });
        throw error;
    }
}

function restoredFingerprint(restored) {
    const entries = [
        ...Object.entries(restored.core),
        ...Object.entries(restored.persistent)
    ].filter(([, file]) => file).sort(([left], [right]) => left.localeCompare(right));
    const fingerprint = {};
    for (const [key, file] of entries) {
        fingerprint[key] = checksum(file);
        for (const [suffix, label] of [['-wal', 'wal'], ['-shm', 'shm']]) {
            const sidecar = `${file}${suffix}`;
            if (fs.existsSync(sidecar)) fingerprint[`${key}_${label}`] = checksum(sidecar);
        }
    }
    return fingerprint;
}

function auditPendingEligibility({ outbox, env, now }) {
    const batches = [];
    let claimed = 0;
    const total = outbox.stats().total;
    for (let iteration = 0; iteration <= total; iteration += 1) {
        const batch = outbox.claimNextBatch({
            canaryAliases: aliasesFromConfig(env),
            activatedAfterByAlias: JSON.parse(env.OPEN_FINANCE_ALERT_CANARY_ACTIVATIONS_JSON),
            now,
            batchSize: 4
        });
        if (!batch.length) break;
        batches.push(batch);
        claimed += batch.length;
        if (iteration === total) throw new Error('numeric_save_release_claim_loop_exceeded');
    }
    const unclaimable = outbox.stats().pending;
    for (const batch of batches) {
        outbox.releaseFailedBatch({
            deliveries: batch.map(item => ({
                alertRef: item.alert_ref,
                leaseToken: item.lease_token
            })),
            errorCode: 'release_gate_rehearsal'
        });
    }
    return { claimed, unclaimable };
}

async function runOpenFinanceNumericSaveReleaseRehearsal({
    env = process.env,
    mappings = [],
    databasePaths,
    persistentPaths,
    revocationJournal,
    workDirectory,
    secret,
    stateStoreKey,
    clock
} = {}) {
    const config = evaluateOpenFinanceNumericSaveReleaseConfig({ env, mappings });
    if (config.outcome !== 'GO') return { ...config, rollback_match: false };
    if (!workDirectory) throw new Error('numeric_save_release_work_directory_required');
    ensureEmptyDirectory(workDirectory);
    const bundle = await createOpenFinanceNumericSaveReleaseBundle({
        databasePaths,
        persistentPaths,
        destinationDirectory: path.join(workDirectory, 'bundle'),
        revocationJournal,
        stateStoreKey,
        createdAt: clock ? clock() : new Date().toISOString()
    });
    const installed = restoreOpenFinanceNumericSaveReleaseBundle({
        manifestPath: bundle.manifest_path,
        destinationDirectory: path.join(workDirectory, 'installed'),
        mappings,
        secret,
        stateStoreKey,
        clock
    });
    const before = restoredFingerprint(installed);
    let quarantined;
    let recovered;
    let stats;
    let eligibility;
    let outbox = new OpenFinanceAlertOutbox({ databasePath: installed.core.outbox, secret });
    try {
        quarantined = outbox.quarantineBeforeActivation({
            canaryAliases: aliasesFromConfig(env),
            activatedAfterByAlias: JSON.parse(env.OPEN_FINANCE_ALERT_CANARY_ACTIVATIONS_JSON)
        });
        recovered = outbox.recoverExpiredAmbiguous({
            now: clock ? clock() : new Date().toISOString()
        });
    } finally {
        outbox.close();
    }
    outbox = new OpenFinanceAlertOutbox({ databasePath: installed.core.outbox, secret });
    try {
        eligibility = auditPendingEligibility({
            outbox,
            env,
            now: clock ? clock() : new Date().toISOString()
        });
        stats = outbox.stats();
    } finally {
        outbox.close();
    }
    const rollback = restoreOpenFinanceNumericSaveReleaseBundle({
        manifestPath: bundle.manifest_path,
        destinationDirectory: path.join(workDirectory, 'rollback'),
        mappings,
        secret,
        stateStoreKey,
        clock
    });
    const rollbackMatch = JSON.stringify(before) === JSON.stringify(restoredFingerprint(rollback));
    const replayWasPresent = Boolean(
        persistentPaths.replay && fs.existsSync(persistentPaths.replay)
    );
    return {
        outcome: rollbackMatch && eligibility.unclaimable === 0 ? 'GO' : 'NO_GO',
        minimum_cutoff: config.minimum_cutoff,
        aliases: config.aliases,
        backlog_quarantined: quarantined.blocked,
        expired_terminalized: recovered.recovered_ambiguous,
        accepted_unconfirmed: stats.accepted_unconfirmed,
        pending_after_cutoff: eligibility.claimed,
        unclaimable_pending: eligibility.unclaimable,
        rollback_match: rollbackMatch,
        state_snapshot_preserved: Boolean(rollback.persistent.state),
        replay_snapshot_preserved: replayWasPresent
            ? Boolean(rollback.persistent.replay)
            : rollback.persistent.replay === null,
        legacy_individual_states: rollback.state_inventory.legacy_individual,
        numeric_batch_states: rollback.state_inventory.numeric_batch,
        financial_writes: 0
    };
}

function aliasesFromConfig(env) {
    const blockers = [];
    return parseCanaryAliases(env, blockers);
}

function evaluateOpenFinanceNumericSaveReleaseConfig({
    env = process.env,
    mappings = [],
    minimumCutoff = MINIMUM_OPERATIONAL_CUTOFF
} = {}) {
    const blockers = [];
    const canaryAliases = parseCanaryAliases(env, blockers);
    const activations = parseCanaryActivations(env, canaryAliases, blockers);
    const mappedAliases = unique((Array.isArray(mappings) ? mappings : [])
        .map(mapping => normalize(mapping?.alias))
        .filter(Boolean));

    const configuredSet = [...canaryAliases].sort();
    const mappedSet = [...mappedAliases].sort();
    if (configuredSet.length !== 4 || mappedSet.length !== 4 ||
        JSON.stringify(configuredSet) !== JSON.stringify(mappedSet)) {
        blockers.push('numeric_save_source_set_mismatch');
    }

    const minimumTimestamp = Date.parse(minimumCutoff);
    if (!Number.isFinite(minimumTimestamp)) {
        blockers.push('numeric_save_minimum_cutoff_invalid');
    } else if (Object.values(activations).some(value => Date.parse(value) < minimumTimestamp)) {
        blockers.push('activation_before_numeric_save_cutoff');
    }

    const alertMode = normalize(env.OPEN_FINANCE_ALERT_MODE, 'off');
    const previewMode = normalize(env.OPEN_FINANCE_SHADOW_PREVIEW_MODE, 'off');
    const reconciliationMode = normalize(env.OPEN_FINANCE_RECONCILIATION_MODE, 'off');
    const proposalMode = normalize(env.OPEN_FINANCE_SAVE_PROPOSAL_MODE, 'off');
    const writeMode = normalize(env.OPEN_FINANCE_WRITE_MODE, 'off');
    const writeApproved = normalize(env.OPEN_FINANCE_WRITE_APPROVED, 'false');

    if (alertMode !== 'canary') blockers.push('numeric_save_alert_mode_must_be_canary');
    if (previewMode !== 'canary') blockers.push('numeric_save_preview_mode_must_be_canary');
    if (reconciliationMode !== 'canary') blockers.push('numeric_save_reconciliation_mode_must_be_canary');
    if (proposalMode !== 'prompt') blockers.push('numeric_save_proposal_mode_must_be_prompt');
    if (writeMode !== 'off') blockers.push('numeric_save_write_mode_must_remain_off');
    if (writeApproved !== 'false') blockers.push('numeric_save_write_approval_must_remain_false');

    const normalizedBlockers = unique(blockers);
    return Object.freeze({
        outcome: normalizedBlockers.length ? 'NO_GO' : 'GO',
        minimum_cutoff: Number.isFinite(minimumTimestamp)
            ? new Date(minimumTimestamp).toISOString()
            : null,
        aliases: canaryAliases.length,
        write_mode: writeMode,
        proposal_mode: proposalMode,
        blockers: Object.freeze(normalizedBlockers),
        financial_writes: 0
    });
}

module.exports = {
    MINIMUM_OPERATIONAL_CUTOFF,
    createOpenFinanceNumericSaveReleaseBundle,
    evaluateOpenFinanceNumericSaveReleaseConfig,
    inspectPersistentConversationState,
    restoreOpenFinanceNumericSaveReleaseBundle,
    runOpenFinanceNumericSaveReleaseRehearsal,
    verifyOpenFinanceNumericSaveReleaseBundle
};
