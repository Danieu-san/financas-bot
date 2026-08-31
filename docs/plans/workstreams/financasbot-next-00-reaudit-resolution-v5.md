# NEXT-00 — Resolução arquitetural após a quinta reauditoria

Atualizado em: 2026-08-31
Objeto reavaliado: `bd53f70716f5028f2421b8e27c588b3bb3b904fe`
Vereditos externos: Claude `APROVÁVEL APÓS AJUSTES`; Chat `NO-GO`

## Finding confirmado

O contrato declarativo v1 congela dimensões e `evidence_refs`, mas não prova de
forma geral que o conteúdo dos objetos referenciados sustenta o fato.

As seguintes mutações podem preservar ID, tipo e valor final enquanto quebram
provenance:

- período, entidade ou categoria de `source_state`;
- uma ponta de `transfer_pair`;
- alvo de `compensates`;
- correspondência de pagamento, parcela ou ownership.

O finding é material e pertence à mesma classe causal das reauditorias
anteriores. O estado do candidato foi rebaixado; os PASS locais não fecham o
NEXT-00.

## Decisão anti-remendo

Não serão acrescentados predicados isolados para os exemplos encontrados. A
implementação foi interrompida antes de qualquer nova alteração de validador ou
corpus.

A abstração ausente é um grafo declarativo tipado que combine:

1. snapshot versionado e fingerprint de campos materiais;
2. predicados entre claim, nós e arestas;
3. conjunto exato de evidências;
4. trace de leitura emitido pelo avaliador determinístico;
5. mutações geradas de todos os campos, nós, arestas e leituras.

O desenho está registrado em
`financasbot-next-00-provenance-graph-design-v1.md`.

## Fronteira

O desenho é candidato arquitetural e ainda não é contrato normativo. Nenhum
compiler, evaluator, fixture, oracle ou validador será alterado antes de:

- revisão independente do desenho por hash imutável;
- ausência de finding HIGH de completude causal;
- ratificação explícita da arquitetura.

NEXT-01, runtime, produção, writers, integrações e dados reais permanecem fora
de escopo.
