# População causal de budget_class — APTO DOCUMENTAL

2026-09-22. Candidato `d40c44dc4ee929bc607436c259a33746bfd4618d`, pai único
`1710b570007dde9ca94ed4f79d7afddfc9c3f81b`.
Conversa única: https://chatgpt.com/g/g-p-6aae7fa3ad5c8191a8ace5a6d799fab4-financasbot/c/6ab2e157-b274-83e9-9a6d-3c07247a5615

## Decisão

APTO DOCUMENTAL para a regra geral de autoria da população causal de budget_class
em budget_class_consumption@1 e exclusivamente as duas remoções propostas de
health_general/budget_class em derivation.required_reads de M-03#1#1 e #2.
Nenhum achado bloqueante/alto/médio. Não aplicar alterações fora desse delta.

Fundamento independente: contrato exige classe da categoria efetiva do evento,
compensation usa a categoria da compra; registry distingue events/population de
categories/evidence; binding §4 não exige leitura automática de todo alvo/campo.
O schema e o material registry deixam budget_class opcional em category. Não
foi localizada cláusula exigindo classificação de todo o catálogo.

O revisor confrontou os 16 eventos dos dois claims e o catálogo comum de 12
categorias: nenhum candidato usa health.general; a compensação aponta para
evt-restaurant-b/food.restaurant. A categoria health.general existe, mas não
pertence à união causal. Inventário propõe oito leituras de classe → sete em
cada grafo, preservando id/kind/nó e a leitura de classe em proof.

Confronto do código: createCategoryReader lê identidade/id/kind do catálogo;
budget_class é lido apenas da categoria efetiva dos candidatos econômicos,
antes da exclusão final por estado/data/família/filtro. A regra proposta inclui
esses excluídos e não depende do selected_set, R, actual, trace ou oracle.
Helper deriva a união antes de compará-la com obrigações atuais; não a aplica.

## Fontes e limites

Leu commit/pai, proposta/inventário/helper, contrato budget_class_consumption,
registry, binding, claims-v2, snapshot manifest, material registry, schemas,
metricSelection e referência validateFinancasBotNextFacts. Não recuperou
graphs-v2 completo pelo acesso web; não executou helper, evaluator, compiler,
recorder, testes ou suíte; não recomputou hashes/fingerprints e não aplicou delta.
Portanto, não declarar verificação independente integral dos 76 grafos ou dos
bytes. O parecer é documental e focal, não auditoria da futura aplicação.

## Confronto local e próxima ação

Helper --write-new/--check PASS local; 11 fontes iguais aos blobs LF da base;
duas remoções, zero adições propostas, sem alteração em runtime/grafos/testes.
Fontes locais confirmam o fundamento e a ausência de relações para a categoria.
Ratificado somente o desenho e o delta fechado, com todas as travas da proposta:
propriedades sob renomeação/permutação e referências efetivas, RED, igualdade
integral dos 76 grafos, controles de seleção/R/trace, afetados, uma ampla final,
commit sanitizado e nova auditoria independente da aplicação.

Sem GO de implementação, grafo/proof/host, N02-G global, deploy ou produção.
graph_accepted/releaseEligible permanecem falsos. A ampla de evidence_state não
valida uma aplicação normativa posterior; não executá-la de novo sem alteração.
