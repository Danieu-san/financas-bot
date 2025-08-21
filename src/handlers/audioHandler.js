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
            return;
        }

        // O áudio do WhatsApp vem no formato .ogg
        const timestamp = new Date().getTime();
        const audioPath = path.join(audioDir, `audio_${timestamp}.ogg`);

        // Salva o áudio (em base64) como um arquivo .ogg
        fs.writeFileSync(audioPath, Buffer.from(media.data, 'base64'));

        console.log(`Áudio salvo em: ${audioPath}`);

        const mp3Path = audioPath.replace('.ogg', '.mp3');

console.log(`Convertendo ${audioPath} para ${mp3Path}...`);

await new Promise((resolve, reject) => {
    ffmpeg(audioPath)
        .toFormat('mp3')
        .on('end', () => {
            console.log('Conversão para MP3 finalizada com sucesso.');
            fs.unlinkSync(audioPath); // Apaga o arquivo .ogg original para economizar espaço
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

// Apaga o arquivo .mp3 após a transcrição
fs.unlinkSync(mp3Path); 

console.log(`Texto Transcrito: "${transcribedText}"`);

console.log(`Texto Transcrito: "${transcribedText}"`);

// Se a transcrição falhar ou vier vazia, avisa o usuário e para.
if (!transcribedText || transcribedText.toLowerCase() === 'não consegui entender o áudio.') {
    await msg.reply(`Não consegui entender o que foi dito no áudio. Tente novamente.`);
    return;
}

// MODIFICA A MENSAGEM ORIGINAL PARA SER PROCESSADA COMO TEXTO
msg.body = transcribedText;
msg.type = 'chat';
msg.hasMedia = false;

// CHAMA O HANDLER PRINCIPAL com a mensagem original, agora modificada
const { handleMessage } = require('./messageHandler');
console.log('Encaminhando texto transcrito para o messageHandler para interpretação...');
await handleMessage(msg); // Passamos o 'msg' original, não um 'fakeMsg'


    } catch (error) {
        console.error('❌ Erro ao processar o áudio:', error);
        await msg.reply('Ocorreu um erro ao processar seu áudio. A equipe de TI foi notificada.');
    }
}

module.exports = { handleAudio };