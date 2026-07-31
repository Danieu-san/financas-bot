// src/handlers/audioHandler.js

const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static'); // Importa um helper para encontrar o caminho
const { transcribeAudio } = require('../services/gemini');
const logger = require('../utils/logger');
const AUDIO_DOWNLOAD_MAX_ATTEMPTS = 3;
const AUDIO_DOWNLOAD_RETRY_DELAY_MS = 750;

// Se o ffmpeg foi instalado globalmente e está no PATH, a linha abaixo pode não ser necessária,
// mas é uma boa prática para garantir que o código encontre o executável.
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath.replace('app.asar', 'app.asar.unpacked'));
}

// Garante que o diretório para salvar os áudios exista
const audioDir = path.join(__dirname, '..', '..', 'audio_files');
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir);
}

async function handleAudio(msg, options = {}) {
    let tempDir = '';
    let audioPath = '';
    let mp3Path = '';
    try {
        await msg.reply('🎙️ Entendido! Recebi seu áudio e já estou processando. Um momento...');
        
        logger.info('[audio] download_started');
        const media = await downloadAudioMedia(msg, options.downloadOptions);

        if (!media || !media.data) {
            await msg.reply('❌ Desculpe, não consegui baixar o áudio. Tente novamente.');
            return null; // Retorna null em caso de falha
        }

        tempDir = fs.mkdtempSync(path.join(audioDir, 'audio-'));
        audioPath = path.join(tempDir, 'source.ogg');
        fs.writeFileSync(audioPath, Buffer.from(media.data, 'base64'));
        logger.info('[audio] temp_file_created type=ogg');

        mp3Path = path.join(tempDir, 'converted.mp3');
        logger.info('[audio] conversion_started');

        await new Promise((resolve, reject) => {
            ffmpeg(audioPath)
                .toFormat('mp3')
                .on('end', () => {
                    logger.info('[audio] conversion_finished');
                    safeUnlink(audioPath);
                    resolve();
                })
                .on('error', (err) => {
                    logger.error(`[audio] conversion_failed ${logger.safeError(err)}`);
                    reject(err);
                })
                .save(mp3Path);
        });

        logger.info('[audio] transcription_started');
        const transcribedText = await transcribeAudio(mp3Path);
        safeUnlink(mp3Path);
        logger.info('[audio] transcription_finished');

        if (!transcribedText || transcribedText.toLowerCase().includes('não consegui entender')) {
            await msg.reply(`Não consegui entender o que foi dito no áudio. Tente novamente.`);
            return null; // Retorna null em caso de falha
        }

        return transcribedText; // Retorna o texto transcrito com sucesso

    } catch (error) {
        logger.error(`[audio] processing_failed ${logger.safeError(error)}`);
        await msg.reply('Ocorreu um erro ao processar seu áudio. A equipe de TI foi notificada.');
        return null;
    } finally {
        safeUnlink(audioPath);
        safeUnlink(mp3Path);
        safeRemoveTempDir(tempDir);
    }
}

async function downloadAudioMedia(msg, options = {}) {
    const maxAttempts = normalizeMaxAttempts(options.maxAttempts);
    const retryDelayMs = normalizeRetryDelay(options.retryDelayMs);
    const sleep = typeof options.sleep === 'function' ? options.sleep : delay;
    let currentMessage = msg;
    let autoDownloadEnabled = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const media = await currentMessage.downloadMedia();
            if (media?.data) return media;
        } catch {
            // A falha bruta pode conter IDs ou conteúdo privado; o log é deliberadamente opaco.
        }

        logger.warn(`[audio] download_attempt_failed attempt=${attempt}`);
        if (attempt >= maxAttempts) break;

        if (!autoDownloadEnabled) {
            autoDownloadEnabled = true;
            await enableAudioAutoDownload(msg);
        }
        await sleep(retryDelayMs * attempt);
        currentMessage = await reacquireMessage(msg, currentMessage);
    }

    const error = new Error('audio_media_download_failed');
    error.code = 'AUDIO_MEDIA_DOWNLOAD_FAILED';
    throw error;
}

function normalizeMaxAttempts(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return AUDIO_DOWNLOAD_MAX_ATTEMPTS;
    return Math.min(3, Math.max(1, parsed));
}

function normalizeRetryDelay(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return AUDIO_DOWNLOAD_RETRY_DELAY_MS;
    return Math.min(3000, Math.max(0, parsed));
}

async function enableAudioAutoDownload(msg) {
    if (typeof msg?.client?.setAutoDownloadAudio !== 'function') return;
    try {
        await msg.client.setAutoDownloadAudio(true);
    } catch {
        logger.warn('[audio] auto_download_enable_failed');
    }
}

async function reacquireMessage(originalMessage, fallbackMessage) {
    const messageId = originalMessage?.id?._serialized;
    if (!messageId || typeof originalMessage?.client?.getMessageById !== 'function') {
        return fallbackMessage;
    }
    try {
        return await originalMessage.client.getMessageById(messageId) || fallbackMessage;
    } catch {
        logger.warn('[audio] message_reacquire_failed');
        return fallbackMessage;
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function safeUnlink(filePath) {
    if (!filePath) return;
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        logger.warn(`[audio] temp_cleanup_failed ${logger.safeError(error)}`);
    }
}

function safeRemoveTempDir(dirPath) {
    if (!dirPath) return;
    try {
        fs.rmSync(dirPath, { recursive: true, force: true });
    } catch {
        logger.warn('[audio] temp_directory_cleanup_failed');
    }
}

module.exports = {
    handleAudio,
    __test__: {
        downloadAudioMedia
    }
};
