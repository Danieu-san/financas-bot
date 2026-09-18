# FinançasBot NEXT-02 — N02-E auditoria independente focal

Data: 2026-09-07
Tarefa: auditoria independente focal N02-E — corpus complementar explícito
Objeto auditado: `38da54b2e12ae45068bcf84436a44b26744cc5a3`
Parent único confirmado: `c0c762786d81db71cf82681915750efb2f23f9e7`
Escopo: exclusivamente o delta imutável N02-E entre esses dois hashes.

## Veredito

**APROVÁVEL** somente para a fatia N02-E.

Não foi demonstrada rota causal concreta de falso verde residual dentro da alegação focal: corpus complementar sintético e explícito, preservando os quatro artefatos Golden v1, exercitando o runtime NEXT-02 já aprovado sem alterá-lo e sem declarar equivalência integral com o Golden Set antigo.

Este parecer não é GO global de NEXT-02, não abre NEXT-03 e não autoriza produção, deploy, writers, adapters/integrações reais ou dados reais.

## Manifesto e objeto

O commit GitHub efetivamente lido é `38da54b2e12ae45068bcf84436a44b26744cc5a3`. O objeto possui exatamente um parent, `c0c762786d81db71cf82681915750efb2f23f9e7`. O compare está um commit à frente da base e contém exatamente os dez paths declarados:

1. `docs/agent-memory/workstreams/financasbot-next-02.md`
2. `docs/plans/workstreams/financasbot-next-02.md`
3. `docs/plans/workstreams/financasbot-next-02-validation-v1.md`
4. `docs/plans/workstreams/financasbot-next-02-golden-reconciliation-v1.md`
5. `scripts/agent/financasBotNext02ValidationPolicy.js`
6. `scripts/agent/validateFinancasBotNext02.mjs`
7. `tests/next02GoldenExpenses.test.js`
8. `tests/fixtures/financasbot-next/next02-expense-observations-v1.json`
9. `tests/fixtures/financasbot-next/next02-expense-expectations-v1.json`
10. `tests/fixtures/financasbot-next/next02-golden-traceability-v1.json`

Foram também confrontados integralmente ou na seção material pedida:

- `src/next/kernel/observationKernel.js`
- `src/next/kernel/expenseReadModel.js`
- `src/next/kernel/installmentSchedule.js`
- `docs/contracts/next/data-authority-contract-v0.md`, em especial seção 7
- `tests/fixtures/financasbot-next/golden-financial-fixture-v1.json`
- `tests/fixtures/financasbot-next/golden-claim-oracles-v1.json`
- `tests/fixtures/financasbot-next/golden-fact-contracts-v1.json`
- `tests/fixtures/financasbot-next/golden-conversation-set-v1.json`

Também foi lido o validador factual v1 para distinguir preservação do Golden Set antigo de execução das novas claims.

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

### 1. Semântica e aritmética das expectativas novas

As expectativas são declaradas como `candidate_hand_authored_expectations_pending_review`; não são apresentadas como saída independente do kernel. A revisão independente das principais somas não encontrou divergência:

- `family-june`: 30000 + 1200 + 20000 + 4500 - 4500 + 3200 + 5000 + 100000 = **159400**;
- `person-a-june`: 30000 + 1200 + 20000 + 100000 = **151200**;
- `person-b-june`: 4500 - 4500 + 3200 + 5000 = **8200**;
- `account-a`: 30000 + 100000 = **130000**;
- `card-blue-transaction`: 1200 + 20000 = **21200**;
- `billing-family`: 1200 + 20000 + 4500 - 4500 + 3200 + 10000 = **34400**;
- `billing-blue`: 1200 + 20000 + 10000 = **31200**;
- compra parcelada: **30000** em maio pela `transaction_date`; parcelas explícitas de **10000** em junho/julho/agosto pela `billing_period`.

Os casos de `zero` preservam eventos elegíveis cuja soma se compensa; os casos de `empty` têm conjunto elegível vazio.

### 2. `transaction_date` versus `billing_period`; compra versus parcelas

A discrepância que motivou N02-E é real e foi tratada sem rebatizar o oracle v1. No Golden v1, `event_date` incluía `evt-installment-1` em junho sem existir compra de origem nem `billing_period` explícito. Esse modelo não satisfaz, por si, as invariantes 7.4/7.5 do Data Authority.

O corpus complementar não infere a compra a partir das parcelas nem do total antigo. Ele estipula explicitamente um novo registro `purchase-plan-01`, valor 30000, data 2042-05-20, vínculo de cada parcela à compra e competências junho/julho/agosto. O próprio fixture marca esses elementos como `new_information`.

No runtime inalterado:

- `transaction_date` seleciona `purchase`/`refund` e não soma installments;
- `billing_period` seleciona parcelas, refunds e compras de cartão não parceladas; a compra parcelada total não entra no valor da mesma competência;
- a compra e as três parcelas podem aparecer juntas como **prova estrutural** da agenda completa, sem que a compra total seja somada ao valor da competência.

Isso preserva a seção 7 do Data Authority: compra total ou parcelas por competência, nunca ambas na mesma métrica.

### 3. Confirmado versus projetado

As parcelas são explicitamente separadas:

- junho: installment 1, `confirmed`;
- julho/agosto: installments 2 e 3, `projected`.

O read model filtra valor pelo `evidenceState` solicitado. Eventos de outro estado podem estar nas refs para provar a agenda completa, mas não entram no somatório do estado consultado. A presença de parcelas projetadas nas refs de uma resposta confirmada não as promove a realizadas.

O caso `projected-june` também prova que a mesma lente temporal pode ser consultada com estado projetado sem contaminar a resposta confirmada.

### 4. Identidade e conjunto exato de evidências

O teste N02-E não escolhe refs por coincidência monetária. Para cada resposta ele:

1. resolve `event_id:vN` do snapshot atual para `observation_refs`;
2. converte a observation ref ao `source_record_ref` explícito do corpus;
3. exige exatamente o conjunto de record IDs escrito na expectativa;
4. exige exatamente uma coverage ref;
5. calcula essa coverage ref com uma serialização própria ordenada e SHA-256, sem chamar o digest/canonicalizer do kernel;
6. rejeita refs duplicadas.

As mutações removem uma referência esperada e alteram o valor esperado para garantir que igualdade parcial não passe.

Há um limite epistemológico real: os IDs canônicos são resolvidos pelo próprio snapshot sob teste. Portanto isto prova que a implementação atual selecionou os records explícitos esperados; não é um segundo motor independente de provenance/grafos. O plano declara exatamente esse limite, e N02-E não reivindica o motor completo de provenance.

### 5. Total igual não mascara categoria divergente

A mutação adversarial muda o combustível de `transport.fuel` para `food.market` sem alterar valor ou identidade dos registros. A consulta familiar ainda conserva o mesmo total e o mesmo conjunto de IDs, enquanto a consulta `market-family` deixa de satisfazer a expectativa de 30000. Assim, o teste demonstra causalmente que total familiar igual não basta para aceitar semântica de categoria incorreta.

### 6. Zero, empty, parcial, ausente e indisponível

As expectativas distinguem:

- `refund-zero` / `billing-refund-zero`: eventos elegíveis existem e a soma é zero;
- `health-empty`, `snack-b-empty` e `health-subcategory-empty`: nenhuma ocorrência elegível sob cobertura completa;
- `partial-may`: `coverage_insufficient/incomplete`;
- `missing-lens`: `coverage_insufficient/incomplete`;
- `unavailable-card`: `source_unavailable/unavailable`;
- `external-actor`: `authorized_scope_mismatch/unavailable`;
- lente legada `event_date`: `query_schema_invalid/unavailable`.

Os testes de recusa comparam o objeto de falha inteiro, portanto não aceitam claim de valor anexada silenciosamente.

### 7. Preservação dos quatro Golden v1

Os quatro artefatos declarados em `baseline_hashes` permanecem fora do delta e são Git-byte-idênticos entre o parent N02-D e o candidato N02-E. Blob Git observado em ambos os refs:

- `golden-financial-fixture-v1.json`: `62715a2e4822df07c0b9dc118a2818ed60e435e8`;
- `golden-claim-oracles-v1.json`: `d20288e05e9d5abadd99cccd7f2cb571140986d2`;
- `golden-fact-contracts-v1.json`: `e12d34bd934abbe45f7d405b3069d49d97c70b8b`;
- `golden-conversation-set-v1.json`: `d995b6e3989921f1a6c77cefcdd0fc4470d66d70`.

Além disso, `NEXT02E:BASELINE` recalcula os quatro SHA-256 declarados na traceability com apenas CRLF→LF e nenhuma outra transformação. Esta auditoria não reexecutou esse teste; a identidade dos blobs Git é a confirmação independente de que N02-E não alterou os arquivos v1 em relação ao parent.

### 8. Campos preservados versus informação nova

O teste de baseline preserva dos 16 eventos legados aquilo que N02-E declara reaproveitar: identidade de record, amount (com convenção explícita de sinal), pessoa, conta/cartão, estado, categoria econômica e vínculos conhecidos.

Ele **não** finge preservar campos cujo significado precisa mudar para cumprir o contrato:

- refund deixa a categoria sintética `neutral.refund` do fixture antigo e recebe explicitamente a categoria da compra alvo;
- transfer/payment recebem categoria null no schema Next neutro;
- datas das linhas de parcela não são convertidas em transaction dates das parcelas; todas apontam à data explícita da nova compra;
- compra original, billing periods, coverage por lente/estado e subcategorias são novos fatos sintéticos declarados.

Essa diferença está documentada no fixture e na traceability como cenário alterado quando afeta o oracle antigo. Não há inferência runtime para fabricar os antigos 169400/161200.

### 9. Inventário de 56 turnos sem promoção dos 76 fatos

O Golden v1 contém 48 casos: 16 simples + 16 multi-tool + 8 follow-up + 8 negativos. Como cada follow-up possui dois turnos, o total é 56 turnos.

`NEXT02E:TRACEABILITY` exige que os 56 IDs sejam únicos e iguais ao conjunto de chaves do oracle antigo e conta 76 fatos antigos. Cada grupo só pode ser `pending`, `invariant_only`, `changed_scenario` ou `selected_events_equivalent`. `pending` necessariamente tem zero casos N02-E; os demais carregam texto `remaining` explicitando o que não foi provado.

Logo, o mapa é inventário de rastreabilidade, não execução de 56 conversas e não aprovação de 76 fatos pelo kernel novo. O próprio arquivo proíbe derivar porcentagem de GO global desse mapa.

### 10. Autoria local das expectativas

Observações e expectativas complementares têm a mesma origem de desenvolvimento local. Isso impede tratá-las, isoladamente, como dois oracles independentes. A implementação não esconde essa limitação: a autoridade da fixture é `candidate_hand_authored_expectations_pending_review` e o plano exige auditoria externa das expectativas.

Nesta auditoria, as aritméticas, a semântica temporal, as relações econômicas e os conjuntos causais foram confrontados independentemente com o Data Authority e com o código imutável. Não foi encontrada expectativa focal inconsistente. A limitação de autoria local permanece uma limitação de confiança do corpus, mas não invalida a alegação N02-E depois desta revisão independente.

## Gate N02-E

A policy N02-E adiciona sete IDs top-level:

- `NEXT02E:BASELINE`
- `NEXT02E:CASES`
- `NEXT02E:REFUSALS`
- `NEXT02E:REFERENCES`
- `NEXT02E:MUTATIONS`
- `NEXT02E:TRACEABILITY`
- `NEXT02E:GATE`

Somados aos 57 IDs A/B/C/D, são 64 propriedades. O inventário runtime continua em 15 fontes; N02-E não acrescenta módulo `src/next`.

`validatePropertyEvents` só aceita `test:pass` real, top-level, sem skip/todo, no arquivo canônico, ID conhecido e único. Falha, ausência, duplicidade, arquivo errado, nesting ou stdout forjado não satisfazem o gate.

O validador N02-E restringe o delta exatamente aos dez paths autorizados e fixa a base `c0c762786d81db71cf82681915750efb2f23f9e7`. Em modo imutável exige `--expected-head` de 40 hex e `--expected-parent` exatamente igual à base. O helper compartilhado verifica HEAD real, exatamente um parent, parent correto, worktree limpa, arquivos requeridos tracked e ausência de ignored paths relevantes. O objeto GitHub auditado confirma a relação de parent único.

A leitura estática demonstra que o gate é capaz de vincular o candidato ao SHA/parent. Não reexecutei a invocação final relatada, portanto `64/64 vinculado` permanece evidência local relatada, não execução independente desta auditoria.

## Execução relatada versus revisão independente

Não reexecutei:

- gate final `64/64`;
- bateria afetada `137/137`;
- suíte ampla de `1.993` testes, `1.983 PASS`, `0 FAIL`, `10 SKIP` previstos, `0 TODO`, `runner valid=true`;
- Golden Set v1 `48 casos / 56 turnos / 76 fatos` PASS.

Esses números permanecem evidência local do candidato. A consulta ao GitHub para `38da54b2e12ae45068bcf84436a44b26744cc5a3` não apresentou commit status checks nem workflow runs associados; portanto não foram convertidos em CI remoto independente.

## Limites preservados

N02-E não implementa nem certifica:

- o motor completo de provenance;
- equivalência integral do Golden Set v1 com o vertical atual;
- execução das 56 conversas antigas pelo agente;
- todas as 76 facts antigas pelo kernel N02-E;
- métricas pendentes de saldo, orçamento, calendário, regras, writers e outras explicitamente marcadas na traceability;
- GO global do NEXT-02.

Esses limites são compatíveis com a alegação focal feita e permanecem pendentes. Não constituem findings desta fatia.

Este parecer não autoriza NEXT-03, produção, deploy, writer, adapter/integração real, OCI, WhatsApp, Pluggy, Google ou dados reais.
