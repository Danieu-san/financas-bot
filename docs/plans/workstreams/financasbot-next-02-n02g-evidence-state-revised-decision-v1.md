# N02-G — revisão fechada de evidence_state: retirar redundância, manter ritmo

2026-09-22. PROPOSTA REVISADA, não implementada. Base documental:
`0cbc80d65ae0761a99e8980d070068f13f28c244`; grafos/runtime ainda iguais a
`69a385832876329afb4da73ffb5cc79d1ef94254`. A proposta anterior de 34 adições
recebeu NÃO APTO, recibo evidence-state-independent-review.md. Esta versão
abandona as 26 claim reads e seis budget reads rejeitadas; não tenta justificar
as mesmas adições com a existência do acesso no código.

## Decisão solicitada

Revisar uma correção de código e um delta normativo, conjuntamente delimitados:

1. **Código:** em selectEconomicEvents, observar/validar claim.evidence_state
   somente nos modos instrument/statement, cuja regra própria foi ratificada,
   e safe_pace, cujo contrato exige estimated. Nos modos total/category/spent/
   income/budget_class/budget_remaining, retirar a leitura/guarda confirmed do
   claim. A contagem elegível herda essa retirada ao compor selectConsumption.
   Isso elimina a exigência não fundamentada em 26 instâncias dos sete contratos.
2. **Código:** na validação do budget de budget_remaining/safe_pace, manter
   checagem de kind/identidade, período, escopo/referências e demais precondições,
   mas retirar budget.get('evidence_state') e sua guarda confirmed. O schema
   singleton e a admissão continuam exigindo confirmed antes do handle existir.
   Não flexibilizar schema, registry, snapshot, roles ou validação de pacote.
3. **Normativa:** adicionar somente `{segments:["evidence_state"]}` a
   required_claim_reads de derivation dos dois safe_daily_pace. Nenhuma outra
   adição/remoção nos grafos. Nenhum budget read será adicionado.

Os itens 1/2 são correções candidatas de acesso causal, não uma política nova
de propagação de estados. A assinatura funcional dos sete contratos não decide
o estado de saída a partir dos eventos. Não passará a converter claims em
confirmed/estimated/projected, nem a aceitar automaticamente um claim cujo
estado contrarie predicados de proof. Eles continuam exigindo a igualdade
declarada, com claim.evidence_state em required_claim_reads de proof.
Permitir que a fórmula calcule sob outro estado schema-válido NÃO prova a
validade integral desse claim ou grafo. O gate de proof/host continua pendente;
não afirmar que um host ainda não construído já executou essa rejeição.

## Por que safe_daily_pace permanece distinto

evaluator-contracts/safe_daily_pace.json e evaluator-authoring-semantics-v1.md
explicitam input_evidence_state=confirmed e claim.evidence_state=estimated.
temporal-relations-decision-v1.md mantém essa separação. A guarda de estimated
discrimina estados alternativos admitidos pelo schema de claim e é causal
para esse contrato. Não se deduz da mera presença de eventos confirmed.

| Instância inventariada | Contrato | Adição em derivation |
| --- | --- | --- |
| M-13#1#3 | safe_daily_pace v1 | claim/evidence_state |
| M-13#1#6 | safe_daily_pace v1 | claim/evidence_state |

Ambos já possuem binding de context, claim estimated, predicado binding_4
de igualdade a estimated e required_claim_reads correspondente em proof.
Não copiar a proof, os estados de eventos ou o estado de budget para derivation.
Esses dois registros estão integralmente identificados em evidence-state-proposal.json
do hash anterior; seu helper já verificou fontes/roles/predicados localmente.
O inventário anterior é histórico e rejeitado como proposta de 34 adições;
esta revisão usa apenas suas fontes e os dois registros, não sua autorização.

Regra geral de autoria para esta adição: evaluator_id=safe_daily_pace,
evaluator_version=1, contrato hash
`sha256:195e3968cc2f7f7dd2e46fdcb2619c19892b5c56a27d0e3c62f76fe08ba9a14d`,
role context do registry ligado a claim_context. Não escolher por fact_key,
alias, resultado ou trace. Os nomes acima fecham o inventário deste candidato.
Preservar integralmente os outros 74 grafos e todos os demais campos dos dois.

## Fontes imutáveis a confrontar

Todas no hash desta proposta, salvo histórico explicitamente mencionado:
docs/contracts/next/provenance-v2/graph-binding-contract-v1.md §1/§4,
evaluator-authoring-semantics-v1.md, temporal-relations-decision-v1.md,
claim-contract.schema.json, evidence-snapshot.schema.json,
material-field-registry-v1.json, metric-evaluator-registry-v1.json,
evaluator-contracts/safe_daily_pace.json e os sete contratos v1 identificados
na proposta anterior; claims-v2.json e os dois grafos pertinentes.
Confronto de código: src/next/provenance/metricSelection.js,
metricDirectReads.js (contagem), packageContract.js (bytes admitidos) e
graphCompiler.js (validação schema_snapshot em compileAuthoringIR antes de
compileSnapshotAccess disponibilizar handles). Não atribuir a validação do
payload somente à admissão de bytes de packageContract.
O inventário anterior identifica paths e hashes LF, sem afirmar execução externa.

## Validação futura fechada

- RED normativo para as duas leituras ausentes; RED de acesso para as guardas
  extras que se propõe remover. Expected construído antes da execução.
- Provar exatamente duas adições e igualdade de todos os demais campos/74
  grafos. Compor explicitamente o novo delta nos testes históricos de família
  e de autoria instrumental, sem relaxar igualdade ou apagar asserções.
- Testar alternativas schema-válidas de claim.evidence_state nos sete contratos:
  o kernel deve preservar cálculo/seleção e não observar esse campo; isso não
  é teste de aceitação integral de claim. Predicados/reads de proof permanecem.
- Nos dois safe_daily_pace, exigir observação estimated e rejeição de estados
  alternativos; eventos projected continuam excluídos, confirmed consumidos.
- Orçamento projected/estimated deve ser rejeitado pela admissão do snapshot,
  antes de disponibilizar handle. Não fabricar witness admitido inválido; no
  orçamento válido, garantir ausência de get(evidence_state) no evaluator e
  manutenção das leituras de limit_minor/período/escopo pertinentes.
- Preservar testes de estado de eventos, referências, família, janelas, cálculo,
  os seis perfis instrumentais, suas guardas approved e flags falsas.
- Na integração, remover do trace a leitura safe_pace esperada deve impedir
  cobertura; não tolerar ausências/extras por whitelist ou corrigir expected
  com actual. Outras divergências conhecidas permanecem fora do recorte.
- Bateria afetada e uma única ampla final após estabilidade; commit sanitizado
  e auditoria do código novo. Nenhuma ampla para esta proposta documental.

## Gate de decisão

Solicitar APTO/NÃO APTO DOCUMENTAL para implementar esta correção causal
delimitada e as duas adições, com confirmação de hash/pai/fontes e limites.
Se a retirada das guardas quebrar uma obrigação normativa não considerada,
identificá-la precisamente e não substituir por propagação implícita de estados.
O NÃO APTO anterior permanece válido para as 34 adições; esta revisão não o
converte em GO. Sem aceitação de grafos, proof, host, medições, derivados,
N02-G global, deploy ou produção. graph_accepted/releaseEligible falsos.
