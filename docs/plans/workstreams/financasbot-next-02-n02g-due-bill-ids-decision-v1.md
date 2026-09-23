# N02-G — separar IDs de contas e soma monetária

PROPOSTA DOCUMENTAL NÃO APLICADA.
Base: adc9cfcec1108c056fb2dd6f974c6f1ccd52d89c.
Recorte: due_bill_ids@1, M-15#1#1.

## Fundamento contratual

due_bill_ids retorna IDs das contas open da pessoa no intervalo inclusivo de
due_date, preservando a ordem. due_bills_total soma amount_minor das mesmas
contas elegíveis. O primeiro não depende do valor monetário para selecionar
nem projetar IDs; o segundo depende. Isso consta nos dois evaluator contracts,
na referência histórica validateFinancasBotNextFacts.mjs e no runtime atual
metricDirectReads.js: após selecionar, o ramo IDs retorna selectedIds antes
do laço de soma. selectedIds lê id, não amount_minor.

O binding contract exige leituras causais exatas por fase, não toda dimensão
material de um nó. Validade de amount_minor no snapshot/proof não cria uma
leitura derivacional. Não adicionar get artificial ao cálculo para satisfazer
um inventário excessivo, nem remover validação de admissão/proof.

## Regra e delta fechado

Despachar somente due_bill_ids@1; resolver a população pelo role bills
(node_set), cada bill por kind/ref_id/version e payload.id/fingerprint declarado.
Pela semântica desse contrato, amount_minor não integra as leituras de
derivation dos bills, independentemente de alias, fact_key, valor monetário,
população selecionada ou trace. O inventário compara essa regra com a autoria
existente para propor remoções; não consulta actual, oracle ou seleção observada.

Delta neste corpus: remover exatamente
{node: bill_rent_b, segments: [amount_minor]} de derivation.required_reads em
M-15#1#1. Preservar o mesmo campo em proof, os demais reads e todos os demais
campos do grafo. Preservar integralmente os outros 75 grafos, inclusive
M-15#1#2/due_bills_total. Runtime, claims, snapshots, contratos e registries
intactos. Isto não é uma regra geral de apagar amount_minor em outras métricas.

## Evidência e validação futura

Inventário/helper due-bill-ids-proposal conferem fontes contra blobs da base e
identidade declarada, sem executar evaluator nem validar todos os fingerprints
semânticos. A fonte financeira sintética completa mantém sua validação própria.

Após revisão: RED causal; remoção mínima; comparação integral com a base;
autoria sob aliases, versões, valores e populações variadas, com dispatch
negativo de outra versão/métrica; integração admitida com expected congelado
antes da execução e seleção/R preservados. Controle deve rejeitar reintrodução
da obrigação monetária na fase e demonstrar ausência de get amount_minor.
Kernel deve mostrar IDs invariantes quando valores válidos mudam, enquanto
due_bills_total muda conforme os valores; manter exclusão por pessoa/status/data.
Casos kernel/modelos sintéticos não equivalem a grafos mutantes admitidos.
Compor pins históricos explicitamente. Afetados e uma ampla estável, depois
auditoria de código. Sem GO de grafo/host/N02-G global/produção.
