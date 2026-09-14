'use strict';

const { freezeDeep } = require('../kernel/canonicalValue');

// Configuration to be measured in the execution closure. Exporting this object
// does not enforce confinement: the disposable TCB must apply and verify it.
const EXECUTION_PROFILE = freezeDeep({
    format: 'financasbot.provenance.execution-profile',
    version: 1,
    ses_version: '2.3.0',
    node_version: '22.17.0',
    native_timezone: { icu: '77.1', tz: '2025b', cldr: '47.0', unicode: '16.0' },
    guest: { ecma_version: 2022, source_type: 'script', parameter: 'operands' },
    lockdown: {
        errorTaming: 'safe', errorTrapping: 'none', reporting: 'none',
        unhandledRejectionTrapping: 'none', regExpTaming: 'safe', localeTaming: 'safe',
        consoleTaming: 'safe', overrideTaming: 'severe', stackFiltering: 'concise',
        domainTaming: 'safe', evalTaming: 'safe-eval', overrideDebug: [],
        legacyRegeneratorRuntimeTaming: 'safe', __hardenTaming__: 'safe'
    },
    evaluate: { transforms: [], __evadeHtmlCommentTest__: false,
        __evadeImportExpressionTest__: false, __rejectSomeDirectEvalExpressions__: true },
    denied_globals: [
        'process', 'require', 'module', 'exports', 'Buffer', '__dirname', '__filename',
        'fetch', 'WebSocket', 'XMLHttpRequest', 'console', 'Date', 'Intl', 'Promise',
        'setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval',
        'clearImmediate', 'queueMicrotask', 'performance', 'crypto',
        'eval', 'Function', 'Compartment', 'lockdown', 'harden',
        'WeakRef', 'FinalizationRegistry', 'SharedArrayBuffer', 'Atomics', 'WebAssembly'
    ]
});

module.exports = { EXECUTION_PROFILE };
