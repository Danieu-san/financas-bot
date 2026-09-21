# N02-G — revisão do método de autoria causal

2026-09-20. Candidato `8b9c4fca93186c9f747ba1a868bf1616ba15d92a`, pai
`122b9f7decdb83a925c657fe8f6d642b73cb7651`. Uma solicitação automática em
conversa limpa do projeto FinançasBot, Chat / Sol / Alta. Resposta concluída
observada pelo Codex. Síntese do parecer, não execução externa.

## Veredito

APTO somente para implementar gerador offline candidato e testes do primeiro
perfil, com condições vinculantes. Nenhum delta normativo autorizado, nenhum
GO do código local, dos 76 grafos, do N02-G, deploy ou produção.

## Fontes e limites

Auditor confirmou hash, pai único e dois arquivos documentais alterados. Leu
a proposta integral, binding §4 e cláusulas correlatas, contratos completos
consumption_by_instrument/statement_total, respectivas entradas do metric
registry, graph schema e definições pertinentes do snapshot schema. Consultou
também material-field registry e claim schema, e os seis claims correspondentes
aos dois contratos. Não materializou graphs-v2.json (>4 MiB); não afirma ter
validado os trace_contract ou preservação concreta dos seis grafos.
Não executou testes, gerador, evaluator, recorder, host ou oracle, nem leu
incrementos locais. O objeto revisado é método, não delta ou implementação.

## Condições vinculantes aceitas no confronto local

1. O kernel recebe projeção fechada; nunca derivation/proof expected, nem
   projeção derivada deles. Comparar com a autoria antiga só depois de gerar.
2. Não-interferência: adulterar trace_contract antigo mantendo inputs
   permitidos constantes não pode mudar os bytes das obrigações geradas.
3. Pinar/digestar claim schema, material-field registry, metric registry,
   evaluator contract, snapshots/relações e perfil. Snapshot schema sozinho
   não é autoridade de classes de campo nem tipos do contexto.
4. Chave inclui evaluator/version/contract hash, não apenas metric ID.
5. Política de resolução de alvo estrangeiro explícita e declarativa; sem
   política definida, abortar o ramo. Runtime não pode decidir essa política.
6. Proof, selections, selected_nodes, predicates, claims e outros campos fora
   do objeto produzido pelo kernel; preservação verificada posteriormente.
7. Nunca aplicar automaticamente o delta. Próximo objeto auditável deve conter
   código, testes, perfil fechado e resultado somente como candidato separado.

Alto/bloqueador: nenhum para implementação candidata sob essas condições.
Médios: isolamento do expected antigo, autoridades adicionais, política do
alvo estrangeiro. Médio/baixo: chave versionada. A distinção de operações,
preservação de proof/seleção e janela civil de statement_total foram aceitas.

O kernel de cálculo financeiro permanece sem sets selecionados como entrada.
O gerador não será uma segunda autoridade para reescrever a seleção ratificada.
