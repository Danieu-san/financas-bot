# Dashboard v2 como painel padrão — candidato

Data: 2026-08-15

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

Este gate não autoriza deploy por si só. A promoção preserva a rota v1 como
rollback explícito e não altera fontes, cálculos, escrita financeira ou dados.

## Diagnóstico read-only

- o comando simples `dashboard` ainda emitia a rota v1, enquanto o v2 exigia
  um comando especial;
- as APIs reais v1 e v2 foram consultadas no mesmo instante, usuário, escopo e
  período, sem escrita;
- ambas receberam a mesma posição Open Finance de contas e cartões, com a mesma
  observação fresca e a mesma completude parcial para faturas formais ausentes;
- saldos de conta, limite total, limite disponível e limite usado permaneceram
  campos distintos e aritmeticamente coerentes;
- os totais mensais zerados refletem a fonte atual: o RX histórico permanece
  read-only e ainda não foi aplicado à planilha. O dashboard não inventa
  lançamentos ausentes;
- o v2 é a superfície mais adequada porque separa posição atual, fluxo do
  período, competência, orçamento, previsão e qualidade, não oferece seletor de
  usuário e rejeita escopo escolhido pelo cliente.

Nenhum valor financeiro privado foi incluído neste documento ou no commit.

## Mudança mínima

- `dashboard`, `painel` e `painel financeiro` passam a solicitar v2;
- os comandos v2 explícitos continuam aceitos;
- `dashboard v1`, `painel v1` e `painel antigo` mantêm acesso explícito ao v1;
- `DASHBOARD_V2_ENABLED=false` continua fazendo rollback para v1 e agora informa
  isso como rollback da superfície principal;
- o rodapé do v2 deixa de chamá-lo de avaliação e documenta o v1 como rollback;
- nenhuma rota HTTP foi removida e `buildDashboardAccessLink` não mudou.

## Evidência local

- RED causal: o comando simples ainda retornava `/dashboard` e o rollback não
  era acionado pelo comando padrão;
- focal de comando: 10/10;
- contratos de autenticação, API, privacidade, fonte e composição: 41/41;
- suíte hermética ampla: 1.727 testes, 1.717 aprovados, zero falha e 10 skips
  esperados; cobertura de linhas 91,53%;
- `node --check` nos dois arquivos de produto: verde;
- `git diff --check`: verde, apenas avisos de normalização LF/CRLF.

## Arquivos da revisão

- `src/handlers/messageHandler.js`;
- `src/services/dashboardV2Page.js`;
- `src/utils/dashboardAuth.js`;
- `src/services/dashboardServer.js`;
- `src/services/dashboardFinancialTruthService.js`;
- `src/services/dashboardV2SummaryService.js`;
- `tests/unit.test.js`;
- `tests/functional.test.js`;
- `tests/dashboardAuthSecurity.test.js`;
- `tests/dashboardApiContracts.test.js`;
- `tests/dashboardFinancialTruthService.test.js`;
- `tests/dashboardV2SummaryService.test.js`;
- `docs/decisions/ADR-002-admin-financial-data-access.md`.

## Critério de fechamento

A auditoria independente deve confirmar que o comando padrão chega ao v2, o v1
continua acessível e utilizável como rollback, a flag desabilita v2 sem quebrar
o comando, e a promoção não altera cálculo, escopo, fonte ou escrita.
