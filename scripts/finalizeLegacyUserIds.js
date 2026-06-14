require('dotenv').config();

const { authorizeGoogle, batchUpdateRowsInSheet, deleteRowsByIndices } = require('../src/services/google');
const { getUserByWhatsAppId } = require('../src/services/userService');

function requireWhatsAppId(envName) {
    const value = String(process.env[envName] || '').trim();
    if (!value) {
        throw new Error(`Defina ${envName} antes de rodar este script legado.`);
    }
    return value.endsWith('@c.us') || value.endsWith('@lid') ? value : `${value.replace(/\D/g, '')}@c.us`;
}

// Regras finais acordadas:
// - Linhas com referencia explicita ao parceiro -> user_id do parceiro
// - Demais ambiguas antigas ("Ambos") -> user_id do dono
// - Linha incompleta sem valor util -> remover
const SAIDAS_TO_OWNER = [44, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 136];
const SAIDAS_TO_PARTNER = [135];
const ENTRADAS_TO_OWNER = [11, 13, 14];
const ENTRADAS_TO_PARTNER = [9, 10];
const SAIDAS_DELETE = [121];

async function run() {
    await authorizeGoogle();

    const ownerWpp = requireWhatsAppId('LEGACY_OWNER_WPP');
    const partnerWpp = requireWhatsAppId('LEGACY_PARTNER_WPP');

    const owner = await getUserByWhatsAppId(ownerWpp);
    const partner = await getUserByWhatsAppId(partnerWpp);

    if (!owner?.user_id || !partner?.user_id) {
        throw new Error('Usuarios legados nao encontrados na aba Users.');
    }

    const updates = [];

    SAIDAS_TO_OWNER.forEach((row) => {
        updates.push({ range: `Saídas!J${row}`, values: [[owner.user_id]] });
    });
    SAIDAS_TO_PARTNER.forEach((row) => {
        updates.push({ range: `Saídas!J${row}`, values: [[partner.user_id]] });
    });
    ENTRADAS_TO_OWNER.forEach((row) => {
        updates.push({ range: `Entradas!I${row}`, values: [[owner.user_id]] });
    });
    ENTRADAS_TO_PARTNER.forEach((row) => {
        updates.push({ range: `Entradas!I${row}`, values: [[partner.user_id]] });
    });

    await batchUpdateRowsInSheet(updates);
    await deleteRowsByIndices('Saídas', SAIDAS_DELETE.map((n) => n - 1));

    console.log('Finalizacao de user_id legado concluida.', JSON.stringify({
        updated: updates.length,
        deletedRows: SAIDAS_DELETE
    }, null, 2));
}

run().catch((error) => {
    console.error('Falha ao finalizar user_id legado:', error);
    process.exit(1);
});
