let runtimePromise = null;

function loadRuntime() {
    if (!runtimePromise) {
        runtimePromise = import('./langGraphRuntime.mjs');
    }
    return runtimePromise;
}

async function invokeFinancialAgent(input = {}) {
    const runtime = await loadRuntime();
    return await runtime.invokeFinancialAgentRuntime(input);
}

module.exports = {
    invokeFinancialAgent
};
