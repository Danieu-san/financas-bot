// src/jobs/scheduler.js

const cron = require('node-cron');
const { readDataFromSheet, getCalendarEventsForToday } = require('../services/google');
const { parseSheetDate, normalizeText, getFormattedDateOnly } = require('../utils/helpers');

let client;
const targetIds = ['5521970112407@c.us', '5521964270368@c.us'];
// Para evitar lembretes duplicados de eventos da agenda
const notifiedEventIds = new Set();

function initializeScheduler(wppClient) {
    client = wppClient;
    console.log('✅ Agendador de tarefas (cron) inicializado.');

    // 1. TAREFA DIÁRIA (Resumos) - Roda todo dia às 8:00
    cron.schedule('0 8 * * *', async () => {
        const todayStr = getFormattedDateOnly();
        console.log(`⏰ [${todayStr}] Executando tarefas diárias...`);
        // Limpa a lista de eventos notificados no início de cada dia
        notifiedEventIds.clear();
        await sendMorningSummary();
        await checkUpcomingBills();
    }, {
        scheduled: true,
        timezone: "America/Sao_Paulo"
    });

    // 2. TAREFA FREQUENTE (Lembretes de Eventos) - Roda a cada 15 minutos
    cron.schedule('*/15 * * * *', async () => {
        console.log('⏰ Verificando compromissos próximos...');
        await checkUpcomingEvents();
    }, {
        scheduled: true,
        timezone: "America/Sao_Paulo"
    });
}

// Função para verificar eventos que estão para começar (avisa 1h antes)
async function checkUpcomingEvents() {
    try {
        const eventos = await getCalendarEventsForToday();
        const agora = new Date();

        for (const evento of eventos) {
            if (!evento.start.dateTime || notifiedEventIds.has(evento.id)) continue;

            const horaInicio = new Date(evento.start.dateTime);
            const diffTime = horaInicio.getTime() - agora.getTime();
            const diffMinutes = Math.round(diffTime / (1000 * 60));

            // Se o evento começa entre 55 e 70 minutos a partir de agora
            if (diffMinutes >= 55 && diffMinutes <= 70) {
                const message = `Lembrete de Agenda 🔔: Seu compromisso "*${evento.summary}*" começa em aproximadamente 1 hora, às ${horaInicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;

                for (const id of targetIds) {
                    await client.sendMessage(id, message);
                }
                
                notifiedEventIds.add(evento.id);
                console.log(`Lembrete (1h) enviado para o evento: "${evento.summary}"`);
            }
        }
    } catch (error) {
        console.error('❌ Erro ao verificar eventos da agenda:', error);
    }
}

// Função para verificar contas a vencer (3 níveis de lembrete)
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

        const saidasDoMes = saidasData.slice(1).filter(row => {
            const dataSaida = parseSheetDate(row[0]);
            return dataSaida && dataSaida.getFullYear() === anoAtual && dataSaida.getMonth() === mesAtual;
        }).map(row => normalizeText(row[1]));

        for (let i = 1; i < contasData.length; i++) {
            const row = contasData[i];
            const nomeConta = row[0];
            const diaVencimento = parseInt(row[1]);

            if (!nomeConta || isNaN(diaVencimento)) continue;

            const nomeContaNormalizado = normalizeText(nomeConta);
            const jaFoiRegistrada = saidasDoMes.some(descricaoSaida => descricaoSaida.includes(nomeContaNormalizado));

            if (jaFoiRegistrada) {
                console.log(`Conta "${nomeConta}" já foi registrada este mês. Pulando lembrete.`);
                continue;
            }

            const dataVencimento = new Date(anoAtual, mesAtual, diaVencimento);
            const diffTime = dataVencimento.getTime() - hoje.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            let message = '';

            if (diffDays === 5) {
                message = `Lembrete! 💡 A conta de *${nomeConta}* vence em 5 dias (no dia ${diaVencimento}).`;
            } else if (diffDays === 1) {
                message = `Atenção! ⚠️ A conta de *${nomeConta}* vence amanhã!`;
            } else if (diffDays === 0) {
                message = `URGENTE! 🚨 A conta de *${nomeConta}* VENCE HOJE!`;
            }

            if (message) {
                for (const id of targetIds) {
                    await client.sendMessage(id, message);
                }
                console.log(`Lembrete (faltam ${diffDays} dias) enviado para a conta: ${nomeConta}`);
            }
        }
    } catch (error) {
        console.error('❌ Erro ao verificar e lembrar contas a vencer:', error);
    }
}

// Função do resumo matinal completo (Dívidas + Agenda)
async function sendMorningSummary() {
    try {
        const dividasData = await readDataFromSheet('Dívidas!A:P');
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const contasProximas = [];
        if (dividasData && dividasData.length > 1) {
            for (let i = 1; i < dividasData.length; i++) {
                const row = dividasData[i];
                const nomeDivida = row[0], valorParcela = row[5], proximoVencimentoStr = row[14];
                const dataVencimento = parseSheetDate(proximoVencimentoStr);
                if (nomeDivida && valorParcela && dataVencimento) {
                    const diffTime = dataVencimento.getTime() - hoje.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays >= 0 && diffDays <= 7) {
                        contasProximas.push({ nome: nomeDivida, valor: valorParcela, dias: diffDays });
                    }
                }
            }
        }

        const eventosDeHoje = await getCalendarEventsForToday();

        let message = `Bom dia! ☀️ Aqui está seu resumo de hoje, ${hoje.toLocaleDateString('pt-BR')}:\n`;

        message += "\n*Financeiro (Próximos 7 dias):*\n";
        if (contasProximas.length === 0) {
            message += "✅ Nenhuma parcela de dívida com vencimento próximo.\n";
        } else {
            message += `🚨 *Atenção! Você tem ${contasProximas.length} parcela(s) vencendo:*\n`;
            contasProximas.sort((a, b) => a.dias - b.dias);
            contasProximas.forEach(conta => {
                let vencimentoTexto = `em ${conta.dias} dias`;
                if (conta.dias === 0) vencimentoTexto = "VENCE HOJE!";
                if (conta.dias === 1) vencimentoTexto = "amanhã!";
                message += ` - *${conta.nome}* (${vencimentoTexto}) - R$${conta.valor}\n`;
            });
        }

        message += "\n*Agenda de Hoje:*\n";
        if (eventosDeHoje.length === 0) {
            message += "📅 Nenhum compromisso na agenda para hoje.\n";
        } else {
            eventosDeHoje.forEach(evento => {
                let horario = "Dia inteiro";
                if (evento.start.dateTime) {
                    horario = new Date(evento.start.dateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                }
                message += ` - *${horario}* - ${evento.summary}\n`;
            });
        }
        
        for (const id of targetIds) {
            await client.sendMessage(id, message);
        }

    } catch (error) {
        console.error('❌ Erro ao enviar o resumo matinal completo:', error);
    }
}

module.exports = { initializeScheduler };