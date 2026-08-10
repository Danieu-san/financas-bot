# Gate 38.3 - candidato de escrita de estorno/reembolso vinculado

Data: 2026-08-10

## Estado proposto

`CANDIDATO LOCAL VERDE; AGUARDA AUDITORIA INDEPENDENTE; SEM DEPLOY`.

## Escopo fechado

O candidato promove somente a decisao duravel `confirm_pair` do Gate 36 para
um estorno/reembolso `POSTED/new`, quando existe uma unica compra original ja
salva e fortemente vinculada tanto na planilha interna quanto no ledger
canonico. Estorno sem vinculo, par fraco ou multiplo, par neutralizado, compra
original ausente e fonte alterada permanecem fail-closed.

## Fronteira causal

1. `revisar <codigo> confirmar` terminaliza apenas a revisao semantica.
2. A promocao reabre vault, revisao e fonte interna e repete lifecycle,
   reconciliacao e resolucao canonica antes de criar a proposta cifrada.
3. O primeiro `sim` abre conferencia guiada, com pessoa, categoria e
   instrumento imutaveis e herdados exclusivamente da compra original.
4. Conta e cartao nunca sao intercambiaveis: estorno de cartao produz valor
   negativo no mesmo cartao; reembolso bancario produz `Entradas/Reembolso` na
   mesma conta da saida original.
5. Antes do prompt final, fonte, par, revisao, planilha, ledger e catalogo sao
   relidos e comparados. Somente o segundo `sim` pode chamar o writer.
6. Operation key e recibo duraveis preservam append unico no replay imediato e
   depois da reabertura dos stores.
7. O append persiste a referencia da linha original nos dois sinks. O projetor
   canonico restaura essa identidade, grava `refund_pair`, classifica
   chargeback/reimbursement e aplica impacto liquido negativo sem criar receita
   genuina nem consumo de orcamento livre.

## Prova publica

O teste do handler publico atravessa handler, vault, revisao, reconciliador,
catalogo, conversa guiada, finalizador e stores reais. Ele exige zero append na
revisao, no primeiro aceite e durante a conferencia, exatamente um append
negativo no cartao original depois do segundo aceite e nenhuma nova tentativa
no replay imediato ou depois de recarregar o modulo e reabrir os stores.

Os testes focais cobrem ainda: fonte/par alterados, estado nao confirmado,
resolucao canonica ausente, ambigua ou ja compensada; reembolso bancario na
conta exata; catalogo singleton; persistencia e recuperacao do vinculo original
nos formatos de cartao e de entrada; e efeito canonico unico.

## Evidencia local

- sintaxe dos modulos alterados: verde;
- focais do Gate 38.3: `8/8`;
- caminho publico do Gate 38.3: `1/1`;
- bateria causal afetada: verde;
- suite hermetica ampla final: `1608/1598/0/10`;
- cobertura: linhas `91,08%`, branches `73,62%`, funcoes `90,72%`;
- diff check: verde.

As contagens sao execucao local do Codex, nao execucao do auditor.

## Arquivos primarios para auditoria

- `src/openFinance/openFinanceReviewedRefundSaveProposal.js`;
- `src/openFinance/openFinanceRuntimeReconciliation.js`;
- `src/openFinance/openFinanceShadowPreviewStore.js`;
- `src/openFinance/openFinanceSaveProposalReviewStore.js`;
- `src/openFinance/openFinanceSaveProposalConversation.js`;
- `src/openFinance/openFinanceSaveProposalFinalization.js`;
- `src/ledger/canonicalLedgerReceiptProjector.js`;
- `src/services/google.js`;
- `src/handlers/messageHandler.js`;
- `tests/openFinanceRefundSaveProposal.test.js`;
- `tests/financialStateMachine.test.js`.

## Limites

Google e WhatsApp permanecem bordas sinteticas nos testes. Nenhuma flag,
planilha, sessao WhatsApp, Pluggy ou servidor real foi alterado. O estado
maximo possivel e `GO TECNICO LOCAL; SEM DEPLOY`.
