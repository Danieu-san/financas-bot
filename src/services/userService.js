const crypto = require('crypto');
const { readDataFromSheet, appendRowToSheet, updateRowInSheet } = require('./google');

const USERS_SHEET = 'Users';
const PROFILE_SHEET = 'UserProfile';
const SETTINGS_SHEET = 'UserSettings';
const CONSENT_SHEET = 'ConsentLog';
const TERMS_VERSION = process.env.TERMS_VERSION || 'v1.1';
const TERMS_URL = process.env.TERMS_URL || '';
const PRIVACY_URL = process.env.PRIVACY_URL || '';
const CONSENT_KEYWORD = 'aceito';
const PENDING_TTL_HOURS = 48;
const LEGAL_INFO_KEYWORDS = new Set(['termos', 'politica de privacidade', 'privacidade']);
const USER_STATUS = Object.freeze({
    PENDING: 'PENDING',
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE',
    BLOCKED: 'BLOCKED',
    DELETED: 'DELETED',
    EXPIRED: 'EXPIRED'
});

const USER_HEADERS = [
    'user_id',
    'whatsapp_id',
    'phone_e164',
    'display_name',
    'status',
    'created_at',
    'updated_at',
    'consent_at',
    'terms_version',
    'deleted_at'
];

function nowIso() {
    return new Date().toISOString();
}

function normalizeWhatsappId(whatsappId) {
    return String(whatsappId || '').trim();
}

function normalizePhoneToWhatsappId(phoneOrWhatsappId) {
    const raw = String(phoneOrWhatsappId || '').trim();
    if (!raw) return '';
    if (raw.endsWith('@c.us')) return raw;
    if (raw.endsWith('@lid')) return raw;
    const digits = raw.replace(/\D/g, '');
    return digits ? `${digits}@c.us` : '';
}

function toPhoneE164(whatsappId) {
    const digits = normalizeWhatsappId(whatsappId).replace('@c.us', '').replace('@lid', '').replace(/\D/g, '');
    return digits ? `+${digits}` : '';
}

function normalizeDigits(value) {
    return String(value || '').replace(/\D/g, '');
}

function normalizeForCompare(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function mapUserRow(row, rowIndex) {
    return {
        rowIndex,
        user_id: row[0] || '',
        whatsapp_id: row[1] || '',
        phone_e164: row[2] || '',
        display_name: row[3] || '',
        status: row[4] || '',
        created_at: row[5] || '',
        updated_at: row[6] || '',
        consent_at: row[7] || '',
        terms_version: row[8] || '',
        deleted_at: row[9] || ''
    };
}

async function getAllUsers() {
    const rows = await readDataFromSheet(`${USERS_SHEET}!A:J`);
    if (!rows || rows.length <= 1) return [];
    return rows.slice(1).map((row, idx) => mapUserRow(row, idx + 2));
}

async function getUserByWhatsAppId(whatsappId) {
    const normalized = normalizeWhatsappId(whatsappId);
    const users = await getAllUsers();
    return users.find(u => normalizeWhatsappId(u.whatsapp_id) === normalized) || null;
}

async function createPendingUser(whatsappId, displayName = '') {
    const createdAt = nowIso();
    const row = [
        crypto.randomUUID(),
        normalizeWhatsappId(whatsappId),
        toPhoneE164(whatsappId),
        String(displayName || '').trim(),
        'PENDING',
        createdAt,
        createdAt,
        '',
        '',
        ''
    ];
    await appendRowToSheet(USERS_SHEET, row);
    return getUserByWhatsAppId(whatsappId);
}

async function createDefaultUserRows(user) {
    const userId = user.user_id;
    const timestamp = nowIso();
    await appendRowToSheet(PROFILE_SHEET, [userId, '', '', '', '', '']);
    await appendRowToSheet(SETTINGS_SHEET, [userId, 'America/Sao_Paulo', 'NÃO', 'SIM', 'pt-BR', timestamp, 'NÃO', '10']);
}

function buildEvidence({ message, messageId }) {
    return JSON.stringify({
        message: String(message || ''),
        message_id: String(messageId || ''),
        ip_or_source: 'whatsapp'
    });
}

function buildLegalFooter() {
    if (TERMS_URL || PRIVACY_URL) {
        return `${TERMS_URL ? `\nTermos: ${TERMS_URL}` : ''}${PRIVACY_URL ? `\nPrivacidade: ${PRIVACY_URL}` : ''}`;
    }
    return '\nPara ver o resumo de termos e privacidade, envie: TERMOS';
}

function isLegalInfoCommand(normalizedMessage) {
    return LEGAL_INFO_KEYWORDS.has(String(normalizedMessage || '').trim());
}

function buildPublicLegalSummaryReply({ includeAcceptInstruction = false, termsVersion = TERMS_VERSION } = {}) {
    const termsLine = TERMS_URL
        ? `Termos (${termsVersion}): ${TERMS_URL}`
        : `Termos (${termsVersion}): resumo enviado abaixo.`;
    const privacyLine = PRIVACY_URL
        ? `Privacidade: ${PRIVACY_URL}`
        : 'Privacidade: resumo enviado abaixo.';

    const summary = [
        'Resumo legal:',
        '- Uso condicionado a consentimento por ACEITO.',
        '- Dados tratados: identificacao WhatsApp e lancamentos financeiros enviados.',
        '- Finalidade: operacao do bot, relatorios e auditoria.',
        '- Ciclo de vida: PENDING, ACTIVE, INACTIVE, BLOCKED, DELETED, EXPIRED.',
        '- Mudanca de termos exige novo consentimento.'
    ].join('\n');

    const acceptLine = includeAcceptInstruction
        ? '\n\nPara ativar seu acesso, responda apenas: ACEITO'
        : '';

    return `${termsLine}\n${privacyLine}\n\n${summary}${acceptLine}`;
}

async function appendConsentLog(user, { message, messageId }) {
    const acceptedAt = nowIso();
    const row = [
        crypto.randomUUID(),
        user.user_id,
        user.whatsapp_id,
        acceptedAt,
        TERMS_VERSION,
        'whatsapp',
        buildEvidence({ message, messageId })
    ];
    await appendRowToSheet(CONSENT_SHEET, row);
    return acceptedAt;
}

async function updateUserRowByIndex(rowIndex, userData) {
    const range = `${USERS_SHEET}!A${rowIndex}:J${rowIndex}`;
    const row = [
        userData.user_id || '',
        userData.whatsapp_id || '',
        userData.phone_e164 || '',
        userData.display_name || '',
        userData.status || '',
        userData.created_at || '',
        userData.updated_at || '',
        userData.consent_at || '',
        userData.terms_version || '',
        userData.deleted_at || ''
    ];
    await updateRowInSheet(range, row);
}

function mapProfileRow(row, rowIndex) {
    return {
        rowIndex,
        user_id: row[0] || '',
        monthly_income: row[1] || '',
        fixed_expense_estimate: row[2] || '',
        has_debt: row[3] || '',
        primary_goal: row[4] || '',
        onboarding_completed_at: row[5] || ''
    };
}

async function getUserProfileByUserId(userId) {
    const rows = await readDataFromSheet(`${PROFILE_SHEET}!A:F`);
    if (!rows || rows.length <= 1) return null;
    const profiles = rows.slice(1).map((row, idx) => mapProfileRow(row, idx + 2));
    return profiles.find(p => p.user_id === userId) || null;
}

async function upsertUserProfile(userId, patch) {
    const existing = await getUserProfileByUserId(userId);
    const base = existing || {
        user_id: userId,
        monthly_income: '',
        fixed_expense_estimate: '',
        has_debt: '',
        primary_goal: '',
        onboarding_completed_at: ''
    };

    const updated = {
        ...base,
        ...patch,
        user_id: userId
    };

    const rowData = [
        updated.user_id,
        updated.monthly_income,
        updated.fixed_expense_estimate,
        updated.has_debt,
        updated.primary_goal,
        updated.onboarding_completed_at
    ];

    if (existing) {
        await updateRowInSheet(`${PROFILE_SHEET}!A${existing.rowIndex}:F${existing.rowIndex}`, rowData);
    } else {
        await appendRowToSheet(PROFILE_SHEET, rowData);
    }

    return getUserProfileByUserId(userId);
}

async function updateUserDisplayName(userId, displayName) {
    const users = await getAllUsers();
    const user = users.find(u => u.user_id === userId);
    if (!user) return null;
    const updated = {
        ...user,
        display_name: String(displayName || '').trim(),
        updated_at: nowIso()
    };
    await updateUserRowByIndex(user.rowIndex, updated);
    return updated;
}

function mapSettingsRow(row, rowIndex) {
    return {
        rowIndex,
        user_id: row[0] || '',
        timezone: row[1] || 'America/Sao_Paulo',
        weekly_checkin_opt_in: row[2] || 'NÃO',
        monthly_report_opt_in: row[3] || 'SIM',
        language: row[4] || 'pt-BR',
        created_at: row[5] || '',
        defaults_enabled: row[6] || 'NÃO',
        default_reserve_percent: row[7] || '10'
    };
}

async function getUserSettingsByUserId(userId) {
    const rows = await readDataFromSheet(`${SETTINGS_SHEET}!A:H`);
    if (!rows || rows.length <= 1) return null;
    const settings = rows.slice(1).map((row, idx) => mapSettingsRow(row, idx + 2));
    return settings.find(s => s.user_id === userId) || null;
}

async function upsertUserSettings(userId, patch) {
    const existing = await getUserSettingsByUserId(userId);
    const base = existing || {
        user_id: userId,
        timezone: 'America/Sao_Paulo',
        weekly_checkin_opt_in: 'NÃO',
        monthly_report_opt_in: 'SIM',
        language: 'pt-BR',
        created_at: nowIso(),
        defaults_enabled: 'NÃO',
        default_reserve_percent: '10'
    };

    const updated = {
        ...base,
        ...patch,
        user_id: userId
    };

    const rowData = [
        updated.user_id,
        updated.timezone,
        updated.weekly_checkin_opt_in,
        updated.monthly_report_opt_in,
        updated.language,
        updated.created_at,
        updated.defaults_enabled,
        updated.default_reserve_percent
    ];

    if (existing) {
        await updateRowInSheet(`${SETTINGS_SHEET}!A${existing.rowIndex}:H${existing.rowIndex}`, rowData);
    } else {
        await appendRowToSheet(SETTINGS_SHEET, rowData);
    }

    return getUserSettingsByUserId(userId);
}

async function getActiveUsers() {
    const users = await getAllUsers();
    return users.filter(u => u.status === 'ACTIVE' && !u.deleted_at);
}

async function activateUserWithConsent(user, { message, messageId }) {
    const acceptedAt = await appendConsentLog(user, { message, messageId });
    const updated = {
        ...user,
        status: 'ACTIVE',
        consent_at: acceptedAt,
        terms_version: TERMS_VERSION,
        updated_at: nowIso()
    };
    await updateUserRowByIndex(user.rowIndex, updated);
    await createDefaultUserRows(updated);
    return updated;
}

async function refreshConsentForActiveUser(user, { message, messageId }) {
    const acceptedAt = await appendConsentLog(user, { message, messageId });
    const updated = {
        ...user,
        status: 'ACTIVE',
        consent_at: acceptedAt,
        terms_version: TERMS_VERSION,
        updated_at: nowIso()
    };
    await updateUserRowByIndex(user.rowIndex, updated);
    return updated;
}

async function updateUserStatus(userId, status) {
    const users = await getAllUsers();
    const user = users.find(u => u.user_id === userId);
    if (!user) return null;

    const now = nowIso();
    const updated = {
        ...user,
        status,
        updated_at: now,
        deleted_at: status === USER_STATUS.DELETED ? now : ''
    };
    await updateUserRowByIndex(user.rowIndex, updated);
    return updated;
}

async function updateUserStatusByWhatsAppId(whatsappOrPhone, status) {
    const user = await getUserByLookup(whatsappOrPhone);
    if (!user) return null;
    return updateUserStatus(user.user_id, status);
}

async function getUserByLookup(lookup) {
    const raw = String(lookup || '').trim();
    if (!raw) return null;

    const users = await getAllUsers();
    const normalizedId = normalizePhoneToWhatsappId(raw);
    if (normalizedId) {
        const exactMatch = users.find(u => normalizeWhatsappId(u.whatsapp_id) === normalizedId);
        if (exactMatch) return exactMatch;
    }

    const rawDigits = normalizeDigits(raw);
    if (!rawDigits) return null;

    return (
        users.find(u => normalizeDigits(u.phone_e164) === rawDigits) ||
        users.find(u => normalizeDigits(u.whatsapp_id) === rawDigits) ||
        null
    );
}

function isPendingExpired(user) {
    if (user.status !== USER_STATUS.PENDING) return false;
    const createdAt = new Date(user.created_at);
    if (Number.isNaN(createdAt.getTime())) return false;
    const elapsedMs = Date.now() - createdAt.getTime();
    return elapsedMs > PENDING_TTL_HOURS * 60 * 60 * 1000;
}

async function expireOldPendingUsers() {
    const users = await getAllUsers();
    let expiredCount = 0;
    for (const user of users) {
        if (!isPendingExpired(user)) continue;
        const updated = {
            ...user,
            status: USER_STATUS.EXPIRED,
            updated_at: nowIso()
        };
        await updateUserRowByIndex(user.rowIndex, updated);
        expiredCount += 1;
    }
    return expiredCount;
}

async function resolveUserAccess(msg) {
    const senderId = msg.author || msg.from;
    const messageBody = String(msg.body || '').trim();
    const messageId = msg.id?.id || '';
    const displayName = msg._data?.notifyName || msg._data?.pushname || '';
    const normalizedMessage = normalizeForCompare(messageBody);
    const legalInfoRequest = isLegalInfoCommand(normalizedMessage);

    let user = await getUserByWhatsAppId(senderId);
    if (!user) {
        user = await createPendingUser(senderId, displayName);
        if (legalInfoRequest) {
            return {
                allowed: false,
                user: null,
                reply: buildPublicLegalSummaryReply({ includeAcceptInstruction: true })
            };
        }
        return {
            allowed: false,
            user: null,
            reply:
                `Olá! Antes de usar o bot, preciso do seu consentimento de dados.\n` +
                `Se você concorda com os termos (versão ${TERMS_VERSION}), responda apenas: ACEITO` +
                buildLegalFooter()
        };
    }

    if ([USER_STATUS.INACTIVE, USER_STATUS.DELETED].includes(user.status)) {
        if (legalInfoRequest) {
            return {
                allowed: false,
                user: null,
                reply: buildPublicLegalSummaryReply({ includeAcceptInstruction: false })
            };
        }
        return {
            allowed: false,
            user: null,
            reply: 'Seu acesso está inativo no momento. Fale com o administrador para reativar.'
        };
    }

    if (user.status === USER_STATUS.BLOCKED) {
        if (legalInfoRequest) {
            return {
                allowed: false,
                user: null,
                reply: buildPublicLegalSummaryReply({ includeAcceptInstruction: false })
            };
        }
        return {
            allowed: false,
            user: null,
            reply: 'Seu acesso está bloqueado. Fale com o administrador para revisão.'
        };
    }

    if (user.status === USER_STATUS.EXPIRED) {
        if (legalInfoRequest) {
            return {
                allowed: false,
                user: null,
                reply: buildPublicLegalSummaryReply({ includeAcceptInstruction: true })
            };
        }
        return {
            allowed: false,
            user: null,
            reply:
                `Seu cadastro inicial expirou. Se quiser continuar, responda: ACEITO\n` +
                `Termos atuais: ${TERMS_VERSION}` +
                buildLegalFooter()
        };
    }

    if (user.status === USER_STATUS.PENDING) {
        if (normalizedMessage === CONSENT_KEYWORD) {
            const activatedUser = await activateUserWithConsent(user, { message: messageBody, messageId });
            return { allowed: true, user: activatedUser, justActivated: true };
        }
        if (legalInfoRequest) {
            return {
                allowed: false,
                user: null,
                reply: buildPublicLegalSummaryReply({ includeAcceptInstruction: true })
            };
        }
        return {
            allowed: false,
            user: null,
            reply:
                `Para ativar seu acesso, responda apenas: ACEITO\n` +
                `Termos atuais: ${TERMS_VERSION}` +
                buildLegalFooter()
        };
    }

    if (user.status !== USER_STATUS.ACTIVE) {
        if (legalInfoRequest) {
            return {
                allowed: false,
                user: null,
                reply: buildPublicLegalSummaryReply({ includeAcceptInstruction: false })
            };
        }
        return {
            allowed: false,
            user: null,
            reply: 'Seu status de acesso não permite uso no momento.'
        };
    }

    // Reconsentimento obrigatório quando versão dos termos muda
    if ((user.terms_version || '') !== TERMS_VERSION) {
        if (normalizedMessage === CONSENT_KEYWORD) {
            const refreshedUser = await refreshConsentForActiveUser(user, { message: messageBody, messageId });
            return { allowed: true, user: refreshedUser, justReconsented: true };
        }
        if (legalInfoRequest) {
            return {
                allowed: false,
                user: null,
                reply: buildPublicLegalSummaryReply({ includeAcceptInstruction: true })
            };
        }
        return {
            allowed: false,
            user: null,
            reply:
                `Atualizamos os termos de uso (versão ${TERMS_VERSION}).\n` +
                `Para continuar usando o bot, responda apenas: ACEITO` +
                buildLegalFooter()
        };
    }

    return { allowed: true, user };
}

function mapConsentRow(row, rowIndex) {
    return {
        rowIndex,
        consent_id: row[0] || '',
        user_id: row[1] || '',
        whatsapp_id: row[2] || '',
        accepted_at: row[3] || '',
        terms_version: row[4] || '',
        channel: row[5] || '',
        evidence: row[6] || ''
    };
}

async function getConsentLogsByUserId(userId, limit = 5) {
    const rows = await readDataFromSheet(`${CONSENT_SHEET}!A:G`);
    if (!rows || rows.length <= 1) return [];

    const parsed = rows.slice(1).map((row, idx) => mapConsentRow(row, idx + 2));
    const filtered = parsed.filter(entry => entry.user_id === userId);

    filtered.sort((a, b) => {
        const da = new Date(a.accepted_at).getTime() || 0;
        const db = new Date(b.accepted_at).getTime() || 0;
        return db - da;
    });

    return filtered.slice(0, Math.max(1, Number(limit) || 5));
}

module.exports = {
    TERMS_VERSION,
    TERMS_URL,
    PRIVACY_URL,
    isLegalInfoCommand,
    buildPublicLegalSummaryReply,
    USER_HEADERS,
    resolveUserAccess,
    USER_STATUS,
    getUserByWhatsAppId,
    getUserByLookup,
    normalizePhoneToWhatsappId,
    createPendingUser,
    getUserProfileByUserId,
    upsertUserProfile,
    updateUserDisplayName,
    getUserSettingsByUserId,
    upsertUserSettings,
    getActiveUsers,
    updateUserStatus,
    updateUserStatusByWhatsAppId,
    getConsentLogsByUserId,
    getAllUsers,
    expireOldPendingUsers
};
