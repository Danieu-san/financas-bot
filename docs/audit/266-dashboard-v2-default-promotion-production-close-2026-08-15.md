# Dashboard v2 como painel padrão — fechamento de produção

Data: 2026-08-15

## Release promovido

- commit auditado: `28f106d4e9b150cd7e04f589075d3eb873e7cc25`;
- provedor: Oracle Cloud Infrastructure;
- processo: `financas-bot`, único, online e sem reinícios;
- script ativo: release imutável do commit auditado;
- rollback preservado: release anterior e comando explícito para v1.

## Evidência pós-deploy

- checksum e manifesto do artefato conferidos antes da promoção;
- `.env` e `credentials.json` preservados;
- health local e público: `ok=true`, `sqlite=true`, WhatsApp `ready/healthy`;
- Google APIs, read-model, servidor do dashboard e cron inicializaram;
- comando real `dashboard` enviado pelo WhatsApp respondeu uma única vez com
  rota `/dashboard/v2` e token temporário não registrado;
- a lista Open Finance pendente permaneceu disponível e não houve escrita
  financeira no smoke.

## Veredito

`DASHBOARD-V2-DEFAULT: GO DE PRODUÇÃO`.

O dashboard v2 é a superfície padrão. V1 permanece acessível por comando
explícito e pela flag de rollback. O RX histórico continua read-only e não foi
gravado na planilha; por isso, totais mensais ausentes não foram inventados.
