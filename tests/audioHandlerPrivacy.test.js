const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('audioHandler does not log transcribed financial text and removes temp files on success', async () => {
    const fluentPath = require.resolve('fluent-ffmpeg');
    const geminiPath = require.resolve('../src/services/gemini');
    const audioHandlerPath = require.resolve('../src/handlers/audioHandler');
    delete require.cache[audioHandlerPath];

    require.cache[fluentPath] = {
        id: fluentPath,
        filename: fluentPath,
        loaded: true,
        exports: Object.assign((inputPath) => ({
            toFormat: () => ({
                on(event, handler) {
                    this[`on_${event}`] = handler;
                    return this;
                },
                save(outputPath) {
                    fs.writeFileSync(outputPath, `converted:${inputPath}`, 'utf8');
                    setImmediate(() => this.on_end());
                    return this;
                }
            })
        }), { setFfmpegPath: () => {} })
    };

    require.cache[geminiPath] = {
        id: geminiPath,
        filename: geminiPath,
        loaded: true,
        exports: {
            transcribeAudio: async () => 'gastei 10 no mercado privado'
        }
    };

    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
        const { handleAudio } = require('../src/handlers/audioHandler');
        const replies = [];
        const result = await handleAudio({
            reply: async (text) => replies.push(String(text)),
            downloadMedia: async () => ({
                data: Buffer.from('fake-audio').toString('base64')
            })
        });

        assert.strictEqual(result, 'gastei 10 no mercado privado');
        assert.doesNotMatch(logs.join('\n'), /mercado privado|gastei 10|audio_files/i);
        assert.strictEqual(findAudioTempFiles().length, 0);
    } finally {
        console.log = originalLog;
        cleanupAudioTempFiles();
    }
});

test('audioHandler removes converted temp file when transcription fails', async () => {
    const fluentPath = require.resolve('fluent-ffmpeg');
    const geminiPath = require.resolve('../src/services/gemini');
    const audioHandlerPath = require.resolve('../src/handlers/audioHandler');
    delete require.cache[audioHandlerPath];

    require.cache[fluentPath] = {
        id: fluentPath,
        filename: fluentPath,
        loaded: true,
        exports: Object.assign((inputPath) => ({
            toFormat: () => ({
                on(event, handler) {
                    this[`on_${event}`] = handler;
                    return this;
                },
                save(outputPath) {
                    fs.writeFileSync(outputPath, `converted:${inputPath}`, 'utf8');
                    setImmediate(() => this.on_end());
                    return this;
                }
            })
        }), { setFfmpegPath: () => {} })
    };

    require.cache[geminiPath] = {
        id: geminiPath,
        filename: geminiPath,
        loaded: true,
        exports: {
            transcribeAudio: async () => {
                throw new Error('transcription failed');
            }
        }
    };

    try {
        const { handleAudio } = require('../src/handlers/audioHandler');
        const replies = [];
        const result = await handleAudio({
            reply: async (text) => replies.push(String(text)),
            downloadMedia: async () => ({
                data: Buffer.from('fake-audio').toString('base64')
            })
        });

        assert.strictEqual(result, null);
        assert.match(replies.at(-1), /erro ao processar/i);
        assert.strictEqual(findAudioTempFiles().length, 0);
    } finally {
        cleanupAudioTempFiles();
    }
});

test('audioHandler isolates concurrent temp files when timestamps match', async () => {
    const fluentPath = require.resolve('fluent-ffmpeg');
    const geminiPath = require.resolve('../src/services/gemini');
    const audioHandlerPath = require.resolve('../src/handlers/audioHandler');
    delete require.cache[audioHandlerPath];

    const conversions = [];
    require.cache[fluentPath] = {
        id: fluentPath,
        filename: fluentPath,
        loaded: true,
        exports: Object.assign((inputPath) => ({
            toFormat: () => ({
                on(event, handler) {
                    this[`on_${event}`] = handler;
                    return this;
                },
                save(outputPath) {
                    conversions.push({ inputPath, outputPath, operation: this });
                    if (conversions.length === 2) {
                        for (const conversion of conversions) {
                            const input = fs.readFileSync(conversion.inputPath, 'utf8');
                            fs.writeFileSync(conversion.outputPath, `converted:${input}`, 'utf8');
                            setImmediate(() => conversion.operation.on_end());
                        }
                    }
                    return this;
                }
            })
        }), { setFfmpegPath: () => {} })
    };

    require.cache[geminiPath] = {
        id: geminiPath,
        filename: geminiPath,
        loaded: true,
        exports: {
            transcribeAudio: async filePath => fs.readFileSync(filePath, 'utf8')
        }
    };

    const OriginalDate = global.Date;
    global.Date = class FixedDate extends OriginalDate {
        constructor(...args) {
            super(...(args.length > 0 ? args : [123456789]));
        }

        static now() {
            return 123456789;
        }
    };
    try {
        const { handleAudio } = require('../src/handlers/audioHandler');
        const first = handleAudio({
            reply: async () => {},
            downloadMedia: async () => ({ data: Buffer.from('audio-one').toString('base64') })
        });
        const second = handleAudio({
            reply: async () => {},
            downloadMedia: async () => ({ data: Buffer.from('audio-two').toString('base64') })
        });

        const results = await Promise.all([first, second]);

        assert.deepStrictEqual(results, ['converted:audio-one', 'converted:audio-two']);
        assert.strictEqual(new Set(conversions.map(item => item.inputPath)).size, 2);
        assert.strictEqual(new Set(conversions.map(item => item.outputPath)).size, 2);
        assert.strictEqual(findAudioTempFiles().length, 0);
    } finally {
        global.Date = OriginalDate;
        cleanupAudioTempFiles();
    }
});

function findAudioTempFiles() {
    const audioDir = path.resolve(process.cwd(), 'audio_files');
    if (!fs.existsSync(audioDir)) return [];
    return fs.readdirSync(audioDir, { withFileTypes: true })
        .filter(entry => (
            (entry.isDirectory() && entry.name.startsWith('audio-'))
            || /^audio_\d+\.(ogg|mp3)$/.test(entry.name)
        ))
        .map(entry => path.join(audioDir, entry.name));
}

function cleanupAudioTempFiles() {
    for (const file of findAudioTempFiles()) {
        try {
            fs.rmSync(file, { recursive: true, force: true });
        } catch {}
    }
}
