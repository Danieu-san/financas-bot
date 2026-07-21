// src/handlers/audioHandler.js

const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static'); // Importa um helper para encontrar o caminho
const { transcribeAudio } = require('../services/gemini');
const logger = require('../utils/logger');

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

async function handleAudio(msg) {
    let tempDir = '';
    let audioPath = '';
    let mp3Path = '';
    try {
        await msg.reply('🎙️ Entendido! Recebi seu áudio e já estou processando. Um momento...');
        
        logger.info('[audio] download_started');
        const media = await msg.downloadMedia();

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
                    logger.error(`[audio] conversion_failed error=${err.message}`);
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
        logger.error(`[audio] processing_failed error=${error.message}`);
        await msg.reply('Ocorreu um erro ao processar seu áudio. A equipe de TI foi notificada.');
        return null;
    } finally {
        safeUnlink(audioPath);
        safeUnlink(mp3Path);
        safeRemoveTempDir(tempDir);
    }
}

function safeUnlink(filePath) {
    if (!filePath) return;
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        logger.warn(`[audio] temp_cleanup_failed error=${error.message}`);
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

module.exports = { handleAudio };
