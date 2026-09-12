# FinançasBot NEXT-02 — N02-D auditoria independente focal

Data: 2026-09-06
Tarefa de auditoria: `FIN-NEXT02-N02D-AUDIT-20260906`
Objeto auditado: `c0c762786d81db71cf82681915750efb2f23f9e7`
Parent único confirmado: `3bb1f93aeacecab547cc1402c9e04c01f6ddb5a2`
Escopo: exclusivamente a fatia N02-D de subcategorias no delta imutável entre esses hashes.

## Veredito

**APROVÁVEL** somente para a fatia N02-D no SHA `c0c762786d81db71cf82681915750efb2f23f9e7`.

Não foi demonstrada rota causal concreta de falso verde residual dentro do escopo declarado. Este parecer não fecha NEXT-02, não abre NEXT-03 e não autoriza produção, deploy, writers, adapters/integrações reais ou dados reais.

## Manifesto lido integralmente

### Nove arquivos alterados

1. `src/next/kernel/observationKernel.js`
2. `src/next/kernel/expenseReadModel.js`
3. `scripts/agent/financasBotNext02ValidationPolicy.js`
4. `scripts/agent/validateFinancasBotNext02.mjs`
5. `tests/next02Subcategories.test.js`
6. `docs/plans/workstreams/financasbot-next-02-n02d-subcategories-v1.md`
7. `docs/plans/workstreams/financasbot-next-02-validation-v1.md`
8. `docs/plans/workstreams/financasbot-next-02.md`
9. `docs/agent-memory/workstreams/financasbot-next-02.md`

### Quatro arquivos inalterados confrontados

- `src/next/kernel/installmentSchedule.js`
- `src/next/tools/readOnlyToolGateway.js`
- `tests/next02BillingReadModel.test.js`
- `src/ledger/canonicalLedgerProjector.js`

Também foi aplicado o protocolo canônico de auditoria do FinançasBot: identidade/manifesto antes do mérito, leitura do conteúdo integral, findings por cadeia causal e separação entre código/testes e alegações de execução.

## Confirmação do objeto

O commit remoto efetivamente lido é `c0c762786d81db71cf82681915750efb2f23f9e7` e contém uma única entrada em `parents`, `3bb1f93aeacecab547cc1402c9e04c01f6ddb5a2`. O compare remoto está `ahead`, com `ahead_by=1`, `behind_by=0`, `total_commits=1`, merge-base igual ao parent e exatamente os nove paths alterados do manifesto.

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

### Vínculo subcategoria ↔ categoria

A policy v4 exige catálogo explícito de `subcategories` com `{id, category_id}`. IDs precisam ser únicos, o parent precisa existir e o payload aceita `subcategory_id` somente como `null` ou como ID conhecido cujo `category_id` coincide com a categoria do evento. Eventos neutros não podem adquirir subcategoria de despesa. A consulta por subcategoria valida o ID e, quando categoria também é informada, exige compatibilidade; usada sozinha, a subcategoria resolve sua categoria pelo catálogo server-side. Assim, categoria/subcategoria incompatível falha em vez de produzir `empty`.

### Refund preservando a subcategoria da compra corrente

As relações são resolvidas contra o snapshot corrente. Refund exige alvo ativo de kind `purchase` e igualdade de família, pessoa, conta/cartão, categoria, **subcategory_id** e moeda, além das regras anteriores de data, estado e limite cumulativo. A aresta `compensates` aponta ao evento corrente e fixa `target_event_version`. Uma correção da compra que altera subcategoria sem correção correspondente do refund não permanece silenciosamente válida.

### Installment preservando a subcategoria da compra corrente

Antes de delegar à agenda pura N02-B, a integração canônica exige que cada installment ativo resolva a compra corrente e tenha `part.subcategory_id === target.subcategory_id`, além das invariantes anteriores. O projetor puro `installmentSchedule.js` permanece inalterado; subcategoria foi acrescentada somente na camada que possui a autoridade de vínculo. Isso evita redesenho do schema interno de agenda sem perder a invariante econômica.

### `null` relevante sem falso `empty`/`zero`

`subcategory_id: null` continua participando dos totais de categoria/família. Para uma consulta específica por subcategoria, o read model inclui registros `null` como candidatos desconhecidos durante o recorte de categoria/pessoa/instrumento e só depois verifica período/lente/estado. Se um `null` puder pertencer à subcategoria pedida dentro do mesmo recorte material, a resposta é `coverage_insufficient/incomplete`; não `empty` ou zero. Um `null` de outra categoria, pessoa, período ou evidence state não bloqueia indevidamente uma ausência conclusiva no recorte consultado.

A expressão documental “null relevante tratado como empty” aparece numa enumeração de casos negativos, mas o contrato imediatamente anterior diz o oposto e o teste `NEXT02D:UNKNOWN` exige `incomplete` no caso relevante. O código implementa a regra conservadora; a frase não demonstra defeito causal do candidato.

### Filtros de pessoa, conta/cartão, período, lente e estado

O escopo familiar/pessoal permanece resolvido contra `trustedContext`. Category, subcategory, account e card precisam pertencer ao catálogo; account+card simultâneos falham; `billing_period` continua rejeitando account. Período, `transaction_date` versus `billing_period` e `confirmed` versus `projected` preservam as regras N02-C, cujo arquivo de regressão permanece obrigatório no gate N02-D. O filtro de subcategoria compõe essas dimensões, em vez de substituí-las.

### Versões, tombstones e provenance

`subcategory_id` entra no payload assinado, no integrity hash e em `field_provenance` com a observação exata. Correções criam nova observation/event version, preservam history e a projeção corrente usa somente a versão atual. Tombstone retira a versão corrente do conjunto ativo. Evidências da leitura continuam usando refs `event_id:vN`; vínculos para refund/installment são recalculados contra os eventos correntes.

### Boundary pública de labels

V4 exige mapeamento público completo de subcategorias. Labels precisam ser válidas e únicas dentro do seletor e não podem conter nenhum ID interno conhecido, inclusive IDs de subcategoria. O adapter converte label pública → ID apenas internamente; o claim devolve o texto público original em `filters`, e referências internas são trocadas por handles efêmeros locais à resposta. Um ID interno usado como argumento público de subcategoria é rejeitado.

### Opt-in v4 e regressões v1/v2/v3

`next02-import-v1` permanece default; v2 e v3 continuam policies distintas; v4 só é habilitado por `policyVersion === next02-import-v4`. Catálogo/payload v4 não são aceitos silenciosamente por v1/v2/v3. O gate N02-D mantém obrigatórios os 20 testes A, 11 B e 13 C antes dos 13 D. O comportamento v3 de lens/state/coverage continua exercitado pelo arquivo N02-C inalterado.

### Reaproveitamento do v1

O reaproveitamento foi comportamental e focal. No projector legado, categoria e subcategoria são campos distintos do evento, e compensações vinculadas preservam categoria/subcategoria do evento relacionado. N02-D reutiliza essa semântica, mas troca strings/heurísticas por catálogo sintético explícito, IDs validados, versão/provenance e links canônicos. O runtime v1, o projector legado, o gateway read-only e o projetor puro de agenda não foram redesenhados ou importados para o kernel Next. Não foi demonstrada duplicação arquitetural desnecessária.

## Gate e 57 propriedades

`sliceContract('N02-D')` conserva o inventário executável em **15 fontes**. As propriedades são 20 `NEXT02:*` + 11 `NEXT02B:*` + 13 `NEXT02C:*` + 13 `NEXT02D:*` = **57**.

`validatePropertyEvents` aceita somente `test:pass` real dos arquivos canônicos, top-level, `details.type=test`, sem skip/todo, com ID conhecido e único e arquivo correspondente. Fail, ausência, duplicidade, nesting, arquivo errado e stdout como substituto não satisfazem o gate.

Para `--slice N02-D`, o validador fixa a base `3bb1f93aeacecab547cc1402c9e04c01f6ddb5a2`, exige `--expected-head` de 40 hex e `--expected-parent` exatamente igual a essa base, valida HEAD real, parent único/correto, worktree limpa, arquivos tracked e ignored paths relevantes, e recusa alterações fora da allowlist. O objeto remoto auditado confirma a relação de um único commit sobre esse parent.

## Histórico documental versus estado vigente

Os documentos mantêm checkpoints históricos de N02-A/B/C e etapas intermediárias de N02-D. Eles são explicitamente marcados como históricos/superados. O estado material do candidato é N02-D validado localmente e submetido à auditoria independente; N02-C já possui recibo consumido e não foi reauditado nesta tarefa.

## Evidência de execução — não reproduzida pelo auditor

Esta auditoria é revisão estática independente do objeto imutável no GitHub. **Não reexecutei**:

- gate final/local relatado `57/57`;
- bateria afetada `130/130`;
- suíte ampla relatada de `1.986` testes, `1.976 PASS`, `0 FAIL`, `10 SKIP` previstos;
- `runner valid=true`.

Esses números permanecem evidência local relatada pelo candidato. A consulta ao GitHub não apresentou status checks nem workflow runs associados ao SHA, portanto não foram convertidos em prova CI remota independente.

## Limites preservados

Golden Set integral, motor completo de provenance e o GO global de NEXT-02 permanecem pendentes. A aprovação desta unidade não certifica essas lacunas nem autoriza qualquer fase posterior ou efeito real.

Este parecer não autoriza NEXT-03, produção, deploy, writers, adapters/integrações reais, OCI, WhatsApp, Pluggy, Google ou dados reais.
