# N02-G — recibo da revisão documental revisada

2026-09-20. Candidato `122b9f7decdb83a925c657fe8f6d642b73cb7651`, pai
`130c74dd9fc14a15ca84a64cb839c9968f5433f3`. Uma tentativa automática em
conversa limpa do projeto FinançasBot. Chat / Sol / Alta. Resposta observada
concluída pelo Codex. Este recibo sintetiza o parecer, não é execução externa.

## Veredito e alcance

APTO exclusivamente documental e focal para implementar a regra normativa de
representação das travessias e acrescentar 1 required_read + 1 required_edge
à derivation de S-13#1#1, M-09#1#1 e N-04#1#1. Sem GO de código, N02-G,
deploy ou produção. O NÃO APTO anterior permanece registrado no recibo irmão;
a nova redação e as fontes adicionais resolvem o bloqueador daquele hash.

## Fontes declaradas pelo auditor

Hash e pai confirmados no GitHub; diff de apenas proposta e recibo.
Proposta revisada, recibo anterior, graphs-extract.json, contrato
eligible_event_count, binding §4, metricDirectReads, metricSelection,
validateFinancasBotNextFacts, schema de grafo, instrumentedAccess,
observationContract, causalRecorder, proofAcceptance e seus testes publicados
no mesmo hash. Não examinou incrementos locais não publicados.

## Achados e confronto local

- Alto/bloqueador: nenhum no recorte.
- Médio, condição de implementação: follow/traverse não produz o get escalar.
  A leitura de compensates precisa ser observada separadamente. O incremento
  local readReference já separa get, follow e validação do ID do alvo; seus
  testes e futura auditoria de código continuam necessários.
- Baixo: o enum structural/traversal permanece, mas a regra não o transforma
  em alias de required_edges. Declaração explícita sem projeção própria deve
  impedir aceitação. O teste local TRAVERSAL-PROFILE-001 exige esse bloqueio.

O parecer aceita a separação normativa: get → reads, I/traverse → edges,
sem obrigação estrutural implícita. Protocolo, recorder, comparador e teste
TRACE-COVERAGE-003 sustentam a coerência, não substituem a ratificação.
A categoria efetiva herdada determina a seleção; proof já contém o read
evt_refund_b/[compensates] e e0058 omitidos em derivation. Preservar proof,
seleção, predicados, claims, nós e todos os demais campos/73 grafos.

## Limites

O auditor não executou testes, extrator, igualdade dos blobs, host ou runtime,
nem atribuiu a si a conferência local do extrato. Não examinou a implementação
local. A evidência de runtime deve ser produzida localmente e auditada em
novo candidato executável imutável antes de qualquer GO de código.
