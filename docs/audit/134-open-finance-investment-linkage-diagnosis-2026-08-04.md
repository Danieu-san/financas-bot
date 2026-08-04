# 134 - Diagnostico de direcao e ligacao de investimentos

Data: 2026-08-04

## Fontes primarias

- transacoes: https://docs.pluggy.ai/docs/transactions
- investimentos: https://docs.pluggy.ai/docs/investments
- transacoes de investimento:
  https://docs.pluggy.ai/docs/investment-transactions
- endpoint por posicao:
  https://docs.pluggy.ai/reference/investment-transactions-list
- cobertura:
  https://docs.pluggy.ai/docs/coverage-investment-transactions

## Conclusoes documentais

- `Transaction.type=DEBIT` e saida e `CREDIT` e entrada;
- Caixinhas Nubank aparecem como CDB na lista de investimentos;
- cada posicao pode ter transacoes `BUY`, `SELL`, `TAX`, `TRANSFER`,
  `INTEREST` e `AMORTIZATION` no endpoint paginado por ID;
- existencia do endpoint nao prova cobertura para uma conexao Nubank concreta;
- ausencia de linhas nao pode virar historico vazio sem disponibilidade
  explicitamente confirmada.

## Evidencia privada sanitizada

- Daniel Nubank: 54 `RESGATE_APLIC_FINANCEIRA` `CREDIT/positivo`;
- Daniel Nubank: 22 `RESGATE_APLIC_FINANCEIRA` `DEBIT/negativo`;
- Thais Itau: 39 `RENDIMENTO_APLIC_FINANCEIRA` `CREDIT/positivo`.

Nenhum valor, data, ID ou descricao foi exibido ou levado ao Git. As 22 linhas
Daniel permanecem contraditorias com o rotulo do provedor e bloqueadas; nao
devem ser reinterpretadas como aplicacao apenas por sinal ou descricao.

## Lacuna de produto

`pluggyReadOnlyClient` coleta `/investments`, mas nao
`/investments/{id}/transactions`. O contrato normalizado, o vault e o RX tambem
nao representam disponibilidade nem movimentos ligados a cada posicao. Fechar
essa lacuna exige mudanca transversal separada, testes adversariais e auditoria
independente antes de qualquer chamada live.
