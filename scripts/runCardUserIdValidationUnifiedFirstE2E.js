require('dotenv').config();

const { validateUserIdIntegrity, __test__ } = require('../src/services/userIdMaintenanceService');

function sumLegacyCardRows(report = {}) {
    return Object.entries(report.bySheet || {})
        .filter(([sheetName]) => String(sheetName).startsWith('Cart\u00e3o '))
        .reduce((total, [, item]) => total + Number(item?.rows || 0), 0);
}

async function main() {
    const off = await validateUserIdIntegrity({
        env: { ...process.env, CARD_USER_ID_VALIDATION_UNIFIED_FIRST_MODE: 'off' }
    });
    const canary = await validateUserIdIntegrity({
        env: { ...process.env, CARD_USER_ID_VALIDATION_UNIFIED_FIRST_MODE: 'canary' }
    });
    const personal = canary.bySheet?.['Lan\u00e7amentos Cart\u00e3o (pessoal)'] || {
        rows: 0,
        missingUserId: 0
    };
    const configuredMode = __test__.getCardUserIdValidationMode();
    const verdict = canary.cardRoute === 'unified_personal'
        && canary.cardScopes.active > 0
        && canary.cardScopes.available === canary.cardScopes.active
        && personal.rows > 0
        && personal.missingUserId === 0
        ? 'GO'
        : 'NO_GO';

    console.log(JSON.stringify({
        verdict,
        mode: 'read_only',
        configured_mode: configuredMode,
        routes: {
            off: off.cardRoute,
            canary: canary.cardRoute
        },
        scopes: canary.cardScopes,
        evidence: {
            central_legacy_card_rows: sumLegacyCardRows(off),
            personal_unified_card_rows: personal.rows,
            personal_missing_user_id: personal.missingUserId,
            backfill_targets_remain_legacy: __test__.getTrackedSheets()
                .filter(config => config.sheetName.startsWith('Cart\u00e3o ')).length === 4
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
        console.error(JSON.stringify({ verdict: 'NO_GO_SOURCE_UNAVAILABLE', mode: 'read_only', writes: 0 }));
        process.exitCode = 1;
    });
}

module.exports = { sumLegacyCardRows, main };
