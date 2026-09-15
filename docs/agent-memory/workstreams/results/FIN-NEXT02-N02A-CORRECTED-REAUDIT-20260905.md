# FinançasBot NEXT-02 — N02-A corrigido / reauditoria independente focal

Data: 2026-09-05
Objeto auditado: `4a6396000d15d98969b8291d6c162e5aafcd04b9`
Parent único confirmado: `5d4339f46a9ec412d6c86894853435c7238dbcf1`
Escopo: fatia sintética N02-A corrigida; não é fechamento do NEXT-02.
Parecer anterior confrontado: `FIN-NEXT02-N02A-REAUDIT-20260905.md`, objeto `af83a4e0cd79de5e582ce2bd030eb0328da32d52`.

## Veredito

**APROVÁVEL** para a fatia N02-A no SHA `4a6396000d15d98969b8291d6c162e5aafcd04b9`.

Não foi demonstrada rota causal concreta de falso verde residual nos três findings do parecer anterior nem regressão material nova dentro da fatia declarada.

Este veredito não fecha NEXT-02, não abre NEXT-03 e não autoriza deploy, produção, writers, adapters reais ou dados reais.

## Confirmação do objeto

O compare `5d4339f46a9ec412d6c86894853435c7238dbcf1...4a6396000d15d98969b8291d6c162e5aafcd04b9` mostra `ahead_by=1`, `total_commits=1` e merge-base igual ao parent informado. O objeto possui exatamente os 12 paths esperados.

## 12 arquivos alterados — lidos integralmente

1. `src/next/kernel/canonicalValue.js`
2. `src/next/kernel/observationKernel.js`
3. `src/next/kernel/expenseReadModel.js`
4. `tests/next02ObservationKernel.test.js`
5. `tests/next/validatorGate.cases.js`
6. `scripts/agent/financasBotNext01ValidationPolicy.js`
7. `scripts/agent/financasBotNext02ValidationPolicy.js`
8. `scripts/agent/validateFinancasBotNext02.mjs`
9. `docs/plans/workstreams/financasbot-next-02.md`
10. `docs/plans/workstreams/financasbot-next-02-kernel-reuse-v1.md`
11. `docs/plans/workstreams/financasbot-next-02-validation-v1.md`
12. `docs/agent-memory/workstreams/financasbot-next-02.md`

Contexto normativo/inalterado reconfirmado no novo SHA: `docs/contracts/next/data-authority-contract-v0.md`, `docs/contracts/next/model-data-boundary-contract-v0.md`, `src/next/tools/readOnlyToolGateway.js` e `src/next/contracts/modelDataBoundary.js`.

## Confronto causal com o parecer anterior

### HIGH-01 anterior — IDs internos na boundary `expenses.sum`

**CORRIGIDO.**

Cadeia atual:

`argumento público account/card/category -> readOnlyToolGateway valida somente schema público -> adapter N02-A resolve label exata em mapa server-side -> read model recebe ID interno apenas atrás da boundary -> resultado interno é reescrito antes do egress -> entity usa label pública, filtros voltam com labels públicas e evidence.refs viram handles eph_* locais à resposta -> readOnlyToolGateway aplica allowlist/forbidden-key final`.

Evidência estática:

- `createExpenseToolGateway()` agora exige `publicLabels` server-side completos.
- `publicSelectorMaps()` cria mapas label->ID e ID->label e rejeita labels que contenham IDs internos.
- O adapter traduz `category/account/card` para IDs internos somente depois da boundary pública.
- O resultado substitui `claim.entity.ref` por `{ kind, label }`, restaura filtros públicos originais e troca refs estáveis por handles `eph_<sequência>_<índice>` não derivados do identificador financeiro.
- O teste `NEXT02:TOOL` prova que `account: 'Conta A'` é aceito, `account: 'account-a'` é rejeitado e o resultado serializado não contém `family-example`, `person-a`, `account-a` ou `card-a`.
- Os handles efêmeros não são aceitos como entrada/autorização em nenhuma rota desta fatia; sua sequência é local à instância do gateway e não deriva do ID interno.

Não foi demonstrada nova rota de egress de identidade interna pelo caminho público auditado.

### MEDIUM-01 anterior — coverage completa além de `as_of`

**CORRIGIDO.**

Tanto `validateObservation()` quanto `createExpenseReadModel()` exigem agora, para `completeness === 'complete'`, que `as_of >= end + 'T23:59:59.999Z'`. Como `coverage.as_of` é validado como UTC ISO de milissegundos e `end` como data ISO válida, a comparação lexical corresponde à ordem temporal neste formato fechado.

O teste `NEXT02:DA-03` rejeita explicitamente coverage completa em 15/06 e em 30/06 00:00 para intervalo encerrando em 30/06; o fixture verde passou a usar `2042-06-30T23:59:59.999Z`.

A correção é conservadora: pode recusar conclusões completas antes do encerramento integral, mas não cria falso `zero/empty` futuro.

### MEDIUM-02 anterior — perda de `settles_card_id`

**CORRIGIDO.**

Para `invoice_payment`, `eventFromObservation()` define `canonicalCardId = p.settles_card_id`, grava-o em `event.card_id` e registra `field_provenance.card_id = { observation_id, field: 'settles_card_id' }`.

O evento preserva simultaneamente a conta pagadora em `account_id` e o cartão liquidado em `card_id`. Isso é compatível com o schema canônico, mantém pagamento neutro em `expenses.sum` e não inventa link para evento de fatura inexistente nesta fatia.

O teste `NEXT02:DA-04` verifica `account_id`, `card_id` e provenance exata do cartão liquidado.

## Regressão e falso verde

Não foi demonstrada regressão material nas propriedades já aprovadas/revisadas:

- identidade e deduplicação continuam independentes do valor mutável;
- versionamento continua fail-closed para gap/fork e preserva history/current;
- input é copiado defensivamente e output permanece deep-frozen;
- safe integers permanecem obrigatórios e acumulados de refund/transfer usam `BigInt`;
- refund cumulativo continua limitado ao valor da compra e conserva dimensões;
- transfer continua exigindo duas pontas distintas, mesma família/data/moeda/evidence e soma zero;
- pagamento de fatura e transferência continuam neutros para consumo;
- conta continua person-owned e cartão pode ser compartilhado dentro da família;
- N02-A continua aceitando somente `transaction_date`;
- tipos ainda não implementados continuam falhando fechado.

O gateway compartilhado NEXT-01 e o runner hermético permanecem inalterados. A alteração CRLF continua limitada à leitura do teste `validatorGate.cases.js`; o runner congelado não foi alterado.

## Qualidade do gate

O gate N02-A continua inventariando exatamente 14 fontes: os 11 defaults NEXT-01 mais os 3 kernels novos. `financasBotNext01ValidationPolicy.js` preserva seus defaults originais e permite extensão explícita apenas pelos parâmetros fornecidos pelo wrapper NEXT-02.

Os 20 IDs obrigatórios permanecem ligados a eventos estruturados reais de `tests/next02ObservationKernel.test.js`; os três reparos estão dentro de IDs obrigatórios já reconhecidos pelo gate: `TOOL`, `DA-03` e `DA-04`. Skip, todo, fail, nesting, arquivo errado, duplicidade e ID inesperado geram erro.

O gate final continua exigindo `--expected-head` de 40 hex, parent exatamente `5d4339f...`, parent único via `validateGitBindingEvidence`, worktree limpa, required files tracked e ausência de ignored paths relevantes. A comparação GitHub do objeto confirma que o candidato é um único commit sobre esse parent.

## Findings

### CRITICAL

Nenhum.

### HIGH

Nenhum.

### MEDIUM

Nenhum.

### LOW

Nenhum finding causal demonstrado.

## Evidência de execução — não reexecutada pelo auditor

Esta reauditoria é estática e independente sobre o objeto imutável no GitHub. **Não reexecutei** localmente:

- focal/gate `20/20`;
- bateria afetada `86/86`;
- suíte ampla `1.949` testes, `1.939 PASS`, `0 FAIL`, `10 SKIP` previstos, `0 TODO`;
- runner `valid=true`.

Esses números permanecem alegações/evidência local do candidato. O GitHub não apresentou status checks nem workflow runs associados ao SHA consultado, portanto não os converti em prova remota independente.

## Limites preservados

Parcelas, demais bases temporais, Golden Set completo e motor integral de provenance continuam pendentes como limites declarados da fatia, não como implementados e não como defeitos de N02-A.

Este parecer aprova somente a qualidade focal da fatia N02-A no SHA `4a6396000d15d98969b8291d6c162e5aafcd04b9`. Não autoriza encerramento do NEXT-02, NEXT-03, deploy, produção, writers, adapters reais ou uso de dados reais.
