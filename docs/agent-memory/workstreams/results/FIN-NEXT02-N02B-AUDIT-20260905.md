# FinançasBot NEXT-02 — N02-B auditoria independente focal

Data: 2026-09-06
Objeto auditado: `8d987dab960e0ad8f9b112326464b69caa5dfe58`
Parent único confirmado: `4a6396000d15d98969b8291d6c162e5aafcd04b9`
Escopo: somente agenda interna de parcelas derivada de observações sintéticas; não é fechamento do NEXT-02.

## Veredito

**APROVÁVEL** para a fatia N02-B no SHA `8d987dab960e0ad8f9b112326464b69caa5dfe58`.

Não foi demonstrada rota causal concreta de falso verde material dentro do escopo declarado. Este parecer não autoriza NEXT-02 completo, NEXT-03, deploy, produção, writers, adapters reais ou dados reais.

## Manifesto e objeto

O commit GitHub retorna exatamente o SHA auditado e possui um único parent, `4a6396000d15d98969b8291d6c162e5aafcd04b9`. O compare parent...candidato está `ahead_by=1`, `total_commits=1`, merge-base igual ao parent e contém exatamente os 10 arquivos alterados declarados.

### 10 arquivos alterados — lidos integralmente

1. `docs/agent-memory/workstreams/financasbot-next-02.md`
2. `docs/plans/workstreams/financasbot-next-02-kernel-reuse-v1.md`
3. `docs/plans/workstreams/financasbot-next-02-validation-v1.md`
4. `docs/plans/workstreams/financasbot-next-02.md`
5. `scripts/agent/financasBotNext02ValidationPolicy.js`
6. `scripts/agent/validateFinancasBotNext02.mjs`
7. `src/next/kernel/installmentSchedule.js`
8. `src/next/kernel/observationKernel.js`
9. `tests/next02InstallmentSchedule.test.js`
10. `tests/next02ObservationKernel.test.js`

### 5 arquivos inalterados relevantes — lidos integralmente

- `src/next/kernel/canonicalValue.js`
- `src/next/kernel/expenseReadModel.js`
- `docs/contracts/next/data-authority-contract-v0.md`
- `src/ledger/canonicalInstallmentSchedule.js`
- `tests/canonicalInstallmentSchedule.test.js`

Contexto adicional focal do gate: `scripts/agent/financasBotNext01ValidationPolicy.js`, função `validateGitBindingEvidence`, reconfirmada no mesmo SHA.

O protocolo canônico de auditoria externa foi consultado metodologicamente: findings foram avaliados por cadeia causal, e resultados locais/documentais não foram tratados como fonte de verdade.

## Análise causal

### Vínculo parcela → compra e identidade

**Conforme.** N02-B não agrupa por descrição/valor como o v1. Cada observação `installment` traz `installment_purchase_ref` explícito; o kernel resolve esse source record contra o snapshot corrente e cria `installment_of` para o evento canônico atual da compra. Parcela órfã ou compra tombstoned com parcela ativa falha fechado.

Identidade do evento continua baseada em família + source type + source instance + source record, independente de valor mutável. O projetor de agenda também rejeita colisão entre event_id da compra e das parcelas e duplicidade de event_id/índice.

### Dimensões, índice e total

**Conforme.** Compra parcelada v2 precisa ser cartão, valor positivo e `installment_total` entre 2 e 999. Parcelas exigem o mesmo `family_id`, `person_id`, `card_id`, `category_id` e `currency` da compra; `transaction_date` também precisa coincidir. Cada índice é inteiro, único, 1..N, e `part.total` precisa igualar o total da compra.

O limite 2..999 é documentado como limite de recurso da policy sintética, não máximo financeiro geral.

### Soma inteira e agenda incompleta

**Conforme.** Valores são safe integers positivos; a soma usa `BigInt`. Agenda completa exige todos os índices e soma exata ao valor da compra. Agenda parcial conserva somente valores observados, `missing_indexes` e `observed_total_minor`; não calcula valor ausente nem cria parcelas.

Além de `sum <= purchase`, o projetor exige `sum + quantidade_de_faltantes <= purchase`, garantindo que cada parcela ausente ainda possa ter ao menos 1 unidade minor sem inferir sua distribuição.

### Confirmado vs projetado

**Conforme para o escopo.** Cada parcela aceita apenas `confirmed` ou `projected`, e o estado é preservado na agenda. `completeness=complete` da agenda significa completude estrutural de índices/soma, não promoção para consumo confirmado nem coverage de consulta. Parcela confirmada exige compra confirmada; parcela projetada não é convertida em confirmada.

### Versões e tombstones

**Conforme.** Chains de observação continuam sem gaps/forks e preservam history. Relações e agendas são calculadas apenas sobre o snapshot corrente. Tombstone de parcela remove a versão corrente da agenda e produz lacuna sem apagar history; compra tombstoned com parcela ativa torna o vínculo inválido e falha fechado.

Links `installment_of` e provenance de agenda carregam `event_version` e `target_event_version`, evitando que a projeção atual pareça vinculada silenciosamente a versão antiga da compra.

### Provenance por campo e versão

**Conforme.** Campos v2 (`installment_total`, `installment_index`, `installment_purchase_ref`, `billing_period`) entram no payload assinado e no `field_provenance` da observação/evento. Na agenda integrada, aliases são resolvidos para os campos canônicos (`index -> installment_index`, `total -> installment_total`) e `purchase_ref` resolve pela aresta `installment_of`; cada origem inclui `event_version`, e o vínculo inclui `target_event_version` da compra.

### Opt-in v2 e preservação do default v1

**Conforme.** `projectObservations()` mantém `next02-import-v1` como default. `next02-import-v2` só entra por `policyVersion` explícita, e cada observação precisa declarar a mesma ingestion policy. O path default v1 continua rejeitando `installment` e payload v2 sem opt-in. `expenseReadModel.js` permanece inalterado e continua chamando o kernel pelo default v1, portanto N02-B não habilita consulta pública de parcelas por efeito lateral.

### Inventário, propriedades e binding do gate

**Conforme estaticamente.** O contrato N02-A permanece com 14 fontes (11 NEXT-01 + 3 kernels N02-A). N02-B adiciona somente `kernel/installmentSchedule.js`, totalizando 15. A inspeção N02-A rejeita a fonte extra, evitando absorção silenciosa da extensão.

N02-B exige 31 IDs estruturados: 20 regressões N02-A + 11 propriedades `NEXT02B:*`. O validador liga cada ID ao arquivo de teste esperado, exige `test:pass`, top-level, `details.type=test`, sem skip/todo, sem duplicidade, e rejeita arquivo/ID/tipo incorreto.

No modo final, `validateFinancasBotNext02.mjs --slice N02-B` fixa base `4a639600...`, exige `expectedHead` de 40 hex e `expectedParent` igual à base, compara HEAD real, lê `rev-list --parents`, exige parent único via `validateGitBindingEvidence`, worktree limpa, arquivos requeridos tracked e ausência de ignored paths relevantes. O objeto auditado no GitHub tem exatamente esse parent único.

## Histórico documental vs estado vigente

Os documentos contêm checkpoints intermediários como 7/7, 9/9, 10/10 e 28/29, explicitamente marcados como histórico de desenvolvimento. Eles não foram tratados como estado vigente. O estado consolidado da própria documentação é N02-B localmente verde, auditoria pendente, com escopo reduzido à agenda interna.

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

Esta é uma revisão estática independente do objeto imutável no GitHub. **Não reexecutei**:

- gate focal `31/31`;
- bateria afetada `104/104`;
- suíte ampla `1.960` testes, `1.950 PASS`, `0 FAIL`, `10 SKIP` previstos, `0 TODO`;
- runner `valid=true`.

Esses números permanecem evidência local relatada pelo candidato. O GitHub consultado não apresentou status checks nem workflow runs associados ao SHA, portanto não foram convertidos em prova remota independente.

O código do gate demonstra capacidade de vincular a execução final ao SHA/parent corretos; a alegação de que essa execução foi efetivamente realizada com `8d987dab...` permanece resultado local reportado, não teste reexecutado nesta auditoria.

## Limites preservados

N02-B **não** implementa consulta pública `billing_period`, coverage/estornos por competência, outras lentes temporais, Golden Set completo ou motor integral de provenance. Esses itens permanecem pendentes e não foram tratados como implementados nem como defeitos desta fatia.

Este parecer aprova somente a qualidade focal da agenda interna N02-B no SHA `8d987dab960e0ad8f9b112326464b69caa5dfe58`. Não encerra NEXT-02 e não autoriza NEXT-03, deploy, produção, writers, adapters reais ou dados reais.
