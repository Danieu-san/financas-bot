# owned_cards — revisão independente da aplicação

Candidato: `76b11d3eb56439169d966c58703b0d1506550806`.
Pai único: `f7eeb4d89eac5671048b8b5d0ae2f17dac0325fb`.
Uma solicitação em conversa limpa, resposta completa recuperada:
https://chatgpt.com/g/g-p-6aae7fa3ad5c8191a8ace5a6d799fab4-financasbot/c/6ab48006-bd5c-83e9-bca0-25920b832eda

## Veredito e fontes

APTO FOCAL. Sem achado crítico, alto, médio ou baixo no recorte da aplicação.
Não é GO global N02-G, aceitação de grafo/host ou autorização de produção.

Auditor confirmou candidato, único pai e seis arquivos alterados. Leu o diff
do checkpoint, owned-cards-validation.json, prepare-owned-cards-validation.cjs,
as linhas ORIGINAL e NOVA de S-07#1#1 no patch nativo de graphs-v2.json,
authoringIndex.cases.js e metricDirectReads.cases.js. Confrontou no mesmo hash
proposta, recibo documental/source-access, plano, metricDirectReads.js,
metricReferences.js, contrato owned_cards, binding contract, claim,
snapshots pertinentes e entrada owned_cards@1 do registry.

O raw integral de graphs-v2.json excedeu o renderizador; o patch forneceu
o objeto completo antes/depois e o conjunto de alterações, não apenas um
extrato do helper. Auditor não executou as suítes, helper, evaluator ou
validação integral local. O parecer é revisão estática de fontes imutáveis;
registros locais de execução não foram apresentados como execução externa.

## Fundamentos e confronto

- Somente person_b e person_b/id adicionados à derivation de S-07#1#1;
  proof, seleção, arestas, claim reads, estruturas e demais campos preservados.
- Runtime inalterado percorre todos os cartões e compara ref+version do dono;
  identificar o dono do cartão excluído é causal antes da exclusão.
- Regra de autoria por evaluator ID+versão, role cards, relação owner_id e
  identidade de snapshot; aliases são identificadores locais, não critério.
- Expected congelado antes da execução. Inventário histórico e trace sem ID
  do dono excluído falham; oracle apenas confere R posteriormente. family_id
  não é consumido e person_b não é promovido a cartão selecionado.
- Modelos variam aliases, população, donos, ordem e versões; kernel exclui
  cartão cujo dono tem mesmo ID e outra versão, observando seu ID. Casos
  sintéticos/kernel não são grafos mutantes admitidos.
- TRACE-COMPAT-001 restaura owned_cards antes de compor baseline instrument;
  mantém 148 removidos/18 retidos e exige somente S-07#1#1/derivation/e0002
  fora de edge_only. Demais diagnósticos comparados por igualdade.
- --check reutiliza registros salvos, confere hashes/arquivos/reconstrução
  atual e compara evidência; não reexecuta suítes.

Confronto Codex: Git/pai conferidos; helper --check PASS após publicação e
novamente na ratificação; três arquivos causais nos hashes testados. Corpus
integral = pai mais exatamente um nó/um read, outros 75 grafos/todos os demais
campos e dez fontes protegidas intactos. Nenhuma ampla repetida.
Evidência local: RED inicial 3 FAIL/1 PASS (inclui erro de role do harness),
RED v2 2 FAIL/2 PASS; GREEN inicial 4 PASS; afetados iniciais 218 PASS/1 FAIL
(pin histórico); focais finais 5 PASS; afetados finais 219 PASS; ampla
2.388 PASS/0 FAIL/10 SKIP, candidate_unchanged=true, valid=true.

Sonda separada no candidato, tracked limpo: 73 seleções preservadas; apenas
S-07#1#1 passou de divergente a correspondente. Total 49 -> 50 correspondências,
23 divergências e três derivados não exercitados. Não é porcentagem/aceitação.

Parecer confrontado e ratificado: correção owned_cards encerrada focalmente.
Próxima ação única: diagnóstico causal de consumption_effect para transferências
(S-08#1#1, M-04#1#3 e N-07#1#1), antes de qualquer alteração normativa/runtime.
Não incorporar a branch auxiliar de formatação; não ampliar escopo ou produção.
