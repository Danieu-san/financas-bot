# Gate 38.2 - candidato de escrita de entrada genuina

Data: 2026-08-10

## Estado proposto

`CANDIDATO LOCAL VERDE; AGUARDA AUDITORIA INDEPENDENTE; SEM DEPLOY`.

## Escopo fechado

O candidato permite somente que uma revisao duravel do Gate 36, decidida
explicitamente como `income`, origine uma proposta de salvamento de entrada.
Estorno, transferencia, reserva, rendimento, compra e qualquer classificacao
incerta continuam fora deste gate.

## Fronteira causal

1. `revisar <codigo> entrada` terminaliza apenas a classificacao semantica.
2. A fonte atual e relida do vault, o lifecycle deve continuar
   `income_candidate/POSTED` e a reconciliacao deve continuar `new`.
3. A proposta fica cifrada, duravel, vinculada ao ator, a revisao semantica,
   alias, geracao, observacao e operation key.
4. O primeiro `sim` abre apenas a conferencia guiada.
5. A conferencia usa pessoas, categorias de entrada, formas de recebimento e
   contas financeiras do escopo autorizado; cartao e proibido.
6. Antes do prompt final, fonte, decisao semantica, ledger e catalogo sao
   relidos e comparados.
7. Somente o segundo `sim` pode produzir uma linha em `Entradas`; o executor e
   o recibo duraveis ja aprovados no Gate 38.1 preservam append unico e replay.

## Prova publica

O teste do handler publico atravessa stores, vault, reconciliador, catalogo,
conversa guiada, finalizacao e writer reais. Ele exige zero append na
classificacao, no primeiro aceite e na revisao; depois exige exatamente um
append em `Entradas`, com `user_id`, conta e operation key, e nenhum segundo
append no replay.

Os focais adicionais falham fechado quando mudam decisao semantica, fonte,
catalogo de entrada ou dependencia de cartao, e provam replay da promocao
duravel sem escrita.

## Evidencia local

- sintaxe dos modulos alterados: verde;
- focais e regressao de compra: `46/46`;
- caminho publico do Gate 38.2: `1/1`;
- suite hermetica ampla unica: `1599/1589/0/10`;
- cobertura: linhas `91,06%`, branches `73,77%`, funcoes `90,69%`;
- diff check: verde.

As contagens sao execucao local do Codex, nao execucao do auditor.

## Arquivos primarios para auditoria

- `src/openFinance/openFinanceReviewedIncomeSaveProposal.js`;
- `src/openFinance/openFinanceProactiveReviewStore.js`;
- `src/openFinance/openFinanceShadowPreviewStore.js`;
- `src/openFinance/openFinanceSaveProposalReviewCatalog.js`;
- `src/openFinance/openFinanceSaveProposalReviewStore.js`;
- `src/openFinance/openFinanceSaveProposalConversation.js`;
- `src/openFinance/openFinanceSaveProposalFinalization.js`;
- `src/handlers/messageHandler.js`;
- `tests/openFinanceIncomeSaveProposal.test.js`;
- `tests/financialStateMachine.test.js`.

## Limites

Nenhuma flag, planilha, sessao WhatsApp, Pluggy ou servidor real foi alterado.
O estado maximo possivel e `GO TECNICO LOCAL; SEM DEPLOY`.
