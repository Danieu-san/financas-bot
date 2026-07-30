# Fila pós-9P.4 — candidato do menu numerado de pagamento

Atualizado em: 2026-07-30

Base:
`6a94eb425f3a7bc58aad8b3382ddc8021ad7a07e`.

## Estado

`CORREÇÃO LOCAL VERDE; COMMIT IMUTÁVEL E AUDITORIA INDEPENDENTE PENDENTES`.

## Objetivo

Encerrar o segundo item da fila pós-9P.4: apresentar todas as formas de
pagamento como menu numerado e manter as dependências de cartão/conta coerentes
até a revalidação final.

## Achado reproduzido

O menu numerado já existia, mas a transição:

`PIX com conta escolhida -> Dinheiro`

limpava o cartão e preservava a conta financeira anterior. A conversa podia
concluir o rascunho, enquanto a revalidação final o rejeitava como incompatível.

O RED observou explicitamente:

`Pagamento: Dinheiro` com `Conta financeira: Nubank Daniel`.

## Correção

- `Crédito` limpa a conta financeira e exige cartão;
- `Débito` e `PIX` limpam cartão e exigem conta financeira;
- `Dinheiro` limpa cartão e conta financeira;
- a ordem do catálogo permanece fechada:
  1. Crédito;
  2. Débito;
  3. PIX;
  4. Dinheiro;
- entradas não numéricas ou fora do intervalo continuam rejeitadas;
- a finalização aceita Dinheiro somente sem cartão/conta e rejeita o estado
  antigo com conta presa.

## Prova causal

O teste atravessa entrega, aceite, revisão durável e escolhas reais:

1. escolhe categoria;
2. abre `3. Forma de pagamento`;
3. exige as quatro opções numeradas;
4. seleciona `3. PIX`;
5. seleciona uma conta;
6. reabre o menu e seleciona `4. Dinheiro`;
7. exige conta e cartão como não definidos;
8. conclui e reabre o store para confirmar o rascunho limpo.

A prova final exige que o plano Dinheiro seja aceito sem meio financeiro e que
uma conta residual produza `open_finance_final_draft_incomplete`.

## Evidência executada pelo Codex

- conversa guiada: `19/19`;
- finalização/writer: `11/11`;
- catálogo familiar: `2/2`;
- sintaxe e `git diff --check`: verdes.

Não houve WhatsApp, Google, Pluggy, Oracle/OCI ou AWS reais, escrita financeira,
flag, deploy, restart ou QR.

## Arquivos para auditoria

- `src/openFinance/openFinanceSaveProposalConversation.js`;
- `src/openFinance/openFinanceSaveProposalReviewCatalog.js`;
- `src/openFinance/openFinanceSaveProposalReviewStore.js`;
- `src/openFinance/openFinanceSaveProposalFinalization.js`;
- `tests/openFinanceSaveProposalConversation.test.js`;
- `tests/openFinanceSaveProposalReviewCatalog.test.js`;
- `tests/openFinanceSaveProposalFinalization.test.js`;
- este documento.

## Perguntas fechadas

1. As quatro formas aparecem como opções numeradas derivadas do catálogo
   fechado?
2. As transições limpam meios incompatíveis e preservam os compatíveis?
3. A conversa e a revalidação final agora concordam para Dinheiro?
4. Os testes atravessam as funções reais e usam boundaries falsos apenas como
   backing store/tripwire?
5. Resta achado bloqueante ou lacuna indispensável?

Um eventual `GO` encerra somente este item local. Não autoriza flags,
integração real, deploy ou produção.
