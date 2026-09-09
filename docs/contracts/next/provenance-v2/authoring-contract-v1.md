# Provenance v2 — contrato de preparação N02-F

Estado: RASCUNHO DE AUTORIA; NÃO É REGISTRY EXECUTÁVEL NEM GATE APROVADO.
Data: 2026-09-09. Autoridade superior: desenho NEXT-00 ratificado e CP-02.

## 1. Fronteiras de artefatos

| Artefato a preparar | Conteúdo | Não confundir com |
|---|---|---|
| Schema de claim | tipos e obrigatoriedade de identidade, semântica e referências | resultado esperado pelo oracle |
| Schema de grafo | nós, predicados, arestas e trace_contract | trace observado |
| Material field registry | classificação de cada campo por kind | lista seletiva dos campos que os testes atuais leem |
| Operator registry | assinaturas/semântica dos operadores genéricos aprovados | fórmula de cada métrica |
| Metric evaluator registry | resolução canônica de contrato, closure e operand roles | hashes repetidos no claim ou no freeze |
| Grafos revisados | binding causal de cada fact_key | cópia das evidence_refs v1 |
| Rastreabilidade de autoria | fontes semânticas e estado de revisão por grafo | prova de execução ou aprovação independente |

Um arquivo futuro não deve ser chamado de congelado/medido apenas porque
possui campos com esses nomes. Os roots executáveis só podem ser fixados com
os respectivos bytes existentes. Nesta preparação, ausência de executável é
uma pendência explícita que impede execução; não uma exceção ao hash exigido.
A proposta em `type-and-identity-contract-v2.md` e no schema de registry
separa authoring não executável de execution. Ela continua sujeita à auditoria;
não permite `null`, zero ou placeholder como comprovação de execução.

## 2. Inventário de partida conferido

Fonte: `tests/fixtures/financasbot-next/golden-fact-contracts-v1.json`.
Inspeção mecânica na base N02-F: 76 fact_keys únicos, 39 métricas e 27 refs
distintas. As unidades existentes são `BRL_minor`, `count`, `entity_ids` e
`state`. Isso orienta tipos de resultado; não prova completude dos grafos.

Os períodos incluem datas, mês, intervalos, as_of, through e statement_due.
Os sujeitos incluem composição de família/pessoa/categoria, orçamento/pessoa,
par de transferência, agenda, fonte e execução de turno. Separar delimitadores
de strings não basta: o autor deve conferir o significado no diálogo e na
fixture. Não interpretar essas strings como autoridade em runtime.

O inventário usa o contrato semântico v1, não os valores do oracle. Os 76
grafos ainda não foram autorados ou revisados nesta abertura.

Catálogo observado em `golden-financial-fixture-v1.json` (união dos campos
presentes, não schema deduzido nem registry completo):

| Coleção | Objetos | Campos observados |
|---|---:|---|
| families | 2 | id, label, members |
| people | 3 | family_id, id, label |
| accounts | 3 | id, label, opening_balance_as_of, opening_balance_minor, owner_id, type |
| cards | 3 | closing_day, due_day, id, label, owner_id |
| categories | 12 | budget_class, id, kind, label |
| events | 16 | account_id, amount_minor, card_id, category_id, compensates, date, id, installment_number, installment_plan, installment_total, merchant_key, person_id, settles_card_id, state, transfer_pair |
| budgets | 2 | category_id, evidence_state, family_id, id, limit_minor, period, source |
| bills | 1 | amount_minor, due_date, evidence_state, id, person_id, source, status |
| source_states | 4 | category_id, coverage, entity_id, event_count, id, period, source |
| proposals | 3 | expires_at, id, source_version, state |
| reminders | 0 | não observável nesta fixture |
| calendar_events | 0 | não observável nesta fixture |
| side_effects | 0 | não observável nesta fixture |
| merchant_rules | 1 | application, category_id, evidence_state, id, merchant_key, reversible, source |

Consequências para a autoria: coleções vazias não provam ausência de campos ou
de obrigações; `statement_id` não aparece nos eventos e não pode ser inventado
para provar correspondência de fatura; versões dos snapshots precisam de
representação explícita, pois nem todo registro possui `version`. Campos `source`
e IDs de vínculo precisam de tipos/semântica conferidos, não inferidos pelo nome.
Não classificar `label` como non_material sem conferir se alguma operação o
usa causalmente. Este catálogo preserva a evidência de partida e não autoriza
adicionar os campos faltantes à fixture v1.

## 3. Catálogo obrigatório do claim

| Campo/conceito | Autoridade e requisito de autoria |
|---|---|
| claim_id interno | identidade no escopo definido pelo contrato; distinto de fact_key e evidence ref; ausência/colisão/misbinding precisam ser recusados |
| fact_key | identidade do fato no corpus; não é identidade pública nem identidade de execução |
| metric | operação revisada da pergunta, resolvida para evaluator_ref |
| unit | tipo/unidade compatível com assinatura funcional e expectativa revisada |
| subject | união tipada com campos explícitos por kind; sem parsing de delimitador em runtime |
| period | união tipada com limites e inclusividade explícitos por kind |
| time_basis | lente explicitamente relacionada aos campos temporais da evidência |
| coverage / evidence_state | ligados ao mesmo claim, fontes e conjuntos; presença não prova completude |
| evaluator_ref | somente id/version; hashes e roles normativos resolvidos no registry |
| operand_bindings | referências aos roles do registry e aos aliases locais; não redefine role |
| vínculo ao resultado | resultado funcional R validado separadamente e associado ao claim correto; não inserido no trace |
| vínculo à evidência | conjunto exato dos nós de valor e prova, incluindo arestas materiais |

A política proposta de escopo/binding do claim_id está em
`type-and-identity-contract-v2.md` e ainda precisa ser revisada. Não usar
automaticamente fact_key, hash estável público ou sequência global como solução.
Claims derivados preservam a identidade ratificada
`(fact_key, evaluator_version, result_hash)` e ancestry dos pais; esse requisito
não elimina claim_id nem permite trocar a ordem dos operandos.

## 4. Envelope público separado

`ClaimEnvelope` é projeção minimizada de um claim já validado, com identidade
efêmera limitada ao request. Não expõe fact_key, IDs internos, roots estáveis,
row/source IDs ou provenance privada. Labels/ref efêmeras não são prova de
ownership: autorização e binding antecedem a projeção.

A futura especificação deve definir separadamente: identidade interna,
identidade pública efêmera, escopo de unicidade, tabela interna de binding e
recusa de referência fora do request. Não copiar o shape atual de
`typedEvidenceVerifier` como se ele validasse `entity.label` público: hoje exige
`entity.ref`. Nenhuma implementação desse mapeamento faz parte desta abertura.

## 5. Requisitos do grafo e dos canais

Cada nó terá kind/ref/version/fingerprint, alias e papéis de evidência. Cada
campo permitido deve ser identity, dimension, edge ou non_material justificado.
Campo desconhecido/não classificado falha; non_material fica inacessível aos
evaluators. Toda aresta presente gera obrigação, mesmo protegida por hash.

As onze obrigações da seção 7 do desenho e os átomos da seção 10 são conjuntos
distintos; o schema deve mapear ambos sem perder granularidade. Não há
not_applicable livre ou grupo atômico para evitar witness ortogonal.

E permanece arestas. R é resultado funcional. I são eventos instrumentados.
M são medições do loader. L é estado exclusivo do recorder. T são projeções de
L por phase. O grafo contém trace_contract, não trace autodeclarado. Nem R nem
seus intermediários pertencem a L/T. Prova de valor e prova causal são exigidas
simultaneamente e continuam separadas.

## 6. Evidência de autoria exigida por fato

Para cada fact_key, registrar a pergunta/contrato de origem, sujeito/período
tipados, fontes da fixture, relações semânticas, evaluator_ref, bindings,
obrigações e requisitos de leitura/estrutura/arestas. Referenciar a revisão
independente somente depois de recebida. Grafo autorado não é grafo aprovado.

Se o mundo sintético não sustentar uma relação, registrar pendência com a
evidência que falta. Não inferir statement_id de card_id nem fabricar coverage
complete a partir de lista vazia. Nenhum fato pode desaparecer por ser de
domínio futuro ou por não ter witness imediato.

## 7. Próximas entregas, ainda ausentes

1. Material registry completo por kind, incluindo campos de coleções vazias.
2. Revisão das propostas de identidade e de executáveis futuros já escritas.
3. Schema de grafo e registries completos; os dois schemas iniciais de claim e
   metric evaluator registry já existem como rascunhos, não como entrega final.
4. Grafos autorados e revisados 76/76, sem geração a partir do oracle.
5. Revisão independente integral antes do compiler/evaluator.

Este documento é preparação rastreável, não alegação de fechamento de G07,
G08, G11 ou G14 e não autoriza execução antecipada.
