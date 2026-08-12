# Gate 41 - recovery da neutralizacao de estorno pre-salvamento

Data: 2026-08-12

## Estado

`CANDIDATO DE RECUPERACAO AGUARDANDO REAUDITORIA INDEPENDENTE`.

## Achado anterior

O commit `2577ebc49efbfa18c845fe77e6c9e9954b00f109` recebeu `NO-GO` porque a
verificacao de ausencia na planilha consultava apenas Saidas para ambos os
lados. Um estorno ja gravado em Entradas poderia, portanto, ser tratado como
ainda nao salvo.

## Fechamento local

`sheetRecords` agora recebe a transacao e seleciona a fonte coerente com sua
direcao:

- debito bancario consulta Saidas, com valor, usuario e conta nas colunas do
  schema de despesa;
- credito bancario consulta Entradas, com valor, usuario e conta nas colunas do
  schema de receita;
- cartoes preservam o comportamento anterior.

O mesmo criterio e usado tanto no pre-pareamento quanto na classificacao
individual. Um teste causal adicional coloca o estorno exato em Entradas e
exige ausencia de neutralizacao, estado `existing` para o credito e
`financial_writes=0`.

## Arquivos do recovery

- `src/openFinance/openFinanceHistoricalImportPlanner.js`;
- `tests/openFinanceHistoricalImportPlanner.test.js`;
- `docs/agent-memory/workstreams/open-finance-historical-import.md`;
- `docs/plans/workstreams/open-finance-historical-import.md`.

## Evidencia local relatada

- teste focal do planejador: 31/31;
- bateria `node --test tests/openFinanceHistorical*.test.js`: 115/115;
- nenhuma linha historica escrita;
- nenhum writer, importacao real ou deploy autorizado;
- nenhum dado privado incluido no commit.

As contagens sao evidencia local relatada, nao execucao do auditor.
