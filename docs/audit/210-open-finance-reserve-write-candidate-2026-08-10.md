# Gate 38.5 - escrita neutra de aplicacao e resgate de reserva

Data: 2026-08-10

## Estado solicitado

`CANDIDATO A GO TECNICO LOCAL; SEM DEPLOY`.

O candidato trata somente decisoes duraveis `reserve_application` e
`reserve_redemption` oriundas da revisao do Gate 37. Rendimento de investimento,
movimento generico, transferencia familiar e qualquer fonte que nao esteja
`POSTED/new` permanecem inelegiveis.

## Contrato implementado

- aplicacao exige fonte debitada e cria uma unica transferencia conta ->
  reserva;
- resgate exige fonte creditada e cria uma unica transferencia reserva ->
  conta;
- conta e reserva sao entradas distintas e tipadas do catalogo autorizado,
  pertencentes ao mesmo titular;
- a primeira confirmacao abre somente a revisao guiada e mantem zero escrita;
- somente o segundo `sim`, depois da conferencia completa, pode chamar o writer;
- fonte, operacao do provedor, geracao, decisao semantica, lifecycle,
  reconciliacao e catalogo sao relidos antes da escrita;
- a operacao usa uma unica linha em `Transferencias`, com relacao canonica
  explicita e impacto patrimonial neutro;
- operation key, store de finalizacao, recibo e reconciliacao preservam uma
  unica tentativa em concorrencia, replay, restart e resultado incerto;
- revogacao da geracao bloqueia o carregamento padrao antes da escrita.

## Fronteiras negativas

O builder rejeita `investment_income`, sinal incompatível, fonte alterada,
conta do provedor que nao seja bancaria, status diferente de `POSTED`,
reconciliacao diferente de `new`, escopo desconhecido e revisao nao terminal.

O fluxo guiado filtra as opcoes por direcao e tipo de conta. A finalizacao
rejeita contas invertidas, titulares divergentes, conta igual a reserva,
catalogo alterado, decisao semantica divergente e qualquer mudanca da fonte.

O projetor canonico converte explicitamente aplicacao/resgate em transferencia
neutra. Isso impede que a descricao legada de Caixinha seja interpretada como
aporte de meta, receita, despesa ou verba livre.

## Prova causal

Os testes usam os stores e funcoes publicas do produto para provar:

- construcao das duas direcoes e exclusao de rendimento;
- ingestao cifrada, vinculacao ao ator e idempotencia;
- bloqueio de geracao revogada pelo carregamento padrao;
- catalogo com conta bancaria e reserva separadas;
- finalizacao das duas direcoes e rejeicao de contas invertidas;
- recibo canonico com contas distintas e impacto liquido zero;
- entrada publica pelo `messageHandler`, revisao guiada, segundo `sim`, um unico
  append em `Transferencias` e nenhum novo append em replay ou restart.

## Evidencia local

- syntax check de todos os arquivos alterados: verde;
- focal do Gate 38.5: `6/6`;
- caminho publico real: `1/1`;
- bateria causal afetada: `246/246`, zero falhas;
- unica suite hermetica ampla concluida: `1624` testes, `1614` aprovados, `0`
  falhas, `10` ignorados previstos; linhas `91,22%`, branches `73,76%` e
  funcoes `90,85%`;
- `git diff --check`: verde.

A primeira tentativa da suite ampla foi interrompida pelo limite externo de 15
minutos antes de emitir resultado. O runner sincronico foi entao executado uma
unica vez ate o fim, em 18m19s, produzindo o resultado valido acima. A tentativa
interrompida nao e contada como evidencia verde.

As contagens sao evidencia local relatada e nao devem ser tratadas pelo auditor
como execucao propria.

## Arquivos causais

- `src/openFinance/openFinanceReviewedReserveSaveProposal.js`;
- `src/handlers/messageHandler.js`;
- `src/openFinance/openFinanceSaveProposalReviewCatalog.js`;
- `src/openFinance/openFinanceSaveProposalReviewStore.js`;
- `src/openFinance/openFinanceSaveProposalConversation.js`;
- `src/openFinance/openFinanceShadowPreviewStore.js`;
- `src/openFinance/openFinanceSaveProposalFinalization.js`;
- `src/ledger/canonicalLedgerReceiptProjector.js`;
- `tests/openFinanceReserveSaveProposal.test.js`;
- `tests/financialStateMachine.test.js`.

## Perguntas para auditoria

1. As decisoes, o sinal, a conta e a reserva permanecem causalmente imutaveis
   desde a revisao duravel ate o segundo `sim`?
2. O caminho publico e a finalizacao real sustentam exatamente uma escrita
   neutra, sem absorver rendimento ou principal em receita/despesa/meta?
3. Replay, restart, revogacao, concorrencia e resultado incerto permanecem
   fail-closed e sem segunda tentativa de append?
4. Resta alguma lacuna indispensavel para o `GO TECNICO LOCAL` do Gate 38.5?
