const logger = require('../utils/logger');

const DEFAULT_RESTART_DELAY_MS = 1500;

let restartScheduler = ({ delayMs }) => {
    const timer = setTimeout(() => {
        process.exit(0);
    }, delayMs);
    if (typeof timer.unref === 'function') timer.unref();
};

function formatDuration(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    parts.push(`${minutes}min`);
    return parts.join(' ');
}

function formatMb(bytes) {
    return `${Math.round((Number(bytes) || 0) / 1024 / 1024)} MB`;
}

function buildAdminBotStatusReply({ readModelStats = null, now = new Date() } = {}) {
    const memory = process.memoryUsage();
    const sqliteStats = readModelStats?.sqlite || {};
    const lastSync = readModelStats?.lastSyncedAt || readModelStats?.lastSyncAt || 'sem sync registrado';
    const sqliteStatus = sqliteStats.ready === false ? 'não pronto' : 'pronto';

    return [
        'Status do FinançasBot',
        `- Processo: online`,
        `- Uptime: ${formatDuration(process.uptime())}`,
        `- Memória RSS: ${formatMb(memory.rss)}`,
        `- Ambiente: ${process.env.NODE_ENV || 'development'}`,
        `- SQLite/read-model: ${sqliteStatus}`,
        `- Último sync: ${lastSync}`,
        `- Registros em memória: saídas=${readModelStats?.saidas ?? 0}, entradas=${readModelStats?.entradas ?? 0}, cartões=${readModelStats?.cartoes ?? 0}, metas=${readModelStats?.metas ?? 0}, dívidas=${readModelStats?.dividas ?? 0}`,
        `- Verificado em: ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        '',
        'Resumo sanitizado: não inclui credenciais, identificadores internos ou dados financeiros individuais.'
    ].join('\n');
}

function scheduleAdminProcessRestart({
    delayMs = DEFAULT_RESTART_DELAY_MS,
    reason = 'admin_whatsapp_command'
} = {}) {
    logger.warn(`[admin-maintenance] restart_scheduled reason="${reason}" delay_ms=${delayMs}`);
    restartScheduler({ delayMs, reason });
    return { delayMs, reason };
}

function setRestartSchedulerForTests(fn) {
    restartScheduler = fn;
}

function resetRestartSchedulerForTests() {
    restartScheduler = ({ delayMs }) => {
        const timer = setTimeout(() => {
            process.exit(0);
        }, delayMs);
        if (typeof timer.unref === 'function') timer.unref();
    };
}

module.exports = {
    buildAdminBotStatusReply,
    scheduleAdminProcessRestart,
    setRestartSchedulerForTests,
    resetRestartSchedulerForTests
};
