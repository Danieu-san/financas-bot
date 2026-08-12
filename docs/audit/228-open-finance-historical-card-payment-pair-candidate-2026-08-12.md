# Gate 41 - pareamento bilateral de pagamento historico de fatura

Data: 2026-08-12

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

## Problema fechado localmente

O planejador ja excluia o debito bancario confirmado por regra privada como
pagamento de fatura, mas mantinha a contraparte `Pagamento recebido` do cartao
em revisao mesmo quando os dois lados formavam um par causal unico.

## Contrato do candidato

O pareamento so existe quando:

- o lado bancario e um debito BRL, dentro da janela, com identidade de provedor
  unica e classificacao explicita `card_payment` sem conflito;
- o lado do cartao e um credito BRL `POSTED`, com identidade unica e descricao
  exata `Pagamento recebido` ou `Pagamento com saldo`;
- ambos estao ausentes da planilha escopada;
- os valores absolutos sao iguais e as datas diferem em no maximo tres dias;
- a correspondencia e unica nos dois sentidos.

Pares ausentes, concorrentes, antigos, nao-BRL, pendentes, ja registrados ou
com outra semantica continuam fora do pareamento. As duas pontas sao excluidas
sem `write_plan`; o planejador permanece `writable:false` e
`financial_writes=0`.

## Arquivos auditaveis

- `src/openFinance/openFinanceHistoricalImportPlanner.js`;
- `tests/openFinanceHistoricalImportPlanner.test.js`;
- `docs/agent-memory/workstreams/open-finance-historical-import.md`;
- `docs/plans/workstreams/open-finance-historical-import.md`.

## Evidencia local relatada

- RED focal provou que a contraparte do cartao permanecia em revisao;
- teste focal final: 34/34;
- bateria explicita das 12 suites `openFinanceHistorical*.test.js`: 118/118;
- aplicacao ao snapshot privado fechou 37 contrapartes sem elevar `ready`;
- plano privado resultante: 1.311 prontos, 34 duplicatas provaveis, 195
  excluidos, 650 em revisao e 161 fora da janela;
- nenhuma linha historica escrita e nenhum dado privado incluido no Git.

As contagens sao evidencia local relatada, nao execucao do auditor. Este
candidato nao autoriza writer, importacao real ou deploy.
