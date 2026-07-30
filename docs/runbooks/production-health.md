# Production Health Runbook

Use este runbook depois de deploy, restart, renovacao de QR ou incidente na
producao vigente. Em 2026-07-30, a producao ativa e Oracle Cloud; nao reutilize
comandos ou caminhos AWS/EC2 do historico.

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
{
  "ok": true,
  "sqlite": true,
  "whatsapp": true,
  "whatsappStatus": "ready",
  "whatsappLiveness": "healthy"
}
```

Semantica:

- `200`: SQLite pronto e WhatsApp `ready`/`healthy`;
- `503`: startup, QR pendente, WhatsApp degradado/parado ou SQLite indisponivel;
- PM2 `online` isoladamente nao prova que o bot recebe mensagens.

If local health passes but public link times out:

- confira o proxy Caddy e o health publico HTTPS;
- confira as regras de rede da OCI;
- confirme que `DASHBOARD_BASE_URL` corresponde ao dominio vigente.

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

## 7. Deploy

A producao OCI foi materializada por artefato imutavel e nao possui contrato
aprovado de checkout Git. Nao execute `git pull`, `git reset` ou `git revert`
no diretorio de producao. Antes do proximo deploy funcional, preparar e ensaiar
instalacao por artefato com checksum, preservacao explicita de estado e rollback.

## 8. Rollback

Se o novo artefato falhar, usar somente o rollback ensaiado para o artefato
anterior, preservando `.env`, credenciais, sessao WhatsApp e stores persistentes.
Nunca iniciar Oracle e AWS simultaneamente com a mesma sessao WhatsApp.

## 9. Escalation Signals

Escalate before adding more users if any of these are true:

- Dashboard health fails.
- WhatsApp never reaches ready state after QR renewal.
- Google auth fails repeatedly.
- Read-model sync fails repeatedly.
- PM2 restart count keeps climbing.
- Admin commands stop logging structured `[admin]` events.
- Analytics answers fall back to Sheets or AI for common questions unexpectedly.
