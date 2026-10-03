# N02-G — decisão focal do domínio de estratégias de path

Estado: DIAGNÓSTICO DOCUMENTAL; DECISÃO NÃO RATIFICADA; WIP HOLD.
Base imutável: `dbe72aa94894b7c4abf70c31fab8902f5e9236dc`.
Não é candidato de código nem pedido de GO global.

## Pergunta fechada

O §10.2 exige, para cada predicado, trocar um operando por path válido mas
errado e inserir operador/path desconhecido. O §10.5 deriva cardinalidade do
schema compilado; §10.6 proíbe SKIP/redução quando um witness exigido falta.

O inventário WIP relatado cria `same_type_wrong_path` e `unknown_path` para
**cada índice de operando**, sem distinguir referência/path de literal.
Qual é o domínio normativamente correto dessas coordenadas? A revisão deve
distinguir obrigação por predicado, cobertura de cada site de referência e
operando literal sem path, sem aceitar redução silenciosa do inventário.

## Evidência reconstruível, não prova de runtime

`path-inventory-domain-witness.json` e seu verifier extraem integralmente o
corpus imutável da base via `git show`. Conferem 76 grafos/chaves únicos,
predicates únicos por grafo, 22.994 operandos/IDs distintos e hash do índice.
O ID é derivado independentemente da fórmula declarada do inventário WIP.
Isso não executa nem aprova o compiler, o inventário WIP, D/P ou código.

O corpus contém:

| Classe estrutural | Coordenadas |
|---|---:|
| field/claim/presence/selector/ref_set | 3.059 |
| node/edge/set/period_ref/period_bound | 13.728 |
| argumento de template com bindings | 28 |
| literal | 6.105 |
| period_literal | 74 |
| Total | 22.994 |

Os 6.179 literais não contêm um campo de path ou referência. Os 28 templates
possuem bindings internos, portanto não pertencem à mesma impossibilidade.
O witness publica exemplos originais de literal, period_literal e template.
Os demais argumentos e os valores positivos não foram alterados.

## Estado local relatado, não auditado por este commit

Controles de admissão nativa, sem crédito semântico, foram executados em
relatórios separados: paths 3.059/3.059; referências 13.728/13.728; templates
28/28. Cada relatório mantém as 22.994 linhas e deixa outros recortes pendentes.
Nenhuma soma desses relatórios é alegada como família/G11 verde.
Os negativos não executam compiler completo no mutante, D/P ou release.

O lote RED de referências (28 diagnósticos sem coordenada) foi preservado;
seu lote corretivo não transforma o resultado histórico em PASS.
Ampla histórica: **RED 2.413 PASS / 3 FAIL / 10 SKIP**; não reexecutada.
Nenhum resultado local acima é requisito de confiança para responder à
pergunta normativa: o corpus e o texto imutáveis são a evidência primária.

## Limites que não podem ser contornados

- Não retirar IDs do inventário vigente nem marcar literal como SKIP/N/A.
- Não converter automaticamente literal em field/claim/ref para fabricar
  cobertura, preservar apenas o tipo primitivo e alegar a mesma coordenada.
- Não creditar mensagem de erro genérica, schema inválido ou recusa anterior
  a P como witness semântico; admissão deve continuar em ledger próprio.
- Não copiar actual para expected, aceitar cofalhas, deduplicar coordenadas,
  reutilizar execução de outro operando ou relaxar oracle/seleção/trace.
- Não aplicar um redesenho de inventário antes de decisão explícita suficiente.

## Entrega pedida ao revisor independente

Leia o witness, verifier e §§10.0–10.6 do design no SHA candidato. Confronte
também o schema de argumentos de `provenance-graph.schema.json` e o registry
de operadores. Confirme identidade/parent e arquivos realmente lidos.

1. O inventário por **todo operando** é exigência do contrato ou sobre-enumeração
   do WIP? Justifique pelo texto e pela gramática, não só pelos exemplos.
2. Se as 6.179 coordenadas são obrigatórias, apresente uma construção concreta
   compatível com a classe original e sua barreira de execução; se não existe,
   mantenha UNSATISFIED e identifique a decisão normativa necessária.
3. Se a granularidade correta é por site de referência ou por predicado,
   detalhe como migrar o inventário de modo explícito, auditável e sem ocultar
   nenhum requisito anterior; não basta recomendar reduzir a contagem.
4. Separe `same_type_wrong_path` semântico de `unknown_path` de admissão.
   Nenhum resultado deste documento autoriza reinterpretar admission como D/P.

Conclusão solicitada: decisão fundamentada sobre o domínio do inventário,
com lacunas e eventual necessidade de adendo. Não pedir nem conceder GO de
código, G11/N02-G/NEXT-02, NEXT-03, deploy, produção ou dados reais.

O design mantém cabeçalho histórico de candidato não normativo; esta revisão
usa seu §10 como regra G11 indicada pelo workstream. Não resolve a cadeia de
ratificação externa nem substitui as decisões source-state e A/B já aprovadas.
