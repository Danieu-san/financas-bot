const fs = require('node:fs');
const path = require('node:path');
const {
    planOpenFinanceHistoricalImport
} = require('../src/openFinance/openFinanceHistoricalImportPlanner');

function argument(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : '';
}

function requiredAbsolutePath(name) {
    const value = argument(name);
    if (!value || !path.isAbsolute(value)) {
        throw new Error(`historical_import_absolute_path_required:${name}`);
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

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
    if (!process.argv.includes('--confirm-read-only') ||
        !process.argv.includes('--confirm-private-output')) {
        throw new Error('historical_import_explicit_confirmation_required');
    }
    const pluggyPath = requiredAbsolutePath('--pluggy-snapshot');
    const sheetPath = requiredAbsolutePath('--sheet-snapshot');
    const configPath = requiredAbsolutePath('--config');
    const outputPath = requiredAbsolutePath('--output');
    const repositoryRoot = path.resolve(__dirname, '..');
    if (isInside(repositoryRoot, outputPath)) {
        throw new Error('historical_import_output_must_stay_outside_repository');
    }
    const config = loadJson(configPath);
    const pluggySnapshot = loadJson(pluggyPath);
    const planned = planOpenFinanceHistoricalImport({
        pluggySnapshot,
        sheetSnapshot: loadJson(sheetPath),
        accountBindings: config.accountBindings,
        merchantRules: config.merchantRules,
        decisionOverrides: config.decisionOverrides,
        historyStartDate: config.historyStartDate,
        historyEndDate: config.historyEndDate
    });
    const result = planned;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600
    });
    process.stdout.write(`${JSON.stringify({
        plan_hash: result.plan_hash,
        plan_status: result.plan_status,
        coverage_complete: result.coverage_complete,
        summary: result.summary,
        financial_writes: result.financial_writes
    })}\n`);
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = { main, isInside };
