# N02-G — checkpoint

Atualização: 2026-09-18. Estado: CORREÇÃO NORMATIVA N02G-SB-001 AUTORIZADA E IMPLEMENTADA COMO CANDIDATO; SEM GO EXECUTÁVEL.
Base: `aea4ac31e358ed8d8907e78f6002c8bb80233bc8`.
Branch: `codex/financasbot-n02g-provenance-engine-20260911`.
Worktree: `.codex-worktrees/financasbot-n02g-provenance-engine`.
Plano: `../../plans/workstreams/financasbot-next-02-n02g-v1.md`.

Daniel autorizou continuidade e selecionou Astra/Alto. N02-F está encerrado
documentalmente em A+B+C; seus recibos estão no commit de canal
aa3a2caad6051ae8702dcffa2ef87d8674e8cf0f. Não reauditar esse mesmo candidate.

Objetivo: execução integral de provenance, G07/G08/G11/G14, para os 76 grafos,
preservando CP-02 e CP-03..CP-07. A abertura foi somente documental; após a
aprovação do charter, a implementação começou nesta worktree isolada.

Confronto local: canonicalValue pode ser reaproveitado para seus preimages;
hashes documentais exigem bytes exatos. O validador v1 mistura funções de
cálculo/oracle e não pode ser importado como evaluator. Gateway/verifier atuais
ainda usam claim reduzido; a migração de G14 exige binding ao host e projeção
pública antes de resposta/CAS. Pins CP-01 e tripwire não substituem o novo TCB.

O charter fixa entrega integral, módulos propostos, reuso, REDs e gate final.
Dois detalhes técnicos são pré-condições explícitas da implementação: demonstrar
isolamento do runner sob o contrato vigente; mapear campos/lentes do read model
para kinds de provenance sem alias ou escolha de fato pelo resultado.

Candidate documental publicado e confirmado no remoto:
`8c1f1302803d625ddfc48f47d60d8c8416d5dee7`, parent igual à base acima.
Validação local: agent-workflow OK, diff --check OK, três documentos;
nenhuma suíte funcional reexecutada, pois não houve alteração funcional.

Canal reservado em `2e672e78335491fc0463e85aec5216863847249a`, CHAT_WORKING,
state hash `e20b4d799ee8f6faf71e71044c56d57dbca653fdafb71aeb26cd833bf31ec3b3`.
Retorno solicitado: `FIN-NEXT02-N02G-CHARTER-RETURN-20260911`.
Uma tentativa pelo bot foi executada; exit 1, entrega NÃO CONFIRMADA por
ausência de id persistido do turno. Isso não prova ausência de envio. Janela
preservada; não repetir automaticamente. Prompt local ignorado pelo Git em
`logs/n02g-charter-audit-prompt.txt`. Não houve bloqueio de segurança relatado.

Retorno confirmado: parecer APROVÁVEL, sem findings, para o charter 8c1f130.
Recibo validado/publicado no canal em
`7d445d9bbc8567758c8afdd2e96d25366adf582e`, CHAT_READY da mesma tarefa.
A tentativa do bot chegou ao auditor apesar do erro de confirmação local.
O manifesto de recibo foi encerrado antes de retomar esta worktree.

Primeiro incremento técnico autorizado neste checkpoint:
- `src/next/provenance/packageContract.js`;
- `tests/next/provenance/packageContract.cases.js`;
- `tests/nextProvenance.test.js`.
Próximo incremento registrado antes da criação:
- `src/next/provenance/graphCompiler.js` (primeiro, somente índice/DAG);
- `tests/next/provenance/graphCompiler.cases.js`.
O índice não emite IR executável nem aprovação semântica. Seus REDs usam as
76 identidades do contrato v1, sem carregar valores do oracle.
Integração de admissão/índice: novo teste
`tests/next/provenance/authoringIndex.cases.js`; resolve somente documentos já
admitidos, confere hashes entre autoridades, schemas e DAG. O resultado ainda
é índice de autoria, não prova nem IR executável.

Build de schemas: registrar `scripts/agent/buildNextProvenanceArtifacts.mjs`,
`tests/next/provenance/schemaBuild.cases.js` e artefato estático
`src/next/provenance/schemaValidators.generated.js` (ainda não materializado).
Ajv 8.17.1 é dependência dev fixada em package.json/lockfile, apenas para gerar validadores draft-07;
`ajv-formats` 3.0.1 também é dev: os schemas usam date/date-time e o primeiro
RED de build rejeitou esses formatos sem plugin. Não desabilitar sua validação.
Não compilar schemas dinamicamente no runner. Helpers transitivos gerados
precisam integrar o closure antes de admissão executável. Referência técnica:
https://ajv.js.org/standalone.html. Não se introduz um interpretador próprio.
Limite: admissão de bytes por inventário/identidade fornecidos pela autoridade
confiada; não valida schema/semântica, não compila IR nem executa evaluator.
O módulo não faz filesystem/network lookup e não gera seus próprios hashes
esperados. Testar RED antes da implementação, inclusive alterações de bytes,
inventário, paths, UTF-8 e mutabilidade. Schema/IR permanecem próximos.

Implementação local inicial: admissão por inventário/bytes com objeto marcado e
imutável; build dos seis schemas, sem coerção/defaults/remoção de campos;
índice/DAG de 76 grafos, 39 evaluators e seis vínculos de pais; verificação
estática dos fingerprints de 115 snapshots, arestas e materialidade dos reads.
O código estático emitido pelo Ajv foi executado nos testes de build. Isso não
é execução de evaluator nem prova de isolamento. O artefato gerado permanece
em memória; não foi publicado como closure de execução.

Os schemas compõem restrições em allOf/oneOf/$ref: lints opcionais de autoria
Ajv não substituem draft-07. strictSchema e strictNumbers continuam ativos;
required, type, maximum e formatos têm controles negativos. Não houve mudança
dos schemas auditados. Os seis pacotes novos do lockfile são dev-only; somente
a entrada raiz preexistente mudou. Instalação usou --ignore-scripts.

Limites abertos: projeção schema↔material registry, resolução nominal completa
dos argumentos/paths, predicados/obrigações, seleção e temporalidade, IR final,
isolamento, roots, recorder, evaluators, witnesses e G14 não estão concluídos.
Os inventários/pins dos gates antigos ainda não foram ampliados; não reportar
PASS herdado enquanto a integração N02-G estiver em desenvolvimento.

Validação do primeiro incremento publicado em
`0d6c2397b81dd2490f2c6fb1fff03c7329893ec7`: 20/20 testes focais PASS,
0 FAIL/SKIP/TODO; syntax checks e agent-workflow OK; diff --check OK.
REDs iniciais de módulos ainda ausentes foram observados; ajustes de build e
integração foram testados focalmente. Suíte ampla não iniciada: ainda não há
candidato estável para o gate integral. Commit WIP não é candidato final,
aprovação parcial nem pedido de nova auditoria.

Segundo incremento local: passe estrutural ligado à admissão/índice, cobrindo
76 grafos/152 fases, referências, onze obrigações, partição das seleções,
materialidade e paths escalares. Proof deve ler todos os candidatos; derivation
pode consumir somente um operando previamente vinculado. A diferença em
S-16#1#1 foi confrontada com o helper imutável N02-F em 9b0808b; não é finding
novo nem motivou alteração dos grafos. Pais validados são exigidos nas duas fases.

Unificador interno cobre as 32 assinaturas, sem conversão entre IDs nominais,
unidades ou set/sequence. Integração atual: 28 referências de templates com
hash canonical da entrada, id/versão, parâmetros exatos, corpo conjuntivo,
tipagem dos bindings e kind dos membros. Literal type/value agora é validado,
inclusive datas civis reais; o schema sozinho aceita combinações incompatíveis.
Calendário civil puro implementa parsing, ordinal, offsets sem clamp, limites
de mês e cardinalidade inclusiva; não lê relógio/timezone do processo.

Evidência local do segundo incremento: 39/39 testes focais PASS, 0 FAIL,
0 SKIP/TODO, agent-workflow OK. Inclui REDs observados antes de criar módulos,
mutantes de referência/obrigação/seleção, incompatibilidade nominal, adulteração
de templates e datas/literais inválidos. Ampla não iniciada. Sem alteração dos
documentos de autoria ratificados, dependências, runtime v1, transporte ou canal.
O limite de uso interrompeu uma chamada de teste; a retomada executou o RED e
os testes reais depois que a ferramenta voltou a funcionar.

Limites ao fim do segundo incremento: a unificação ainda não estava aplicada a todos os argumentos
dos predicados externos aos templates; associação semântica operador/operando/
obrigação, projeção schema↔registry, lowering de paths estruturados e typed IR
continuam pendentes. Não aceitar este estágio de índice como IR executável.
Instantes/literais exigem offset explícito; conversão de timezone, incluindo
freeze de suas regras, não está implementada. Nenhum novo GO foi emitido.

Terceiro incremento, sobre `8c156556d4e83a72c17a1fb7b91a44565d6e1c95`:
resolução nominal dos 11.456 predicados dos 76 grafos ligada à admissão/índice.
Claims resolvem paths pela branch discriminada do schema admitido; fields
resolvem no material registry. IDs de subject usam kinds nominais explícitos,
incluindo source→source_state, merchant→merchant_identity e
transfer_pair→transfer_identity, nunca inferência por coincidência do valor.
Collections derivam kind da origin registrada e conferem cada membro; sets
vazios recebem tipo somente por relações tipadas explícitas. Unidades,
enum domains, tipos civis, limites de janela e policy são confrontados.
positive/nonnegative são refinamentos do mesmo domínio inteiro; money_minor
permanece domínio separado com unidade. Não há conversão de strings/números.

O passe emite somente IR parcial de predicados, imutável e com sources
autorados copiados defensivamente; não copia payload/valores dos snapshots,
resultados financeiros ou provas. Índice continua indexed_authoring_only.
Partial policy sem autoridade admitida falha explicitamente; não criar
permissão parcial por fallback. Templates e predicados de datas rejeitam
registry_snapshot/request_execution como períodos civis.

Validação do terceiro incremento: bateria integrada final 49/49 PASS após o
endurecimento de períodos, 0 FAIL/SKIP/TODO; bateria afetada anterior 18/18 PASS.
RED de módulo ausente observado. Mutant schema-valid com hash reparado chega
à recusa nominal na integração; não depende de fingerprint quebrado.
Ampla não iniciada; nenhum gate antigo, dependência, canal ou produção alterado.
Pendências: associação semântica completa entre operador/operandos/obrigações,
projeção schema↔registry, lowering composto e IR integral; depois isolamento,
roots, recorder, evaluators, witnesses e G14. Não há GO executável.

Próximo incremento registrado antes da criação: `src/next/provenance/graphStructure.js`
e `tests/next/provenance/graphStructure.cases.js`, integrados ao índice e ao
entry focal existentes. Escopo: referências fechadas, paths materiais,
associação de predicados/obrigações e partição das seleções. Não constitui
execução de predicados nem prova causal dos reads declarados.
Complemento de tipagem registrado: `src/next/provenance/operatorTypes.js` e
`tests/next/provenance/operatorTypes.cases.js`. Unificar assinaturas do registry
com descritores internos tipados, sem resolver identidade a partir de valores
coincidentes nem executar operações. A resolução dos descritores a partir do
pacote admitido é um passe posterior, obrigatório antes de IR executável.
Registrar também `src/next/provenance/templateReferences.js` e
`tests/next/provenance/templateReferences.cases.js`: resolução de id/versão/hash
canonical da entrada de template, fechamento dos parâmetros e corpo conjuntivo.
O pacote precisa admitir `predicate-templates-v1.json`; não buscar referências
ausentes no filesystem. Tipagem completa dos argumentos continua separada.
Registrar `src/next/provenance/civilCalendar.js` (já previsto no charter),
`src/next/provenance/literalTypes.js` e seus testes homônimos em
`tests/next/provenance/`: datas civis puras e validação de literal type/value.
Não inclui timezone, relógio implícito nem civil_date_matches; conversão de
instantes ainda depende da escolha/freeze das regras de timezone.

Incremento registrado: `src/next/provenance/predicateTypes.js` e
`tests/next/provenance/predicateTypes.cases.js`, com integração ao compiler
existente. Resolve argumentos dos 76 grafos pelas autoridades admitidas,
incluindo schema de claim e tipos nominais de referências/coleções. Não
inferir domínio de ID pelo texto de seu valor; ausência de tipo falha fechado.
O pacote passa a admitir também `claim-contract.schema.json` como autoridade
de paths do contexto. Esses passes ainda não autorizam execução.

Quarto incremento registrado antes da criação:
`src/next/provenance/schemaRegistryProjection.js` e
`tests/next/provenance/schemaRegistryProjection.cases.js`. Projeta a grammar
fechada do registry no formato estrutural revisado do snapshot schema e exige
igualdade integral de kinds, campos, required e restrições, sem escolher uma
autoridade mais permissiva. Reutiliza tipos compartilhados do claim schema;
não é interpretador JSON Schema nem prova de equivalência de schemas arbitrários.
Integração admite também `evidence-snapshot.schema.json` no pacote. Os
validadores executáveis continuam dependentes do build/closure ainda pendente.

Registrar também `src/next/provenance/obligationBindings.js` e
`tests/next/provenance/obligationBindings.cases.js`: primeiro passe de vínculos
necessários derivados dos nós/arestas/payloads, cobrindo identidade, fingerprints,
leituras materiais da prova e target de cada aresta. Não confundir esse passe
parcial com suficiência das onze obrigações ou com execução dos predicados.

Quarto incremento implementado sobre `86fe1dc15e76684df0a87879f50b55a3449772e9`:
projeção estrutural exata dos 23 kinds/113 campos, incluindo grammar fechada,
envelope, required, enums, limites inteiros e tipos compostos. ID/date/month
reutilizam a autoridade do claim schema; equivalência de formas arbitrárias
não é inferida. Nenhum documento ratificado foi modificado.

Vínculos necessários derivados dos grafos/payloads: 2.284 ocorrências de nós
snapshot nos 76 grafos (não 2.284 snapshots distintos), 4.422 arestas materiais
e seis vínculos de pais. Remover predicado e suas referências não apaga a
obrigação; citar a prova de outra aresta não atende o target; todos os campos
materiais presentes e keys precisam constar no contrato de proof. Comparação
de dinheiro, mesmo nominalmente bem tipada, não prova node_identity.
Esse passe ainda não prova execução, seleção causal ou suficiência de todas
as onze obrigações. Seus resultados permanecem de compilação parcial.

Validação: REDs de módulos ausentes observados; projeção+integração 10/10,
vínculos 7/7 e bateria focal integrada final 63/63 PASS, 0 FAIL/SKIP/TODO.
Inclui mutantes integrados com hashes reparados que alcançam especificamente
schema_registry_projection e obligation_binding_semantics. Syntax e diff
--check OK. Ampla não iniciada; sem mudanças de dependências/gates herdados,
autoria ratificada, canal, runtime v1 ou produção. WIP, sem pedido de auditoria.

Quinto incremento registrado antes da criação: `src/next/provenance/operandBindings.js`
e `tests/next/provenance/operandBindings.cases.js`. Resolver os 277 bindings
autorados pelo input_kind/cardinality do registry, preservar ordem e IDs de
roles por referência, confrontar aliases/value_input e contrato funcional.
Não materializar receipts de pais, resultados ou autoridade executável.

Quinto incremento implementado sobre `0cf182e1baeaa599f88b3217fc5824391629a3f6`:
os 277 bindings/76 grafos resolvem input_kind e cardinalidade pelo registry;
aliases precisam existir como snapshots value_input, sem duplicatas. A união
dos aliases ligados coincide com value_input; pais resolvem sua própria aresta
derived_from e fact_key. Ordem dos roles e dos operandos é preservada, sem
sort/dedup. O índice imutável armazena role_ref, não cópia normativa de roles,
hashes ou roots. Binding resolvido não é evidência de read nem receipt de pai.

Os 39 contratos funcionais são confrontados com metric/unit do registry e
combinação unit/output kind. Resultado financeiro e oracle continuam fora.
RED de módulo ausente observado; bateria afetada 12/12 e integrada final
70/70 PASS, 0 FAIL/SKIP/TODO. Mutant integrado troca claim_context por node com
schema válido e hashes reparados; falha em operand_binding_kind. Ampla não
iniciada; não repetir a focal verde sem nova mudança causal.

Sexto incremento registrado antes da criação: `src/next/provenance/claimRequirements.js`
e `tests/next/provenance/claimRequirements.cases.js`. Derivar os bindings
necessários do descriptor de claim, referências nominais de sujeito, período,
time_basis, coverage/evidence_state e leituras de proof. Reusar a resolução
nominal do passe de tipos; nenhum dispatch por métrica/fact_key. As relações
temporais e seleções ainda precisam de execução e prova independentes.

Registrar `src/next/provenance/selectionBindings.js` e
`tests/next/provenance/selectionBindings.cases.js`: vínculo dos predicados
citados pela seleção com o candidato ou suas arestas materiais diretas;
razão de exclusão com a obrigação pertinente; guard de estado por input.
Estado estimated de saída não dispensa input_evidence_state explícito quando
os candidatos possuem estado confirmed/projected. Prova de verdade das
relações e completude financeira da seleção permanecem para a execução.

Sexto incremento validado: vínculos de descriptor/seleção integrados; focal
89/89 PASS, 0 FAIL/SKIP/TODO. A saída da sessão anterior não foi recuperável;
uma execução focal de recuperação confirmou esse resultado. Nenhuma ampla.
São requisitos necessários, não prova de verdade dos predicados. Guard genérico
de evidence_state é derivado mesmo quando não aparece na lista de predicados
de seleção; a relação econômica de compensação usa a categoria do evento
compensado, conforme a autoria revisada, sem dispatch por métrica/fact_key.

Sétimo incremento registrado antes da criação:
`src/next/provenance/authoringIR.js`. Integrar os resultados dos passes numa
representação imutável dos 76 grafos, com referências de autoridade medidas,
operandos tipados, templates expandidos com membro lexical e requisitos de
estado. Manter expectativas de trace separadas de observações; não copiar
payloads, oracle, resultado funcional ou contratos de cálculo para o IR.
O artefato permanece `typed_authoring_ir_only`, não executável. A expansão
não executa operadores nem prova suficiência das obrigações. Testes no arquivo
já registrado `tests/next/provenance/authoringIndex.cases.js`.

Sétimo incremento implementado: IR imutável com 76 grafos em ordem de pais,
11.456 predicados tipados, 277 bindings, 73 seleções e 28 templates expandidos.
Campos de membro permanecem lexicais, limites de janelas e ordem preservados;
expected_trace não é observação. Nenhum payload, oracle ou resultado funcional
é copiado. RED da API ausente observado; integração 13/13 e focal 93/93 PASS,
sem FAIL/SKIP/TODO. Fronteira de execução e suficiência integral ainda pendentes.

Oitavo incremento registrado antes da criação:
`src/next/provenance/collectionRequirements.js` e
`tests/next/provenance/collectionRequirements.cases.js`. Derivar vínculos das
coleções materializadas com fixture, members e conjunto candidato exato;
exigir anchors closed_world/synthetic dos fixtures. Não inferir que todo
conjunto deriva de coleção: grafos de bindings diretos/pais continuam com
obrigações próprias. Esse passe não prova coverage financeira de fontes reais
nem execução das seleções. Integração no compiler antes do lowering.

Oitavo incremento implementado: 55 ocorrências de coleção nos 76 grafos têm
anchors independentes de membership, fixture synthetic/closed_world e conjunto
candidato. A população da coleção coincide com snapshots do kind/origin e
versão correspondente; remover membro e candidato juntos não apaga o snapshot.
Coleção vazia ainda exige a prova de igualdade. O IR conserva também 133
requisitos derivados de estado dos selecionados. Isso não prova completude
de fonte financeira externa nem todas as relações temporais/econômicas.

Revisão adversarial do lowering encontrou perda de tie_break num formato sort
admitido pelo schema, mas não presente no corpus atual. RED direto observado,
campo preservado e controle de ordem/direção/projeção adicionado. Validação
final deste WIP: 103/103 PASS, 0 FAIL/SKIP/TODO; syntax OK; workflow OK;
diff --check OK. Nenhuma ampla iniciada e nenhum GO/auditoria solicitado.
Sem alteração de autoria ratificada, dependências, gates herdados, canal,
runtime v1, produção ou dados reais. Incrementos 6–8 sobre
`021f339b9ca61b574239ecb211891ff3cf013305`, publicados somente como WIP.

Continuidade após WIP `4c3e58c88e39fe81ee87107ef7ea73cf4ed2e47f` publicado:
os contratos funcionais exprimem semântica financeira em texto revisado, não
numa segunda DSL. Não criar um interpretador desse texto no compiler. A
suficiência temporal/financeira restante depende das relações e da execução
instrumentada, preservando os requisitos estruturais já derivados.

Registrar antes de criar a prova de viabilidade isolada:
`scripts/agent/probeNextProvenanceIsolation.mjs` e
`tests/next/provenance/isolationProbe.worker.cjs`. Não é executionHost nem
runner aprovado; não executa os 39 evaluators nem recebe fixtures/dados reais.
Necessidade de dependência: SES 2.3.0 como devDependency exata, install com
ignore-scripts e lock transitivo revisado. Evita inventar isolamento de JS por
regex/AST/vm; a prova experimental não promove a biblioteca a runtime.
Consultar docs oficiais SES/Endo: packages/ses/README.md e docs/lockdown.md.
SES restringe autoridade do compartment e congela intrinsics, mas não limita
CPU/memória sozinho. Worker descartável com timeout externo serve somente à
prova de interrupção; não é sandbox de SO. Compartment recebe somente uma
capability sintética endurecida, sem objetos financeiros crus. Probar ausência
de APIs Node/rede/relógio/aleatoriedade, codegen, escape por constructors,
intrinsics e globals congelados, isolamento entre invocações e interrupção.
Nenhuma conclusão de closure/TCB/observação real decorre desse probe.

Probe executado em Node 22.17.0/Windows: 12 verificações de autoridade PASS,
uma leitura sintética via capability, globals congelados e compartments
independentes; loop infinito interrompido pelo worker host. RED de worker
ausente observado. Direct eval é rejeitado antes da execução pelo SES; seu
caso foi separado para não mascarar os outros probes. Script não aceita código,
URL, path ou dados do usuário como entrada. Não há evaluator financeiro nele.
SES 2.3.0 + três dependências transitivas foram as únicas adições no lock;
todas dev-only, scripts de instalação desativados. Acorn/Ajv inalterados.
Não provar compatibilidade com Node 20 a partir desse teste em Node 22.
Não repetir os 103 testes verdes do compiler sem mudança causal: este
experimento não alterou seus fontes ou dependências existentes. Ampla pendente.

Registro antes da criação: documento de decisão de implementação
`docs/plans/workstreams/financasbot-next-02-n02g-execution-boundary-v1.md`.
Limita-se a aplicar a fronteira ratificada, distinguir probe de enforcement e
ordenar os REDs; não altera autoria N02-F, charter, runtime ou contratos normativos.

Decisão de implementação registrada em 2026-09-12 no documento acima:
SES com processo descartável por grafo, compartments separados por fase e
recorder no host chamador; L único por execução. Receitas/bytes de bootstrap,
SES/wrapper/configuração e dependências integram as fronteiras medidas; nada de
hashear entry e executar helper ambiente. No modo evaluate escolhido, transforms
SES 2.3.0 inspecionados rejeitam ou preservam source; isso ainda exige teste do
perfil empacotado. Sem sandbox de SO ou promessa de disponibilidade absoluta.
Handles revogados antes de inspecionar R; saída não executa getter/coerção/trap.
Recibo só depois de término limpo, depois inicia o próximo grafo do DAG.
Programa de prova gerado não recebe payload/expected_trace como constante.
Ainda é decisão WIP, não prova implementada nem nova ratificação do charter.

Retomada de 2026-09-14: HEAD/remoto `35839dcd4aedb685a9ce9a881b6c1457ce5118d2`,
somente os dois documentos locais da decisão pendentes. Workflow e diff check
confirmados após a interrupção da ferramenta por limite de uso; nada havia sido
commitado nessa interrupção. Registrar antes da criação:
`src/next/provenance/artifactLoader.js` e
`tests/next/provenance/artifactLoader.cases.js`, com entry focal existente.
Primeiro passe somente admite bytes capturados contra root confiado de manifesto
canônico e inventário fechado. Reutiliza canonicalValue; não executa source,
não prova completude semântica do closure nem promove authoring a runtime.
Manifesto é raiz Merkle plana contendo digests dos arquivos; o registry/freeze
fornece a raiz esperada. Nenhuma autoridade é gerada pelo loader.

Admissão inicial implementada em 2026-09-14: raiz do manifesto canônico vinculada
ao inventário e aos bytes de cada arquivo; tipos/entry/paths fechados, captura
imutável, limites de entrada e recibo marcado internamente. Usa canonicalValue
existente sem alterá-lo; loader não resolve filesystem nem executa JavaScript.
RED de módulo ausente observado. Revisão adversarial gerou RED adicional:
Buffer.copy consultava metadata redefinível; substituído por TypedArray.set
sobre slots internos. O teste confirma zero getters/callbacks durante captura.
Focal integrado: 116/116 PASS, 0 FAIL/SKIP/TODO (13 novos + 103 existentes).
Syntax do loader OK. Nenhuma ampla iniciada. Sem mudança de dependências,
canal, autoria ratificada, runtime v1, integração produtiva ou dados reais.

WIP de admissão publicado e remoto confirmado em
`acc53ecbe34782c7cb28f78ad11e316101794308`, parent `35839dcd4aedb685a9ce9a881b6c1457ce5118d2`.
Próximo incremento registrado antes da criação:
`src/next/provenance/executionProfile.js`,
`scripts/agent/nextProvenanceGuestProfile.js` e
`tests/next/provenance/executionProfile.cases.js`.
Perfil congelado de configuração + validação build-time da gramática guest
síncrona. Acorn existente continua somente build/dev. Uma função síncrona de
um parâmetro operands é a entrada guest, sem import/async/generator nem execução
top-level. Não apresentar esse passe sintático como sandbox ou análise semântica.
Registrar também antes da mudança: substituir o helper experimental
`tests/next/provenance/isolationProbe.worker.cjs` por
`tests/next/provenance/isolationProbe.child.cjs`; adaptar o script de probe já
existente para processo descartável e perfil compartilhado. Não criar um segundo
runner concorrente. O probe continua fixo/sintético, sem input de código ou dados
financeiros. Saída só aceita após término limpo; loop deve ser morto pelo pai.

Perfil e restrição gramatical implementados: seis testes PASS; bateria afetada
perfil+admissão 19/19 PASS. Perfil fixa todas as 14 opções SES dependentes de
ambiente, globals negados, evaluate e versões; gramática síncrona é build-time,
Acorn continua dev-only. Teste explicita que AST não prova segurança de capability.
Probe migrou de worker para processo descartável oculto; perfil aplicado em
Node 22.17.0, 13 checks de autoridade PASS, uma leitura sintética, compartments
independentes e loop interrompido. Recusas de erro após resultado, resultado
duplicado e loop após resultado também passaram (3/3). Resultado só aceito após
término limpo. Nenhum evaluator financeiro, nenhum closure/trace completo provado.
Syntax OK; nenhuma dependência alterada. Os 116 testes do incremento anterior
não foram repetidos porque compiler/loader não mudaram; não somar execuções
separadas e reportá-las como uma execução integral de 122.

Retomada após `10f95237f0ca5c2e413055ea110dc1c42eb06586`, árvore limpa.
Registrar antes da criação: `src/next/provenance/observationContract.js`,
`src/next/provenance/instrumentedAccess.js`, `src/next/provenance/causalRecorder.js`
e `tests/next/provenance/instrumentedAccess.cases.js`,
`tests/next/provenance/causalRecorder.cases.js`; entry focal existente.
Contrato interno finito de eventos I/M em tuplas, diferente dos objetos L/T.
Primeiro passe: handles record/sequence/scalar com shape fornecido pelo TCB,
copy de dados simples, get/has/keys/length/at/iteração/membership escalar,
revogação e falha persistente. Shape ainda precisa ser derivado da admissão dos
schemas/registry antes da integração; não é nova autoridade normativa de campos.
Recorder atribui invocação/fase/ordem e recusa canal malformado; não recebe R ou
expected_trace. Sem conexão IPC/SES ainda, seleção/traversal/pais pendentes.

Camada inicial de observação implementada: handles record/sequence/scalar,
eventos I/M finitos e recorder proprietário do log. Dados capturados sem
getters/proxies, interfaces prototype-free, non_material oculto/recusado,
revogação e falha latente mesmo quando guest captura a exceção. Iteração inclui
early return e reaquisição do iterator. Quotas de eventos e bytes do log.
REDs de módulos ausentes e de revogação no sink, keys repetido, byte quota,
iterator read e índice -0 observados; correções verificadas. Focal integrada
142/142 PASS, zero FAIL/SKIP/TODO, syntax OK. Probe em SES/processo filho produz
10 observações no recorder do pai e passa sete checks de handles; preserva 13
checks de autoridade e três recusas de lifecycle. O guest do cenário de handles
não recebe a capability read não instrumentada do experimento antigo.
Nenhuma suíte ampla, dependência, produção, corpus financeiro ou canal alterado.

Retomada após bloqueio de uso: ajuste final mantém decodeObservation e
decodeMeasurement no namespace de tuplas I/M; somente causalRecorder escolhe
os campos de L/T. Revalidação específica executada: 20/20 PASS e probe completo
PASS (13 checks de autoridade, sete de handles, dez observações, três recusas).
O 142/142 anterior precede esse ajuste; não foi repetido sem necessidade.

Incremento iniciado após `16549e6459d52851ff9b81a106fc4b7f5feb0bb2`:
projetar acesso aos snapshots dentro de `graphCompiler.js`, após a mesma
admissão integral já existente; testar em `authoringIndex.cases.js`.
Nenhum novo path. Factory somente TCB, sem payload/shape fornecido pelo chamador;
resolver fact/role/alias e identidade composta a partir dos documentos admitidos.
Abertura individual não prova seleção de conjuntos, traversal ou recibos de pais.

Factory TCB `compileSnapshotAccess` implementada no compiler compartilhado:
admite novamente todas as autoridades/schema/fingerprints antes de projetar os
115 snapshots. fact/role/alias resolve somente bindings normativos; shape/payload
nunca vêm do seletor. Projeção escalar/ref_list/role_ref_list finita;
typed_period/typed_result e claim_context/parent_claim ainda recusados neste
acesso, aguardando projeção de contexto/recibo. Não inferir execução integral.
Quatro testes novos: todos os membros de bindings snapshot, campos materiais,
revogação, alias estrangeiro, shape/payload forjados, getter/Proxy, identidade
composta alterada após reparo do hash e conexão com recorder sem expected_trace.
RED de factory ausente observado antes da implementação. Bateria focal integrada
146/146 PASS, zero FAIL/SKIP/TODO; syntax e agent-workflow OK. Probe de isolamento
não repetido: processo/SES não mudou. Ampla ainda não iniciada.

Próxima ação exata: ligar a projeção de shapes/bindings aos schemas/registry
admitidos e implementar seleção/traversal por handles sem segundo writer.
Incremento seguinte: coleções de operandos em `instrumentedAccess.js`, contrato
I em `observationContract.js`, factory `openSet` em `graphCompiler.js` e testes
nos cases existentes instrumentedAccess/authoringIndex. Sem novos paths.
Coleção deve preservar ordem e vazio, observar cardinalidade, membership,
índice/iteração/early return, devolver somente handles e compartilhar revogação.
I identifica a projeção `operand_set` separada dos campos de um snapshot;
isso ainda não equivale ao operador de seleção por predicado ou a traversal.
O probe existente (`scripts/agent/probeNextProvenanceIsolation.mjs` e
`tests/next/provenance/isolationProbe.child.cjs`) verificará também conjunto e
membro retido dentro de compartimentos SES, sem alterar o runtime produtivo.
Conjuntos implementados: `openSet` deriva roster exclusivamente do binding
admitido; suporta tipos de snapshot diferentes e conjunto vazio, sem fallback
para array cru. Cardinalidade, membership, índice, iteração, reaquisição e
early return geram I/operand_set; acesso ao membro gera I/data com seu alias.
Conjunto e membros compartilham revogação/falha. O recorder continua único
materializador de L; o decoder apenas admite as novas tuplas, sem montar trace.
Quatro REDs de conjunto ausente observados; 24 testes access/recorder PASS e
cinco testes de integração snapshot PASS. Depois, focal integrada estável:
151/151 PASS, zero FAIL/SKIP/TODO. Probe SES/processo: 13 checks de autoridade,
11 de handles/conjuntos, 16 observações no pai e dois early returns; três saídas
inválidas recusadas. Syntax, diff-check e agent-workflow OK. Sem ampla,
dependências, corpus financeiro, canal, produção ou deploy alterados.
Próxima ação exata: executar seleções com os predicados tipados já compilados
e observar traversal material. `openSet` é roster de operandos, não resultado
de seleção recalculada; não contar seus testes como aprovação das 73 seleções.
Manter resultado funcional separado e resolver contexto/parent somente por
capabilities admitidas, sem converter expected_trace em execução/prova.
Registrar testes concretos antes da criação. Depois cápsula TCB/processo final,
admissão de R e conexão de operadores/evaluators. A observação sintética não
prova suficiência das obrigações ou os 76 grafos. Não promover observations_only
ou admitted_artifact_bytes_only a aceitação; executable continua false.
Capacidade recomendada: Astra/Alto. Não repetir compiler/probe verdes sem
mudança causal; gate executável e ampla permanecem pendentes.
Requisitos temporais/time_basis e coverage restantes continuam pendentes. O IR completo em inventário
ainda não constitui um motor executável. Nenhum PASS intermediário
libera rollout ou substitui o gate integral. Ampla somente no candidato estável;
ao iniciá-la, pausar sem polling, conforme preferência de Daniel.

Telemetria de calibração: não consultada nesta abertura; métricas de uso
NAO_DISPONIVEL. Não amplia coleta nem bloqueia o produto.

Retomada após `7cea49cfca281e94792fdc4acc183c3e105078b0`, árvore limpa.
Incremento de seleção: `instrumentedAccess.js`, `observationContract.js`, cases
existentes instrumentedAccess/authoringIndex e probe SES existente. Sem paths novos.
`select` deve calcular decisões booleanas por membro via callback instrumentado,
sem receber selected_set/expected_trace. Views imutáveis identificadas pelo hash
do roster ordenado e role; esse identificador não prova valor, snapshot ou fórmula.
I distingue abertura, decisão de cada membro e fechamento, preservando lineage
e leituras. Recusar resultado não booleano sem coerção, reentrância, exceção,
revogação ou quota excedida com falha persistente. Não declarar as 73 seleções
executadas até conectar o programa de predicados tipados e validar a captura.

Seleção instrumentada implementada e validada: callback executado para cada
membro, resultado estritamente booleano, view ordenada imutável e seleção
encadeada. Eventos select_start/select_member/select_return preservam execução;
o digest da view inclui role/aliases e é conferido no decoder, sem substituir
identidade de snapshot ou prova da fórmula. Views/membros compartilham falha e
revogação. Limite de 512 seleções por controlador; reentrância recusada.
Seis testes causais novos cobrem cálculo, coerção/getters, exceção capturada,
revogação, quota/sink, identidade forjada e namespace. Integração com dados
admitidos confirma leituras e decisões sem lista esperada de seleção.
REDs observados antes da implementação; access/recorder 30/30 e integração
snapshot 6/6 PASS. Bateria focal integrada final: 158/158 PASS, zero FAIL,
SKIP ou TODO. Probe SES: 13 checks de autoridade, 12 de handles/conjuntos,
22 observações no recorder pai e três recusas de lifecycle. Syntax, diff-check
e agent-workflow OK. Ampla não iniciada; dependências/produção/canal intactos.
Próxima ação exata: traversal material por handles e conexão dos operadores
tipados à seleção. As 73 seleções contratuais ainda não foram executadas pelo
motor final; manter N02-G WIP, sem GO e sem auditoria final prematura.

Incremento seguinte de traversal: módulos existentes instrumentedAccess,
observationContract, graphCompiler e respectivos cases. Sem novo path.
Links são fornecidos somente pelo TCB após admissão; API guest usa edge id,
nunca alias de destino arbitrário. Traversal observa campo ref/ref_list e id
do destino antes de devolver handle; evento distinto só após coincidência.
Falha/revogação compartilhada entre origem e destino; nenhum snapshot cru.
Traversal implementado para ref/ref_list/role_ref_list. A API usa edge id e
recusa aresta desconhecida, origem errada, handle aninhado, referência ausente
ou identidade divergente. Campo de origem e id do destino são lidos por handles;
evento traverse somente após coincidência observada. Compiler constrói fechamento
alcançável de material_ref a partir do alias/role admitido, sem destino arbitrário.
Quatro testes de proxy e integração sobre arestas reais exercitam falsificação,
falha de sink, retenção/revogação e referência estruturada. REDs observados antes
da implementação. Focal integrada final 163/163 PASS, zero FAIL/SKIP/TODO.
Probe SES: 13 checks de autoridade, 13 de handles/conjuntos/traversal e 26
observações no recorder pai; três recusas de lifecycle preservadas. Syntax,
diff-check e agent-workflow OK. Ampla não iniciada, dependências/canal intactos.
Próxima ação exata: ligar fechamento de arestas também aos membros de openSet
e views selecionadas (hoje somente open individual configura links), depois
programa dos operadores/predicados tipados. Não confundir suporte genérico
role_ref_list com aceitação de parent_claim/recibo da mesma execução: pendente.

Retomada contínua após e8fd2c4: ligar os links de membros de conjuntos e views,
preservando roster inicial separado do fechamento alcançável. Paths existentes:
instrumentedAccess/graphCompiler e seus cases. Sem novo path ou mudança de gate.
Daniel reiterou: não encerrar turnos em cada WIP; continuar até auditoria ou
impedimento real. Checkpoints/commits intermediários não são pontos de pausa.
Traversal em conjuntos/views integrado: roster separado do fechamento de links;
36 testes access/recorder e oito de integração PASS, sem ampla repetida.
Próximos paths registrados antes da criação: `src/next/provenance/scalarProofOperators.js`
e `tests/next/provenance/scalarProofOperators.cases.js`, entry focal existente.
Implementar relações escalares/civis com tipos compilados, reaproveitando
operatorTypes/literalTypes/civilCalendar; não gera R nem aceita evidência crua.
Helper interno recebe valores já resolvidos por instrumentação; integração com
programa fechado/recorder e operadores de nós/conjuntos continua pendente.
Integração de traversal em conjuntos/views validada. Helper escalar executa
19 IDs contratados: comparações escalares/campos/estado, períodos, quatro
relações civis, sinais/magnitude, soma/count/cardinality/set_eq e all_dates.
Parte de set_eq/cardinality/count ainda restringe membros a escalares; nós
exigem próxima projeção de identidade. `as_of`/`through` em containment e
conversão instant/timezone continuam recusados explicitamente, não inferidos
por nome ou relógio local; period_eq preserva seus kinds distintos.
Tipos nominais verificados antes de cálculo; soma checa overflow por passo;
datetime compara instante/fracionário exato sem Date. Períodos prototype-free
comparados pelos campos fechados, não passados indevidamente ao canonicalValue.
REDs de funções ausentes e famílias não implementadas observados. Afetada
operadores/calendar/types 17/17 PASS; focal integrada final 175/175 PASS,
zero FAIL/SKIP/TODO. Probe SES 13 checks de autoridade, 14 de handles/conjuntos,
31 observações externas, três recusas de lifecycle. Syntax/workflow/diff OK.
Não houve ampla, dependência, canal ou produção. Próxima ação: projeção
instrumentada da identidade kind/ref/version dos nós, operadores de nós e
resolver/programa de prova. Nunca copiar identidade declarada do grafo para
resultado de operador como se tivesse sido observada no snapshot.
Próximo incremento (paths existentes): metadados de identidade opcionais em
bindings internos de instrumentedAccess, obrigatórios na factory de snapshots;
identity(field) retorna somente escalar observado em projeção node_identity,
sem misturar envelope.kind com payload.kind. Tests nos cases access/authoring.
Depois adicionar operadores same_identity/kind_is e sets de identidades ao
helper existente. Fingerprint continua pendente até medir todo payload material.
Identidade instrumentada e quatro operadores de identidade/target implementados;
REDs confirmados, 49 testes afetados PASS (zero fail/skip/todo). Novo incremento
registrado antes da criação: `src/next/provenance/proofOperators.js` e
`tests/next/provenance/proofOperators.cases.js`, entry focal existente. Medir
fingerprint somente lendo handles e a projeção de registry admitida, preservando
ausência, falsy e ordem; nunca ler semantic_fingerprint do objeto como medição.
O digest continua sem provar sozinho predicados/seleções ou aceitação integral.
Próxima ligação nos paths existentes graphCompiler/authoringIndex: scope TCB
de prova dos snapshots do grafo inteiro, independente dos bindings de cálculo.
`proof/snapshot` é tag de escopo de transporte, não operand role do evaluator;
somente a futura fase proof do host poderá usar esse scope. A factory não recebe
expected_trace nem digest esperado. Pais derivados continuam recusados até recibo
validado, sem fallback para snapshots fabricados.
Medição e scope de prova testados: 4 testes unitários e 10 snapshot-access PASS.
O manifesto tem 115 snapshots admitidos; os grafos referenciam exatamente 61
identidades de snapshot. As 61 foram medidas por handles e confrontadas com os
digests; as 54 restantes (family/person/proposal/collection/turn) não foram
alegadas como executadas. Traversals >4000 observados nesse teste de acesso.
Registrar próximos paths antes de criá-los: `src/next/provenance/claimContext.js`
e `tests/next/provenance/claimContext.cases.js`. Projetar somente descriptor
funcional do claim a partir do schema admitido, sem R/operand_bindings; conectar
à factory existente com mesmo lifecycle. Não é recibo validado de parent nem GO.
Contexto ligado à factory: 76 projeções schema-driven; openContext respeita
role claim_context, openProof usa tags de transporte proof/snapshot e
proof/context (não são roles normativos do evaluator). Lifecycle compartilhado.
Dispatch observado conecta expressões tipadas escalares/identidade/fingerprint,
campos de claim e janelas; não recebe expected_trace. Corte through inclusivo
confirmado no contrato installments_realized_v1, com RED de fronteira e testes;
as_of continua sem acumulação implícita.
Focal integrada: 193/193 PASS, zero fail/skip/todo. Na mesma execução,
11.204 predicados foram executados por handles e 125.993 observações capturadas.
Isso é integração de desenvolvimento, não aceitação de 76 grafos: conjuntos,
quantificadores, timezone, pais e demais partes do gate continuam pendentes.
Syntax/diff-check/agent-workflow OK. Nenhuma suíte ampla iniciada, canal,
dependência, produção ou dado real alterado. Próxima ação exata: conjuntos de
prova com roster observado, resolução de ref_set/projection e quantificadores,
sem usar selected_set esperado como resultado de seleção.
Incremento seguinte nos paths existentes graphCompiler/proofOperators e seus
cases: abrir conjuntos de prova a partir do roster declarado de candidatos;
selected_set não pode ser aberto enquanto não houver view calculada por select.
Controllers de conjuntos/contexto/nós compartilham falha e revogação. Resolver
ref_set por reads da lista e traversal observado de cada referência, não por
cópia das identidades declaradas do grafo.
Conjuntos/ref_set ligados: 102 predicados observados, 794 traversals. Quantificadores
e pares: 79 predicados, 1890 observações. Helpers same_field/join_eq/ordered_by
testados com falsos, duplicatas, direção e conjuntos vazios. Ainda sem aceitação.
Próximo path registrado: `src/next/provenance/pinnedCivilTimezone.js` e
`tests/next/provenance/pinnedCivilTimezone.cases.js`. Adaptador temporal interno
TCB, sem expor Intl/Date ao guest; locale/calendar/timezone explícitos. Usar ICU
full embutido no Node 22.17.0 já pinado (ICU77.1/tz2025b/CLDR47.0/Unicode16.0),
recusar versões/overrides divergentes. Bootstrap final deve confirmar binário
full-ICU e hash do runtime, além do closure do adaptador; números de versão não
substituem identidade de bytes. Não afirmar que esse bootstrap já existe.
Fonte técnica: https://nodejs.org/download/release/v22.17.0/docs/api/intl.html
especifica full-ICU embutido nos binários oficiais e overrides alternativos.
Conversão pinada: 3/3 testes temporais e ligação observada aos dois
safe_daily_pace PASS; nenhuma alegação de bootstrap final ou aceitação integral.
Próximos paths registrados: `src/next/provenance/metricSelection.js` e
`tests/next/provenance/metricSelection.cases.js`. Adaptar a seleção de consumo
já definida nos evaluator contracts e na referência de comportamento, somente
por handles (context/events/categories/family), sem importar o oracle nem
consultar selected_sets/fact_key. Primeiro helpers internos com testes causais;
a execução final continua condicionada à cápsula/closure e ao gate completo.
Pré-requisito nos paths existentes instrumentedAccess e seus cases: follow(field)
somente para referência singular com uma aresta admitida inequívoca. Reutiliza
traverse e suas leituras/checagens; não expõe IDs específicos do grafo ao kernel
nem retorna topologia crua. Listas/ambiguidade ficam recusadas nessa operação.
follow(field): RED confirmado e 32/32 access PASS. Seleção de consumo:
5/5 testes sintéticos PASS e 16 claims confrontados com oracle/selected_sets
somente no harness. Retorna R escalar, decisões são observadas pela seleção.
Próximo incremento no builder existente buildNextProvenanceArtifacts.mjs:
bundle CommonJS fechado de fontes puros para FunctionExpression(operands),
sem resolução de filesystem/runtime. Novo case registrado:
`tests/next/provenance/guestBundle.cases.js`. AST limita imports estáticos;
capabilities continuam protegidas por SES, não pela classificação sintática.
Bundle fechado: 3/3 cases PASS, helpers transitivos preservados byte a byte.
Estender o probe existente (script e isolationProbe.child.cjs), sem novo runner:
cenário sintético de consumo recebe somente o bundle construído dos três fontes
fixos, admite seu artefato no filho e executa em SES; I/M chegam ao recorder no
pai e R é separado. Root esperado desse probe é autoridade de teste, não registry
revisado nem prova da cápsula TCB completa. Nenhum input CLI de código/dados.
Incremento validado: focal integrada 217/217 PASS, zero FAIL/SKIP/TODO;
probe com 13 checks de autoridade, 14 handles, três recusas de lifecycle e
bundle de consumo em SES (R=125, 49 observações/medições separadas). Diff-check e
agent-workflow OK. Ampla não iniciada. Publicar somente como WIP, não auditável
final. Próxima ação: continuar os contratos métricos por handles e o confronto
exato de observações, preservando a pendência de parents/TCB/witnesses/76 grafos.
WIP publicado e remoto confirmado: bec932d23a4aab958d9546733fa3ceedc8f386f9,
parent e0d4e315f2544251eb56d016ff74dcdfb077dc03. Próximos paths registrados:
`src/next/provenance/metricDirectReads.js` e
`tests/next/provenance/metricDirectReads.cases.js`. Implementar leituras diretas,
ownership, regras e contagens dos contratos existentes por handles; resultado
continua funcional e não substitui prova/trace. Reutilizar seleção de consumo
para conferir contagem da fonte, sem usar total monetário como cardinalidade.

Leituras diretas: 8 casos causais + 21 claims admitidos PASS; com consumo,
37 claims exercitados (20 métricas), ainda sem aceitação integrada de trace.
Próximos paths autorizados pelo escopo N02-G: `src/next/provenance/metricInstallments.js`
e `tests/next/provenance/metricInstallments.cases.js`. Selecionar parcelas pelos
handles de plano/eventos/contexto; não sintetizar cronograma nem importar oracle.
O kernel de schedule existente usa outro contrato (compra/parcelas explícitas),
portanto não será forçado sobre os snapshots de autoria.
Incremento funcional: 26 claims de seleção econômica (incluindo renda,
instrumento e orçamento), 21 de leituras diretas e 7 de parcelas PASS = 54
claims/28 métricas. Três cases de bundle preservados. Não é gate de aceitação.
Próximos paths: `src/next/provenance/metricEffects.js` e
`tests/next/provenance/metricEffects.cases.js`, efeitos econômicos pelos roles
ratificados. Comparar compensação com alvo, não somente soma/valor coincidente.
Efeitos: 13 claims adicionais PASS. Estado do incremento: 67/76 claims,
33/39 métricas exercitados funcionalmente; seleção confrontada externamente
nos 26 econômicos, 7 de parcelas e 13 de efeitos. Leituras diretas: 21 valores.
Bateria focal integrada: 236/236 PASS, zero FAIL/SKIP/TODO, 52,40s. Não foi
executada suíte ampla. Saídas funcionais não equivalem a aceitação de grafos.
Continuam pendentes: statement_total, projected_installments, safe_daily_pace e
as três métricas derivadas de parents; execução integrada/TCB, confronto exato
de trace e witnesses. Nenhum contrato/fixture/oracle foi alterado neste incremento.
Checkpoint WIP, não candidato de auditoria nem GO parcial.
WIP local salvo em 8a4e0ead9c59e5999fa69b4211b5a9e5d14b34a3; push recusado pelo
controle automático, sem confirmação remota. Continuação local autorizada.
Faturas e parcelas por família: +4 claims, total funcional 71/76. Próxima
composição: safe_daily_pace. Usar o adaptador civil TCB existente por operação
observada civilDate do handle; reads do relógio e policy continuam externos,
nenhum Date/Intl ou objeto de trace entra no guest. Atualizar os paths existentes
instrumentedAccess/observationContract e seus cases; métrica no seletor econômico.
Composição temporal validada: 73/76 resultados (36/39 métricas). Os três parents
não serão promovidos a recibos validados antes da aceitação de trace/prova.
Cross-check novo: 1133 arestas material_ref obrigatórias em derivation, em 66
grafos, têm target fora de required_nodes/required_reads. Exemplo S-01#1#1/e0023
termina em person_b, que não é admitido no trace da fase. O runtime traverse
observa source.person_id + target.id; ocultar essa leitura viola a observação.
Confirmar com reprodução mínima antes de solicitar revisão focal dessa
incompatibilidade. Não alterar graphs/contrato ratificado silenciosamente.
Paths de evidência reservados: `scripts/agent/inspectNextProvenanceTraceCompatibility.mjs`
e `docs/plans/workstreams/financasbot-next-02-n02g-trace-compatibility-v1.md`.
Reprodução executada: TRACE-COMPAT-001 PASS, diagnóstico exit=1/compatible=false.
Focal integrada atual: 241/241 PASS, zero FAIL/SKIP/TODO, 54,03s. O teste demonstra
o impedimento, não aceitação. Próxima ação: revisão independente focal da
compatibilidade traversal/cobertura, conforme relatório acima. Não repetir
auditoria integral de N02-F, não alterar grafo esperado a partir do trace medido,
não emitir recibo validado de parent enquanto a integração permanece bloqueada.
Escopo da revisão: decidir a incompatibilidade e a menor correção coerente;
não aprovar as novas métricas globalmente nem liberar NEXT-03/produção.

Reauditoria focal B concluída: CRITICAL 0, HIGH 1, MEDIUM 0, LOW 0. O parecer
confirmou que `required_edges` e `required_reads` são dimensões independentes e
que o bloqueio estava nas leituras incidentais executadas por `traverse`, não na
autoria dos 76 grafos. Evidência independente em `77d894b...`; parecer/slot em
`1a2466d...`; recibo operacional concluído em `54d90d3...`.

Correção local: relações materiais agora são validadas pelo TCB na admissão dos
bindings, sem emissão de trace. `traverse` executa somente a aresta admitida e
não relê a referência da origem nem `target.id`; reads posteriores realmente
executados permanecem instrumentados. O diagnóstico preserva as 1.133
obrigações edge-only como informação válida, não como gap. RED focal confirmou
a falha antiga; GREEN: 6/6 causais, 70/70 módulos afetados e 241/241 bateria
N02-G integrada, zero FAIL/SKIP/TODO. Suíte ampla não executada porque o N02-G
ainda não é candidato global estável.

Estado vigente em 2026-09-15: correção `fd2d996b45bb7cecd4ae0d7d19cacece5afbe98b`
APROVÁVEL na reauditoria independente, sem findings. Parecer integral publicado
em `4bc20076fa4fbd6f90dbc505cdaa306789862376`, recebido e validado no canal
canônico em `32dde4a514a5874d3ec1d15cd1e406aa55383160`, com CHAT_READY remoto.
Não repetir esta auditoria nem a bateria verde sem mudança causal nova.

O retorno original foi escrito equivocadamente na branch do produto. O watcher
consulta somente `chat/chat-codex-orchestration-20260824`; sua ausência nessa
branch não demonstrava auditoria em andamento. Nos próximos prompts declarar
explicitamente essa branch como destino exclusivo de parecer, slot e state,
e a branch do candidato como fonte somente de leitura. Monitor antigo removido.

Próxima ação: integrar o confronto exato de trace/prova aos contratos admitidos,
com RED causal e sem preencher expected a partir de actual. Parents continuam
sem recibos validados até aceitação integral. Não alterar graphs, contratos,
fixtures ou oracle; NEXT-03/produção continuam bloqueados pelo gate global.

Próximos paths concretos: `src/next/provenance/proofAcceptance.js` (previsto no
charter) e `tests/next/provenance/proofAcceptance.cases.js`, ligados ao entry
`tests/nextProvenance.test.js`. Primeiro implementar confronto de reads/edges
por fase e invocação, com falha explícita para observação ainda não classificada.
Esse comparador componente não produz recibo, GO de grafo nem libera parents.
Não alterar recorder/contrato para obter aprovação parcial.

Integração causal deste incremento também toca
`tests/next/provenance/authoringIndex.cases.js`: confrontar seleções das métricas
já exercitadas usando o mesmo log do recorder, com binding de roles/candidatos
resolvido antes do confronto e independente dos membros esperados. Não promover
esse confronto componente a validação integral de grafo.

## Incremento em 2026-09-16 — cobertura observada e pergunta focal

Comparadores componentes de reads/edges/estrutura e seleção implementados,
sem recibo de parent nem aceitação de grafo. Vinte testes focais PASS. O RED
de `next()` após `return()` confirmou falsa conclusão de consumo integral;
o comparador agora distingue encerramento antecipado de esgotamento natural.
As 52 seleções das métricas econômicas, parcelas e efeitos passaram no
confronto do log real, mantendo R/oracle separados. Syntax check e diff check
passaram. Não houve suíte ampla.

O diagnóstico em S-01#1#1 ainda detecta leituras/arestas ausentes, leitura extra
de evidence_state e diferença de operações estruturais. Não são preenchidos
expected a partir de actual nem filtrados eventos para declarar compatibilidade.

Pergunta focal antes de ampliar a integração: S-16#1#1/source_coverage recebe
somente source_complete_june pelo role source:node. O grafo deriva uma seleção
candidates→selected com quatro candidatos, mas required_nodes/read admite
somente a fonte escolhida. As três demais fontes não são alcançáveis pelas
material_ref do role. O teste SELECTION-BINDING-001 passou reproduzindo a
recusa de openSet/source, a recusa dos três aliases por open/source e a
possibilidade de seleção em openProof. Isso é evidência de fronteira atual,
não veredito de incompatibilidade normativa. Avaliar primeiro uma implementação
compatível; não ampliar os roles nem mudar contratos silenciosamente.

A execução de 2026-09-15 parou antes da bateria N02-G integrada porque a revisão
automática de permissões atingiu limite de uso. Nenhum commit/push/envio de
auditoria desse incremento foi feito naquela interrupção. Em 2026-09-16 a
bateria focal integrada terminou: 262/262 PASS, zero FAIL/SKIP/TODO,
157,03s. Isso inclui o teste diagnóstico SELECTION-BINDING-001; seu PASS
comprova a reprodução da fronteira, não sua aprovação arquitetural.

Paths reservados para revisão pequena, reutilizando o formato da evidência
anterior: `docs/audit-evidence/n02g-selection-binding/evidence-manifest.json`,
`docs/audit-evidence/n02g-selection-binding/focal-record.json`,
`docs/audit-evidence/n02g-selection-binding/verify-evidence.cjs` e
`docs/plans/workstreams/financasbot-next-02-n02g-selection-binding-review-v1.md`.
Enviar somente a pergunta focal e esses artefatos, sem repetir N02-F ou pedir
GO global do N02-G. Branch do produto é somente leitura para o auditor;
retorno exclusivamente em chat/chat-codex-orchestration-20260824.

## Revisão focal enviada — 2026-09-16

WIP preservado/publicado: `2ca7d32505728b985f7616dcaa17bec4acd11e18`, parent
`6ee7282eb9c77c00afd79fca0368dabb2058c8fc`. Candidato de evidência somente:
`856bc07272ac630c077492f1c1abb8ca1701e252`, parent único igual ao WIP.
Quatro paths no delta: plano focal e três artefatos de evidência registrados
acima. Verificador: um positivo e seis negativos PASS; oito fontes fixadas
por SHA-256 e blob Git, sem normalizar bytes. 262/262 é a bateria N02-G local,
não veredito externo e não suíte ampla/global.

Canal canônico publicado em `e7140a5f5f3968424ec771b8101f5ddd5ebb7095`,
CHAT_WORKING, task FIN-NEXT02-N02G-SELECTION-BINDING-AUDIT-RETURN-20260916.
State remoto SHA-256:
`d4765810de17fefc833feedae8ed020ab1910cf09c253b816742903e18e893e5`.
Slot validado por chatCodexTaskContract: expected_base_sha pertence apenas ao
state, não ao schema fechado do slot. O slot antecedeu o state em commit
separado. Não alterar transporte/bot para receber esse parecer.

Uma tentativa de bot realizada. Saída: “Mensagem entregue: turno do usuario
persistido. A resposta sera recebida separadamente pelo GitHub/watcher.”
Entrega confirmada não significa auditoria concluída. Heartbeat
`acompanhar-revis-o-focal-n02-g` ativo a cada cinco minutos, silencioso sem
mudança acionável; não reenviar. Parecer esperado no canal:
`docs/agent-memory/workstreams/results/FIN-NEXT02-N02G-SELECTION-BINDING-AUDIT-20260916.md`.

Retomar pelo manifesto fechado se CODEX_READY; evitar recibo duplicado se
watcher já publicou CHAT_READY. Após confirmação remota, pausar o heartbeat e
retomar produto nesta worktree. Confrontar o parecer com os bindings e teste;
aprovação do diagnóstico não é aprovação dos comparadores WIP nem GO N02-G.
Se a resposta exigir decisão normativa nova, preservar o bloqueio e distinguir
proposta de auditor de autorização; não reescrever graphs por inferência.

Codex → Astra → Alto → confrontar o retorno focal e seguir pela menor correção autorizada.

## Retorno focal recebido — 2026-09-17

Parecer completo recebido no canal em `9f9022dad7c33a76a5c99cd57bdbd02780f1202e`:
`docs/agent-memory/workstreams/results/FIN-NEXT02-N02G-SELECTION-BINDING-AUDIT-20260916.md`.
Candidato e parent confirmados: `856bc07272ac630c077492f1c1abb8ca1701e252` /
`2ca7d32505728b985f7616dcaa17bec4acd11e18`. Verifier local novamente executado
para o recibo: valid=true, oito fontes, três candidatos inacessíveis pelos
bindings derivacionais. Não houve nova execução dos 262 testes nem suíte ampla.

Conclusão confrontada: AJUSTE NORMATIVO NECESSÁRIO; HIGH N02G-SB-001.
Derivation exige candidates -> selected, mas só admite reads/nodes da fonte já
ligada. Seleção real dos quatro candidatos exigiria cobertura dos excluídos;
escolha estática do binding não é seleção observada. Proof não pode preencher
derivation. O §4 ratificado sustenta o achado; o teste diagnóstico não o fecha.

Recibo restrito publicado pelo watcher em
`289f561fdacce69cac3d04015c938cd41e33ed7a`; CHAT_READY remoto, mesma task e
result_file confirmados. Apenas state e recibo mudaram. O manifesto está
encerrado; seus allowed_paths não autorizam produto. Heartbeat
`acompanhar-revis-o-focal-n02-g` pausado. Não reenviar o mesmo hash ao Chat.

Proposta técnica, ainda NÃO RATIFICADA: seleção dos quatro candidatos somente
em proof; derivation consome source:node e não afirma executar uma seleção.
Preservar integralmente a prova de identidade, período e escolha da fonte.
Isso é preferível, neste fluxo, a acrescentar uma segunda seleção no host só
para satisfazer uma obrigação incompatível com os inputs do evaluator.

Próxima ação exige autorização explícita dessa alteração normativa. Depois,
formalizar a regra de seleção por fase, confrontar seus validadores e a classe
de grafos afetada (sem if por fact_key), preservar proof e adicionar RED para
seleção extra em derivation. Não remover obrigações automaticamente a partir
do actual; submeter o delta normativo/corretivo a auditoria focal antes de GO.
Até essa decisão, nenhum contrato, graph, registry, teste ou runtime foi alterado.
NEXT-03, deploy, produção e dados reais continuam fora do escopo.

Codex → Astra → Alto → formalizar e validar a correção por fase após decisão normativa.

## Correção autorizada — 2026-09-18

Daniel respondeu `sim` à decisão específica de seleção somente em proof para
operandos node prebound. A autorização supera a pendência decisória anterior,
mas não substitui auditoria independente nem o gate integral N02-G.
Base do delta: `be520f4f0cf64812c80f0f4b9b8eefb2a5445189`.
Plano focal: `../../plans/workstreams/financasbot-next-02-n02g-selection-phase-correction-v1.md`.

Regra genérica no contrato §4 e graphStructure: roster node_set candidato único
exige seleção derivacional; selected_set não vazio inteiramente ligado por
roles node permite seleção somente em proof. Ambiguidade/ausência de binding
falha fechado. Proof conserva todas as seleções; ambas as fases cobrem cada
candidato quando executam seleção. Operand prebound conserva seus reads/nodes.
Nenhum branch por fact_key/métrica, nenhuma alteração de fórmula/oracle/registry.

Seis grafos corrigidos: S-16#1#1, M-04#1#1, M-04#1#2, M-05#1#2, M-05#1#3,
M-05#1#4. Somente seus dois campos derivacionais de seleção foram alterados.
Outros 70 grafos, todas as 76 provas e os demais campos preservados por
deepEqual integral no verifier `docs/audit-evidence/n02g-selection-phase/verify-evidence.cjs`.
Extração compacta `focal-records.json`, 12.930 bytes; positivo e sete negativos
PASS. Não enviar graphs-v2 integral à conversa do auditor.

REDs causais antes da correção: STRUCTURE-007/008 FAIL pelos motivos esperados.
Depois: onze focais PASS; N02-G integrado 265/265 PASS, zero FAIL/SKIP/TODO,
63,80s. Syntax/diff/agent-workflow OK. Comparadores continuam componentes WIP;
esses resultados não concedem aceitação integral de graph ou parent.

Suíte ampla hermética concluída uma vez, sem repetição: processo PID 28880,
`node scripts/runExhaustiveLocalTestCoverage.js`, exit_status=1, `valid=true`.
Resultado: 2.258 testes, 1.756 PASS, 492 FAIL, 10 SKIP, 0 TODO; cobertura
76,10% linhas, 76,22% branches, 80,25% funções; duração 1.254.099 ms.
Os 492 failures concentram-se em legacy reduction, OAuth/Google, canary/read
model, dashboard e suites do agente; não há evidência ainda de que sejam
causados por esta correção N02G. Logs completos permanecem temporariamente em
`$env:TEMP\financasbot-n02g-selection-phase-wide-20260918.log` e `.err.log`;
não transportar esses logs automaticamente.

Na retomada, diagnosticar uma amostra causal dos failures e comparar com a base
antes de qualquer repetição. Não iniciar outra suíte ampla. Se o conjunto for
baseline/ambiente, registrar a separação; se houver regressão N02G, corrigir os
afetados e só então repetir a escada exigida. Commit/push sanitizado e auditoria
focal do novo hash permanecem pendentes; não enviar candidato enquanto o delta
não estiver estabilizado.

O handoff ocorre com árvore suja deliberada: alterações do candidato e novas
evidências não foram mascaradas nem descartadas. O próximo Codex deve preservar
esses caminhos e ler o checkpoint antes de editar.

Ainda não houve commit/push deste candidato nem envio de auditoria. Não reabrir
o recibo antigo; heartbeat anterior permanece pausado. Sem produção/dados reais.

Codex → Astra → Alto → conferir a suíte ampla e preparar a auditoria focal do novo hash.

## Diagnóstico da suíte ampla após retomada portátil — 2026-09-18

Os logs temporários integrais da máquina anterior não estavam presentes no
novo Windows, conforme a regra do handoff. A suíte ampla não foi repetida.
Foi executada somente uma amostra hermética representativa dos grupos
registrados no adendo.

A amostra sem `readModelSqlite.test.js` reuniu 133 testes em cinco arquivos:
65 PASS e 68 FAIL. Os failures foram um caso do gate de redução legado e 67
casos de `financialAgent.test.js`; os grupos de canary, dashboard e OAuth da
amostra passaram. Casos representativos de `readModelSqlite.test.js` também
falharam antes da lógica funcional porque `ensureSqliteReady()` retornou falso.

Causa local confirmada: o pacote `better-sqlite3` está resolvível, mas a
instanciação não localiza `better_sqlite3.node` nesta instalação de
`node_modules`. O mesmo pré-requisito alimenta diretamente o read model e o
agente; o gate legado exercita essas baterias e herda o bloqueio. Não houve
evidência de divergência semântica N02-G nessa amostra.

Confronto com a base `be520f4f0cf64812c80f0f4b9b8eefb2a5445189`:
serviços do read model, agente, runner do gate legado, os três testes
representativos e `package.json`/`package-lock.json` têm blobs idênticos entre
HEAD e worktree. A busca de acoplamento não encontrou importação de
`next/provenance`, `graphStructure` ou `graphs-v2` nesses caminhos. Logo, a
amostra separa o bloqueio como ambiente/dependência local preexistente ao delta
N02G-SB-001, não como regressão causada pela correção por fase.

Nenhum arquivo de produto foi alterado pelo diagnóstico. Os logs ignorados e
as linhas de auditoria local acrescentados pelos testes foram restaurados ao
estado anterior. Próxima ação: restaurar somente o binding nativo local de
`better-sqlite3`, sem alterar manifests; repetir a bateria causal afetada e
somente depois decidir a única nova suíte ampla final exigida para um candidato
verde. Commit/push e auditoria independente continuam pendentes.

Codex → Sol → Médio → restaurar o binding nativo local e revalidar apenas os testes afetados.

## Resultado amplo no runtime contratual e diagnóstico do harness — 2026-09-18

Binding SQLite local restaurado, sem alteração de manifests. O runner recebeu
`--test-reporter=tap` explícito após RED causal; teste focal do runner 12/12 PASS.
A execução posterior em Node 24.19.0 teve 2.258 testes, 2.232 PASS, 16 FAIL e
10 SKIP. Seis failures N02-G envolviam o adaptador de timezone, cujo contrato
exige Node 22.17.0, ICU 77.1, tz 2025b, CLDR 47.0 e Unicode 16.0.

Node oficial 22.17.0 instalado em cache local e arquivo ZIP confrontado com
SHASUMS256 oficial: `721ab118a3aac8584348b132767eadf51379e0616f0db802cc1e66d7f0d98f85`.
SQLite realinhado ao ABI desse Node; probe de abertura PASS. Cache está em
`.codex-temp/runtimes/`; `.codex-temp/` aparece como não versionado no status,
portanto NÃO presumir que está ignorado nem incluí-lo em staging do candidato.

Suíte ampla no Node 22.17.0 concluída: 495.466 ms, exit_status=1, valid=true,
2.258 testes, 2.233 PASS, 15 FAIL, 10 SKIP esperados, zero cancelados/TODO.
Cobertura: 92,12% linhas, 77,54% branches, 92,19% funções. `valid=true`
descreve a integridade do resultado do runner; não autoriza declarar verde.

Separação dos 15 failures:
- Seis testes de inventário N01/N02-A..E rejeitam `provenance/*`. Os inventários
  antigos não ampliados já são pendência expressa deste checkpoint.
- Quatro testes Open Finance criam observações de 09–10/08/2026 e as reabrem
  com relógio real depois da retenção de 30 dias, produzindo expiração.
- Cinco N02-G têm conflito entre o ambiente do harness e o contrato de timezone.

Diagnóstico causal local desses cinco, sem repetir a suíte ampla:
`OBSERVED-METRIC-001`, `OBSERVED-PROOF-004`, `ACCESS-033`, `TIMEZONE-001` e
`METRIC-SELECTION-011`, selecionados pelo nome no mesmo entrypoint.
1. Ambiente hermético padrão com cobertura: 0 PASS / 5 FAIL.
2. Mesmo ambiente sem cobertura: 0 PASS / 5 FAIL.
3. Com cobertura, tripwire carregado primeiro e somente depois removido
   `NODE_OPTIONS` do ambiente visível: 5 PASS / 0 FAIL.

O runner usa `NODE_OPTIONS` para carregar o tripwire nos descendentes;
`pinnedCivilTimezone.checkTimezoneRuntime` rejeita qualquer valor dessa
variável. O preload diagnóstico preserva a captura original do tripwire para
os filhos e só isola a checagem do ambiente no processo corrente. Isso NÃO é
uma correção adotada nem autorização para relaxar o contrato do runtime.
Artefatos locais: `.codex-temp/diagnoseTimezoneHarness.cjs` e
`.codex-temp/timezone-harness-diagnostic.json` (não destinados ao commit).

A hipótese anterior de contaminação/ordem não ficou demonstrada; este conflito
explica os cinco failures sem executar os demais testes. O adaptador, o profile,
o tripwire, as duas políticas antigas e os três arquivos de teste Open Finance
são idênticos ao HEAD-base (diff restrito vazio). Nenhuma correção de produto
foi feita neste diagnóstico. O delta de seleção não demonstrou regressão aqui,
mas a suíte continua vermelha e a auditoria independente continua pendente.

Próxima ação: reconciliar a integração runner/timezone preservando tanto o
carregamento obrigatório da proteção nos descendentes quanto a recusa de
overrides não confiáveis; definir RED causal e testar apenas a fronteira afetada.
Não ampliar inventários nem alterar Open Finance silenciosamente para obter
verde. Não repetir ampla antes de correção causal e bateria afetada verde.
Commit/push e auditoria focal por novo hash continuam pendentes; sem GO N02-G.

Codex → Sol → Alto → corrigir a integração do runner com o contrato de timezone e validar a fronteira afetada.

## Integração do harness corrigida localmente — 2026-09-19

Daniel autorizou a implementação com `Faça` e a continuidade com `continue`.
Alteração restrita ao suporte de testes: a geração canônica de NODE_OPTIONS
foi extraída para `tests/helpers/exhaustiveNodeOptions.js`, compartilhada pelo
runner e tripwire. Após instalar as proteções e capturar as opções para filhos,
o tripwire remove a variável ambiente somente se ela corresponder exatamente
às opções canônicas do harness. Valores com opções extras continuam visíveis
e são rejeitados pelo adaptador. No preload por CLI sem variável, as opções
canônicas são geradas para garantir proteção também nos descendentes.

O adaptador `pinnedCivilTimezone.js` e `executionProfile.js` permanecem
idênticos ao HEAD-base. Não foi introduzida exceção de teste no runtime.
Novos arquivos versionáveis: `tests/helpers/exhaustiveNodeOptions.js` e
`tests/helpers/exhaustiveTimezoneChild.cjs`. A fixture exercita timezone real,
recusa de rede externa e propagação por spawn/spawnSync, execFile/execFileSync,
fork e netos, inclusive com tentativa de sobrescrever NODE_OPTIONS. Também
há controle de opções adicionais recusadas e preload por CLI. O host externo
do teste só é usado depois de confirmar instalação do tripwire.

RED causal: o teste de integração falhou por NODE_OPTIONS ainda visível antes
da correção; controle negativo de overrides passou. Após implementação e
revisão local, runner 15/15 PASS. Syntax dos cinco arquivos alterados/novos OK.
Bateria causal final via as mesmas funções de argumentos/ambiente do runner,
Node 22.17.0 e cobertura habilitada: 284/284 PASS, zero FAIL/SKIP/TODO/cancelados.
Inclui 265 N02-G, 15 runner e quatro inventário de runtime. Cobertura deste
recorte: 97,32% linhas, 90,46% branches e 97,14% funções; não é cobertura global.
Evidência temporária: `.codex-temp/harness-causal.json` e `.tap.log`.

Próxima validação: uma ampla final após essa mudança causal global de preload,
para confrontar a lista de falhas com as dez pendências já diagnosticadas
(seis inventários antigos e quatro fixtures expiradas). Não presumir o
resultado nem declarar verde. Ao iniciar, parar acompanhamento sem polling.
Wrapper `.codex-temp/runWideNode22.js` grava o resultado quando terminar em
`.codex-temp/wide-node22-after-harness.json`; consultar uma única vez quando
Daniel solicitar, sem lançar outra execução. Nenhum commit/push/auditoria
externa deste candidato realizado; estado máximo é candidato em validação.

Codex → Sol → Baixo → consultar o resultado da ampla final após a correção do harness.

## Dez pendências de regressão corrigidas localmente — 2026-09-19

A ampla pós-harness terminou: 2.261 testes, 2.241 PASS, 10 FAIL, 10 SKIP
esperados, zero cancelados/TODO, valid=true, exit_status=1, 349.459 ms.
Cobertura global: 92,18% linhas, 77,78% branches, 92,25% funções. As cinco
falhas de timezone desapareceram; restaram exatamente as seis de inventário
e quatro de fixtures temporais. Resultado preservado em
`.codex-temp/wide-node22-after-harness.json`.

Daniel autorizou a próxima correção com `trocado. prossiga`. Escopo de suporte
à validação explicitado: política N02, seis consumidores de inventário em
testes, novo `tests/next02DevelopmentInventory.test.js` e três arquivos de
testes Open Finance/handler. Nenhuma mudança em serviços financeiros.

Inventário: não ampliar os pins de admissão do CP-01 nem recalculá-los a
partir da árvore candidata. `inspectDevelopmentSources` verifica a árvore
completa contra os 15 paths revisados e 29 paths explicitamente pendentes,
reutilizando a análise/hashes históricos exclusivamente para os revisados.
Imports de arquivo revisado para arquivo pendente continuam recusados.
Retorno obrigatório: scope=development-regression, releaseEligible=false e
pendingReviewPaths explícitos. Arquivo extra, ausente ou redirecionado falha.
`inspectSources` mantém o contrato estrito; `validateFinancasBotNext02.mjs`
continua usando essa API e recusando a árvore completa em desenvolvimento.
O verde da regressão não se converte em admissão dos 29 módulos nem GO N02-G.

Relógio: os quatro casos passam a usar MockTimers de Date no contexto do
próprio teste, fixado na data de suas observações e restaurado automaticamente.
O wrapper stateMachineTest encaminha o contexto para permitir essa fixação.
Política de retenção, asserções e código de produto permanecem inalterados.

RED: quatro controles de inventário falharam pela API ainda ausente; as dez
falhas originais já estavam reproduzidas sob Node 22 e registradas. GREEN:
quatro controles novos PASS e dez casos originalmente vermelhos 10/10 PASS.
Revisão local verificou hashes históricos intactos, importação para pendentes
recusada e ausência de promoção de bytes pendentes a revisados. Bateria causal
completa de onze entrypoints, sob cobertura e ambiente hermético: 267/267 PASS,
zero FAIL/SKIP/TODO/cancelados. Inclui controles reais de expiração e os demais
testes do handler após o relógio restaurado. Evidência temporária:
`.codex-temp/remaining-causal.json` e `.codex-temp/remaining-causal.tap.log`.

Próxima ação: uma ampla final após esses deltas causais e bateria afetada
verde. Wrapper `.codex-temp/runWideNode22.js`; resultado persistido ao terminar
em `.codex-temp/wide-node22-after-inventory-clock.json`. Parar acompanhamento
ao iniciar, sem polling. Consultar uma vez quando Daniel avisar; não iniciar
outra ampla. Depois de conferir o resultado, atualizar evidência e preparar
commit sanitizado/auditoria independente, ainda pendentes. Os novos testes
e helpers versionáveis devem ser adicionados explicitamente; nunca incluir
`.codex-temp/`, node_modules, bases, logs ou credenciais no candidato.

Codex → Sol → Baixo → consultar o resultado da ampla final após inventário e relógios de teste.

## Candidato local verde; preparação imutável — 2026-09-19

Ampla final concluída: 2.265 testes, 2.255 PASS, zero FAIL/cancelados/TODO,
10 SKIP esperados, valid=true, exit_status=0, 361.254 ms. Cobertura global:
92,25% linhas, 77,74% branches, 92,48% funções. Registro persistido em
`docs/audit-evidence/n02g-selection-phase/local-validation.json`. Não repetir
essa ampla sem mudança causal de código/testes.

Daniel respondeu `trocado. siga` à consolidação, revisão e preparação do
commit sanitizado para auditoria. HEAD local e remoto confirmados em
be520f4f0cf64812c80f0f4b9b8eefb2a5445189 antes da preparação. Revisão local
confrontou regra normativa, delta estrutural, os seis grafos, suporte de
testes e distinção entre inventário de desenvolvimento e admissão de release.
Verificador compacto novamente PASS: 76 grafos, seis alterados, 70 intactos,
76 proofs preservadas. Sem mudança causal posterior à ampla verde.

Pacote de auditoria: `docs/audit-evidence/n02g-selection-phase/audit-request.md`,
`candidate-manifest.json`, `review-delta.patch`, `local-validation.json`,
`focal-records.json` e `verify-evidence.cjs`. Manifesto medido sobre os blobs
do índice Git sanitizado; diferenças de CRLF do checkout não são hashes de
bytes imutáveis. O hash candidato é o commit que contém o pacote, com pai
be520f4; conferir seu SHA completo no Git antes de enviar ao auditor.

Escopo focal solicitado: correção de seleção por fase e suporte de validação
(harness, inventário de desenvolvimento e relógios dos testes). Não promover
este verde a GO do motor completo ou à admissão dos 29 módulos pendentes.
O candidato aguarda auditoria independente. Não reutilizar a task/recibo da
auditoria antiga nem afirmar envio antes de confirmar a nova entrega.

Codex → Sol → Alto → conferir o commit sanitizado e fornecer o hash imutável à auditoria focal.
