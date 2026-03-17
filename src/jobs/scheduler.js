const cron = require('node-cron');
const { readDataFromSheet, getCalendarEventsForToday } = require('../services/google');
const { expireOldPendingUsers, getActiveUsers, getUserSettingsByUserId } = require('../services/userService');
const { parseSheetDate, normalizeText, getFormattedDateOnly, parseValue } = require('../utils/helpers');
const { creditCardConfig, adminIds } = require('../config/constants');
const logger = require('../utils/logger');
const metrics = require('../utils/metrics');

let client;
let isInitialized = false;
const notifiedEventIds = new Set();

async function getRecipientIds({ weeklyOptIn = null, monthlyOptIn = null } = {}) {
    const users = await getActiveUsers();
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
        const eventos = await getCalendarEventsForToday();
        const agora = new Date();

        for (const evento of eventos) {
            if (!evento.start?.dateTime || notifiedEventIds.has(evento.id)) continue;

            const horaInicio = new Date(evento.start.dateTime);
            const diffMinutes = Math.round((horaInicio.getTime() - agora.getTime()) / (1000 * 60));

            if (diffMinutes >= 55 && diffMinutes <= 70) {
                const message =
                    `Lembrete de Agenda 🔔: Seu compromisso "*${evento.summary}*" começa em aproximadamente 1 hora, ` +
                    `às ${horaInicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;

                const recipients = await getRecipientIds();
                for (const id of recipients) {
                    await client.sendMessage(id, message);
                }

                notifiedEventIds.add(evento.id);
                console.log(`Lembrete (1h) enviado para o evento: "${evento.summary}"`);
            }
        }
    } catch (error) {
        logger.error(`Erro ao verificar eventos da agenda: ${error.message}`);
    }
}

async function checkUpcomingBills() {
    console.log('Verificando contas pendentes...');
    try {
        const contasData = await readDataFromSheet('Contas!A:C');
        if (!contasData || contasData.length <= 1) return;

        const saidasData = await readDataFromSheet('Saídas!A:B');
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth();
        hoje.setHours(0, 0, 0, 0);

        const saidasDoMes = saidasData
            .slice(1)
            .filter(row => {
                const dataSaida = parseSheetDate(row[0]);
                return dataSaida && dataSaida.getFullYear() === anoAtual && dataSaida.getMonth() === mesAtual;
            })
            .map(row => normalizeText(row[1]));

        for (let i = 1; i < contasData.length; i++) {
            const row = contasData[i];
            const nomeConta = row[0];
            const diaVencimento = parseInt(row[1], 10);
            if (!nomeConta || isNaN(diaVencimento)) continue;

            const nomeContaNormalizado = normalizeText(nomeConta);
            const jaFoiRegistrada = saidasDoMes.some(d => d.includes(nomeContaNormalizado));
            if (jaFoiRegistrada) continue;

            const dataVencimento = new Date(anoAtual, mesAtual, diaVencimento);
            const diffDays = Math.round((dataVencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));

            let message = '';
            if (diffDays === 5) message = `Lembrete! 💡 A conta de *${nomeConta}* vence em 5 dias (no dia ${diaVencimento}).`;
            if (diffDays === 1) message = `Atenção! ⚠️ A conta de *${nomeConta}* vence amanhã!`;
            if (diffDays === 0) message = `URGENTE! 🚨 A conta de *${nomeConta}* VENCE HOJE!`;
            if (!message) continue;

            const recipients = await getRecipientIds();
            for (const id of recipients) {
                await client.sendMessage(id, message);
            }
        }
    } catch (error) {
        logger.error(`Erro ao verificar contas a vencer: ${error.message}`);
    }
}

async function sendMorningSummary() {
    try {
        const dividasData = await readDataFromSheet('Dívidas!A:P');
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const contasProximas = [];
        if (dividasData && dividasData.length > 1) {
            for (let i = 1; i < dividasData.length; i++) {
                const row = dividasData[i];
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

        const eventosDeHoje = await getCalendarEventsForToday();
        let message = `Bom dia! ☀️ Aqui está seu resumo de hoje, ${hoje.toLocaleDateString('pt-BR')}:\n`;

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

        message += '\n*Agenda de Hoje:*\n';
        if (eventosDeHoje.length === 0) {
            message += '📅 Nenhum compromisso na agenda para hoje.\n';
        } else {
            eventosDeHoje.forEach(evento => {
                let horario = 'Dia inteiro';
                if (evento.start?.dateTime) {
                    horario = new Date(evento.start.dateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                }
                message += ` - *${horario}* - ${evento.summary}\n`;
            });
        }

        const recipients = await getRecipientIds();
        for (const id of recipients) {
            await client.sendMessage(id, message);
        }
    } catch (error) {
        logger.error(`Erro ao enviar resumo matinal: ${error.message}`);
    }
}

async function sendEveningSummary() {
    try {
        const amanha = new Date();
        amanha.setDate(amanha.getDate() + 1);
        const amanhaStr = amanha.toLocaleDateString('pt-BR');
        const eventosDeAmanha = await getCalendarEventsForToday(amanha);

        let message = `Boa noite! 🌙 Aqui está o resumo da sua agenda para amanhã, ${amanhaStr}:\n`;
        if (eventosDeAmanha.length === 0) {
            message += '📅 Nenhum compromisso agendado para amanhã. Aproveite!\n';
        } else {
            eventosDeAmanha.forEach(evento => {
                let horario = 'Dia inteiro';
                if (evento.start?.dateTime) {
                    horario = new Date(evento.start.dateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                }
                message += ` - *${horario}* - ${evento.summary}\n`;
            });
        }

        const recipients = await getRecipientIds();
        for (const id of recipients) {
            await client.sendMessage(id, message);
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

async function sendMonthlyReports() {
    try {
        const users = await getActiveUsers();
        if (users.length === 0) return;

        const saidasData = await readDataFromSheet('Saídas!A:J');
        const entradasData = await readDataFromSheet('Entradas!A:I');
        const cardSheetNames = Object.values(creditCardConfig).map(c => c.sheetName);
        const cardData = await Promise.all(cardSheetNames.map(n => readDataFromSheet(`${n}!A:G`)));

        const now = new Date();
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

            let cartoes = 0;
            cardData.forEach(sheet => {
                (sheet.slice(1) || []).forEach(r => {
                    if (!belongsToUser(r, 6, user.user_id)) return;
                    const bill = normalizeText(r[5] || '');
                    if (bill.includes(normalizeText(billingLabel)) && bill.includes(String(year))) {
                        cartoes += parseValue(r[3]);
                    }
                });
            });

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
        const snapshot = metrics.flushToLogs('[metrics-hourly]');
        const shouldSendAlerts = String(process.env.OPERATIONAL_ALERTS_ENABLED || 'false').toLowerCase() === 'true';
        if (!shouldSendAlerts) return;

        const timeoutCount = Number(snapshot?.counters?.['gemini.timeout'] || 0);
        const fatalErrors = Number(snapshot?.counters?.['message.error.fatal'] || 0);
        const slowMessages = Number(snapshot?.counters?.['message.total.slow'] || 0);
        const shouldAlert = timeoutCount > 0 || fatalErrors > 0 || slowMessages >= 10;
        if (!shouldAlert) return;

        const adminRecipients = Array.from(adminIds || []).filter(Boolean);
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
    }, { scheduled: true, timezone: 'America/Sao_Paulo' });
}

module.exports = { initializeScheduler };
