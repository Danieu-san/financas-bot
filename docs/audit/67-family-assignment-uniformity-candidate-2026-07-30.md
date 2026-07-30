# Fila pós-9P.4 — candidato de atribuição familiar uniforme

Atualizado em: 2026-07-30

Base:
`bcc4afd012bf50278e65888ae8dd6d63be1d8336`.

## Estado

`CAPACIDADE PREEXISTENTE; PROVA CAUSAL LOCAL VERDE; AUDITORIA INDEPENDENTE PENDENTE`.

## Objetivo

Verificar o primeiro item da fila posterior a 9P.4: qualquer um dos dois atores
familiares autorizados pode atribuir um lançamento a Daniel ou Thaís, inclusive
quando usam cartão ou conta um do outro, sem ampliar o escopo além do casal.

## Resultado da inspeção

Não foi necessária mudança de produto:

- o catálogo relê os usuários do escopo financeiro familiar e oferece Daniel e
  Thaís como pessoas numeradas;
- a revisão guiada grava a pessoa selecionada por `id` e `label`, sem vinculá-la
  implicitamente ao remetente;
- a revalidação final exige que a pessoa ainda exista no catálogo familiar
  autorizado;
- o plano de cartão grava o `user_id` da pessoa selecionada;
- o plano de débito/PIX grava o nome e o `user_id` da pessoa selecionada;
- o writer envia ao adaptador Google o `userId` do plano validado, não o
  `userId` do ator que confirmou;
- cartão e conta continuam limitados à planilha familiar autorizada; sua
  titularidade não concede acesso a terceiro.

## Prova nova

A matriz adicionada atravessa preparação, segunda confirmação, revalidação,
plano de escrita e adaptador público do writer em dois sentidos:

1. Daniel confirma no cartão dele um lançamento atribuído à Thaís;
2. Thaís confirma pela conta dela um PIX atribuído ao Daniel.

Nos dois casos:

- há exatamente uma chamada ao boundary `appendRowToSheet`;
- `options.userId` é a pessoa escolhida, nunca o ator;
- a coluna `user_id` da linha é a pessoa escolhida;
- a message key permanece ligada à proposta;
- não há acesso ou atribuição a terceiro.

## Evidência executada pelo Codex

- finalização e writer 9P.4: `10/10`;
- conversa guiada 9P.2/9P.3: `18/18`;
- catálogo familiar: `2/2`;
- sintaxe e `git diff --check`: verdes.

Os testes usam dados sintéticos e boundary falso de Sheets. Não houve WhatsApp,
Google, Pluggy, Oracle/OCI ou AWS reais, escrita financeira, flag, deploy,
restart ou QR.

## Arquivos para auditoria

- `src/openFinance/openFinanceSaveProposalReviewCatalog.js`;
- `src/openFinance/openFinanceSaveProposalConversation.js`;
- `src/openFinance/openFinanceSaveProposalFinalization.js`;
- `tests/openFinanceSaveProposalReviewCatalog.test.js`;
- `tests/openFinanceSaveProposalConversation.test.js`;
- `tests/openFinanceSaveProposalFinalization.test.js`;
- este documento.

## Perguntas fechadas

1. Catálogo, revisão e finalização usam a pessoa selecionada, e não o ator, no
   `user_id` final?
2. A matriz prova os dois sentidos do casal e o uso compartilhado de
   cartão/conta sem ampliar autorização?
3. O boundary falso de Sheets é apenas tripwire, sem substituir a decisão de
   atribuição avaliada?
4. Resta achado bloqueante ou lacuna indispensável para encerrar este item?

Um eventual `GO` encerra somente o item local de atribuição familiar uniforme.
Não autoriza ativação de flags, integração real, deploy ou produção.
