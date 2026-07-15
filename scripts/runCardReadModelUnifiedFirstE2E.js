require('dotenv').config();

const { creditCardConfig } = require('../src/config/constants');
const googleService = require('../src/services/google');
const { getAllUsers } = require('../src/services/userService');
const { __test__: readModelTest } = require('../src/services/readModelService');

const cardSheetNames = Object.values(creditCardConfig).map(card => card.sheetName);

function canonicalEntries(result) {
    return readModelTest.buildCanonicalCardEntries({
        unifiedRows: result.unifiedCardRows,
        legacyRowsBySheet: result.legacyRowsBySheet
    });
}

async function loadMode({ userId, mode }) {
    const calls = [];
    googleService.__test__.clearSheetsReadCache();
    const result = await readModelTest.loadCardRowsForReadModel({
        mode,
        contextKey: `user:${userId}`,
        cardSheetNames,
        read: async (range, options) => {
            calls.push(range);
            return googleService.readDataFromSheet(range, options);
        }
    });
    return {
        route: result.route,
        legacyReads: calls.filter(range => !String(range).startsWith('Lan\u00e7amentos Cart\u00e3o!')).length,
        entries: canonicalEntries(result)
    };
}

async function compareScope(user) {
    return googleService.runWithUserSheetContext({
        userId: user.user_id,
        telemetryConsumer: 'read_model_service'
    }, async () => {
        const canary = await loadMode({ userId: user.user_id, mode: 'canary' });
        const off = await loadMode({ userId: user.user_id, mode: 'off' });
        return {
            route: canary.route,
            canaryLegacyReads: canary.legacyReads,
            offLegacyReads: off.legacyReads,
            canonicalRows: canary.entries.length,
            snapshotsEqual: JSON.stringify(canary.entries) === JSON.stringify(off.entries)
        };
    });
}

async function main() {
    const activeUsers = (await getAllUsers()).filter(user => user.status === 'ACTIVE' && !user.deleted_at);
    const results = [];
    let sourceErrors = 0;

    for (const user of activeUsers) {
        try {
            if (!(await googleService.hasUserSpreadsheetContext({ userId: user.user_id }))) continue;
            results.push(await compareScope(user));
        } catch (_) {
            sourceErrors += 1;
        }
    }

    const unifiedFirst = results.filter(result => result.route === 'unified_first');
    const legacyFallback = results.filter(result => result.route === 'legacy_fallback');
    const snapshotsEqual = results.every(result => result.snapshotsEqual);
    const populatedUnifiedSkippedLegacy = unifiedFirst.every(result => result.canaryLegacyReads === 0);
    const rollbackRestoredLegacyReads = results.every(result => result.offLegacyReads === cardSheetNames.length);
    const verdict = results.length > 0
        && unifiedFirst.length > 0
        && sourceErrors === 0
        && snapshotsEqual
        && populatedUnifiedSkippedLegacy
        && rollbackRestoredLegacyReads
        ? 'GO'
        : 'NO_GO';

    console.log(JSON.stringify({
        verdict,
        mode: 'read_only',
        scopes: {
            active: activeUsers.length,
            available: results.length,
            source_errors: sourceErrors,
            unified_first: unifiedFirst.length,
            legacy_fallback: legacyFallback.length
        },
        evidence: {
            canonical_rows: results.reduce((total, result) => total + result.canonicalRows, 0),
            snapshots_equal: snapshotsEqual,
            populated_unified_skipped_legacy: populatedUnifiedSkippedLegacy,
            rollback_restored_legacy_reads: rollbackRestoredLegacyReads
        },
        writes: 0,
        privacy: {
            sanitized_aggregate_only: true,
            user_identifiers_emitted: false,
            financial_values_emitted: false
        }
    }, null, 2));

    if (verdict !== 'GO') process.exitCode = 1;
}

if (require.main === module) {
    main().catch(() => {
        console.error(JSON.stringify({
            verdict: 'NO_GO_SOURCE_UNAVAILABLE',
            mode: 'read_only',
            writes: 0,
            privacy: { sanitized_aggregate_only: true }
        }));
        process.exitCode = 1;
    });
}

module.exports = { canonicalEntries, loadMode, compareScope, main };
