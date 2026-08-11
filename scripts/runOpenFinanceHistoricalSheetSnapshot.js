const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const REQUIRED_CATALOG_RANGES = Object.freeze([
    'Users!A:J',
    'Categorias!A:E',
    'Cartões!A:G',
    'Lançamentos Cartão!A:J'
]);

function argument(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : '';
}

function requiredAbsolutePath(name) {
    const value = argument(name);
    if (!value || !path.isAbsolute(value)) {
        throw new Error(`historical_sheet_snapshot_absolute_path_required:${name}`);
    }
    return path.resolve(value);
}

function isInside(parent, candidate) {
    const relative = path.relative(parent, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function collectSnapshot({ existingSnapshot, readDataFromSheet }) {
    const ranges = [...new Set([
        ...Object.keys(existingSnapshot?.ranges || {}),
        ...REQUIRED_CATALOG_RANGES
    ])];
    const collected = {};
    for (const range of ranges) {
        collected[range] = await readDataFromSheet(range, {
            suppressMissingSheetError: true
        });
    }
    return {
        observed_at: new Date().toISOString(),
        source: 'central_legacy_read_only',
        ranges: collected,
        financial_writes: 0
    };
}

async function main() {
    if (!process.argv.includes('--confirm-real-read') ||
        !process.argv.includes('--confirm-private-output')) {
        throw new Error('historical_sheet_snapshot_explicit_confirmation_required');
    }
    const existingPath = requiredAbsolutePath('--existing-snapshot');
    const outputPath = requiredAbsolutePath('--output');
    const moduleRoot = argument('--module-root');
    if (moduleRoot) {
        if (!path.isAbsolute(moduleRoot)) {
            throw new Error('historical_sheet_snapshot_module_root_must_be_absolute');
        }
        process.env.NODE_PATH = path.resolve(moduleRoot);
        Module._initPaths();
    }
    const envFile = argument('--env-file');
    if (envFile) {
        if (!path.isAbsolute(envFile)) {
            throw new Error('historical_sheet_snapshot_env_file_must_be_absolute');
        }
        require('dotenv').config({ path: path.resolve(envFile), quiet: true });
    }
    const repositoryRoot = path.resolve(__dirname, '..');
    if (isInside(repositoryRoot, outputPath)) {
        throw new Error('historical_sheet_snapshot_output_must_stay_outside_repository');
    }
    const { readDataFromSheet } = require('../src/services/google');
    const snapshot = await collectSnapshot({
        existingSnapshot: JSON.parse(fs.readFileSync(existingPath, 'utf8')),
        readDataFromSheet
    });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600
    });
    const counts = Object.fromEntries(Object.entries(snapshot.ranges)
        .map(([range, rows]) => [range, Array.isArray(rows) ? rows.length : 0]));
    process.stdout.write(`${JSON.stringify({
        ranges: counts,
        financial_writes: snapshot.financial_writes
    })}\n`);
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    });
}

module.exports = { collectSnapshot, isInside, REQUIRED_CATALOG_RANGES };
