# Gate 41 - neutralizacao de estorno historico pre-salvamento

Data: 2026-08-12

## Veredito local

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

## Problema delimitado

Um debito bancario e seu estorno explicito podem existir simultaneamente no RX
historico antes de qualquer linha ser gravada. Planejar o debito como despesa e
reter apenas o credito para revisao produziria uma representacao transitoria
incorreta de um par que se anulou antes da importacao.

## Fronteira implementada

O planejador neutraliza os dois lados somente quando todas as condicoes abaixo
sao verdadeiras:

- conta vinculada do tipo bancario nos dois lados e mesma `account_id`;
- valores em BRL, finitos, nao nulos e exatamente opostos;
- credito com palavra inteira explicita `estorno`, `reembolso` ou `devolucao`;
- debito anterior ou na mesma data, com intervalo maximo de 30 dias;
- datas dos dois lados dentro da janela historica;
- identidades do provedor presentes e unicas no snapshot;
- nenhum dos lados possui correspondencia existente ou provavel na planilha;
- correspondencia mutuamente unica entre credito e debito.

Se qualquer condicao falha, o fluxo anterior permanece: nenhuma neutralizacao
e nenhuma autorizacao adicional de escrita. Os dois estados excluidos nao
possuem `write_plan` e o planejador continua retornando `financial_writes=0`.

## Arquivos do candidato

- `src/openFinance/openFinanceHistoricalImportPlanner.js`;
- `tests/openFinanceHistoricalImportPlanner.test.js`;
- `docs/agent-memory/workstreams/open-finance-historical-import.md`;
- `docs/plans/workstreams/open-finance-historical-import.md`.

## Evidencia local relatada

- teste focal do planejador: 30/30;
- bateria `node --test tests/openFinanceHistorical*.test.js`: 114/114;
- `git diff --check`: sem erros;
- recalcado o plano privado somente leitura, sempre com
  `financial_writes=0`;
- nenhuma linha historica foi escrita e nenhum dado privado integra este
  documento ou o commit.

As contagens acima sao evidencia local relatada e nao devem ser tratadas pelo
auditor como execucao independente.

## Fora de escopo

- writer historico;
- gravacao na planilha;
- deploy ou alteracao de producao;
- inferencia de credito sem semantica explicita;
- credito de cartao, transferencia ou reserva.
