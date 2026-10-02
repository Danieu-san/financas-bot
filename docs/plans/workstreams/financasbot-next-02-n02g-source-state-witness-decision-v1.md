# N02-G — decisão focal pendente sobre witnesses source_state

Status: HOLD normativo; diagnóstico, não aprovação de código ou mudança de contrato.

## Objeto e limites

Este documento registra um conflito encontrado ao executar o subconjunto de
`predicate_atom` para `eq period/coverage` de `source_state`. O código de integração
permanece WIP na worktree `codex/n02g-host-parent-reconcile-20261001`, sobre
`ecc57203bbd5b50087f2cd7fa9af8c96ee03ae1d`; ele não é um novo candidato publicado.
Uma revisão deste documento não aprova esse WIP, a implementação dos evaluators,
G11, N02-G ou NEXT-02. Não autoriza NEXT-03, deploy, produção ou dados reais.

Fontes normativas imutáveis no parent deste documento:

1. `docs/plans/workstreams/financasbot-next-00-provenance-graph-design-v1.md`, §10;
2. `docs/contracts/next/provenance-v2/evaluator-contracts/eligible_event_count.json`;
3. `docs/contracts/next/provenance-v2/evaluator-contracts/source_coverage.json`.

O julgamento pedido é de compatibilidade normativa e desenho do witness. Não se
pede tratar contagens relatadas, excerpts ou autoridade do executor como prova
independente da implementação local.

## Evidência local relatada, não execução independente

O lote serial, Node 22.17.0 fixado, percorreu 23 baselines e gerou 48 coordenadas:
23 de period e 25 de coverage. Resultado: 41 executadas e 39 qualificadas,
`batch_complete=false`, `measured_sources_unchanged=true`, estado final `blocked`.
Não houve timeout nos sete abortos: a causa capturada foi `host_child_evaluation`.

Relatório original local, preservado sem alteração:
`.codex-temp/source-state-scope-full-20261002.json`, SHA-256
`7ed64c89428615e95d0f6d1f9b0032cd6ecf4cf6abbe68f262d56efde4fe6012`.
Esta referência local não é requisito de acesso do auditor nem será publicada.

Há nove coordenadas pendentes, não sete: o relatório original enumerava somente
os sete abortos; duas linhas capturadas tinham `matched=false`. Uma correção
report-only passou em 3/3 focais e torna também essas linhas explicitamente
`UNSATISFIED_MUTATION_WITNESS`. Ela não transforma qualquer uma delas em PASS.
O controle S-13/S-16 tem sete coordenadas, duas qualificadas e cinco pendentes.
Nenhuma suíte ampla ou repetição do lote integral foi usada para esconder o RED.

| Grafo | Predicate | Campo | Falha relatada |
| --- | --- | --- | --- |
| S-13#1#1 | binding_13 | coverage | D aborta antes da captura P |
| S-13#1#1 | binding_14 | period | D aborta antes da captura P |
| M-09#1#1 | binding_13 | coverage | D aborta antes da captura P |
| M-09#1#1 | binding_14 | period | D aborta antes da captura P |
| N-04#1#1 | binding_13 | coverage | D aborta antes da captura P |
| N-04#1#1 | binding_14 | period | D aborta antes da captura P |
| S-16#1#1 | binding_12 | period | D aborta antes da captura P |
| S-16#1#1 | binding_11 | coverage | R muda e outra obrigação também falha |
| S-16#1#1 | r0004_include_coverage | coverage | R muda e outra obrigação também falha |

## Cadeia causal observada no WIP

O gerador atual modifica somente o conteúdo source_state para uma alternativa
schema-valid, recalcula versions/fingerprints e o hash do manifest e preserva
predicates, contratos, restante do corpus e oracle. Não copia actual para expected.
O executor tenta D e depois P na mesma admissão e exige, além do átomo alvo,
demais barreiras relevantes preservadas. Seu critério local adicional é R igual
ao baseline/oracle e exatamente um predicate falso; essas duas exigências devem
ser confrontadas com o contrato, não assumidas como texto normativo.

Excerpts diagnósticos do WIP `src/next/provenance/metricDirectReads.js`:

```js
// eligible_event_count: após identidade e resolução do month
const actual = source.get('period'); parseMonth(actual);
if (actual !== month) fail('period');
if (source.get('coverage') !== 'complete') fail('coverage');
// Depois lê event_count, seleciona a população elegível e confronta cardinalidade.
```

```js
// source_coverage: após identidade/scope e resolução do month
const actual = source.get('period'); parseMonth(actual);
if (month !== actual) fail('period');
const coverage = source.get('coverage');
if (!['complete', 'partial', 'unavailable'].includes(coverage)) fail('coverage');
return coverage;
```

Consequências que não dependem de contagens:

- Mudar period ou coverage obrigatória em eligible_event_count pode abortar D,
  antes que o host sequencial execute P. Um erro genérico do child não prova
  qual átomo foi recusado nem que todas as demais barreiras estavam válidas.
- source_coverage deve devolver a coverage literal válida. Uma alternativa
  válida diferente de complete muda necessariamente R; exigir R constante pode
  ser uma restrição indevida do harness. Entretanto, aceitar qualquer R diferente
  sem reparar/provar claim, oracle e demais barreiras também seria indevido.
- S-16 possui dois predicates associados à mesma coverage. Isso não basta para
  dar crédito: as linhas observadas também perdem preservação funcional/trace.
  O contrato usa conjuntos exatos de átomos, não necessariamente a contagem de
  predicates falsos, mas não permite agrupar átomos ou compensar coordenadas.

## Decisão solicitada

Confrontar os três documentos integrais acima e separar:

1. condição normativa de G11 versus critério adicional/errado do harness;
2. guard obrigatório do evaluator versus implementação incidental não ratificada;
3. witness semanticamente isolado possível versus coordenada atualmente
   `UNSATISFIED_MUTATION_WITNESS`.

Para as nove coordenadas, indicar se existe construção isolada compatível com os
contratos atuais. Se existir, especificar quais reparos mínimos são permitidos,
qual oracle independente demonstra R/claim coerentes, como provar D/P e exatamente
o conjunto de átomos recusados e quais controles negativos impedem compensação.
Se não existir, identificar a alteração normativa mínima necessária, com o
texto/obrigação afetado; não declarar a implementação apta apenas por propor isso.

Não há proposta de relaxamento já aprovada neste documento. Sem construção ou
alteração normativa suficiente, o resultado correto é HOLD. A implementação de
qualquer decisão material precisará de REDs, testes causais e auditoria de código.

## Restrições que permanecem

- Não contar `host_child_evaluation`, timeout, compiler RED ou qualquer erro
  arbitrário como prova de violação do átomo pretendido.
- Não remover guards, leituras realmente executadas, coordenadas ou exigências
  apenas para obter verde; não completar expected a partir de actual.
- Não usar predicate_strategy no lugar de predicate_atom nem misturar admissão
  do baseline com prova de outro pacote para simular D/P do mesmo witness.
- Não aceitar mudança de R sem coerência independente de claim/oracle e sem
  comprovar preservação das demais barreiras relevantes.
- Não agrupar átomos nem dar crédito por SKIP, cardinalidade reduzida ou somatório
  de execuções incompletas. Toda coordenada pendente permanece pendente.
- A família trace anterior (76 baselines / 30.871 coordenadas) não foi repetida
  nem alterada e não fecha predicate_atom ou G11 global.

## Saída esperada da revisão

Identidade SHA/parent e arquivos efetivamente lidos; findings causais; decisão
normativa explícita ou HOLD; construção concreta/ajuste mínimo e testes negativos.
Separar leitura independente das normas de evidência local somente relatada.
Não emitir GO de código ou global para este documento diagnóstico.
