const { buildEnforceReadinessReport } = require('../reliability/enforceReadinessMonitor');
const { getReadModelStats } = require('./readModelService');
const metrics = require('../utils/metrics');

const STATUS_WEIGHT = {
    ok: 0,
    attention: 1,
    critical: 2
};

function normalizeFlag(value) {
    return String(value ?? '').trim().toLowerCase();
}

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

function formatDateTime(date = new Date()) {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(new Date(date));
}

function minutesSince(isoDate, now = new Date()) {
    const parsed = Date.parse(isoDate);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.floor((new Date(now).getTime() - parsed) / 60000));
}

function addCheck(checks, check) {
    checks.push({
        name: check.name,
        status: check.status || 'ok',
        detail: check.detail || ''
    });
}

function statusFromChecks(checks = []) {
    return checks.reduce((current, check) => {
        return STATUS_WEIGHT[check.status] > STATUS_WEIGHT[current] ? check.status : current;
    }, 'ok');
}

function evaluateFlags(env = {}) {
    const issues = [];
    const details = [];

    const dashboardAllUsers = normalizeFlag(env.DASHBOARD_ADMIN_ALL_USERS_ENABLED || 'false');
    const financialAgentMode = normalizeFlag(env.FINANCIAL_AGENT_MODE || 'off');
    const plannerEnabled = normalizeFlag(env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED || 'false');
    const recentAnswerEnabled = normalizeFlag(env.FINANCIAL_AGENT_SHADOW_RECENT_ANSWER_ENABLED || 'false');
    const familyMode = normalizeFlag(env.FAMILY_MODE_ENABLED || 'false');
    const interpretationMode = normalizeFlag(env.INTERPRETATION_RELIABILITY_MODE || 'off');

    if (dashboardAllUsers === 'true') issues.push('DASHBOARD_ADMIN_ALL_USERS_ENABLED=true');
    if (financialAgentMode === 'answer' || financialAgentMode === 'enforce') issues.push(`FINANCIAL_AGENT_MODE=${financialAgentMode}`);
    if (plannerEnabled === 'true') issues.push('FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true');
    if (familyMode === 'true') issues.push('FAMILY_MODE_ENABLED=true');
    if (interpretationMode === 'enforce') issues.push('INTERPRETATION_RELIABILITY_MODE=enforce');

    details.push(`agent=${financialAgentMode || 'off'}`);
    details.push(`planner=${plannerEnabled || 'false'}`);
    details.push(`recent_answer=${recentAnswerEnabled || 'false'}`);
    details.push(`family=${familyMode || 'false'}`);
    details.push(`interpretation=${interpretationMode || 'off'}`);
    details.push(`all_users=${dashboardAllUsers || 'false'}`);

    return {
        status: issues.length ? 'critical' : 'ok',
        detail: issues.length ? `Flags exigem revisao: ${issues.join(', ')}` : `Flags seguras (${details.join(', ')})`,
        issues
    };
}

function evaluateReadModel(readModelStats = null, now = new Date()) {
    if (!readModelStats) {
        return {
            status: 'attention',
            detail: 'read-model sem estatisticas disponiveis',
            issues: ['read-model sem estatisticas disponiveis']
        };
    }

    const sqliteReady = readModelStats?.sqlite?.ready !== false;
    const lastSync = readModelStats.lastSyncedAt || readModelStats.lastSyncAt || '';
    const syncAgeMin = minutesSince(lastSync, now);
    const issues = [];

    if (!sqliteReady) issues.push('SQLite/read-model nao pronto');
    if (syncAgeMin === null) {
        issues.push('ultimo sync ausente');
    } else if (syncAgeMin > 60) {
        issues.push(`ultimo sync ha ${syncAgeMin}min`);
    }

    return {
        status: !sqliteReady ? 'critical' : issues.length ? 'attention' : 'ok',
        detail: [
            `sqlite=${sqliteReady ? 'pronto' : 'nao_pronto'}`,
            lastSync ? `ultimo_sync=${lastSync}` : 'ultimo_sync=ausente',
            `registros=saidas:${readModelStats.saidas ?? 0}, entradas:${readModelStats.entradas ?? 0}, cartoes:${readModelStats.cartoes ?? 0}, metas:${readModelStats.metas ?? 0}, dividas:${readModelStats.dividas ?? 0}`
        ].join('; '),
        issues
    };
}

function evaluateReadiness(readinessReport = null) {
    if (!readinessReport) {
        return {
            status: 'attention',
            detail: 'readiness do shadow indisponivel',
            issues: ['readiness do shadow indisponivel'],
            nextActions: ['Verificar npm run report:interpretation-readiness se este alerta persistir.']
        };
    }

    if (Number(readinessReport.criticalDivergences || 0) > 0) {
        return {
            status: 'attention',
            detail: `rollout bloqueado: shadow com ${Number(readinessReport.criticalDivergences || 0)} divergencia critica(s); decisoes=${Number(readinessReport.shadowEntries || 0)}`,
            issues: [`shadow com ${Number(readinessReport.criticalDivergences || 0)} divergencia critica(s)`],
            nextActions: ['Nao ativar enforce. Revisar divergencias criticas antes de avancar.']
        };
    }

    if (readinessReport.readyForManualReview || readinessReport.recommendedMode === 'manual_review_for_enforce') {
        return {
            status: 'attention',
            detail: `shadow pronto para revisao manual; decisoes=${Number(readinessReport.shadowEntries || 0)}`,
            issues: [],
            nextActions: ['Shadow atingiu os gates. revisar manualmente antes de ativar enforce.']
        };
    }

    const blockers = Array.isArray(readinessReport.blockers) ? readinessReport.blockers.join(', ') : '';
    return {
        status: 'ok',
        detail: `shadow coletando evidencia; decisoes=${Number(readinessReport.shadowEntries || 0)}${blockers ? `; bloqueios=${blockers}` : ''}`,
        issues: [],
        nextActions: []
    };
}

function evaluateMetrics(metricsSnapshot = {}) {
    const counters = metricsSnapshot?.counters || {};
    const timeoutCount = Number(counters['gemini.timeout'] || 0);
    const fatalErrors = Number(counters['message.error.fatal'] || 0);
    const slowMessages = Number(counters['message.total.slow'] || 0);
    const issues = [];

    if (fatalErrors > 0) issues.push(`message.error.fatal=${fatalErrors}`);
    if (timeoutCount > 0) issues.push(`gemini.timeout=${timeoutCount}`);
    if (slowMessages >= 10) issues.push(`message.total.slow=${slowMessages}`);

    return {
        status: fatalErrors > 0 ? 'critical' : issues.length ? 'attention' : 'ok',
        detail: issues.length ? issues.join(', ') : 'sem sinais acumulados no snapshot atual',
        issues
    };
}

function buildDailyOpsCheckReport({
    now = new Date(),
    env = process.env,
    readModelStats = null,
    readinessReport = null,
    metricsSnapshot = null,
    clientStatus = {},
    uptimeSeconds = process.uptime(),
    memoryUsage = process.memoryUsage()
} = {}) {
    const checks = [];
    const issues = [];
    const nextActions = [];

    const canSendMessage = Boolean(clientStatus?.canSendMessage);
    addCheck(checks, {
        name: 'WhatsApp',
        status: canSendMessage ? 'ok' : 'critical',
        detail: canSendMessage ? 'cliente disponivel para envio' : 'cliente indisponivel para envio'
    });
    if (!canSendMessage) issues.push('WhatsApp client indisponivel para envio');

    const readModel = evaluateReadModel(readModelStats, now);
    addCheck(checks, { name: 'SQLite/read-model', status: readModel.status, detail: readModel.detail });
    issues.push(...readModel.issues);

    const flags = evaluateFlags(env);
    addCheck(checks, { name: 'Flags seguras', status: flags.status, detail: flags.detail });
    issues.push(...flags.issues);

    const readiness = evaluateReadiness(readinessReport);
    addCheck(checks, { name: 'Shadow/enforce', status: readiness.status, detail: readiness.detail });
    issues.push(...readiness.issues);
    nextActions.push(...readiness.nextActions);

    const metricCheck = evaluateMetrics(metricsSnapshot);
    addCheck(checks, { name: 'Metricas locais', status: metricCheck.status, detail: metricCheck.detail });
    issues.push(...metricCheck.issues);

    const status = statusFromChecks(checks);
    if (status === 'ok') {
        nextActions.push('Nenhuma acao imediata. Continue usando o bot normalmente.');
    } else if (!nextActions.length) {
        nextActions.push('Abrir investigacao no Codex com logs do periodo do alerta.');
    }

    return {
        status,
        generatedAt: new Date(now).toISOString(),
        generatedAtLabel: formatDateTime(now),
        uptime: formatDuration(uptimeSeconds),
        memoryRss: formatMb(memoryUsage?.rss),
        checks,
        issues,
        nextActions,
        noGeminiCalls: true
    };
}

function statusLabel(status) {
    if (status === 'critical') return 'CRITICO';
    if (status === 'attention') return 'ATENCAO';
    return 'OK';
}

function formatDailyOpsCheckMessage(report = {}) {
    const lines = [
        'FinancasBot - check diario',
        `Status geral: ${statusLabel(report.status)}`,
        `Verificado em: ${report.generatedAtLabel || formatDateTime(report.generatedAt || new Date())}`,
        `Uptime: ${report.uptime || 'n/d'}`,
        `Memoria RSS: ${report.memoryRss || 'n/d'}`,
        '',
        'Checks:'
    ];

    for (const check of report.checks || []) {
        lines.push(`- ${statusLabel(check.status)} | ${check.name}: ${check.detail}`);
    }

    lines.push('', 'Proximas acoes:');
    for (const action of report.nextActions || []) {
        lines.push(`- ${action}`);
    }

    if (report.issues?.length) {
        lines.push('', 'Sinais para revisar:');
        for (const issue of report.issues) {
            lines.push(`- ${issue}`);
        }
    }

    lines.push(
        '',
        'Sem chamada Gemini. Relatorio sanitizado: nao inclui dados financeiros, telefones, credenciais ou IDs internos.'
    );

    return lines.join('\n');
}

async function sendDailyOpsCheckReport({
    client,
    adminIds = [],
    env = process.env,
    reportBuilder,
    now = new Date()
} = {}) {
    if (normalizeFlag(env.DAILY_OPS_CHECK_ENABLED || 'false') !== 'true') {
        return { sent: false, reason: 'disabled' };
    }
    if (!client || typeof client.sendMessage !== 'function') {
        return { sent: false, reason: 'client_unavailable' };
    }

    const recipients = Array.from(new Set(Array.from(adminIds || []).map(id => String(id || '').trim()).filter(Boolean)));
    if (!recipients.length) {
        return { sent: false, reason: 'no_admin_recipients' };
    }

    const report = reportBuilder ? reportBuilder() : buildDailyOpsCheckReport({
        now,
        env,
        readModelStats: getReadModelStats(),
        readinessReport: buildEnforceReadinessReport(),
        metricsSnapshot: metrics.getSnapshot(),
        clientStatus: { canSendMessage: true }
    });
    const message = formatDailyOpsCheckMessage(report);

    for (const recipient of recipients) {
        await client.sendMessage(recipient, message);
    }

    return {
        sent: true,
        status: report.status,
        recipientCount: recipients.length,
        report
    };
}

module.exports = {
    buildDailyOpsCheckReport,
    evaluateFlags,
    formatDailyOpsCheckMessage,
    sendDailyOpsCheckReport
};
