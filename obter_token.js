// obter_token.js
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Caminho para o seu arquivo de credenciais
const CREDENTIALS_PATH = path.resolve(__dirname, 'credentials.json');

// O escopo define o nível de acesso que estamos pedindo (ler e escrever em planilhas)
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/tasks', 'https://www.googleapis.com/auth/calendar.events'];

async function authorize() {
    try {
        const credentialsContent = fs.readFileSync(CREDENTIALS_PATH);
        if (!credentialsContent) {
            console.error('Erro: O arquivo credentials.json está vazio ou não foi encontrado.');
            return;
        }
        const credentials = JSON.parse(credentialsContent);
        const { client_secret, client_id, redirect_uris } = credentials.installed;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        console.log('Gerando URL de autorização...');
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline', // 'offline' é necessário para obter um refresh_token
            scope: SCOPES,
        });

        console.log('--------------------------------------------------');
        console.log('Copie e cole esta URL no seu navegador:\n');
        console.log(authUrl);
        console.log('--------------------------------------------------');

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        rl.question('Após autorizar no navegador, ele te dará um código. Cole o código que aparece na URL aqui e pressione Enter: ', async (code) => {
            rl.close();
            try {
                const { tokens } = await oAuth2Client.getToken(code);
                oAuth2Client.setCredentials(tokens);

                if (!tokens.refresh_token) {
                    console.error('\n\n--- ERRO! ---');
                    console.error('Não foi possível obter um novo REFRESH token. Isso geralmente acontece se o seu projeto no Google Cloud não está configurado como "Publicado".');
                    console.error('Por favor, siga os passos para publicar seu app e tente novamente.');
                    return;
                }

                console.log('\n\n--- SUCESSO! ---');
                console.log('Seu novo Refresh Token é:');
                console.log('\x1b[32m%s\x1b[0m', tokens.refresh_token); // Imprime em verde
                console.log('\nCopie este token, abra seu arquivo .env e cole na variável GOOGLE_REFRESH_TOKEN.');

            } catch (err) {
                console.error('Erro ao obter o token:', err.message);
            }
        });
    } catch (err) {
        console.error('Erro ao ler o arquivo credentials.json:', err.message);
    }
}

authorize().catch(console.error);