# Fase 8 acelerada - plano executavel por candidato

Data-base: 2026-07-16

## Decisao

A auditoria independente foi aceita como `GO COM CONDICOES`. A janela deixa de
ser um bloqueio global de 60 dias e passa a ser aplicada por candidato.

Quatro relogios permanecem separados:

1. soft-disable reversivel;
2. observacao com tripwire;
3. exclusao fisica de codigo;
4. exclusao de schema/dados, sempre posterior e independente.

Nenhuma exclusao fisica ocorre no primeiro deploy.

## Estado real fixado

- EC2 Git: `8d93e4179e3aac60f99441596ede9974be9daa23`;
- runtime atribuido a `c91af84c86931254436991926b7086fc6fbb9ca2`;
- PM2 `online`, zero restart instavel e health `ok=true/sqlite=true`;
- ledger: shadow write e canary read em transactions/transfers/accounts/forecast;
- Financial Agent e Command Planner: canary;
- Interpretation Reliability: shadow;
- cartoes: tres modos unified-first em canary;
- 6A-6D: canary; undo: off;
- Open Finance: canary Daniel Nubank, escrita off.

## Evidencia de uso atual

- telemetria: 63 heartbeats, 1.023 eventos considerados e zero linha invalida;
- cartoes: 225 leituras unificadas e 724 legadas;
- consumidores de cartao: read-model 842, manutencao 65, scheduler 22;
- dashboard: instrumentacao ativa, mas zero sessao humana v1/v2 na janela nova;
- nenhum cron de usuario, timer financeiro, service extra ou shell script foi
  encontrado; somente `pm2-ubuntu.service` carrega `index.js`.

Conclusao: cartoes e dashboard nao podem ser soft-disabled agora.

## Fila por decisao

### Observar e considerar soft-disable em 72 horas

- `legacy_auth_utility`: sem runtime, teste, script, cron ou runbook encontrado.

O relogio inicia apenas depois do tripwire schema 2 estar ativo em producao.

### Investigar e manter

- `debt_update_handler`: codigo mutavel, sem consumidor encontrado, risco 93;
- `debt_avalanche_service`: suporte de QA/explicabilidade;
- `financial_health_service`: suporte de QA/explicabilidade;
- `date_time_normalizer`: consumido por suite antiga em `test/`;
- `financial_query_spec`: contrato de QA;
- `financial_undo_service`: test-only deliberado, flag off, E2E operacional.

Nenhum desses sera removido apenas por nao ser runtime.

### Migrar por consumidor antes de desligar

- fallback analitico: separar fallback logico de fallback de fonte;
- Dashboard v1: promover v2 por usuario e manter rollback;
- cartoes: reduzir as 724 leituras legadas por consumidor;
- scheduler mensal: tres ciclos virtuais + uma execucao real autenticada;
- read-model antigo: somente depois de dual-read e 8D.

### Manter ate 8D

- fallback Sheets;
- adapters de fonte e reconstrução;
- ledger e planos ainda shadow;
- stores de identidade;
- caminhos de importacao, exclusao, manutencao e backfill;
- estruturas usadas para rollback.

### Retencao permanente

- CSV/OFX e lancamento manual;
- backup, restore e auditoria;
- paridade e E2E;
- migrations historicas;
- exportacao legivel;
- release/tag pre-cutover.

## Janelas adotadas

| Perfil | Soft-disable | Exclusao acelerada |
| --- | ---: | ---: |
| test-only | imediato apos gate | 7 dias |
| read-only sincrono | 72 horas | 7 dias com auditoria |
| periodico read-only | 7 dias + 3 ciclos | 14 dias |
| mutavel | 14 dias + E2E real | 30 dias |
| fonte/recovery | somente apos cutover | 30 dias ou permanente |

Soft-disable e exclusao nunca compartilham o mesmo deploy.

## Proximas fatias

1. Deploy inerte do schema 2 e tripwires em `observe`.
2. Acompanhar 72 horas; zero candidatos soft-disabled no deploy inicial.
3. Instrumentar fallback analitico logico versus fonte por dominio.
4. Promover Dashboard v2 por usuario, mantendo v1 explicito.
5. Executar ciclos de cartao e scheduler; migrar read-only por consumidor.
6. Preparar 8D com SQLite primario, Sheets espelho e fallback ativo.
7. Exigir sete dias reais pos-cutover antes do 8E.

Qualquer divergencia monetaria, escopo incorreto, escrita duplicada, heartbeat
ausente por dois ciclos, fallback critico ou falha de restore reinicia o relogio
do candidato afetado.
