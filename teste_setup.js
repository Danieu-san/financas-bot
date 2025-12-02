const path = require('path');
// Aponta para o arquivo .env uma pasta acima (../)
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const fs = require('fs');
const { authorizeGoogle, getSheetIds } = require('./src/services/google');

async function testarAmbiente() {
    console.log("🔍 --- INICIANDO DIAGNÓSTICO (ESTRUTURA PERSONALIZADA) ---");

    // Define os caminhos esperados (uma pasta acima)
    const envPath = path.resolve(__dirname, '../.env');
    const credPath = path.resolve(__dirname, '../credentials.json');

    console.log(`\n📂 Procurando arquivos em: ${path.resolve(__dirname, '..')}`);

    // 1. Verificação de Arquivos
    console.log("\n1. Verificando arquivos essenciais:");
    
    if (fs.existsSync(envPath)) {
        console.log("✅ Arquivo .env encontrado (na pasta acima).");
    } else {
        console.error(`❌ Arquivo .env NÃO encontrado em: ${envPath}`);
        // Tenta ver se está na pasta atual, só por garantia
        if (fs.existsSync('./.env')) console.log("   (Mas existe um .env na pasta atual. Onde você quer manter?)");
        return;
    }

    if (fs.existsSync(credPath)) {
        console.log("✅ Arquivo credentials.json encontrado (na pasta acima).");
    } else {
        console.error(`❌ Arquivo credentials.json NÃO encontrado em: ${credPath}`);
        return;
    }

    // 2. Verificação de Variáveis
    console.log("\n2. Verificando conteúdo das variáveis:");
    const chaves = ['SPREADSHEET_ID', 'GEMINI_API_KEY', 'GOOGLE_REFRESH_TOKEN'];
    let faltamChaves = false;
    
    chaves.forEach(chave => {
        if (process.env[chave]) {
            console.log(`✅ ${chave} está carregada.`);
        } else {
            console.error(`❌ ${chave} está FALTANDO no .env.`);
            faltamChaves = true;
        }
    });

    if (faltamChaves) return;

    // 3. Teste de Conexão com Google Sheets
    // Nota: O authorizeGoogle do seu código original talvez procure o credentials.json 
    // na pasta atual. Se der erro aqui, teremos que ajustar o service/google.js também.
    console.log("\n3. Testando conexão com Google Sheets (API)...");
    try {
        // Tentativa de hack para o google.js achar o arquivo na pasta de cima
        // Criamos um link simbólico temporário ou copiamos? Não, vamos tentar rodar.
        // Se falhar, você precisará mover o credentials.json ou ajustar o google.js
        
        await authorizeGoogle();
        console.log("✅ Autenticação com Google realizada com sucesso!");
        
        const ids = await getSheetIds();
        
        if (ids && Object.keys(ids).length > 0) {
            console.log("✅ Sucesso! Abas encontradas:");
            console.table(Object.keys(ids).slice(0, 5));
            
            if (ids['Cartoes'] || ids['Cartões']) {
                console.log("⭐ Aba 'Cartoes' detectada.");
            } else {
                console.log("⚠️ Aba 'Cartoes' não encontrada.");
            }
        }

    } catch (error) {
        console.error("❌ Falha na conexão:", error.message);
        console.log("\n⚠️ NOTA IMPORTANTE: Se o erro for 'no such file or directory' para o credentials.json,");
        console.log("significa que seu arquivo 'src/services/google.js' está programado para buscar o credentials");
        console.log("apenas na pasta local. Talvez precisemos ajustar ele também.");
    }

    console.log("\n🏁 --- DIAGNÓSTICO FINALIZADO ---");
}

testarAmbiente();