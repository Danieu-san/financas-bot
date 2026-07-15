require('dotenv').config();

const { creditCardConfig } = require('../src/config/constants');
const googleService = require('../src/services/google');
const { getAllUsers } = require('../src/services/userService');
const {
    buildCardSheetParityReport,
    assessPersonalLegacyProjection,
    summarizePersonalUnifiedScopes,
    buildCardMigrationAssessment
} = require('../src/cards/cardSheetParityReport');

async function main() {
    const readOptions = {
        forceCentral: true,
        suppressMissingSheetError: true,
        telemetryConsumer: 'card_parity_audit'
    };
    const cards = Object.values(creditCardConfig);
    const [unifiedRows, ...legacyRows] = await Promise.all([
        googleService.readDataFromSheet('Lançamentos Cartão!A:J', readOptions),
        ...cards.map(card => googleService.readDataFromSheet(`${card.sheetName}!A:G`, readOptions))
    ]);
    const central = buildCardSheetParityReport({
        unifiedRows,
        legacySheets: cards.map((card, index) => ({
            sheetName: card.sheetName,
            rows: legacyRows[index]
        }))
    });
    const activeUsers = (await getAllUsers()).filter(user => user.status === 'ACTIVE' && !user.deleted_at);
    const personalScopes = [];
    let sourceErrors = 0;
    for (const user of activeUsers) {
        try {
            if (!(await googleService.hasUserSpreadsheetContext({ userId: user.user_id }))) continue;
            personalScopes.push(await googleService.readDataFromSheet('Lançamentos Cartão!A:J', {
                userId: user.user_id,
                suppressMissingSheetError: true,
                telemetryConsumer: 'card_parity_audit'
            }));
        } catch (_) {
            sourceErrors += 1;
        }
    }
    const personal = summarizePersonalUnifiedScopes(personalScopes);
    personal.active_scopes = activeUsers.length;
    personal.unavailable_scopes = Math.max(activeUsers.length - personal.available_scopes, 0);
    const projection = assessPersonalLegacyProjection(
        googleService.__test__.mapValuesFromUserSpreadsheetRange
    );
    const report = buildCardMigrationAssessment({ central, personal, projection, sourceErrors });
    console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
    main().catch(() => {
        console.error(JSON.stringify({ verdict: 'NO_GO_SOURCE_UNAVAILABLE', mode: 'read_only', writes: 0 }));
        process.exitCode = 1;
    });
}

module.exports = { main };
