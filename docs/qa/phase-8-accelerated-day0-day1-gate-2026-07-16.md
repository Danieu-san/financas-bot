# Fase 8 acelerada - gate Dia 0/Dia 1

## Veredito

`GO` para deploy inerte de observabilidade e `NO-GO` para qualquer soft-disable
ou exclusao fisica neste mesmo deploy.

## Produção

- Git remoto `8d93e4179e3aac60f99441596ede9974be9daa23`;
- runtime `c91af84c86931254436991926b7086fc6fbb9ca2`;
- PM2 online, zero restart instavel, health `ok=true/sqlite=true`;
- telemetria 600, 63 heartbeats, 1.023 eventos, zero linha invalida;
- cartoes com 225 leituras unificadas e 724 legadas;
- dashboard sem sessao humana observada no schema atual.

## Entry points externos

- PM2 carrega somente `/home/ubuntu/financas-bot/index.js`;
- nenhum crontab de usuario;
- nenhum timer financeiro;
- nenhum service financeiro adicional;
- nenhum `.sh`, `.service` ou `.timer` dentro do app;
- `cron.d` contem somente itens do sistema.

## Call graph inicial

- `debt_update_handler`: sem runtime/test/script; mutavel, manter investigando;
- `debt_avalanche_service`: somente teste;
- `financial_health_service`: somente teste;
- `legacy_auth_utility`: sem consumidor encontrado;
- `date_time_normalizer`: suite antiga em `test/`;
- `financial_query_spec`: somente teste;
- `financial_undo_service`: testes + E2E, producao off.

Todos receberam tripwire allowlisted e inerte por default.

## Alteracao segura

- telemetria schema 2 adiciona `evidence_type` e `candidate` allowlisted;
- probes distinguem `synthetic`, `production_replay`, `real_user` e `runtime`;
- `LEGACY_RETIREMENT_TRIPWIRE_ENABLED` controla observacao;
- lista de soft-disable permanece vazia;
- nenhum fluxo financeiro, fonte, dado ou schema financeiro muda.

## Gate de saida

Depois do deploy:

- heartbeat schema 2;
- zero linha invalida;
- startup sem candidato carregado inesperadamente;
- suite e runtime verdes;
- rollback da flag provado.

Somente entao comeca o relogio de 72 horas do primeiro read-only isolado.
