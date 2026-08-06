const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');
const { OpenFinanceBaselineStore } = require('../src/openFinance/openFinanceBaselineStore');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { OpenFinanceRevocationJournal } = require('../src/openFinance/openFinanceRevocationJournal');
const { OpenFinanceShadowPreviewStore } = require('../src/openFinance/openFinanceShadowPreviewStore');
const { classifyOpenFinanceLifecycle } = require('../src/openFinance/openFinanceLifecycleClassifier');
const {
    runNumericSaveReleaseGate
} = require('../scripts/runOpenFinanceNumericSaveReleaseGate');
const {
    createOpenFinanceNumericSaveReleaseBundle,
    evaluateOpenFinanceNumericSaveReleaseConfig,
    runOpenFinanceNumericSaveReleaseRehearsal,
    verifyOpenFinanceNumericSaveReleaseBundle
} = require('../src/openFinance/openFinanceNumericSaveReleaseGate');

const aliases = [
    'daniel_nubank',
    'thais_nubank',
    'cristina_nubank',
    'thais_itau'
];
const secret = 'numeric-save-release-gate-secret-32-bytes';
const stateStoreKey = Buffer.alloc(32, 7).toString('base64');
const individualProposalRef = 'a'.repeat(32);
const batchProposalRef = 'b'.repeat(32);
const policies = aliases.map(alias => ({
    alias,
    source_owner: alias === 'daniel_nubank' ? 'daniel' : 'thais',
    authorized_viewers: ['daniel', 'thais'],
    whatsapp_recipient: alias === 'daniel_nubank' ? 'daniel' : 'thais',
    family_aggregation_allowed: true,
    write_confirmation_principal: alias === 'daniel_nubank' ? 'daniel' : 'thais'
}));

function safeEnv(overrides = {}) {
    return {
        OPEN_FINANCE_ALERT_MODE: 'canary',
        OPEN_FINANCE_ALERT_CANARY_ALIASES: aliases.join(','),
        OPEN_FINANCE_ALERT_CANARY_ACTIVATIONS_JSON: JSON.stringify(
            Object.fromEntries(aliases.map(alias => [alias, '2026-07-28T00:00:00.000Z']))
        ),
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_WRITE_MODE: 'off',
        OPEN_FINANCE_WRITE_APPROVED: 'false',
        ...overrides
    };
}

function createFixture(root) {
    const databasePaths = Object.fromEntries(
        ['staging', 'baseline', 'outbox', 'preview']
            .map(key => [key, path.join(root, `${key}.sqlite`)])
    );
    const persistentPaths = {
        journal: path.join(root, 'revocation-journal.sqlite'),
        anchor: path.join(root, 'revocation-journal.terminal-anchor.sqlite'),
        state: path.join(root, 'state_store.json'),
        replay: path.join(root, 'state_store.replay.json'),
        temp: path.join(root, 'state_store.tmp'),
        replayTemp: path.join(root, 'state_store.replay.tmp')
    };
    new OpenFinanceLiveStagingVault({ databasePath: databasePaths.staging, secret }).close();
    new OpenFinanceBaselineStore({ databasePath: databasePaths.baseline, secret }).close();
    new OpenFinanceAlertOutbox({ databasePath: databasePaths.outbox, secret }).close();
    new OpenFinanceShadowPreviewStore({ databasePath: databasePaths.preview, secret }).close();
    const journal = new OpenFinanceRevocationJournal({
        databasePath: persistentPaths.journal,
        terminalAnchorPath: persistentPaths.anchor,
        secret
    });
    const statePayload = {
        'synthetic-individual': {
            data: {
                action: 'awaiting_open_finance_save_review',
                data: { proposalRef: individualProposalRef }
            },
            expiresAt: Date.parse('2026-08-07T00:00:00.000Z')
        },
        'synthetic-batch': {
            data: {
                action: 'awaiting_open_finance_save_batch_continue',
                data: {
                    batch: {
                        version: 1,
                        selectedProposalRefs: [batchProposalRef],
                        queuedProposalRefs: [batchProposalRef],
                        recipientPrincipalByProposal: {
                            [batchProposalRef]: 'daniel'
                        }
                    }
                }
            },
            expiresAt: Date.parse('2026-08-07T00:00:00.000Z')
        }
    };
    const key = Buffer.from(stateStoreKey, 'base64');
    const iv = Buffer.alloc(12, 3);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from('financasbot-state:v1', 'utf8'));
    const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(statePayload), 'utf8'),
        cipher.final()
    ]);
    fs.writeFileSync(persistentPaths.state, JSON.stringify({
        format: 'financasbot-state',
        version: 1,
        algorithm: 'aes-256-gcm',
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64')
    }), { mode: 0o600 });
    const revoked = [];
    fs.writeFileSync(persistentPaths.replay, JSON.stringify({
        format: 'financasbot-state-replay',
        version: 2,
        revoked,
        mac: crypto.createHmac('sha256', key)
            .update(JSON.stringify(revoked))
            .digest('hex')
    }), { mode: 0o600 });
    return {
        databasePaths,
        persistentPaths,
        journal,
        mappings: aliases.map((alias, index) => ({
            alias,
            itemId: `release-item-${index + 1}`,
            generation: 1
        }))
    };
}

function enqueuePurchase(outbox, {
    alias = 'daniel_nubank',
    suffix,
    createdAt,
    deliveryPolicies = policies
}) {
    const item = {
        id: `release-item-${suffix}`,
        alias_code: alias,
        accounts: [{ id: `release-account-${suffix}`, type: 'CREDIT' }],
        transactions: [{
            id: `release-transaction-${suffix}`,
            account_id: `release-account-${suffix}`,
            amount_cents: 1200,
            description: `private-${suffix}`,
            date: createdAt,
            status: 'POSTED',
            currency: 'BRL'
        }]
    };
    const lifecycle = classifyOpenFinanceLifecycle({ items: [item], secret });
    outbox.enqueue({
        candidates: [{
            observation_ref: lifecycle.decisions[0].observation_ref,
            external_event_ref: `release-event-${suffix}`,
            correlation_state: 'new_event',
            reconciliation_status: 'new'
        }],
        lifecycleDecisions: lifecycle.decisions,
        items: [item],
        policies: deliveryPolicies,
        baselineComplete: true,
        reconciliationRequired: true,
        createdAt
    });
}

test('gate 33 accepts only the four mapped sources at or after the operational cutoff', () => {
    const report = evaluateOpenFinanceNumericSaveReleaseConfig({
        env: safeEnv(),
        mappings: aliases.map(alias => ({ alias }))
    });

    assert.deepStrictEqual(report, {
        outcome: 'GO',
        minimum_cutoff: '2026-07-28T00:00:00.000Z',
        aliases: 4,
        write_mode: 'off',
        proposal_mode: 'prompt',
        blockers: [],
        financial_writes: 0
    });

    const activations = Object.fromEntries(
        aliases.map(alias => [alias, '2026-07-28T00:00:00.000Z'])
    );
    activations.thais_itau = '2026-07-27T23:59:59.999Z';
    const rejected = evaluateOpenFinanceNumericSaveReleaseConfig({
        env: safeEnv({
            OPEN_FINANCE_ALERT_CANARY_ACTIVATIONS_JSON: JSON.stringify(activations)
        }),
        mappings: aliases.map(alias => ({ alias }))
    });

    assert.equal(rejected.outcome, 'NO_GO');
    assert.deepStrictEqual(rejected.blockers, ['activation_before_numeric_save_cutoff']);
    assert.equal(rejected.financial_writes, 0);
});

test('gate 33 fails closed for unsafe flags or a source set different from the mapping', () => {
    const report = evaluateOpenFinanceNumericSaveReleaseConfig({
        env: safeEnv({
            OPEN_FINANCE_WRITE_MODE: 'confirm',
            OPEN_FINANCE_WRITE_APPROVED: 'true'
        }),
        mappings: aliases.slice(0, 3).map(alias => ({ alias }))
    });

    assert.equal(report.outcome, 'NO_GO');
    assert.deepStrictEqual(report.blockers, [
        'numeric_save_source_set_mismatch',
        'numeric_save_write_mode_must_remain_off',
        'numeric_save_write_approval_must_remain_false'
    ]);
    assert.equal(report.financial_writes, 0);
});

test('gate 33 bundles the coherent state and rejects tampering or temporary snapshots', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-numeric-release-bundle-'));
    const fixture = createFixture(root);
    try {
        const bundle = await createOpenFinanceNumericSaveReleaseBundle({
            databasePaths: fixture.databasePaths,
            persistentPaths: fixture.persistentPaths,
            destinationDirectory: path.join(root, 'bundle'),
            revocationJournal: fixture.journal,
            stateStoreKey,
            createdAt: '2026-08-06T00:00:00.000Z'
        });
        assert.deepStrictEqual(verifyOpenFinanceNumericSaveReleaseBundle(bundle.manifest_path), {
            valid: true,
            files: 8,
            replay_present: true,
            financial_writes: 0
        });
        fs.appendFileSync(path.join(root, 'bundle', 'persistent', 'state_store.json'), 'tamper');
        assert.throws(
            () => verifyOpenFinanceNumericSaveReleaseBundle(bundle.manifest_path),
            /numeric_save_release_checksum_mismatch/
        );

        fs.writeFileSync(fixture.persistentPaths.temp, 'partial', { mode: 0o600 });
        await assert.rejects(
            createOpenFinanceNumericSaveReleaseBundle({
                databasePaths: fixture.databasePaths,
                persistentPaths: fixture.persistentPaths,
                destinationDirectory: path.join(root, 'bundle-with-temp'),
                revocationJournal: fixture.journal,
                stateStoreKey
            }),
            /numeric_save_release_state_temp_present/
        );
        assert.equal(fs.existsSync(path.join(root, 'bundle-with-temp')), false);
        fs.rmSync(fixture.persistentPaths.temp, { force: true });

        const replay = JSON.parse(fs.readFileSync(fixture.persistentPaths.replay, 'utf8'));
        replay.revoked = [{ digest: 'f'.repeat(64), expiresAt: 1 }, {
            digest: 'f'.repeat(64),
            expiresAt: 2
        }];
        replay.mac = crypto.createHmac('sha256', Buffer.from(stateStoreKey, 'base64'))
            .update(JSON.stringify(replay.revoked))
            .digest('hex');
        fs.writeFileSync(fixture.persistentPaths.replay, JSON.stringify(replay), { mode: 0o600 });
        await assert.rejects(
            createOpenFinanceNumericSaveReleaseBundle({
                databasePaths: fixture.databasePaths,
                persistentPaths: fixture.persistentPaths,
                destinationDirectory: path.join(root, 'bundle-with-replayed-state'),
                revocationJournal: fixture.journal,
                stateStoreKey
            }),
            /numeric_save_release_replay_journal_invalid/
        );
    } finally {
        fixture.journal.close();
    }
});

test('gate 33 quarantines pre-cutoff backlog and restores accepted terminals exactly after restart', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-numeric-release-rehearsal-'));
    const fixture = createFixture(root);
    let outbox = new OpenFinanceAlertOutbox({
        databasePath: fixture.databasePaths.outbox,
        secret
    });
    try {
        enqueuePurchase(outbox, {
            suffix: 'before-cutoff',
            createdAt: '2026-07-27T23:59:59.000Z'
        });
        enqueuePurchase(outbox, {
            suffix: 'accepted-terminal',
            createdAt: '2026-07-28T00:00:01.000Z'
        });
        const claimed = outbox.claimNext({
            canaryAlias: 'daniel_nubank',
            activatedAfterByAlias: {
                daniel_nubank: '2026-07-28T00:00:00.000Z'
            },
            now: '2026-07-28T00:01:00.000Z'
        });
        const acceptedAlertRef = claimed.alert_ref;
        outbox.acknowledgeAccepted({
            alertRef: claimed.alert_ref,
            leaseToken: claimed.lease_token,
            acceptedAt: '2026-07-28T00:01:01.000Z'
        });
        outbox.close();
        outbox = null;

        const result = await runOpenFinanceNumericSaveReleaseRehearsal({
            env: safeEnv(),
            mappings: fixture.mappings,
            databasePaths: fixture.databasePaths,
            persistentPaths: fixture.persistentPaths,
            revocationJournal: fixture.journal,
            workDirectory: path.join(root, 'rehearsal'),
            secret,
            stateStoreKey,
            clock: () => '2026-08-06T00:00:00.000Z'
        });

        assert.deepStrictEqual(result, {
            outcome: 'GO',
            minimum_cutoff: '2026-07-28T00:00:00.000Z',
            aliases: 4,
            backlog_quarantined: 2,
            expired_terminalized: 0,
            accepted_unconfirmed: 1,
            pending_after_cutoff: 1,
            unclaimable_pending: 0,
            rollback_match: true,
            state_snapshot_preserved: true,
            replay_snapshot_preserved: true,
            legacy_individual_states: 1,
            numeric_batch_states: 1,
            financial_writes: 0
        });

        const restoredOutbox = new OpenFinanceAlertOutbox({
            databasePath: path.join(root, 'rehearsal', 'installed', 'core', 'outbox.sqlite'),
            secret
        });
        try {
            const eligible = restoredOutbox.claimNextBatch({
                canaryAliases: aliases,
                activatedAfterByAlias: JSON.parse(
                    safeEnv().OPEN_FINANCE_ALERT_CANARY_ACTIVATIONS_JSON
                )
            });
            assert.equal(eligible.length, 1);
            assert.notEqual(eligible[0].alert_ref, acceptedAlertRef);
            assert.equal(restoredOutbox.stats().accepted_unconfirmed, 1);
        } finally {
            restoredOutbox.close();
        }
    } finally {
        outbox?.close();
        fixture.journal.close();
    }
});

test('gate 33 executable accepts only an explicit local copy and has no external effects', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-numeric-release-cli-'));
    const fixture = createFixture(root);
    const mappingPath = path.join(root, 'mapping.json');
    const secretPath = path.join(root, 'secret.txt');
    fs.writeFileSync(mappingPath, JSON.stringify(fixture.mappings), { mode: 0o600 });
    fs.writeFileSync(secretPath, secret, { mode: 0o600 });
    fixture.journal.close();
    fixture.journal = null;
    const env = safeEnv({
        OPEN_FINANCE_NUMERIC_RELEASE_SOURCE_COPY_ROOT: root,
        OPEN_FINANCE_NUMERIC_RELEASE_WORK_ROOT: `${root}-work`,
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: secretPath,
        STATE_STORE_ENCRYPTION_KEY: stateStoreKey,
        OPEN_FINANCE_LIVE_STAGING_DB: fixture.databasePaths.staging,
        OPEN_FINANCE_BASELINE_DB: fixture.databasePaths.baseline,
        OPEN_FINANCE_OUTBOX_DB: fixture.databasePaths.outbox,
        OPEN_FINANCE_SHADOW_PREVIEW_DB: fixture.databasePaths.preview,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: fixture.persistentPaths.journal,
        OPEN_FINANCE_REVOCATION_JOURNAL_ANCHOR_DB: fixture.persistentPaths.anchor,
        OPEN_FINANCE_NUMERIC_RELEASE_STATE_FILE: fixture.persistentPaths.state,
        OPEN_FINANCE_NUMERIC_RELEASE_REPLAY_FILE: fixture.persistentPaths.replay,
        OPEN_FINANCE_NUMERIC_RELEASE_MAPPING_FILE: mappingPath
    });

    await assert.rejects(
        runNumericSaveReleaseGate({ env, argv: [] }),
        /numeric_save_release_confirmation_required/
    );
    const report = await runNumericSaveReleaseGate({
        env,
        argv: ['--confirm-local-copy', '--confirm-no-external-effects'],
        clock: () => '2026-08-06T00:00:00.000Z'
    });
    assert.equal(report.outcome, 'GO');
    assert.equal(report.rollback_match, true);
    assert.equal(report.legacy_individual_states, 1);
    assert.equal(report.numeric_batch_states, 1);
    assert.equal(report.financial_writes, 0);

    const outsideOutbox = `${root}-outside.sqlite`;
    new OpenFinanceAlertOutbox({ databasePath: outsideOutbox, secret }).close();
    await assert.rejects(
        runNumericSaveReleaseGate({
            env: { ...env, OPEN_FINANCE_OUTBOX_DB: outsideOutbox },
            argv: ['--confirm-local-copy', '--confirm-no-external-effects']
        }),
        /numeric_save_release_source_outside_copy/
    );

    const workTarget = path.join(root, 'work-target');
    const workLink = `${root}-work-link`;
    fs.mkdirSync(workTarget);
    fs.symlinkSync(workTarget, workLink, 'junction');
    await assert.rejects(
        runNumericSaveReleaseGate({
            env: { ...env, OPEN_FINANCE_NUMERIC_RELEASE_WORK_ROOT: workLink },
            argv: ['--confirm-local-copy', '--confirm-no-external-effects']
        }),
        /numeric_save_release_work_inside_source_copy/
    );
    assert.deepStrictEqual(fs.readdirSync(workTarget), []);
});

test('gate 33 returns NO_GO when a pending row cannot be claimed by the configured sources', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-numeric-release-unclaimable-'));
    const fixture = createFixture(root);
    const outbox = new OpenFinanceAlertOutbox({
        databasePath: fixture.databasePaths.outbox,
        secret
    });
    try {
        enqueuePurchase(outbox, {
            alias: 'rogue_source',
            suffix: 'rogue-pending',
            createdAt: '2026-07-28T00:00:01.000Z',
            deliveryPolicies: [{
                alias: 'rogue_source',
                source_owner: 'daniel',
                authorized_viewers: ['daniel'],
                whatsapp_recipient: 'daniel',
                family_aggregation_allowed: false,
                write_confirmation_principal: 'daniel'
            }]
        });
    } finally {
        outbox.close();
    }

    try {
        const report = await runOpenFinanceNumericSaveReleaseRehearsal({
            env: safeEnv(),
            mappings: fixture.mappings,
            databasePaths: fixture.databasePaths,
            persistentPaths: fixture.persistentPaths,
            revocationJournal: fixture.journal,
            workDirectory: path.join(root, 'rehearsal'),
            secret,
            stateStoreKey,
            clock: () => '2026-08-06T00:00:00.000Z'
        });
        assert.equal(report.outcome, 'NO_GO');
        assert.equal(report.unclaimable_pending, 1);
        assert.equal(report.pending_after_cutoff, 0);
        assert.equal(report.rollback_match, true);
        assert.equal(report.financial_writes, 0);
    } finally {
        fixture.journal.close();
    }
});
