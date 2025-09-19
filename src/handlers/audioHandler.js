// src/handlers/audioHandler.js

const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static'); // Importa um helper para encontrar o caminho
const { transcribeAudio } = require('../services/gemini');

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
    try {
        await msg.reply('🎙️ Entendido! Recebi seu áudio e já estou processando. Um momento...');
        
        console.log('Baixando mídia de áudio...');
        const media = await msg.downloadMedia();

        if (!media || !media.data) {
            await msg.reply('❌ Desculpe, não consegui baixar o áudio. Tente novamente.');
            return null; // Retorna null em caso de falha
        }

        const timestamp = new Date().getTime();
        const audioPath = path.join(audioDir, `audio_${timestamp}.ogg`);
        fs.writeFileSync(audioPath, Buffer.from(media.data, 'base64'));
        console.log(`Áudio salvo em: ${audioPath}`);

        const mp3Path = audioPath.replace('.ogg', '.mp3');
        console.log(`Convertendo ${audioPath} para ${mp3Path}...`);

        await new Promise((resolve, reject) => {
            ffmpeg(audioPath)
                .toFormat('mp3')
                .on('end', () => {
                    console.log('Conversão para MP3 finalizada com sucesso.');
                    fs.unlinkSync(audioPath);
                    resolve();
                })
                .on('error', (err) => {
                    console.error('Erro na conversão do áudio:', err);
                    reject(err);
                })
                .save(mp3Path);
        });

        console.log(`Transcrevendo o arquivo ${mp3Path}...`);
        const transcribedText = await transcribeAudio(mp3Path);
        fs.unlinkSync(mp3Path);
        console.log(`Texto Transcrito: "${transcribedText}"`);

        if (!transcribedText || transcribedText.toLowerCase().includes('não consegui entender')) {
            await msg.reply(`Não consegui entender o que foi dito no áudio. Tente novamente.`);
            return null; // Retorna null em caso de falha
        }

        return transcribedText; // Retorna o texto transcrito com sucesso

    } catch (error) {
        console.error('❌ Erro ao processar o áudio:', error);
        await msg.reply('Ocorreu um erro ao processar seu áudio. A equipe de TI foi notificada.');
        return null;
    }
}

module.exports = { handleAudio };