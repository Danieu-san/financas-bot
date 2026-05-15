async function sendPlainMessage(msg, text) {
    const target = msg?.from || msg?.author;
    const client = msg?.client;
    if (client && target && typeof client.sendMessage === 'function') {
        return client.sendMessage(target, String(text));
    }
    if (msg && typeof msg.reply === 'function') {
        return msg.reply(String(text));
    }
    return null;
}

module.exports = {
    sendPlainMessage
};
