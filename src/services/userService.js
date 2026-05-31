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
const AUTH_GATE_REPLY_COOLDOWN_MS = Number.parseInt(process.env.AUTH_GATE_REPLY_COOLDOWN_MS || String(24 * 60 * 60 * 1000), 10);
const USER_STATUS = Object.freeze({
    PENDING: 'PENDING',
    PENDING_APPROVAL: 'PENDING_APPROVAL',
    APPROVED_AWAITING_GOOGLE: 'APPROVED_AWAITING_GOOGLE',
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

const SETTINGS_HEADERS = [
    'user_id',
    'timezone',
    'weekly_checkin_opt_in',
    'monthly_report_opt_in',
    'language',
    'created_at',
    'defaults_enabled',
    'default_reserve_percent',
    'daily_goal_enabled',
    'daily_goal_amount',
    'daily_goal_last_alert_date',
    'daily_goal_last_alert_level',
    'daily_goal_scope',
    'monthly_budget_enabled',
    'monthly_budget_amount',
    'monthly_budget_last_alert_date',
    'monthly_budget_last_alert_level',
    'monthly_budget_scope',
    'monthly_budget_cycle_start_day'
];

function columnNameFromNumber(columnNumber) {
    let number = Number(columnNumber);
    let name = '';
    while (number > 0) {
        const remainder = (number - 1) % 26;
        name = String.fromCharCode(65 + remainder) + name;
        number = Math.floor((number - 1) / 26);
    }
    return name;
}

function settingsRange(rowIndex = '') {
    const lastColumn = columnNameFromNumber(SETTINGS_HEADERS.length);
    return rowIndex ? `${SETTINGS_SHEET}!A${rowIndex}:${lastColumn}${rowIndex}` : `${SETTINGS_SHEET}!A:${lastColumn}`;
}

let usersCache = [];
let usersCacheLoaded = false;
let usersCacheLoadedAt = 0;
let profilesCache = [];
let profilesCacheLoaded = false;
let profilesCacheLoadedAt = 0;
let settingsCache = [];
let settingsCacheLoaded = false;
let settingsCacheLoadedAt = 0;
const authGateReplyHistory = new Map();

const SHEETS_CACHE_TTL_MS = Number(process.env.USER_SERVICE_CACHE_TTL_MS || 30000);

function nowIso() {
    return new Date().toISOString();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function readCriticalSheet(range, { retries = 3, delayMs = 500 } = {}) {
    let rows = [];
    for (let attempt = 0; attempt < retries; attempt += 1) {
        rows = await readDataFromSheet(range);
        if (rows && rows.length > 0) return rows;
        if (attempt < retries - 1) {
            await sleep(delayMs);
        }
    }
    return rows || [];
}

function isCacheFresh(loaded, loadedAt) {
    return loaded && loadedAt > 0 && (Date.now() - loadedAt) < SHEETS_CACHE_TTL_MS;
}

function invalidateUserCaches() {
    usersCacheLoaded = false;
    profilesCacheLoaded = false;
    settingsCacheLoaded = false;
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
    if (isCacheFresh(usersCacheLoaded, usersCacheLoadedAt)) {
        return usersCache;
    }

    const rows = await readCriticalSheet(`${USERS_SHEET}!A:J`);
    if (!rows || rows.length === 0) {
        return usersCacheLoaded ? usersCache : [];
    }
    if (rows.length <= 1) {
        usersCache = [];
        usersCacheLoaded = true;
        usersCacheLoadedAt = Date.now();
        return [];
    }
    usersCache = rows.slice(1).map((row, idx) => mapUserRow(row, idx + 2));
    usersCacheLoaded = true;
    usersCacheLoadedAt = Date.now();
    return usersCache;
}

async function getUserByWhatsAppId(whatsappId) {
    const normalized = normalizeWhatsappId(whatsappId);
    const users = await getAllUsers();
    const matches = users.filter(u => normalizeWhatsappId(u.whatsapp_id) === normalized);
    if (matches.length === 0) return null;

    return (
        matches.find(u => u.status === USER_STATUS.ACTIVE) ||
        matches.find(u => u.status === USER_STATUS.APPROVED_AWAITING_GOOGLE) ||
        matches.find(u => u.status === USER_STATUS.PENDING_APPROVAL) ||
        matches.find(u => u.status === USER_STATUS.PENDING) ||
        matches.find(u => ![USER_STATUS.DELETED, USER_STATUS.EXPIRED].includes(u.status)) ||
        matches[0]
    );
}

async function getUserById(userId) {
    const safeUserId = String(userId || '').trim();
    if (!safeUserId) return null;
    const users = await getAllUsers();
    return users.find(u => u.user_id === safeUserId) || null;
}

async function createPendingUser(whatsappId, displayName = '') {
    const existing = await getUserByWhatsAppId(whatsappId);
    if (existing) return existing;

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
    usersCacheLoaded = false;
    return getUserByWhatsAppId(whatsappId);
}

async function createDefaultUserRows(user) {
    const userId = user.user_id;
    const timestamp = nowIso();
    await appendRowToSheet(PROFILE_SHEET, [userId, '', '', '', '', '', '']);
    profilesCacheLoaded = false;
    await appendRowToSheet(SETTINGS_SHEET, buildSettingsRow({
        user_id: userId,
        timezone: 'America/Sao_Paulo',
        weekly_checkin_opt_in: 'NÃO',
        monthly_report_opt_in: 'SIM',
        language: 'pt-BR',
        created_at: timestamp,
        defaults_enabled: 'NÃO',
        default_reserve_percent: '10',
        daily_goal_enabled: 'NÃO',
        daily_goal_amount: '',
        daily_goal_last_alert_date: '',
        daily_goal_last_alert_level: '',
        daily_goal_scope: 'personal',
        monthly_budget_enabled: 'NÃO',
        monthly_budget_amount: '',
        monthly_budget_last_alert_date: '',
        monthly_budget_last_alert_level: '',
        monthly_budget_scope: 'personal',
        monthly_budget_cycle_start_day: '1'
    }));
    settingsCacheLoaded = false;
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
    return '\nPara ler o resumo de termos e privacidade, envie: termos';
}

function isLegalInfoCommand(normalizedMessage) {
    return LEGAL_INFO_KEYWORDS.has(String(normalizedMessage || '').trim());
}

function shouldSilenceRepeatedAuthGateReply(senderId, normalizedMessage) {
    const message = String(normalizedMessage || '').trim();
    if (!senderId) return false;
    if (message === CONSENT_KEYWORD || isLegalInfoCommand(message)) return false;
    if (!Number.isFinite(AUTH_GATE_REPLY_COOLDOWN_MS) || AUTH_GATE_REPLY_COOLDOWN_MS <= 0) return false;

    const now = Date.now();
    const lastReplyAt = authGateReplyHistory.get(senderId) || 0;
    if (lastReplyAt && (now - lastReplyAt) < AUTH_GATE_REPLY_COOLDOWN_MS) {
        return true;
    }
    authGateReplyHistory.set(senderId, now);
    return false;
}

function buildSilentAuthGateResponse(user = null) {
    return {
        allowed: false,
        user,
        silent: true,
        reply: ''
    };
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
        '- Uso condicionado ao consentimento por ACEITO.',
        '- Dados tratados: identificação do WhatsApp e lançamentos financeiros enviados por você.',
        '- Finalidade: operação do bot, relatórios e auditoria.',
        '- Ciclo de vida: PENDING, PENDING_APPROVAL, APPROVED_AWAITING_GOOGLE, ACTIVE, INACTIVE, BLOCKED, DELETED, EXPIRED.',
        '- Mudança de termos exige novo consentimento.'
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
    usersCacheLoaded = false;
}

function mapProfileRow(row, rowIndex) {
    const isLegacyProfileRow = row.length <= 6;
    if (isLegacyProfileRow) {
        return {
            rowIndex,
            user_id: row[0] || '',
            full_name: '',
            monthly_income: row[1] || '',
            fixed_expense_estimate: row[2] || '',
            has_debt: row[3] || '',
            primary_goal: row[4] || '',
            onboarding_completed_at: row[5] || ''
        };
    }

    return {
        rowIndex,
        user_id: row[0] || '',
        full_name: row[1] || '',
        monthly_income: row[2] || '',
        fixed_expense_estimate: row[3] || '',
        has_debt: row[4] || '',
        primary_goal: row[5] || '',
        onboarding_completed_at: row[6] || ''
    };
}

async function getUserProfileByUserId(userId) {
    if (isCacheFresh(profilesCacheLoaded, profilesCacheLoadedAt)) {
        const matches = profilesCache.filter(p => p.user_id === userId);
        const completed = matches.filter(p => p.onboarding_completed_at);
        return completed[completed.length - 1] || matches[matches.length - 1] || null;
    }

    const rows = await readCriticalSheet(`${PROFILE_SHEET}!A:G`);
    if (!rows || rows.length === 0) {
        if (!profilesCacheLoaded) return null;
        const cachedMatches = profilesCache.filter(p => p.user_id === userId);
        const cachedCompleted = cachedMatches.filter(p => p.onboarding_completed_at);
        return cachedCompleted[cachedCompleted.length - 1] || cachedMatches[cachedMatches.length - 1] || null;
    }
    if (rows.length <= 1) {
        profilesCache = [];
        profilesCacheLoaded = true;
        profilesCacheLoadedAt = Date.now();
        return null;
    }

    profilesCache = rows.slice(1).map((row, idx) => mapProfileRow(row, idx + 2));
    profilesCacheLoaded = true;
    profilesCacheLoadedAt = Date.now();
    const matches = profilesCache.filter(p => p.user_id === userId);
    if (matches.length === 0) return null;

    // Sheets can briefly expose duplicate profile rows if a default row is
    // created at activation and a later upsert appends before the first row is
    // visible. Prefer the completed/latest profile so onboarding does not
    // restart for users who already finished it.
    const completed = matches.filter(p => p.onboarding_completed_at);
    if (completed.length > 0) return completed[completed.length - 1];
    return matches[matches.length - 1];
}

async function upsertUserProfile(userId, patch) {
    const existing = await getUserProfileByUserId(userId);
    const base = existing || {
        user_id: userId,
        full_name: '',
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
        updated.full_name,
        updated.monthly_income,
        updated.fixed_expense_estimate,
        updated.has_debt,
        updated.primary_goal,
        updated.onboarding_completed_at
    ];

    if (existing) {
        await updateRowInSheet(`${PROFILE_SHEET}!A${existing.rowIndex}:G${existing.rowIndex}`, rowData);
        const cached = { ...updated, rowIndex: existing.rowIndex };
        profilesCache = profilesCache
            .filter(profile => !(profile.user_id === userId && profile.rowIndex === existing.rowIndex))
            .concat(cached)
            .sort((a, b) => (a.rowIndex || 0) - (b.rowIndex || 0));
        profilesCacheLoaded = true;
        profilesCacheLoadedAt = Date.now();
    } else {
        await appendRowToSheet(PROFILE_SHEET, rowData);
        profilesCacheLoaded = false;
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
        default_reserve_percent: row[7] || '10',
        daily_goal_enabled: row[8] || 'NÃO',
        daily_goal_amount: row[9] || '',
        daily_goal_last_alert_date: row[10] || '',
        daily_goal_last_alert_level: row[11] || '',
        daily_goal_scope: row[12] || 'personal',
        monthly_budget_enabled: row[13] || 'NÃO',
        monthly_budget_amount: row[14] || '',
        monthly_budget_last_alert_date: row[15] || '',
        monthly_budget_last_alert_level: row[16] || '',
        monthly_budget_scope: row[17] || 'personal',
        monthly_budget_cycle_start_day: row[18] || '1'
    };
}

function buildSettingsRow(settings) {
    return [
        settings.user_id,
        settings.timezone,
        settings.weekly_checkin_opt_in,
        settings.monthly_report_opt_in,
        settings.language,
        settings.created_at,
        settings.defaults_enabled,
        settings.default_reserve_percent,
        settings.daily_goal_enabled,
        settings.daily_goal_amount,
        settings.daily_goal_last_alert_date,
        settings.daily_goal_last_alert_level,
        settings.daily_goal_scope,
        settings.monthly_budget_enabled,
        settings.monthly_budget_amount,
        settings.monthly_budget_last_alert_date,
        settings.monthly_budget_last_alert_level,
        settings.monthly_budget_scope,
        settings.monthly_budget_cycle_start_day
    ];
}

async function getUserSettingsByUserId(userId) {
    if (isCacheFresh(settingsCacheLoaded, settingsCacheLoadedAt)) {
        return settingsCache.find(s => s.user_id === userId) || null;
    }

    const rows = await readCriticalSheet(settingsRange());
    if (!rows || rows.length <= 1) {
        settingsCache = [];
        settingsCacheLoaded = true;
        settingsCacheLoadedAt = Date.now();
        return null;
    }
    settingsCache = rows.slice(1).map((row, idx) => mapSettingsRow(row, idx + 2));
    settingsCacheLoaded = true;
    settingsCacheLoadedAt = Date.now();
    return settingsCache.find(s => s.user_id === userId) || null;
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
        default_reserve_percent: '10',
        daily_goal_enabled: 'NÃO',
        daily_goal_amount: '',
        daily_goal_last_alert_date: '',
        daily_goal_last_alert_level: '',
        daily_goal_scope: 'personal',
        monthly_budget_enabled: 'NÃO',
        monthly_budget_amount: '',
        monthly_budget_last_alert_date: '',
        monthly_budget_last_alert_level: '',
        monthly_budget_scope: 'personal',
        monthly_budget_cycle_start_day: '1'
    };

    const updated = {
        ...base,
        ...patch,
        user_id: userId
    };

    const rowData = buildSettingsRow(updated);

    if (existing) {
        await updateRowInSheet(settingsRange(existing.rowIndex), rowData);
    } else {
        await appendRowToSheet(SETTINGS_SHEET, rowData);
    }
    settingsCacheLoaded = false;

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
        status: USER_STATUS.PENDING_APPROVAL,
        consent_at: acceptedAt,
        terms_version: TERMS_VERSION,
        updated_at: nowIso()
    };
    await updateUserRowByIndex(user.rowIndex, updated);
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

async function approveUserByWhatsAppId(whatsappOrPhone) {
    const user = await getUserByLookup(whatsappOrPhone);
    if (!user) return null;

    const updated = await updateUserStatus(user.user_id, USER_STATUS.APPROVED_AWAITING_GOOGLE);
    if (updated) {
        await createDefaultUserRows(updated);
    }
    return updated;
}

async function denyUserByWhatsAppId(whatsappOrPhone) {
    const user = await getUserByLookup(whatsappOrPhone);
    if (!user) return null;
    return updateUserStatus(user.user_id, USER_STATUS.BLOCKED);
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
                `Antes de começar, preciso do seu consentimento para guardar e processar seus dados financeiros.\n\n` +
                `Para aceitar os termos (${TERMS_VERSION}), envie: ACEITO` +
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
        if (normalizedMessage === CONSENT_KEYWORD) {
            const activatedUser = await activateUserWithConsent(user, { message: messageBody, messageId });
            return {
                allowed: false,
                user: activatedUser,
                justSubmittedForApproval: true,
                notifyAdmins: true,
                reply: 'Consentimento registrado. Seu cadastro agora está aguardando aprovação do administrador.'
            };
        }
        if (legalInfoRequest) {
            return {
                allowed: false,
                user: null,
                reply: buildPublicLegalSummaryReply({ includeAcceptInstruction: true })
            };
        }
        if (shouldSilenceRepeatedAuthGateReply(senderId, normalizedMessage)) {
            return buildSilentAuthGateResponse(user);
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
            return {
                allowed: false,
                user: activatedUser,
                justSubmittedForApproval: true,
                notifyAdmins: true,
                reply: 'Consentimento registrado. Seu cadastro agora está aguardando aprovação do administrador.'
            };
        }
        if (legalInfoRequest) {
            return {
                allowed: false,
                user: null,
                reply: buildPublicLegalSummaryReply({ includeAcceptInstruction: true })
            };
        }
        if (shouldSilenceRepeatedAuthGateReply(senderId, normalizedMessage)) {
            return buildSilentAuthGateResponse(user);
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

    if (user.status === USER_STATUS.PENDING_APPROVAL) {
        if (legalInfoRequest) {
            return {
                allowed: false,
                user,
                reply: buildPublicLegalSummaryReply({ includeAcceptInstruction: false })
            };
        }
        if (shouldSilenceRepeatedAuthGateReply(senderId, normalizedMessage)) {
            return buildSilentAuthGateResponse(user);
        }
        return {
            allowed: false,
            user,
            reply: 'Seu cadastro já está aguardando aprovação do administrador. Assim que for aprovado, você receberá o próximo passo.'
        };
    }

    if (user.status === USER_STATUS.APPROVED_AWAITING_GOOGLE) {
        if (legalInfoRequest) {
            return {
                allowed: false,
                user,
                reply: buildPublicLegalSummaryReply({ includeAcceptInstruction: false })
            };
        }
        return {
            allowed: false,
            user,
            googleConnectRequired: true,
            reply: 'Seu cadastro foi aprovado. Agora falta conectar sua conta Google para criar sua planilha no seu Drive e ativar o bot.'
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
    const rows = await readCriticalSheet(`${CONSENT_SHEET}!A:G`);
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
    getUserById,
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
    approveUserByWhatsAppId,
    denyUserByWhatsAppId,
    getConsentLogsByUserId,
    getAllUsers,
    invalidateUserCaches,
    expireOldPendingUsers,
    __test__: {
        SETTINGS_HEADERS,
        columnNameFromNumber,
        settingsRange,
        buildSettingsRow
    }
};
