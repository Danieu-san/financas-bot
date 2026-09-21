# Revisão focal — reconciliação instrument/statement

2026-09-21. Pai/base: `ad43ba41f0558e9329b8e494c824672d21de4b5d`.
O hash candidato é o commit que contém este pedido; conferir o SHA informado
externamente e seu pai antes de emitir parecer.

## Escopo fechado

Revisar o delta de `src/next/provenance/metricSelection.js` e os dois arquivos
de testes abaixo. Somente instrument/statement mudam: exigem coverage complete,
statement consome a identidade da policy, owner deixa de ser lido quando não
participa da fórmula, e presença/coerência/self/chain de compensação são
observadas antes da exclusão financeira. Os demais modos devem preservar sua
semântica e suas observações. Janela, soma e seleção não foram redefinidas.

O gerador independente e seus dois perfis são os já publicados: nenhum byte
foi mudado nesta fatia. A correção ID + version foi ratificada em 1e83baac,
recibo no pai ad43ba41; isso não aprova o runtime aqui alterado.

## Fontes exatas no candidato

- `src/next/provenance/metricSelection.js` e `metricReferences.js` na mesma pasta.
- `tests/next/provenance/metricSelection.cases.js`: INSTRUMENT-PROFILE-001/002,
  SCALAR-REFERENCE-001 e os controles existentes de instrumentos e faturas.
- `tests/next/provenance/authoringIndex.cases.js`: AUTHOR-RECONCILE-001,
  selectionInput e snapshotAccessFixture; comparar o diff com o pai.
- `scripts/agent/nextCausalAuthoring.cjs` e `reportNextCausalAuthoring.cjs`:
  origem independente das cinco dimensões esperadas; não importam o evaluator.
- `docs/contracts/next/provenance-v2/causal-authoring-candidates/README.md`
  e os dois perfis JSON na mesma pasta.
- Nesta pasta: `candidate-report.json`, `source-extract.json`,
  `reconciliation-validation.json` e `prepare-reconciliation-evidence.cjs`.
- Contratos `docs/contracts/next/provenance-v2/evaluator-contracts/consumption_by_instrument.json`
  e `statement_total.json` na mesma pasta.

## Questões para o parecer

1. O código implementa dependências causais dos dois contratos, sem importar
   expected, oracle, perfil, fact_key ou alias no runtime? A dispensa de owner
   e as guardas antes do filtro são semanticamente sustentadas?
2. O expected das cinco dimensões é gerado e congelado antes da execução?
   A seleção antiga permanece uma obrigação separada e o oracle é usado apenas
   para conferir R no teste, nunca para fabricar dependências?
3. A rejeição de trace sem has(compensates), com sequência válida, e os casos
   inválidos/excluídos dão evidência útil sem mascarar dependências faltantes?
4. Há alteração indevida nos demais modos ou identidade incompleta, apesar da
   soma/seleção preservadas nos seis casos?

O teste relata composição parcial matched=true nos seis perfis, não aceitação
de grafos. 33 focais, 135 afetados e ampla final 2.363 PASS/0 FAIL/10 SKIP
esperados foram executados localmente. Hashes dos três arquivos causais antes/
depois iguais; helper confere os bytes LF e arquivos protegidos com o pai.
Não atribuir ao auditor execução de testes nem igualdade de blobs não conferida.

Responder com hash/pai, arquivos efetivamente examinados, achados por severidade,
APTO/NÃO APTO somente para esta reconciliação de runtime, e limites.
Nenhum delta candidato foi aplicado aos seis grafos; os 76 grafos/claims,
proofs, seleção, perfis e gerador permanecem intactos nesta fatia. Não se pede
aprovação para aplicar automaticamente normativa nem GO global N02-G, host,
medições, derivados, deploy ou produção. Não reauditar incrementos históricos
fora do delta como se este pedido fosse revisão exaustiva do motor.
