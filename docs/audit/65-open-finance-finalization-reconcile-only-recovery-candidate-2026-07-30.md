# 9P.4 — recovery da retomada somente por reconciliação

Atualizado em: 2026-07-30

Base auditada:
`a512a07a8f18c9dffcf62676357c35f41f50395d`.

## Estado

`RECOVERY LOCAL VERDE; NOVO COMMIT IMUTÁVEL E REAUDITORIA PENDENTES`.

## Motivo

A auditoria independente do primeiro candidato confirmou os nove arquivos e
emitiu `NO-GO` com `CRITICAL 0`, `HIGH 2`, `MEDIUM 1`, `LOW 0`:

1. uma finalização já persistida como `writing` podia voltar a chamar o writer
   normal quando outro store/processo retomasse a proposta;
2. um erro explícito `FINANCIAL_WRITE_UNCERTAIN` surgido no append podia ser
   rebaixado a `failed`;
3. os testes anteriores não separavam stores nem compunham a retomada com o
   adaptador Google e o `FinancialWriteLedger` reais.

O parecer foi estático. O Chat não executou as contagens locais.

## Correção

- o executor separa `writer` de primeira tentativa e `reconciler` de retomada;
- estados previamente `writing` ou `uncertain` nunca chamam o writer normal;
- o reconciliador de produto chama `appendRowToSheet` com
  `reconcileOnly=true`;
- nesse modo, ausência de operação durável, operação `failed` ou reconciliação
  inconclusiva bloqueiam antes de qualquer append;
- somente ledger `committed` ou prova positiva da última linha esperada em
  operação `pending/uncertain` podem concluir a retomada;
- `FINANCIAL_WRITE_UNCERTAIN` é preservado e mantém o ledger `uncertain`;
- conclusão por reconciliação reporta `financial_writes=0`;
- a operation key, o vínculo ao ator, o recibo e a ordem
  `review finalized -> receipt_delivered` permanecem inalterados.

## Prova causal executada pelo Codex

- finalização focal: `9/9`;
- adaptador Google/ledger para append: `6/6`;
- entrada pública 9P.4 afetada: `1/1`;
- suíte unitária completa, incluindo todos os writers Google: `205/205`;
- sintaxe dos quatro arquivos alterados: verde;
- `git diff --check`: verde.

O teste novo simula crash depois de `writing`, fecha o primeiro store, reabre
outro store no mesmo banco e usa o `appendRowToSheet` de produto com um
`FinancialWriteLedger` real. Sem ledger, o resultado é `uncertain` e
`appendCalls=0`. Com operação `pending` e linha exata já observada no Sheets
falso, a mesma operation key é reconciliada para `committed`, ainda com
`appendCalls=0`.

Outro teste faz o append subjacente lançar
`FINANCIAL_WRITE_UNCERTAIN` e exige que o ledger continue `uncertain`, nunca
`failed`.

Não houve WhatsApp, Pluggy, Google, Oracle/OCI ou AWS reais, escrita financeira,
restart, QR ou deploy.

## Arquivos centrais para reauditoria

- `src/openFinance/openFinanceSaveProposalFinalization.js`;
- `src/services/google.js`;
- `src/openFinance/openFinanceSaveProposalFinalizationStore.js`;
- `src/reliability/financialWriteLedger.js`;
- `tests/openFinanceSaveProposalFinalization.test.js`;
- `tests/unit.test.js`;
- `tests/financialStateMachine.test.js`;
- `docs/audit/64-open-finance-save-proposal-finalization-candidate-2026-07-30.md`;
- este documento.

## Perguntas fechadas

1. Uma retomada `writing/uncertain` deixou de chamar o writer normal?
2. `reconcileOnly` impede append quando não existe prova durável suficiente?
3. `FINANCIAL_WRITE_UNCERTAIN` permanece incerto no ledger e na finalização?
4. Os testes novos compõem stores separados, handler, adaptador Google e ledger
   reais sem substituir a decisão avaliada?
5. Restou achado bloqueante ou lacuna causal indispensável dentro do escopo
   local de processo único?

Um eventual `GO` autoriza somente o fechamento técnico local de 9P.4. Não
autoriza flags, integrações reais, deploy ou produção.
