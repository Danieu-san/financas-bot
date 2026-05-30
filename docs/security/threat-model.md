# Security Threat Model

This document covers the current FinancasBot production shape: WhatsApp bot, Google Sheets as write/audit store, SQLite read model, web dashboard, admin commands, Google Calendar, Gemini, and PM2 on EC2.

## Assets

| Asset | Why it matters | Current protection |
|---|---|---|
| Financial transactions | Sensitive personal finance history. | `user_id` scoping, Sheets access via service credentials, SQLite local read model. |
| User lifecycle and consent | LGPD/legal basis and access control. | Consent gate, `ConsentLog`, lifecycle statuses, admin-only commands. |
| Dashboard tokens | Temporary access to user financial view. | Signed short-lived token with `uid` and expiry, WhatsApp link uses URL fragment (`#token=`), browser stores it in `sessionStorage` and removes it from the address bar, no client-provided `user_id`, sanitized access audit. |
| Google refresh token and API keys | Full integration access. | `.env` and `credentials.json` ignored by Git. |
| WhatsApp session | Controls bot identity. | `.wwebjs_auth/` ignored by Git, QR renewal runbook. |
| Admin commands | Can grant/block access and message users. | Admin check, structured logs, append-only AdminActionLog JSONL, soft lifecycle changes, two-step confirmation for risky commands. |

## Trust Boundaries

| Boundary | Input | Required defense |
|---|---|---|
| WhatsApp message -> bot | Untrusted user text/audio. | Rate limiting, intent validation, state-machine validation, admin authorization. |
| Bot -> Sheets/Calendar | Structured rows/events. | Mandatory `user_id` on user-scoped writes, calendar private metadata. |
| Sheets -> SQLite | External data source controlled by sheet editors. | Normalization, per-user indexes, fallback behavior, sync error logging. |
| Dashboard URL -> API | Public HTTP query params. | Signed short-lived token, no accepted `user_id` param, security headers, safe errors. |
| Admin chat -> privileged actions | Admin text commands. | Admin check, audit logs, in-memory confirmation for high-risk commands. |
| Bot -> Gemini | User data summarized into prompts. | Prefer deterministic SQL first, send summarized context only for common questions. |
| Uploaded statements -> importer | User-controlled CSV/OFX. | Type allowlist, binary/PDF/image rejection, configurable file-size and row-count limits before parsing, no raw file sent to LLM. |

## Key Risks And Mitigations

| Risk | Impact | Mitigation now | Next hardening |
|---|---:|---|---|
| Cross-user data leakage | High | `user_id` write gates, filtered reads, dashboard token `uid`, SQLite tests. | Keep adding regression tests for every new sheet/table. |
| Admin broad access to all users' transactions | High | Beta-only admin dashboard aggregate/user selector exists for testing diagnostics. | Must be removed before real multiuser scale or replaced by explicit consent + audited support mode. See ADR-002. |
| Dashboard token reused/shared | Medium | Expiring signed token, default TTL 15 min, default max TTL 30 min, `#token=` fragment link, browser URL cleanup, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, sanitized dashboard access log. | Optional one-time token/session exchange or explicit revocation store later. |
| Missing dashboard secret in production | High | Public/production dashboard now requires `DASHBOARD_TOKEN_SECRET`. | Rotate secret periodically and document rotation. |
| Admin typo changes wrong user | High | Target logs, append-only AdminActionLog JSONL, soft statuses, and second-message confirmation with `confirmar admin` for risky commands. | Move admin audit to a managed append-only store before multiple admins if JSONL is not enough operationally. |
| Logs expose sensitive content | Medium | Admin manual messages log length, not body. | Periodically grep logs for token/secret patterns. |
| Prompt injection / prompt probing | High | Security gate blocks internal IDs, system instructions, secrets, cross-user data and bypass attempts before LLM routing; logs are sanitized. | Keep adding real adversarial phrases from beta as regression tests. |
| Oversized/malicious statement upload | Medium | Importer limits decoded file size (`IMPORT_MAX_FILE_BYTES`, default 1 MiB) and non-empty lines (`IMPORT_MAX_ROWS`, default 1000) before parsing. | Add MIME magic-byte validation if binary formats are added later. |
| Google auth/token failure | Medium | Runbook and auth recovery path. | Alert on repeated `deleted_client`, `401`, or sync errors. |
| WhatsApp Web protocol/session instability | Medium | PM2 logs, QR renewal runbook, dependency update note. | Real E2E smoke before releases with dedicated test number. |
| Dependency vulnerability | Medium | `npm audit --audit-level=high` in release checklist. | Keep dependency updates scheduled. |

## Security Decisions

- Sheets remains the write/audit store for now; SQLite is a read model and can be rebuilt from Sheets.
- Dashboard endpoints are read-only and scoped exclusively by signed token payload.
- Admin all-users transaction access is a temporary beta/testing exception only and must not ship as part of scaled multiuser production. See `docs/decisions/ADR-002-admin-financial-data-access.md`.
- The dashboard token secret must not fall back to Gemini or any unrelated API key for public/production use.
- Dashboard links sent on WhatsApp should use `#token=` instead of querystring so the token is not sent in the initial HTTP request. API calls still pass the token to same-origin dashboard endpoints, with short TTL, no referrer, no cache, and no third-party assets.
- Dashboard access events are audited in sanitized JSONL by default. The audit stores hashes and scopes only; it must not store dashboard tokens, querystrings, raw user ids, phones or financial content.
- Risky admin commands require a second WhatsApp message (`confirmar admin`) within 5 minutes. Pending confirmations are memory-only and are not persisted to `state_store.json`.
- AdminActionLog writes sanitized JSONL entries to `data/admin-actions.jsonl` by default. It stores hashed actor/target refs, action, result, sanitized metadata and no manual-message body.
- Questions about metas now have deterministic routes (`resumo_metas`, `progresso_metas`) to reduce LLM exposure and avoid misrouting to unrelated expense intents.

## Release Checklist

- [ ] `npm audit --audit-level=high` returns no high/critical vulnerabilities.
- [ ] `DASHBOARD_TOKEN_SECRET` is configured on EC2 when `DASHBOARD_BASE_URL` is public.
- [ ] Dashboard invalid token returns a safe error.
- [ ] Dashboard page/API include `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
- [ ] Dashboard access audit is enabled or intentionally disabled with `DASHBOARD_ACCESS_LOG_ENABLED=false`.
- [ ] Before real multiuser scale, admin `Todos os usuários` transaction-level dashboard access has been removed or replaced with consented/audited support mode.
- [ ] Risky admin commands still require `confirmar admin`; PM2 logs show both `confirmacao_pendente` and `confirmacao_recebida`.
- [ ] AdminActionLog is enabled or intentionally disabled with `ADMIN_ACTION_LOG_ENABLED=false`; if enabled, `data/admin-actions.jsonl` receives sanitized entries.
- [ ] `npm test` passes.
- [ ] PM2 logs show read-model sync and no repeated auth/session failures.
- [ ] Manual WhatsApp smoke covers `Oi`, `dashboard`, `admin stats`, and one analytical question.
