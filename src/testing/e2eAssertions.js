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

module.exports = {
    sendAndWaitForReply
};
