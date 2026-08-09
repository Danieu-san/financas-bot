'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    OpenFinanceHistoricalAmbiguityReviewStore
} = require('../src/openFinance/openFinanceHistoricalAmbiguityReview');

const CONFIRM_VIEW = '--confirm-private-local-review';
const CONFIRM_DECISION = '--confirm-exact-set';

function parseArgs(argv) {
    const command = String(argv[0] || '');
    if (!['prepare', 'view', 'decide'].includes(command)) {
        throw new Error('historical_local_review_command_required');
    }
    const allowed = new Set([
        '--database', '--sealed-state-file', '--output', '--group-ref', '--item-ref',
        '--scope', '--expected-items-file', '--resolution-code', CONFIRM_VIEW,
        CONFIRM_DECISION
    ]);
    const result = { command };
    for (let index = 1; index < argv.length; index += 1) {
        const key = argv[index];
        if (!allowed.has(key)) throw new Error(`unsupported_argument:${key}`);
        if ([CONFIRM_VIEW, CONFIRM_DECISION].includes(key)) {
            result[key === CONFIRM_VIEW ? 'confirmPrivateLocalReview' : 'confirmExactSet'] = true;
            continue;
        }
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) throw new Error(`missing_argument_value:${key}`);
        result[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
        index += 1;
    }
    return result;
}

function requireOutsideRepository(value, { mustExist = false, extension = null } = {}) {
    const resolved = path.resolve(String(value || ''));
    if (!value || (extension && path.extname(resolved).toLowerCase() !== extension)) {
        throw new Error('historical_local_review_private_path_invalid');
    }
    const repository = fs.realpathSync(path.resolve(__dirname, '..'));
    const parent = fs.realpathSync(path.dirname(resolved));
    const relative = path.relative(repository, parent);
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
        throw new Error('historical_local_review_path_must_be_outside_repository');
    }
    if (mustExist && !fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()) {
        throw new Error('historical_local_review_private_file_required');
    }
    return resolved;
}

function readExpectedItemRefs(file) {
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        throw new Error('historical_local_review_expected_items_invalid');
    }
    if (!Array.isArray(parsed) || !parsed.length
        || new Set(parsed).size !== parsed.length
        || parsed.some(value => !/^[a-f0-9]{32}$/.test(String(value || '')))) {
        throw new Error('historical_local_review_expected_items_invalid');
    }
    return parsed;
}

function main(argv = process.argv.slice(2), {
    env = process.env,
    stdout = process.stdout,
    StoreClass = OpenFinanceHistoricalAmbiguityReviewStore
} = {}) {
    const args = parseArgs(argv);
    const secret = String(env.OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_SECRET || '');
    const localReviewerId = String(env.OPEN_FINANCE_HISTORICAL_LOCAL_REVIEWER_ID || '').trim();
    if (secret.length < 32) throw new Error('historical_local_review_secret_required');
    if (!localReviewerId) throw new Error('historical_local_review_reviewer_required');
    if (args.command === 'decide' ? !args.confirmExactSet : !args.confirmPrivateLocalReview) {
        throw new Error('historical_local_review_explicit_confirmation_required');
    }

    const databasePath = requireOutsideRepository(args.database, {
        mustExist: args.command !== 'prepare', extension: '.sqlite'
    });
    const store = new StoreClass({
        databasePath,
        secret,
        familyScope: String(env.OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_FAMILY_SCOPE
            || 'shared-family'),
        reviewChannel: 'local_private',
        authorizedLocalReviewerIds: [localReviewerId]
    });
    try {
        let result;
        if (args.command === 'prepare') {
            const sealedStateFile = requireOutsideRepository(args.sealedStateFile, {
                mustExist: true
            });
            result = store.prepare({
                sealedState: fs.readFileSync(sealedStateFile, 'utf8').trim()
            });
        } else if (args.command === 'view') {
            const outputPath = requireOutsideRepository(args.output, { extension: '.html' });
            result = store.writeLocalReviewHtml({ localReviewerId, outputPath });
        } else {
            const expectedItemsFile = requireOutsideRepository(args.expectedItemsFile, {
                mustExist: true, extension: '.json'
            });
            result = store.applyLocalDecision({
                localReviewerId,
                groupRef: args.groupRef,
                itemRef: args.itemRef,
                scope: args.scope,
                expectedItemRefs: readExpectedItemRefs(expectedItemsFile),
                resolutionCode: args.resolutionCode
            });
        }
        stdout.write(`${JSON.stringify({
            operation: args.command,
            state: result.state || 'pending',
            pending_count: result.pending_count,
            applied_count: result.applied_count || 0,
            group_count: result.group_count ?? null,
            financial_writes: 0
        })}\n`);
        return 0;
    } finally {
        store.close();
    }
}

if (require.main === module) {
    try {
        process.exitCode = main();
    } catch (error) {
        process.stderr.write(`${JSON.stringify({
            operation: 'historical_local_review',
            outcome: 'NO_GO',
            reason: error.message,
            financial_writes: 0
        })}\n`);
        process.exitCode = 1;
    }
}

module.exports = { main, parseArgs, readExpectedItemRefs, requireOutsideRepository };
