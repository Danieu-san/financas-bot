# Recorte causal — referência civil independente de paths

Base publicada c3365152ee307c1ff1adb68616bb9ad0dbf95eaa, APTO focal de diagnóstico;
produto original e matriz histórica preservados. Não é nova autoridade normativa.

## Causa e contrato ausente

pathSemanticReference possui domínio independente declarado, mas o selo exige
sempre dois argumentos. O registry v2 já define relações civis de3/4/5operandos.
Histórico tem6day_of_month/2civil_offset/2month_bounds pendentes; esses números
selecionam investigação, não constituem cardinalidade executada ou PASS.
Referência seguirá a semântica declarada no operator-registry-v2 e ADR temporal
N02-F: calendário proleptic_gregorian, datas0001..9999, sem coerção/clamp/Date.

## Solução composicional e limites

Declarar aridade junto da função de cada operação da referência. Acrescentar
as quatro relações civis sem timezone: civil_offset_matches,month_bounds_match,
day_of_month_matches,inclusive_day_count_matches. Resolver por claim/snapshots
primários frozen, antes de IR/observação D/P. Comparar datas de destino válidas
por ordinal independente e diferença de meses/dia preservado, sem importar
civilCalendar,scalarProofCore,evaluator,compiler ou proof runtime para expected.
Não resolver period_ref/period_bound/derivados por inferência; referências não
cobertas continuam unavailable. civil_date_matches depende da autoridade
timezone e fica explicitamente fora deste recorte.

Nenhuma alteração de runtime, registry, schema, autoria, oracle, trace, IDs,
exceção contrafactual ou seleção. Falta de alternativa/discriminante/referência
mantém UNSAT. Entrada proxy/accessor/extra/shape inválido não executa efeito nem
ganha crédito. Export puro de referência não cunha capability financeira.

## Escada de evidência e saída

RED/focais orientados a propriedades: todos meses nos limites/anos bissextos,
offset civil day/month positivo/negativo, sem clamp, overflow, calendário errado,
data inválida, safe integer, -0, ranges inclusivos, proxy/accessor sem efeitos.
Integração selo em candidates reais authored com aridade3; available não é
matched. Revisão adversarial e afetados antes de ampla final única e auditoria
por novo hash. Focal D/P pode permanecer UNSAT por outra barreira; nunca PASS
por admissão ou rejeição precoce. Não repetir famílias verdes ou matriz completa.
Sem GO G11/N02-G/NEXT-02/NEXT-03/deploy/produção/dados reais/receipt/validated_parent.
