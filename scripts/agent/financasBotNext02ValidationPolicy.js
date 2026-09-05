'use strict';

const fs = require('node:fs');
const path = require('node:path');
const prior = require('./financasBotNext01ValidationPolicy');

const EXPECTED_PATHS = Object.freeze([...prior.EXPECTED_NEXT_SOURCE_PATHS,
    'kernel/canonicalValue.js', 'kernel/observationKernel.js', 'kernel/expenseReadModel.js'
].sort());
const REQUIRED_IDS = Object.freeze([
    'DA-01', 'DA-02', 'DA-06', 'OBS-VERSION', 'OBS-CONFLICT', 'OBS-INTEGRITY',
    'OBS-BOUNDARY', 'OBS-SCOPE', 'DA-04', 'DA-05', 'REFUND', 'OBS-IMMUTABLE',
    'OBS-UNSUPPORTED', 'DA-03', 'VALUE-ZERO-EMPTY', 'QUERY-FILTERS', 'OVERFLOW',
    'TOOL', 'ADVERSARIAL', 'GATE'
]);

function inspectSources(nextRoot) {
    const entries = [];
    function walk(directory) {
        for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
            const file = path.join(directory, item.name);
            if (item.isDirectory()) walk(file);
            else entries.push({ path: path.relative(nextRoot, file).replaceAll('\\', '/'),
                type: item.isFile() ? 'file' : 'other' });
        }
    }
    walk(nextRoot);
    const inventory = prior.validateSourceInventory({ expectedPaths: EXPECTED_PATHS, discoveredEntries: entries });
    if (inventory.errors.length) return { errors: inventory.errors };
    const allowedExternalImports = new Map([
        ['policy/toolBudget.js', new Set(['node:crypto'])],
        ['kernel/canonicalValue.js', new Set(['node:crypto'])],
        ['replay/hermeticReplayRunner.js', new Set(['node:module'])]
    ]);
    const namedExternalBindings = new Map(['policy/toolBudget.js', 'kernel/canonicalValue.js']
        .map(file => [file, new Map([['node:crypto', 'createHash']])]));
    return prior.analyzeNextSourceFiles({
        nextRoot, sourceFiles: EXPECTED_PATHS.map(file => path.join(nextRoot, file)),
        expectedSourcePaths: EXPECTED_PATHS, allowedExternalImports, namedExternalBindings
    });
}

function validatePropertyEvents(events) {
    const errors = [], approved = new Set(), seen = new Set();
    for (const event of events) {
        if (!['test:pass', 'test:fail'].includes(event.type)) continue;
        const data = event.data || {};
        const match = /^NEXT02:([A-Z0-9-]+) /.exec(data.name || '');
        const id = match?.[1];
        if (event.type !== 'test:pass' || data.skip || data.todo || data.nesting !== 0 ||
            data.details?.type !== 'test' || !String(data.file || '').replaceAll('\\', '/')
                .endsWith('/tests/next02ObservationKernel.test.js') ||
            !REQUIRED_IDS.includes(id) || seen.has(id)) {
            errors.push('invalid_property_event:' + (id || 'unknown'));
        } else approved.add(id);
        seen.add(id);
    }
    if (approved.size !== REQUIRED_IDS.length) errors.push('missing_property');
    return { errors, approvedIds: [...approved].sort() };
}

module.exports = { EXPECTED_PATHS, REQUIRED_IDS, inspectSources, validatePropertyEvents };
