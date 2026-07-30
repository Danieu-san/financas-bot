const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const whatsappPath = path.resolve(__dirname, '../src/services/whatsapp.js');
const loggerPath = path.resolve(__dirname, '../src/utils/logger.js');
const supervisorExitPath = path.resolve(__dirname, '../src/services/supervisorExitService.js');
const {
    createSupervisorExitRequester
} = require(supervisorExitPath);

function installModule(modulePath, exports) {
    require.cache[modulePath] = {
        id: modulePath,
        filename: modulePath,
        loaded: true,
        exports
    };
}

function loadWhatsappService({ supervisorOptions = null } = {}) {
    delete require.cache[whatsappPath];
    installModule(loggerPath, {
        info() {},
        warn() {},
        error() {},
        safeError(error) {
            return String(error?.message || error || '');
        }
    });
    if (supervisorOptions) {
        installModule(supervisorExitPath, {
            createSupervisorExitRequester() {
                return createSupervisorExitRequester(supervisorOptions);
            }
        });
    }

    class FakeClient extends EventEmitter {
        constructor(options) {
            super();
            this.options = options;
            this.state = 'CONNECTED';
            this.sendError = null;
            FakeClient.instance = this;
        }

        initialize() {
            return Promise.resolve();
        }

        getState() {
            return Promise.resolve(this.state);
        }

        sendMessage() {
            if (this.sendError) return Promise.reject(this.sendError);
            return Promise.resolve({ id: 'synthetic' });
        }
    }

    class FakeLocalAuth {
        constructor(options) {
            this.options = options;
        }
    }

    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'whatsapp-web.js') {
            return { Client: FakeClient, LocalAuth: FakeLocalAuth };
        }
        if (request === 'qrcode-terminal') {
            return { generate() {} };
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    try {
        return {
            service: require(whatsappPath),
            FakeClient
        };
    } finally {
        Module._load = originalLoad;
    }
}

test('product WhatsApp service reflects lifecycle and runtime probes in health', async () => {
    const previousInterval = process.env.WWEB_LIVENESS_INTERVAL_MS;
    const previousThreshold = process.env.WWEB_LIVENESS_FAILURE_THRESHOLD;
    process.env.WWEB_LIVENESS_INTERVAL_MS = '600000';
    process.env.WWEB_LIVENESS_FAILURE_THRESHOLD = '2';

    try {
        const { service, FakeClient } = loadWhatsappService();
        const client = service.initializeWhatsAppClient();

        assert.equal(service.getWhatsAppHealth().status, 'starting');

        client.emit('qr', 'synthetic-qr');
        assert.equal(service.getWhatsAppHealth().status, 'qr_pending');

        client.emit('authenticated');
        assert.equal(service.getWhatsAppHealth().status, 'authenticated');

        client.emit('ready');
        assert.equal(service.getWhatsAppHealth().status, 'ready');
        assert.equal(service.getWhatsAppHealth().liveness, 'healthy');

        FakeClient.instance.state = 'UNPAIRED';
        const degraded = await service.runWhatsAppLivenessProbe();
        assert.equal(degraded.ok, false);
        assert.equal(service.getWhatsAppHealth().status, 'degraded');

        FakeClient.instance.state = 'CONNECTED';
        const recovered = await service.runWhatsAppLivenessProbe();
        assert.equal(recovered.ok, true);
        assert.equal(service.getWhatsAppHealth().status, 'ready');
        assert.equal(service.getWhatsAppHealth().consecutiveFailures, 0);
    } finally {
        if (previousInterval === undefined) delete process.env.WWEB_LIVENESS_INTERVAL_MS;
        else process.env.WWEB_LIVENESS_INTERVAL_MS = previousInterval;
        if (previousThreshold === undefined) delete process.env.WWEB_LIVENESS_FAILURE_THRESHOLD;
        else process.env.WWEB_LIVENESS_FAILURE_THRESHOLD = previousThreshold;
        delete require.cache[whatsappPath];
        delete require.cache[loggerPath];
    }
});

test('product send wrapper records a sanitized transport failure', async () => {
    const previousInterval = process.env.WWEB_LIVENESS_INTERVAL_MS;
    process.env.WWEB_LIVENESS_INTERVAL_MS = '600000';

    try {
        const { service, FakeClient } = loadWhatsappService();
        const client = service.initializeWhatsAppClient();
        client.emit('ready');
        FakeClient.instance.sendError = new Error('Runtime.callFunctionOn timed out with private payload');

        await assert.rejects(
            service.sendWhatsAppMessage('synthetic-recipient', 'synthetic-message'),
            /Runtime\.callFunctionOn/
        );

        const health = service.getWhatsAppHealth();
        assert.equal(health.status, 'degraded');
        assert.equal(health.lastReason, 'protocol_timeout');
        assert.equal(JSON.stringify(health).includes('private payload'), false);
        assert.equal(JSON.stringify(health).includes('synthetic-recipient'), false);
        assert.equal(JSON.stringify(health).includes('synthetic-message'), false);
    } finally {
        if (previousInterval === undefined) delete process.env.WWEB_LIVENESS_INTERVAL_MS;
        else process.env.WWEB_LIVENESS_INTERVAL_MS = previousInterval;
        delete require.cache[whatsappPath];
        delete require.cache[loggerPath];
    }
});

test('product routes liveness and disconnected causes through one idempotent supervisor exit', async () => {
    const previousInterval = process.env.WWEB_LIVENESS_INTERVAL_MS;
    const previousThreshold = process.env.WWEB_LIVENESS_FAILURE_THRESHOLD;
    process.env.WWEB_LIVENESS_INTERVAL_MS = '600000';
    process.env.WWEB_LIVENESS_FAILURE_THRESHOLD = '2';
    const timers = [];
    const exits = [];

    try {
        const { service, FakeClient } = loadWhatsappService({
            supervisorOptions: {
                logger: { error() {} },
                setTimeoutFn(callback, delayMs) {
                    timers.push({ callback, delayMs });
                    return timers.length;
                },
                exitFn(code) {
                    exits.push(code);
                }
            }
        });
        const client = service.initializeWhatsAppClient();
        client.emit('ready');
        FakeClient.instance.state = 'UNPAIRED';

        await service.runWhatsAppLivenessProbe();
        await service.runWhatsAppLivenessProbe();
        client.emit('disconnected', 'NETWORK');

        assert.equal(timers.length, 1);
        timers[0].callback();
        assert.deepEqual(exits, [1]);
    } finally {
        if (previousInterval === undefined) delete process.env.WWEB_LIVENESS_INTERVAL_MS;
        else process.env.WWEB_LIVENESS_INTERVAL_MS = previousInterval;
        if (previousThreshold === undefined) delete process.env.WWEB_LIVENESS_FAILURE_THRESHOLD;
        else process.env.WWEB_LIVENESS_FAILURE_THRESHOLD = previousThreshold;
        delete require.cache[whatsappPath];
        delete require.cache[loggerPath];
        delete require.cache[supervisorExitPath];
    }
});
