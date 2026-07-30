# Fila pós-9P.4 — recovery da nova categoria proativa

Atualizado em: 2026-07-30

Base rejeitada:
`4473a4c66d6d7bdad6149e25f20ccaa9e2e4b10e`.

## Estado

`RECOVERY LOCAL VERDE; NOVO COMMIT IMUTÁVEL E REAUDITORIA PENDENTES`.

## NO-GO anterior

A auditoria independente confirmou a intenção do candidato, mas encontrou:

- `HIGH`: o catálogo cortava silenciosamente categorias acima de 100;
- `HIGH`: o append final não exigia destino user-scoped e poderia cair na
  planilha central;
- `MEDIUM`: as provas não fechavam a cadeia entre entrada pública, revisão
  durável, writer real e redescoberta no catálogo.

Nenhum `GO` foi atribuído ao hash rejeitado.

## Recovery

### Catálogo integral e navegável

- a deduplicação autorizada termina antes da aplicação de limite;
- até 1.000 categorias distintas são preservadas integralmente e persistidas
  no store cifrado;
- acima de 1.000, o catálogo falha fechado com
  `open_finance_save_review_categories_catalog_too_large`;
- o WhatsApp mostra oito categorias por página;
- `Ver mais categorias` mantém a criação indisponível enquanto houver uma
  página posterior;
- somente a última página oferece `Criar nova categoria`, depois de todas as
  categorias existentes;
- a página corrente é estado durável da revisão e não altera dados
  financeiros.

### Destino obrigatório

- `writeOpenFinanceSaveProposal` envia `requireUserScoped: true`;
- `appendRowToSheet` encerra antes do ledger e antes do Google append quando a
  resolução não retorna planilha pessoal/familiar;
- o cartão legado continua mapeado para `Lançamentos Cartão`;
- não existe fallback para a planilha central neste writer.

### Cadeia causal

As provas agora conectam os controles complementares:

1. o handler público abre o menu e persiste `Pets` como `user_created` no
   review store real, sem write;
2. o handler público de 9P.4 revalida a categoria durável e emite um único
   append com `requireUserScoped`;
3. o writer de produto atravessa a resolução OAuth real, a conversão real de
   Saídas/cartão e um Sheets user-scoped controlado;
4. um catálogo novo usa os leitores reais e reencontra `Pets` em `Saídas` e
   `Educação` em `Lançamentos Cartão`;
5. destino central é testado como falha fechada com zero append;
6. 137 categorias permanecem no catálogo e 1.001 são recusadas sem truncamento.

Os backing stores de OAuth, ledger e Sheets do teste são temporários. Eles não
substituem as decisões avaliadas: resolução user-scoped, mapeamento, append,
leitura, filtragem familiar e reconstrução do catálogo são funções de produto.

## Evidência executada pelo Codex

- conversa, finalização, catálogo e causalidade: `38/38`;
- entrada pública de revisão e finalização: `2/2`;
- mapeamento e bloqueio do fallback central: `2/2`;
- teste focal de paginação e store durável: `1/1`;
- sintaxe dos arquivos alterados e `git diff --check`: verdes.

As contagens são evidência local relatada. O Chat não as executou.

## Limites

Não houve WhatsApp, Google, Pluggy, Oracle/OCI ou AWS reais, escrita financeira
real, flag, deploy, restart ou QR. O teto de 1.000 é uma fronteira defensiva:
ao ser excedido, criação e seleção ficam indisponíveis; não há catálogo parcial.

## Arquivos para reauditoria

- `src/handlers/messageHandler.js`;
- `src/openFinance/openFinanceSaveProposalConversation.js`;
- `src/openFinance/openFinanceSaveProposalReviewCatalog.js`;
- `src/openFinance/openFinanceSaveProposalReviewStore.js`;
- `src/openFinance/openFinanceSaveProposalFinalization.js`;
- `src/services/google.js`;
- `tests/financialStateMachine.test.js`;
- `tests/openFinanceNewCategoryCausality.test.js`;
- `tests/openFinanceSaveProposalConversation.test.js`;
- `tests/openFinanceSaveProposalFinalization.test.js`;
- `tests/openFinanceSaveProposalReviewCatalog.test.js`;
- `tests/unit.test.js`;
- este documento.

Um eventual `GO` encerra somente o terceiro item local da fila pós-9P.4. Não
autoriza flags, integração real, escrita financeira, deploy ou produção.
