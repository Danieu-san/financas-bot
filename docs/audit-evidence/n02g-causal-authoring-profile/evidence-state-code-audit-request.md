# Revisão focal — implementação de evidence_state

O candidato é o commit que contém este pedido; pai/base esperado:
`6889d2941736a2ee0b88c94873a2055795b16d97`. Confirmar SHA completo, pai e
arquivos efetivamente lidos. Não executar ações externas nem ampliar o escopo.

## Escopo e fontes

Delta de produto em `src/next/provenance/metricSelection.js`: observar estado
do claim somente nos modos instrument/statement/safe_pace; retirar a leitura
redundante de evidence_state do orçamento, sem mudar admissão ou demais guardas.
Delta normativo: somente duas required_claim_reads em derivation dos grafos
safe_daily_pace, M-13#1#3/#6, em `docs/contracts/next/provenance-v2/graphs-v2.json`.
Outros 74 grafos, proof e demais campos dos dois permanecem idênticos à base.

Fontes obrigatórias no candidato:

- `docs/plans/workstreams/financasbot-next-02-n02g-evidence-state-revised-decision-v1.md`;
- nesta pasta, `evidence-state-revised-independent-review.md`,
  `evidence-state-validation.json` e `prepare-evidence-state-validation.cjs`;
- `src/next/provenance/metricSelection.js`, `metricDirectReads.js`,
  `graphCompiler.js`, `packageContract.js` e `proofAcceptance.js`;
- `tests/next/provenance/authoringIndex.cases.js` (EVIDENCE-STATE-001 a 004,
  FAMILY-PHASE-001, AUTHOR-NORMATIVE-001 e AUTHOR-RECONCILE-001) e
  `tests/next/provenance/metricSelection.cases.js`;
- contratos provenance-v2: `evaluator-contracts/safe_daily_pace.json`,
  `claim-contract.schema.json`, `evidence-snapshot.schema.json`,
  `metric-evaluator-registry-v1.json`, `claims-v2.json`, `graphs-v2.json`;
  binding/semântica de autoria quando necessário à questão focal.

## Perguntas

1. As duas expressões alteradas implementam exatamente o desenho revisado,
   preservando filtros de eventos e guardas de instrumento/ritmo/orçamento?
2. Os testes distinguem estados alternativos do kernel de aceitação de claim?
   O orçamento inválido falha no pipeline schema_snapshot antes dos handles,
   sem atribuir validação de payload à admissão apenas de bytes?
3. Expected e população esperada existem antes do evaluator, sem correção pelo
   trace/oracle; retirar a leitura obrigatória de ritmo impede cobertura?
4. As duas adições normativas e a composição dos testes históricos preservam
   igualdade integral, sem exceções que silenciem outros deltas?
5. Há defeito focal ou lacuna impeditiva para encerrar esta correção específica?

Evidência executada localmente: RED 2 FAIL/1 PASS; primeira integração 3 PASS/1
FAIL por formato do harness, corrigida; focal final 4 PASS; afetados 201 PASS;
ampla 2.370 PASS/0 FAIL/10 SKIP esperados, hashes causais antes/depois iguais.
Helper confere corpus integral contra Git e os bytes testados, mas não é uma
execução independente. Não reaproveitar parecer documental como revisão de código.

Responder hash/pai, fontes lidas, achados por severidade, limites e APTO/NÃO
APTO FOCAL. Se não conseguir ler arquivos integrais ou recomputar hashes,
declarar explicitamente. Sem GO de grafo, proof, host, N02-G global ou produção;
graph_accepted/releaseEligible continuam falsos.
