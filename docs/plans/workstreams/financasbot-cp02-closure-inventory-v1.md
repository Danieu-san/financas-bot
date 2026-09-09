# CP-02 — Inventário do fechamento global NEXT-02

Data: 2026-09-09. Estado: INVENTÁRIO CORRETIVO APROVADO FOCALMENTE EM b624b3d.
Base inspecionada: `b5df1a25b873d70a847b1209efaa460e9c03b870`.
Parent do delta corretivo: `a6b322dbd690115d419df348bd068f9cfed40743`.
Branch: `codex/financasbot-cp02-inventory-20260908`.
Predecessor: CP-01 aprovado focalmente em
`f0792fbf7d3fdf88d0ac6fc744da89c8cf83b4e6`; recibo na base acima.

## Objetivo, autoridade e limites

CP-02 inventaria os critérios de GO ainda abertos, conforme
`financasbot-next-crosscutting-review-checkpoints-v1.md`, seção CP-02.
Não implementa produto nem reaudita as fatias A/B/C/D/E. A classificação abaixo
é proposta de aplicação dos contratos ao vertical, sujeita a revisão; não
altera o roadmap ratificado nem concede dispensa de obrigação.

Autoridades consultadas:

- roadmap `financasbot-next-roadmap-draft-v2.md`, §§6, 9.2, 11, 12, ratificado
  em `911af93343210ccfe2d7b7fe0b898542044a1fdf` pelo termo de ratificação v1;
- `docs/contracts/next/data-authority-contract-v0.md`, §§2–9;
- `docs/contracts/next/quality-stability-retention-contract-v0.md`, §3;
- `docs/contracts/next/capability-cutover-matrix-v0.md`, CAP-01/02/03/04/09/10/26;
- Model Data Boundary §§3–6, Tool Budget §§3–6 e Conversation/Proposal §9;
- desenho de provenance `financasbot-next-00-provenance-graph-design-v1.md`,
  especialmente §§7, 8.1, 10–13, ratificado pelo termo
  `financasbot-next-00-architecture-ratification-v1.md`;
- charter NEXT-02, planos de reuso, billing e reconciliação Golden; policy
  N02, interfaces atuais e propriedades dos cinco arquivos de teste N02.

O banner histórico de candidato no desenho NEXT-00 não revoga a ratificação.
O inventário não força equivalência entre event_date legado e novas lentes.
Nenhum arquivo financeiro congelado é modificado ou aposentado.

## Correção dos dois MEDIUM da revisão independente

O parecer recebido para `a6b322dbd690115d419df348bd068f9cfed40743` foi
APROVÁVEL APÓS AJUSTES. A proposta anterior de engine por domínio deixava
ambígua a ordem ratificada dos 76 grafos; também faltava inventariar o contrato
completo e a identidade do claim. Este delta corrige essas duas omissões,
sem emendar o roadmap nem o desenho ratificado. A reauditoria independente de
`b624b3d8a85bc8cebc0401d3f0e4fe6cf7d760ae` concluiu APROVÁVEL, sem findings,
em 2026-09-09. Recibo e limites em
`docs/agent-memory/workstreams/results/FIN-CP02-CORRECTIVE-AUDIT-20260909.md`.

## Evidência de partida e o que ela não prova

N02-A/B/C/D/E têm aprovação focal registrada no suplemento de checkpoints e
histórico do produto. CP-01 foi confrontado e fechado na base. A inspeção atual
confirma 15 fontes e 64 IDs N02-E (20 + 11 + 13 + 13 + 7), mais 25 herdados.
A última execução local CP-01 aprovou esses conjuntos e 137 testes afetados;
ampla: 1.993 testes, 1.983 PASS, zero FAIL, 10 SKIP, valid=true.
Esses resultados são evidência herdada, não testes reexecutados em CP-02.

O runtime oferece `expenses.sum`/`consumption_total`, período mensal, lentes
transaction_date e billing_period, confirmed/projected e filtros de
categoria/subcategoria/conta/cartão, com scope family/personal.
Há agenda interna e histórico/provenance por campo. A source policy admite
somente import sintético de uma instância; tipos aceitos: purchase, income,
transfer, invoice_payment, refund e installment por opt-in de policy.

Não existem no conjunto atual os registries e o compiler/evaluator de grafo,
o recorder de derivation/proof traces, a instrumentação R/I/M/L/T, roots do
closure efetivamente executado ou o gerador genérico de witnesses do desenho.
O recorder sanitizado NEXT-01 é observabilidade operacional. Field provenance,
refs exatas e os pins de fonte CP-01 não são esses mecanismos de prova.

## Matriz de obrigações obrigatórias para NEXT-02

Classe de todas as linhas: `obrigatorio_para_NEXT02`. Estado COBERTO FOCAL não
é GO global. ABERTO exige implementação/evidência ou decisão normativa explícita.

| ID | Obrigação e fonte | Evidência atual | Restante para fechamento |
|---|---|---|---|
| G01 | Observação imutável, replay, versão, identidade, anti-loop; DA-01/02/06 | NEXT02:DA-01/DA-02/DA-06, OBS-VERSION/CONFLICT/IMMUTABLE | COBERTO FOCAL para import; manter prova no gate global |
| G02 | Centavos, moeda, ownership, source policy, field provenance; DA §§2–5 | OBS-INTEGRITY/BOUNDARY/SCOPE, OVERFLOW, policy import-v1..v4 | COBERTO FOCAL no domínio; mapear toda dimensão material ao grafo G07 |
| G03 | Pessoa/família, instrumentos, categoria/subcategoria; roadmap §9.2 | QUERY-FILTERS, NEXT02C:SCOPE, NEXT02D:TOTAL/BINDING/UNKNOWN/SCOPE/TOOL | COBERTO FOCAL; falta matriz crítica completa de Golden por dimensão, G10 |
| G04 | Compra/pagamento/transferência/estorno/parcelas não duplicam consumo; DA §7 | DA-04/05, REFUND, NEXT02B, NEXT02C:LENSES/REFUND/NEUTRAL/ANCESTRY | COBERTO FOCAL nos seis tipos aceitos; não prova as semânticas ausentes de G05 |
| G05 | Reserva/aplicação/resgate neutros; distinção de reversão, ajuste, saldo anterior, juros/tarifa; DA §7, CAP-09 | KIND_RULES não inclui esses tipos; OBS-UNSUPPORTED demonstra recusa, não contribuição econômica | ABERTO: fechar contribuição/neutralidade dos tipos relevantes ao consumo com entradas sintéticas explícitas; não criar writers, saldo ou produto de investimentos |
| G06 | Lentes, realizado/projetado, coverage e ausência; DA §6, roadmap §9.2 | DA-03, VALUE-ZERO-EMPTY, NEXT02C:COVERAGE/ASOF/MISSING, subcategoria desconhecida | PARCIAL: transaction_date/billing_period mensais cobertos; due_date/settlement_date ficam null e outras lentes/intervalos não existem. Fixar sua aplicabilidade ao vertical e provar o que for exigido, sem alias para statement_due_date/budget_cycle. committed depende de receipt/writer; não simular confirmed |
| G07 | Onze obrigações de provenance; desenho §§7/13/14 | Checks de domínio e refs internas existentes | ABERTO: publicar schema v2/registries genéricos, autorar e revisar os 76 grafos antes de implementar compiler/evaluator; depois provar nós/versões, fingerprints, escopo, período, lente, coverage, estado, conjunto exato e consumo de arestas. Sem branches por métrica nem rollout por exceção |
| G08 | Identidade da fórmula e observação externa; desenho §8/8.1/11 | Kernel determinístico + pins de fonte CP-01 | ABERTO: registry de evaluator/roles, contrato da fórmula, closure pós-transformação, loader/TCB/proof roots, proxy e recorder externos com reads estruturais e canais R/I/M/L/T separados; pins não substituem closure/trace |
| G09 | Claims derivados e prova discriminante; roadmap §6, desenho §5.4/8.1/10 | Apenas consumption_total materializado; agenda é objeto interno | ABERTO para comparações/derivações aplicáveis ao gasto: operações determinísticas, roles, DAG transitiva, oracle independente e witnesses que distingam fórmulas coincidentes; a IA NEXT-03 não pode calcular esses valores |
| G10 | Golden e invariantes críticos 100%, >=3 casos por dimensão; roadmap §11/12, Quality §3 | 23 consultas/5 recusas, 56 turnos inventariados; sete properties E | ABERTO: mapa de cada invariante aplicável para casos executados e expectations revisadas; contagem de turnos/refs não demonstra cobertura mínima. Sem skips como equivalência, sem porcentagem de 76 fatos por inferência |
| G11 | Mutações ortogonais e cardinalidade derivada; desenho §10 | REDs causais por domínio e testes de pins | ABERTO: expected_violations exato, predicados com fingerprint reparado, arestas/reads/fórmula, witness obrigatório, expected=generated=executed=matched; grupos atômicos proibidos |
| G12 | Tools públicos, scope, falha fechada, budget e sessão herdados | TOOL, NEXT02C/D:TOOL e 25 properties NEXT-01; CP-01 fecha admissão e reads | COBERTO FOCAL nas boundaries existentes; não prova contrato completo/identidade de claim (G14). Preservar e integrar proof gate antes de resposta. Segredos/IDs internos continuam fora do envelope |
| G13 | Gate global executável e decisão independente | validateFinancasBotNext02 só possui slices A..E e checkpoint CP-01; output declara full_gate=pending | ABERTO: inventário de obrigações críticas/IDs reais, fontes/artefatos congelados, testes afetados e ampla única no candidato estável, SHA/parent limpos e auditoria global. Nenhuma soma de aprovações focais substitui este gate |
| G14 | Contrato completo e identidade de claim; roadmap §6, desenho §§5/5.1/5.4/7, Model Data Boundary §3 | Read model emite subconjunto tipado; verifier herdado compara algumas dimensões. Nenhum dos dois exige/emite claim_id | ABERTO: schema de claim, identidade e binding ao valor/dimensões/evidência, referências públicas efêmeras e verificação integral antes da entrega. Detalhamento abaixo; não adiar identidade para NEXT-03 |

G06 não autoriza implementar toda lente histórica de fatura/orçamento no
vertical. É obrigação de decisão explícita antes do GO: os planos anteriores
registraram due_date/settlement_date como pendentes. Não classificá-las como
dispensadas só porque hoje são null. Igualmente, uma recusa correta de reserva
protege o runtime atual, mas não demonstra a neutralidade requerida por CAP-09.

## G14 — contrato e identidade do claim ainda não implementados integralmente

O roadmap ratificado §6 exige `claim_id`, operação/métrica, valor/unidade,
entidades/período, time basis, coverage, IDs de evidência e provenance/evidence
state, com validação de sua ligação. O desenho §§5/5.1 acrescenta schema v2,
sujeito/período tipados, evaluator_ref e operand_bindings; §5.4 exige identidade
`(fact_key, evaluator_version, result_hash)` e ancestry transitiva para derivados.
Essas identidades têm objetos distintos: `claim_id` identifica o claim,
`fact_key` identifica o fato do corpus e refs identificam evidências. Nenhuma
substitui silenciosamente a outra.

Evidência de código inspecionada em `a6b322d` (inalterada neste delta):

| Parte do contrato | Materialização/verificação atual | Pendência NEXT-02 |
|---|---|---|
| Identidade do claim | `expenseReadModel.readConsumption` não emite claim_id; `verifyTypedClaimEvidence` não o exige | Definir identidade no schema, seu escopo e binding ao claim completo; rejeitar identidade ausente, duplicada no escopo ou associada a outro claim |
| Métrica, valor e unidade | Read model emite consumption_total, inteiro seguro e BRL_minor; verifier aceita valor finito/unidade não vazia e compara métrica quando esperada | Verificar unidade esperada e ligação identidade/valor/dimensões/evidência sob contrato revisado; finitude e presença não provam fórmula nem valor |
| Sujeito, período e time basis | Internamente entity.kind/ref, period.type/value e timeBasis; verifier compara expectativas fornecidas | Compatibilizar explicitamente com subject e period.kind tipados do schema v2; nomes parecidos não demonstram equivalência normativa |
| Coverage, estado e refs | Retornados no objeto evidence; verifier exige complete, estado aceito e refs não vazias | Vincular ao mesmo claim e aos nós/conjunto exatos G07/G08; refs presentes não provam provenance |
| Evaluator e derivados | Claim atual não tem evaluator_ref/operand_bindings nem identidade/DAG de derived_claim | Implementar as ligações ao registry e à prova transitiva G08/G09 após os pré-requisitos dos grafos |
| Envelope público | `createExpenseToolGateway` substitui entity.ref por label e refs por eph_<sequência>_<índice>; não cria claim_id | Definir mapeamento entre claim interno e claim_id público efêmero, válido no request, verificável sem expor IDs internos ou correlação entre turnos |

O verificador herdado requer `entity.ref`; a fachada pública retorna
`entity.label`. Não se presume que esse verificador, isoladamente, valide o
envelope público emitido por `expenses.sum`. A futura integração deve provar
os dois lados e seu binding. `sanitizedTraceRecorder` não supre identidade de
claim nem observação causal da prova.

Critério de saída G14: contrato revisado e casos executados que rejeitem claim
sem identidade, troca de identidade entre resultados, duplicidade no seu escopo,
unidade/dimensões incompatíveis, evidência de outro claim e referência pública
reutilizada fora do request. A representação exata e a política de identidade
serão fixadas no schema/registries antes do código, respeitando o envelope
efêmero da Model Data Boundary. NEXT-03 consome claims já validados; não recebe
a responsabilidade de criar sua identidade ou completar sua matemática.

## Fronteira das oito famílias de contratos

| Contrato | Aplicável agora | Parte posterior preservada |
|---|---|---|
| Data Authority | G01–G09; semântica de consumo e anti-loop sintéticos | fontes reais NEXT-04; receipt/committed e corrida de writers NEXT-06/07 |
| Coexistence/Single Writer | isolamento e ausência de efeito real | leases/fencing, cutover e coordenação de efeitos NEXT-04/06/09 |
| Conversation/Proposal | contexto/autorização revalidados, consulta sem write | IA/follow-up livre NEXT-03; prepare/preview/commit/undo NEXT-06 |
| Model Data Boundary | catálogo e resultado público minimizado, scope | provider/model call e política de egress NEXT-03; dados reais NEXT-04 |
| Integration Manifest | adapters sintéticos sem I/O | modelo NEXT-03, Sheets/Pluggy NEXT-04, canal/áudio/dashboard NEXT-05 |
| Capability/Cutover | CAP-03, semântica CAP-09/10, coverage CAP-26 | produto completo orçamento/cartões e demais domínios NEXT-08; cutover NEXT-09 |
| Tool Budget/Failure | limites e refusal nas tools, herança CP-01 | planejamento/retries do agente NEXT-03; protocolo de write NEXT-06 |
| Quality/Stability/Retention | invariantes/Golden e auditabilidade G10/G13 | rubrica conversacional/custo de modelo NEXT-03; janelas de shadow/beta, restore operacional e retenção nas fases correspondentes |

Limiar futuro permanece obrigatório na sua fase. Este mapa não declara
conformidade executada de contratos inteiros a partir de seus subconjuntos.

## Golden v1 — inventário sem equivalência forçada

Extração do oracle congelado: 56 turnos, 76 fatos materializados, 39 métricas.
Traceability N02-E: 8 turnos changed_scenario, 28 invariant_only, 14 pending e
6 selected_events_equivalent; total 56. Nenhuma relação certifica conversa inteira.

Classes usadas na tabela: N2=`obrigatorio_para_NEXT02` (invariante ou cálculo
de gasto aplicável); N3=`pertence_NEXT03` (composição conversacional, sem mover
matemática para IA); N4+=`pertence_NEXT04_ou_depois`; H=
`golden_v1_historico_nao_forcar_equivalencia` (representação antiga preservada).
H é qualificador do vínculo histórico, não dispensa da capacidade no destino.
Valores v1 não viram expectativas do novo kernel por tradução automática.

| Métrica v1 | Fatos | Destino da obrigação e limite |
|---|---:|---|
| account_balance | 2 | N4+ saldo/contas; não é consumo |
| balance_delta | 2 | N4+ saldo; neutralidade da transferência é N2 |
| bills_open | 1 | N4+ NEXT-08-bills |
| budget_class_consumption | 2 | N4+ NEXT-08-budget; N2 preserva total e neutros |
| calendar_event_count | 1 | N4+ NEXT-08-calendar |
| category_budget_remaining | 4 | N4+ NEXT-08-budget |
| category_consumption | 6 | N2/G03/G10; H para event_date legado |
| category_spent | 3 | N2 para M-08#1; dois fatos M-13#1 são budget_cycle N4+/H |
| consumption_by_instrument | 3 | N2/G03/G10; H para lente antiga de parcelas |
| consumption_difference | 1 | N2/G09; diferença assinada no kernel, não na IA |
| consumption_effect | 4 | N2/G04/G05 como invariante; nome de tool v1 não obrigatório |
| consumption_total | 7 | N2/G03/G10; H para cenário alterado |
| due_bill_ids | 1 | N4+ NEXT-08-bills |
| due_bills_total | 1 | N4+ NEXT-08-bills |
| eligible_event_count | 3 | N2/G06/G10 como prova de empty; claim de count exige contrato se exposto |
| gross_consumption | 2 | N2/G09; breakdown não pode ser calculado pela IA |
| income_minus_open_bills | 1 | N4+ bills/forecast |
| income_realized | 1 | N4+ renda/forecast; tipo income já existe, soma pública não |
| installments_projected | 2 | N2 agenda/estado; H para intervalos antigos, count público ainda ausente |
| installments_projected_amount | 2 | N2/G06/G09; H para intervalo não suportado |
| installments_realized | 2 | N2 agenda/estado; H para through/as_of, count público ausente |
| installments_realized_amount | 1 | N2/G06/G09; sem inventar compra ou competência |
| invoice_payment_amount | 1 | N4+ produto cards; neutralidade é N2 |
| invoice_payment_consumption_effect | 2 | N2/G04/G10 |
| invoice_payment_target_card | 1 | N2 identidade/vínculo; campo preservado, não claim standalone |
| merchant_rule_ids | 1 | N4+ NEXT-08-rules |
| movement_ids | 1 | N4+ lista geral de movimentos; N2 prova conjunto de gasto |
| net_consumption | 3 | N2/G04/G09; alvo do estorno e soma líquida |
| owned_cards | 1 | N4+ registry/adapter real; scope sintético é N2 |
| projected_installments | 1 | N2 agenda/estado; H intervalo, N3 explicação/composição |
| ranking_winner | 1 | N2/G09 cálculo; N3 seleção/explicação das tools |
| refund_amount | 2 | N2/G09 se breakdown exposto; compensação obrigatória G04 |
| reminder_count | 1 | N4+ NEXT-08-reminders |
| safe_daily_pace | 2 | N4+ NEXT-08-budget/forecast |
| side_effect_count | 1 | N4+ proposals/writer; zero efeitos N2 já obrigatório |
| similar_event_ids | 1 | N4+ regras/ambiguidade; N2 não funde identidades iguais |
| source_coverage | 1 | N2/G06/G10; não obriga replicar fachada standalone v1 |
| statement_payment_correspondence | 1 | N4+ cards/reconcile; N2 não alega provar statement identity |
| statement_total | 3 | N4+ cards/H; statement_due/competence não é alias de billing_period |

N3 também recebe o comportamento linguístico dos 48 diálogos, múltiplas tools,
follow-up e qualidade/custo do agente; o replay sintético herdado permanece.
N4+ inclui adapters reais, dashboard/canal/áudio NEXT-05, writers NEXT-06,
proatividade NEXT-07, domínios NEXT-08 e cutover/retirement NEXT-09/10.
Golden v1 completo permanece preservado até a decisão CP-07; nenhum dos 76
fatos é apagado, marcado SUPERSEDED ou contado como implementado por esta tabela.
O destino funcional N3/N4+/H não adia a autoria/revisão de seu grafo: todos os
76 fatos integram o pré-requisito documental da migração de provenance §13.
Descrever um grafo sintético de domínio futuro não implementa sua tool, adapter
ou writer. A classificação da tabela é de capacidade de produto, não uma
dispensa desse pré-requisito transversal.

## Próxima fatia derivada do inventário

Recomendação corrigida: **N02-F — preparação documental integral da migração
de provenance e do contrato de claim**. Essa fatia precede o motor executável.

1. Fixar escopo/paths e publicar schema v2 e registries genéricos, incluindo
   o contrato/identidade de claim de G14. Reutilizar os conceitos e as funções
   já aprovados de canonicalValue, kernel, agenda e read model ao mapear inputs
   e operações; não criar outra fórmula de consumo ou DSL matemática.
2. Autorar e revisar os grafos de **todos os 76 fatos**, sem gerá-los do oracle,
   com rastreabilidade exata aos fact_keys congelados. Nenhum destino funcional
   N3/N4+/H ou recusa de domínio remove um fato desse conjunto.
3. Submeter schema, registries e conjunto integral a revisão independente;
   registrar sua evidência e a correspondência 76/76. Ausência de grafo ou
   revisão impede avançar para implementação do compiler/evaluator.

A seção 13 ratificada é mantida: após autoria/revisão integral, a compilação
dos grafos serve à validação, e a implementação do compiler/evaluator segue
sem branches por métrica. CP-02 não autoriza iniciar engine parcial antes dos
76 grafos nem promover um rollout por domínio/campo; os critérios §14 exigem
troca integral de abstração e propriedades para todo o grafo. A futura fatia
executável precisa declarar os pré-requisitos satisfeitos e o escopo completo
de G07/G08/G11/G14 antes de começar.

Uma ordem diferente exigiria emenda normativa explícita e ratificada. Este
inventário não propõe essa emenda: adota a ordem vigente. Não implementa agora
tools, adapters ou writers dos domínios futuros para satisfazer a autoria dos
grafos sintéticos, nem aposenta o Golden v1 antes da decisão CP-07.

Após essa preparação, selecionar a fatia executável e G05/G06/G09 por
dependência, preservando a migração integral e fechando G10/G13/G14.
Não existe número definitivo de commits restantes: esses IDs são obrigações,
não fatias já aprovadas. CP-03 continua depois de GO global NEXT-02, sem
necessidade de acessar planilha real para concluir este inventário.

## Validação e saída CP-02

Escopo documental: este inventário, checkpoint próprio e linha no índice.
Conferir automaticamente 39 métricas/76 fatos/56 turnos e referências dos
arquivos citados, diff e workflow. Sem mudança causal de código: não repetir
suíte ampla nem os testes verdes CP-01. Publicar candidato e solicitar uma
auditoria manual focada em omissões, adiamentos indevidos e escopo da próxima
fatia. Esse parecer foi recebido para b624b3d: CP-02 está resolvido como
inventário; NEXT-02 global continua aberto. O fechamento não implementa as
obrigações inventariadas nem dispensa os pré-requisitos de N02-F.

Resultado local documental: 39 métricas com contagens individuais iguais ao
oracle, 76 fatos, 56 turnos únicos; referências existentes, diff-check e
agent-workflow OK. Essa verificação não julga a classificação semântica/fase.

Revalidação do delta corretivo em 2026-09-09: as 39 contagens individuais
continuam iguais ao oracle (76 fatos); rastreabilidade mantém 56 turnos únicos;
G01..G14 são únicos; seis referências diretamente confrontadas existem;
diff-check e agent-workflow OK. Só os três documentos deste gate mudaram.
Nenhuma suíte funcional foi repetida: o delta não modifica código ou fixtures.
