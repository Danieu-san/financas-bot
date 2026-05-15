# Release Checklist

Use this before deploying `main` to the EC2 PM2 process.

## Current Release Gates

- [ ] `git status --short` has no unexpected tracked changes.
- [ ] `npm test` passes.
- [ ] `npm audit --audit-level=high` returns no vulnerabilities.
- [ ] `.env` on EC2 includes all required production variables from `.env.example`.
- [ ] `DASHBOARD_TOKEN_SECRET` is configured before deploying dashboard changes.
- [ ] If this release moves toward real multiuser scale, ADR-002 has been reviewed and admin access to all users' transaction-level financial data has been removed or replaced with consented/audited support mode.
- [ ] Rollback command is ready before restart.

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

## WhatsApp Smoke

Send from an admin number:

```text
Oi
dashboard
admin stats
quanto gastei esse mês?
```

Expected:

- `Oi` returns the local greeting/menu without AI.
- `dashboard` returns a valid tokenized link.
- `admin stats` returns user counts and logs `[admin] stats`.
- Analytical question uses deterministic/read-model route when possible.

## Dashboard Smoke

```bash
curl http://localhost:8787/dashboard/health
curl "http://localhost:8787/dashboard/api/kpis?token=TOKEN_INVALIDO"
```

Expected:

- Health returns `{ "ok": true, "sqlite": true }`.
- Invalid token returns `401` with `Token inválido ou expirado.`.
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
- Google auth fails repeatedly.
- Read-model sync fails repeatedly.
- WhatsApp never reaches ready state after QR renewal.
- Logs show user data isolation errors or missing `user_id`.
