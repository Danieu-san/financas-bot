// src/services/gemini.js

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const fs = require('fs');
const metrics = require('../utils/metrics');
const logger = require('../utils/logger');
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

    const message = error?.message || '';
    if (/RESOURCE_EXHAUSTED|prepayment credits are depleted|quota|monthly spending cap|limite mensal|teto mensal/i.test(message)) {
        metrics.increment('gemini.resource_exhausted');
        return {
            code: 'RESOURCE_EXHAUSTED',
            message: 'Crédito/quota da API Gemini esgotado.'
        };
    }

    return {
        code: 'GENERIC',
        message: message || 'Falha na comunicação com a IA.'
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
    const responseMode = isJsonResponse ? 'json' : 'text';
    metrics.increment('gemini.prompt_chars.total', promptLength);
    metrics.increment(`gemini.prompt_chars.${responseMode}`, promptLength);
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
                logger.warn(`[perf] gemini_slow duration_ms=${attemptDuration} json=${isJsonResponse} attempt=${attempt}/${maxAttempts} prompt_len=${promptLength}`);
            }

            if (!text) {
                logger.error('[ai] empty_llm_response');
                return isJsonResponse ? null : "Não consegui processar a resposta da IA.";
            }

            let cleanText = text.trim();

            if (isJsonResponse) {
                cleanText = cleanText.replace(/^```json\s*/i, '');
                cleanText = cleanText.replace(/\s*```$/i, '');
                cleanText = cleanText.trim();
                metrics.increment('gemini.response_chars.total', cleanText.length);
                metrics.increment(`gemini.response_chars.${responseMode}`, cleanText.length);

                try {
                    metrics.observeDuration('gemini.call.ms', Date.now() - startedAt);
                    return JSON.parse(cleanText);
                } catch (e) {
                    logger.error(`[ai] json_parse_failed error=${e.message} response_chars=${cleanText.length}`);
                    metrics.increment('gemini.parse_json_error');
                    return null;
                }
            }

            metrics.increment('gemini.response_chars.total', cleanText.length);
            metrics.increment(`gemini.response_chars.${responseMode}`, cleanText.length);
            metrics.observeDuration('gemini.call.ms', Date.now() - startedAt);
            return cleanText;
        } catch (error) {
            metrics.increment('gemini.error');
            const parsedError = parseGeminiError(error, GEMINI_TIMEOUT_MS);
            const attemptDuration = Date.now() - attemptStartedAt;
            const hasNextAttempt = attempt < maxAttempts;

            logger.warn(`[ai] gemini_call_failed code=${parsedError.code} duration_ms=${attemptDuration} attempt=${attempt}/${maxAttempts}`);

            if (hasNextAttempt) {
                metrics.increment('gemini.retry');
                await sleep(GEMINI_RETRY_DELAY_MS);
                continue;
            }

            const totalMs = Date.now() - startedAt;
            logger.error(`[ai] gemini_call_final_error code=${parsedError.code} duration_ms=${totalMs} error=${parsedError.message}`);
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
            logger.error('[ai] empty_transcription_response');
            return null;
        }

        const elapsedMs = Date.now() - startedAt;
        metrics.observeDuration('gemini.transcribe.ms', elapsedMs);
        if (elapsedMs >= GEMINI_SLOW_LOG_MS) {
            metrics.increment('gemini.transcribe.slow');
            logger.warn(`[perf] gemini_transcription_slow duration_ms=${elapsedMs}`);
        }

        return text.trim();

    } catch (error) {
        metrics.increment('gemini.transcribe.error');
        const parsedError = parseGeminiError(error, GEMINI_TIMEOUT_MS);
        const elapsedMs = Date.now() - startedAt;
        logger.error(`[ai] gemini_transcription_failed code=${parsedError.code} duration_ms=${elapsedMs} error=${parsedError.message}`);
        return null;
    }
}

function buildFinancialDocumentPayload({ buffer, mimeType, prompt }) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Documento financeiro vazio.');
    return {
        contents: [{ parts: [
            { text: String(prompt || '') },
            { inlineData: { mimeType: String(mimeType || ''), data: buffer.toString('base64') } }
        ] }],
        generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0
        }
    };
}

async function extractFinancialDocument(input = {}) {
    metrics.increment('gemini.document_ocr.total');
    const startedAt = Date.now();
    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const response = await fetchWithTimeout(apiUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildFinancialDocumentPayload(input))
        }, GEMINI_TIMEOUT_MS);
        if (!response.ok) throw new Error(`Gemini OCR HTTP ${response.status}`);
        const result = await response.json();
        const text = String(result.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
        if (!text || text.length > 100000) throw new Error('Gemini OCR response invalid');
        const parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
        metrics.observeDuration('gemini.document_ocr.ms', Date.now() - startedAt);
        return parsed;
    } catch (error) {
        metrics.increment('gemini.document_ocr.error');
        const httpStatus = String(error?.message || '').match(/HTTP\s+(\d{3})/)?.[1] || 'none';
        logger.warn(`[ai] gemini_document_ocr_failed code=${parseGeminiError(error, GEMINI_TIMEOUT_MS).code} http_status=${httpStatus} duration_ms=${Date.now() - startedAt}`);
        return { error: true, code: 'OCR_FAILED' };
    }
}

module.exports = { 
    askLLM,
    extractFinancialDocument,
    getStructuredResponseFromLLM,
    transcribeAudio,
    __test__: {
        buildFinancialDocumentPayload,
        parseGeminiError
    }
};
