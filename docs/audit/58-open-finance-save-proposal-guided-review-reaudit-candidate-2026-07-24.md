# 9P.3 — candidato de reauditoria da revisão guiada

Atualizado em: 2026-07-24

Base auditada:
`c452b9b999a6caf6af62696b5c8927ec5970c1f2`.

## Estado

`CORREÇÕES LOCAIS VERDES; NOVO COMMIT IMUTÁVEL E REAUDITORIA PENDENTES`.

## Primeiro veredito independente

O Chat leu os onze arquivos solicitados no hash imutável
`c452b9b999a6caf6af62696b5c8927ec5970c1f2` e emitiu `NO-GO`, sem achado
`CRITICAL` ou `HIGH`, por três achados `MEDIUM`:

1. uma revisão `prepared` podia permanecer ativa quando a aceitação falhava e
   depois o familiar recusava ou cancelava a proposta;
2. o catálogo aceitava linhas legadas sem `user_id` explícito e a prova do
   escopo dos cartões não deixava clara a fronteira familiar;
3. faltava um teste causal exato da queda depois de persistir `accepted` e antes
   de ativar a revisão `prepared`, seguido de restart.

O parecer foi revisão estática externa. Ele não executou os testes e não deve
ser confundido com a evidência local abaixo.

## Correções

### M1 — decisão terminal limpa ou reconcilia a revisão preparada

- `não` e `cancelar` terminalizam a revisão `prepared` correspondente;
- se houver queda depois da decisão terminal e antes dessa limpeza, a próxima
  entrada consulta o estado terminal autenticado da proposta e cancela a
  revisão antes de qualquer edição;
- revisão cancelada continua terminal, vinculada ao ator e sem writer
  financeiro.

### M2 — catálogo nega linha sem escopo explícito

- categorias e contas exigem `user_id` pertencente ao escopo familiar;
- linha legada com `user_id` vazio não é mais admitida;
- todas as cinco leituras de planilha exigem `userId` resolvido e
  `requireUserScoped=true`;
- cartões ativos permanecem compartilhados dentro da planilha familiar
  autorizada. Isso é intencional: o produto é privado para o casal, os dados
  são compartilhados e ambos podem usar os cartões um do outro. A fronteira de
  isolamento é a planilha familiar selecionada pela leitura user-scoped, não um
  filtro de proprietário do cartão.

### M3 — queda no ponto causal exato

O teste de produto agora força a seguinte sequência:

1. revisão persistida em `prepared`;
2. aceitação persistida em `accepted`;
3. falha antes de `activateReview`;
4. fechamento e reabertura dos stores;
5. nova entrada pela rota pública de revisão;
6. recuperação para `editing`, sem duplicar decisão e com
   `financial_writes=0`.

A entrada pública também tenta a recuperação durável quando o snapshot auxiliar
ainda diz `awaiting_open_finance_save_confirmation`. Sem revisão ativa, a
confirmação normal continua com precedência; com revisão aceita/preparada, a
rota durável assume e corrige o estado auxiliar para revisão. O vínculo estrito
por `expectedProposalRef` continua aplicado quando o snapshot já está em
`awaiting_open_finance_save_review`.

## Evidência RED/GREEN executada pelo Codex

- RED das novas provas: `17/19`, com as falhas esperadas de M1 e M2;
- GREEN focal após a correção: `20/20`;
- bateria causal de conversa, catálogo, shadow e máquina de estados: `150/150`;
- toda a bateria Open Finance: `259/259`;
- máquina de estados e entrada pública, depois da correção de precedência:
  `122/122`;
- runner hermético completo:
  - testes: `1.310`;
  - aprovados: `1.305`;
  - falhas: `0`;
  - skips funcionais previstos: `5`;
  - cobertura: linhas `90,18%`, branches `72,27%`, funções `90,03%`;
- sintaxe dos quatro arquivos de produto alterados: verde;
- `git diff --check`: verde.

O runner hermético bloqueou rede em `fetch`, `http`, `https`, `net`,
subprocessos Node e subprocessos não Node. Nenhuma integração real foi
acionada. Não houve WhatsApp, Pluggy, Google, OCI/AWS, writer financeiro ou
deploy.

## Arquivos da reauditoria

- `src/openFinance/openFinanceSaveProposalConversation.js`;
- `src/openFinance/openFinanceSaveProposalReviewCatalog.js`;
- `src/openFinance/openFinanceShadowPreviewStore.js`;
- `src/handlers/messageHandler.js`;
- `tests/openFinanceSaveProposalConversation.test.js`;
- `tests/openFinanceSaveProposalReviewCatalog.test.js`;
- `tests/financialStateMachine.test.js`;
- `docs/audit/57-open-finance-save-proposal-guided-review-candidate-2026-07-24.md`;
- este documento.

## Questões fechadas para o auditor

1. M1 está encerrado tanto no caminho nominal quanto na queda entre decisão
   terminal e limpeza da revisão?
2. M2 está encerrado pela leitura user-scoped, pela exigência de `user_id` nas
   linhas e pela fronteira familiar compartilhada declarada para cartões?
3. M3 está encerrado pelo teste exato de `accepted` persistido antes da
   ativação, com restart e retomada pela rota de produto?
4. Resta achado `CRITICAL`, `HIGH` ou `MEDIUM` ou lacuna causal indispensável
   dentro do gate local 9P.3?
