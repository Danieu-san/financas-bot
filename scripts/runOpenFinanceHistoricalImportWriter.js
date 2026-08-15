const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

function argument(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : '';
}

function requiredAbsolutePath(name) {
    const value = argument(name);
    if (!value || !path.isAbsolute(value)) {
        throw new Error(`historical_import_writer_absolute_path_required:${name}`);
    }
    return path.resolve(value);
}

function isInside(parent, candidate) {
    const contains = (root, target) => {
        const relative = path.relative(root, target);
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    };
    const canonicalize = value => {
        let existing = path.resolve(value);
        const missing = [];
        while (!fs.existsSync(existing)) {
            const parentPath = path.dirname(existing);
            if (parentPath === existing) break;
            missing.unshift(path.basename(existing));
            existing = parentPath;
        }
        const real = fs.realpathSync.native
            ? fs.realpathSync.native(existing)
            : fs.realpathSync(existing);
        return path.join(real, ...missing);
    };
    const lexicalParent = path.resolve(parent);
    const lexicalCandidate = path.resolve(candidate);
    return contains(lexicalParent, lexicalCandidate) ||
        contains(canonicalize(lexicalParent), canonicalize(lexicalCandidate));
}

function publicResult(result) {
    const {
        items,
        ...safe
    } = result || {};
    return safe;
}

async function main() {
    const planPath = requiredAbsolutePath('--plan');
    const repositoryRoot = path.resolve(__dirname, '..');
    if (isInside(repositoryRoot, planPath)) {
        throw new Error('historical_import_writer_plan_must_stay_outside_repository');
    }
    const dryRun = process.argv.includes('--dry-run');
    const apply = process.argv.includes('--apply');
    if (dryRun === apply) {
        throw new Error('historical_import_writer_exact_mode_required');
    }
    const moduleRoot = argument('--module-root');
    if (moduleRoot) {
        if (!path.isAbsolute(moduleRoot)) {
            throw new Error('historical_import_writer_module_root_must_be_absolute');
        }
        process.env.NODE_PATH = path.resolve(moduleRoot);
        Module._initPaths();
    }
    const envFile = argument('--env-file');
    if (envFile) {
        if (!path.isAbsolute(envFile)) {
            throw new Error('historical_import_writer_env_file_must_be_absolute');
        }
        require('dotenv').config({ path: path.resolve(envFile), quiet: true });
    } else {
        require('dotenv').config({ quiet: true });
    }
    const ledgerArgument = argument('--ledger-path');
    if (ledgerArgument && !path.isAbsolute(ledgerArgument)) {
        throw new Error('historical_import_writer_ledger_path_must_be_absolute');
    }
    const maxArgument = argument('--max-new-writes');
    const maxNewWrites = maxArgument === ''
        ? Number.POSITIVE_INFINITY
        : Number(maxArgument);
    if (maxArgument !== '' && (!Number.isInteger(maxNewWrites) || maxNewWrites < 0)) {
        throw new Error('historical_import_writer_max_new_writes_invalid');
    }
    if (apply && !process.argv.includes('--confirm-apply')) {
        throw new Error('historical_import_writer_apply_confirmation_required');
    }
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    const {
        executeOpenFinanceHistoricalImportWriteBatch
    } = require('../src/openFinance/openFinanceHistoricalImportWriter');
    const result = await executeOpenFinanceHistoricalImportWriteBatch({
        plan,
        mode: apply ? 'apply' : 'dry-run',
        confirmApply: apply,
        confirmPlanHash: argument('--confirm-plan-hash'),
        confirmPlanFingerprint: argument('--confirm-plan-fingerprint'),
        ledgerPath: ledgerArgument ? path.resolve(ledgerArgument) : undefined,
        maxNewWrites
    });
    process.stdout.write(`${JSON.stringify(publicResult(result))}\n`);
    if (result.status === 'stopped') process.exitCode = 2;
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`${String(error?.message || 'historical_import_writer_failed')}\n`);
        process.exitCode = 1;
    });
}

module.exports = { main, isInside, publicResult };
