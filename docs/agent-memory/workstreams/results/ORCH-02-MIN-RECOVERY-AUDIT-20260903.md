# ORCH-02 — reauditoria independente focal da recuperação mínima

Data: 2026-09-03
Auditor: Chat / GPT-5.6 Sol
Tipo: revisão estática independente de consistência, escopo e testes por commit imutável

## Manifesto confirmado

- repositório: `Danieu-san/financas-bot`
- branch operacional: `chat/chat-codex-orchestration-20260824`
- commit auditado: `0c2377c8688e4b665e35cf025c2837b8c281160c`
- parent único confirmado: `378cc293db0083f5445b822a33a70288c1a6f935`
- tree do candidato: `ead1b8449d79068787344770132b482115212b73`
- compare: exatamente 1 commit à frente do parent
- delta: exatamente 11 arquivos

Arquivos do pedido lidos integralmente no SHA auditado:

1. `scripts/agent/Install-ChatCodexOrchestrationWatcher.ps1`
2. `scripts/agent/chatAuditNotifier.js`
3. `scripts/agent/completeChatCodexAppExecution.js`
4. `scripts/agent/validateAgentWorkflow.js`
5. `scripts/agent/watchChatCodexOrchestration.js`
6. `tests/chatAuditNotifier.test.js`
7. `tests/chatCodexWatcherInstaller.test.js`
8. `tests/chatCodexWatcherSync.test.js`
9. `.agents/skills/audit-immutable-gate/SKILL.md`
10. `docs/agent-memory/workstreams/chat-codex-channel.md`
11. `docs/plans/workstreams/chat-codex-channel.md`

Contexto causal adicional lido no mesmo SHA:

- `scripts/agent/chatCodexAppWake.js`
- `tests/chatCodexWatcher.test.js`

A comparação `9cae58d21b176dcde501d5322afc36446f532a0c...0c2377c8688e4b665e35cf025c2837b8c281160c` altera somente os três documentos listados acima. Portanto os oito arquivos de código/testes pedidos estão efetivamente byte-idênticos ao conteúdo Git do baseline aprovado `9cae58d21b176dcde501d5322afc36446f532a0c`.

## Escopo observado

A recuperação não introduz implementação nova nesses oito arquivos. Ela restaura o watcher/notificador/instalador/testes aprovados e muda somente a documentação para usar uma configuração operacional assimétrica: o bot de auditoria é chamado deliberadamente pelo Codex; o retorno do Chat usa o canal GitHub; o notificador opcional do watcher permanece no código, mas deve estar ausente dos argumentos da Scheduled Task operacional.

Nenhum runtime financeiro, NEXT-01, NEXT-02, writer, adapter real, deploy ou produção foi alterado por este delta.

## Cadeia causal — solicitação de auditoria

O mecanismo declarado `Codex -> bot local -> Chat` não é implementado pelo watcher recuperado. Os documentos o descrevem como invocação deliberada e externa ao watcher, o que é coerente com a recuperação mínima: o watcher não precisa inferir que um candidato exige auditoria.

O script local do bot não pertence ao delta e não foi tratado como alterado ou revalidado estaticamente nesta auditoria.

## Cadeia causal — retorno Chat -> GitHub -> watcher -> Codex

O watcher continua observando o estado remoto por `git fetch` + `FETCH_HEAD`, calcula o hash mecânico do JSON e somente abre execução quando `orchestration_state === 'CODEX_READY'`.

Com `app-wake-request` configurado, `usesAppExecutor` fica verdadeiro em `CODEX_READY`; após sync/preflight, `maybeWakeCodexApp()` enfileira um request `mode: execute` no caminho absoluto da ponte. O dispatcher `chatCodexAppWake.js` retorna sem ação para qualquer estado diferente de `CODEX_READY`.

Portanto remover `chat-notifier-script`, `chat-notifier-sha256` e `chat-url` da configuração não remove nem desativa `app-wake-request` e não impede o recebimento normal de `CODEX_READY`.

## Três caminhos de `CHAT_READY`

### 1. Observação direta

Quando o remoto já está em `CHAT_READY`, `pollOnce()`:

- chama `maybeWakeCodexApp()`, que retorna `action: null` porque o estado não é `CODEX_READY`;
- só chama `maybeNotifyChat()` se `options['chat-notifier-script']` existir;
- sem esse argumento, a notificação é `{ action: null }` e o estado é apenas observado/cacheado.

Além disso, `chatAuditNotifier.maybeNotifyChat()` possui guarda própria: sem `chat-notifier-script`, retorna imediatamente sem spawn.

Resultado: sem configuração do notificador, observar `CHAT_READY` não chama bot, não abre auditoria e não enfileira a ponte App.

### 2. Conclusão pelo Codex App

Enquanto o remoto ainda é `CODEX_READY` e a execução App está marcada `running`, `completeChatCodexAppExecution()` pode detectar o `CHAT_READY` local, validar/publicar o result file, refazer a leitura do remoto e exigir `CHAT_READY` remoto verificável.

Depois da publicação:

- `maybeWakeCodexApp()` recebe `CHAT_READY` e retorna `null`;
- `maybeNotifyChat()` só é chamado se `chat-notifier-script` estiver configurado;
- sem esse argumento, `chatNotification` fica `null`.

Assim a conclusão App preserva publicação do resultado sem criar uma segunda auditoria quando o notificador está desconfigurado.

### 3. Conclusão pelo caminho CLI

No caminho CLI, após `runCodex()`, publicação e nova leitura do remoto, o watcher calcula `finalState`. Em `CHAT_READY`:

- `finalWake` é nulo porque a ponte direta é exclusiva de `CODEX_READY`;
- `finalNotification` só chama o bot se `chat-notifier-script` existir;
- sem o argumento, retorna nulo.

Assim o caminho CLI também termina em `CHAT_READY` silencioso na configuração desejada.

## Preservação de `app-wake-request`

O path de fila continua aceito por `pollOnce()` e pelo dispatcher; o teste `CODEX_READY validado acorda App e não chama CLI` verifica que um request é criado com `mode: execute`, hash observado e repo path corretos. O teste `CHAT_READY não enfileira retorno na ponte S4U` verifica a assimetria oposta.

Não há dependência causal entre `app-wake-request` e `chat-notifier-script` dentro do watcher. A ausência do notificador não desativa a ponte de recebimento.

## Findings

### CRITICAL

Nenhum.

### HIGH

Nenhum.

### MEDIUM

Nenhum.

### LOW-01 — o instalador restaurado não consegue produzir diretamente a configuração assimétrica documentada

`Install-ChatCodexOrchestrationWatcher.ps1` ainda contém a regra:

`Install exige ChatNotifierScript e ChatUrl para o retorno CHAT_READY.`

O teste estrutural do instalador exige explicitamente esse comportamento.

Ao mesmo tempo, os três documentos atuais instruem a operação sem `--chat-notifier-script`, `--chat-notifier-sha256` e, no modo fila, sem `--chat-url`.

Cadeia causal da limitação:

`Install` pelo script versionado -> ausência de notifier/URL -> throw antes de registrar a Scheduled Task -> a configuração assimétrica não pode ser recriada diretamente pelo instalador restaurado.

Isso NÃO invalida a tarefa agendada existente que tenha tido apenas esses argumentos removidos depois da instalação; o watcher em runtime aceita essa configuração e preserva `app-wake-request`. Portanto não é rota de recursão nem bloqueio do recovery atual. É uma lacuna de reprodutibilidade/manutenção: uma futura reinstalação pelo script aprovado reexigirá os argumentos de notificação ou falhará.

Recomendação mínima: registrar explicitamente que a configuração aprovada depende do ajuste da Scheduled Task existente e que `Install` não deve ser usado para recriá-la sem uma futura mudança auditada do instalador; alternativamente, em gate posterior, tornar esses parâmetros realmente opcionais no instalador com teste causal específico. Não é necessário alterar a implementação auditada para aprovar a recuperação corrente.

## Testes — revisão estática

Os testes restaurados cobrem causalmente:

- `CHAT_READY` não acorda o Codex App diretamente;
- `CHAT_READY` não enfileira retorno por `app-wake-request`;
- `CODEX_READY` com `app-wake-request` enfileira execução e não chama CLI;
- conclusão App confirma publicação antes da notificação quando o notificador está configurado;
- notificador só dispara em `CHAT_READY`, pin de SHA divergente falha antes do spawn e envio falho é retryable;
- caminho CLI dispara exatamente uma vez por hash novo de `CODEX_READY` e termina sem relançar;
- worktree/preflight, publicação restrita e retry de sync continuam fail-closed.

A ausência de `chat-notifier-script` no caminho App de sucesso não possui um teste nominal dedicado equivalente ao caso configurado, mas a guarda é explícita tanto no caller quanto no próprio `maybeNotifyChat()`. Não identifiquei rota causal que atravesse essas duas guardas e faça spawn sem o argumento.

## Evidência de execução relatada — não reexecutada por este auditor

Foram fornecidos como relato operacional/local:

- `53/53` testes focais, zero skip/todo;
- `validateAgentWorkflow.js` OK;
- igualdade dos oito arquivos com `9cae58d...` conferida localmente;
- Scheduled Task com remoção apenas de `chat-notifier-script`, `chat-notifier-sha256` e `chat-url`, preservando `app-wake-request` e demais argumentos;
- script local do bot inalterado;
- `DryRun` de linha única aprovado;
- `DryRun` multilinha falhando antes do envio.

Esses itens não são convertidos em prova independente desta auditoria. A igualdade dos oito arquivos foi confirmada independentemente pelo GitHub; a configuração da Scheduled Task e o DryRun local não foram observados por este auditor.

A suíte ampla anterior permanece explicitamente NÃO VERDE: `1885 PASS`, `8 FAIL`, `10 SKIP`. Quatro falhas relacionadas ao canal teriam passado isoladamente, mas a causa da divergência não foi demonstrada. Esta auditoria não atribui interferência concorrente nem outra causa sem prova.

Não havia status checks nem workflow runs associados ao SHA auditado no GitHub no momento da revisão.

## Riscos residuais

1. a configuração operacional sem notifier depende, hoje, da tarefa já ajustada fora do Git e não é reproduzível diretamente pelo instalador restaurado;
2. o comportamento do bot local em texto multilinha continua não diagnosticado; usar linha única é workaround do chamador, não correção do bot;
3. a causa das quatro falhas do canal dentro da suíte ampla anterior permanece desconhecida, embora os testes focais/restaurados não revelem regressão estática neste delta.

Nenhum desses pontos cria uma rota causal de nova auditoria a partir de `CHAT_READY` quando `chat-notifier-script` está ausente.

## Veredito

**APROVÁVEL**

A recuperação mínima preserva estaticamente o mecanismo pedido: auditoria é solicitada deliberadamente fora do watcher; o Chat retorna por GitHub/`CODEX_READY`; `app-wake-request` continua recebendo tarefas; e `CHAT_READY` permanece silencioso nos caminhos de observação, conclusão App e conclusão CLI quando o notificador opcional não está configurado.

O LOW-01 deve ser mantido como restrição operacional de reinstalação/manutenção, não como motivo para reabrir NEXT-01 nem como autorização para alterar a implementação auditada neste gate.

Este parecer não autoriza NEXT-02, deploy, produção, dados reais, WhatsApp, Google, Pluggy ou mudança de flags.
