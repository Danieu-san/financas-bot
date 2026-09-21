# Revisão focal — identidade versionada do instrumento

2026-09-21. Pai/base: `ace83e80a1a2cf12ba2f9a7a8f6ace9ebdc5adbd`.
O candidato é o novo hash imutável que contém este documento, informado no
pedido externo. Não repetir nem ampliar a revisão anterior dos seis perfis.

## Questão delimitada

O parecer anterior foi APTO para orientar reconciliação, não GO de runtime
ou aplicação normativa. A inspeção local encontrou contraexemplo adicional:
duas tuplas admitidas com mesmo kind/ref_id, mas versões diferentes, eram
tratadas como mesmo instrumento pelo filtro do gerador. A admissão liga as
tuplas completas; identity() descartava version, embora validasse seu formato.

O delta de código tem duas mudanças: identity() preserva version na saída e
a contribuição exige target.id e target.version iguais aos do instrumento
ligado. A referência de tipo já é validada por resolve()/identity(). O alvo
estrangeiro continua produzindo obrigações de nó/id/aresta antes da exclusão.

AUTHOR-GENERATE-010 reproduziu RED no pai e passa após a correção. Percorre
os seis claims dos dois contratos; acrescenta outra versão admitida do mesmo
instrumento, mantém payload, recompõe fingerprint e religa uma contribuição.
Fixture deliberadamente autoadmitida: não demonstra autenticidade de fonte
nem replay de autoria. Não usar esse limite conhecido para alegar host pronto.

## Fontes necessárias no hash candidato

- `scripts/agent/nextCausalAuthoring.cjs`: admissão de snapshots/nós, identity,
  resolve e economic_candidates. Confrontar o diff com o pai.
- `tests/next/provenance/causalAuthoring.cases.js`: AUTHOR-GENERATE-010 e os
  controles vizinhos de alvo estrangeiro/ausência/isolamento pertinentes.
- `docs/contracts/next/provenance-v2/causal-authoring-candidates/README.md`:
  política explícita; os dois perfis JSON permanecem iguais ao pai.
- Nesta pasta: `implementation-independent-review.md`,
  `version-fix-validation.json` e `prepare-version-fix-evidence.cjs`.
- `src/next/provenance/metricSelection.js` somente como confronto de semântica
  de identidade, não como fonte de expected (gerador não o importa).

Validação local: 26 focais, uma integração hermética, ampla final 2.360 PASS /
0 FAIL / 10 SKIP esperados. Hashes antes/depois iguais. Relatórios candidatos
dos seis grafos e blobs de graphs/claims/source-extract iguais ao pai; helper
confere isso localmente. Não atribuir execução ou igualdade externa ao Chat.
O helper histórico prepare-evidence.cjs pertence à evidência do pai; após a
correção, usar o novo prepare-version-fix-evidence.cjs --check para os hashes.

## Resposta requerida

Confirme hash/pai e arquivos efetivamente lidos. Aponte achados por severidade
e APTO/NÃO APTO para esta correção focal do gerador candidato. Confira se o
teste realmente alcança duas versões admitidas, mantém guardas observáveis e
separa identidade do instrumento de igualdade textual do ID sem copiar actual
para expected. Declare os limites e não aprove por contagem de testes.

Nenhum delta normativo foi aplicado. Não se pede GO dos demais incrementos,
de runtime, host, 76 grafos, N02-G, deploy ou produção. Um APTO permite retomar
a reconciliação delimitada, não aplicá-la automaticamente.
