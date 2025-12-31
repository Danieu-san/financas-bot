// test/environment_diagnostics.js
const path = require('path');
const fs = require('fs');
const { authorizeGoogle, getSheetIds } = require('../src/services/google');

async function testarAmbiente() {
    console.log("🔍 --- INICIANDO DIAGNÓSTICO DE AMBIENTE ---");

    // Define os caminhos esperados (uma pasta acima do diretório 'test')
    const projectRoot = path.resolve(__dirname, '..');
    const envPath = path.join(projectRoot, '.env');
    const credPath = path.join(projectRoot, 'credentials.json');

    console.log(`\n📂 Procurando arquivos na raiz do projeto: ${projectRoot}`);

    let allChecksPassed = true; // Inicia como true

    // 1. Verificação de Arquivos
    console.log("\n1. Verificando arquivos essenciais:");
    
    if (fs.existsSync(envPath)) {
        console.log("✅ Arquivo .env encontrado.");
    } else {
        console.error(`❌ Arquivo .env NÃO encontrado em: ${envPath}`);
        allChecksPassed = false;
    }

    if (fs.existsSync(credPath)) {
        console.log("✅ Arquivo credentials.json encontrado.");
    } else {
        console.error(`❌ Arquivo credentials.json NÃO encontrado em: ${credPath}`);
        allChecksPassed = false;
    }

    if (!allChecksPassed) {
        console.log("\n⚠️ Algum arquivo essencial está faltando. Por favor, verifique e tente novamente.");
        return false; // Indica falha no diagnóstico e sai
    }

    // 2. Verificação de Variáveis de Ambiente
    console.log("\n2. Verificando conteúdo das variáveis de ambiente:");
    const chaves = ['SPREADSHEET_ID', 'GEMINI_API_KEY', 'GOOGLE_REFRESH_TOKEN', 'ADMIN_IDS'];
    let faltamChaves = false;
    
    chaves.forEach(chave => {
        if (process.env[chave]) {
            console.log(`✅ ${chave} está carregada.`);
        } else {
            console.error(`❌ ${chave} está FALTANDO no .env.`);
            faltamChaves = true;
        }
    });

    if (faltamChaves) {
        console.log("\n⚠️ Alguma variável essencial está faltando no .env. Por favor, verifique e tente novamente.");
        return false; // Indica falha no diagnóstico e sai
    }

    // 3. Teste de Conexão com Google Sheets
    console.log("\n3. Testando conexão com Google Sheets (API)...");
    try {
        await authorizeGoogle();
        console.log("✅ Autenticação com Google realizada com sucesso!");
        
        const ids = await getSheetIds();
        
        if (ids && Object.keys(ids).length > 0) {
            console.log("✅ Sucesso! Abas encontradas (amostra):");
            Object.keys(ids).slice(0, 5).forEach(sheetName => console.log(`   - ${sheetName}`));
            
            if (ids['Cartoes'] || ids['Cartões']) {
                console.log("⭐ Aba 'Cartoes' ou 'Cartões' detectada.");
            } else {
                console.log("⚠️ Aba 'Cartoes' ou 'Cartões' não encontrada. Verifique se o nome da aba está correto na sua planilha.");
                // Isso é um aviso, não necessariamente uma falha crítica que impeça o bot de funcionar
                // Se for crítico, mude allChecksPassed = false; aqui
            }
            // Se chegou até aqui e encontrou abas, o check do Google Sheets passou
            // allChecksPassed já é true, então não precisa redefinir
        } else {
            console.error("❌ Nenhuma aba encontrada na planilha. Verifique o SPREADSHEET_ID e as permissões.");
            allChecksPassed = false; // Define como false se não encontrar abas
        }

    } catch (error) {
        console.error("❌ Falha na conexão com Google Sheets:", error.message);
        console.log("\n⚠️ NOTA IMPORTANTE: Verifique o SPREADSHEET_ID, GOOGLE_REFRESH_TOKEN e as permissões do serviço no Google Cloud.");
        allChecksPassed = false; // Define como false em caso de erro na conexão
    }

    console.log("\n🏁 --- DIAGNÓSTICO DE AMBIENTE FINALIZADO ---");
    return allChecksPassed; // Retorna o estado final de allChecksPassed
}

module.exports = { testarAmbiente };