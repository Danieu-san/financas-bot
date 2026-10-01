# N02-G — composição explícita de instruções por fase

2026-10-01. **PROPOSTA DOCUMENTAL, NÃO RATIFICADA NEM APLICADA.**
Base deste delta: `ecc57203bbd5b50087f2cd7fa9af8c96ee03ae1d`.
Não altera runtime, corpus, registry, contratos financeiros ou dependências.

## Decisão focal pedida

Autorizar a composição abaixo no processo descartável por grafo, preservando
os contratos exatos já ratificados. Não aprovar a implementação local parcial.
O fato de duas fases usarem o mesmo processo não transforma uma obrigação de
proof em obrigação de derivation.

Autoridades inalteradas nesta base:

- `docs/contracts/next/provenance-v2/graph-binding-contract-v1.md`, §4/SB-001:
  obrigações independentes por fase; proof cobre todos os guards; seleção
  derivacional depende do binding, não do nome da métrica ou do resultado.
- `docs/plans/workstreams/financasbot-next-02-n02g-causal-authoring-profile-v1.md`:
  não copiar toda a proof; perfil declarativo revisado pode ser escolhido pela
  assinatura semântica do registry; não aprender expected do evaluator/trace.
- `docs/audit-evidence/n02g-causal-authoring-profile/prepare-account-installment-observation-proposal.cjs`:
  composição integral dos guards de seleção especificamente nos onze grafos
  de contas/parcelas. Proposta ratificada `041da0dfefe8602b85d0168582da722cf74f9a53`;
  aplicação de código `6baf88dc8b33326f8e05245e38f9682cc722c0be`.
- `docs/plans/workstreams/financasbot-next-02-n02g-execution-boundary-v1.md`:
  artefatos fechados, roots independentes, recorder externo e compartments
  novos por fase; a observação não autentica a própria autoridade de freeze.

## Diferença que exige esta decisão

O witness reproduz dois recortes do corpus imutável de `6baf88dc...`, sem executar
evaluator/recorder/oracle e sem ler o código WIP. Em S-11#1#1, a autoria aprovada
exige na derivation guards de ausência de installment_plan e leitura de state
para exclusão. Em M-03#1#1, a proof exige has(budget_class) em income_salary,
neutral_transfer e neutral_invoice_payment, mas a derivation não exige essas
operações: a exclusão econômica anterior dispensa esse consumo posterior.
Isso não dispensa a proof de demonstrar todos os guards de exclusão.

Diagnóstico local, não autoridade normativa: o pareamento WIP primeiro detectou
faltas em parcelas; a tentativa de executar universalmente todos os guards de
proof produziu extras em M-03#1#1. Essa tentativa permanece RED e não justifica
adicionar operações ao expected, ocultar observações ou filtrar campos por alias.

## Composição proposta, fechada e anterior à execução

1. Manter a classificação de seleção SB-001 integral: roster/order exatos,
   role único, prebound explicitamente admissível e ambiguidade fail-closed.
   Essa classificação continua baseada em bindings, não na política abaixo.
2. Congelar uma tabela declarativa **com os 39 registros exatos do registry**,
   identificados por evaluator_id/version, metric, contract_path e digest do
   contrato. A tabela testemunhada é proposta, não nova autoridade já aprovada.
   Ausente/extra/duplicado, hash divergente ou modo desconhecido bloqueia build;
   não haverá fallback automático para métrica futura.
   A implementação deve versionar essa tabela como input independente; não
   regenerá-la do registry/candidato no momento de admissão. O witness apenas
   apresenta a tabela proposta nesta revisão, não substitui seu freeze futuro.
3. Dois modos explícitos nesta versão:
   - `formula_only`: derivation executa a fórmula instrumentada e a seleção
     causal que ela exige. Não recebe um segundo passe universal dos guards
     da proof. Isso não torna a fórmula correta por declaração: qualquer falta
     ou extra contra a autoria exata continua bloqueante.
   - `formula_plus_selection_guards`: além da fórmula e da seleção observada,
     executa o conjunto autorado de predicados selected/excluded associado às
     seleções derivacionais pelos bindings. Guard falso, seleção não executada
     ou seleção repetida impede aceitação. O passe não faz uma segunda seleção
     nem usa selected_set autorado para fabricar roster observado.
4. Nesta proposta, somente as sete assinaturas ACCOUNT-INSTALLMENT recebem o
   segundo modo: movement_ids, account_balance, installments_realized,
   installments_realized_amount, installments_projected,
   installments_projected_amount e projected_installments. Elas abrangem
   exatamente os onze grafos previamente ratificados; nenhuma outra assinatura
   herda esse modo por similaridade. Os outros 32 registros são explicitamente
   formula_only. Uma extensão futura exige revisão normativa do perfil/delta.
5. Proof permanece completa para todos os 76 grafos: todos os predicados,
   selections, selected/excluded, contextos e dependências autoradas. Nenhuma
   redução na proof decorre do modo derivacional.
6. O compiler offline baixa instruções concretas genéricas por grafo. O guest
   não recebe IR cru, snapshots, R, expected_trace, selected_nodes esperados,
   oracle, policy selector por metric/fact_key ou callbacks de seleção nativos.
   A escolha de perfil ocorre no build pela assinatura revisada; o programa
   runtime só distingue a fase D/P e usa handles instrumentados admitidos.
7. Perfil e código gerado pertencem aos closures medidos pertinentes. O perfil
   é fixado antes de execução, com digest vinculado ao artefato/registry/freeze
   independente. Não recalcular root esperado do candidato na admissão.
8. Derivation e proof usam compartments novos no mesmo processo descartável,
   handles revogados antes de inspecionar outputs e um recorder externo com
   sequência única e fases explícitas. Ambas devem passar sua cobertura exata;
   timeout, falha, raiz divergente, protocolo incompleto ou saída não limpa
   impedem o recibo privado. Este documento não fecha o TCB/host pendente.

## Critério de implementação após parecer suficiente

Implementar somente se houver APTO DOCUMENTAL PARA IMPLEMENTAR explícito.
Não aplicar mudanças ao trace_contract nem ao corpus nesta correção.
Testes devem gerar renomeações de aliases/edges, reordenações e variações de
presença/elegibilidade, preservando perfil por assinatura e obrigações por fase.
Casos negativos: registry/profile extra ou faltante, hash/versão alterados,
modo desconhecido, role ambíguo, guard removido/falso, seleção ausente/repetida,
evento omitido/filtrado e tentativa de derivar perfil do actual/oracle.
Confrontar todas as 152 fases e os 76 grafos; qualquer incompatibilidade restante
é bloqueio a resolver pela autoridade correspondente, não motivo para novo if.

Somente depois: closure TCB integral, freeze independente, recibo financeiro
privado, candidato estável, uma ampla e auditoria independente do novo código.
Histórico amplo continua RED 2413 PASS/3 FAIL/10 SKIP; não foi repetido aqui.

## Evidência e alcance da revisão

`docs/audit-evidence/n02g-phase-composition/phase-witness.json` é extração
sintética reproduzível, não teste financeiro nem execução independente do Chat.
Seu verifier fixa o SHA fonte, lê blobs inteiros, exige unicidade, gera o mesmo
recorte e compara integralmente; hashes são UTF-8 após somente CRLF→LF.

Pergunta principal: esta composição explícita mantém a independência das fases,
preserva as sete assinaturas/onze grafos ratificados e evita tanto generalização
da proof quanto exceções por fact_key? Há alguma obrigação normativa indispensável
que ainda falte para implementá-la sem alterar expected?

Veredito pedido: APTO DOCUMENTAL PARA IMPLEMENTAR, APTO APÓS AJUSTES ou NÃO APTO.
Sem aprovação do código parcial, GO global N02-G/NEXT-02, NEXT-03, deploy,
produção, dados reais ou reauditoria integral dos 76 grafos.
