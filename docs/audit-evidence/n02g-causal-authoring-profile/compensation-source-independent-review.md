# Guarda de classe da fonte — APTO focal ratificado

2026-09-21 (UTC 2026-09-22).
Candidato: `0a8c5709a5234e95ddce212c0b571908dacf32bf`.
Pai: `3fc0f3d83ac5e418a802ca93f097b0c7459fface`.
Conversa única: https://chatgpt.com/g/g-p-6aae7fa3ad5c8191a8ace5a6d799fab4-financasbot/c/6ab1d067-5174-83e9-98da-64f841868f4c

## Parecer externo

APTO exclusivamente para a guarda de classe da fonte de compensação no
gerador e suporte de testes; nenhum achado crítico/alto/médio/baixo. Hash e
único pai confirmados. Foram examinados pedido, diff dos dez arquivos,
nextCausalAuthoring candidato/pai, causalAuthoring.cases e seus helpers,
metricSelection.cases/compensationFixture, runtime metricSelection como
referência preexistente, README candidato/pai, dois perfis JSON, evidência,
checker novo e recibo de reconciliação.

O revisor confirmou que a guarda aborta após as leituras da fonte e antes
do filtro, sem R/amount_minor nem remoção de observações no caminho válido.
O pai apenas excluía a contribuição incoerente. O teste muta a relação e o
campo material correspondentes, recompõe fingerprint e exige admissão antes
do erro específico. A expectativa é explícita, não fornecida pelo runtime.
Projected prova que a guarda antecede a exclusão financeira. O controle do
runtime preservado verifica traversal e ausência de leitura monetária.

Limites declarados: revisão estática, sem executar testes/gerador/runner/helper,
evaluator ou recorder; sem hashing independente dos blobs. Contagens e hashes
da evidência publicada não foram tratados como execução do Chat. Nenhuma
aprovação normativa, host/M/derivados, N02-G global, deploy ou produção.

## Confronto local

Ratificado apenas o recorte de 0a8c570. RED observado antes da correção;
dois focais PASS (24 mutações tipadas do gerador, oito controles do runtime),
108 afetados e ampla 2.365 PASS/0 FAIL/10 SKIP esperados. Quatro hashes
causais iguais antes/depois e nos blobs do índice publicado. Checker novo
PASS e seis relatórios preservados; runtime, grafos/claims e perfis JSON
intactos contra o pai. Inspeção da posição da guarda e dos testes concorda
com o parecer; não identificada contraevidência local ao recorte.

O extrato foi também comparado localmente aos seis objetos completos de
graphs/claims: igualdade confirmada. Isso não é conferência feita pelo Chat.
Não repetir ampla verde sem mudança causal. Próxima fronteira: decisão
documental independente sobre regra de autoria/delta dos seis grafos, antes
de qualquer aplicação; graph_accepted=false e releaseEligible=false.
