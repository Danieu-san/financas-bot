# N02-G — autoria da classificação da categoria efetiva

2026-09-22. PROPOSTA DOCUMENTAL, NÃO APLICADA. Base:
`1710b570007dde9ca94ed4f79d7afddfc9c3f81b`, após ratificação focal de
evidence_state em a129ce3. Nenhuma aprovação global de N02-G.

## Questão e decisão solicitada

O contrato budget_class_consumption v1 soma consumo de eventos quando sua
categoria efetiva tem a classe do filtro. Uma compensação usa a categoria da
compra comprovada. O catálogo de categorias é um role de evidência, distinto
do role que contém a população de eventos candidatos.

Nos dois grafos deste contrato, o catálogo contém oito categorias expense e
quatro de outras classes. health_general é expense/essential, mas não é alvo
de nenhuma aresta do grafo: nenhum candidato nem compra compensada usa essa
categoria. Mesmo assim, derivation exige health_general/budget_class em ambos.
O runtime examina id/kind/identidade de todo o catálogo e budget_class das
categorias efetivas dos candidatos econômicos. Falta resolver se a obrigação
de classificação do catálogo inteiro é normativa ou uma sobreautoria.

Solicita-se APTO/NÃO APTO DOCUMENTAL para a regra abaixo e somente duas
remoções de required_reads em derivation, preservando todo o resto:

| Instância de inventário | Remoção proposta |
| --- | --- |
| M-03#1#1 | health_general / budget_class |
| M-03#1#2 | health_general / budget_class |

Esses nomes identificam o delta deste corpus, não a regra de autoria.
Não adicionar uma leitura artificial ao evaluator para satisfazer o expected.
Não remover nós do catálogo: id/kind/identidade ainda são examinados pelo
leitor e necessários à resolução/checagem das referências.

## Regra geral proposta, independente da execução

Aplicável a evaluator_id=budget_class_consumption, evaluator_version=1,
contrato sha256:e336d72e581c06401fd6ef3cc5b041b6c2b7ad56745fe25ff5980ca763ed8561.
Resolver roles events/categories e suas referências materiais por ID + versão
usando claims, snapshots/registry e relações autoradas, antes do evaluator:

1. Para cada evento candidato, resolver sua categoria em categories.
2. Se category.kind=expense, ela é a categoria efetiva econômica.
3. Se category.kind=compensation, resolver a compra por compensates e sua
   category_id; exigir fonte expense e categoria pertencente ao role. Ela é
   a categoria efetiva. Não ler a classificação da categoria compensation.
4. Income/neutral não introduzem obrigação de budget_class.
5. Exigir budget_class da união exata dessas categorias efetivas, incluindo
   candidatos que poderão ser excluídos por estado, data, família ou filtro.
   Não usar selected_set, selected_nodes, resultado R, actual, trace ou oracle
   para definir essa união. Ela vem da população candidata e das relações.
6. Pertencer ao catálogo, sem esse vínculo causal, não cria obrigação de
   budget_class em derivation. Isso não dispensa outras leituras do catálogo.

O inventário auxiliar é somente proposta: não aplica grafos e não amplia o
gerador instrumental existente. A regra não promove uma closure de proof
para derivation e não altera seleção financeira, proof ou bindings.

## Fontes e verificação

No hash desta proposta: contrato evaluator-contracts/budget_class_consumption.json,
graph-binding-contract-v1.md §4/dependências transitivas, registry e schemas,
claims-v2, snapshot-manifest referenciado e dois graphs-v2 pertinentes.
Confrontar src/next/provenance/metricSelection.js (createCategoryReader e
selectEconomicEvents) e a referência de comportamento
scripts/agent/validateFinancasBotNextFacts.mjs: derive.budget_class_consumption.
O comportamento legado é apoio, não autoridade para sobrepor o contrato.

Inventário/hash/fontes e extratos pertinentes em
docs/audit-evidence/n02g-causal-authoring-profile/budget-class-population-proposal.json;
helper prepare-budget-class-population-proposal.cjs. São verificações locais,
não execução ou leitura independente do auditor. Pedir confirmação de hash/pai,
fontes lidas e limites. Se existir obrigação de validar budget_class de TODO o
catálogo, apontar a cláusula precisa; nesse caso não aplicar as remoções.

## Validação futura e travas

Após APTO documental, somente o delta fechado poderá ser implementado:

- RED da regra contra as duas leituras excedentes; propriedade de invariância
  por renomeação e permutação dos aliases/arestas, sem casos por fact_key;
- categoria expense não referenciada não entra na união; ao tornar uma categoria
  alvo efetivo de um candidato ou compra compensada, sua obrigação entra;
- candidatos excluídos financeiramente continuam nas obrigações causais;
- igualdade integral: somente dois reads removidos; outros 74 grafos e todos
  os demais campos, inclusive proof/seleção/nós do catálogo, preservados;
- expected congelado antes do evaluator; seleção e R preservados, cobertura
  exata nos dois casos; remover uma leitura efetivamente exigida deve falhar;
- compor este delta nos controles históricos de corpus sem apagar igualdade;
- focais/afetados, uma ampla final, commit e auditoria independente do código.

Esta proposta não altera runtime, gerador, perfis, grafos ou testes. Nenhuma
nova ampla para documentação. Sem GO de grafo/host, N02-G global ou produção.
