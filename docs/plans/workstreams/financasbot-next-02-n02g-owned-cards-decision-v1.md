# N02-G — identidade dos donos examinados por owned_cards

PROPOSTA DOCUMENTAL NÃO APLICADA.
Base: 76c8a2fe6891ad043ad3e8015ec7ff2471bf473b.
Recorte: owned_cards@1, S-07#1#1. Nenhuma mudança de produto ou permissões.

## Fundamento e decisão proposta

O contrato owned_cards retorna IDs dos cartões cujo owner_id resolve a pessoa
consultada, independentemente de disponibilidade da fonte. O registry declara
cards como população ordenada node_set e person como escopo. O runtime
metricDirectReads compara ref e version: em cada candidato, readReference
lê owner_id, segue a relação material e consome kind, id e version do dono
(metricReferences). Isso também acontece para candidatos excluídos.

S-07#1#1 já exige os três owner_id e as três arestas e0001/e0002/e0003 em
derivation. e0002 liga card_green a person_b. Mas person_b e seu id só estão
no inventário de proof; derivation omite ambos. O binding contract exige nós
examinados, não somente selecionados, e cobertura exata por fase. A ausência
de person_b na seleção de cartões não elimina a leitura usada na exclusão.

Não substituir a comparação versionada por uma comparação escalar apenas
para ajustar o trace ao grafo. A referência histórica filtra owner_id por ID;
a adaptação instrumentada usa a identidade versionada prevista pelo registry
e pelas relações admitidas. Esta proposta não introduz acesso bancário, novas
permissões ou um requisito de exclusividade de uso do cartão pelo titular.

## Regra de autoria e delta fechado

Somente owned_cards@1: resolver o role cards e, para cada candidato, a relação
material owner_id para person. Conferir snapshot por kind/ref_id/version,
payload.id, fingerprint declarado e concordância owner_id/ID do destino.
Autorizar como obrigações o nó de cada dono distinto e seu campo id, mesmo
quando o cartão é excluído. Aliases apenas identificam nós locais; fact_key,
selected/oracle/actual/trace não escolhem donos nem campos. Não copiar a
closure completa de proof nem a família inteira.

Delta resultante neste corpus: adicionar person_b a derivation.required_nodes
e {node: person_b, segments: [id]} a derivation.required_reads de S-07#1#1.
Zero remoções; nenhuma aresta ou observação estrutural nova. Preservar todos
os demais campos, proof, seleção, claims, snapshots, os outros 75 grafos,
runtime, contratos e registries. family_id do dono continua fora da derivação.
O helper owned-cards-proposal só propõe, não aplica normativa.

## Evidência, riscos e critério de continuidade

Inventário confere fontes integrais contra blobs da base, hash do manifest e
identidade declarada. Não recalcula todos os fingerprints nem executa evaluator.
A sonda já existente apontava precisamente um nó e um read extras; é evidência
diagnóstica corroborante, não fonte da obrigação nem aprovação de grafo.

Após APTO documental confrontado: RED causal, delta mínimo, comparação integral
com pai mais duas adições; composição explícita dos pins históricos. Modelos
variando aliases, donos compartilhados/distintos, versões e ordem; negativos
de dispatch, identidade ausente/duplicada e referência divergente. Integração
admitida congela expected antes do evaluator e preserva seleção/R; o inventário
antigo e trace sem leitura do ID do dono excluído devem falhar. Kernel verifica
inclusão/exclusão e identidade versionada sem alegar mutantes admitidos.

Executar focais/afetados e somente uma ampla após candidato estável; publicar
e submeter código a auditoria independente. Parar se a regra alcançar outro
campo/grafo ou exigir mudança de runtime: isso requer nova justificativa.
Não implementar o delta antes da revisão documental. Não há GO global N02-G,
aceitação de grafo/host, deploy ou produção. Reavaliar roadmap na saída do N02-G.
