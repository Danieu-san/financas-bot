const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const geminiPath = require.resolve('../src/services/gemini');

async function withSyntheticAudio(run) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-audio-'));
    const filePath = path.join(directory, 'sample.mp3');
    fs.writeFileSync(filePath, Buffer.from('synthetic-audio'));
    try {
        return await run(filePath);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
}

test('transcription transport failure returns no routable text', async () => {
    const previousFetch = global.fetch;
    delete require.cache[geminiPath];
    global.fetch = async () => {
        throw new Error('synthetic transcription failure');
    };

    try {
        const { transcribeAudio } = require('../src/services/gemini');
        const result = await withSyntheticAudio(filePath => transcribeAudio(filePath));
        assert.strictEqual(result, null);
    } finally {
        global.fetch = previousFetch;
        delete require.cache[geminiPath];
    }
});

test('empty transcription response returns no routable text', async () => {
    const previousFetch = global.fetch;
    delete require.cache[geminiPath];
    global.fetch = async () => ({
        ok: true,
        json: async () => ({ candidates: [] })
    });

    try {
        const { transcribeAudio } = require('../src/services/gemini');
        const result = await withSyntheticAudio(filePath => transcribeAudio(filePath));
        assert.strictEqual(result, null);
    } finally {
        global.fetch = previousFetch;
        delete require.cache[geminiPath];
    }
});
