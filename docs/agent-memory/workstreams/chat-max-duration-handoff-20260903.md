# Handoff completo — conversa Chat FinançasBot encerrada por duração máxima

Data: 2026-09-03
Motivo: a conversa principal atingiu a duração máxima do produto. Este arquivo existe para que uma conversa nova do Chat continue praticamente do ponto exato em que o trabalho parou, sem redescobrir decisões, SHAs, gates ou o contrato Chat↔Codex.

> Segurança: este handoff é deliberadamente sanitizado. Não contém URL real da conversa, paths locais privados, segredos, credenciais, `.env`, dados financeiros reais ou conteúdo privado de runtime.

## 1. Modelo operacional que deve ser preservado

### 1.1 Divisão de trabalho

- **Chat desta conversa / próximo Chat = implementador principal e reconciliador causal.** Sempre que uma mudança puder ser feita com segurança via GitHub, o Chat deve fazê-la diretamente.
- **Codex = executor mecânico/ambiental.** Usar Codex para testes locais, builds, runtime, Git/worktree local, Windows, processos, Docker/OCI ou tarefas que dependam do ambiente; não delegar ao Codex implementação que o Chat consegue fazer diretamente sem necessidade ambiental.
- **Chat limpo = primeiro auditor independente** de candidatos materiais.
- **Abacus / Claude Sonnet 5 = segundo auditor independente** quando o gate material exigir dupla auditoria.
- O Chat que implementou não deve fingir independência para auditar a própria mudança.
- Findings são aceitos/rejeitados pela **cadeia causal** (`entrada/estado -> código -> transformação -> comportamento -> consequência`), nunca por votação entre modelos ou autoridade do auditor.

### 1.2 Contrato de capacidade do repositório

Antes de tarefa não trivial, o primeiro update visível deve seguir exatamente:

`Superfície → Modelo → Esforço → Próxima tarefa`

Antes de uma resposta final/handoff, incluir:

1. Resultado;
2. Inteligência/significado da evidência;
3. Capacidade recomendada na mesma estrutura;
4. Próximo passo concreto.

Ler/obedecer `AGENTS.md` e `docs/agent-memory/README.md`. O gate raiz histórico (`docs/agent-memory/current.md`) está fechado; workstreams paralelos têm checkpoint/plano próprios.

Não autorizar implicitamente deploy, produção, dados privados, OCI, WhatsApp real, Google/Pluggy real, writers, flags, migração, backfill ou retirada de legado.

### 1.3 Auditorias independentes

Preferência permanente do usuário: quando uma auditoria independente for necessária, entregar **o prompt completo, pronto para colar**, sem esperar nova solicitação.

Para auditoria Claude/Abacus, consultar a fonte externa canônica chamada **“Protocolo canônico — auditoria Abacus Claude”**. Antes de gerar CADA prompt Claude:

- confirmar no GitHub o SHA imutável;
- confirmar primeiro parent;
- confirmar paths canônicos exatos da tarefa;
- usar Manifest Gate fail-closed;
- baixar cada arquivo obrigatório por metadata/download_url no ref exato;
- exigir HTTP 200, bytes integrais, tamanho igual à metadata e Git blob SHA calculado igual ao metadata SHA;
- adquirir commit/diff integral;
- qualquer falha de manifesto => `AUDIT_INCOMPLETE_MANIFEST_GATE`, sem findings/GO;
- distinguir histórico persistido de novas escritas;
- tratar resultado do Codex como alegação do implementador (`CONFIRMADA / NÃO DEMONSTRADA / CONTRADITA`);
- avaliar findings por causalidade, não por autoridade.

## 2. Canal permanente Chat ↔ Codex — contrato canônico atual

Repositório: `Danieu-san/financas-bot`

Branch operacional:

`chat/chat-codex-orchestration-20260824`

Paths canônicos:

- estado: `docs/agent-memory/workstreams/chat-codex-channel.state.json`
- manifesto-slot: `docs/agent-memory/workstreams/tasks/chat-codex-task-slot.json`
- resultados: `docs/agent-memory/workstreams/results/<task_id>.md`
- memória: `docs/agent-memory/workstreams/chat-codex-channel.md`
- plano: `docs/plans/workstreams/chat-codex-channel.md`

Fluxo por tarefa:

`CHAT_WORKING -> CODEX_READY -> CODEX_RUNNING -> CHAT_READY -> CHAT_WORKING`

`FINISHED` é reservado à desativação explícita do serviço.

### 2.1 Como o Chat envia uma tarefa ao Codex

Sempre em duas fases:

1. enquanto o estado está `CHAT_WORKING`, editar o manifesto-slot existente em commit inerte;
2. só depois publicar em commit separado a transição do state para `CODEX_READY`.

Isso produz uma transição real observável pelo watcher. Não substituir a tarefa enquanto o state já estiver em `CODEX_READY`, porque o watcher pode não enxergar um novo evento.

Não fazer polling repetido: ao conferir retorno delegado, fazer uma verificação autoritativa do estado; se não estiver pronto, não ficar consultando o mesmo estado inalterado.

### 2.2 Protocolo assimétrico de auditoria — estado atual

A solução que deve ser preservada agora é assimétrica:

- `Codex -> bot local -> Chat`: depois que existe um novo candidato imutável que realmente precisa de auditoria, o **Codex invoca deliberadamente o bot local** com o prompt completo da auditoria. Essa chamada é externa ao watcher.
- `Chat -> GitHub/CODEX_READY -> watcher -> Codex`: o Chat devolve o parecer pelo canal versionado. O watcher recebe normalmente a nova tarefa e acorda o Codex somente em `CODEX_READY`.
- `CHAT_READY`: deve ser terminal/silencioso **na configuração operacional atual**, pois o notificador opcional continua existindo no código aprovado, mas seus argumentos não devem estar configurados na Scheduled Task.

Configuração operacional declarada atualmente:

- remover/omitir `chat-notifier-script`;
- remover/omitir `chat-notifier-sha256`;
- no modo fila, remover/omitir `chat-url`;
- **preservar `app-wake-request`**;
- preservar as demais configurações do watcher;
- não desativar o watcher inteiro, pois ele precisa continuar recebendo `CODEX_READY`.

O bot local não foi modificado neste recovery. Relato operacional: DryRun de prompt em linha única passou; multiline falhou antes de enviar. Por isso prompts para esse bot devem ser enviados em **uma linha única** enquanto a causa do multiline não for diagnosticada. Isso é workaround do chamador, não correção interna do bot.

## 3. Histórico curto do ORCH-02 que explica o estado atual

### 3.1 Versão que funcionou de ponta a ponta

O canal já foi provado em smoke real nesta conversa:

- task de smoke: `ORCH-02-CHANNEL-SMOKE-20260903`;
- o Chat publicou `CODEX_READY`;
- Codex consumiu e publicou `CHAT_READY` com `CHANNEL_SMOKE_OK`;
- a campainha do bot chegou ao Chat no formato novo `AUDITORIA_FINANCASBOT_PRONTA`;
- o Chat confirmou o commit imutável e o result file;
- parecer do smoke: `CHANNEL_SMOKE_PASS`.

A cadeia observada foi:

`Chat -> GitHub CODEX_READY -> watcher -> Codex -> GitHub CHAT_READY -> bot local -> Chat`.

Esse smoke mostrou que a infraestrutura podia funcionar, mas também revelou que notificar automaticamente todo `CHAT_READY` era inadequado para o fluxo de auditorias, pois podia criar recursão.

### 3.2 Mudança posterior ruim e recovery mínimo

O candidato `378cc293db0083f5445b822a33a70288c1a6f935` removeu código desnecessariamente e a pausa do watcher interrompeu o recebimento.

O recovery auditado agora é:

`0c2377c8688e4b665e35cf025c2837b8c281160c`

parent único:

`378cc293db0083f5445b822a33a70288c1a6f935`

tree:

`ead1b8449d79068787344770132b482115212b73`

O compare parent→candidato tem exatamente 11 arquivos. O recovery restaura oito arquivos de código/testes/validador aos bytes Git do baseline aprovado `9cae58d21b176dcde501d5322afc36446f532a0c` e altera três documentos para descrever a configuração assimétrica.

Arquivos de código/testes restaurados:

1. `scripts/agent/Install-ChatCodexOrchestrationWatcher.ps1`
2. `scripts/agent/chatAuditNotifier.js`
3. `scripts/agent/completeChatCodexAppExecution.js`
4. `scripts/agent/validateAgentWorkflow.js`
5. `scripts/agent/watchChatCodexOrchestration.js`
6. `tests/chatAuditNotifier.test.js`
7. `tests/chatCodexWatcherInstaller.test.js`
8. `tests/chatCodexWatcherSync.test.js`

Documentos alterados:

9. `.agents/skills/audit-immutable-gate/SKILL.md`
10. `docs/agent-memory/workstreams/chat-codex-channel.md`
11. `docs/plans/workstreams/chat-codex-channel.md`

Contexto causal adicional lido na auditoria:

- `scripts/agent/chatCodexAppWake.js`
- `tests/chatCodexWatcher.test.js`

### 3.3 Parecer independente já concluído sobre `0c2377c...`

Relatório canônico:

`docs/agent-memory/workstreams/results/ORCH-02-MIN-RECOVERY-AUDIT-20260903.md`

Veredito:

**APROVÁVEL**

Findings:

- CRITICAL: nenhum;
- HIGH: nenhum;
- MEDIUM: nenhum;
- LOW-01: o instalador restaurado ainda exige `ChatNotifierScript` + `ChatUrl` no `Install`, então o instalador não consegue recriar diretamente a configuração assimétrica sem notifier que foi aplicada à Scheduled Task existente.

Cadeia causal do LOW-01:

`Install via script versionado -> notifier/URL ausentes -> throw antes de registrar Scheduled Task`.

Isso **não bloqueia o runtime atual**: sem `chat-notifier-script`, os três caminhos de `CHAT_READY` permanecem silenciosos e `app-wake-request` continua recebendo `CODEX_READY`.

A auditoria confirmou estaticamente os três caminhos:

1. observação direta de `CHAT_READY`;
2. conclusão pelo Codex App;
3. conclusão pelo caminho CLI.

Em todos, `maybeWakeCodexApp()` só atua em `CODEX_READY`; e `maybeNotifyChat()` só é chamado quando `chat-notifier-script` está configurado. Sem esse argumento, não há spawn do bot.

O `app-wake-request` é independente do `chat-notifier-script` e continua funcional em `CODEX_READY`.

### 3.4 Evidência de execução — NÃO converter em prova independente

Relato local fornecido ao auditor:

- `53/53` testes focais, zero skip/todo;
- `validateAgentWorkflow.js: OK`;
- igualdade dos oito arquivos com `9cae58d...` conferida localmente;
- Scheduled Task teve removidos apenas `chat-notifier-script`, `chat-notifier-sha256` e `chat-url`, preservando `app-wake-request` e demais argumentos;
- script local do bot inalterado;
- DryRun linha única passou;
- DryRun multilinha falhou antes do envio.

Suíte ampla anterior: **NÃO VERDE**.

`1885 PASS`, `8 FAIL`, `10 SKIP`.

Quatro falhas do canal passaram isoladamente, mas a causa da divergência não foi demonstrada. Não alegar interferência concorrente, nem qualquer outra causa, sem prova causal.

Não havia status checks/workflow runs associados ao SHA auditado no GitHub no momento da auditoria.

## 4. Estado exato do canal no momento do handoff

Antes da criação deste arquivo, a branch operacional estava em:

`2dcce1c42f3fd235aea852e84ea23734a12a8d7d`

mensagem:

`chore: publish ORCH-02-MIN-RECOVERY-AUDIT-RETURN-20260903 CHAT_READY`

O state nesse commit estava:

- `orchestration_state = CHAT_READY`
- `next_executor = chat`
- `task_id = ORCH-02-MIN-RECOVERY-AUDIT-RETURN-20260903`
- `expected_base_sha = 0c2377c8688e4b665e35cf025c2837b8c281160c`
- `result_file = docs/agent-memory/workstreams/results/ORCH-02-MIN-RECOVERY-AUDIT-RETURN-20260903.md`

O result file confirma que o Codex consumiu o parecer `APROVÁVEL`, registrou o LOW-01 como não bloqueante, preservou `app-wake-request` e não reabriu NEXT-01 nem abriu NEXT-02.

A conversa que cria este handoff deve devolver o canal a `CHAT_WORKING` logo após publicar este documento. **O próximo Chat deve sempre confirmar o state atual no GitHub, em vez de confiar apenas nesta fotografia.**

## 5. Próxima ação recomendada no ORCH-02

Depois de confirmar que o state está novamente em `CHAT_WORKING`, não reauditar `0c2377c...`: o parecer já é `APROVÁVEL`.

O único resíduo operacional material é fechar a recuperação com evidência suficiente de que a configuração real permanece assimétrica:

- publicação remota do retorno já está confirmada pelo commit `2dcce1c...`;
- ainda é válido confirmar operacionalmente que `CHAT_READY` não disparou bot/nova execução e que `app-wake-request` permanece presente;
- não reinstalar o watcher via instalador atual sem um gate separado, porque `Install` reexige notifier/URL (LOW-01);
- qualquer futura mudança do instalador é nova implementação e exige candidato/testes/auditoria próprios.

Não abrir NEXT-02 como efeito automático desse fechamento.

## 6. FinançasBot NEXT — estado preservado nesta conversa

Branch NEXT-01:

`codex/financasbot-next-01`

HEAD confirmado em 2026-09-03:

`29791be6ba3f80fc8033bd6cb715484e7275a3c5`

Esse commit registra a auditoria independente do candidato funcional:

`9b0cfd848d08b85ed94016b65f07820ca89dbbfb`

parent:

`ccff4711c4e70c6d1b8c1227ebf70d91f89f3552`

Relatório:

`docs/agent-memory/workstreams/results/FIN-NEXT01-AST-REAUDIT-20260903.md`

Veredito:

**APROVÁVEL**

Findings CRITICAL/HIGH/MEDIUM/LOW: nenhum.

A mudança auditada substituiu recognizer seletivo do loader hermético por SHA-256 da AST canônica integral. A auditoria não encontrou rota causal de falso verde; a rigidez pode gerar falso RED futuro/manutenção, o que foi classificado como nota não bloqueante.

O retorno ao Codex também foi consumido pelo canal. **Não reabrir NEXT-01 apenas para acusar recebimento.**

A branch NEXT-01 ainda não deve ser interpretada automaticamente como autorização para NEXT-02. O usuário não autorizou NEXT-02 neste fluxo.

Roadmap do Next disponível no branch NEXT-01:

`docs/plans/workstreams/financasbot-next-roadmap-draft-v2.md`

O roadmap declara que NEXT-02 é o primeiro vertical financeiro e depende do fechamento explícito do NEXT-01; não pular esse gate.

## 7. Workstream financeiro anterior — preservar como histórico aberto, não confundir com NEXT

Esta conversa também carregou o ROAD-01.2 do roadmap financeiro anterior.

Último candidato auditável conhecido nessa linha:

`2f698e5e396b77bf2271925ea1a87907b966f95f`

A implementação funcional de recovery de identidade de cartão ficou em torno de `e4bfe14b9e436c70b6f4ef08a347de2b4c718af0`, com helper/testes para:

- mesmo `card_id` + mesma competência + labels diferentes => um grupo;
- legado G vazio/H preenchido continua incluído;
- labels legacy distintos continuam distintos;
- canonical e legacy não se fundem heuristicamente;
- display amigável separado da identidade;
- writer preservando G/H/I/J.

Foram gerados prompts de dupla auditoria, mas **nenhum par de relatórios finais foi reconciliado nesta conversa**. Portanto não inferir `GO ROAD-01.2` a partir deste handoff. Essa linha ficou secundária quando o trabalho migrou para FinançasBot Next/ORCH-02.

O roadmap financeiro anterior tinha sido tratado como canônico em outro branch/documentação; antes de retomá-lo, confirmar os paths e o SHA no GitHub em vez de depender da memória deste arquivo.

## 8. Regras práticas que evitaram regressões nesta conversa

- GitHub é fonte de verdade; campainhas/bot/UI são transporte.
- Para mensagens `AUDITORIA_FINANCASBOT_PRONTA` ou `ORCH_WAKE`, validar commit/state/result no SHA imutável antes de agir.
- Campainha cujo `task_id/hash/state` não coincide com GitHub deve ser rejeitada fail-closed como obsoleta.
- Não reenviar tarefa às cegas quando o GitHub retorna erro de rede: primeiro conferir state remoto para evitar duplicidade.
- Não mudar state para nova tarefa enquanto ele já está `CODEX_READY`; faça transição real ou volte a `CHAT_WORKING` antes do novo dispatch.
- O watcher deve receber `CODEX_READY`; não pausar/desativar o serviço apenas para impedir retorno recursivo.
- O notificador opcional continua no código; silêncio de `CHAT_READY` depende da configuração sem `chat-notifier-script`.
- `app-wake-request` é o caminho operacional importante do modo fila e deve ser preservado.
- Não declarar suíte ampla verde quando ela não foi verde.
- Mesmo Chat pode revisar retorno mecânico do canal, mas não deve fingir independência sobre implementação que ele próprio fez.
- Auditorias materiais devem usar SHAs imutáveis e arquivos integrais, não snippets ou relatórios por autoridade.

## 9. O que NÃO deve ser feito ao retomar

- Não abrir NEXT-02 sem autorização humana explícita.
- Não fazer deploy/produção/dados reais.
- Não alterar o instalador para resolver LOW-01 sem abrir novo gate/candidato/auditoria.
- Não remover o notificador opcional do código só porque ele está desconfigurado localmente.
- Não reinstalar o watcher inadvertidamente com notifier e reintroduzir auditoria recursiva.
- Não reabrir a auditoria NEXT-01 já aprovada por causa de mensagens do canal.
- Não atribuir causa às 8 falhas da suíte ampla anterior sem prova.
- Não tentar “consertar” multiline do bot sem diagnóstico específico; usar linha única por enquanto.

## 10. Prompt recomendado para a próxima conversa

Cole no novo Chat:

> Estou continuando uma conversa do projeto FinançasBot que atingiu a duração máxima. Antes de agir, leia integralmente no GitHub o arquivo `docs/agent-memory/workstreams/chat-max-duration-handoff-20260903.md` da branch `chat/chat-codex-orchestration-20260824`, além de `AGENTS.md` e `docs/agent-memory/README.md`. Confirme o HEAD atual dessa branch e leia `docs/agent-memory/workstreams/chat-codex-channel.state.json`. Trate o GitHub como fonte de verdade e o handoff apenas como índice. Preserve a divisão de trabalho: Chat é implementador/reconciliador principal; Codex é executor mecânico/ambiental; auditorias independentes usam Chat limpo e, quando material, Abacus/Claude seguindo o protocolo canônico. O ponto de retomada é ORCH-02: o recovery `0c2377c8688e4b665e35cf025c2837b8c281160c` recebeu parecer independente `APROVÁVEL`, com apenas LOW-01 não bloqueante sobre o instalador não reproduzir diretamente a configuração sem notifier. O retorno do Codex chegou em `2dcce1c42f3fd235aea852e84ea23734a12a8d7d`. Verifique que o canal está/foi devolvido a `CHAT_WORKING`; não reaudite o mesmo SHA e não abra NEXT-02. Primeiro me diga, com `Superfície → Modelo → Esforço → Próxima tarefa`, qual é o estado exato que você confirmou no GitHub e qual é a única próxima ação necessária para fechar o ORCH-02 sem reintroduzir auditoria recursiva.

## 11. Checklist de retomada para o próximo Chat

1. Ler este handoff integralmente.
2. Ler `AGENTS.md` e `docs/agent-memory/README.md`.
3. Confirmar HEAD da branch operacional.
4. Ler state atual e task-slot atual.
5. Se state ainda estiver `CHAT_READY` da tarefa `ORCH-02-MIN-RECOVERY-AUDIT-RETURN-20260903`, consumir o resultado e devolver a `CHAT_WORKING`; se já estiver `CHAT_WORKING`, não alterar sem necessidade.
6. Confirmar que não surgiu commit posterior inesperado em `0c2377c...`/ORCH-02.
7. Tratar o parecer `ORCH-02-MIN-RECOVERY-AUDIT-20260903.md` como fechado em `APROVÁVEL`.
8. Planejar somente a validação operacional residual de silêncio de `CHAT_READY`/preservação de `app-wake-request`, sem reinstalação.
9. Não abrir NEXT-02.
10. Antes de qualquer nova auditoria Claude/Abacus, consultar o protocolo canônico e reconfirmar SHA/paths no GitHub.
