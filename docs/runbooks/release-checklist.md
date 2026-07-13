# Release Checklist

Use this before deploying `main` to the EC2 PM2 process.

## Current Release Gates

- [ ] `git status --short` has no unexpected tracked changes.
- [ ] `npm test` passes.
- [ ] `npm audit --audit-level=high` returns no vulnerabilities.
- [ ] `.env` on EC2 includes all required production variables from `.env.example`.
- [ ] `ADMIN_IDS` on EC2 contains only intended admins; normal/test users must not be present.
- [ ] Multiuser OAuth releases have `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_STATE_SECRET`, and `OAUTH_TOKEN_ENCRYPTION_KEY` configured.
- [ ] `AUTH_GATE_REPLY_COOLDOWN_MS` is configured or intentionally left at the default to prevent bot-to-bot consent loops.
- [ ] `DASHBOARD_TOKEN_SECRET` is configured before deploying dashboard changes.
- [ ] `DASHBOARD_V2_ENABLED=true` is explicit when releasing v2; rollback is prepared by setting it to `false` and restarting PM2 with `--update-env`.
- [ ] Dashboard v2 rollback was tested: current `/dashboard` remains `200`, v2 page/API return `404`, and the WhatsApp `dashboard v2` command falls back visibly to the current dashboard.
- [ ] `DASHBOARD_ADMIN_ALL_USERS_ENABLED` is unset/false for beta or production unless a temporary support/test mode was explicitly approved.
- [ ] Dashboard admin cross-user scopes are rejected by default (`user=all` or another user returns `403`).
- [ ] Risky admin commands still require a second WhatsApp message `confirmar admin` and log `confirmacao_pendente`/`confirmacao_recebida`.
- [ ] AdminActionLog is enabled or intentionally disabled; risky admin actions append sanitized entries to `data/admin-actions.jsonl` or `ADMIN_ACTION_LOG_PATH`.
- [ ] Prompt-injection/security gate tests still block internal IDs, prompt/system instructions, secrets, cross-user data, and bypass attempts.
- [ ] Interpretation reliability rollout uses `shadow` before `enforce`; initial allowlist is limited to `expense.create,income.create`, alerts are enabled, and no automated path changes the mode to `enforce`.
- [ ] If the approved narrow canary is in `enforce`, `INTERPRETATION_RELIABILITY_ENFORCE_APPROVED=true` is set and `INTERPRETATION_RELIABILITY_OPERATIONS` remains exactly `expense.create,income.create`; any broader allowlist must make the daily check critical.
- [ ] Financial Agent rollout follows ADR-005: production stays `FINANCIAL_AGENT_MODE=shadow` until evidence gates pass; `answer` is not enabled globally from a single manual success.
- [ ] If this release moves toward real multiuser scale, ADR-002 and ADR-003 have been reviewed; admin access to all users' transaction-level financial data remains removed or replaced with consented/audited support mode.
- [ ] If cron/payment reminders changed, a real validation marker was created and cleaned up (`TESTE_APAGAR Cron` or equivalent).
- [ ] Rollback command is ready before restart.
- [ ] O `HEAD` da EC2 depois do pull corresponde exatamente ao commit esperado
      no GitHub/local; registrar o hash na entrega do deploy.

## EC2 Deploy

```bash
cd /home/ubuntu/financas-bot
git pull origin main
npm install
pm2 restart financas-bot --update-env
pm2 logs financas-bot --lines 160 --nostream
curl http://localhost:8787/dashboard/health
```

Expected health:

```json
{"ok":true,"sqlite":true}
```

## First 10 Minutes After Deploy

- [ ] PM2 status is `online`.
- [ ] Logs show `Google APIs autorizadas com sucesso!`.
- [ ] Logs show `Planilha Sincronizada com Sucesso!`.
- [ ] Logs show `read-model pronto`.
- [ ] Logs show `integridade user_id validada: sem pendencias`.
- [ ] Logs show `dashboard: servidor web ativo`.
- [ ] WhatsApp reaches ready state or shows a QR that can be scanned.
- [ ] If an admin command was tested, AdminActionLog did not store raw phone numbers, message bodies, tokens or Google document IDs.

## WhatsApp Smoke

Send from an admin number:

```text
Oi
dashboard
admin stats
quanto gastei esse mês?
liste minhas metas
```

Expected:

- `Oi` returns the local greeting/menu without AI.
- `dashboard` returns a valid tokenized link using `/dashboard#token=`, not `/dashboard?token=`.
- `admin stats` returns user counts and logs `[admin] stats`.
- Analytical question uses deterministic/read-model route when possible.
- Goals question uses deterministic `resumo_metas` or `progresso_metas` route, not generic AI fallback.

## Dashboard Smoke

```bash
curl http://localhost:8787/dashboard/health
curl "http://localhost:8787/dashboard/api/kpis?token=TOKEN_INVALIDO"
```

Expected:

- Health returns `{ "ok": true, "sqlite": true }`.
- Invalid token returns `401` with `Token inválido ou expirado.`.
- Dashboard link token is kept out of the initial HTTP querystring and removed from the browser address bar after page load.
- Dashboard tokens use a short TTL (`DASHBOARD_TOKEN_TTL_SECONDS`, default 900s) and are capped (`DASHBOARD_TOKEN_MAX_TTL_SECONDS`, default 1800s).
- `data/dashboard-access.jsonl` receives sanitized dashboard events, or `DASHBOARD_ACCESS_LOG_ENABLED=false` was intentionally documented.
- Admin token with `user=all` returns `403` unless `DASHBOARD_ADMIN_ALL_USERS_ENABLED=true` was deliberately enabled for a controlled support/test session.
- Browser-opened dashboard loads cards, charts/sections, alerts, debts, goals, and recent transactions.

## Rollback

If the deploy is bad:

```bash
cd /home/ubuntu/financas-bot
git log --oneline -5
git revert --no-edit <bad_commit_sha>
npm install
pm2 restart financas-bot --update-env
pm2 logs financas-bot --lines 160 --nostream
curl http://localhost:8787/dashboard/health
```

Do not use `git reset --hard` unless you explicitly decide to discard server-local changes.

## Hold Or Roll Back If

- PM2 restart count keeps increasing.
- Dashboard health fails.
- `dashboard` command says `DASHBOARD_TOKEN_SECRET` is missing.
- A production/multiuser release still exposes admin `Todos os usuários` transaction-level financial data. See `docs/decisions/ADR-002-admin-financial-data-access.md`.
- `DASHBOARD_ADMIN_ALL_USERS_ENABLED=true` is present without an explicit, time-boxed support/test reason.
- `ADMIN_IDS` includes a normal/test user such as Thaís.
- Google auth fails repeatedly.
- Read-model sync fails repeatedly.
- WhatsApp never reaches ready state after QR renewal.
- Logs show user data isolation errors or missing `user_id`.
