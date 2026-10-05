# Claim month profile — evidência local parcial, 2026-10-04

## Atualização posterior — focal isolado local, ainda HOLD

Uma única ampla hermética local foi iniciada após revisão/correções:
job `.codex-temp/claim-month-hermetic-wide-20261004-job.json`, PID27708,
Node22.17.0, início2026-10-04T20:24:55.817Z, fim2026-10-04T21:32:50.827Z.
Fontes medidas `sha256:fde3269da7c99726e80a8071df4d95e0477b2af7358dee488cb7531aa97da7aa`.
Exit1:2618 testes,2572 PASS/36 FAIL/10 SKIP,zero cancelled/todo; fontes inalteradas.
summary_complete=false por coverage_summary_missing (coverage=null). Relatório
hash `sha256:a1a137419f7d8c858fd6d3c7f4ca0bd6f226ea36c882ec54854605a4cc1344a0`;
log hash `sha256:c5d71594dae92d569591e8ce662f8bb949f15e33f850cdc6dd3c5a38187cf7bd`.
Resultado permanece RED/incompleto. Os36 títulos não coincidem simplesmente
com três falhas legadas; classificação exige diagnósticos focais reais. Runner
não reteve TAP bruto de falhas, portanto não inferir a causa pelo título.
Monitor excluído; sem nova ampla automática. Histórico2413/3/10 permanece RED.
Auditoria de código não foi enviada.

### Reconciliação focal posterior à ampla

O primeiro focal hermético sem coverage teve6 testes/1 PASS/5 FAIL,
log hash `sha256:eaddc0338adc289dea3ef26ef1c59f1e9ac775c95166f1ef318de39e3328bb46`.
Confirmou classes de inventário estático/de desenvolvimento e leitura Git
histórica; HOST-007 passou somente no focal, sem apagar seu FAIL amplo.
Após RED, dois leitores históricos usam a mesma primitiva raw imutável
`scripts/agent/immutableGitBlob.cjs`, raiz fixa, SHA/path estritos, ambiente
sanitizado,16MiB/UTF8. Tripwire inalterado: nada de Git show/filtros/rede.
Focal hermético5 testes/4 PASS/1 FAIL, fontes inalteradas:
log `sha256:c0d3a082fe54505c124d0c9712f68e205ba001f49ccf55f1630e4bdf0eee2f97`.
PARENT-AUTHORING-001 passou. ACCOUNT-INSTALLMENT-001 agora chega à comparação
e revela que o helper histórico exige o corpus pré-source_state: não aceitar
essa divergência por remoção arbitrária de campos; falta compor autoridades
ratificadas explicitamente antes de fornecer a visão histórica.
O scanner de imports foi corrigido após RED para percorrer AST real: ignora
texto de programas emitidos, mas inclui expressões executadas de templates,
reexports e imports dinâmicos; .cjs explícitos passam a integrar o inventário.
Três focais passaram. Inventário atual ainda bloqueia o import virtual real
schemaValidators do launcher capturado; não foi silenciado por allowlist.
Inventário de desenvolvimento ainda precisa reconciliar módulos novos e o
canonicalValue alterado, sem promover hashes WIP a reviewed. Causas dos hosts
com coverage e ausência do resumo de coverage continuam não comprovadas.

Diagnóstico real com coverage iniciado2026-10-04T21:57:28.091Z,
runner196132/child16308, job `.codex-temp/month-host-coverage-focal-20261004-job.json`;
somente HOST-007/FINANCIAL-HOST-001, mesmo Node22.17.0/tripwire/medição,
log bruto persistente. Fontes iniciais
`sha256:6b2addc809da96521b36cb49ccd88c6fd9f5619314738567fb8e793638cecc6f`.
Não editar fontes medidas; acompanhamento8min criado somente após execução.
Fim2026-10-04T21:59:59.091Z,exit0,2/2 PASS, fontes inalteradas; coverage
lines55.73/branches63.61/functions66.92. Log hash
`sha256:1c70d377b52cd5404363c796fc792e64bda4d25bf0081a643196f915de1dd251`,
stderr vazio. Monitor excluído. Esse focal não constitui ampla nova nem
retifica a ampla RED anterior; causa dos dois FAILs amplos não reproduzida.
O parser reconheceu coverage real: sem alteração por hipótese ou aumento5s.

Retenção do runner implementada após RED: artefatos brutos exclusivos com
hash/tamanho e campo de erro de subprocesso; captura parcial nunca vira
summary completa por aparência dos contadores. Limite128MiB/flags/rede
preservados. ENOBUFS real coberto; bateria afetada runner/leitor21/21 PASS,
exit0/zero skips. Log `.codex-temp/month-runner-reader-affected-C80nT3/stdout.tap`,
hash `sha256:4cbd14e620b0d7a4921d37778a38f752335cc5c0ac5d11289e1f463e29205cda`.
Não recupera evidência passada, não representa nova ampla nem GO de código.

A revisão adversarial encontrou ausência de comparação exata C/M/S no crédito
do driver, apesar da cobertura independente e do teste de integração já exigirem
integridade do core. Correção: gate diferencial ordenado suplementar, sem formar
oracle/manifesto esperado de actual; mantém multiplicidade, origem/site/outcomes.
Só normaliza metadados de invocação/sequência e proof artifact root específico
da variante, já verificado no freeze. MONTH-PROFILE-015 demonstra recusa de
duplicação, reordenação, site/outcome/medição colateral, getters/proxies.
RED inicial API ausente; RED por orçamento agregado de três traces; admissão
agora separada por controle preserva o limite original. Focais014/015:2/2 PASS.
Primeiro lote core-exact RED observation_shape_invalid preservado, sem crédito.
Após correção causal, relatório real r2:exit0,1/1/1/1, invocações únicas,
fontes inalteradas, exact_control_core_matched=true. Relatório
`.codex-temp/claim-month-profile-core-exact-20261004-r2.json`, hash
`sha256:8ebdd188c56cb369b0991a326a81173e9f203ba1c51a2ba7a3ce39f30a096061`.
Core de C/M/S igual:
`sha256:c0ab5ce75f9430d65ee9e54f2519f657ec355bb03c2157100967cccc67ab9f33`.
Stdout r2 hash `sha256:a79625b62ba45466cc44c47e76d4a9c82fddd47dbf7c52e76d61944412371634`;
stderr vazio. Somente M rejeita period/binding_1; positivo/C/S preservados.
Mesmo ID v2, nenhum receipt;2418 fora do recorte continuam pendentes. O relatório
anterior abaixo permanece histórico e não é retificado como prova do gate novo.

A evidência parcial abaixo é histórica. O driver isolado qualificou localmente
M-01#1#1/binding_1 no mesmo freeze positivo C/M/S: 1/1/1/1, exit0,
scope_valid=true, measured_sources_unchanged=true. Relatório preservado
`.codex-temp/claim-month-profile-scope-20261004.json`, hash
`sha256:6a492d35b8a7d53bbd7952446fe5a1999b94b4918b6e2ed6869813c09dfe281f`.
Isso não aprova código nem ativa v2; 2418 IDs fora do recorte ficam pendentes.
Não somar este crédito ao ledger histórico. Nenhum receipt/GO financeiro.

Bateria posterior perdeu a saída final, sem total PASS recuperado. A retomada
foi bloqueada por acesso local; correção ACL autorizada concluiu e o probe normal
passou leitura/dependência/escrita/limpeza/subprocesso/Git, sem elevação.
Lote persistente de onze arquivos concluiu exit1 com69 testes:68 PASS/1 FAIL,
zero cancelled/skipped/todo, summary_complete=true e fontes inalteradas.
Job `.codex-temp/claim-month-affected-resumed-job-20261004.json`; stdout hash
`sha256:4676c114187a42b9d4adb2e494ca94063d87b020d19c8207235a6bee3bd69783`;
stderr vazio hash `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
O único RED foi a expectativa histórica19 módulos de HOST-CAPSULE-001:
o child agora captura também claimMonthIsolatedProfile.js, total20.
A correção troca a contagem por lista independente exata e unicidade dos20
paths, sem alterar runtime/receitas/permissões/timeout. Syntax PASS; somente
executionHost.cases.js reexecutado:12/12 PASS, exit0, zero demais estados.
Log `.codex-temp/claim-month-capsule-affected-20261004.log`, hash
`sha256:7a4f66ca13252617111e22c4a297667485e91b112bebb2dad1ff2df9ca17db3a`.
O lote anterior permanece RED; estes resultados não são somados em um total
fabricado. Monitor do lote excluído. Próxima evidência: revisão adversarial
do recorte e candidato sanitizado estável, antes de ampla/auditoria.
Ainda sem ampla final nova, commit ou auditoria independente de código.

## Evidência histórica da primeira implementação

Estado: **HOLD; implementação parcial não auditada**. Autoridade documental:
`04eb9545516d100aa45e1ac6d8ebfda444fafbd7`, perfil `claim-month-path-completion/v1`.
Produto: branch `codex/n02g-host-parent-reconcile-20261001`, HEAD
`98e3d6a929541e3238362400504c884c34031f22` preservado, WIP preexistente mantido.

## Recorte efetivamente demonstrado

- Transporte privado ligado às autorias C/M/S e claims exatas, limitado à
  subobrigação nominada `claim.period.binding_locator` do alvo.
- Compiler completo sobre M; validações restantes e anchor original preservados.
  Compiler financeiro normal continua recusando o locator auxiliar.
- Expected autoria→IR selado antes de M, com conformance independente do alvo
  e comparação de todo o restante do IR. Normalização, sites extras/omitidos,
  alteração de tipo/operands e getters/proxies não recebem crédito.
- Diagnóstico P nativo executa o predicado alvo sobre uma view auxiliar tipada;
  apenas M rejeita o alvo, C/S restauram. Origem/fase/site auxiliares vêm do
  controller/dispatch nativo; core claim/context e transporte D iguais ao normal.
- Flags de execução/qualificação financeira permanecem falsas. Esta evidência
  NÃO demonstra execução do perfil no guest isolado ou identidade de root C/M/S.

## Escada de validação local

REDs causais: APIs ausentes; getters no IR; import capturado ausente; ciclo de
dependências introduzido (lote intermediário44 PASS/4 FAIL); fechamento52 módulos
contra expectativa histórica49. Nenhum RED anterior é reescrito como PASS.
Correção do ciclo separa o núcleo de requisitos e a classificação nominal pura;
a proibição de ciclos e a receita de dependências explícitas permanecem.

Lote final serial Node22.17.0:48 testes,48 PASS,0 FAIL,0 SKIP,225609.0295ms.
Arquivos executados:

- `claimMonthPathProfile.cases.js` (8 testes novos);
- `claimRequirements.cases.js`, `graphStructure.cases.js`, `predicateTypes.cases.js`;
- `graphCompiler.cases.js`, `claimContext.cases.js`;
- `validationTcb.cases.js`, `financialHost.cases.js`.

A regressão financeira executou duas cadeias positivas independentes de76 grafos
e304 fases no host capturado; oracle externo do harness, referências entre
execuções recusadas. Isso é regressão do caminho normal, não qualificação do perfil.
Syntax11 PASS; `validateAgentWorkflow.js` OK; diff-check dos tracked afetados OK.
Duas invocações iniciais sem cwd efetivo não encontraram os paths e NÃO executaram
testes; não entram nas contagens. Não houve suíte hermética ampla nova.

## Pendências / próxima fronteira

Atualização de2026-10-04: a execução mensal isolada r2 já qualificou localmente
somente M-01/binding_1 sob04eb954,com igualdade exata C/M/S; ver checkpoint vigente
e `.codex-temp/claim-month-profile-core-exact-20261004-r2.json`,hash
8ebdd188c56cb369b0991a326a81173e9f203ba1c51a2ba7a3ce39f30a096061.
Ampla posterior permaneceu RED/incompleta:2618/2572 PASS/36 FAIL/10 SKIP,
sem summary de coverage. Reconciliação causal subsequente preservou hashes
revisados e compôs fontes históricas exclusivamente de Git+adendos ratificados.
Novas evidências focais:cadeia/TCB10 PASS,codecs/inventários13 PASS,gates prévios6 PASS,
todos com fontes inalteradas e logs/hashes no checkpoint. Lotes intermediários
RED preservados. Nenhum candidato de código auditado; nenhum GO global.
O texto abaixo descreve a fronteira anterior, não revoga a atualização vigente.

Executar M no programa medido/child isolado, vincular origem/site/core/fringe
externamente, selar perfil/sidecar/identidade TCB e provar quarentena C/M/S
sem receipt, validated_parent ou promoção por remoção de metadata. Depois,
qualificar somente o ID v2 original, com invocação própria e todos os controles.
Ainda sem esse crédito: histórico2419/1331/390/387 e2032 UNSAT preservado.

Recomendação reavaliada: a integração executa interfaces já ratificadas e possui
REDs delimitados; a indicação anterior Astra/Alto foi conservadora demais.
`Codex → GPT-6.1 Sol → Alto → integrar execução isolada e identidade de quarentena`.
Não há trava de troca nem mudança automática. Nenhum GO de código/G11/N02-G/NEXT-02,
NEXT-03, deploy, produção ou dados reais.
