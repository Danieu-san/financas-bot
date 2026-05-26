# Security Threat Model

This document covers the current FinancasBot production shape: WhatsApp bot, Google Sheets as write/audit store, SQLite read model, web dashboard, admin commands, Google Calendar, Gemini, and PM2 on EC2.

## Assets

| Asset | Why it matters | Current protection |
|---|---|---|
| Financial transactions | Sensitive personal finance history. | `user_id` scoping, Sheets access via service credentials, SQLite local read model. |
| User lifecycle and consent | LGPD/legal basis and access control. | Consent gate, `ConsentLog`, lifecycle statuses, admin-only commands. |
| Dashboard tokens | Temporary access to user financial view. | Signed token with `uid` and expiry, WhatsApp link uses URL fragment (`#token=`), browser stores it in `sessionStorage` and removes it from the address bar, no client-provided `user_id`. |
| Google refresh token and API keys | Full integration access. | `.env` and `credentials.json` ignored by Git. |
| WhatsApp session | Controls bot identity. | `.wwebjs_auth/` ignored by Git, QR renewal runbook. |
| Admin commands | Can grant/block access and message users. | Admin check, structured logs, soft lifecycle changes. |

## Trust Boundaries

| Boundary | Input | Required defense |
|---|---|---|
| WhatsApp message -> bot | Untrusted user text/audio. | Rate limiting, intent validation, state-machine validation, admin authorization. |
| Bot -> Sheets/Calendar | Structured rows/events. | Mandatory `user_id` on user-scoped writes, calendar private metadata. |
| Sheets -> SQLite | External data source controlled by sheet editors. | Normalization, per-user indexes, fallback behavior, sync error logging. |
| Dashboard URL -> API | Public HTTP query params. | Signed short-lived token, no accepted `user_id` param, security headers, safe errors. |
| Admin chat -> privileged actions | Admin text commands. | Admin check, audit logs, future confirmation for high-risk commands. |
| Bot -> Gemini | User data summarized into prompts. | Prefer deterministic SQL first, send summarized context only for common questions. |

## Key Risks And Mitigations

| Risk | Impact | Mitigation now | Next hardening |
|---|---:|---|---|
| Cross-user data leakage | High | `user_id` write gates, filtered reads, dashboard token `uid`, SQLite tests. | Keep adding regression tests for every new sheet/table. |
| Admin broad access to all users' transactions | High | Beta-only admin dashboard aggregate/user selector exists for testing diagnostics. | Must be removed before real multiuser scale or replaced by explicit consent + audited support mode. See ADR-002. |
| Dashboard token reused/shared | Medium | Expiring signed token, `#token=` fragment link, browser URL cleanup, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`. | Shorten TTL for higher-risk users; optional one-time token store later. |
| Missing dashboard secret in production | High | Public/production dashboard now requires `DASHBOARD_TOKEN_SECRET`. | Rotate secret periodically and document rotation. |
| Admin typo changes wrong user | High | Target logs and soft statuses. | Add two-step confirmation for `ativar`, `inativar`, `bloquear`, `deletar`. |
| Logs expose sensitive content | Medium | Admin manual messages log length, not body. | Periodically grep logs for token/secret patterns. |
| Google auth/token failure | Medium | Runbook and auth recovery path. | Alert on repeated `deleted_client`, `401`, or sync errors. |
| WhatsApp Web protocol/session instability | Medium | PM2 logs, QR renewal runbook, dependency update note. | Real E2E smoke before releases with dedicated test number. |
| Dependency vulnerability | Medium | `npm audit --audit-level=high` in release checklist. | Keep dependency updates scheduled. |

## Security Decisions

- Sheets remains the write/audit store for now; SQLite is a read model and can be rebuilt from Sheets.
- Dashboard endpoints are read-only and scoped exclusively by signed token payload.
- Admin all-users transaction access is a temporary beta/testing exception only and must not ship as part of scaled multiuser production. See `docs/decisions/ADR-002-admin-financial-data-access.md`.
- The dashboard token secret must not fall back to Gemini or any unrelated API key for public/production use.
- Dashboard links sent on WhatsApp should use `#token=` instead of querystring so the token is not sent in the initial HTTP request. API calls still pass the token to same-origin dashboard endpoints, with short TTL, no referrer, no cache, and no third-party assets.
- Admin lifecycle commands remain one-step during beta, but the documented next control is two-step confirmation before larger scale.

## Release Checklist

- [ ] `npm audit --audit-level=high` returns no high/critical vulnerabilities.
- [ ] `DASHBOARD_TOKEN_SECRET` is configured on EC2 when `DASHBOARD_BASE_URL` is public.
- [ ] Dashboard invalid token returns a safe error.
- [ ] Dashboard page/API include `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
- [ ] Before real multiuser scale, admin `Todos os usuários` transaction-level dashboard access has been removed or replaced with consented/audited support mode.
- [ ] `npm test` passes.
- [ ] PM2 logs show read-model sync and no repeated auth/session failures.
- [ ] Manual WhatsApp smoke covers `Oi`, `dashboard`, `admin stats`, and one analytical question.
