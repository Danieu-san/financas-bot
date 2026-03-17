# Variaveis de Ambiente Relevantes

## Obrigatorias
- `SPREADSHEET_ID`
- `GEMINI_API_KEY`
- `GOOGLE_REFRESH_TOKEN`
- `ADMIN_IDS`

## LGPD e termos
- `TERMS_VERSION` (padrao: `v1.1`)
- `TERMS_URL` (URL publica do documento de termos)
- `PRIVACY_URL` (URL publica da politica de privacidade)

## Estado de conversa
- `STATE_STORE_DRIVER` (`file` ou `redis`; padrao: `file`)
- `REDIS_URL` (obrigatorio se `STATE_STORE_DRIVER=redis`)
- `REDIS_STATE_KEY` (padrao: `financasbot:user_state`)

## Integridade de dados
- `VALIDATE_USER_ID_ON_STARTUP` (`true`/`false`, padrao: `true`)
- `AUTO_BACKFILL_USER_ID_ON_STARTUP` (`true`/`false`, padrao: `false`)
- `BACKFILL_ALLOW_SINGLE_USER_FALLBACK` (`true`/`false`, padrao: `false`)

## Observabilidade/performance
- `MESSAGE_SLOW_LOG_MS` (padrao: `4000`)
- `GEMINI_TIMEOUT_MS` (padrao: `25000`)
- `GEMINI_MAX_RETRIES` (padrao: `1`)
- `GEMINI_RETRY_DELAY_MS` (padrao: `1500`)
- `GEMINI_SLOW_LOG_MS` (padrao: `8000`)
- `OPERATIONAL_ALERTS_ENABLED` (`true`/`false`, padrao: `false`)
