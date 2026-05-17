const test = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');

const dashboardServerPath = require.resolve('../src/services/dashboardServer');
const readModelPath = require.resolve('../src/services/readModelService');
const googleOAuthPath = require.resolve('../src/services/googleOAuthService');
const whatsappPath = require.resolve('../src/services/whatsapp');
const userServicePath = require.resolve('../src/services/userService');

let whatsappMessages = [];

function installMocks({ callbackResult = { userId: 'user-oauth-route' } } = {}) {
    whatsappMessages = [];
    delete require.cache[dashboardServerPath];
    delete require.cache[readModelPath];
    delete require.cache[googleOAuthPath];
    delete require.cache[whatsappPath];
    delete require.cache[userServicePath];

    require.cache[readModelPath] = {
        id: readModelPath,
        filename: readModelPath,
        loaded: true,
        exports: {
            syncReadModelIfNeeded: async () => ({}),
            getDashboardSnapshot: () => null,
            getDashboardSqlData: () => null,
            isSqliteReady: () => true,
            ALL_USERS_ID: '__ALL_USERS__'
        }
    };

    require.cache[googleOAuthPath] = {
        id: googleOAuthPath,
        filename: googleOAuthPath,
        loaded: true,
        exports: {
            buildGoogleAuthorizationUrl: (state) => {
                if (state === 'bad') throw new Error('State OAuth inválido ou expirado.');
                return `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}`;
            },
            completeGoogleOAuthCallback: async ({ code, state }) => {
                if (code === 'bad') throw new Error('Falha OAuth de teste.');
                return { ...callbackResult, code, state };
            }
        }
    };

    require.cache[whatsappPath] = {
        id: whatsappPath,
        filename: whatsappPath,
        loaded: true,
        exports: {
            sendWhatsAppMessage: async (to, message) => {
                whatsappMessages.push({ to, message });
            }
        }
    };

    require.cache[userServicePath] = {
        id: userServicePath,
        filename: userServicePath,
        loaded: true,
        exports: {
            getAllUsers: async () => [],
            getUserProfileByUserId: async () => ({ onboarding_completed_at: '' })
        }
    };
}

async function startTestServer() {
    process.env.DASHBOARD_ENABLED = 'true';
    process.env.DASHBOARD_HOST = '127.0.0.1';
    process.env.DASHBOARD_PORT = '0';
    installMocks();
    const { startDashboardServer } = require('../src/services/dashboardServer');
    const server = startDashboardServer();
    if (!server.listening) await once(server, 'listening');
    const address = server.address();
    return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

test('OAuth start route redirects to Google authorization URL without exposing internals', async () => {
    const { server, baseUrl } = await startTestServer();
    try {
        const res = await fetch(`${baseUrl}/oauth/google/start?state=signed-state`, { redirect: 'manual' });
        assert.strictEqual(res.status, 302);
        assert.strictEqual(
            res.headers.get('location'),
            'https://accounts.google.com/o/oauth2/v2/auth?state=signed-state'
        );
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('OAuth start route rejects invalid state safely', async () => {
    const { server, baseUrl } = await startTestServer();
    try {
        const res = await fetch(`${baseUrl}/oauth/google/start?state=bad`);
        const body = await res.text();
        assert.strictEqual(res.status, 400);
        assert.match(body, /Link de conexão inválido ou expirado/);
        assert.doesNotMatch(body, /stack|Error:/i);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('OAuth callback stores connection through service and returns safe success page', async () => {
    const { server, baseUrl } = await startTestServer();
    try {
        const res = await fetch(`${baseUrl}/oauth/google/callback?code=abc123&state=signed-state`);
        const body = await res.text();
        assert.strictEqual(res.status, 200);
        assert.match(body, /Google conectado com sucesso/);
        assert.doesNotMatch(body, /abc123|signed-state/);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('OAuth callback notifies user on WhatsApp after successful connection', async () => {
    process.env.USER_MANUAL_URL = 'https://docs.google.com/document/d/manual-id/view';
    installMocks({
        callbackResult: {
            userId: 'user-oauth-route',
            whatsappId: '5599999999999@c.us',
            spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-id/edit'
        }
    });
    const { startDashboardServer } = require('../src/services/dashboardServer');
    const server = startDashboardServer();
    if (!server.listening) await once(server, 'listening');
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
        const res = await fetch(`${baseUrl}/oauth/google/callback?code=abc123&state=signed-state`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(whatsappMessages.length, 1);
        assert.strictEqual(whatsappMessages[0].to, '5599999999999@c.us');
        assert.match(whatsappMessages[0].message, /Google conectado com sucesso/);
        assert.match(whatsappMessages[0].message, /Planilha/);
        assert.match(whatsappMessages[0].message, /Manual completo somente leitura/);
        assert.match(whatsappMessages[0].message, /aba "Manual"/);
        assert.match(whatsappMessages[0].message, /planilha é individual/i);
        assert.match(whatsappMessages[0].message, /\[1\/6\].*nome completo/);
        assert.match(whatsappMessages[0].message, /Depois do onboarding/);
    } finally {
        delete process.env.USER_MANUAL_URL;
        await new Promise(resolve => server.close(resolve));
    }
});

test('OAuth callback rejects missing code safely', async () => {
    const { server, baseUrl } = await startTestServer();
    try {
        const res = await fetch(`${baseUrl}/oauth/google/callback?state=signed-state`);
        const body = await res.text();
        assert.strictEqual(res.status, 400);
        assert.match(body, /Não foi possível concluir/);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
