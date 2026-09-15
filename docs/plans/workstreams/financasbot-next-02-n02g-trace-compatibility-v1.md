# N02-G — incompatibilidade focal entre traversal e cobertura de trace

Estado: **BLOQUEIO DE INTEGRAÇÃO; REVISÃO INDEPENDENTE PENDENTE**.
Não é veredito global contra N02-F, nem aprovação do N02-G. Nenhuma alteração
dos grafos/fixtures/contratos ratificados foi feita para contornar o problema.

## Questão única para revisão

A implementação deve conciliar três exigências: consumir as arestas de
`required_edges`, observar externamente os acessos reais e respeitar a igualdade
exata de `required_nodes`/`required_reads` da fase. O contrato de autoria atual
não cobre todos os endpoints das arestas que exige na derivação.

O diagnóstico é relativo à primitiva de traversal efetivamente implementada,
não uma afirmação de impossibilidade matemática de qualquer implementação.
O auditor deve confrontar também se outra interpretação preservaria TODAS as
exigências, sem ocultar acesso a endpoint ou reduzir a observação causal.

## Instância mínima reproduzida

Fonte: `docs/contracts/next/provenance-v2/graphs-v2.json`, grafo `S-01#1#1`.

1. `trace_contract.derivation.required_edges` contém `e0023`.
2. A aresta é `evt_bill_projected.person_id → person_b`, relação `material_ref`.
3. `person_b` é snapshot de `person-b`, papel `link_proof`.
4. A derivação não inclui `person_b` em `required_nodes` e não declara qualquer
   leitura de `person_b` em `required_reads`.
5. A primitiva real `handle.traverse('e0023')` lê
   `evt_bill_projected.person_id`, lê `person_b.id`, verifica a correspondência
   e emite a observação da aresta. O teste confronta exatamente essas leituras.

`graph-binding-contract-v1.md`, seção 4, determina igualdade exata dos pares
node/path, define required_nodes como nós examinados/consumidos e rejeita leitura
extra/ausente ou aresta ignorada. Portanto o caminho atual não pode aceitar esse
trace: omitir o traversal deixa uma aresta obrigatória sem consumo; executá-lo
introduz nó/leitura que a mesma fase exclui.

## Evidência local e alcance

Comandos:

```text
node --test --test-name-pattern=TRACE-COMPAT-001 tests/next/provenance/authoringIndex.cases.js
node scripts/agent/inspectNextProvenanceTraceCompatibility.mjs
```

Resultado observado: reprodução causal **1/1 PASS** (o teste prova o bloqueio,
não a aceitação do grafo); diagnóstico **exit 1**, `compatible=false`,
76 grafos/152 fases examinados, 66 grafos afetados, 1.133 ocorrências de arestas
sem cobertura do endpoint. Todas estão na fase derivation; nenhuma em proof.
Bateria focal integrada posterior: **241/241 PASS**, zero FAIL/SKIP/TODO,
54,03 segundos. A reprodução do bloqueio faz parte desses testes; esse verde
não transforma o diagnóstico em compatível nem fecha o N02-G.

O helper faz apenas análise de compatibilidade entre campos do contrato. Não
executa o motor, não fabrica observações e não é um gate completo de provenance.
O teste adicional usa uma cópia mínima em memória com cobertura explícita para
demonstrar que a checagem aceita a cobertura e rejeita a remoção de cada endpoint.
Não modifica o arquivo ratificado para produzir verde.

O resultado não implica 1.133 falhas independentes, nem demonstra que corrigir
esta classe bastará para fechar todos os traces. Seleções, reads escalares,
operações estruturais, roles e fases ainda exigem confronto completo.

## Decisão proposta, ainda não aplicada

Revisar a autoria de trace por uma regra única de coerência entre obrigações,
traversals e cobertura. A fase derivation deve exigir somente relações realmente
necessárias ao cálculo/seleção e cobrir seus endpoints; relações exclusivas de
prova ficam na fase proof, com sua cobertura própria. A necessidade de cada
relação deve decorrer do contrato, não do resultado esperado nem do fact_key.

Não é proposta uma permissão genérica para reads extras, nem adicionar todos os
nós a todas as fases. Também não é proposta a regeneração automática do contrato
esperado a partir do trace observado: isso seria autorreferencial. Autoria
esperada continua independente, revisada e imutável; a execução a confronta.

Antes de aplicar qualquer mudança, o parecer deve decidir se a incompatibilidade
é real sob a semântica ratificada e qual lado precisa ser corrigido: autoria,
projeção de observações ou primitiva. Preservar os requisitos de observação
externa, separação de fases, seleção real e rejeição de evidência extra.

## Estado do produto

73/76 claims (36/39 métricas) tiveram resultados funcionais confrontados com o
oracle somente no harness. Isso não constitui aceitação de grafos. As três
métricas derivadas continuam aguardando recibos de pais realmente validados.
A cápsula/TCB, confronto integral de trace, mutações e gate completo permanecem
pendentes. Suíte ampla final ainda não foi iniciada: seria prematura enquanto
essa decisão de integração está aberta. A bateria focal cobre os incrementos.

Esta revisão não autoriza NEXT-03, deploy, produção ou dados reais. Seu objeto é
apenas a compatibilidade descrita acima, com nova evidência executável que não
existia na auditoria documental anterior.
