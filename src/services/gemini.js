// src/services/gemini.js

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const fs = require('fs');
const metrics = require('../utils/metrics');
const GEMINI_TIMEOUT_MS = Number.parseInt(process.env.GEMINI_TIMEOUT_MS || '25000', 10);
const GEMINI_MAX_RETRIES = Number.parseInt(process.env.GEMINI_MAX_RETRIES || '1', 10);
const GEMINI_RETRY_DELAY_MS = Number.parseInt(process.env.GEMINI_RETRY_DELAY_MS || '1500', 10);
const GEMINI_SLOW_LOG_MS = Number.parseInt(process.env.GEMINI_SLOW_LOG_MS || '8000', 10);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseGeminiError(error, timeoutMs) {
    if (error?.name === 'AbortError') {
        metrics.increment('gemini.timeout');
        return {
            code: 'TIMEOUT',
            message: `Tempo limite atingido (${timeoutMs}ms) na chamada Gemini.`
        };
    }

    return {
        code: 'GENERIC',
        message: error?.message || 'Falha na comunicação com a IA.'
    };
}

async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

async function callGemini(prompt, isJsonResponse = false, retries = GEMINI_MAX_RETRIES) {
    metrics.increment('gemini.call.total');
    const startedAt = Date.now();
    const promptLength = String(prompt || '').length;
    const maxAttempts = Math.max(1, retries + 1);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const attemptStartedAt = Date.now();
        try {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
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

            const response = await fetchWithTimeout(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }, GEMINI_TIMEOUT_MS);

            if (!response.ok) {
                throw new Error(`Erro na API Gemini: ${response.status} ${await response.text()}`);
            }

            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

            const attemptDuration = Date.now() - attemptStartedAt;
            metrics.observeDuration('gemini.attempt.ms', attemptDuration);
            if (attemptDuration >= GEMINI_SLOW_LOG_MS) {
                metrics.increment('gemini.slow');
                console.warn(`[perf] Gemini lento: ${attemptDuration}ms (json=${isJsonResponse}, tentativa=${attempt}/${maxAttempts}, prompt_len=${promptLength})`);
            }

            if (!text) {
                console.error("Resposta inesperada do LLM:", JSON.stringify(result, null, 2));
                return isJsonResponse ? null : "Não consegui processar a resposta da IA.";
            }

            let cleanText = text.trim();

            if (isJsonResponse) {
                cleanText = cleanText.replace(/^```json\s*/i, '');
                cleanText = cleanText.replace(/\s*```$/i, '');
                cleanText = cleanText.trim();

                try {
                    return JSON.parse(cleanText);
                } catch (e) {
                    console.error("❌ ERRO NO PARSING JSON APÓS LIMPEZA:", e);
                    console.error("String JSON que falhou:", cleanText);
                    metrics.increment('gemini.parse_json_error');
                    return null;
                }
            }

            metrics.observeDuration('gemini.call.ms', Date.now() - startedAt);
            return cleanText;
        } catch (error) {
            metrics.increment('gemini.error');
            const parsedError = parseGeminiError(error, GEMINI_TIMEOUT_MS);
            const attemptDuration = Date.now() - attemptStartedAt;
            const hasNextAttempt = attempt < maxAttempts;

            console.warn(`⚠️ Gemini falhou (${parsedError.code}) em ${attemptDuration}ms (tentativa ${attempt}/${maxAttempts}).`);

            if (hasNextAttempt) {
                metrics.increment('gemini.retry');
                await sleep(GEMINI_RETRY_DELAY_MS);
                continue;
            }

            const totalMs = Date.now() - startedAt;
            console.error(`❌ Erro final ao comunicar com o LLM após ${totalMs}ms:`, error);
            return { error: true, code: parsedError.code, message: parsedError.message };
        }
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

async function transcribeAudio(filePath) {
    metrics.increment('gemini.transcribe.total');
    const startedAt = Date.now();
    try {
        const audioBuffer = fs.readFileSync(filePath);
        const base64Audio = audioBuffer.toString('base64');

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

        const payload = {
            contents: [{
                parts: [
                    { text: "Transcreva este áudio em português do Brasil. Responda apenas com a transcrição." },
                    { inlineData: { mimeType: "audio/mp3", data: base64Audio } }
                ]
            }]
        };

        const response = await fetchWithTimeout(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }, GEMINI_TIMEOUT_MS);

        if (!response.ok) {
            throw new Error(`Erro na API Gemini ao transcrever: ${response.status} ${await response.text()}`);
        }

        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            console.error("Resposta de transcrição inesperada:", JSON.stringify(result, null, 2));
            return "Não consegui entender o áudio.";
        }

        const elapsedMs = Date.now() - startedAt;
        metrics.observeDuration('gemini.transcribe.ms', elapsedMs);
        if (elapsedMs >= GEMINI_SLOW_LOG_MS) {
            metrics.increment('gemini.transcribe.slow');
            console.warn(`[perf] Transcrição Gemini lenta: ${elapsedMs}ms`);
        }

        return text.trim();

    } catch (error) {
        metrics.increment('gemini.transcribe.error');
        const parsedError = parseGeminiError(error, GEMINI_TIMEOUT_MS);
        const elapsedMs = Date.now() - startedAt;
        console.error(`❌ Erro ao transcrever áudio (${parsedError.code}) após ${elapsedMs}ms:`, error);
        return "Ocorreu um erro ao processar a transcrição do áudio.";
    }
}

module.exports = { 
    askLLM,
    getStructuredResponseFromLLM,
    transcribeAudio,
};
