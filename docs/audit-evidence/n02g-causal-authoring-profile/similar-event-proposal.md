# SIMILAR-EVENT — decisão normativa proposta

2026-09-26. Base imutável: `c3db3ecb8ffe4af681ec2547df6abb13896e9c40`.
Estado: PROPOSTA DOCUMENTAL NÃO APLICADA. Escopo: somente a derivation de
`M-16#1#2 / similar_event_ids@1`. Não aprova runtime, grafo, host ou N02-G.

## Decisão solicitada e fundamento

Julgar a suficiência normativa do perfil completo abaixo, não somente a
correção mecânica do helper. O contrato retorna IDs dos eventos confirmed do
mês com a chave de merchant consultada. Não filtra pessoa, categoria ou valor,
não usa aproximação textual e não funde lançamentos. O registry liga `events`
como população ordenada node_set e `merchant` como nó de escopo.

`metricDirectReads.js` já valida contexto, lê identidade/data/state de cada
candidato e observa `has(merchant_key)` antes do retorno do predicado. Quando
presente, `readReference` lê o escalar, segue a relação material e lê ID/kind/
versão do merchant alcançado. `same` compara ID e versão com o merchant ligado.
Essa resolução ocorre também para candidatos excluídos por estado, mês ou
merchant. Kind/version são observações de identidade; não se inventam reads
de payload com esses nomes. O ID consumido é um read material.

O contrato de binding, seção 4, separa derivation/proof, get/traversal/has e
selecionado/examinado. Por isso:

- Não se deve inserir leituras de person_id/category_id no runtime somente
  para satisfazer o inventário antigo. Essas referências continuam na prova.
- Não se deve copiar a closure de proof nem extrair o esperado da trace.
- A identidade do merchant alcançado pertence à derivation mesmo quando ele
  não corresponde ao consultado. A autoria não parte de selected_nodes.

## Perfil declarativo e composição

O perfil do JSON de proposta fixa evaluator ID+versão, roles e primitivas:

| Primitiva | Obrigação derivacional |
|---|---|
| Contexto month/event_date, subject merchant | subject.kind/ref_id, period.kind/value, time_basis |
| Escopo merchant | nó ligado ao role e seu id; identidade versionada |
| População events completa | cada nó candidato e id/date/state |
| Referência opcional merchant_key | has em cada candidato, presente ou ausente |
| Referência presente | get merchant_key, aresta material única e identidade/id do alvo |

Deduplicar obrigações não apaga ordem/multiplicidade da execução. Os conjuntos
de requisitos escalares/estruturais são normalizados; a ordem do role events
e os campos selected_nodes/required_selections são preservados, não calculados
pelo helper. O resultado financeiro deve ser conferido separadamente.

O gerador compõe os cinco inventários a partir do perfil, claim, relações e
snapshots, sem consultar trace_contract, proof ou seleções. O inventário antigo
entra somente depois para calcular o diff. A seleção existente é mantida,
mas isso não constitui demonstração de que o evaluator a executou corretamente.
Uma futura integração deve fixar/freezeDeep o esperado antes do evaluator.

O helper confere vínculo exato kind/ref_id/version, unicidade do snapshot,
payload.id, fingerprint declarado e coerência do escalar com o alvo da relação.
Não recalcula fingerprints nem substitui a admissão completa de snapshots.
As versões simbólicas dos modelos sintéticos não são snapshots admitidos.

## Delta fechado e preservação

No corpus original são 16 eventos, apenas evt_market_a com merchant_key.
O merchant consultado e o alcançado são o mesmo nó nessa instância.

| Inventário | Atual | Proposto | Diferença semântica |
|---|---:|---:|---|
| required_nodes | 17 | 17 | nenhuma |
| required_reads | 82 | 50 | remover person_id/category_id dos 16 eventos |
| required_claim_reads | 5 | 5 | nenhuma |
| required_edges | 33 | 1 | remover as 32 relações desses dois campos |
| required_structural | 0 | 16 | acrescentar has(merchant_key) nos 16 eventos |

Substituir somente esses cinco inventários pela composição completa proposta;
normalização de ordem dos inventários não é mudança de ordem da população.
Preservar integralmente proof, nodes, edges, predicates, selections, sets,
selected_nodes, required_selections, evidence_set_mode e demais campos do
grafo, além dos outros 75 grafos. Runtime, testes financeiros, contratos,
claims, snapshots e registries não são alterados por esta proposta.

Proof contém apenas 12 has(merchant_key) oriundos de suas exclusões; copiá-los
deixaria de fora o candidato positivo e os três excluídos por state. Os 16 has
propostos decorrem da avaliação da população, não da closure de proof.

## Trava anti-remendo e testes da classe

Esta proposta rebaixa a alegação de suficiência do inventário antigo e explicita
a abstração ausente: autoria composicional de uma população com referência
opcional e identidade transitiva. Não acrescenta if por fact_key/alias nem uma
tabela de exceções para compensar divergências observadas. O perfil é específico
à assinatura @1; não se alega um gerador universal de todas as métricas.

O helper exercita 24 modelos combinando populações de 0/1/2/7 membros,
ordens inversas e três variantes de aliases/IDs/presença. Inclui targets de
merchant diferentes e mesmo ID com outra versão, candidatos projected e fora
do mês. Obrigações de presença cobrem todos, não somente elegíveis. Alterar
expected/proof/seleções antigos não altera a composição. Há 144 negativos com
erro específico para evaluator ID/versão, time_basis, identidade ambígua,
relação ausente/duplicada e escalar incoerente. Esses modelos não executam a
seleção financeira nem representam grafos mutantes admitidos.

Checks locais documentais: syntax, --write-new e --check; igualdade do corpus
e pool originais; simulação em memória muda somente uma derivation, mantém
proof e demais campos de todos os 76 grafos. As fontes são comparadas em bytes
LF com a base Git, e blobs/digests/tamanhos ficam no JSON. --check recompõe a
proposta e esses checks; não executa suítes financeiras. A ampla de DIRECT-EVENT
não foi repetida nem é usada como aprovação desta futura aplicação.

## Gates obrigatórios depois do parecer documental

1. APTO DOCUMENTAL explícito para a suficiência das obrigações propostas,
   confrontado localmente. APTO somente do helper não basta. Falta de acesso
   direto à fonte original é lacuna a resolver, não aprovação presumida.
2. RED causal no corpus original; controles rejeitam inventário antigo e trace
   sem has/get/aresta/id do merchant. Expected congelado antes da execução.
3. Propriedades e kernels variam presença, chaves, versões, aliases, população,
   estados e datas. Alterar pessoa/categoria/valor coerentemente não altera a
   seleção de similar_event_ids. Separar kernel de mutante admitido.
4. Aplicação exata; comparação integral com a base reconstrói o corpus mudando
   só os cinco inventários autorizados. Preservação de fontes protegidas.
5. Focais, afetados, uma ampla final com candidato estável, publicação sanitizada
   e auditoria independente do código/aplicação. Não repetir ampla verde sem
   mudança causal e não promover sonda diagnóstica a gate de aceitação.

Condição de parada: qualquer nova necessidade causal fora desse perfil/delta,
mudança de runtime ou contrato, ou achado independente impeditivo exige rever
a decisão; não ajustar expected para coincidir com actual.

## Fontes exatas para revisão

- `docs/audit-evidence/n02g-causal-authoring-profile/similar-event-proposal.json`
- `docs/audit-evidence/n02g-causal-authoring-profile/prepare-similar-event-proposal.cjs`
- `docs/contracts/next/provenance-v2/graphs-v2.json` — objeto original M-16#1#2
- `docs/contracts/next/provenance-v2/claims-v2.json` — claim-M-16#1#2
- `docs/contracts/next/provenance-v2/evaluator-contracts/similar_event_ids.json`
- `docs/contracts/next/provenance-v2/metric-evaluator-registry-v1.json` — @1
- `docs/contracts/next/provenance-v2/graph-binding-contract-v1.md` — seção 4
- `docs/contracts/next/provenance-v2/material-field-registry-v1.json`
- `docs/contracts/next/provenance-v2/evidence-snapshot.schema.json`
- `docs/contracts/next/provenance-v2/snapshot-manifest-v1.json`
- `src/next/provenance/metricDirectReads.js` — similar_event_ids
- `src/next/provenance/metricReferences.js` — identidade e readReference
- `tests/next/provenance/metricDirectReads.cases.js` — DIRECT-REFERENCE-002

O corpus grande pode exigir visualização Git auxiliar somente de formatação,
com pai exato do candidato e igualdade integral verificada. Essa branch não
deve ser integrada. Extrato do autor não substitui fonte original independente.

Sem GO global N02-G/NEXT-02, NEXT-03, deploy, produção ou dados reais.
