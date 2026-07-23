const { createLogger, format, transports } = require('winston');
const path = require('path');

function redactLogIdentifier(value) {
    return String(value || '').trim() ? '[REDACTED_ID]' : '';
}

function sanitizeLogCode(value, fallback = 'unknown') {
    const normalized = String(value || '').trim();
    if (/^[1-5]\d{2}$/.test(normalized)) return normalized;
    if (/^[A-Z][A-Z0-9_.:-]{0,63}$/.test(normalized)) return normalized;
    return fallback;
}

function safeErrorSummary(error) {
    const safeNames = new Set([
        'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError',
        'URIError', 'AggregateError', 'EvalError', 'AbortError', 'TimeoutError'
    ]);
    const rawName = error && typeof error === 'object' ? String(error.name || '') : '';
    const name = safeNames.has(rawName) ? rawName : 'Error';
    const code = sanitizeLogCode(
        error && typeof error === 'object'
            ? (error.code || error.status || error.response?.status)
            : '',
        'unknown'
    );
    return `name=${name} code=${code}`;
}

function sanitizeLogMessage(value) {
    return String(value || '')
        .replace(/\b(?:msg|command)="[^"]*"/gi, match => `${match.split('=')[0]}=[REDACTED_CONTENT]`)
        .replace(/([?&](?:token|code|state|access_token|refresh_token|client_secret|secret|api_key|key)=)[^&\s"']+/gi, '$1[REDACTED_SECRET]')
        .replace(/\bGOCSPX-[A-Za-z0-9_-]+\b/g, '[REDACTED_SECRET]')
        .replace(/\b(?:ya29|1\/\/)[A-Za-z0-9._/-]{20,}\b/g, '[REDACTED_TOKEN]')
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_TOKEN]')
        .replace(/(docs\.google\.com\/(?:spreadsheets|document)\/d\/)[A-Za-z0-9_-]+/gi, '$1[REDACTED_DOC_ID]')
        .replace(/(drive\.google\.com\/file\/d\/)[A-Za-z0-9_-]+/gi, '$1[REDACTED_DOC_ID]')
        .replace(/("(?:[a-z][a-z0-9_]*_id|userId|senderId|whatsappId|spreadsheetId|documentId|phone|sender|target|adminId)"\s*:\s*")[^"]*"/gi, '$1[REDACTED_ID]"')
        .replace(/("(?:msg|message|command|body|text|content|description)"\s*:\s*")[^"]*"/gi, '$1[REDACTED_CONTENT]"')
        .replace(/\b(?:[a-z][a-z0-9_]*_id|userId|senderId|whatsappId|spreadsheetId|documentId|phone|sender|target|adminId)=([^\s,}"']+)/gi, match => `${match.split('=')[0]}=[REDACTED_ID]`)
        .replace(/\b\d{10,20}@(c\.us|lid)\b/gi, '[REDACTED_ID]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[REDACTED_ID]')
        .replace(/\b\d{10,15}\b/g, '[REDACTED_ID]');
}

const sanitizedMessageFormat = format(info => {
    info.message = sanitizeLogMessage(info.message);
    if (info.stack) info.stack = sanitizeLogMessage(info.stack);
    return info;
});

const logger = createLogger({
    format: format.combine(
        sanitizedMessageFormat(),
        format.timestamp({ format: 'DD/MM/YYYY HH:mm:ss' }),
        format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
    ),
    transports: [
        new transports.Console(),
        new transports.File({
            filename: path.resolve(process.cwd(), 'logs/error.log'),
            level: 'error'
        }),
        new transports.File({
            filename: path.resolve(process.cwd(), 'logs/combined.log')
        })
    ]
});

logger.redactIdentifier = redactLogIdentifier;
logger.safeError = safeErrorSummary;
logger.__test__ = {
    redactLogIdentifier,
    sanitizeLogMessage,
    safeErrorSummary
};

module.exports = logger;
