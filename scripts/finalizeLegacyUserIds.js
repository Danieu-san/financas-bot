require('dotenv').config();

const { authorizeGoogle, batchUpdateRowsInSheet, deleteRowsByIndices } = require('../src/services/google');
const { getUserByWhatsAppId } = require('../src/services/userService');

const DANIEL_WPP = '5521970112407@c.us';
const THAIS_WPP = '5521964270368@c.us';

// Regras finais acordadas:
// - Linhas com referencia explicita a Thaís -> user_id da Thaís
// - Demais ambíguas antigas ("Ambos") -> user_id do Daniel
// - Linha incompleta sem valor util -> remover
const SAIDAS_TO_DANIEL = [44, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 136];
const SAIDAS_TO_THAIS = [135];
const ENTRADAS_TO_DANIEL = [11, 13, 14];
const ENTRADAS_TO_THAIS = [9, 10];
const SAIDAS_DELETE = [121];

async function run() {
    await authorizeGoogle();

    const daniel = await getUserByWhatsAppId(DANIEL_WPP);
    const thais = await getUserByWhatsAppId(THAIS_WPP);

    if (!daniel?.user_id || !thais?.user_id) {
        throw new Error('Usuarios Daniel/Thais nao encontrados na aba Users.');
    }

    const updates = [];

    SAIDAS_TO_DANIEL.forEach((row) => {
        updates.push({ range: `Saídas!J${row}`, values: [[daniel.user_id]] });
    });
    SAIDAS_TO_THAIS.forEach((row) => {
        updates.push({ range: `Saídas!J${row}`, values: [[thais.user_id]] });
    });
    ENTRADAS_TO_DANIEL.forEach((row) => {
        updates.push({ range: `Entradas!I${row}`, values: [[daniel.user_id]] });
    });
    ENTRADAS_TO_THAIS.forEach((row) => {
        updates.push({ range: `Entradas!I${row}`, values: [[thais.user_id]] });
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
