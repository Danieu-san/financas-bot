# N02-F — checkpoint documental

Data: 2026-09-10. Estado: CANDIDATO CORRIGIDO; REAUDITORIA FOCAL PENDENTE.
Base: `ee5a0161f0c24a1c9a6a3c95a04e9da1eec4e91d`.
Branch: `codex/financasbot-n02f-provenance-20260909`.
Worktree: `.codex-worktrees/financasbot-n02f-provenance`.
Plano: `../../plans/workstreams/financasbot-next-02-n02f-v1.md`.
Contrato de preparação: `../../contracts/next/provenance-v2/authoring-contract-v1.md`.

CP-02 aprovado em b624b3d, recibo publicado na base. Continuidade autorizada
por Daniel; nenhum uso de produção, dados reais ou slot GitHub antigo.

Preparado: escopo/ordem N02-F e catálogo obrigatório de claim/grafo/canais.
Conferidos no contrato v1: 76 fact_keys únicos, 39 métricas, 27 refs distintas,
quatro unidades e formas de sujeito/período. Catálogo de campos observados das
14 coleções da fixture registrado; três coleções vazias exigem confronto com
contratos, não inferência automática de schema. Nenhum grafo gerado do oracle.

Preparados também: schema fechado de claim de autoria, schema de metric
evaluator registry com estágios authoring/execution e proposta de identidade/
binding interno e público. Vinte checks estruturais em memória passaram;
não provam unicidade global, hash real, invocação, egress ou runtime.
Preparados agora: material field registry (22 kinds, 102 campos de payload,
cinco labels non_material, 14 origins primárias), operator registry com os
27 operadores aprovados e semântica declarativa. Quatorze checks de inventário/
descriptors em memória passaram; não provam execução ou causalidade dos grafos.
Preparados na continuação: snapshot schema por 22 kinds, graph schema,
contrato de binding/hash de derived_claim e manifest de 114 snapshots.
Os 114 fingerprints e hashes das fontes foram medidos, sem executar métricas.
Essas contagens descrevem os commits de preparação anteriores. O candidato
atual contém 23 kinds, 115 snapshots, 39 contratos/entradas de evaluators,
39 contratos de witnesses, templates, 76 claims e 76 grafos autorados.
Falta revisão independente integral. Políticas novas são propostas, não regras aprovadas.
Compiler/evaluator permanecem bloqueados até autoria/revisão integral.

Paths adicionais enumerados para a próxima edição documental:
- `docs/contracts/next/provenance-v2/type-and-identity-contract-v2.md`;
- `docs/contracts/next/provenance-v2/claim-contract.schema.json`;
- `docs/contracts/next/provenance-v2/metric-evaluator-registry.schema.json`.
São rascunhos sujeitos à revisão integral N02-F, não execução de registry.

Paths enumerados para campos/operadores nesta edição:
- `docs/contracts/next/provenance-v2/material-field-registry-v1.json`;
- `docs/contracts/next/provenance-v2/operator-registry-v1.json`;
- `docs/contracts/next/provenance-v2/registry-semantics-v1.md`.

Próxima ação: concluir as verificações mecânicas finais, publicar o candidato
sanitizado e solicitar auditoria integral dos contratos e dos 76 grafos.
O binding de derived_claim está proposto em graph-binding-contract-v1.md.
Reutilizar regras do kernel/agenda/canonicalValue sem segunda fórmula,
sem modificar fonte/pin/fixture v1.

Paths enumerados para a continuação dos schemas e vínculo de prova:
- `docs/contracts/next/provenance-v2/evidence-snapshot.schema.json`;
- `docs/contracts/next/provenance-v2/provenance-graph.schema.json`;
- `docs/contracts/next/provenance-v2/graph-binding-contract-v1.md`.
- `docs/contracts/next/provenance-v2/snapshot-manifest-v1.json`.

Confronto adicional do corpus: fact_keys e turn_ids incluem S/M/F/N. A grammar
S/M do rascunho inicial foi corrigida para não excluir fatos F/N. A igualdade
do conjunto de 76 continua obrigatória além da validação lexical.

Paths enumerados para contratos/registry e autoria dos claims:
- `docs/contracts/next/provenance-v2/evaluator-witness-contracts.schema.json`;
- `docs/contracts/next/provenance-v2/predicate-templates-v1.json`;
- `docs/contracts/next/provenance-v2/graphs-v2.json`;
- `docs/contracts/next/provenance-v2/graph-authoring-review-v1.md`;
- `docs/contracts/next/provenance-v2/evaluation-policy-v1.json`;
- `docs/contracts/next/provenance-v2/evaluator-contract.schema.json`;
- `docs/contracts/next/provenance-v2/metric-evaluator-registry-v1.json`;
- `docs/contracts/next/provenance-v2/evaluator-witness-contracts-v1.json`;
- `docs/contracts/next/provenance-v2/claims-v2.json`;
- `docs/contracts/next/provenance-v2/evaluator-authoring-semantics-v1.md`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/account_balance.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/balance_delta.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/bills_open.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/budget_class_consumption.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/calendar_event_count.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/category_budget_remaining.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/category_consumption.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/category_spent.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/consumption_by_instrument.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/consumption_difference.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/consumption_effect.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/consumption_total.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/due_bill_ids.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/due_bills_total.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/eligible_event_count.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/gross_consumption.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/income_minus_open_bills.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/income_realized.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/installments_projected.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/installments_projected_amount.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/installments_realized.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/installments_realized_amount.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/invoice_payment_amount.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/invoice_payment_consumption_effect.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/invoice_payment_target_card.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/merchant_rule_ids.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/movement_ids.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/net_consumption.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/owned_cards.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/projected_installments.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/ranking_winner.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/refund_amount.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/reminder_count.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/safe_daily_pace.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/side_effect_count.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/similar_event_ids.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/source_coverage.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/statement_payment_correspondence.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/statement_total.json`;

Telemetria: NAO_DISPONIVEL; último Status do coletor indicou running=false e
healthy=false. Não iniciar/reconfigurar coletor nem ampliar coleta nesta fatia.
Validação anterior: 20/20 checks locais dos dois schemas, diff-check e
agent-workflow OK no progresso bcb8257272058719d6352f4e43acb0668760831e.
Registries: 14/14 checks locais; diff-check e agent-workflow OK em 2026-09-10.
Schemas/manifest: 122 checks da projeção/fixture, 76/76 fact_keys e quatro
recusas lexicais; 114/114 snapshots válidos e 201 refs resolvidas; 11/11 checks
de shape do grafo. Detalhes/limites em graph-binding-contract-v1.md §6.
Diff-check e agent-workflow desta continuação: OK em 2026-09-10.
Os checks em memória não constituem
suíte persistida. Apenas documentos/JSON declarativo, sem código/fixture/
dependência. Os commits anteriores eram progresso, não aprovação integral.
Nenhuma suíte ampla repetida.

Revisão final local: 76 grafos passaram no schema; 115 fingerprints, cinco
autoridades e 39 hashes de contratos foram conferidos. Inventário de 4.422
arestas materiais e 16.266 requisitos de leitura sem divergência estrutural;
1.047 comparações literais de snapshots sem contradição. Esses números não
representam execução de predicados ou prova do motor.
Foram corrigidos vínculos temporais com o claim e dois estados de entrada
em safe_daily_pace: inputs confirmed, resultado estimated. Datas históricas
de saldo/fatura/policy permanecem explícitas e sujeitas à revisão independente.

## Recebimento da revisão independente

Candidato publicado: `ef04368c95af33a12c0e8b5b286c0e0b01ae27f8`.
Parent: `2e725efc29e84ea6af77b1bf13693aefead94ccb`.
Daniel forneceu o parecer para esse SHA: NO-GO para aprovação por auditoria
incompleta. O próprio parecer afirma que não confirmou defeito semântico;
seus rótulos HIGH/MEDIUM descrevem pendências de revisão, não bugs provados.
Não converter esses rótulos em correções técnicas especulativas ou em GO.

Confronto local dirigido confirmou guards distintos das duas time_basis de
statement_total, guards de 15 dias/floor em safe_daily_pace, predicados por
exclusão e regras de recibo validado/roles para pais. Isso não substitui a
revisão independente da suficiência causal de cada grafo.

Próxima ação: continuar a mesma auditoria, no SHA acima, com inventário de
leitura por arquivo/fact_key e lotes limitados. graphs-v2.json possui cerca de
5 MB; resposta interrompida deve deixar cursor e pendências, sem simular EOF.
Nenhum novo candidato técnico é necessário apenas para reiniciar a auditoria.
Esta atualização é recibo/checkpoint local e não modifica o objeto auditado.

Continuação fornecida por Daniel: o relato sobre safe_daily_pace contém
afirmações incompatíveis com os blobs do candidato ef04368. A busca no pacote
imutável não encontrou remaining_days_inclusive, safe_cutoff, end_of_month ou
remaining_budget. O contrato descreve 16..30/06 após as_of 15/06, não inclusão
do dia corrente. O role registrado é policy; evaluation_policy_v1 é alias.
artifact_status permanece not_built. O contrato de derivation declara leituras
de context, eventos e categorias; essas declarações não comprovam execução,
mas tampouco sustentam a alegação de que o cálculo efetivo ignora esses inputs.
Solicitar ao auditor paths/trechos exatos no SHA e reconciliação da fonte antes
de tratar essa continuação como achado. Origem dos 15 dias continua questão
legítima para auditoria; nenhuma correção semântica foi inferida desse relato.

Codex → Astra → Alto → confrontar a continuação da auditoria N02-F;
nenhum compiler/evaluator antes da aprovação integral.

## Correção da auditoria integral recebida em 2026-09-10

O novo parecer leu ef04368 integralmente e identificou H-01 (seis exclusões
por estado estimated), H-02 (janelas sem relações temporais suficientes) e
M-01 (proof.selected_nodes igual a required_nodes). Confronto local confirmou
as três classes. A demonstração H-02 também altera predicados: é evidência
de insuficiência do contrato de autoria, não mutant isolado de snapshot.
O estado dos pareceres incompletos acima é histórico.

Daniel autorizou corrigir e prosseguir na ausência dele. O escopo permanece
docs-only. NEXT-00 §8 permite novo operador genérico com versão, ADR,
propriedades e auditoria; não alterar silenciosamente os 27 operadores v1.
Novos paths documentais autorizados nesta correção:
- docs/contracts/next/provenance-v2/operator-registry-v2.json;
- docs/contracts/next/provenance-v2/temporal-relations-decision-v1.md;
- docs/contracts/next/provenance-v2/temporal-and-selection-witnesses-v1.json;
- docs/contracts/next/provenance-v2/n02f-correction-review-v1.md.

Próxima ação: corrigir grafos/schema e contratos relacionados, conferir
invariantes e hashes, publicar novo candidato e solicitar reauditoria focal.
O path correto da autoridade existente é
docs/plans/workstreams/financasbot-next-00-architecture-ratification-v1.md;
financasbot-next-00-ratification-v1.md foi nome incorreto no pedido de auditoria,
não artefato que o candidato deva inventar.

Correção local concluída: seis exclusões por estado reparadas; seleção/exame
separados nas 152 fases; sete grafos com 11 janelas nomeadas; registry v2
proposto com 27 operadores preservados e cinco relações civis genéricas.
Três contratos funcionais/hashes atualizados. Relatório em
docs/contracts/next/provenance-v2/n02f-correction-review-v1.md.
Checks: 43 documentos por schema, 76 grafos/claims, 115 fingerprints, cinco
autoridades, 39 hashes de contratos e 52 assertions de controle: PASS.
Workflow/diff-check: OK. Suíte ampla não repetida (docs-only).

Parent obrigatório do novo candidato: ef04368c95af33a12c0e8b5b286c0e0b01ae27f8.
Próxima ação: publicar e enviar pelo bot a reauditoria focal em dois lotes
(A: estado/seleção; B: relações temporais e sete grafos), com consolidação
obrigatória no mesmo SHA. A aprovação de um lote não libera implementação.
Daniel está ausente e autorizou continuidade sem novas confirmações.
Nenhum estado/slot do canal GitHub antigo é alterado por esta tarefa.
