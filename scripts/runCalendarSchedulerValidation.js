require('dotenv').config();

const googleService = require('../src/services/google');
const userService = require('../src/services/userService');
const scheduler = require('../src/jobs/scheduler');

function formatSaoPauloDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${byType.day}/${byType.month}/${byType.year}`;
}

function buildFakeNowAtEleven(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return new Date(Date.UTC(Number(byType.year), Number(byType.month) - 1, Number(byType.day), 14, 0, 0));
}

async function run() {
    const lookup = String(process.argv[2] || '').trim();
    const marker = String(process.argv[3] || '').trim();
    if (!lookup) throw new Error('Informe o telefone, WhatsApp ID ou nome exato do usuário de teste.');
    if (!marker.startsWith('TESTE_APAGAR_')) throw new Error('Informe um marcador exato TESTE_APAGAR_.');

    let user = await userService.getUserByLookup(lookup);
    if (!user) {
        const normalizedLookup = lookup.toLocaleLowerCase('pt-BR');
        const matchingUsers = (await userService.getActiveUsers()).filter(candidate => (
            String(candidate.display_name || '').trim().toLocaleLowerCase('pt-BR') === normalizedLookup
        ));
        if (matchingUsers.length > 1) throw new Error('Nome de usuário ambíguo; use um identificador exato.');
        user = matchingUsers[0] || null;
    }
    if (!user?.user_id || !user?.whatsapp_id) throw new Error('Usuário de teste ativo não encontrado.');

    const targetDate = new Date();
    const startDateTime = `${formatSaoPauloDate(targetDate)} 12:00`;
    const sentMessages = [];
    const fakeClient = {
        sendMessage: async (recipient, message) => {
            sentMessages.push({ recipient, message });
        }
    };

    let created = false;
    try {
        await googleService.createCalendarEvent(marker, startDateTime, null, { userId: user.user_id });
        created = true;

        const listedBefore = await googleService.getCalendarEventsForToday(targetDate, { userId: user.user_id });
        const exactBefore = listedBefore.filter(event => event.summary === marker);
        if (exactBefore.length !== 1) {
            throw new Error(`Esperava 1 evento exato antes da limpeza; encontrei ${exactBefore.length}.`);
        }

        scheduler.__test__.notifiedEventIds.clear();
        scheduler.__test__.setClientForTest(fakeClient);
        scheduler.__test__.setNowForTest(buildFakeNowAtEleven(targetDate));
        const originalLog = console.log;
        try {
            console.log = () => {};
            await scheduler.__test__.checkUpcomingEvents();
        } finally {
            console.log = originalLog;
            scheduler.__test__.resetNowForTest();
        }

        const markerMessages = sentMessages.filter(item => (
            item.recipient === user.whatsapp_id &&
            String(item.message || '').includes(marker)
        ));
        if (markerMessages.length !== 1) {
            throw new Error(`Esperava 1 lembrete isolado do scheduler; encontrei ${markerMessages.length}.`);
        }
    } finally {
        if (created) {
            await googleService.deleteTestCalendarEventsByExactSummary(marker, targetDate, { userId: user.user_id });
        }
    }

    const listedAfter = await googleService.getCalendarEventsForToday(targetDate, { userId: user.user_id });
    const exactAfter = listedAfter.filter(event => event.summary === marker);
    const secondCleanup = await googleService.deleteTestCalendarEventsByExactSummary(marker, targetDate, { userId: user.user_id });
    if (exactAfter.length !== 0 || secondCleanup.deletedCount !== 0) {
        throw new Error('A limpeza do Calendar não foi idempotente.');
    }

    console.log(JSON.stringify({
        ok: true,
        createdAndRead: true,
        schedulerReminderIsolated: true,
        cleanupVerified: true,
        secondCleanupDeletedCount: secondCleanup.deletedCount
    }));
}

run().catch(error => {
    console.error(`Calendar/scheduler validation failed: ${error.message}`);
    process.exitCode = 1;
});
