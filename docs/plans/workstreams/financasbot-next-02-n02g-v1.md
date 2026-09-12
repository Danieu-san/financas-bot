# N02-G — execução integral de provenance

Data: 2026-09-11. Estado: CHARTER PROPOSTO; REVISÃO FOCAL DE ESCOPO PENDENTE.
Base: `aea4ac31e358ed8d8907e78f6002c8bb80233bc8`.
Branch: `codex/financasbot-n02g-provenance-engine-20260911`.
Worktree: `.codex-worktrees/financasbot-n02g-provenance-engine`.

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
