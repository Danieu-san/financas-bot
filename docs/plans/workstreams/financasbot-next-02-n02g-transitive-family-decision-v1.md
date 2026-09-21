# N02-G — autoria das dependências transitivas de família

2026-09-20. APTO documental recebido; delta aplicado localmente após RED.
Ainda sem auditoria/GO de código. Base publicada da proposta:
`8a95579e8959196ea184d0ed322bd3b464cc35f6`.
Parecer sobre `f27c504086aad13a035c71021a34ff7f6ff2606b` registrado em
`../../audit-evidence/n02g-transitive-family/independent-review.md`.
Objetivo: fechar a autoria da população familiar de safe_daily_pace sem
exceção no avaliador e sem transformar um trace observado em contrato.

## Fontes e limite

No mesmo repositório/hash da revisão, consultar:

- `docs/contracts/next/provenance-v2/evaluator-contracts/safe_daily_pace.json`;
- `docs/contracts/next/provenance-v2/graph-binding-contract-v1.md`, seção 4;
- `src/next/provenance/metricSelection.js`, selectEconomicEvents;
- `docs/audit-evidence/n02g-transitive-family/graphs-extract.json`, objetos
  completos M-13#1#3 e M-13#1#6 e os respectivos claims.

O extrato provém do blob Git de base, não da worktree. Source commit, path,
digests e tamanho identificam as origens. A igualdade da extração com as
origens é conferida localmente; uma revisão do extrato não pode ser descrita
como leitura remota dos blobs integrais nem como execução externa dessa
conferência. O extrato não substitui a autoridade normativa dos originais.
O commit documental não publica os incrementos locais de runtime/testes.

## Conflito já verificável na base

safe_daily_pace exige eventos confirmed elegíveis por categoria efetiva,
**família** e janela, com restante de orçamento e floor por dias civis. O
avaliador publicado segue budget.family_id, lê family.id e family.members e
usa membership para determinar o consumo familiar. Portanto essa dependência
não foi inventada pela nova implementação de enumeração.

Nos dois grafos, e0004 liga o budget à família e já é derivacional. Entretanto
family_example não tem reads derivacionais de id/members; a enumeração e as
arestas de membros e0082/e0083 estão somente em proof. A diferença entre role
direto e referência transitiva não elimina o uso causal dessa população.

Em outros contratos de consumo familiar, a população já tem declaração de
iterator/cardinality/order e travessias de membros. Criar um ramo de pace que
não enumere somente para acomodar estes grafos perpetuaria a mesma classe de
erro: dependência realmente consumida fora do inventário da fase.

## Regra geral proposta para autoria (sem nova DSL)

Complementar a seção 4 do binding contract com este princípio:

> O inventário da fase inclui os dados materialmente consumidos por uma
> dependência transitiva da fórmula, não somente os ligados como roles diretos.
> Resolver uma referência não dispensa declarar as leituras/identidades do
> alvo que o cálculo realmente usa. Tampouco exige automaticamente ler todo
> o alvo. Quando a fórmula usa a população familiar exata como filtro, declarar
> a leitura da lista members, sua cardinalidade e enumeração em ordem, bem
> como cada relação material admitida de membro. Os campos/identidades dos
> membros não entram só por serem alvos dessas arestas. Expected deve ser
> fixado pela semântica e pelos bindings/relações autorados, antes da execução.

Essa regra não exige copiar toda a closure de proof para derivation, nem ler
dados sem uso causal. Não cria role, opcode, campo de schema ou autoridade de
runtime. Não troca as obrigações independentes de get/traversal/enumeração.
As listas exatas de cada grafo continuam obrigatórias, não wildcards.

## Delta fechado das duas instâncias

Para cada claim safe_daily_pace, resolver o role budget e sua única aresta
family_id para kind family. A partir dessa família, enumerar as relações
members declaradas (ref_list no registro material). Nunca usar fact_key,
alias conhecido, edge_id embutido, trace ou oracle para escolher a dependência.

Adicionar à derivation de cada grafo, preservando os itens existentes:

- um required_node: a família resolvida;
- dois required_reads: family/id e family/members;
- três required_structural: cardinality, iterator e order de family/members;
- as duas required_edges de members já autoradas naquelas instâncias.

M-13#1#3/#1#6 são exemplos concretos: family_example e e0082/e0083. Não
acrescentar person_a/person_b a required_nodes, seus campos ou identidades.
Não acrescentar a aresta inversa person.family_id. A travessia budget.family_id
e sua leitura escalar permanecem conforme a declaração existente.

Sem alteração de R, claim, operand_bindings, selected_nodes, candidate/selected
sets, períodos, clocks, policy, divisor, floor, categorias, regras de sinais,
predicates, obligations ou trace_contract.proof. Nenhuma emenda financeira nova:
a semântica vigente já depende da família. Caso o auditor encontre fundamento
contrário, manter bloqueada a autoria; não adaptar o evaluator para escondê-la.

## Validação proposta antes de implementação normativa

1. RED de autoria: construir os requisitos acima a partir do role/relações,
   sem trace. Os dois grafos antigos devem falhar. Repetir o derivador de
   requisitos com aliases/IDs de arestas renomeados e ordens variadas, sem
   constantes de M-13 ou family_example na regra.
2. Assert de preservação por igualdade profunda: excluir somente os quatro
   inventários derivacionais modificáveis; toda a prova, os grafos restantes,
   os claims e os resultados esperados precisam permanecer iguais à base.
3. Integração: os campos/estrutura/arestas familiares fixados antes da execução
   devem aparecer na mesma derivation. Não afirmar matched global: outros
   deltas preexistentes dessas métricas continuam bloqueando.
4. A implementação da enumeração deve rejeitar membro não resolvido mesmo sem
   contribuição, ambiguidade, alias no lugar de ID, lista inconsistente,
   duplicidade e cardinalidade divergente; testar vazio e permutação válidos.
5. Troca de membro deve alterar a seleção quando muda a população elegível;
   get, includes, comprimento ou traversal isolados não provam uns aos outros.
   O novo acesso não pode observar payload/identidade de pessoas não exigidos.

Os itens são obrigações da implementação futura auditável, não prova de código
aprovado. Incrementos locais ainda não publicados já exercitam algumas delas;
o auditor deste documento não deve presumir que os executou ou leu.

## Pedido de revisão

Confirmar hash e arquivos efetivamente lidos. Decidir APTO/NÃO APTO para
implementar a regra de autoria e seu delta fechado, com achados e limites.
Separar equivalência local do extrato, revisão independente do conteúdo
publicado e validação futura de código. Não conceder GO de host, do N02-G
global, de execução ou produção. Não alterar arquivos durante a revisão.
