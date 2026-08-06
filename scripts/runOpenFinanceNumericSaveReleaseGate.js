const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const { OpenFinanceRevocationJournal } = require('../src/openFinance/openFinanceRevocationJournal');
const {
    runOpenFinanceNumericSaveReleaseRehearsal
} = require('../src/openFinance/openFinanceNumericSaveReleaseGate');

function requiredFile(value, reason) {
    const file = path.resolve(String(value || ''));
    if (!value || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        throw new Error(reason);
    }
    return file;
}

function requiredDirectory(value, reason) {
    const directory = path.resolve(String(value || ''));
    if (!value || !fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
        throw new Error(reason);
    }
    return fs.realpathSync(directory);
}

function resolvePhysicalCandidate(candidate) {
    const resolved = path.resolve(candidate);
    const missing = [];
    let existing = resolved;
    while (!fs.existsSync(existing)) {
        const parent = path.dirname(existing);
        if (parent === existing) throw new Error('numeric_save_release_path_unresolvable');
        missing.unshift(path.basename(existing));
        existing = parent;
    }
    return path.join(fs.realpathSync(existing), ...missing);
}

function isInside(root, candidate) {
    const relative = path.relative(root, candidate);
    return !relative || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertInside(root, candidate, reason, { required = true } = {}) {
    if (!candidate) throw new Error(reason);
    const resolved = path.resolve(candidate);
    if (required && !fs.existsSync(resolved)) throw new Error(reason);
    const physical = resolvePhysicalCandidate(resolved);
    if (!isInside(root, physical)) {
        throw new Error('numeric_save_release_source_outside_copy');
    }
    return physical;
}

function parseMappings(file) {
    const mappings = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(mappings) || !mappings.length) {
        throw new Error('numeric_save_release_mapping_invalid');
    }
    return mappings;
}

async function runNumericSaveReleaseGate({
    env = process.env,
    argv = process.argv.slice(2),
    clock
} = {}) {
    if (!argv.includes('--confirm-local-copy') ||
        !argv.includes('--confirm-quiescent-source-copy') ||
        !argv.includes('--confirm-no-external-effects')) {
        throw new Error('numeric_save_release_confirmation_required');
    }
    const sourceRoot = requiredDirectory(
        env.OPEN_FINANCE_NUMERIC_RELEASE_SOURCE_COPY_ROOT,
        'numeric_save_release_source_copy_required'
    );
    const workDirectory = path.resolve(String(
        env.OPEN_FINANCE_NUMERIC_RELEASE_WORK_ROOT || ''
    ));
    if (!env.OPEN_FINANCE_NUMERIC_RELEASE_WORK_ROOT) {
        throw new Error('numeric_save_release_work_root_required');
    }
    const physicalWorkDirectory = resolvePhysicalCandidate(workDirectory);
    if (isInside(sourceRoot, physicalWorkDirectory) ||
        isInside(physicalWorkDirectory, sourceRoot)) {
        throw new Error('numeric_save_release_work_inside_source_copy');
    }
    const secretFile = requiredFile(
        env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE,
        'open_finance_secret_unavailable'
    );
    const secret = fs.readFileSync(secretFile, 'utf8').trim();
    if (secret.length < 32) throw new Error('open_finance_secret_invalid');
    const stateStoreKey = String(env.STATE_STORE_ENCRYPTION_KEY || '').trim();
    if (!stateStoreKey) throw new Error('numeric_save_release_state_key_required');
    const databasePaths = {
        staging: assertInside(sourceRoot, env.OPEN_FINANCE_LIVE_STAGING_DB,
            'open_finance_staging_unavailable'),
        baseline: assertInside(sourceRoot, env.OPEN_FINANCE_BASELINE_DB,
            'open_finance_baseline_unavailable'),
        outbox: assertInside(sourceRoot, env.OPEN_FINANCE_OUTBOX_DB,
            'open_finance_outbox_unavailable'),
        preview: assertInside(sourceRoot, env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
            'open_finance_shadow_preview_unavailable')
    };
    for (const file of Object.values(databasePaths)) requiredFile(file, 'numeric_save_release_database_unavailable');
    const journalPath = assertInside(
        sourceRoot,
        env.OPEN_FINANCE_REVOCATION_JOURNAL_DB,
        'open_finance_revocation_journal_unavailable'
    );
    const anchorPath = assertInside(
        sourceRoot,
        env.OPEN_FINANCE_REVOCATION_JOURNAL_ANCHOR_DB || `${journalPath}.terminal-anchor.sqlite`,
        'open_finance_terminal_journal_anchor_required'
    );
    const statePath = assertInside(
        sourceRoot,
        env.OPEN_FINANCE_NUMERIC_RELEASE_STATE_FILE || path.join(sourceRoot, 'state_store.json'),
        'numeric_save_release_state_unavailable'
    );
    const replayPath = assertInside(
        sourceRoot,
        env.OPEN_FINANCE_NUMERIC_RELEASE_REPLAY_FILE || path.join(sourceRoot, 'state_store.replay.json'),
        'numeric_save_release_replay_outside_copy',
        { required: false }
    );
    const mappingPath = assertInside(
        sourceRoot,
        env.OPEN_FINANCE_NUMERIC_RELEASE_MAPPING_FILE || env.PLUGGY_ITEM_MAP_FILE,
        'numeric_save_release_mapping_unavailable'
    );
    const journal = new OpenFinanceRevocationJournal({
        databasePath: journalPath,
        terminalAnchorPath: anchorPath,
        secret
    });
    try {
        return await runOpenFinanceNumericSaveReleaseRehearsal({
            env,
            mappings: parseMappings(mappingPath),
            databasePaths,
            persistentPaths: {
                journal: journalPath,
                anchor: anchorPath,
                state: statePath,
                replay: replayPath,
                temp: assertInside(sourceRoot, path.join(path.dirname(statePath), 'state_store.tmp'),
                    'numeric_save_release_state_temp_outside_copy', { required: false }),
                replayTemp: assertInside(sourceRoot,
                    path.join(path.dirname(replayPath), 'state_store.replay.tmp'),
                    'numeric_save_release_replay_temp_outside_copy', { required: false })
            },
            revocationJournal: journal,
            workDirectory: physicalWorkDirectory,
            secret,
            stateStoreKey,
            clock
        });
    } finally {
        journal.close();
    }
}

function safeReason(error) {
    return String(error?.message || 'unknown')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .slice(0, 96);
}

if (require.main === module) {
    runNumericSaveReleaseGate().then(result => {
        console.log(`[open-finance-numeric-save-release] ${JSON.stringify(result)}`);
        if (result.outcome !== 'GO') process.exitCode = 1;
    }).catch(error => {
        console.error(`[open-finance-numeric-save-release] NO_GO reason=${safeReason(error)}`);
        process.exitCode = 1;
    });
}

module.exports = { runNumericSaveReleaseGate };
