# FIN-NEXT02-N02F-AUDIT-B-20260911 — Parecer independente

## Identidade e escopo

Auditoria independente, adversarial e focal do FinançasBot NEXT-02 / N02-F, **SUBLOTE B — relações temporais**. Produto imutável: candidate `a09482485ef5d51f2391d4d773d4738f74246f71`, parent único `ef04368c95af33a12c0e8b5b286c0e0b01ae27f8`. Pacote separado de evidência: `9b0808bb11f00dda973eab845081a5f0ffc74194`, parent igual ao candidate. O pacote não foi tratado como novo candidate.

Antes da publicação, a branch `chat/chat-codex-orchestration-20260824` foi reconfirmada exatamente em `17613b377cb2652754e77ddbfeb0d7255a1dbd94`; o state permaneceu `CHAT_WORKING` e seu SHA-256 com LF normalizado foi `680ad1d322434d154290a4cfda8bba42be720e6d2c6fc6c9376d38c1b9b8a926`.

Escopo exato: `S-05#1#1`, `S-06#1#1`, `S-12#1#1`, `M-05#1#1`, `F-03#2#1`, `M-13#1#3`, `M-13#1#6`. SUBLOTE A, prova global, consolidação e os outros 69 grafos ficaram fora.

## Leitura dirigida e integridade

Li integralmente `temporal-relations-decision-v1.md`, os três evaluator contracts (`account_balance`, `statement_total`, `safe_daily_pace`), `operator-registry-v1.json`, `operator-registry-v2.json`, `graph-binding-contract-v1.md` e `temporal-and-selection-witnesses-v1.json`. Em `provenance-graph.schema.json`, li somente as definições de `windows`, `scalarBinding`, argumentos `period_ref`/`period_bound` e referências de seleção. Em `claims-v2.json`, li somente os sete claims; em `snapshot-manifest-v1.json`, somente `account-a`, `account-reserve`, `card-blue`, `budget-snack`, `budget-leisure`, `NEXT-GOLDEN-FINANCIAL-V1` e policy referenciada; em `metric-evaluator-registry-v1.json`, somente as três entradas pertinentes.

No pacote de evidência, li `evidence-manifest.json` e os metadados/registros dos sete facts nas quatro extrações parent/head. As extrações head apontam para o Git blob `5abcb5d528065b00bd575298176947ec605600ba` e as parent para `a15407bd20db84b44acbf99542637432dec3f8a3`; ambos foram confrontados com os blobs imutáveis de `graphs-v2.json` nos SHAs correspondentes. Não li integralmente `graphs-v2.json`; usei somente os sete registros compactos byte-for-byte identificados pelo pacote. Os SHA-256 das quatro extrações foram lidos do manifesto, não usados isoladamente como prova sem essa confrontação de identidade/conteúdo.

Os hashes dos três evaluator contracts foram recomputados sobre o conteúdo lido e batem com o registry: `account_balance=b509b72bf341c36f60cc7fda7030602a0fdfcc1dae24a0687cb899d4b15a35ed`, `statement_total=cca2c51e9d89ef572d069eb019d30924fc41409724c1d07abc7d2a215ce1d002`, `safe_daily_pace=195e3968cc2f7f7dd2e46fdcb2619c19892b5c56a27d0e3c62f76fe08ba9a14d`.

## Cobertura causal

**7/7 grafos e 11/11 janelas.** `S-06` resolve `[account-a.opening_balance_as_of, claim.as_of] = [2042-06-01,2042-06-14]`; `S-12`, `[account-reserve.opening_balance_as_of, claim.as_of] = [2042-06-01,2042-06-11]`, ambos inclusivos. Não há cutoff solto em literal nem faixa invertida.

Nos três `statement_total` (`S-05`, `M-05`, `F-03`), a janela é `(2042-05-10,2042-06-10]`; `card-blue.closing_day=10`, `due_day=17`, claim `statement_due=2042-06-17`. Os predicados provam dia de fechamento, dia de vencimento, mesmo mês/ano entre fechamento atual e vencimento e fechamento anterior como offset civil de `-1 month`, preservando o dia sem clamp. Inclusão e exclusão referem a mesma `selection_window`. O `time_basis=statement_competence` de `F-03` não cria fórmula alternativa nem contradiz essa convenção histórica.

Nos dois `safe_daily_pace`, há três janelas por grafo: seleção `[2042-06-01,2042-06-15]`, restante `[2042-06-16,2042-06-30]` e mês do budget `2042-06`. `fixed_clock=2042-06-15T12:00:00-03:00` + `America/Sao_Paulo` + `proleptic_gregorian` provam cutoff 15/06; sucessor civil prova 16/06; `month_bounds_match` liga budget.period ao primeiro/último dia; cutoff e início pertencem ao mês; cardinalidade inclusiva do restante prova divisor 15; `claim.period` é igual à `remaining_window`; e o descriptor `15_full_days_after_as_of` é explicitamente ligado a 15. Não há prova por mera repetição de literais.

Os cinco operadores novos — `civil_date_matches`, `civil_offset_matches`, `month_bounds_match`, `day_of_month_matches`, `inclusive_day_count_matches` — são genéricos, booleanos e sem branch por `fact_key` ou fórmula financeira. As 27 definições v1 foram preservadas. Contrato/decision/schema fecham referência desconhecida, tipo incompatível, data inválida, range invertido e overflow; offset mensal inexistente falha sem clamp. Os witnesses cobrem bissexto, virada de ano, local-vs-UTC, mês sem clamp, dias inválidos e cardinalidade/inclusividade, mas estão declarados `authoring/not_executed`.

## Findings

**CRITICAL:** nenhum.

**HIGH:** nenhum.

**MEDIUM:** nenhum.

**LOW-01 — evidência de execução ainda não existe.** Os três entries do registry têm `artifact_status: not_built` e os witnesses temporais são `not_executed`. Isto não é teste executado e não demonstra comportamento futuro de compiler/evaluator. É limitação explicitamente coerente com o estágio documental e não rompe a cadeia causal do candidate revisado.

## Veredito — somente SUBLOTE B

**APROVÁVEL.** Não encontrei inconsistência causal material no escopo temporal: as autoridades, janelas, bindings, operadores civis e predicados dos sete grafos são documentalmente suficientes e fail-closed para os casos adversariais examinados. O LOW-01 impede tratar esta aprovação documental como validação de execução futura, mas não bloqueia o SUBLOTE B.

Este parecer **não autoriza** implementação, compiler/evaluator, NEXT-03, próxima fatia, deploy, produção, dados reais nem a consolidação C. A consolidação A+B somente poderá ser preparada separadamente após validação/recibo remoto deste parecer.