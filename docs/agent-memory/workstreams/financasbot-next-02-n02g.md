# N02-G — checkpoint

Data: 2026-09-11. Estado: CHARTER APROVADO; IMPLEMENTAÇÃO INICIADA, SEM GO EXECUTÁVEL.
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

Próxima ação exata: completar associação semântica das demais obrigações,
incluindo sujeito/período/estado/coverage/seleção e respectivos requisitos
derivados, então lowering/IR integral, antes de demonstrar a fronteira
de execução. Nenhum PASS intermediário
libera rollout ou substitui o gate integral. Ampla somente no candidato estável;
ao iniciá-la, pausar sem polling, conforme preferência de Daniel.

Telemetria de calibração: não consultada nesta abertura; métricas de uso
NAO_DISPONIVEL. Não amplia coleta nem bloqueia o produto.

Codex → Astra → Alto → completar o compiler após o charter já aprovado.
