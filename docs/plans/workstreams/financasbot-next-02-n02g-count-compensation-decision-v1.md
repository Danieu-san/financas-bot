# N02-G — caminho da categoria efetiva na contagem

2026-09-20. PROPOSTA DOCUMENTAL REVISADA, não aplicada. Base imutável:
`f27c504086aad13a035c71021a34ff7f6ff2606b`.
Pedido de revisão limitado à autoria de eligible_event_count; não é auditoria
de código, nem GO do N02-G, deploy ou produção.

A versão no hash 130c74dd9fc14a15ca84a64cb839c9968f5433f3 recebeu NÃO APTO:
faltava esclarecer a representação normativa de traversal. O recibo está em
`../../audit-evidence/n02g-count-compensation/independent-review.md`.
Esta revisão acrescenta uma proposta normativa explícita e fontes de protocolo;
não reenvia a proposta anterior inalterada nem considera o bloqueio superado.

## Fontes no mesmo hash da proposta

- `docs/contracts/next/provenance-v2/evaluator-contracts/eligible_event_count.json`;
- `docs/contracts/next/provenance-v2/graph-binding-contract-v1.md`, seção 4;
- `src/next/provenance/metricDirectReads.js`, ramo eligible_event_count;
- `src/next/provenance/metricSelection.js`, selectEconomicEvents;
- `scripts/agent/validateFinancasBotNextFacts.mjs`, categoryFor e eligible_event_count;
- `docs/audit-evidence/n02g-count-compensation/graphs-extract.json`, três grafos
  e claims completos, extraídos dos blobs Git da base acima, não da worktree.

O extrato identifica blob, SHA-256 e tamanho das fontes. A equivalência de
objetos é conferida localmente pela ferramenta de extração e --verify; não
atribuir essa execução ao auditor externo. O extrato não é fonte normativa.
Este candidato publica documentação e ferramenta de extração, não os
incrementos locais de avaliadores ou de grafos em desenvolvimento.

Fontes adicionais para resolver o achado, no mesmo hash imutável da revisão:

- `docs/contracts/next/provenance-v2/provenance-graph.schema.json`, structural/phase;
- `src/next/provenance/instrumentedAccess.js`, follow/traverse;
- `src/next/provenance/observationContract.js`, decodeObservation/caso traverse;
- `src/next/provenance/causalRecorder.js`, gravação de I;
- `src/next/provenance/proofAcceptance.js`, compareReadEdgeCoverage;
- `tests/next/provenance/proofAcceptance.cases.js`, TRACE-COVERAGE-003.

## Esclarecimento normativo proposto — representação de travessias

O bloqueador foi procedente como lacuna documental: o binding enumera
traversal entre operações estruturais sem fixar sua representação, enquanto
o schema admite esse nome. O código por si só não ratifica uma interpretação.
Solicita-se revisar e autorizar o seguinte texto para a seção 4 do binding:

> No perfil N02-G de relações materiais admitidas, follow(field) e
> traverse(edge_id) observam a travessia pelo evento I/traverse com source,
> field, edge_id e target. A obrigação canônica dessa observação é a aresta
> em required_edges da fase. Não há uma segunda observação estrutural criada
> implicitamente para a mesma travessia. A leitura do valor da referência é
> um get distinto e exige required_reads (ou required_claim_reads, quando
> aplicável); nem get nem traversal substitui a outra operação.
>
> required_structural cobre as operações estruturais efetivamente realizadas
> além da resolução de aresta, como cardinalidade, enumeração, ordem e
> membership de listas. Resolver membros não cobre essas operações. A presença
> de traversal no enum estrutural não cria uma segunda obrigação automática
> nem autoriza tratá-lo como alias de required_edges. Uma declaração explícita
> de required_structural/traversal não pode ser ignorada ou satisfeita por
> conveniência; enquanto não houver semântica/projeção própria suportada para
> tal declaração neste perfil, ela deve impedir aceitação.

Essa redação é proposta normativa, não fato já ratificado. Seu fundamento
observável é que follow chama traverse; este emite somente I/traverse, e o
recorder preserva esse evento. O comparador existente o projeta em edges,
não em structural, e TRACE-COVERAGE-003 exige exatamente isso com estrutura
vazia; exige também falha se a aresta faltar ou se houver reads não autorados.
Isso não converte código em única autoridade: a revisão decide se a regra
explícita é consistente com as obrigações normativas e pode ser incorporada.

Inventário local do blob publicado 130c74d: 76 grafos/152 fases, 6.271 entradas
de required_edges e zero required_structural/traversal. Esse inventário é
evidência local complementar, não execução externa nem motivo para ignorar
futuros requisitos. Não se propõe remover traversal do schema, aceitar
declarações sem cobertura, alterar o recorder ou preencher expected do actual.

## Omissão demonstrável sem observar execução

O contrato exige igualdade entre event_count da fonte e cardinalidade de uma
seleção por sujeito, categoria, estado e período. Na referência histórica,
categoryFor herda a categoria da compra compensada. O avaliador publicado
compõe selectConsumption(category), que segue compensates e classifica a
categoria do alvo; não basta comparar a categoria própria da compensação.

Nos três grafos S-13#1#1, M-09#1#1 e N-04#1#1, o predicado de exclusão do
evt_refund_b é r0006_exclude_id: compara food_restaurant.id com health.general.
Portanto o predicado já usa a categoria efetiva, e NÃO precisa ser alterado.
A aresta material e0058 liga evt_refund_b.compensates a evt_restaurant_b;
ela e a leitura de compensates estão em proof, mas ausentes de derivation.
O evento alvo, seus id/category_id e a categoria efetiva já integram os
consumos derivacionais; não se propõe acrescentar nós ou copiar a prova.

## Regra de autoria e delta fechado

Ao selecionar pela categoria efetiva de uma compensação, declarar na fase o
campo que identifica a compra compensada e sua aresta material. A referência
deve ser resolvida e seu valor escalar deve concordar com o ID do alvo usado.
Uma exclusão financeira não elimina uma dependência examinada para excluí-la.
Essa regra vale pela semântica e pelas relações autoradas, não por fact_key,
alias, valor do resultado, trace observado ou oracle.

Somente se o esclarecimento acima também for APTO, incorporar esse texto ao
binding e, em cada um dos três grafos, acrescentar somente a derivation:

- required_reads: evt_refund_b / [compensates];
- required_edges: e0058.

Preservar integralmente proof, predicados, seleções, claims, conjuntos, nós,
outras leituras/arestas/estruturas e demais 73 grafos. Não alterar a definição
de contagem, event_count, sua validação de cobertura ou o resultado zero dos
exemplos. A regra não incorpora amount_minor nem a closure econômica inteira.
Não autoriza corrigir aqui outros deltas (evidence_state, entity_id ou leitura
de category_id da fonte), nem declarar cobertura completa desses grafos.

## Testes exigidos depois do parecer

Antes do runtime: derivar o delta do papel de eventos, das relações compensates
e da seleção por categoria efetiva, renomear aliases/edge IDs e variar ordem
sem consultar actual/expected/oracle. Comparar cada grafo completo com a base
mais o delta e provar preservação da prova e dos demais grafos.

Na execução: leitura escalar e traversal distintos; rejeição de referência
ausente/divergente; caso positivo de compensação cuja categoria herdada passa
a ser a consultada e altera a contagem. A fonte event_count precisa acompanhar
a população real ou ser rejeitada. Não preencher expected a partir do trace.
Semântica financeira, integração e auditoria imutável de código permanecem
pendentes; o parecer pedido aqui só autoriza ou bloqueia este delta documental.

## Pergunta ao auditor

Confirme hash e arquivos efetivamente lidos. O fundamento demonstra a omissão
transitiva, e a regra explícita de projeção é normativamente consistente e
resolve a ambiguidade? Se ambos forem aptos, permitem o delta de 1 read +
1 edge em cada grafo, preservando seleção/proof e sem actual/oracle?
Se não, aponte qual obrigação observável permanece sem representação; não
presuma uma segunda emissão de I sem confrontar as fontes. Liste achados e limites; conclua APTO ou
NÃO APTO para implementar, sem transformar revisão documental em GO de código.
