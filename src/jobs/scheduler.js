const cron = require('node-cron');
const { readDataFromSheet, getCalendarEventsForToday } = require('../services/google');
const { expireOldPendingUsers, getActiveUsers, getUserSettingsByUserId } = require('../services/userService');
const { parseSheetDate, normalizeText, getFormattedDateOnly, parseValue } = require('../utils/helpers');
const { creditCardConfig, getAdminIds } = require('../config/constants');
const {
    syncReadModelIfNeeded,
    getReadModelStats,
    buildCanonicalCardEntries,
    loadCardRowsForReadModel
} = require('../services/readModelService');
const logger = require('../utils/logger');
const metrics = require('../utils/metrics');
const { buildNextRecurringDueDate, isRecurringDueOnDate } = require('../utils/recurringDueDate');
const { sendInterpretationReadinessAlert } = require('../reliability/enforceReadinessNotifier');
const { sendDailyOpsCheckReport } = require('../services/dailyOpsCheckService');
const { recordLegacyUsageHeartbeat } = require('../telemetry/legacyUsageTelemetry');
const { retryPendingGoogleRevocations } = require('../services/googleOAuthRevocationService');
const { retryPendingSharedMembershipRevocations } = require('../services/googleSharedMembershipRevocationService');
const { recoverPendingGoogleOAuthCompensations } = require('../services/googleOAuthService');
const { expireOAuthConnectionAttempts } = require('../services/oauthTokenStore');

let client;
let isInitialized = false;
const notifiedEventIds = new Set();
const SCHEDULE_TIME_ZONE = 'America/Sao_Paulo';
let nowProvider = () => new Date();

function getNow() {
    return nowProvider();
}

function getDatePartsInTimeZone(date = new Date(), timeZone = SCHEDULE_TIME_ZONE) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return {
        year: Number.parseInt(byType.year, 10),
        month: Number.parseInt(byType.month, 10),
        day: Number.parseInt(byType.day, 10)
    };
}

function buildUtcNoonDate({ year, month, day }) {
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

function addDaysForSchedule(date = new Date(), days = 0) {
    const localDate = buildUtcNoonDate(getDatePartsInTimeZone(date));
    localDate.setUTCDate(localDate.getUTCDate() + days);
    return localDate;
}

function formatScheduleDate(date) {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: SCHEDULE_TIME_ZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(date);
}

function formatScheduleTime(date) {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: SCHEDULE_TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(date);
}

function isSyntheticTestWhatsAppId(whatsappId) {
    return /^559999\d+@(?:c\.us|lid)$/.test(String(whatsappId || '').trim());
}

function shouldSendScheduledMessageToUser(user = {}) {
    const whatsappId = String(user.whatsapp_id || '').trim();
    if (!whatsappId) return false;
    if (process.env.NODE_ENV !== 'test' && isSyntheticTestWhatsAppId(whatsappId)) {
        return false;
    }
    return true;
}

async function getScheduledActiveUsers() {
    const users = await getActiveUsers();
    return users.filter(shouldSendScheduledMessageToUser);
}

function isSameCalendarDay(dateA, dateB) {
    return Boolean(
        dateA &&
        dateB &&
        dateA.getFullYear() === dateB.getFullYear() &&
        dateA.getMonth() === dateB.getMonth() &&
        dateA.getDate() === dateB.getDate()
    );
}

function rowBelongsToScheduledUser(row, userIdIndex, userId, fallbackUserId = '') {
    const rowUserId = String(row[userIdIndex] || '').trim();
    if (rowUserId) return rowUserId === userId;
    return Boolean(fallbackUserId && fallbackUserId === userId);
}

function findHeaderIndex(headers = [], aliases = [], fallbackIndex = -1) {
    const normalizedAliases = aliases.map(alias => normalizeText(alias));
    const found = headers.findIndex(header => normalizedAliases.includes(normalizeText(header)));
    return found >= 0 ? found : fallbackIndex;
}

function collectPaymentsDueOnDate({ debtsData = [], billsData = [], targetDate, userId, singleUserIdFallback = '' } = {}) {
    const payments = [];
    const safeUserId = String(userId || '').trim();
    if (!safeUserId || !targetDate) return payments;

    if (debtsData && debtsData.length > 1) {
        for (let i = 1; i < debtsData.length; i++) {
            const row = debtsData[i];
            if (!rowBelongsToScheduledUser(row, 17, safeUserId, singleUserIdFallback)) continue;

            const nomeDivida = row[0];
            const valorParcela = row[5];
            const proximoVencimento = parseSheetDate(row[14]);
            if (!nomeDivida || !proximoVencimento || !isSameCalendarDay(proximoVencimento, targetDate)) continue;

            payments.push({ type: 'Dívida', name: nomeDivida, amount: valorParcela });
        }
    }

    if (billsData && billsData.length > 1) {
        const headers = billsData[0] || [];
        const nameIndex = findHeaderIndex(headers, ['Nome da Conta', 'Nome'], 0);
        const dueDayIndex = findHeaderIndex(headers, ['Dia do Vencimento', 'Vencimento', 'Dia'], 1);
        const userIdIndex = findHeaderIndex(headers, ['user_id', 'user id'], 3);
        const expectedIndex = findHeaderIndex(headers, ['Valor Esperado', 'Valor'], -1);
        for (let i = 1; i < billsData.length; i++) {
            const row = billsData[i];
            if (!rowBelongsToScheduledUser(row, userIdIndex, safeUserId, singleUserIdFallback)) continue;

            const nomeConta = row[nameIndex];
            const diaVencimento = Number.parseInt(row[dueDayIndex], 10);
            if (!nomeConta || Number.isNaN(diaVencimento) || !isRecurringDueOnDate(diaVencimento, targetDate)) continue;

            payments.push({ type: 'Conta', name: nomeConta, amount: expectedIndex >= 0 ? row[expectedIndex] || '' : '' });
        }
    }

    return payments;
}

async function getRecipientIds({ weeklyOptIn = null, monthlyOptIn = null } = {}) {
    const users = await getScheduledActiveUsers();
    const recipients = [];

    for (const user of users) {
        const settings = await getUserSettingsByUserId(user.user_id);
        if (weeklyOptIn !== null) {
            const isOn = normalizeText(settings?.weekly_checkin_opt_in || 'nao') === 'sim';
            if (weeklyOptIn !== isOn) continue;
        }
        if (monthlyOptIn !== null) {
            const isOn = normalizeText(settings?.monthly_report_opt_in || 'sim') === 'sim';
            if (monthlyOptIn !== isOn) continue;
        }
        recipients.push(user.whatsapp_id);
    }

    return recipients;
}

async function checkUpcomingEvents() {
    try {
        const agora = getNow();
        const users = await getScheduledActiveUsers();

        for (const user of users) {
            const eventos = await getCalendarEventsForToday(undefined, { userId: user.user_id });
            for (const evento of eventos) {
                const notificationKey = `${user.user_id}:${evento.id}`;
                if (!evento.start?.dateTime || notifiedEventIds.has(notificationKey)) continue;

                const horaInicio = new Date(evento.start.dateTime);
                const diffMinutes = Math.round((horaInicio.getTime() - agora.getTime()) / (1000 * 60));

                if (diffMinutes >= 55 && diffMinutes <= 70) {
                    const message =
                        `Lembrete de Agenda 🔔: Seu compromisso "*${evento.summary}*" começa em aproximadamente 1 hora, ` +
                        `às ${formatScheduleTime(horaInicio)}.`;

                    await client.sendMessage(user.whatsapp_id, message);

                    notifiedEventIds.add(notificationKey);
                    logger.info(`[scheduler] event_reminder_sent user_id=${user.user_id}`);
                }
            }
        }
    } catch (error) {
        logger.error(`Erro ao verificar eventos da agenda: ${error.message}`);
    }
}

async function checkUpcomingBills() {
    console.log('Verificando contas pendentes...');
    try {
        const contasData = await readDataFromSheet('Contas!A:I');
        if (!contasData || contasData.length <= 1) return;

        const saidasData = await readDataFromSheet('Saídas!A:J');
        const users = await getScheduledActiveUsers();
        if (!users.length) return;

        const hoje = addDaysForSchedule(getNow(), 0);
        const anoAtual = hoje.getUTCFullYear();
        const mesAtual = hoje.getUTCMonth();

        const contasRows = contasData.slice(1);
        const contasHeaders = contasData[0] || [];
        const contaNameIndex = findHeaderIndex(contasHeaders, ['Nome da Conta', 'Nome'], 0);
        const contaFriendlyNameIndex = findHeaderIndex(contasHeaders, ['Nome Amigável', 'Nome Amigavel'], 4);
        const contaDueDayIndex = findHeaderIndex(contasHeaders, ['Dia do Vencimento', 'Vencimento', 'Dia'], 1);
        const contaUserIdIndex = findHeaderIndex(contasHeaders, ['user_id', 'user id'], 3);
        const saidasRows = saidasData.slice(1);
        const singleUserIdFallback = users.length === 1 ? String(users[0].user_id || '').trim() : '';

        for (const user of users) {
            const userId = String(user.user_id || '').trim();
            if (!userId) continue;

            const saidasDoMesUsuario = saidasRows
                .filter(row => String(row[9] || '').trim() === userId)
                .filter(row => {
                    const dataSaida = parseSheetDate(row[0]);
                    return dataSaida && dataSaida.getFullYear() === anoAtual && dataSaida.getMonth() === mesAtual;
                })
                .map(row => normalizeText(row[1]));

            const contasDoUsuario = contasRows.filter(row => {
                const contaUserId = String(row[contaUserIdIndex] || '').trim();
                if (contaUserId) return contaUserId === userId;
                return singleUserIdFallback && singleUserIdFallback === userId;
            });

            for (const row of contasDoUsuario) {
                const nomeConta = row[contaNameIndex];
                const nomeAmigavel = row[contaFriendlyNameIndex] || '';
                const diaVencimento = parseInt(row[contaDueDayIndex], 10);
                if (!nomeConta || isNaN(diaVencimento)) continue;

                const nomeContaNormalizado = normalizeText(nomeConta);
                const nomeAmigavelNormalizado = normalizeText(nomeAmigavel);
                const jaFoiRegistrada = saidasDoMesUsuario.some(d =>
                    d.includes(nomeContaNormalizado) ||
                    (nomeAmigavelNormalizado && d.includes(nomeAmigavelNormalizado))
                );
                if (jaFoiRegistrada) continue;

                const dataVencimento = buildNextRecurringDueDate(diaVencimento, hoje);
                if (!dataVencimento) continue;
                const diffDays = Math.round((dataVencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
                const diaRealVencimento = dataVencimento.getDate();

                let message = '';
                if (diffDays === 5) message = `Lembrete! 💡 A conta de *${nomeConta}* vence em 5 dias (no dia ${diaRealVencimento}).`;
                if (diffDays === 1) message = `Atenção! ⚠️ A conta de *${nomeConta}* vence amanhã!`;
                if (diffDays === 0) message = `URGENTE! 🚨 A conta de *${nomeConta}* VENCE HOJE!`;
                if (!message) continue;

                await client.sendMessage(user.whatsapp_id, message);
            }
        }
    } catch (error) {
        logger.error(`Erro ao verificar contas a vencer: ${error.message}`);
    }
}

async function sendMorningSummary() {
    try {
        const dividasData = await readDataFromSheet('Dívidas!A:R');
        const users = await getScheduledActiveUsers();
        if (users.length === 0) {
            logger.warn('[scheduler] resumo matinal ignorado: nenhum usuário ativo agendável.');
            return;
        }

        const hoje = addDaysForSchedule(getNow(), 0);

        for (const user of users) {
            const userId = String(user.user_id || '').trim();
            if (!userId) continue;

            const contasProximas = [];
            if (dividasData && dividasData.length > 1) {
                for (let i = 1; i < dividasData.length; i++) {
                    const row = dividasData[i];
                    if (String(row[17] || '').trim() !== userId) continue;

                    const nomeDivida = row[0];
                    const valorParcela = row[5];
                    const proximoVencimentoStr = row[14];
                    const dataVencimento = parseSheetDate(proximoVencimentoStr);
                    if (!nomeDivida || !valorParcela || !dataVencimento) continue;
                    const diffDays = Math.ceil((dataVencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays >= 0 && diffDays <= 7) {
                        contasProximas.push({ nome: nomeDivida, valor: valorParcela, dias: diffDays });
                    }
                }
            }

            let message = `Bom dia! ☀️ Aqui está seu resumo de hoje, ${formatScheduleDate(hoje)}:\n`;

            message += '\n*Financeiro (Próximos 7 dias):*\n';
            if (contasProximas.length === 0) {
                message += '✅ Nenhuma parcela de dívida com vencimento próximo.\n';
            } else {
                message += `🚨 *Atenção! Você tem ${contasProximas.length} parcela(s) vencendo:*\n`;
                contasProximas.sort((a, b) => a.dias - b.dias);
                contasProximas.forEach(conta => {
                    let texto = `em ${conta.dias} dias`;
                    if (conta.dias === 0) texto = 'VENCE HOJE!';
                    if (conta.dias === 1) texto = 'amanhã!';
                    message += ` - *${conta.nome}* (${texto}) - R$${conta.valor}\n`;
                });
            }

            const eventosDeHoje = await getCalendarEventsForToday(hoje, { userId });

            message += '\n*Agenda de Hoje:*\n';
            if (eventosDeHoje.length === 0) {
                message += '📅 Nenhum compromisso na agenda para hoje.\n';
            } else {
                eventosDeHoje.forEach(evento => {
                    let horario = 'Dia inteiro';
                    if (evento.start?.dateTime) {
                        horario = formatScheduleTime(new Date(evento.start.dateTime));
                    }
                    message += ` - *${horario}* - ${evento.summary}\n`;
                });
            }

            await client.sendMessage(user.whatsapp_id, message);
            logger.info(`[scheduler] resumo matinal enviado user_id=${userId}`);
        }
    } catch (error) {
        logger.error(`Erro ao enviar resumo matinal: ${error.message}`);
    }
}

async function sendEveningSummary() {
    try {
        const amanha = addDaysForSchedule(getNow(), 1);
        const amanhaStr = formatScheduleDate(amanha);
        const users = await getScheduledActiveUsers();
        if (users.length === 0) {
            logger.warn('[scheduler] resumo noturno ignorado: nenhum usuário ativo agendável.');
            return;
        }
        const singleUserIdFallback = users.length === 1 ? String(users[0].user_id || '').trim() : '';

        for (const user of users) {
            const userId = String(user.user_id || '').trim();
            if (!userId) continue;
            const [eventosDeAmanha, dividasData, contasData] = await Promise.all([
                getCalendarEventsForToday(amanha, { userId }),
                readDataFromSheet('Dívidas!A:R', { userId }),
                readDataFromSheet('Contas!A:I', { userId })
            ]);
            const pagamentosDeAmanha = collectPaymentsDueOnDate({
                debtsData: dividasData,
                billsData: contasData,
                targetDate: amanha,
                userId,
                singleUserIdFallback
            });

            let message = `Boa noite! 🌙 Aqui está seu resumo para amanhã, ${amanhaStr}:\n`;

            message += '\n*Agenda de Amanhã:*\n';
            if (eventosDeAmanha.length === 0) {
                message += '📅 Nenhum compromisso agendado para amanhã. Aproveite!\n';
            } else {
                eventosDeAmanha.forEach(evento => {
                    let horario = 'Dia inteiro';
                    if (evento.start?.dateTime) {
                        horario = formatScheduleTime(new Date(evento.start.dateTime));
                    }
                    message += ` - *${horario}* - ${evento.summary}\n`;
                });
            }

            message += '\n*Pagamentos de Amanhã:*\n';
            if (pagamentosDeAmanha.length === 0) {
                message += '✅ Nenhum pagamento ou vencimento cadastrado para amanhã.\n';
            } else {
                pagamentosDeAmanha.forEach(item => {
                    const amount = item.amount ? ` - R$${item.amount}` : '';
                    message += ` - *${item.type}:* ${item.name}${amount}\n`;
                });
            }

            await client.sendMessage(user.whatsapp_id, message);
            logger.info(`[scheduler] resumo noturno enviado user_id=${userId}`);
        }
    } catch (error) {
        logger.error(`Erro ao enviar resumo noturno: ${error.message}`);
    }
}

async function sendWeeklyCheckIn() {
    try {
        const recipients = await getRecipientIds({ weeklyOptIn: true });
        if (recipients.length === 0) return;
        const question = 'Check-in da semana: você quer focar em *reserva* ou *quitar dívida* nesta semana?';
        for (const id of recipients) {
            await client.sendMessage(id, question);
        }
    } catch (error) {
        logger.error(`Erro ao enviar check-in semanal: ${error.message}`);
    }
}

function belongsToUser(row, userIdIndex, userId) {
    return String(row[userIdIndex] || '').trim() === String(userId);
}

function getCardSchedulerRouteMode(env = process.env) {
    const mode = String(env.CARD_SCHEDULER_UNIFIED_FIRST_MODE || 'off').trim().toLowerCase();
    return ['off', 'canary', 'on'].includes(mode) ? mode : 'off';
}

function shouldUseSchedulerCardUnifiedFirst({ mode = getCardSchedulerRouteMode(), userId = '' } = {}) {
    if (mode === 'on') return true;
    return mode === 'canary' && Boolean(String(userId || '').trim());
}

async function loadSchedulerScopedCardEntries({
    userId,
    read = readDataFromSheet,
    mode = getCardSchedulerRouteMode()
} = {}) {
    const safeUserId = String(userId || '').trim();
    if (!safeUserId || !shouldUseSchedulerCardUnifiedFirst({ mode, userId: safeUserId })) {
        return { route: 'legacy_central', entries: [] };
    }

    const loaded = await loadCardRowsForReadModel({
        read: (range, options = {}) => read(range, {
            ...options,
            userId: safeUserId,
            telemetryConsumer: 'scheduler'
        }),
        mode: 'on',
        contextKey: `user:${safeUserId}`,
        telemetryConsumer: 'scheduler'
    });
    return {
        route: loaded.route,
        entries: buildCanonicalCardEntries({
            unifiedRows: loaded.unifiedCardRows,
            legacyRowsBySheet: loaded.legacyRowsBySheet
        })
    };
}

function sumSchedulerCanonicalCards({ entries = [], userId, month, year } = {}) {
    return entries
        .filter(entry => String(entry.user_id || '').trim() === String(userId || '').trim())
        .filter(entry => entry.month === month && entry.year === year)
        .reduce((sum, entry) => sum + Number(entry.valor || 0), 0);
}

function sumSchedulerLegacyCards({ cardData = [], userId, billingLabel, year } = {}) {
    let total = 0;
    cardData.forEach(sheet => {
        (sheet.slice(1) || []).forEach(row => {
            if (!belongsToUser(row, 6, userId)) return;
            const bill = normalizeText(row[5] || '');
            if (bill.includes(normalizeText(billingLabel)) && bill.includes(String(year))) {
                total += parseValue(row[3]);
            }
        });
    });
    return total;
}

async function sendMonthlyReports() {
    try {
        const users = await getScheduledActiveUsers();
        if (users.length === 0) return;

        const saidasData = await readDataFromSheet('Saídas!A:J');
        const entradasData = await readDataFromSheet('Entradas!A:I');
        const cardMode = getCardSchedulerRouteMode();
        const cardSheetNames = Object.values(creditCardConfig).map(c => c.sheetName);
        const legacyCardData = cardMode === 'off'
            ? await Promise.all(cardSheetNames.map(n => readDataFromSheet(`${n}!A:G`, {
                telemetryConsumer: 'scheduler'
            })))
            : [];

        const now = getNow();
        const reportDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const month = reportDate.getMonth();
        const year = reportDate.getFullYear();
        const monthLabel = reportDate.toLocaleString('pt-BR', { month: 'long' });
        const billingLabel = reportDate.toLocaleString('pt-BR', { month: 'long' });

        for (const user of users) {
            const settings = await getUserSettingsByUserId(user.user_id);
            if (normalizeText(settings?.monthly_report_opt_in || 'sim') !== 'sim') continue;

            const entradas = (entradasData.slice(1) || [])
                .filter(r => belongsToUser(r, 8, user.user_id))
                .filter(r => {
                    const d = parseSheetDate(r[0]);
                    return d && d.getMonth() === month && d.getFullYear() === year;
                })
                .reduce((s, r) => s + parseValue(r[3]), 0);

            const saidas = (saidasData.slice(1) || [])
                .filter(r => belongsToUser(r, 9, user.user_id))
                .filter(r => {
                    const d = parseSheetDate(r[0]);
                    return d && d.getMonth() === month && d.getFullYear() === year;
                })
                .reduce((s, r) => s + parseValue(r[4]), 0);

            const useUnifiedFirst = shouldUseSchedulerCardUnifiedFirst({
                mode: cardMode,
                userId: user.user_id
            });
            let cartoes;
            if (useUnifiedFirst) {
                const scopedCards = await loadSchedulerScopedCardEntries({
                    userId: user.user_id,
                    mode: cardMode
                });
                cartoes = sumSchedulerCanonicalCards({
                    entries: scopedCards.entries,
                    userId: user.user_id,
                    month,
                    year
                });
            } else {
                cartoes = sumSchedulerLegacyCards({
                    cardData: legacyCardData,
                    userId: user.user_id,
                    billingLabel,
                    year
                });
            }

            const saldo = entradas - (saidas + cartoes);
            const message = [
                `Relatório mensal (${monthLabel}/${year}):`,
                `- Entradas: R$ ${entradas.toFixed(2).replace('.', ',')}`,
                `- Saídas: R$ ${saidas.toFixed(2).replace('.', ',')}`,
                `- Cartões: R$ ${cartoes.toFixed(2).replace('.', ',')}`,
                `- Saldo: R$ ${saldo.toFixed(2).replace('.', ',')}`
            ].join('\n');

            await client.sendMessage(user.whatsapp_id, message);
        }
    } catch (error) {
        logger.error(`Erro ao enviar relatórios mensais: ${error.message}`);
    }
}

async function sendOperationalHeartbeat() {
    try {
        await recordLegacyUsageHeartbeat();
        const snapshot = metrics.flushToLogs('[metrics-hourly]');
        const shouldSendAlerts = String(process.env.OPERATIONAL_ALERTS_ENABLED || 'false').toLowerCase() === 'true';
        if (!shouldSendAlerts) return;

        const timeoutCount = Number(snapshot?.counters?.['gemini.timeout'] || 0);
        const fatalErrors = Number(snapshot?.counters?.['message.error.fatal'] || 0);
        const slowMessages = Number(snapshot?.counters?.['message.total.slow'] || 0);
        const shouldAlert = timeoutCount > 0 || fatalErrors > 0 || slowMessages >= 10;
        if (!shouldAlert) return;

        const adminRecipients = Array.from(getAdminIds() || []).filter(Boolean);
        if (adminRecipients.length === 0) return;

        const text = [
            'Alerta operacional (ultima hora):',
            `- gemini.timeout: ${timeoutCount}`,
            `- message.error.fatal: ${fatalErrors}`,
            `- message.total.slow: ${slowMessages}`
        ].join('\n');

        for (const id of adminRecipients) {
            await client.sendMessage(id, text);
        }
    } catch (error) {
        logger.error(`Erro no heartbeat operacional: ${error.message}`);
    }
}

async function sendInterpretationReadinessAdminAlert() {
    try {
        const result = await sendInterpretationReadinessAlert({
            client,
            adminIds: getAdminIds()
        });
        if (result.sent) {
            logger.info(`[scheduler] interpretation_readiness_alert_sent type=${result.alertType}`);
        }
        return result;
    } catch (error) {
        logger.error(`Erro no alerta de prontidao do shadow: ${error.message}`);
        return { sent: false, reason: 'alert_failed' };
    }
}

async function recoverPendingGoogleOAuthRevocations() {
    try {
        const result = await retryPendingGoogleRevocations();
        if (result.attempted > 0 || result.expired > 0) {
            logger.info(
                `[scheduler] oauth_revocation_recovery attempted=${result.attempted} `
                + `revoked=${result.revoked} failed=${result.failed} expired=${result.expired}`
            );
        }
        return result;
    } catch (error) {
        logger.warn('[scheduler] oauth_revocation_recovery_failed');
        return {
            attempted: 0,
            revoked: 0,
            failed: 0,
            expired: 0,
            errorCode: 'OAUTH_REVOCATION_RECOVERY_FAILED'
        };
    }
}

async function recoverPendingSharedMembershipPermissionRevocations() {
    try {
        const result = await retryPendingSharedMembershipRevocations({ limit: 50 });
        if (result.attempted > 0 || result.manualRequired > 0) {
            logger.info(
                `[scheduler] shared_membership_revocation attempted=${result.attempted} `
                + `revoked=${result.revoked} failed=${result.failed} manual_required=${result.manualRequired}`
            );
        }
        return result;
    } catch (error) {
        logger.warn('[scheduler] shared_membership_revocation_failed');
        return {
            attempted: 0,
            revoked: 0,
            failed: 0,
            manualRequired: 0,
            errorCode: 'SHARED_MEMBERSHIP_REVOCATION_RECOVERY_FAILED'
        };
    }
}

async function cleanupExpiredGoogleOAuthConnectionAttempts() {
    try {
        const result = expireOAuthConnectionAttempts({ now: getNow(), limit: 100 });
        if (result.expired > 0 || result.deleted > 0) {
            logger.info(
                `[scheduler] oauth_connection_attempt_cleanup expired=${result.expired} deleted=${result.deleted}`
            );
        }
        return result;
    } catch (error) {
        logger.warn('[scheduler] oauth_connection_attempt_cleanup_failed');
        return { expired: 0, deleted: 0, errorCode: 'OAUTH_CONNECTION_ATTEMPT_CLEANUP_FAILED' };
    }
}

async function recoverPendingGoogleOAuthConnectionCompensations() {
    try {
        const result = await recoverPendingGoogleOAuthCompensations({ limit: 50 });
        if (result.attempted > 0 || result.manualRequired > 0) {
            logger.info(
                `[scheduler] oauth_connection_compensation attempted=${result.attempted} `
                + `compensated=${result.compensated} pending=${result.pending} `
                + `manual_required=${result.manualRequired}`
            );
        }
        return result;
    } catch (error) {
        logger.warn('[scheduler] oauth_connection_compensation_failed');
        return {
            attempted: 0,
            compensated: 0,
            pending: 0,
            manualRequired: 0,
            errorCode: 'OAUTH_CONNECTION_COMPENSATION_FAILED'
        };
    }
}

async function sendDailyOpsCheckAdminReport() {
    try {
        const result = await sendDailyOpsCheckReport({
            client,
            adminIds: getAdminIds()
        });
        if (result.sent) {
            logger.info(`[scheduler] daily_ops_check_sent status=${result.status}`);
        }
        return result;
    } catch (error) {
        logger.error(`Erro no check diario operacional: ${error.message}`);
        return { sent: false, reason: 'daily_ops_check_failed' };
    }
}

function initializeScheduler(wppClient) {
    if (isInitialized) {
        console.log('⚠️ Agendador já estava inicializado. Ignorando...');
        return;
    }

    isInitialized = true;
    client = wppClient;
    console.log('✅ Agendador de tarefas (cron) inicializado.');

    cron.schedule('0 7 * * *', async () => {
        const todayStr = getFormattedDateOnly();
        console.log(`⏰ [${todayStr}] Executando tarefas diárias...`);
        notifiedEventIds.clear();
        await sendMorningSummary();
        await checkUpcomingBills();
        await checkUpcomingEvents();
    }, { scheduled: true, timezone: 'America/Sao_Paulo' });

    cron.schedule('0 20 * * *', async () => {
        console.log('⏰ Executando resumo noturno para o dia seguinte...');
        await sendEveningSummary();
    }, { scheduled: true, timezone: 'America/Sao_Paulo' });

    cron.schedule('0 3 * * *', async () => {
        try {
            const expired = await expireOldPendingUsers();
            if (expired > 0) {
                console.log(`🧹 Usuários PENDING expirados: ${expired}`);
            }
        } catch (error) {
            logger.error(`Erro ao expirar usuários pendentes: ${error.message}`);
        }
    }, { scheduled: true, timezone: 'America/Sao_Paulo' });

    cron.schedule('0 19 * * 0', async () => {
        await sendWeeklyCheckIn();
    }, { scheduled: true, timezone: 'America/Sao_Paulo' });

    cron.schedule('0 8 1 * *', async () => {
        await sendMonthlyReports();
    }, { scheduled: true, timezone: 'America/Sao_Paulo' });

    cron.schedule('0 * * * *', async () => {
        await sendOperationalHeartbeat();
        await recoverPendingGoogleOAuthRevocations();
        await recoverPendingSharedMembershipPermissionRevocations();
        await recoverPendingGoogleOAuthConnectionCompensations();
        await cleanupExpiredGoogleOAuthConnectionAttempts();
    }, { scheduled: true, timezone: 'America/Sao_Paulo' });

    cron.schedule('5 9 * * *', async () => {
        await sendDailyOpsCheckAdminReport();
    }, { scheduled: true, timezone: 'America/Sao_Paulo' });

    cron.schedule('15 9 * * *', async () => {
        await sendInterpretationReadinessAdminAlert();
    }, { scheduled: true, timezone: 'America/Sao_Paulo' });

    cron.schedule('*/10 * * * *', async () => {
        try {
            await syncReadModelIfNeeded();
            metrics.increment('read_model.sync.scheduled.success');
            logger.info(`[read-model] sync agendado OK: ${JSON.stringify(getReadModelStats())}`);
        } catch (error) {
            metrics.increment('read_model.sync.scheduled.error');
            logger.warn(`[read-model] falha no sync agendado: ${error.message}`);
        }
    }, { scheduled: true, timezone: 'America/Sao_Paulo' });
}

function setClientForTest(wppClient) {
    client = wppClient;
}

function setNowForTest(fixedNow) {
    nowProvider = () => new Date(fixedNow);
}

function resetNowForTest() {
    nowProvider = () => new Date();
}

module.exports = {
    initializeScheduler,
    __test__: {
        setClientForTest,
        setNowForTest,
        resetNowForTest,
        getRecipientIds,
        checkUpcomingEvents,
        checkUpcomingBills,
        sendMorningSummary,
        sendEveningSummary,
        sendWeeklyCheckIn,
        sendMonthlyReports,
        getCardSchedulerRouteMode,
        shouldUseSchedulerCardUnifiedFirst,
        loadSchedulerScopedCardEntries,
        sumSchedulerCanonicalCards,
        sumSchedulerLegacyCards,
        sendOperationalHeartbeat,
        recoverPendingGoogleOAuthRevocations,
        recoverPendingSharedMembershipPermissionRevocations,
        recoverPendingGoogleOAuthConnectionCompensations,
        cleanupExpiredGoogleOAuthConnectionAttempts,
        sendDailyOpsCheckAdminReport,
        sendInterpretationReadinessAdminAlert,
        collectPaymentsDueOnDate,
        addDaysForSchedule,
        getDatePartsInTimeZone,
        formatScheduleDate,
        formatScheduleTime,
        isSyntheticTestWhatsAppId,
        shouldSendScheduledMessageToUser,
        notifiedEventIds
    }
};
