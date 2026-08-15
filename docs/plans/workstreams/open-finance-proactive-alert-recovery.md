# Plano - Gate 42 recuperacao dos alertas proativos

## Estado

`GATE 42 PROMOVIDO; GATE 43 CORRIGIDO AGUARDA NOVA AUDITORIA`.

## Criterios de fechamento

1. O segundo ciclo com a mesma revisao nao renova sua retencao nem falha.
2. Correcao isolada de data so atualiza proposta nunca transportada.
3. Qualquer outro campo causal ou evidencia de transporte continua fail-closed.
4. O clone do estado real conclui `GO` com `financial_writes=0`.
5. Testes focais, causais e uma suite ampla ficam verdes.
6. Auditoria independente por hash nao encontra lacuna indispensavel.
7. Deploy OCI preserva estado e o smoke confirma lote numerado familiar unico.

## Depois do Gate 42

Comparar os dashboards V1/V2, escolher o canonico, validar sua verdade contra
Pluggy e planilha, remover o check diario das 09:05 e revisar o limite mensal e
as categorias consideradas.
