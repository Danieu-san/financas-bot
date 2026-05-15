const test = require('node:test');
const assert = require('node:assert');

process.env.NODE_ENV = 'test';
process.env.TERMS_VERSION = process.env.TERMS_VERSION || 'v1.1';

const USERS_HEADERS = [
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

function buildUserRow({
    userId = 'user-lifecycle-1',
    whatsappId = '5599992000001@c.us',
    displayName = 'Usuario Ciclo',
    status = 'ACTIVE',
    createdAt = '2026-01-01T00:00:00.000Z',
    updatedAt = '2026-01-01T00:00:00.000Z',
    consentAt = '2026-01-01T00:00:00.000Z',
    termsVersion = process.env.TERMS_VERSION,
    deletedAt = ''
} = {}) {
    const phone = `+${String(whatsappId).replace('@c.us', '').replace('@lid', '')}`;
    return [userId, whatsappId, phone, displayName, status, createdAt, updatedAt, consentAt, termsVersion, deletedAt];
}

function installUserServiceWithSheets({ users = [] } = {}) {
    const userServicePath = require.resolve('../src/services/userService');
    const googlePath = require.resolve('../src/services/google');
    delete require.cache[userServicePath];

    const sheets = {
        Users: [USERS_HEADERS, ...users],
        UserProfile: [['user_id', 'monthly_income', 'fixed_expense_estimate', 'has_debt', 'primary_goal', 'onboarding_completed_at']],
        UserSettings: [['user_id', 'timezone', 'weekly_checkin_enabled', 'monthly_report_enabled', 'language', 'created_at', 'auto_reserve_enabled', 'auto_reserve_percent']],
        ConsentLog: [['consent_id', 'user_id', 'whatsapp_id', 'accepted_at', 'terms_version', 'channel', 'evidence']]
    };

    function getSheetName(rangeOrSheet) {
        return String(rangeOrSheet || '').split('!')[0];
    }

    require.cache[googlePath] = {
        id: googlePath,
        filename: googlePath,
        loaded: true,
        exports: {
            readDataFromSheet: async (range) => sheets[getSheetName(range)] || [],
            appendRowToSheet: async (sheetName, row) => {
                sheets[getSheetName(sheetName)].push(row);
            },
            updateRowInSheet: async (range, row) => {
                const sheetName = getSheetName(range);
                const rowMatch = String(range).match(/![A-Z]+(\d+):/);
                const rowNumber = Number(rowMatch?.[1] || 0);
                sheets[sheetName][rowNumber - 1] = row;
            }
        }
    };

    const userService = require('../src/services/userService');
    return { userService, sheets };
}

function createMessage(body, from = '5599992000001@c.us') {
    return {
        id: { id: `lifecycle-${Date.now()}` },
        body,
        from,
        author: from,
        _data: { notifyName: 'Usuario Ciclo', pushname: 'Usuario Ciclo' }
    };
}

test('user lifecycle: PENDING user sees consent gate before normal flows', async () => {
    const whatsappId = '5599992000001@c.us';
    const { userService } = installUserServiceWithSheets({
        users: [buildUserRow({ whatsappId, status: 'PENDING', consentAt: '', termsVersion: '' })]
    });

    const access = await userService.resolveUserAccess(createMessage('gastei 10 no pix', whatsappId));

    assert.strictEqual(access.allowed, false);
    assert.match(access.reply, /responda apenas: ACEITO/i);
});

test('user lifecycle: ACTIVE user with current terms bypasses consent gate', async () => {
    const whatsappId = '5599992000002@c.us';
    const { userService } = installUserServiceWithSheets({
        users: [buildUserRow({ whatsappId, status: 'ACTIVE' })]
    });

    const access = await userService.resolveUserAccess(createMessage('gastei 10 no pix', whatsappId));

    assert.strictEqual(access.allowed, true);
    assert.strictEqual(access.user.status, 'ACTIVE');
    assert.strictEqual(access.reply, undefined);
});

test('user lifecycle: INACTIVE, BLOCKED and DELETED users cannot use normal flows', async () => {
    const cases = [
        ['INACTIVE', /inativo/i],
        ['BLOCKED', /bloqueado/i],
        ['DELETED', /inativo/i]
    ];

    for (const [status, replyPattern] of cases) {
        const whatsappId = `55999920000${status.length}@c.us`;
        const { userService } = installUserServiceWithSheets({
            users: [buildUserRow({ whatsappId, status })]
        });

        const access = await userService.resolveUserAccess(createMessage('gastei 10 no pix', whatsappId));

        assert.strictEqual(access.allowed, false, `${status} should be blocked`);
        assert.match(access.reply, replyPattern, `${status} should explain the lifecycle block`);
    }
});

test('user lifecycle: PENDING user accepts terms and waits for admin approval', async () => {
    const whatsappId = '5599992000003@c.us';
    const { userService, sheets } = installUserServiceWithSheets({
        users: [buildUserRow({ whatsappId, status: 'PENDING', consentAt: '', termsVersion: '' })]
    });

    const access = await userService.resolveUserAccess(createMessage('ACEITO', whatsappId));

    assert.strictEqual(access.allowed, false);
    assert.strictEqual(access.justSubmittedForApproval, true);
    assert.strictEqual(access.notifyAdmins, true);
    assert.strictEqual(access.user.status, 'PENDING_APPROVAL');
    assert.strictEqual(access.user.terms_version, process.env.TERMS_VERSION);
    assert.match(access.reply, /aguardando aprovação/i);
    assert.strictEqual(sheets.ConsentLog.length, 2, 'Acceptance should append consent evidence');
    assert.strictEqual(sheets.UserProfile.length, 1, 'Pending approval should not start onboarding profile');
    assert.strictEqual(sheets.UserSettings.length, 1, 'Pending approval should not create active settings');
});

test('user lifecycle: PENDING_APPROVAL user remains blocked from normal flows', async () => {
    const whatsappId = '5599992000004@c.us';
    const { userService } = installUserServiceWithSheets({
        users: [buildUserRow({ whatsappId, status: 'PENDING_APPROVAL' })]
    });

    const access = await userService.resolveUserAccess(createMessage('dashboard', whatsappId));

    assert.strictEqual(access.allowed, false);
    assert.match(access.reply, /aguardando aprovação/i);
});

test('user lifecycle: APPROVED_AWAITING_GOOGLE user must connect Google before normal flows', async () => {
    const whatsappId = '5599992000005@c.us';
    const { userService } = installUserServiceWithSheets({
        users: [buildUserRow({ whatsappId, status: 'APPROVED_AWAITING_GOOGLE' })]
    });

    const access = await userService.resolveUserAccess(createMessage('dashboard', whatsappId));

    assert.strictEqual(access.allowed, false);
    assert.strictEqual(access.googleConnectRequired, true);
    assert.match(access.reply, /conectar sua conta Google/i);
});

test('user lifecycle: admin approval moves user to APPROVED_AWAITING_GOOGLE and creates defaults', async () => {
    const whatsappId = '5599992000006@c.us';
    const { userService, sheets } = installUserServiceWithSheets({
        users: [buildUserRow({ whatsappId, status: 'PENDING_APPROVAL' })]
    });

    const updated = await userService.approveUserByWhatsAppId(whatsappId);

    assert.strictEqual(updated.status, 'APPROVED_AWAITING_GOOGLE');
    assert.strictEqual(sheets.UserProfile.length, 2, 'Approval should create default profile');
    assert.strictEqual(sheets.UserSettings.length, 2, 'Approval should create default settings');
});

test('user lifecycle: EXPIRED user can accept terms again and waits for admin approval', async () => {
    const whatsappId = '5599992000003@c.us';
    const { userService, sheets } = installUserServiceWithSheets({
        users: [buildUserRow({ whatsappId, status: 'EXPIRED', consentAt: '', termsVersion: '' })]
    });

    const access = await userService.resolveUserAccess(createMessage('ACEITO', whatsappId));

    assert.strictEqual(access.allowed, false);
    assert.strictEqual(access.justSubmittedForApproval, true);
    assert.strictEqual(access.user.status, 'PENDING_APPROVAL');
    assert.strictEqual(access.user.terms_version, process.env.TERMS_VERSION);
    assert.strictEqual(sheets.ConsentLog.length, 2, 'Reactivation should append consent evidence');
    assert.strictEqual(sheets.UserProfile.length, 1, 'Reactivation should wait for admin approval before defaults');
    assert.strictEqual(sheets.UserSettings.length, 1, 'Reactivation should wait for admin approval before defaults');
});
