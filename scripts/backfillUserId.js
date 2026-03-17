require('dotenv').config();

const { authorizeGoogle, ensureSpreadsheetStructure } = require('../src/services/google');
const { backfillMissingUserIds, validateUserIdIntegrity } = require('../src/services/userIdMaintenanceService');

async function run() {
    const allowSingleUserFallback = String(process.env.BACKFILL_ALLOW_SINGLE_USER_FALLBACK || 'false').toLowerCase() === 'true';

    await authorizeGoogle();
    await ensureSpreadsheetStructure();

    console.log('Iniciando backfill de user_id...');
    const backfill = await backfillMissingUserIds({ allowSingleUserFallback });
    console.log('Backfill concluido:', JSON.stringify(backfill, null, 2));

    const validation = await validateUserIdIntegrity();
    console.log('Validacao final:', JSON.stringify(validation, null, 2));
}

run().catch((error) => {
    console.error('Falha no backfill de user_id:', error);
    process.exit(1);
});
