# N02-G — proposta selected-event-day-path/v1

## 1. Estado e decisão solicitada

PROPOSTA DOCUMENTAL NÃO RATIFICADA. Parent de publicação:
`241a08c4e35d257209d9fb8320d7d4828cdc7854`.
Pedido: APTO DOCUMENTAL PARA IMPLEMENTAR ESTA PROPOSTA, NÃO APTO ou
REVISÃO INCOMPLETA. Não é aprovação de código, compiler, runtime, recorder,
D/P, ledger, G11/N02-G/NEXT-02, NEXT-03, deploy, produção ou dados reais.

O domínio v2 ratificado continua exigindo admissão integral e isolamento
causal. Um predicado de período pode também ser um guard de seleção em P:
executar o path errado torna o predicado falso e muda a seleção, embora D
continue com sua fórmula e entradas originais. Hoje isso é period + trace,
não um witness isolado. A proposta cria uma NOVA autoridade de qualificação,
sem converter a rejeição normal em aceitação normal.

Referências normativas: `financasbot-next-02-n02g-path-domain-proposal-v2.md`
e §§10.0–10.6 de `financasbot-next-00-provenance-graph-design-v1.md`.
Esta é exceção expressa à ortogonalidade do trace APENAS na fringe abaixo.
Não importa exceções A/B, source-state ou claim-month-path-completion/v1.

## 2. Evidência que motivou o recorte

O diagnóstico local de 125 obrigações date_in_period manteve todos os IDs:
19 sem primeira alternativa discriminante; 106 primeiros candidatos
compilados; 105 recusas selection_binding_selected; somente um admitido.
Nenhuma alternativa posterior foi escolhida para resgatar uma recusa.
O admitido foi F-06#2#1/p0055_selected_period, arg0:
`evt_refund_b.date` → `evt_restaurant_b.date`; arg1 continua claim.period.
A claim tem period `{kind: "date", value: "2042-06-09"}`.
Datas sintéticas congeladas: refund 2042-06-09; restaurant 2042-06-07.

No D/P local normal desse admitido, referência e fora-alvo foram preservados,
target=false, proof=false, oracle igual; read_edges e selection não casaram.
Resultado normal: 1/1/1/0, exit1, period + trace, UNSAT. Esse relato local
não prova a futura fronteira externa nem viabilidade de todos os candidatos.
Os hashes dos diagnósticos são registrados no witness como RELATO LOCAL,
sem leitura/rerun desses logs pelo verifier portátil.

## 3. Domínio estrito, pré-compromisso e ticket de execução

O ticket é um objeto PRIVADO da TCB, não um parâmetro booleano do guest.
Sua elegibilidade deve ser demonstrada independentemente, antes do compile
ou D/P de M, a partir da autoria, contratos e snapshots congelados:

1. Um target ID v2 já existente; atom/obligation period; op date_in_period;
   exatamente dois operandos: arg0 field/event/date escalar primário e
   arg1 claim.period de kind date civil Gregoriana. Sem timezone/windows,
   templates, parents, derivados, literal substituto ou novo namespace.
2. Exatamente uma seleção em P; candidate_set e selected_set têm a MESMA
   população singleton [a]; excluded vazio; include_if_all. Target participa
   como guard e como asserção final; uma ocorrência em cada site, sem
   short-circuit. Todos os outros guards são invariantes e verdadeiros.
3. Arg0 original é a.date. A alternativa preserva o tipo nominal date,
   existe no mesmo corpus fechado e concerne a a por material_ref singular
   direto já ratificado. A ligação e o payload são imutáveis; não se admite
   reachability arbitrária. Focal: refund.compensates → restaurant.
4. Mesma política v2 de PRIMEIRA alternativa independentemente discriminante
   no enumerador selado. Se ela falhar no compiler integral, UNSAT; não
   buscar outra pelo outcome. O perfil NÃO transporta selectionBindings,
   claimRequirements ou qualquer outro checker. As 105 recusas ficam fora.
5. A fórmula D é formula_only no perfil de composição vigente. Nem seu
   programa, role, seleção funcional, inputs, CoreClaim ou oracle mudam.
   Nenhum dispatch do target de P ocorre em D. D deve ser medido exatamente.
6. Nenhum consumidor usa o selected_set de P; nenhum outro predicado,
   template ou dispatcher depende do resultado/IR do target. Leituras das
   mesmas datas por outros sites podem existir e permanecem no core.
   Exigir análise externa de closure e conformance, além da extração da
   autoria. Lista documental vazia NÃO demonstra essa ausência por si só.

Primeiro selar elegibilidade e expected no pré-compromisso, antes do compile
de M. Depois do compile integral, completar o ticket ANTES da execução de M,
confrontando conformance independente e vinculando hashes do IR/programa.
Esse segundo passo não pode revisar o pré-compromisso pelos outputs do compiler.
Ticket vincula hashes da autoria C/M/S, contratos, corpus, patch único,
ordem do enumerador, referência, plano de sites, dependency closure, compiler
e programa medidos, origem de quarentena, perfil e ratificação. Não pode ser
emitido só porque o baseline passou ou o mutante produziu o trace desejado.
Conformance autoria→IR independente deve validar TODO M e ambos os sites:
ID/op/atom/tipos/operandos exatos, incluindo o locator errado. Normalizar M
de volta a C, compilar C e injetar depois, omitir um site ou tolerar erro de
compiler genericamente invalida o ticket. Nenhum módulo atual é aprovado aqui.

## 4. Expected independente e execução C/M/S

Selar TODAS as referências e a escolha da primeira alternativa antes de
QUALQUER compiler/execução mutante. Expected não vem de actual, IR observado,
trace, resultado do checker, guest ou baseline. A referência lê só autoria,
claim e snapshots primários congelados e usa calendário civil independente.
Controles C e S têm autoria equivalente ao original; S recompila a restauração
do locator, com identidade e invocação próprias. M altera só arg0 do target.

Selar truth C/S=true e M=false e o truth de TODOS os guards invariantes.
Por include_if_all, a seleção de P esperada é [a] em C/S e [] em M.
Seleção funcional de D continua [a] em todos. Nenhuma seleção de C é injetada
em M, nenhuma seleção observada é convertida em expected, nenhuma asserção
shadow substitui M. Executar os programas completos admitidos de C/M/S,
por child/host medidos e recorder externo; fazer as duas chamadas reais do
target de M, mesmo depois de a seleção rejeitar a. Erro/throw/timeout/saída
incompleta é falha de execução, jamais target=false inferido.

## 5. Core e fringe: quatro eventos delimitados, não componentes inteiros

A fronteira deve ser definida ANTES do IR de M, por plano independente da
autoria + semântica do acesso ratificado. Um lease opaco do dispatcher medido
identifica fase/site/ocorrência/operando e escopo; o recorder externo vincula
cada evento bruto ao lease ativo. Guest não escolhe labels, origem ou papel.
O recorder preserva o trace integral e posições globais originais.

Fringe de P contém EXATAMENTE:

- um get/data/date de arg0 no dispatch do target como guard do singleton;
- um get/data/date de arg0 no dispatch do target como asserção final;
- o select_member do único candidato no select desse programa;
- o select_return desse mesmo select, incluindo o view ID derivado do roster.

Em C/S, guard lê a.date pelo live member de proof/set/candidates e a asserção
lê a.date por proof/snapshot. Em M ambos leem o locator alternativo pelo
handle global proof/snapshot. Os roles/aliases concretos são resolvidos do
plano de autoria, não copiados de uma execução. Operação, projeção, path,
valor, identidade e multiplicidade de cada leitura devem corresponder ao
snapshot selado e ao locator daquela variante. Focal registra esses quatro
tuples esperados como CONSTRUÇÃO DOCUMENTAL, não como trace executado.

select_member: candidato/índice/role constantes; decisão true C/S, false M.
select_return: [a] C/S, [] M; view ID calculado independentemente pelo
contrato hash(role, aliases), nunca pela observação. select_start, enumeração
at, identidades do candidato, ciclo e encerramento continuam no core.
Não há consumo do view selecionado neste perfil; acesso ao view invalida-o.

Os quatro eventos aparecem na ordem real: guard get, select_member,
select_return, assertion get, com os eventos core intercalados preservados.
TODOS os demais eventos são core. Incluem todas as leituras de claim.period
(kind/value/estrutura), todos os outros predicados, state guard, edges e
traversals, binding de contexto, medidas e TODA D. Core C/M/S deve ser
exatamente igual em conteúdo, ordem, multiplicidade e cobertura, sob escopos
de execução/invocação autenticados. Diferença de IDs de invocação é somente
associação de escopo validado, não normalização de payload/eventos.
Fringe é conferida contra o plano selado, não contra o actual de C.

Cada evento deve ter uma única classificação válida. Missing, extra,
replay, fora da fase/site/operando, lease forjado, origem inventada, leitura
de outra data no mesmo alias, leitura de D marcada fringe, consumo do view,
short-circuit de guard, omissão de asserção ou alteração de edge invalida.
Não filtrar por alias/predicado/componente inteiro; read_edges e selection
não ganham waiver global. Não fabricar leituras por required_reads.
Verificar cobertura estrutural, access metadata, civil dates, operand sets
e medições no trace completo; nada pode ficar sem cobertura ou ser apagado.
Se quatro eventos não bastarem para explicar EXATAMENTE o delta, UNSAT.

## 6. Duas autoridades e contabilidade não retroativa

O resultado NORMAL continua period + trace, normal_graph_accepted=false,
ordinary_v2_witness_qualified=false. Preservar diagnóstico e coverage normais
sem alterar checkers, expected normal ou rotular phases_covered como true.
Um adjudicador PRIVADO do perfil ratificado verifica separadamente o trace
integral e a cobertura core/fringe. Profile coverage NÃO é ordinary coverage.

Positivo nativo de C/S significa predicados, coverage, D e oracle positivos
na execução de diagnóstico; não significa receipt financeiro dessas raízes.
Somente nessa nova autoridade, causal_expected_atoms=[period]; seleção e as
duas leituras são efeitos intermediários previstos, não crédito semântico
adicional. Exigir: C/S nativamente positivos; M admitido/executado inteiro;
target falso em ambos os sites; todas as outras asserções verdadeiras;
D/R/oracle originais; core exato; fringe exata; isolamento e quarentena.
Verde normal, compiler RED ou mero matched por contagem não satisfazem isso.

O ID v2 original não muda; expected não diminui; o row UNSAT histórico não
é corrigido. Futuro row aponta `path-domain-v2 + selected-event-day-path/v1`
RATIFICADO, todos os hashes e uma invocação própria. Não usar observação
histórica para preencher o novo row. C/S/probes não contam como matched;
sem compensar obrigações, somar ledgers de recortes ou reutilizar witness.
Até norma + implementação + auditoria de código + execução qualificada,
profile_witness_qualified=false e semantic_mutation_credit=0.

## 7. Quarentena inseparável da TCB

C/M/S só existem em raízes NEGATIVAS de qualificação. Origem, variante,
perfil, sidecar selado e authority hashes fazem parte da identidade medida
do pacote/host/child/recorder e de sua admissão privada, não de metadata
editável pelo guest. A TCB vincula essa identidade ANTES da exposição de
handles. Remover/recriar metadata não torna a raiz positiva; mismatch rejeita.

Não produzir receipt, validated_parent nem resposta financeira em C/M/S,
inclusive controles positivos. Entry point financeiro normal rejeita o
perfil e artefatos derivados dessas raízes. Parent positivo vem somente da
cadeia positiva congelada; esta proposta não consome ou cria parent novo.
Sidecar contém expectativas de qualificação, não dados econômicos auxiliares.
Não é possível promover M/C/S, mesmo com trace/metadata removidos.

## 8. Implementação futura e testes obrigatórios, somente após ratificação

REDs: quatro sites/eventos externos ausentes; target normalizado; compiler
recusado; fórmula D modificada; seleção errada mesmo com target falso;
guard invariável falso/omitido; leitura extra/omitida/replay; fringe de D;
view consumido; origem/lease/sidecar/variant forjados; metadata removida;
receipt/parent/resposta por C/S/M; expected após IR; alternativa resgatada.
Todos devem bloquear ticket ou qualificação, não apenas emitir warning.

Depois: implementar ticket/conformance privada, programa/child/recorder
medidos e adjudicador de cobertura; provar isolamento das entradas financeiras;
RED/focal/afetados; uma ampla final estável; candidato sanitizado imutável;
auditoria independente de CÓDIGO antes de crédito. Não ativar v2 ou G11 aqui.

## 9. O que não foi resolvido

As 105 recusas de seleção permanecem recusas; 19 não discriminantes, 14 eq
sem fonte disponível, timezone, parents e derivados continuam pendentes.
Não se prova que todas as alternativas desses IDs sejam inviáveis. Não
se altera schema, corpus, registry, autoria financeira ou política de escolha.
Não se congelam seleções de baseline nem se desativa trace. Esta autoridade
é uma exceção nova identificável, não um aproveitamento silencioso de mensal.

## 10. Artefatos de construção e suficiência documental

`selected-event-day-path-profile-witness.json` e
`verify-selected-event-day-path-profile-witness.cjs`, em
`docs/audit-evidence/n02g-causal-authoring-profile/`, extraem F-06 do parent
e constroem independentemente os quatro tuples, truth e rosters do recorte.
O verifier só usa fs/path/crypto/assert e JSON; não importa ou executa
compiler, evaluator, guest, D/P, recorder, oracle ou adjudicador.
Seus testes de perturbação são de CONSTRUÇÃO, não conformance/runtime.

Hashes de source são extração local confrontável com blobs do parent.
Hashes dos relatórios identificam RELATO LOCAL, não execução independente.
Ausência de consumidor extraída da autoria é parcial; closure externo,
site leases e cobertura do perfil ainda NÃO implementados/qualificados.
Nenhuma ampla nova é necessária: não houve mudança de fonte medida.
Auditor: avaliar suficiência e estreiteza dessa NOVA autoridade, identidade,
expected e fronteira causal; não conceder GO de implementação ou de ledger.
