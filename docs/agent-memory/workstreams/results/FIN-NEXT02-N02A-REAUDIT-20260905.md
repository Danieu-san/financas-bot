# FinançasBot NEXT-02 — N02-A reauditoria independente focal

Data: 2026-09-05
Objeto auditado: `af83a4e0cd79de5e582ce2bd030eb0328da32d52`
Parent único confirmado: `5d4339f46a9ec412d6c86894853435c7238dbcf1`
Escopo: fatia sintética N02-A, não fechamento do NEXT-02.

## Veredito

**NO-GO** para o SHA `af83a4e0cd79de5e582ce2bd030eb0328da32d52`.

A causa bloqueante é uma rota estrutural de falso verde na boundary do modelo: a implementação de `expenses.sum` aceita IDs internos de conta/cartão como argumentos e os ecoa no claim, embora o contrato congelado de Model Data Boundary proíba fornecer/aceitar IDs internos no modelo e exija labels públicas ou refs efêmeras. Os testes N02-A legitimam explicitamente `account-a/account-b/card-a`, e o gateway existente só bloqueia nomes de chaves proibidas, não o valor interno transportado por `account`, `card` ou `ref`.

## Manifesto lido

### 12 arquivos alterados, lidos integralmente

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

### Contexto inalterado confrontado

- `docs/contracts/next/data-authority-contract-v0.md`
- `src/next/tools/readOnlyToolGateway.js`
- `src/next/contracts/modelDataBoundary.js`
- `src/next/replay/hermeticReplayRunner.js`
- `src/ledger/canonicalLedgerProjector.js`
- `tests/canonicalLedgerProjector.test.js`

Contexto normativo adicional consultado para resolver a boundary: `docs/contracts/next/model-data-boundary-contract-v0.md`.

## Findings

### CRITICAL

Nenhum.

### HIGH-01 — `expenses.sum` aceita e devolve identidade interna pela interface destinada ao modelo

Cadeia causal:

`query do modelo com account/card -> readOnlyToolGateway aceita as chaves públicas account/card -> expenseReadModel valida o valor diretamente contra catalog.accounts/cards IDs internos -> consulta executa -> claim.filters ecoa os mesmos valores e claim.entity.ref usa family_id/actorId -> allowedResultFields permite claim -> containsForbiddenModelKey não detecta valores internos sob chaves account/card/ref -> resultado pode atravessar a boundary`.

Evidência estática:

- `createExpenseToolGateway()` declara `account` e `card` como argumentos string.
- `readConsumption()` considera válidos apenas valores presentes nos Sets derivados de `catalog.accounts[].id` e `catalog.cards[].id`.
- O teste `NEXT02:QUERY-FILTERS` demonstra e aprova chamadas com `account: 'account-b'` e `card: 'card-a'`.
- O claim devolvido usa `entity.ref = catalog.family_id/context.actorId` e copia `category/account/card` para `claim.filters`.
- `modelDataBoundary.js` bloqueia nomes como `familyId`/`actorId`, mas não reconhece um ID interno transportado como valor de `account`, `card` ou `ref`.
- O contrato congelado `model-data-boundary-contract-v0.md` proíbe `family_id`, `person_id`, `account_id`, `card_id` e refs internas no egress/model args e exige labels públicas ou refs efêmeras quando o modelo precisa distinguir entidades.

Consequência: o gate pode ficar verde com uma interface que viola a boundary congelada. O fato de N02-A usar somente fixtures sintéticas evita exposição real neste SHA, mas não torna a interface conforme; a integração ao gateway é parte declarada da fatia.

Severidade: **HIGH**. Bloqueia aprovação do SHA.

### MEDIUM-01 — cobertura `complete` pode sustentar ausência conclusiva além do próprio `as_of`

Cadeia causal:

`coverage { start: 2042-06-01, end: 2042-06-30, as_of: 2042-06-15, complete } -> validação aceita -> consulta do mês 2042-06 considera o mês totalmente coberto -> nenhum evento elegível -> resposta ok/complete/resultKind=empty com evidence.asOf=2042-06-15`.

A fixture focal usa exatamente esse arranjo de datas. O read model verifica que observações não sejam posteriores ao `as_of`, mas não relaciona `coverage.end` ao cutoff representado por `coverage.as_of`. Assim, o teste de `empty` pode passar enquanto a resposta conclui ausência para uma porção temporal posterior ao cutoff informado.

O documento de validação declara que `coverage complete` é entrada server-side explícita e que não há adapter real nesta fatia. Isso explica a origem sintética da asserção, mas não elimina a inconsistência semântica na função que usa `as_of` como evidência da resposta. Se o projeto pretende permitir cobertura completa de intervalo posterior ao `as_of`, essa semântica precisa estar explicitamente definida no contrato; ela não está demonstrada no corpus auditado.

Severidade: **MEDIUM**.

### MEDIUM-02 — pagamento de fatura valida `settles_card_id`, mas o evento canônico perde esse vínculo

Cadeia causal:

`observation invoice_payment com settles_card_id válido -> validateObservation confirma cartão da família -> eventFromObservation cria event com account_id da conta pagadora e card_id null -> não cria link para settles_card_id e não cria provenance do vínculo -> projeções seguintes não conseguem obter do CanonicalFinancialEvent qual cartão era o alvo sem voltar à observação normalizada`.

A fatia declara que pagamento “aponta para cartão da família” e que o evento canônico conserva provenance do payload. Refund e transferência materializam seus vínculos em `links`; invoice_payment não. Isso não cria dupla contagem no `expenses.sum` atual, porque pagamentos são corretamente excluídos do consumo, mas perde uma dimensão material explicitamente validada pela própria policy da fatia.

Severidade: **MEDIUM**.

### LOW

Nenhum finding adicional demonstrado.

## Pontos conformes confirmados estaticamente

- identidade estável por família + source type/instance/record, independente do valor mutável;
- deduplicação por source identity + source_version e conflito fail-closed;
- versões sem gap/fork, histórico preservado e current na última versão;
- defensive copy e deep freeze de saída;
- centavos como safe integers, `-0` rejeitado e soma/refund/transfer com `BigInt`;
- refund corrente precisa apontar compra ativa, manter dimensões e não exceder cumulativamente a compra;
- transferência corrente exige exatamente duas pontas, contas distintas, mesma família/moeda/data/evidence e soma zero;
- pagamento de fatura e transferência são neutros em `expenses.sum`;
- conta permanece person-owned; cartão familiar pode ser compartilhado entre membros;
- `partial/unknown/unavailable` não produzem claim numérico conclusivo; `zero` e `empty` são distintos quando a coverage é aceita como complete;
- N02-A só aceita `transaction_date`; outras bases temporais falham;
- `expenses.sum` usa o gateway read-only existente e não acrescenta writer;
- tipos não implementados da fatia falham fechado;
- o inventário do gate N02-A é exatamente os 11 defaults NEXT-01 + 3 kernels = 14;
- os defaults NEXT-01 permanecem como defaults no módulo compartilhado;
- os 20 IDs N02-A são ligados a eventos estruturados `test:pass/test:fail` do arquivo real, com rejeição de skip/todo/duplicidade/nesting/file spoof;
- o gate final exige expected-head, parent fixo, único parent, árvore limpa, arquivos required tracked e ausência de ignored paths relevantes;
- a alteração CRLF está somente na leitura do teste (`replace(/\r\n/g, '\n')`); `src/next/replay/hermeticReplayRunner.js` tem o mesmo blob no parent e no candidato e não foi alterado.

## Evidência de execução

Esta auditoria é uma revisão estática independente sobre o GitHub. **Não reexecutei** os testes locais ou a suíte hermética. Permanecem como alegações do candidato, não convertidas em prova independente:

- 20/20 propriedades;
- 86/86 bateria afetada;
- 1.949 testes: 1.939 PASS, 0 FAIL, 10 SKIP previstos, 0 TODO;
- runner `valid=true`.

Essas contagens são compatíveis com o gate lido, mas não superam HIGH-01: os próprios testes atuais aceitam a rota de identidade interna.

## Limites preservados

Este NO-GO é somente para o candidato N02-A `af83a4e0...`. Não autoriza encerrar NEXT-02, abrir NEXT-03, deploy, produção, writers ou adapters reais. Parcelas, demais bases temporais, Golden Set completo e motor integral de provenance permanecem pendentes como limites já declarados, não como defeitos desta fatia.

Não solicitar nova auditoria deste mesmo hash. Qualquer correção material deve gerar novo candidato imutável e novo gate proporcional ao delta.
