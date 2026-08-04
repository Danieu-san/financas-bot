# RX-HIST-TIME-INV-01 - fechamento independente do recovery de investimentos

Data: 2026-08-04

## Commit auditado

`bce32c50de6026fc81a3a310577ec70f401423e0`

## Arquivos lidos pelo auditor

- `docs/audit/126-open-finance-investment-operation-filter-recovery-candidate-2026-08-04.md`;
- `src/openFinance/openFinanceHistoricalRx.js`;
- `tests/openFinanceHistoricalRx.test.js`.

## Veredito independente

`GO TECNICO LOCAL`.

O auditor confirmou o hash completo e a leitura integral dos tres arquivos. O
matcher ancorado exclui `NAO_APLICAVEL`, preserva os rotulos financeiros
positivos provados e decide exclusivamente pelo `operation_type` do provedor.
O teste executa o builder real, exige subtotal apenas dos dois rotulos validos
e nao revelou regressao no inventario, subtipos, investimentos, bloqueadores ou
`financial_writes=0`.

Nenhuma lacuna indispensavel residual foi identificada no escopo estatico. As
contagens locais permaneceram evidencia relatada, nao execucao do auditor.

## Alcance autorizado

- uma unica previa read-only na copia privada;
- nenhuma planilha ou escrita financeira;
- nenhum Pluggy live, deploy, WhatsApp ou producao.
