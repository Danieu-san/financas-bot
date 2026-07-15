require('dotenv').config();

const { creditCardConfig } = require('../src/config/constants');
const googleService = require('../src/services/google');
const { getAllUsers } = require('../src/services/userService');
const { __test__: schedulerTest } = require('../src/jobs/scheduler');

const cardSheetNames = Object.values(creditCardConfig).map(card => card.sheetName);

async function inspectPersonalScope(user) {
    const calls = [];
    googleService.__test__.clearSheetsReadCache();
    const loaded = await schedulerTest.loadSchedulerScopedCardEntries({
        userId: user.user_id,
        mode: 'canary',
        read: async (range, options) => {
            calls.push(range);
            return googleService.readDataFromSheet(range, options);
        }
    });
    return {
        route: loaded.route,
        canonicalRows: loaded.entries.length,
        unifiedReads: calls.filter(range => String(range).startsWith('Lan\u00e7amentos Cart\u00e3o!')).length,
        legacyReads: calls.filter(range => !String(range).startsWith('Lan\u00e7amentos Cart\u00e3o!')).length
    };
}

async function inspectCentralRollback() {
    googleService.__test__.clearSheetsReadCache();
    const rows = await Promise.all(cardSheetNames.map(sheetName => googleService.readDataFromSheet(
        `${sheetName}!A:G`,
        { forceCentral: true, telemetryConsumer: 'scheduler' }
    )));
    return {
        reads: rows.length,
        dataRows: rows.reduce((total, sheetRows) => total + Math.max((sheetRows || []).length - 1, 0), 0)
    };
}

async function main() {
    const activeUsers = (await getAllUsers()).filter(user => user.status === 'ACTIVE' && !user.deleted_at);
    const results = [];
    let sourceErrors = 0;

    for (const user of activeUsers) {
        try {
            if (!(await googleService.hasUserSpreadsheetContext({ userId: user.user_id }))) continue;
            results.push(await inspectPersonalScope(user));
        } catch (_) {
            sourceErrors += 1;
        }
    }

    let centralRollback = { reads: 0, dataRows: 0 };
    try {
        centralRollback = await inspectCentralRollback();
    } catch (_) {
        sourceErrors += 1;
    }

    const unifiedFirst = results.filter(result => result.route === 'unified_first');
    const legacyFallback = results.filter(result => result.route === 'legacy_fallback');
    const populatedSkippedLegacy = unifiedFirst.every(result => result.unifiedReads === 1 && result.legacyReads === 0);
    const fallbackComplete = legacyFallback.every(result => result.unifiedReads === 1 && result.legacyReads === cardSheetNames.length);
    const rollbackComplete = centralRollback.reads === cardSheetNames.length;
    const verdict = results.length > 0
        && unifiedFirst.length > 0
        && sourceErrors === 0
        && populatedSkippedLegacy
        && fallbackComplete
        && rollbackComplete
        ? 'GO'
        : 'NO_GO';

    console.log(JSON.stringify({
        verdict,
        mode: 'read_only',
        configured_mode: schedulerTest.getCardSchedulerRouteMode(),
        scopes: {
            active: activeUsers.length,
            available: results.length,
            source_errors: sourceErrors,
            unified_first: unifiedFirst.length,
            legacy_fallback: legacyFallback.length
        },
        evidence: {
            personal_canonical_rows: results.reduce((total, result) => total + result.canonicalRows, 0),
            populated_unified_skipped_legacy: populatedSkippedLegacy,
            fallback_read_all_legacy_routes: fallbackComplete,
            rollback_central_legacy_reads: centralRollback.reads,
            rollback_central_data_rows: centralRollback.dataRows
        },
        messages_sent: 0,
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
            messages_sent: 0,
            writes: 0
        }));
        process.exitCode = 1;
    });
}

module.exports = { inspectPersonalScope, inspectCentralRollback, main };
