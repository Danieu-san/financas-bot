async function sendAndWaitForReply(driver, text, expected, options = {}) {
    const timeoutMs = options.timeoutMs || driver.config.timeoutMs;
    const previousCount = await driver.countTextOccurrences(expected);
    const startedAt = Date.now();

    console.log(`[whatsapp-e2e] -> ${text}`);
    await driver.sendMessage(text);
    await driver.waitForIncomingMessage({ contains: expected, previousCount, timeoutMs });

    const elapsedMs = Date.now() - startedAt;
    console.log(`[whatsapp-e2e] <- encontrou "${expected}" em ${elapsedMs}ms`);

    return expected;
}

async function sendAndWaitForAnyReply(driver, text, expectedAny, options = {}) {
    const timeoutMs = options.timeoutMs || driver.config.timeoutMs;
    const previousCounts = {};
    const startedAt = Date.now();

    for (const expected of expectedAny) {
        previousCounts[expected] = await driver.countTextOccurrences(expected);
    }

    console.log(`[whatsapp-e2e] -> ${text}`);
    await driver.sendMessage(text);
    const found = await driver.waitForAnyIncomingMessage({
        containsAny: expectedAny,
        previousCounts,
        timeoutMs
    });

    const elapsedMs = Date.now() - startedAt;
    console.log(`[whatsapp-e2e] <- encontrou "${found}" em ${elapsedMs}ms`);

    return found;
}

module.exports = {
    sendAndWaitForAnyReply,
    sendAndWaitForReply
};
