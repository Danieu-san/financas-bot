# ADR N02-F — relações civis e seleção observada

Estado: PROPOSTA DOCUMENTAL; aprovação independente pendente.
Base auditada: ef04368c95af33a12c0e8b5b286c0e0b01ae27f8.
NEXT-00 §8 exige versão, ADR, propriedades e auditoria para novo operador.
Este documento não modifica a ratificação v1.

## Decisão

Preservar os 27 operadores v1 e propor registry v2 com cinco relações civis
booleanas genéricas e referências tipadas a janelas nomeadas. Nenhum operador
conhece métrica, fact_key, fixture ou fórmula financeira.

Repetir literais ou confiar somente no hash do evaluator futuro deixa a
inconsistência de autoria sem prova relacional. Operador financeiro por métrica
duplicaria a autoridade de cálculo. As cinco relações abaixo cobrem o problema
sem linguagem de expressões executáveis.

## Janelas e tipos

windows é mapa local de nomes para range ou month. Range tem start/end como
scalarBinding e flags booleanos de inclusão; month tem value como scalarBinding.
scalarBinding aceita exclusivamente field, claim ou literal tipado. Não aceita
chamada, expressão, outra janela ou ciclo.

period_ref resolve a janela; period_bound extrai start/end de um range com tipo
date. Nome ausente, limite inexistente, tipo incompatível, data inválida ou
start > end falha fechado. Datas civis usam anos 0001..9999.
Leituras de field/claim são instrumentadas em cada fase que as utiliza.
Seleção e exclusão compartilham o mesmo period_ref, sem caches independentes.
Limite literal derivável de evidência precisa de relação que o ligue à fonte;
schema e fingerprint não substituem a revisão da suficiência dessa relação.

## Relações v2

Todos retornam boolean; tipo/valor inválido causa violação estrutural.
Calendário permitido: proleptic_gregorian. Sem coerção, fallback ou relógio
implícito. Não contar dias civis por duração em milissegundos.

| Operador | Semântica exata |
|---|---|
| civil_date_matches(instant, date, timezone, calendar) | A data civil do instante com offset, convertida no timezone explícito, é exatamente date. |
| civil_offset_matches(origin, offset, unit, target, calendar) | target é origin mais offset inteiro seguro em day ou month. Em month preservar o dia; destino inexistente/overflow falha, sem clamp. |
| month_bounds_match(month, start, end, calendar) | start/end são primeiro/último dia civil do mês/ano informado. |
| day_of_month_matches(date, day, calendar) | date existe e seu número de dia é day, inteiro 1..31. |
| inclusive_day_count_matches(range, count, calendar) | Range não vazio e inclusivo em ambas as pontas; count positivo é a cardinalidade exata de datas civis. |

Timezone deve resolver na policy registrada. A implementação futura de
civil_date_matches precisa congelar dados/regras de timezone no closure/
ambiente declarado; não usar timezone do processo. A fixture usa
America/Sao_Paulo. Os outros operadores recebem datas civis já tipadas.

## Aplicação

Account balance: selection_window = [account.opening_balance_as_of,
claim.period.value]. O saldo inicial é anterior aos movimentos da primeira
data civil; ambos os limites são inclusivos. Início/fim resolvem diretamente
as autoridades, conforme convenção explícita do contrato funcional.

Statement total: selection_window = (previous_close, current_close]. Provar
dia do fechamento, mês/ano da data statement_due, dia do vencimento e diferença
exata de um mês entre fechamentos. Preservar a convenção histórica v1 de
fechamento no mesmo mês do vencimento e as duas lentes time_basis revisadas;
não generalizar regras bancárias futuras.

Safe daily pace: selection_window começa no primeiro dia de budget.period e
termina em policy.daily_pace_as_of; remaining_window usa start/end da policy.
Provar corte = data civil do clock; start = corte + 1 dia; end = último dia do
mês do orçamento; corte/início futuro contidos no mês; divisor = cardinalidade
inclusiva; claim.period = remaining_window, inclusive flags. O descriptor
histórico de 15 dias precisa coincidir com a cardinalidade provada.
floor é configuração funcional. Inputs confirmed e output estimated são
distintos; nenhum estado do output justifica exclusão de evento.

## Seleção observada

required_nodes conserva nós examinados para cálculo, fingerprint, exclusão,
coverage ou vínculos. Não criar examined_nodes como segunda lista equivalente.
required_selections enumera pares candidate_set/selected_set e coincide
exatamente com selections do grafo. selected_nodes é a união exata dos sets
selecionados dessas operações e subconjunto de required_nodes.

O recorder observa seleção real por fase; não copia selected_nodes autorado
nem transforma leitura em seleção. S-12#1#1 examina 40 nós e seleciona zero.
Pais derivados consumidos diretamente permanecem em reads/required_nodes,
sem selected_nodes quando não há operação de seleção.

selection.input_evidence_state é requisito funcional da entrada: cada inclusão
prova esse estado e exclusão por estado prova sua violação. Os predicados devem
coincidir com esse requisito, independente de claim.evidence_state. Nos dois
safe_daily_pace, confirmed é obrigatório na entrada e estimated no resultado.

## Limites e validação

temporal-and-selection-witnesses-v1.json especifica discriminantes futuros
authoring/not_executed. Checks locais de datas/documentos não são execução do
motor. Os 76 grafos adotam seleção explícita; sete têm janelas relacionadas.
Claims, fixture, oracle e snapshots permanecem iguais. Admissão do registry v2
exige reauditoria do contrato; nenhum compiler/evaluator é autorizado aqui.
