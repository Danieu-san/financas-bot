# FIN-NEXT02-N02G-TRACE-COMPAT-CORRECTION-AUDIT-20260915

## Veredito focal

**APROVÁVEL — correção focal de compatibilidade traversal/trace aceita sem findings.**

CRITICAL: 0  
HIGH: 0  
MEDIUM: 0  
LOW: 0

Este parecer é estritamente limitado ao delta corretivo `9ffaa60669904c2a7d5af547a529e60f09c5e36b...fd2d996b45bb7cecd4ae0d7d19cacece5afbe98b`. Não é GO global do N02-G e não autoriza NEXT-03, deploy, produção, dados reais ou qualquer implementação adicional fora da continuidade já governada pelo workstream.

## Identidade imutável conferida

- candidato efetivamente lido: `fd2d996b45bb7cecd4ae0d7d19cacece5afbe98b`;
- parent único: `9ffaa60669904c2a7d5af547a529e60f09c5e36b`;
- compare: base `9ffaa60669904c2a7d5af547a529e60f09c5e36b`, head `fd2d996b45bb7cecd4ae0d7d19cacece5afbe98b`, exatamente um commit à frente;
- delta confirmado com exatamente oito arquivos, os oito do escopo solicitado.

Foram lidos integralmente no candidato os oito arquivos alterados:

1. `src/next/provenance/instrumentedAccess.js`;
2. `scripts/agent/inspectNextProvenanceTraceCompatibility.mjs`;
3. `tests/next/provenance/authoringIndex.cases.js`;
4. `tests/next/provenance/instrumentedAccess.cases.js`;
5. `tests/next/provenance/metricInstallments.cases.js`;
6. `docs/plans/workstreams/financasbot-next-02-n02g-trace-compatibility-v1.md`;
7. `docs/agent-memory/workstreams/financasbot-next-02-n02g.md`;
8. `docs/agent-memory/workstreams/index.md`.

Também foram confrontados, somente no necessário, `graphCompiler.validateStaticEvidence` e a seção 4 de `docs/contracts/next/provenance-v2/graph-binding-contract-v1.md`.

## Tentativa adversarial de falso verde

A rota causal prioritária seria esta: remover os reads incidentais de `traverse()` e continuar emitindo uma aresta apenas porque o `edgeId` foi declarado, sem provar que a referência material realmente existe nos bindings. Isso produziria um falso verde edge-only: o trace pareceria compatível embora o vínculo econômico fosse inexistente, divergente ou ambíguo.

A rota não fecha no candidato por duas barreiras independentes:

1. `validateStaticEvidence` reconstrói as relações `material_ref` a partir dos payloads admitidos, resolve o target nominalmente, exige resolução única, rejeita duplicatas de referência e exige igualdade exata entre o conjunto de relações materiais reconstruído e as arestas declaradas no grafo;
2. `createInstrumentedAccess` copia `bindings` e `links` antes da execução guest e admite cada link somente se a referência do source coincidir **exatamente uma vez** com `target.value.id`; ausência, divergência ou multiplicidade rejeitam a construção antes de qualquer evento de trace.

Logo, o novo `traverse()` não depende de um edge textual não validado: ele só alcança entradas presentes no mapa de relações previamente admitidas.

Uma segunda rota de falso verde seria ocultar uma leitura que continua ocorrendo em runtime. Também não se sustenta: o candidato não filtra `get`; ele deixa de executar os dois `get` incidentais usados apenas para redescobrir a relação. Qualquer `get` realmente solicitado depois do traversal continua passando pela mesma instrumentação e emitindo sua observação.

Uma terceira rota seria derivar `expected` do `actual`. Não há esse fluxo na correção: `createInstrumentedAccess` recebe somente bindings, links e sink; `traverse()` não recebe `required_reads`, `required_edges` ou `expected_trace`; o diagnóstico de compatibilidade recebe autoria e não recebe trace observado. O teste focal ainda verifica que uma aresta exigida inexistente lança `trace_compatibility_unknown_edge`.

## Revisão estática da correção

### 1. Admissão TCB contra bindings copiados, sem trace — PASS

`createInstrumentedAccess` usa cópias defensivas de `bindings` e `links`. A conferência material acontece durante a construção do controlador, antes da exposição dos handles guest e fora da função `event()`. Para `ref`, exige igualdade escalar; para `ref_list` e `role_ref_list`, conta as correspondências com o target e exige exatamente uma. Essa admissão não materializa `I` nem qualquer leitura observada.

### 2. Traversal runtime somente da aresta admitida — PASS

`traverse(edgeId)` resolve exclusivamente o link já presente em `relations`, exige que a origem corresponda ao handle corrente, cria o handle do target sem emitir leitura e emite somente `traverse` com o edge admitido. Não executa `get(source.field)` nem `get(target.id)`.

### 3. Ausência, divergência e ambiguidade falham fechado — PASS

A construção rejeita referência ausente, target divergente, tipo/campo/target inválido, IDs de link duplicados e multiplicidade de referência ao mesmo target. O compiler rejeita também target nominal não único e duplicatas em listas de refs. Em runtime, edge desconhecido, origem errada ou traversal a partir de handle aninhado envenenam o controlador. `follow(field)` exige uma única aresta singular admitida e rejeita ambiguidade.

### 4. Reads reais após traversal continuam observados — PASS

Os testes exercitam `traverse(...).get('amount')` e `follow(...).get('amount')` e verificam a sequência `traverse` seguida por `get` no target. O mecanismo de `get` não foi alterado para omitir reads. Há também integração sobre arestas reais com leitura explícita do `id` do target após traversal.

### 5. Nenhuma leitura real é filtrada; nenhum expected vem do actual — PASS

A mudança elimina execução incidental, não pós-processa o trace. Os métodos instrumentados continuam emitindo suas operações normalmente. Não há parâmetro de expected trace no controlador de acesso nem no sink. A autoria permanece separada das observações de runtime.

### 6. Diagnóstico edge-only preserva independência normativa — PASS

`inspectNextProvenanceTraceCompatibility.mjs` passou a tratar edge-only como combinação normativa válida e informativa. Ele mantém `required_edges` e `required_reads` como dimensões separadas; não fabrica reads nem adiciona nodes ao contrato. Para cada `required_edge`, exige que o edge exista no grafo e lança erro para edge desconhecido, portanto `compatible=true` não mascara uma aresta requerida inexistente.

### 7. Coerência com o contrato §4 — PASS

A seção 4 exige que toda leitura causal realmente executada seja coberta pela fase correta e, separadamente, que arestas obrigatórias não sejam ignoradas. Ela não transforma a observação estrutural de traversal em obrigação implícita de executar leituras escalares do source ou do target. A correção preserva essa independência: observa o edge; observa reads somente quando eles realmente são executados.

### 8. Testes negativos — PASS para o escopo focal

Os casos alterados cobrem, entre outros pontos: referência material divergente ou ausente; target com `id` divergente; link com field/target/type inválido; origem estrangeira; edge desconhecido; ambiguidade de `follow`; handle aninhado; sink que rejeita observação; `role_ref_list` divergente; tuplas de traversal forjadas; e `required_edge` inexistente no diagnóstico. `metricInstallments` aceita a rejeição antecipada por `access_shape_invalid`, coerente com a nova fronteira de admissão.

## Evidência local relatada, não reexecutada nesta reauditoria

Os documentos do candidato relatam, após a correção:

- 6/6 casos causais PASS;
- 70/70 testes dos módulos afetados PASS;
- 241/241 bateria focal N02-G PASS;
- zero FAIL, SKIP ou TODO;
- diagnóstico com `compatible=true`, 76 grafos, 152 fases, 66 grafos edge-only e 1.133 ocorrências edge-only informativas.

Esses números foram tratados como **evidência local relatada**. Esta reauditoria não os reexecutou e não os usa como substituto da cadeia causal estática acima. A suíte ampla do repositório também permanece fora deste parecer, conforme o próprio candidato registra.

## Findings

Nenhuma rota causal de falso verde material foi demonstrada dentro do delta e das fronteiras solicitadas.

- CRITICAL: 0
- HIGH: 0
- MEDIUM: 0
- LOW: 0

## Veredito final

**APROVÁVEL** para a correção focal `fd2d996b45bb7cecd4ae0d7d19cacece5afbe98b`.

O finding anterior de incompatibilidade traversal/trace está corrigido no escopo reavaliado: a relação material é admitida antes do guest sem fabricar trace; traversal emite somente a aresta admitida; reads posteriores reais permanecem observáveis; falhas estruturais fecham; o diagnóstico não deriva expected do actual nem esconde edge requerido inexistente.

Este veredito encerra somente a reauditoria focal da correção. **Não** constitui GO global do N02-G, não aprova a integração integral ainda pendente, não autoriza NEXT-03, deploy, produção ou dados reais.