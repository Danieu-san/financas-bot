// src/services/gemini.js

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function callGemini(prompt, isJsonResponse = false) {
    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
        
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
        };

        // A API do Gemini agora prefere que o schema JSON seja incluído no próprio prompt,
        // então não precisamos mais do 'generationConfig' aqui para o schema.
        if (isJsonResponse) {
            payload.generationConfig = {
                responseMimeType: "application/json",
            };
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Erro na API Gemini: ${response.status} ${await response.text()}`);
        }

        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            console.error("Resposta inesperada do LLM:", JSON.stringify(result, null, 2));
            return isJsonResponse ? null : "Não consegui processar a resposta da IA.";
        }

        return isJsonResponse ? JSON.parse(text) : text.trim();

    } catch (error) {
        console.error("❌ Erro ao comunicar com o LLM:", error);
        return isJsonResponse ? null : "Ocorreu um erro ao conectar com a IA.";
    }
}

// VERSÃO CORRIGIDA E SIMPLIFICADA
// Agora, esta função apenas repassa o prompt, sem adicionar um schema antigo.
async function getStructuredResponseFromLLM(prompt) {
    return callGemini(prompt, true);
}

async function askLLM(prompt) {
    return callGemini(prompt, false);
}

module.exports = { 
    askLLM,
    getStructuredResponseFromLLM,
};