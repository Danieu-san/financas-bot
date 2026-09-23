# N02-G — observação de presença do escopo opcional da fonte

Estado: PROPOSTA DOCUMENTAL NÃO APLICADA, aguardando revisão independente.
Base: `1257abafea4041a59d209e9bab80df7cda6a1433`.
Recorte: eligible_event_count@1; S-13#1#1, M-09#1#1 e N-04#1#1.

## Problema e fundamento

O contrato eligible_event_count exige provar a contagem pela seleção de eventos
elegíveis por sujeito, categoria, estado e período. O schema e o registry material
admitem source_state.entity_id como referência opcional a pessoa, família, conta
ou cartão. O binding contract §2 exige observar ausência quando ela importa à
prova. O campo pode restringir o escopo da fonte; sua ausência não é valor null.

metricDirectReads verifica período, cobertura completa e categoria, consulta
source.has('entity_id') e, quando presente, compara o identificador ao escopo
esperado antes de selecionar e conferir a contagem. A consulta é uma condição
causal de aceitação. Eliminá-la descartaria a guarda de escopo da fonte quando
ela contém entity_id. Nenhuma mudança de runtime é proposta.

Nos três grafos atuais, o role source resolve source_empty_health por kind,
ref_id e version. O snapshot não contém entity_id; já há leituras derivacionais
de id/period/category_id/coverage/event_count. Falta a observação estrutural has.
O proof contém keys para a fonte; keys em proof não substitui has em derivation.

## Regra e delta fechado

Para eligible_event_count@1, resolver o role source como nó source_state de
identidade e versão únicas. Autorar em derivation.required_structural:

```json
{"node":"<alias resolvido do role source>","operation":"has","segments":["entity_id"]}
```

A exigência de presença independe do valor de retorno de has. Ela é definida
pelo campo opcional consumido como guarda de escopo, antes de execução. Não
selecionar por fact_key, alias literal, valor esperado, conjunto selecionado ou
trace. A enumeração dos três fact_keys delimita o delta revisado, não a regra.

Aplicação proposta: uma adição em cada um dos três grafos, total três has;
nenhuma remoção. Os outros 73 grafos e todos os demais campos dos três devem
ficar iguais, incluindo proof, reads, edges, seleção, nós e valores. Não criar
aresta/target/get para entity_id ausente. Não promover toda a closure de proof.
O ramo com entity_id presente pode exigir leituras e relações adicionais;
esta proposta não declara coberto esse ramo por adicionar somente has.

## Evidência e limites

Inventário: docs/audit-evidence/n02g-causal-authoring-profile/source-entity-presence-proposal.json.
Helper: prepare-source-entity-presence-proposal.cjs na mesma pasta. Confere
fontes contra blobs da base, contrato, identidade/versão/fingerprint declarado,
ausência do campo e delta. Não executa evaluator, usa actual/oracle nem altera
normativa; não valida todos os fingerprints semânticos. Diagnóstico anterior
apontou os três resíduos; a proposta se fundamenta nos contratos e relações
autoradas, não na transcrição do resultado observado.

## Critérios para eventual implementação

Após APTO DOCUMENTAL: regra independente de alias, propriedades de renomeação
e presença/ausência, RED causal da obrigação ausente, aplicação exata dos três
itens e igualdade integral do corpus. Integração dos três grafos com expected
congelado antes de executar, R/seleção preservados e trace sem has recusado.
Um teste de kernel com entity_id presente deve preservar a recusa de escopo
incompatível; não chamá-lo de aceitação de grafo mutante sem admissão completa.
Focais/afetados e uma ampla final por candidato estável, depois auditoria de
código por novo hash. Aprovação documental não encerra a implementação.

Sem GO global N02-G, aceitação de grafo/host, dados reais, deploy ou produção.
