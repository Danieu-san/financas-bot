# Fila pós-9P.4 — candidato de nova categoria na proposta proativa

Atualizado em: 2026-07-30

Base:
`b547592ee0121f1fc503c61c91d9caa829b683ce`.

## Estado

`CORREÇÃO LOCAL VERDE; COMMIT IMUTÁVEL E AUDITORIA INDEPENDENTE PENDENTES`.

## Caracterização anterior

O fluxo `expense.create` geral já oferecia categorias existentes antes da
criação. A tentativa independente de auditar seu alcance no hash da
caracterização leu os arquivos, mas a interface devolveu somente `Hash` e
marcadores de citação. Não houve veredito utilizável e nenhum `GO` foi
atribuído.

## RED causal

A revisão proativa Open Finance é tratada antes do switch geral de estados.
Seu menu de categoria mostrava somente o catálogo existente e não continha
opção de criação. Portanto, a capacidade do `expense.create` não alcançava a
proposta 9P.3/9P.4.

## Correção

- categorias existentes continuam derivadas do catálogo autorizado e aparecem
  primeiro;
- `Criar nova categoria` é acrescentada somente como última opção de conversa;
- a escolha abre um passo durável que aceita nome explícito de até 60
  caracteres;
- número isolado, fórmula, controle, `Outros` e colisão com categoria existente
  são rejeitados;
- a nova categoria recebe identidade determinística e origem
  `user_created`;
- nada é gravado durante a revisão;
- a revalidação final valida novamente forma, identidade, origem, conteúdo e
  ausência de colisão;
- o writer continua recebendo um único plano `expense.create`.

## Decisão de persistência

Não há append antecipado na aba `Categorias`. A categoria nova é gravada no
único lançamento confirmado; depois do commit, o catálogo já a reencontra em
`Saídas` ou `Lançamentos Cartão`. Isso evita uma operação composta parcial em
que a categoria fosse criada e o gasto falhasse.

## Prova causal

A conversa real exige:

1. categoria existente antes da criação;
2. texto livre no menu rejeitado;
3. escolha numerada da criação;
4. nomes inseguros e categoria já existente rejeitados;
5. `Pets` persistida no SQLite real como `user_created`;
6. resposta explícita de que nada foi salvo.

A finalização real exige:

1. nova categoria validada fora do catálogo somente com origem explícita;
2. uma única chamada a `appendRowToSheet`;
3. categoria presente na linha e a mesma operation/message key de 9P.4;
4. fórmula, `Outros`, número isolado e colisão rejeitados.

## Evidência executada pelo Codex

- RED focal: `0/2`;
- GREEN focal final: `2/2`;
- conversa, finalização e catálogo: `36/36`;
- sintaxe e `git diff --check`: verdes.

Não houve WhatsApp, Google, Pluggy, Oracle/OCI ou AWS reais, escrita financeira,
flag, deploy, restart ou QR.

## Arquivos para auditoria

- `src/handlers/messageHandler.js`;
- `src/openFinance/openFinanceSaveProposalConversation.js`;
- `src/openFinance/openFinanceSaveProposalReviewCatalog.js`;
- `src/openFinance/openFinanceSaveProposalReviewStore.js`;
- `src/openFinance/openFinanceSaveProposalFinalization.js`;
- `tests/openFinanceSaveProposalConversation.test.js`;
- `tests/openFinanceSaveProposalFinalization.test.js`;
- este documento.

Um eventual `GO` encerra somente o terceiro item local da fila. Não autoriza
flags, integração real, escrita financeira, deploy ou produção.
