# Gate 38.4 - candidato de escrita de transferencia interna pareada

Data: 2026-08-10

## Estado solicitado

`CANDIDATO A GO TECNICO LOCAL; SEM DEPLOY`.

Este documento nao autoriza mudanca de flags, acesso a producao, Sheets real,
Pluggy real ou WhatsApp real. A escrita continua desligada em producao.

## Fronteira implementada

Somente uma revisao duravel `confirm_transfer_pair`, originada de duas pernas
bancarias atuais `POSTED/new`, de sinais opostos, mesmo valor e referencia
forte compartilhada do provedor, pode abrir proposta de salvamento.

O primeiro aceite apenas abre a conferencia. O usuario escolhe explicitamente
a conta financeira de origem e a de destino, cada uma filtrada pelo titular
esperado. As contas devem ser distintas. A revalidacao final relê revisao,
duas fontes, geracoes, catalogo e conciliacao antes do segundo `sim`.

O plano resultante grava uma unica linha em `Transferencias`, nunca uma entrada
e uma saida. O ledger canonico recebe as contas com seus titulares distintos e
mantem `net_income_expense_impact=0` e `free_budget_eligible=false`.

## Exclusoes fail-closed

- par fraco, ausente, ambiguo ou alterado;
- qualquer perna nao `POSTED/new`;
- conta de cartao, fatura, Caixinha/reserva, rendimento ou PIX externo;
- conta ausente, fora do escopo, invertida ou igual nas duas pontas;
- revisao sem identidade, geracao revogada ou catalogo alterado;
- replay concorrente, reinicio ou resultado de escrita incerto que tentaria
  novo append cego.

## Arquivos causais

- `src/openFinance/openFinanceReviewedTransferSaveProposal.js`;
- `src/openFinance/openFinanceShadowPreviewStore.js`;
- `src/openFinance/openFinanceSaveProposalReviewStore.js`;
- `src/openFinance/openFinanceSaveProposalReviewCatalog.js`;
- `src/openFinance/openFinanceSaveProposalConversation.js`;
- `src/openFinance/openFinanceSaveProposalFinalization.js`;
- `src/ledger/canonicalLedgerReceiptProjector.js`;
- `src/handlers/messageHandler.js`;
- `tests/openFinanceTransferSaveProposal.test.js`;
- `tests/financialStateMachine.test.js`.

## Evidencia local

- syntax check dos arquivos alterados: verde;
- teste RED inicial: o store recusava a nova classificacao, como esperado;
- bateria focal do Gate 38.4: `7/7`;
- caminhos publicos 38.2 e 38.4 executados juntos: `2/2`;
- bateria causal de propostas, revisao, entradas, estornos, transferencias e
  recibo canonico: `68/68`;
- primeira suite ampla concluida: `1616` testes, `1604` aprovados, `2` falhas,
  ambas na fronteira alterada; o candidato nao foi commitado;
- apos propagar o nome canonico da conta e invalidar o cache do cenario publico
  encadeado, os testes afetados ficaram verdes;
- unica suite ampla final apos a mudanca causal: `1616` testes, `1606`
  aprovados, `0` falhas, `10` ignorados previstos, cobertura de linhas
  `91,17%`, branches `73,75%` e funcoes `90,80%`.

Uma tentativa anterior da suite ampla foi encerrada apenas pelo limite do
orquestrador antes de produzir resumo; ela nao foi tratada como verde nem como
falha de produto.

## Perguntas para auditoria independente

1. A identidade forte e a revalidacao das duas pernas fecham substituicao,
   replay, revogacao e alteracao entre prompt e segundo `sim`?
2. O catalogo e o draft preservam os titulares e impedem inversao ou conta
   unica nas duas pontas?
3. A escrita produz exatamente uma transferencia neutra e nenhuma receita ou
   despesa, inclusive no ledger canonico?
4. O caminho publico e os stores reais exigem efeito unico em confirmacao,
   replay e reinicio?
5. Resta alguma lacuna causal indispensavel dentro do Gate 38.4 local?
