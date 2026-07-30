# Fila pós-9P.4 — recovery das dependências de pagamento

Atualizado em: 2026-07-30

Base rejeitada:
`6b1ba3ffb105149bd04207a1fced6d18d9b7d624`.

## Estado

`RECOVERY LOCAL VERDE; NOVO COMMIT IMUTÁVEL E REAUDITORIA PENDENTES`.

## NO-GO independente

O Chat leu integralmente os oito arquivos do candidato 69 e registrou:

- `CRITICAL 0`;
- `HIGH 1`: depois de escolher o pagamento, a edição direta ainda permitia
  anexar conta/cartão incompatível;
- `MEDIUM 1`: faltavam a matriz adversarial dessas edições e entradas inválidas;
- `LOW 0`.

Exemplo causal: `Dinheiro -> Conta financeira` recriava um rascunho que a
conversa podia concluir, mas a revalidação final recusava.

## Correção

- a entrada no seletor de conta só é permitida para Débito ou PIX;
- a entrada no seletor de cartão só é permitida para Crédito;
- Dinheiro bloqueia ambos os seletores;
- ausência de forma de pagamento bloqueia conta e cartão;
- revisão antiga já parada em seletor incompatível retorna ao menu;
- a conferência também falha fechada se qualquer campo proibido sobreviver no
  rascunho.

## Prova causal

A conversa real agora exige:

1. texto (`PIX`), decimal (`1.5`) e índice fora do catálogo (`5`) rejeitados;
2. Crédito bloqueia conta e permite cartão;
3. Débito bloqueia cartão e permite conta;
4. PIX bloqueia cartão e permite conta;
5. Dinheiro bloqueia conta e cartão;
6. o store reaberto permanece em `menu`, com Dinheiro e sem dependências.

`0` não é índice inválido: é o cancelamento terminal documentado e já testado
separadamente.

## Evidência executada pelo Codex

- conversa guiada: `21/21`;
- finalização e catálogo: `13/13`;
- sintaxe e `git diff --check`: verdes.

Não houve WhatsApp, Google, Pluggy, Oracle/OCI ou AWS reais, escrita financeira,
flag, deploy, restart ou QR.

## Arquivos para reauditoria

- `src/openFinance/openFinanceSaveProposalConversation.js`;
- `src/openFinance/openFinanceSaveProposalReviewCatalog.js`;
- `src/openFinance/openFinanceSaveProposalReviewStore.js`;
- `src/openFinance/openFinanceSaveProposalFinalization.js`;
- `tests/openFinanceSaveProposalConversation.test.js`;
- `tests/openFinanceSaveProposalReviewCatalog.test.js`;
- `tests/openFinanceSaveProposalFinalization.test.js`;
- este documento.

Um eventual `GO` encerra somente o item local do menu de pagamento. Não
autoriza flags, integração real, escrita financeira, deploy ou produção.
