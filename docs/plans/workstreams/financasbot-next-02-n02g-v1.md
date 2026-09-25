# N02-G — execução integral de provenance

Data: 2026-09-11. Estado: CHARTER APROVADO; N02-G EM EXECUÇÃO; SEM GO GLOBAL.

Atualização 2026-09-25: DIRECT-EVENT foi aprovado focalmente no código do
candidato `2357887e2e2c419c3f2e152638400fb977898b90` (parent único
`44342793c30573f38952e58a2c2ab0721065996e`), sem findings. A auditoria foi
estática e não reexecutou os testes; a evidência local final permanece 6/6
focais, 281/281 afetados e ampla única 2.411/2.401 PASS/0 FAIL/10 SKIP/0 TODO,
`valid=true`, `candidate_unchanged=true`. Não repetir essa ampla sem mudança
causal. O código não encerra N02-G nem NEXT-02 global.

Próximo recorte após retomada: diagnóstico-only de `M-16#1#2 / similar_event_ids`,
confrontando contrato, grafo, binding e observações instrumentadas. A sonda não
é critério de aceitação e não autoriza copiar `actual` para `expected`. Exigir
decisão normativa antes de eventual alteração de runtime/corpus, seguida de
REDs, testes afetados, uma ampla estável e auditoria independente do novo código.
Preservar `.codex-temp`; sem GO global, NEXT-03, deploy, produção ou dados reais.

2026-09-25 — DIRECT-EVENT: parecer final APTO DOCUMENTAL PARA IMPLEMENTAR
recebido para 44342793c30573f38952e58a2c2ab0721065996e, parent único
3d343696482136ff4c5535e81776d3ed04c44f7e, zero C/H/M/L. Diferentemente do
parecer do helper, esta revisão julgou explicitamente a suficiência normativa
das cinco proposed_derivation. Revisão estática, não execução externa de testes.

Implementação focal em preparação: aplicar exatamente a proposta v2 congelada
nos cinco grafos, preservando proof e todo o resto do corpus; separar as quatro
fórmulas no metricDirectReads. Referências meramente nominais usam scalar+follow
admitido, sem leitura incidental do payload alvo. Target-card compara identidade
e versão. Correspondence observa keys contra a projeção fechada do schema e não
consome card/ref; amount exige neutral.invoice_payment. Guards continuam reais.
REDs, integração com expected congelado antes da execução, afetados e ampla
única estável são pré-requisitos para nova auditoria independente de CÓDIGO.
Nada nesta aprovação documental encerra o código, N02-G ou NEXT-02 global.

Validação local do candidato DIRECT-EVENT concluída: 6 focais e 281 afetados
PASS, sem FAIL/SKIP/TODO. Ampla única: 2.411 testes / 2.401 PASS / 0 FAIL /
10 SKIP / 0 TODO; valid=true, candidato inalterado. Evidência em
docs/audit-evidence/n02g-causal-authoring-profile/direct-event-validation.json;
helper confere hashes testados e igualdade integral da aplicação das cinco
propostas congeladas. Erros intermediários de harness/formatação/pins históricos
estão preservados, não ocultados. Código ainda exige revisão independente do
novo SHA. A aprovação documental anterior não aprova este runtime.

### Histórico — decisão normativa antes da resposta final

2026-09-25: APTO independente recebido para o endurecimento documental
3d343696482136ff4c5535e81776d3ed04c44f7e, sem findings no delta; não execução
externa dos testes. Confronto local de identidade/helper PASS. Esclarecimento
do auditor confirmou que a suficiência normativa das cinco proposed_derivation
NÃO foi concluída. Não usar o APTO do helper como aprovação dessa composição.
Decisão específica em docs/audit-evidence/n02g-causal-authoring-profile/
direct-event-composition-decision.md, com projeção imutável limitada a cinco
claims/quatro contratos. Sem novo desenho: julgar as mesmas cinco propostas
antes de aplicá-las. Futuro candidato de código e auditoria própria continuam
obrigatórios; corpus/runtime/contratos preservados até esta revisão normativa.

Endurecimento documental DIRECT-EVENT v2, parent 12d93ee1d9388bda9c5f704b0062f8b97d1b0dd5:
o NÃO APTO focal confirmou ausência de checagem nominal da categoria e fechamento
incompleto das keys no helper. Corrigir por restrição nominal declarativa e
confronto de todas as keys com properties do schema fixado, sem novos reads,
sem alteração da composição ou do delta simulado. REDs reproduzidos; helper
--check PASS com 57 negativos, 15 renames e 10 invariâncias. Cinco registros
propostos/provas/fontes iguais ao parent. A nova revisão é documental do helper,
não auditoria nem aprovação de runtime. Ampla financeira não repetida.
APTO confrontado continua obrigatório antes de aplicar qualquer proposta.

DIRECT-EVENT v1 (f51b32f4f6a57364ddac1cb7e0282af7017a5d4a) recebeu NÃO APTO.
Confronto confirmou conta derivacional obrigatória em invoice_payment_amount
e referências excedentes nos outros contratos. A v1 não foi aplicada.
Proposta substituta em docs/audit-evidence/n02g-causal-authoring-profile/
direct-event-proposal-v2.md: perfil completo por métrica, sem input de trace,
delta simulado de cinco grafos (71 intactos), proof integral preservada;
keys válido, account_id acrescentado em amount, referências não causais retiradas.
Correspondence separado de target_card requer julgamento explícito do auditor.
Helper v2 protege canonicalValue e testa a composição completa. Nenhum runtime,
contrato ou corpus modificado nesta etapa; APTO documental ainda pendente.

Histórico da v1 rejeitada: DIRECT-EVENT aberto em 2026-09-24 após fechamento PAYMENT-REFERENCE.
Proposta documental (não aplicada) em
docs/audit-evidence/n02g-causal-authoring-profile/direct-event-proposal.md.
Cinco claims/quatro métricas: balance_delta, invoice_payment_amount,
invoice_payment_target_card e statement_payment_correspondence. Antes do código,
revisar a composição de referências admitidas versus payloads/proof e a adição
de uma observação keys exigida pelo contrato de ausência de vínculo a fatura.
Helper gera projeção dos fontes fixados e delta separado; não lê trace/resultado
nem altera normativa. APTO documental, se obtido, não aprova implementação.
Demais métricas/derivados e gate global permanecem abertos.

Recorte PAYMENT-REFERENCE (2026-09-24, base 151816b6e02a500754aaf72796755ed693f39907):
adequar exclusivamente metricEffects aos contratos já autorados. O cálculo
consumption_effect/event não consome conta/cartão; a prova econômica continua
separada e obrigatória. invoice_payment_consumption_effect observa o scalar
settles_card_id e sua relação admitida sem consumir o payload do cartão.
Não modificar os 76 grafos, expected, proof, contratos, seleção ou fórmula.
Três propriedades focais cobrem kernel gerado, guards, integrações e retirada
de observações reais. O pin histórico de metricEffects mantém predecessor e
sucessor explícitos, sem reescrever a proposta já auditada. A aprovação deste
recorte exige afetados, ampla única estável e revisão independente de código;
sucesso aritmético isolado nunca aprova a neutralidade econômica de um claim.

Validação local concluída em 2026-09-24: RED 3 FAIL, focal 3 PASS, afetados
finais 252 PASS e ampla única 2.405/2.395 PASS/0 FAIL/10 SKIP/0 TODO,
valid=true, candidato inalterado. Primeira bateria afetada teve uma falha de
pin histórico; preservada na evidência e resolvida por sucessão explícita do
único fonte alterado, sem atualizar a proposta histórica. Helper confere 96
arquivos protegidos e hashes testados; não autentica execução externamente.
Auditoria independente recebida em 2026-09-24: APROVÁVEL exclusivamente para
09cb5f1cc9994373364c083f6b82e8d7b8534efb, parent 151816b6e02a500754aaf72796755ed693f39907,
sem findings causais. Revisão estática dos fontes e da transformação fonte→projeção,
não reexecução das suítes nem leitura integral do grande graphs-v2.json pelo
auditor. Confronto local de identidade, código e helper --check concluído. Recorte
PAYMENT-REFERENCE encerrado focalmente; prosseguir diagnóstico residual N02-G.
Sem GO global, NEXT-03, deploy, produção ou dados reais.

Retomada em 2026-09-24: recorte transfer scope aprovado focalmente no código
98de8ef46ab2e0c3ee58a326a073322367cedbdf após evidência auxiliar 07445669841a1526809d2c95df8913a7516bb66e.
Focais/afetados e ampla local preservados (2.392 PASS, 0 FAIL, 10 SKIP).
Auditoria estática independente não equivale a reexecução das suítes. Não repetir
suíte verde nem ampliar o plano na retomada. Ponto exato, hashes e evidência em
docs/agent-memory/workstreams/financasbot-next-02-n02g.md. N02-G sem GO global.
Base: `aea4ac31e358ed8d8907e78f6002c8bb80233bc8`.
Branch: `codex/financasbot-n02g-provenance-engine-20260911`.
Worktree: `.codex-worktrees/financasbot-n02g-provenance-engine`.

Revisão focal do charter `8c1f1302803d625ddfc48f47d60d8c8416d5dee7`:
APROVÁVEL, sem findings. Parecer/recibo publicados no canal em
`7d445d9bbc8567758c8afdd2e96d25366adf582e`. Esta aprovação não cobre código
posterior nem antecipa o gate executável integral abaixo.

## 1. Objetivo e pré-requisitos

Implementar a abstração aprovada de provenance para o conjunto integral dos
76 grafos, com execução determinística, observação externa, claims ligados à
invocação e propriedades geradas. N02-G é uma fatia de NEXT-02; seu PASS não
substitui o gate global do vertical.

N02-F aprovou documentalmente o candidate
`a09482485ef5d51f2391d4d773d4738f74246f71`, parent
`ef04368c95af33a12c0e8b5b286c0e0b01ae27f8`. A, B e consolidação C, incluindo
os recibos, estão no commit de canal
`aa3a2caad6051ae8702dcffa2ef87d8674e8cf0f`, em
`docs/agent-memory/workstreams/results/FIN-NEXT02-N02F-AUDIT-{A,B,C}-20260911.md`.
Evidência auxiliar: `9b0808bb11f00dda973eab845081a5f0ffc74194`; ela não é
código de produção nem uma nova revisão do candidate.

Autoridades: CP-02 (`financasbot-cp02-closure-inventory-v1.md`), G07/G08/G11/G14;
NEXT-00 (`financasbot-next-00-provenance-graph-design-v1.md`), §§5–14 e sua
ratificação; os contratos em `docs/contracts/next/provenance-v2/`; Model Data
Boundary §§3–5. Este charter aplica essas decisões, sem alterar sua ordem.

## 2. Escopo completo e relação com o roadmap

| Obrigação CP-02 | Entrega exigida nesta fatia |
|---|---|
| G07 | Compiler genérico, resolução closed-world, onze obrigações, fingerprints, predicados, conjuntos e arestas para 76/76 grafos |
| G08 | 39 evaluators do corpus sintético, roles/contratos, roots executáveis reais, loader/host, proxy e recorder externos com canais R/I/M/L/T |
| G11 | Mutações derivadas do schema/IR/registries, isolamento causal e expected_violations exato; ausência de witness bloqueia |
| G14 | Identidade estática e por execução, binding de R ao claim, pais validados, projeção pública por request e verificação antes da resposta |

Os 39 evaluators permitem provar o corpus histórico inteiro. Isso não abre
tools/adapters de domínios futuros: a superfície de produto continua a consulta
sintética de gasto já existente. Semântica histórica do corpus e lentes atuais
do read model conservam contratos explícitos; não se força equivalência entre
event_date, statement_due/competence e billing_period.

G05/G06/G09 continuam exigindo suas decisões e provas financeiras específicas.
Executar derivados históricos aqui não fecha automaticamente G09 para todo o
vertical. G10 precisa do mapa de casos críticos e G13 do gate global. CP-03
vence após GO global NEXT-02 e antes da implementação de adapter real de
Sheets/Dashboard, conforme o suplemento; CP-04..CP-07 permanecem preservados.

## 3. Entrega inicial e inventário de implementação

Este commit de abertura altera somente o charter, checkpoint e linha no índice.
A revisão focal do charter decide completude do escopo e interfaces; não repete
N02-F nem aprova código ainda inexistente. A implementação começa após esse
confronto, sob a autorização prévia de continuidade de Daniel.

Inventário inicial proposto de novos módulos sob `src/next/provenance/`:

- `packageContract.js`: documentos e versões locais, sem lookup de rede;
- `graphCompiler.js`: tipos, referências, DAG, obrigações e IR imutável;
- `proofOperators.js` e `civilCalendar.js`: registry finito e relações civis;
- `instrumentedAccess.js`: handles e emissão de eventos I;
- `causalRecorder.js`: único estado L e projeções T;
- `executionHost.js`: invocação, canal funcional R e associação confiada;
- `artifactLoader.js`: bytes admitidos e medições M;
- `metricEvaluators.js`: dispatch de cálculo dos 39 contratos, fora da prova;
- `claimBinding.js`: identidade, recibo validado, DAG e refs efêmeras;
- `proofAcceptance.js`: avaliação das obrigações e violações por átomo;
- `mutationWitnesses.js`: geração determinística e isolamento dos mutants.

Ferramentas previstas: `scripts/agent/buildNextProvenanceArtifacts.mjs` e
`scripts/agent/validateFinancasBotNextProvenance.mjs`. Registros de execução e
manifesto de freeze ficam em `docs/contracts/next/provenance-execution-v1/`,
com inventário exato definido antes da geração. Artefatos de build são
reproduzíveis; nenhum root placeholder é aceito.

Integração permitida, quando o motor integral estiver provado: `src/next/`
`kernel/expenseReadModel.js`, `conversation/conversationGateway.js`,
`policy/typedEvidenceVerifier.js`, `tools/readOnlyToolGateway.js` e
`contracts/modelDataBoundary.js`. Ajustes de inventário/pins ficam nas policies
NEXT-01/NEXT-02 existentes e são explicitamente revisados no delta final.

Testes novos sob `tests/next/provenance/` e entry
`tests/nextProvenance.test.js`; testes herdados afetados em `tests/next/` e
`tests/next02*.test.js`. Cada arquivo concreto adicional deve ser registrado
no checkpoint antes de criado; isso não concede escrita em qualquer path por
inferência. Mudança de dependência exige necessidade registrada e lockfile
revisado; não há dependência nova escolhida neste charter.

## 4. Reuso com fronteiras verificáveis

| Fonte existente | Reuso previsto | Condição |
|---|---|---|
| `src/next/kernel/canonicalValue.js` | Canonicalização de valores, hashes de snapshots/derivados | Preservar tipos/rejeições; incluir dependências no closure pertinente |
| `observationKernel.js`, `installmentSchedule.js`, `expenseReadModel.js` | Cálculo de gasto/parcelas/lentes atuais | A execução provada deve observar os reads reais; clonar inputs antes do proxy não é instrumentação |
| `scripts/agent/validateFinancasBotNextFacts.mjs` | Comportamento revisado das métricas históricas | Extrair/adaptar cálculo puro; nunca importar a função que lê oracle e forma expectativas para dentro do motor |
| Schemas, registries, claims e grafos N02-F | Contrato completo de autoria | Preservar os objetos auditados; diferenças necessárias exigem justificativa e nova revisão |
| Policies de validação e TestsStream atuais | Inventário, Git binding e IDs executados | Ampliar conjuntos concretos; não converter regex/contagens em prova semântica |
| Budget, sessão/CAS e gateway aprovados | Limites operacionais e contexto confiado | Preservar limites, concorrência e recusas antes de efeitos |

O recorder sanitizado NEXT-01 continua observabilidade operacional. O tripwire
de replay não é a fronteira de isolamento completa do novo runner. Os pins
CP-01 provam identidade de fontes revisados, não substituem roots e observação.

## 5. Fluxo de execução e autoridade

Compile valida schema/versões, unicidade global e local, tipos/paths, fontes,
relações, roles, DAG, onze obrigações e doze átomos. O IR abrange os 76 grafos
e não contém resultados do oracle. Authoring pode ser compilado para validação;
não pode ser executado ou aceito como registry de execução.

O build mede bytes efetivos e gera roots de closures completos. Contratos usam
SHA-256 de seus bytes UTF-8 exatos; canonical JSON aplica-se somente aos
preimages que o contrato define assim. O empacotamento deve preservar bytes
publicados, inclusive line endings, em vez de normalizá-los implicitamente.

O registry de execução é a única resolução normativa de id/version para
contract hash, artifact root e roles. A vinculação inicial dos artefatos recebe
revisão própria. O freeze referencia o hash do registry e, separadamente,
proof_engine_artifact_root e validation_tcb_root. Artefatos ainda inexistentes
permanecem pendentes; não se promove authoring por flag.

O host cria execution_id e fornece somente handles instrumentados aos
evaluators/operators. Proxy emite I, loader mede M, recorder materializa L e
projeta T; evaluator retorna R. Nenhum R/intermediário é copiado para L/T.
Observações incluem valor e estrutura, existência/ausência, keys, ordem,
iterator, índice, membership, cardinalidade, seleção, traversal e término.
non_material é inacessível. O recorder não recebe trace_contract como roteiro
para fabricar observações; só os validadores confrontam expectativa e log.

O proof engine não conhece métricas/fact_keys; apenas o metric evaluator faz
dispatch de cálculo. O oracle entra somente no result validator do harness,
após R, e não é importado pelo compiler, proof engine ou evaluators. Na consulta
de produto não existe oracle disponível: o host exige cálculo sob artefato
revisado e sua prova, sem construir uma expectativa do próprio R.

Pais precisam de recibo interno validado da mesma execução. O result_hash
derivado segue o preimage de graph-binding-contract-v1.md, §5, incluindo
descriptor, roles e hashes dos pais. Troca de pai/invocação com valor igual é
recusada. Referências públicas são opacas, efêmeras e resolvidas somente no
request correspondente; não derivam de fact_key, hash estável ou contador global.

## 6. Isolamento e integração: condições antes de conectar

Na primeira entrega técnica deve existir prova causal da fronteira de execução:
closure fechado, ausência de I/O/globais/relógio/aleatoriedade não declarados,
sem objetos crus, sem canais mutáveis para trace e sem loader fora do root.
A tecnologia concreta de isolamento será registrada com seu modelo de ameaça
e REDs antes de executar os evaluators. `node:vm`, worker, processo separado ou
hash isoladamente não constituem prova de hermeticidade. Se a solução disponível
não cumprir o contrato ratificado, registrar bloqueio; não reduzir a alegação
para continuar. Runtime/CI externos permanecem a fronteira declarada em NEXT-00.

A integração de gasto deve mapear observações reais do read model sintético
para os kinds/campos materiais do contrato, gerando bindings a partir do request
confiado e dos dados, nunca escolhendo um fact_key do Golden pelo resultado.
Fixar uma tabela explícita de compatibilidade de campos e lentes antes de
alterar a boundary; dado material sem representação impede essa integração.
Conservar testes das duas semânticas quando corpus histórico e kernel diferirem.

O host associa R/claim/prova antes de projetar o ClaimEnvelope e antes do CAS
de resposta. Reprovação, identidade ausente, replay entre requests ou prova
ausente impedem entrega. Os checks herdados podem permanecer como defesa
adicional, mas não autorizam fallback para um caminho sem prova.

## 7. Sequência interna e REDs obrigatórios

1. Inventário/IR e admissibilidade: 76 fact_keys exatos, 39 entradas, 23 kinds,
   115 snapshots e 32 operadores da base. Duplicata, omissão, extensão desconhecida,
   schema/registry divergente, referência inválida, ciclo e non_material rejeitados.
2. Fronteira de execução e build: medir closures, provar observação externa e
   separação de canais. Alterar helper/transformation/config, ler fora do proxy,
   tentar autodeclarar trace ou trocar invocação com mesmo R deve falhar.
3. Operadores e evaluators: implementar todos os contratos; conferir datas civis,
   filtros/exclusões, estado e cálculos históricos. Witness discriminante para
   ordem dos roles/fórmula coincidente, sem usar somente valores do Golden.
4. Aceitação/DAG e G14: executar 76/76, provar pais, igualdade exata de reads,
   seleções/arestas e binding de identidade; testar troca de claim/resultado,
   ausência de identidade e referência pública cruzada entre requests.
5. Mutações: derivar o inventário de propriedades do schema/IR/registries;
   reparar fingerprints nos mutants semânticos e comparar expected_violations
   exato. Testar também remoção de input_evidence_state e duplicatas globais,
   cobrindo as duas limitações do helper A sem modificar a evidência histórica.
6. Conectar o caminho de gasto depois dos itens anteriores completos; gerar
   evidência das recusas, revalidar herança e preparar candidato integral.

Essa sequência é de construção, não rollout nem aprovações por domínio. Um
compiler verde sozinho não encerra G07/G08/G11/G14. O gate final não oferece
modo de PASS parcial, skips ou redução de cardinalidade.

## 8. Saída e economia de validação

Cada classe de drift deve produzir RED causal antes da implementação. No
desenvolvimento executar syntax/focal/afetados. Congelar um candidato estável,
executar uma única suíte hermética ampla e publicar SHA/parent com árvore limpa.
Quando a ampla começar, registrar seu identificador/log e pausar conforme a
preferência de Daniel; não consumir uso fazendo polling da suíte.

Gate específico deve exigir conjunto integral de fontes/artefatos, roots reais,
76/76 grafos executados e resultados confrontados com oracle independente;
39/39 entradas executáveis com witnesses; obrigações e trace exatos;
expected=generated=executed=matched para todas as mutações enumeradas. Contagens
de mutations vêm do IR; os números do corpus são apenas âncoras de inventário.
Qualquer UNSATISFIED_MUTATION_WITNESS bloqueia. IDs de testes derivam de eventos
estruturados de execução sem skip/todo e não de texto TAP ou presença no source.

Preservar 25 properties NEXT-01 e 64 N02-E, além dos testes afetados de G14.
Não contabilizar os 10 skips históricos como PASS. Fixar um modo imutável no
gate, com expected-head/parent, arquivos tracked, escopo exato e worktree limpa.
Reauditoria independente do candidato executável é obrigatória. Se extensa,
dividir por fronteiras com mapa de cobertura e consolidação no mesmo SHA.

GO de N02-G fecha somente as obrigações demonstradas acima. G05/G06/G09/G10/G13
e CPs posteriores continuam na fila. Produção, dados reais, adapters reais,
writers e NEXT-03 não pertencem a esta entrega.
