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

const INSTALLMENT_IDS = Object.freeze(['SCHEDULE', 'MISSING', 'IDENTITY', 'AMOUNTS', 'SCHEMA',
    'IMMUTABLE', 'BOUNDARY', 'OBSERVATIONS', 'OBS-VERSIONS', 'OBS-LINK', 'GATE']);
const INSTALLMENT_PATHS = Object.freeze([...EXPECTED_PATHS, 'kernel/installmentSchedule.js'].sort());

function sliceContract(slice = 'N02-A') {
    if (!['N02-A', 'N02-B'].includes(slice)) throw new Error('unknown_next02_slice');
    return {
        paths: slice === 'N02-A' ? EXPECTED_PATHS : INSTALLMENT_PATHS,
        properties: [
            ...REQUIRED_IDS.map(id => ({ key: 'NEXT02:' + id, file: 'next02ObservationKernel.test.js' })),
            ...(slice === 'N02-B' ? INSTALLMENT_IDS.map(id =>
                ({ key: 'NEXT02B:' + id, file: 'next02InstallmentSchedule.test.js' })) : [])
        ]
    };
}

function inspectSources(nextRoot, slice = 'N02-A') {
    const expected = sliceContract(slice).paths;
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
    const inventory = prior.validateSourceInventory({ expectedPaths: expected, discoveredEntries: entries });
    if (inventory.errors.length) return { errors: inventory.errors };
    const allowedExternalImports = new Map([
        ['policy/toolBudget.js', new Set(['node:crypto'])],
        ['kernel/canonicalValue.js', new Set(['node:crypto'])],
        ['replay/hermeticReplayRunner.js', new Set(['node:module'])]
    ]);
    const namedExternalBindings = new Map(['policy/toolBudget.js', 'kernel/canonicalValue.js']
        .map(file => [file, new Map([['node:crypto', 'createHash']])]));
    return prior.analyzeNextSourceFiles({
        nextRoot, sourceFiles: expected.map(file => path.join(nextRoot, file)),
        expectedSourcePaths: expected, allowedExternalImports, namedExternalBindings
    });
}

function validatePropertyEvents(events, slice = 'N02-A') {
    const properties = new Map(sliceContract(slice).properties.map(p => [p.key, p.file]));
    const errors = [], approved = new Set(), seen = new Set();
    for (const event of events) {
        if (!['test:pass', 'test:fail'].includes(event.type)) continue;
        const data = event.data || {};
        const match = /^(NEXT02B?:[A-Z0-9-]+) /.exec(data.name || '');
        const id = match?.[1];
        if (event.type !== 'test:pass' || data.skip || data.todo || data.nesting !== 0 ||
            data.details?.type !== 'test' || !String(data.file || '').replaceAll('\\', '/')
                .endsWith('/tests/' + properties.get(id)) ||
            !properties.has(id) || seen.has(id)) {
            errors.push('invalid_property_event:' + (id || 'unknown'));
        } else approved.add(id);
        seen.add(id);
    }
    if (approved.size !== properties.size) errors.push('missing_property');
    return { errors, approvedIds: [...approved].sort() };
}

module.exports = { EXPECTED_PATHS, REQUIRED_IDS, INSTALLMENT_IDS, INSTALLMENT_PATHS,
    sliceContract, inspectSources, validatePropertyEvents };
