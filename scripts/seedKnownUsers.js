require('dotenv').config();

const { authorizeGoogle } = require('../src/services/google');
const { userMap } = require('../src/config/constants');
const { getUserByWhatsAppId, createPendingUser } = require('../src/services/userService');

async function run() {
    await authorizeGoogle();

    const seeded = [];
    const skipped = [];

    for (const [whatsId, displayName] of Object.entries(userMap)) {
        const existing = await getUserByWhatsAppId(whatsId);
        if (existing) {
            skipped.push({ whatsapp_id: whatsId, reason: 'already_exists', user_id: existing.user_id });
            continue;
        }
        const created = await createPendingUser(whatsId, displayName);
        seeded.push({ whatsapp_id: whatsId, user_id: created?.user_id || '' });
    }

    console.log('Seed concluido:', JSON.stringify({ seeded, skipped }, null, 2));
}

run().catch((error) => {
    console.error('Falha ao semear usuarios conhecidos:', error);
    process.exit(1);
});
