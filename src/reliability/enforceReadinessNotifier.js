const fs = require('node:fs');
const path = require('node:path');
const { buildEnforceReadinessReport } = require('./enforceReadinessMonitor');

const DEFAULT_STATE_PATH = path.resolve(process.cwd(), 'data', 'interpretation-reliability-alert-state.json');

function readAlertState(statePath = DEFAULT_STATE_PATH) {
    if (!fs.existsSync(statePath)) return {};
    try {
        const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function writeAlertState(state, statePath = DEFAULT_STATE_PATH) {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function buildReadinessAlert(report = {}) {
    if (Number(report.criticalDivergences || 0) > 0) {
        return {
            type: 'critical_divergence',
            key: `critical_divergence:${Number(report.criticalDivergences || 0)}`,
            message: [
                'FinançasBot - Divergência crítica no shadow',
                '',
                `Divergências críticas observadas: ${Number(report.criticalDivergences || 0)}`,
                `Decisões observadas: ${Number(report.shadowEntries || 0)}`,
                `Janela observada: ${Number(report.observationWindowDays || 0)} dia(s)`,
                '',
                'Recomendação: NAO ative enforce. Revise as divergências antes de avançar.',
                'O enforce NAO foi ativado automaticamente.'
            ].join('\n')
        };
    }

    if (report.readyForManualReview) {
        const operations = Object.entries(report.byOperation || {})
            .map(([operation, count]) => `${operation}: ${count}`)
            .join(', ');
        return {
            type: 'ready_for_manual_review',
            key: 'ready_for_manual_review',
            message: [
                'FinançasBot - Shadow pronto para revisão manual',
                '',
                `Decisões observadas: ${Number(report.shadowEntries || 0)}`,
                `Janela observada: ${Number(report.observationWindowDays || 0)} dia(s)`,
                `Divergências críticas: ${Number(report.criticalDivergences || 0)}`,
                operations ? `Operações cobertas: ${operations}` : '',
                '',
                'Recomendação: revisar manualmente antes de ativar enforce.',
                'O enforce NAO foi ativado automaticamente.'
            ].filter(Boolean).join('\n')
        };
    }

    return null;
}

async function sendInterpretationReadinessAlert({
    client,
    adminIds = [],
    statePath = DEFAULT_STATE_PATH,
    env = process.env,
    reportBuilder = buildEnforceReadinessReport,
    now = new Date()
} = {}) {
    const mode = String(env.INTERPRETATION_RELIABILITY_MODE || 'off').toLowerCase();
    if (mode !== 'shadow') {
        return { sent: false, reason: 'shadow_disabled' };
    }
    if (String(env.INTERPRETATION_RELIABILITY_ALERTS_ENABLED || 'true').toLowerCase() === 'false') {
        return { sent: false, reason: 'alerts_disabled' };
    }
    if (!client || typeof client.sendMessage !== 'function') {
        return { sent: false, reason: 'client_unavailable' };
    }

    const recipients = Array.from(new Set(Array.from(adminIds || []).map(id => String(id || '').trim()).filter(Boolean)));
    if (!recipients.length) {
        return { sent: false, reason: 'no_admin_recipients' };
    }

    const report = reportBuilder();
    const alert = buildReadinessAlert(report);
    if (!alert) {
        return { sent: false, reason: 'no_alert_condition', report };
    }

    const state = readAlertState(statePath);
    if (state.lastAlertKey === alert.key) {
        return { sent: false, reason: 'already_notified', report };
    }

    for (const recipient of recipients) {
        await client.sendMessage(recipient, alert.message);
    }

    writeAlertState({
        lastAlertKey: alert.key,
        lastAlertType: alert.type,
        lastSentAt: new Date(now).toISOString()
    }, statePath);

    return {
        sent: true,
        alertType: alert.type,
        recipientCount: recipients.length,
        report
    };
}

module.exports = {
    DEFAULT_STATE_PATH,
    buildReadinessAlert,
    readAlertState,
    sendInterpretationReadinessAlert,
    writeAlertState
};
