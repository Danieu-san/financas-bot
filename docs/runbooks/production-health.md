# Production Health Runbook

Use this after deploys, restarts, QR renewals, or incidents on the EC2 server.

## 1. Process Status

```bash
cd /home/ubuntu/financas-bot
pm2 status
```

Expected:

- `financas-bot` is `online`.
- Restart count is not increasing continuously.
- Memory is stable for the instance size.

## 2. Current Logs

```bash
pm2 logs financas-bot --lines 160 --nostream
```

Expected current startup sequence:

- `Google APIs autorizadas com sucesso!`
- `Planilha Sincronizada com Sucesso!`
- `read-model pronto`
- `integridade user_id validada: sem pendencias`
- `dashboard: servidor web ativo`
- `Bot pronto para receber mensagens!`
- `Agendador de tarefas (cron) inicializado.`

Important: old `TargetCloseError`, `Execution context was destroyed`, and old QR blocks may remain in PM2 history. Judge by the newest timestamped lines after the latest restart.

## 3. Dashboard Health

Required production env:

- `DASHBOARD_BASE_URL` points to the public domain/IP.
- `DASHBOARD_TOKEN_SECRET` is set to a long random value.
- `DASHBOARD_REQUIRE_STRONG_SECRET=true` is recommended on EC2.
- `DASHBOARD_V2_ENABLED=true` keeps the opt-in v2 surface available. Set it to
  `false` and restart PM2 with `--update-env` to roll back only v2; the current
  dashboard and `/dashboard/health` remain available.

```bash
curl http://localhost:8787/dashboard/health
```

Expected:

```json
{ "ok": true, "sqlite": true }
```

If local health passes but public link times out:

- Check EC2 security group inbound rule for TCP `8787`.
- Check network ACL inbound and outbound rules.
- Confirm `DASHBOARD_BASE_URL` matches the current public IP/domain.

Hourly metrics to inspect:

- `dashboard.page.view`
- `dashboard.api.summary.success`
- `dashboard.api.auth_failed`
- `dashboard.api.error`

## 4. Read Model Health

Look for recent sync lines:

```bash
pm2 logs financas-bot --lines 200 --nostream | grep "read-model"
```

Expected:

- Startup sync succeeds.
- Scheduled sync succeeds every configured interval.
- SQLite stats show non-error state.

If sync fails:

- Verify `.env` Google variables are present.
- Verify `credentials.json` exists on the server.
- Check for `deleted_client`, `401`, quota, or spreadsheet range errors.

Hourly metrics to inspect:

- `read_model.sync.scheduled.success`
- `read_model.sync.scheduled.error`
- `read_model.sqlite.hit`
- `read_model.sqlite.miss`

## 5. WhatsApp Smoke

From an admin WhatsApp number:

```text
Oi
dashboard
admin stats
quanto gastei esse mês?
```

Expected:

- `Oi` returns greeting/menu without slow AI route.
- `dashboard` returns a tokenized link.
- `admin stats` logs `[admin] stats`.
- Analytical question logs route/source metrics (`sqlite`, `memory_fallback`, `sheets_fallback`, or AI generation).

## 6. Real E2E Smoke

Local machine:

```bash
npm run test:whatsapp:e2e:check
npm run test:whatsapp:e2e
```

Use only with explicit `.env` opt-in. Do not run destructive spreadsheet reset against production unless the sheet is intentionally disposable and the reset env confirmation is set.

## 7. Deploy Commands

```bash
cd /home/ubuntu/financas-bot
git pull origin main
npm install
pm2 restart financas-bot --update-env
pm2 logs financas-bot --lines 160 --nostream
curl http://localhost:8787/dashboard/health
```

## 8. Rollback

If the newest deploy is bad:

```bash
cd /home/ubuntu/financas-bot
git log --oneline -5
git revert --no-edit <bad_commit_sha>
npm install
pm2 restart financas-bot --update-env
pm2 logs financas-bot --lines 160 --nostream
```

Avoid `git reset --hard` on the server unless you have explicitly decided to discard local server-only changes.

## 9. Escalation Signals

Escalate before adding more users if any of these are true:

- Dashboard health fails.
- WhatsApp never reaches ready state after QR renewal.
- Google auth fails repeatedly.
- Read-model sync fails repeatedly.
- PM2 restart count keeps climbing.
- Admin commands stop logging structured `[admin]` events.
- Analytics answers fall back to Sheets or AI for common questions unexpectedly.
