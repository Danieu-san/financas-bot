const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config();

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}`;

async function getNewToken() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.error('? Erro: credentials.json não encontrado!');
        return;
    }

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const keys = credentials.web || credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(keys.client_id, keys.client_secret, REDIRECT_URI);

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/tasks'
        ]
    });

    const server = http.createServer(async (req, res) => {
        try {
            const parsedUrl = url.parse(req.url, true);
            if (parsedUrl.query.code) {
                const { tokens } = await oAuth2Client.getToken(parsedUrl.query.code);
                fs.writeFileSync('token.json', JSON.stringify(tokens, null, 2));
                
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>? Autenticação Concluída!</h1><p>O token foi salvo. Volte ao terminal.</p>');
                
                console.log('\n? SUCESSO! Token salvo em token.json');
                console.log('\n--- REFRESH_TOKEN (COPIE PARA O .ENV) ---');
                console.log(tokens.refresh_token);
                console.log('-----------------------------------------');

                setTimeout(() => { server.close(); process.exit(0); }, 1000);
            }
        } catch (e) {
            res.writeHead(500);
            res.end('Erro interno.');
        }
    }).listen(PORT);

    console.log('\n?? Login Automático iniciado!');
    console.log('1. O navegador deve abrir sozinho em instantes.');
    console.log('2. Caso não abra, copie e cole este link manualmente:');
    console.log('--------------------------------------------------');
    console.log(authUrl);
    console.log('--------------------------------------------------');

    // Comando de abertura automática corrigido para Windows
    if (process.platform === 'win32') {
        exec(`start "" "${authUrl.replace(/&/g, '^&')}"`);
    } else {
        exec(`open "${authUrl}"`);
    }
}

getNewToken();
