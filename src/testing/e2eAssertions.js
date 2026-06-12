async function waitForChatToSettle(driver, delayMs = 2000) {
    if (typeof driver.page?.waitForTimeout === 'function') {
        await driver.page.waitForTimeout(delayMs);
    }
}

async function describeVisibleTextTail(driver) {
    try {
        const text = await driver.getVisibleText();
        return String(text || '').slice(-1500);
    } catch (error) {
        return `Nao foi possivel ler texto visivel: ${error.message}`;
    }
}

async function sendAndWaitForReply(driver, text, expected, options = {}) {
    const timeoutMs = options.timeoutMs || driver.config.timeoutMs;
    await waitForChatToSettle(driver, options.settleMs);
    const previousCount = await driver.countIncomingTextOccurrences(expected);
    const previousFingerprint = await driver.getLatestIncomingFingerprint();
    const startedAt = Date.now();

    console.log(`[whatsapp-e2e] -> ${text}`);
    await driver.sendMessage(text);
    try {
        await driver.waitForIncomingMessage({ contains: expected, previousCount, previousFingerprint, timeoutMs });
    } catch (error) {
        console.log(`[whatsapp-e2e] texto visivel ao falhar:\n${await describeVisibleTextTail(driver)}`);
        throw error;
    }

    const elapsedMs = Date.now() - startedAt;
    console.log(`[whatsapp-e2e] <- encontrou "${expected}" em ${elapsedMs}ms`);

    return expected;
}

async function sendAndWaitForAnyReply(driver, text, expectedAny, options = {}) {
    const timeoutMs = options.timeoutMs || driver.config.timeoutMs;
    const previousCounts = {};
    const startedAt = Date.now();

    await waitForChatToSettle(driver, options.settleMs);
    const previousFingerprint = await driver.getLatestIncomingFingerprint();
    for (const expected of expectedAny) {
        previousCounts[expected] = await driver.countIncomingTextOccurrences(expected);
    }

    console.log(`[whatsapp-e2e] -> ${text}`);
    await driver.sendMessage(text);
    let found;
    try {
        found = await driver.waitForAnyIncomingMessage({
            containsAny: expectedAny,
            previousCounts,
            previousFingerprint,
            timeoutMs
        });
    } catch (error) {
        console.log(`[whatsapp-e2e] texto visivel ao falhar:\n${await describeVisibleTextTail(driver)}`);
        throw error;
    }

    const elapsedMs = Date.now() - startedAt;
    console.log(`[whatsapp-e2e] <- encontrou "${found}" em ${elapsedMs}ms`);

    return found;
}

module.exports = {
    sendAndWaitForAnyReply,
    sendAndWaitForReply,
    waitForChatToSettle
};
