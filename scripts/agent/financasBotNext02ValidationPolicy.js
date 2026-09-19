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
const BILLING_IDS = Object.freeze(['LENSES', 'COVERAGE', 'ASOF', 'REFUND', 'MISSING', 'VERSIONS',
    'SCOPE', 'NEUTRAL', 'OPTIN', 'TOOL', 'ANCESTRY', 'SCHEMA', 'GATE']);
const SUBCATEGORY_IDS = Object.freeze(['TOTAL', 'CATALOG', 'BINDING', 'UNKNOWN', 'REFUND',
    'INSTALLMENT', 'PROVENANCE', 'VERSIONS', 'SCOPE', 'OPTIN', 'TOOL', 'NEUTRAL', 'GATE']);
const GOLDEN_IDS = Object.freeze(['BASELINE', 'CASES', 'REFUSALS', 'REFERENCES', 'MUTATIONS', 'TRACEABILITY', 'GATE']);

// Explicit development inventory, NOT reviewed-source admission. These files
// remain outside the historical slice and cannot be imported by its sources.
// Adding a file requires an intentional inventory change; never discover the
// expected set from the candidate tree or generate reviewed hashes from it.
const PENDING_PROVENANCE_PATHS = Object.freeze([
    'artifactLoader.js', 'authoringIR.js', 'causalRecorder.js', 'civilCalendar.js',
    'claimContext.js', 'claimRequirements.js', 'collectionRequirements.js',
    'executionProfile.js', 'graphCompiler.js', 'graphStructure.js',
    'instrumentedAccess.js', 'literalTypes.js', 'metricDirectReads.js',
    'metricEffects.js', 'metricInstallments.js', 'metricSelection.js',
    'obligationBindings.js', 'observationContract.js', 'operandBindings.js',
    'operatorTypes.js', 'packageContract.js', 'pinnedCivilTimezone.js',
    'predicateTypes.js', 'proofAcceptance.js', 'proofOperators.js',
    'scalarProofOperators.js', 'schemaRegistryProjection.js',
    'selectionBindings.js', 'templateReferences.js'
].map(file => 'provenance/' + file).sort());

function sliceContract(slice = 'N02-A') {
    if (!['N02-A', 'N02-B', 'N02-C', 'N02-D', 'N02-E'].includes(slice)) throw new Error('unknown_next02_slice');
    return {
        paths: slice === 'N02-A' ? EXPECTED_PATHS : INSTALLMENT_PATHS,
        properties: [
            ...REQUIRED_IDS.map(id => ({ key: 'NEXT02:' + id, file: 'next02ObservationKernel.test.js' })),
            ...(slice !== 'N02-A' ? INSTALLMENT_IDS.map(id =>
                ({ key: 'NEXT02B:' + id, file: 'next02InstallmentSchedule.test.js' })) : []),
            ...(['N02-C', 'N02-D', 'N02-E'].includes(slice) ? BILLING_IDS.map(id =>
                ({ key: 'NEXT02C:' + id, file: 'next02BillingReadModel.test.js' })) : []),
            ...(['N02-D', 'N02-E'].includes(slice) ? SUBCATEGORY_IDS.map(id =>
                ({ key: 'NEXT02D:' + id, file: 'next02Subcategories.test.js' })) : []),
            ...(slice === 'N02-E' ? GOLDEN_IDS.map(id =>
                ({ key: 'NEXT02E:' + id, file: 'next02GoldenExpenses.test.js' })) : [])
        ]
    };
}

function sourceEntries(nextRoot) {
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
    return entries;
}

function inspectSources(nextRoot, slice = 'N02-A') {
    const expected = sliceContract(slice).paths;
    const inventory = prior.validateSourceInventory({ expectedPaths: expected, discoveredEntries: sourceEntries(nextRoot) });
    if (inventory.errors.length) return { errors: inventory.errors };
    return analyzeReviewedSlice(nextRoot, expected);
}

function inspectDevelopmentSources(nextRoot, slice = 'N02-A') {
    const reviewed = sliceContract(slice).paths;
    const inventory = prior.validateSourceInventory({
        expectedPaths: [...reviewed, ...PENDING_PROVENANCE_PATHS],
        discoveredEntries: sourceEntries(nextRoot)
    });
    const result = inventory.errors.length ? { errors: inventory.errors }
        : analyzeReviewedSlice(nextRoot, reviewed);
    return { ...result, scope: 'development-regression', releaseEligible: false,
        pendingReviewPaths: [...PENDING_PROVENANCE_PATHS] };
}

function analyzeReviewedSlice(nextRoot, expected) {
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
        const match = /^(NEXT02[BCDE]?:[A-Z0-9-]+) /.exec(data.name || '');
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

module.exports = { EXPECTED_PATHS, REQUIRED_IDS, INSTALLMENT_IDS, INSTALLMENT_PATHS, BILLING_IDS, SUBCATEGORY_IDS, GOLDEN_IDS,
    sliceContract, inspectSources, inspectDevelopmentSources, validatePropertyEvents };
