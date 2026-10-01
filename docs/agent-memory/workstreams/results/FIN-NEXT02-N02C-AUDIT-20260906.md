# FinançasBot NEXT-02 — N02-C auditoria independente focal

Data: 2026-09-06
Objeto auditado: `3bb1f93aeacecab547cc1402c9e04c01f6ddb5a2`
Parent único confirmado: `8d987dab960e0ad8f9b112326464b69caa5dfe58`
Escopo: exclusivamente o delta imutável N02-C entre esses dois hashes.

## Veredito

**APROVÁVEL** para a fatia N02-C no SHA `3bb1f93aeacecab547cc1402c9e04c01f6ddb5a2`.

Não foi demonstrada rota causal concreta de falso verde residual dentro do escopo declarado. Este parecer não fecha NEXT-02, não abre NEXT-03 e não autoriza adapters/writers reais, deploy, produção ou dados reais.

## Manifesto lido integralmente

### Nove arquivos alterados

1. `src/next/kernel/observationKernel.js`
2. `src/next/kernel/expenseReadModel.js`
3. `scripts/agent/financasBotNext02ValidationPolicy.js`
4. `scripts/agent/validateFinancasBotNext02.mjs`
5. `tests/next02BillingReadModel.test.js`
6. `docs/plans/workstreams/financasbot-next-02-n02c-billing-read-v1.md`
7. `docs/plans/workstreams/financasbot-next-02-validation-v1.md`
8. `docs/plans/workstreams/financasbot-next-02.md`
9. `docs/agent-memory/workstreams/financasbot-next-02.md`

### Quatro arquivos inalterados confrontados

- `src/next/kernel/installmentSchedule.js`
- `src/next/tools/readOnlyToolGateway.js`
- `tests/next02ObservationKernel.test.js`
- `tests/next02InstallmentSchedule.test.js`

Também foi lido o protocolo vigente do canal `docs/agent-memory/workstreams/chat-codex-channel.md`; o recibo N02-B foi apenas consumido mecanicamente, sem reauditoria.

## Confirmação do objeto

O commit remoto retorna exatamente o SHA solicitado e uma lista `parents` com um único elemento, `8d987dab960e0ad8f9b112326464b69caa5dfe58`. O compare parent...head está `ahead`, `ahead_by=1`, `total_commits=1`, merge-base igual ao parent e exatamente os nove paths acima.

## Findings

### CRITICAL

Nenhum.

### HIGH

Nenhum.

### MEDIUM

Nenhum.

### LOW

Nenhum finding causal demonstrado.

## Avaliação causal

### Opt-in v3 preservando v1/v2

`observationKernel` mantém `next02-import-v1` como default, conserva `next02-import-v2` e acrescenta `next02-import-v3` explicitamente. Campos de parcelas só aparecem para v2/v3. Sem `policyVersion`, observações v3 falham pela policy; v2 continua sendo a policy da agenda interna. O read model público v3 só habilita o novo schema quando `policyVersion === next02-import-v3`; o path legado v1 continua com o schema anterior.

### transaction_date versus billing_period

No v3, `billing_period` seleciona somente parcelas, refunds de cartão e compras de cartão não parceladas com competência explícita. A compra total parcelada (`installment_total !== null`) é excluída dessa lente. Em `transaction_date`, somente purchase/refund entram; installments não entram. Assim, a mesma compra parcelada não é somada como compra total e como parcelas na mesma consulta.

### Coverage por lente/estado e as_of

O v3 exige uma lista de no máximo quatro provas com chave única `(time_basis, evidence_state)` para `transaction_date|billing_period` x `confirmed|projected`. Ausência da combinação pedida retorna `coverage_insufficient/incomplete`; não há fallback entre lentes ou estados. Cobertura `confirmed` complete precisa terminar integralmente até `as_of`. Cobertura `projected` pode declarar horizonte futuro explicitamente. Todas as observações e seus `coverage.as_of` precisam estar observadas até cada `as_of` fornecido ao snapshot.

### confirmed separado de projected

A query v3 exige `evidenceState`, o somatório seleciona somente eventos desse estado e o claim/evidence devolvem o mesmo estado. Eventos do outro estado podem ser referenciados apenas como prova estrutural de uma agenda completa; não entram no total. Não há promoção de projected para confirmed.

### Refund com competência explícita

No v3, refund de cartão pode carregar `billing_period` explícito. O vínculo econômico continua sendo `compensates` para a compra exata, com validação das dimensões, data de transação e limite cumulativo já herdados do kernel. O read model usa a competência observada do próprio refund; não infere a partir da compra, transaction_date ou parcelas e não distribui o valor entre competências. O target corrente entra nas referências com sua versão.

### Agenda/origens incompletas

Para billing_period, toda agenda relevante ao escopo/filtros precisa estar `complete`; purchase + todos os installments da agenda precisam ter `coverage.completeness === complete` e estado `confirmed|projected`. Falta de parcela, tombstone corrente, origem partial/incomplete/unavailable/estimated ou competência nula relevante bloqueia conclusão. Não se converte a lacuna em `empty` ou zero.

### Referências versionadas da agenda inteira

Antes da soma, o read model coleta purchase e todos os installments de cada agenda relevante em `proofEvents`; cada ref é `event_id:v<event_version>`. A parte selecionada e o target de links também carregam a versão corrente. O teste `NEXT02C:ANCESTRY` exige que todos os eventos da agenda apareçam nas refs da claim completa.

### Escopo, filtros e boundary pública

Escopo familiar/pessoal continua server-side. Category/card/account precisam existir no catálogo; `account` é rejeitado em `billing_period`. O gateway v3 acrescenta apenas `evidenceState` ao schema público; filtros de category/account/card continuam traduzidos de labels públicas para IDs somente dentro do adapter. Egress substitui identidade por labels e troca refs internas por handles efêmeros locais à resposta.

### Pagamento de fatura e transferência

`billing_period` filtra somente installment/refund/purchase de cartão; `transaction_date` somente purchase/refund. `invoice_payment` e `transfer` ficam fora das duas somas. As relações econômicas herdadas do kernel continuam validadas, mas esses eventos não contribuem para `consumption_total`.

## Gate e 44 propriedades

`sliceContract('N02-C')` usa o mesmo inventário executável de N02-B: 15 fontes. As propriedades são 20 `NEXT02:*` + 11 `NEXT02B:*` + 13 `NEXT02C:*` = 44.

`validatePropertyEvents` aceita somente eventos reais `test:pass` dos três arquivos canônicos, top-level, `details.type=test`, sem skip/todo, com ID conhecido e único. Fail, arquivo errado, nesting, duplicidade, ID ausente ou inesperado produzem erro. O gate executa os arquivos derivados do contract, não aceita evidência documental como substituto.

Para `--slice N02-C`, o gate fixa a base `8d987dab960e0ad8f9b112326464b69caa5dfe58`, exige `--expected-head` de 40 hex e `--expected-parent` exatamente igual à base, chama `validateGitBindingEvidence` para HEAD real, parent único, parent correto, worktree limpa, arquivos tracked e ignored paths relevantes, e recusa paths alterados fora da allowlist da fatia. O compare remoto do objeto confirma um único commit sobre esse parent.

## Histórico documental versus estado vigente

Os documentos contêm registros históricos de N02-A/N02-B e checkpoints anteriores. O estado vigente no candidato é N02-C validado localmente e pendente de auditoria; referências a envio pendente N02-B são explicitamente marcadas como históricas/superadas. Não tratei esses registros antigos como falhas atuais.

## Evidência de execução — não reexecutada pelo auditor

Esta auditoria é revisão estática independente do objeto imutável no GitHub. **Não reexecutei**:

- gate final/local `44/44`;
- bateria afetada `117/117`;
- suíte ampla `1.973` testes, `1.963 PASS`, `0 FAIL`, `10 SKIP` previstos, `0 TODO`;
- runner `valid=true`.

Esses números permanecem evidência local relatada pelo candidato. O GitHub consultado não apresentou status checks nem workflow runs associados ao SHA, então não os converti em prova CI remota independente.

## Limites preservados

N02-C não implementa nem certifica o motor integral de provenance, o Golden Set completo ou subcategorias. Esses itens permanecem pendentes no NEXT-02 e não foram tratados como defeitos apenas por estarem fora desta fatia.

Este parecer não autoriza NEXT-03, adapters/writers reais, deploy, produção, dados reais, OCI, WhatsApp, Pluggy, Google ou qualquer efeito externo.
