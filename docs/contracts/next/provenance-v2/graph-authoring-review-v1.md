# Revisão de autoria dos 76 grafos — N02-F

Estado: CANDIDATO DOCUMENTAL CORRIGIDO; REAUDITORIA FOCAL PENDENTE.
Data: 2026-09-10. Nenhuma execução do motor de provenance.

As evidências abaixo registram o candidato ef04368 e a autoria original.
O parecer integral posterior confirmou H-01/H-02/M-01. A correção, seus checks
atualizados e o limite de aprovação estão em n02f-correction-review-v1.md.
O registry v2 e required_selections são propostas corrigidas em reauditoria.

## Fontes e método

Os grafos foram autorados a partir dos descriptors de golden-fact-contracts-v1,
dos diálogos em golden-conversation-set-v1 e dos registros sintéticos da fixture
congelada. O value oracle não foi usado para gerar relações, seleções ou hashes.
Os contratos funcionais referem o comportamento existente do validador v1;
diferenças históricas permanecem explícitas. Não há código novo em src/scripts.

Os templates reutilizam conjunções genéricas de igualdade e período, sem nome
de métrica, loop ou código. current_member_field_parameter é uma referência
tipada ao membro quantificado por all_match/none_match, não um callback.
O hash de cada template é canonicalValue/digest do objeto integral da entrada.
A expansão deve ser visível na futura IR; templates não dispensam predicados.

Cada grafo declara população candidata, seleção e uma razão comprovada para
cada excluído. candidate_set deve ser a união disjunta e exata de selected_set
e excluded.node. Não basta contar elementos; IDs, tipos e predicados precisam
coincidir. selected_predicates devem provar todos os critérios aplicáveis do
contrato funcional; excluded.predicates demonstram pelo menos um critério
violado. A correção semântica dessa relação faz parte da auditoria deste pacote.

presence observa existência de campo opcional conhecido pelo schema e entrega
boolean ao operador eq. Não lê campo desconhecido nem converte ausência em
null. Excluir registro por campo ausente exige observação has no proof trace.
A seleção de eventos usa categoria efetiva do alvo quando há compensates;
a prova mantém a aresta e compara titular/instrumento e sinais.

O fechamento de arestas expande os targets materiais dos nós necessários,
incluindo membership de família/coleção. Por isso há nós de prova fora da
seleção financeira. Sua necessidade decorre de identidade, coverage ou links,
e não de contribuição ao resultado. Fingerprints observam todos os campos
materiais na fase proof; leituras do cálculo foram reduzidas aos campos
previstos pelos contratos funcionais. O futuro candidato executável terá de
produzir exatamente esses acessos instrumentados ou voltar à revisão do
contrato; não pode inserir leituras artificiais só para satisfazer contagem.

## Casos causais especialmente confrontados

- S-12: saldo zero depende do saldo inicial, corte temporal e exclusão de todos
  os eventos; coleção vazia não é presumida.
- S-13/M-09/N-04: event_count zero da fonte é confrontado com seleção vazia por
  categoria, estado, período e sujeito; contagem da fonte sozinha não prova zero.
- M-01: ranking/diferença apontam para M-01#1#1 e M-01#1#2 já validados; roles
  left/right, chave/direção e desempate são explícitos.
- M-04/N-07: transferência mantém duas pontas, sinais opostos, magnitudes
  iguais, pessoa igual e contas diferentes.
- M-05/N-08: pagamento aponta para cartão e seu titular, sem inventar vínculo
  de fatura; unproven permanece distinto de inexistência de pagamento.
- M-06/F-06: estorno mantém compra-alvo e categoria herdada; bruto, refund e
  líquido continuam resultados diferentes.
- M-08: membro sem consumo é provado por exclusões; limite familiar não é
  convertido em limite pessoal.
- M-13: janelas de consumo/futuro são distintas e relacionadas ao clock,
  orçamento e policy; cardinalidade civil e floor preservam o corpus de 15 dias.
- M-14: income_minus_open_bills usa dois pais de unidades compatíveis e mantém
  mixed_declared/estimated.
- M-15/M-16: coleções de lembretes, agenda e efeitos vazias têm snapshots
  tipados, membership integral e turno/pessoa ligados; não provam produção.

## Rastreabilidade por fato

| fact_key | métrica | nós | candidatos | selecionados | excluídos | pais |
|---|---|---:|---:|---:|---:|---|
| S-01#1#1 | consumption_total | 43 | 16 | 9 | 7 | — |
| S-02#1#1 | consumption_total | 43 | 16 | 5 | 11 | — |
| S-03#1#1 | category_consumption | 43 | 16 | 1 | 15 | — |
| S-04#1#1 | movement_ids | 40 | 16 | 5 | 11 | — |
| S-05#1#1 | statement_total | 42 | 16 | 2 | 14 | — |
| S-06#1#1 | account_balance | 40 | 16 | 5 | 11 | — |
| S-07#1#1 | owned_cards | 8 | 3 | 2 | 1 | — |
| S-08#1#1 | consumption_effect | 21 | 2 | 2 | 0 | — |
| S-09#1#1 | consumption_effect | 19 | 1 | 1 | 0 | — |
| S-10#1#1 | net_consumption | 19 | 2 | 2 | 0 | — |
| S-11#1#1 | installments_realized | 40 | 16 | 1 | 15 | — |
| S-11#1#2 | installments_projected | 40 | 16 | 2 | 14 | — |
| S-11#1#3 | installments_projected_amount | 40 | 16 | 2 | 14 | — |
| S-12#1#1 | account_balance | 40 | 16 | 0 | 16 | — |
| S-13#1#1 | eligible_event_count | 43 | 16 | 0 | 16 | — |
| S-16#1#1 | source_coverage | 13 | 4 | 1 | 3 | — |
| M-01#1#1 | consumption_total | 43 | 16 | 5 | 11 | — |
| M-01#1#2 | consumption_total | 43 | 16 | 4 | 12 | — |
| M-01#1#3 | ranking_winner | 7 | 0 | 0 | 0 | M-01#1#1, M-01#1#2 |
| M-01#1#4 | consumption_difference | 6 | 0 | 0 | 0 | M-01#1#1, M-01#1#2 |
| M-02#1#1 | consumption_by_instrument | 41 | 16 | 2 | 14 | — |
| M-02#1#2 | consumption_by_instrument | 41 | 16 | 3 | 13 | — |
| M-03#1#1 | budget_class_consumption | 43 | 16 | 6 | 10 | — |
| M-03#1#2 | budget_class_consumption | 43 | 16 | 3 | 13 | — |
| M-04#1#1 | balance_delta | 10 | 1 | 1 | 0 | — |
| M-04#1#2 | balance_delta | 10 | 1 | 1 | 0 | — |
| M-04#1#3 | consumption_effect | 21 | 2 | 2 | 0 | — |
| M-05#1#1 | statement_total | 42 | 16 | 2 | 14 | — |
| M-05#1#2 | invoice_payment_amount | 8 | 1 | 1 | 0 | — |
| M-05#1#3 | invoice_payment_target_card | 8 | 1 | 1 | 0 | — |
| M-05#1#4 | statement_payment_correspondence | 8 | 1 | 1 | 0 | — |
| M-05#1#5 | invoice_payment_consumption_effect | 19 | 1 | 1 | 0 | — |
| M-06#1#1 | gross_consumption | 18 | 1 | 1 | 0 | — |
| M-06#1#2 | refund_amount | 9 | 1 | 1 | 0 | — |
| M-06#1#3 | net_consumption | 19 | 2 | 2 | 0 | — |
| M-07#1#1 | consumption_total | 43 | 16 | 9 | 7 | — |
| M-07#1#2 | projected_installments | 42 | 16 | 2 | 14 | — |
| M-08#1#1 | category_spent | 43 | 16 | 0 | 16 | — |
| M-08#1#2 | category_budget_remaining | 43 | 16 | 0 | 16 | — |
| M-09#1#1 | eligible_event_count | 43 | 16 | 0 | 16 | — |
| M-12#1#1 | consumption_total | 43 | 16 | 9 | 7 | — |
| M-13#1#1 | category_spent | 43 | 16 | 1 | 15 | — |
| M-13#1#2 | category_budget_remaining | 43 | 16 | 1 | 15 | — |
| M-13#1#3 | safe_daily_pace | 44 | 16 | 1 | 15 | — |
| M-13#1#4 | category_spent | 43 | 16 | 1 | 15 | — |
| M-13#1#5 | category_budget_remaining | 43 | 16 | 1 | 15 | — |
| M-13#1#6 | safe_daily_pace | 44 | 16 | 1 | 15 | — |
| M-14#1#1 | income_realized | 41 | 16 | 1 | 15 | — |
| M-14#1#2 | bills_open | 7 | 1 | 1 | 0 | — |
| M-14#1#3 | income_minus_open_bills | 6 | 0 | 0 | 0 | M-14#1#1, M-14#1#2 |
| M-15#1#1 | due_bill_ids | 7 | 1 | 1 | 0 | — |
| M-15#1#2 | due_bills_total | 7 | 1 | 1 | 0 | — |
| M-15#1#3 | reminder_count | 5 | 0 | 0 | 0 | — |
| M-15#1#4 | calendar_event_count | 5 | 0 | 0 | 0 | — |
| M-16#1#1 | merchant_rule_ids | 6 | 1 | 1 | 0 | — |
| M-16#1#2 | similar_event_ids | 40 | 16 | 1 | 15 | — |
| M-16#1#3 | side_effect_count | 3 | 0 | 0 | 0 | — |
| F-01#1#1 | category_consumption | 43 | 16 | 1 | 15 | — |
| F-01#2#1 | category_consumption | 43 | 16 | 0 | 16 | — |
| F-02#1#1 | consumption_total | 43 | 16 | 5 | 11 | — |
| F-03#1#1 | consumption_by_instrument | 41 | 16 | 2 | 14 | — |
| F-03#2#1 | statement_total | 42 | 16 | 2 | 14 | — |
| F-04#1#1 | category_consumption | 43 | 16 | 1 | 15 | — |
| F-04#2#1 | category_budget_remaining | 43 | 16 | 1 | 15 | — |
| F-05#1#1 | category_consumption | 43 | 16 | 1 | 15 | — |
| F-05#2#1 | category_consumption | 43 | 16 | 1 | 15 | — |
| F-06#1#1 | gross_consumption | 18 | 1 | 1 | 0 | — |
| F-06#2#1 | refund_amount | 9 | 1 | 1 | 0 | — |
| F-06#2#2 | net_consumption | 19 | 2 | 2 | 0 | — |
| F-07#1#1 | installments_realized | 40 | 16 | 1 | 15 | — |
| F-07#1#2 | installments_realized_amount | 40 | 16 | 1 | 15 | — |
| F-07#2#1 | installments_projected | 40 | 16 | 2 | 14 | — |
| F-07#2#2 | installments_projected_amount | 40 | 16 | 2 | 14 | — |
| N-04#1#1 | eligible_event_count | 43 | 16 | 0 | 16 | — |
| N-07#1#1 | consumption_effect | 21 | 2 | 2 | 0 | — |
| N-08#1#1 | invoice_payment_consumption_effect | 19 | 1 | 1 | 0 | — |

## Evidência local e seus limites

- 76/76 grafos satisfizeram o schema estrutural, com resolução local das URNs.
- 76/76 claims satisfizeram schema e igualdade dos roles do registry.
- 39 contratos e 39 entradas do registry satisfizeram seus schemas.
- Referências de nós/arestas/predicados e partições foram conferidas em todos
  os grafos; 16.266 requisitos de leitura não apontam a campo desconhecido ou
  non_material. Esses checks são de autoria, não execução da fórmula.
- O inventário integral confrontou 4.422 arestas materiais com os payloads;
  1.047 comparações campo/literal foram confrontadas com os snapshots sem
  contradição. Os vínculos de sujeito, período, time_basis, coverage e estado
  do claim são predicados explícitos, não inferências do nome da métrica.
- Fingerprints foram calculados pela função aprovada canonicalValue/digest;
  hashes de documentos apontam a bytes UTF-8 existentes.
- Os 39 witnesses discriminantes são contratos de execução futura. Não foram
  contados como testes PASS nem como suíte completa de mutações.
- A suíte ampla funcional não foi repetida: todos os caminhos alterados são
  documentos/JSON de autoria. Workflow/diff e hashes devem passar no candidato.

## Fronteira da auditoria

Solicitar auditoria independente de schemas, registries, policy, manifest,
contratos, witnesses e dos 76 grafos, confrontando as fontes congeladas.
O auditor deve tentar quebrar especialmente: a derivação das janelas históricas
de statement/account balance/safe pace; a suficiência de cada partição; o uso
de pais validados no ranking/diferenças; e a separação entre estado dos inputs
e estado estimado do resultado. Um hash ou uma contagem correta não basta.
A aprovação documental não implementa nem libera automaticamente o motor.
Depois do parecer, corrigir achados causais confirmados no mesmo escopo;
somente após aprovação integral selecionar a fatia executável prevista.
NEXT-02 global permanece aberto; produção/deploy/dados reais permanecem fora
deste candidato.
