# OPS-05 — fechamento independente e produção OCI

Data: 2026-07-31

Commit imutável auditado e implantado:
`8f89aec906439dba0024318bddee8d255747b54f`.

## Veredito independente

`GO TÉCNICO LOCAL`.

O Chat confirmou a leitura integral, no mesmo hash, do manifesto, instalador,
testes, runbook e contratos de health. O parecer registrou:

- `CRITICAL`: zero;
- `HIGH`: zero;
- `MEDIUM`: zero;
- `LOW`: a janela de aproximadamente cinco minutos corresponde a 59 esperas
  fixas de cinco segundos, além do tempo de cada consulta de health; isso não
  enfraquece o gate nem bloqueia o GO local;
- nenhuma lacuna indispensável residual.

O parser de `--health-attempts` foi confirmado antes de `pm2 jlist`, limitado a
inteiros decimais entre 12 e 60 e com padrão 12. A prova causal mantém as doze
primeiras consultas não saudáveis, aceita a décima terceira e exige promoção
sem segundo `delete/start` de rollback.

O parecer foi estático e independente. O Chat não executou as contagens locais.

## Artefato implantado

- commit: `8f89aec906439dba0024318bddee8d255747b54f`;
- arquivos no manifesto: `714`;
- SHA-256 do artefato:
  `f3e56ca23f2fef1a3500eeebc6037e926665195e5a0ce76a66184e258b63185c`;
- SHA-256 do instalador:
  `30452d41be2b0aa60649b17d0f18e2004e269edc05c2893b4c43d5db471dd507`;
- checksums e manifesto verificados localmente e na OCI;
- slot preparado com `production_changed=false`.

## Promoção OCI

A promoção usou `--health-attempts 60`,
`--confirm-process-restart` e `--confirm-empty-state-bootstrap`.

Resultado:

- `promoted=true`;
- `rollback_performed=false`;
- script ativo:
  `/home/ubuntu/financas-bot/releases/8f89aec906439dba0024318bddee8d255747b54f/index.js`;
- `APP_COMMIT_SHA=8f89aec906439dba0024318bddee8d255747b54f`;
- um único PM2 online, PID `57196`, reinícios `0` e reinícios instáveis `0`;
- health local e público:
  `ok=true`, `sqlite=true`, `whatsapp=true`, status `ready` e liveness
  `healthy`;
- Google, Sheets, read-model e cron iniciados;
- ciclo Open Finance em `GO` com `writes=0`;
- `pm2-ubuntu` e `caddy` ativos e habilitados.

O bootstrap cifrado criou backups privados antes da troca. Diretórios `data` e
`data/backups` permanecem em modo `0700`; `.env`, `state_store.json` e ambos os
backups permanecem em `0600`.

## Flags preservadas

- `OPEN_FINANCE_ALERT_MODE=canary`;
- `OPEN_FINANCE_RECONCILIATION_MODE=canary`;
- `OPEN_FINANCE_SHADOW_PREVIEW_MODE=canary`;
- `OPEN_FINANCE_WRITE_MODE=off`;
- proposta e aprovação de escrita continuam desligadas.

## Estado

`OPS-05 ENCERRADO EM PRODUÇÃO`.

O release por artefato imutável está operacional na Oracle. O próximo gate deve
tratar separadamente a ativação funcional controlada da proposta proativa e da
escrita confirmada; este fechamento não transforma flags ausentes em
autorização implícita.
