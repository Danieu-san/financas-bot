# CP-01 — correções da fundação herdada

Data: 2026-09-08. Estado: VALIDAÇÃO LOCAL PASS; AUDITORIA PENDENTE.
Base: `5239c342b5705e64d3fb6412048382d665bcb6a4`.
Branch: `codex/financasbot-cp01-corrections-20260908`.

## Objetivo e escopo

Tratar H1 (admissão de código não revisado pelo analisador) e M1 (limite real
de chamadas paralelas), confirmados no relatório CP-01 publicado no canal em
`3362f9017bf3967760af6739f2ba682c23655f5f`. Daniel autorizou explicitamente
as correções antes da regularização do canal e auditoria manual no Chat.
Não alterar canal, bot de notificação, runtime v1, fórmulas NEXT-02, corpus,
dependências ou produção. CP-02 permanece posterior ao fechamento de CP-01.

## Decisão anterior à implementação — H1

A análise AST existente é uma análise sintática de padrões conhecidos, não
uma prova completa de ausência de efeitos em JavaScript arbitrário. Essa
alegação geral fica retirada. Não adicionar grafias de constructor à denylist.

A admissão passa a exigir SHA-256 do conteúdo integral UTF-8 de cada fonte
revisado, normalizando somente CRLF para LF. O contrato fechado enumera os 15
fontes da base atual e fica no validador, separado dos fontes executados.
Fonte sem contrato ou conteúdo divergente falha, independentemente de sintaxe,
alias, propriedade calculada ou mecanismo de reflexão. Inventário exato,
containment e análise AST permanecem barreiras complementares. O contrato de
AST integral do replay permanece inalterado.

Os pins não são regenerados no gate nem derivados do candidato durante testes.
Atualização deliberada de um pin exige revisão do respectivo código no novo
commit auditável. Hash prova identidade do código revisado, não sua correção
semântica nem segurança contra alguém autorizado a alterar simultaneamente
validador e contrato. Custos aceitos: até comentário exige atualização do pin;
mudança isolada de terminação de linha não exige. Não é sandbox de SO.

Regressão: manter pins fixos, gerar todas as partições de `constructor` como
chave calculada no witness inofensivo e aplicar mudanças a cada fonte do
inventário. Exigir recusa inclusive pelo gate herdado do NEXT-02. Nenhum mutant
executa rede, arquivos ou código externo. Controle positivo: fontes intactos.

## Decisão anterior à implementação — M1

O tracker mantém contagem de reads ativos. `reserveParallelReads` adquire vagas
sincronamente e devolve release idempotente, vinculado àquela reserva. O gateway
valida argumentos, adquire uma vaga e reserva o budget antes do adapter; libera
em finally, inclusive em recusa de budget, falha e resultado inválido. A quarta
chamada é recusada sem reservar chamada/fingerprint. Não criar fila ou scheduler.

Regressão: quatro chamadas sobre dois gateways com o mesmo tracker e Promises
controladas; pico máximo três, quarta recusada, vaga reutilizável após término,
rejeição, throw síncrono, resultado inválido e recusa de budget. Tracker distinto
é independente. Release repetido não pode liberar vaga de outra chamada.

## Validação e saída

REDs causais; syntax; 25 properties NEXT-01 (cenários nas properties existentes);
64 properties N02-E e bateria causal afetada. Adicionar modo CP-01 explícito ao
gate existente para vincular escopo/base desta correção, sem mudar a fatia N02-E
histórica. Revisão adversarial antes de uma única suíte ampla final.

Quando iniciar a ampla, pausar sem polling conforme pedido de Daniel; recuperar
a mesma execução ao continuar. Só depois consolidar números, commit/push
sanitizado, gate vinculado e prompt manual de auditoria. Não declarar GO antes
do parecer independente. Telemetria indisponível será registrada como tal.

## Evidência local do candidato

RED: 8 testes, 6 PASS e 2 FAIL nas regressões introduzidas. Após correção:
8/8 PASS. Gate CP-01: 25/25 herdadas + 64/64 N02-E, sem skips/todos;
admissão 15/15 fontes. Afetados: 137/137 PASS, zero falhas/skips/todos.
Comando do gate: `node scripts/agent/validateFinancasBotNext02.mjs --slice N02-E --checkpoint CP-01 --worktree`.
Final após commit: mesmo comando sem worktree, com expected-head do candidato
e expected-parent `5239c342b5705e64d3fb6412048382d665bcb6a4`.

Os testes das ferramentas em next02ObservationKernel, next02BillingReadModel e
next02Subcategories passam a usar tracker real em lugar de mock reserve-only.
Isso é adaptação causal ao contrato da boundary, não mudança de fórmula.
Fonte de hashes estática e congelada; 10 partições de chave, 45 mutações sobre
15 fontes e 15 controles CRLF/LF exercitam a integração com o gate herdado.

Revisão local: conferidos ordem validação → vaga → budget → adapter → finally,
ausência de await antes da aquisição, release idempotente por fechamento lexical,
reuso da vaga sem consumir fingerprint da recusa e independência de trackers.
O gateway exige a nova API de lease do budget confiado; não aceita silenciosamente
um mock reserve-only. O tracker é por turno/processo, não semaphore distribuído.
Pins e analisador pertencem à autoridade de revisão do código; atualizar ambos
deliberadamente não é ameaça que este gate prometa neutralizar. Não se converte
um digest em prova semântica. CP-01 é candidato até auditoria independente.

Única suíte ampla final: `npm test`, Node v22.17.0, duração 749.877 ms.
Relatório EXHAUSTIVE_LOCAL_TEST_RESULT: exit_status=0, valid=true,
validation_reasons=[], failures=[]; stderr vazio. 1.993 testes, 1.983 PASS,
zero FAIL/CANCELLED/TODO, 10 SKIP. Cobertura: 91,92% linhas, 75,56% branches,
91,56% funções. Os skips declarados não são contados como aprovação.
Nenhuma mudança causal após essa execução; atualização posterior somente desta
evidência documental. Gate vinculado ao SHA final ainda deve ser executado
depois do commit; auditoria independente será enviada manualmente por Daniel.
