# ORCH-02-BOT-RETURN — auditoria independente

Data: 2026-09-03
Auditor: Chat / GPT-5.6 Sol
Tipo: revisão independente de consistência, escopo e testes por commit imutável

## Manifesto confirmado

- repositório: `Danieu-san/financas-bot`
- branch de origem: `chat/chat-codex-orchestration-20260824`
- commit auditado: `b432df1246b30afc57799fb95e42e7d078255146`
- parent único: `b2f04ba4cb1980221c8d33cb853bdebace6a6c22`
- tree do candidato: `417bda38f08aad4069e9b0e4db64f1d0f29765ec`
- compare: exatamente 1 commit à frente do parent
- delta: 12 arquivos, 670 adições e 226 remoções

## Arquivos do delta inspecionados no SHA

1. `.agents/skills/audit-immutable-gate/SKILL.md`
2. `docs/agent-memory/workstreams/chat-codex-channel.md`
3. `docs/plans/workstreams/chat-codex-channel.md`
4. `scripts/agent/Install-ChatCodexOrchestrationWatcher.ps1`
5. `scripts/agent/chatAuditNotifier.js`
6. `scripts/agent/chatCodexAppWake.js`
7. `scripts/agent/completeChatCodexAppExecution.js`
8. `scripts/agent/validateAgentWorkflow.js`
9. `scripts/agent/watchChatCodexOrchestration.js`
10. `tests/chatAuditNotifier.test.js`
11. `tests/chatCodexWatcherInstaller.test.js`
12. `tests/chatCodexWatcherSync.test.js`

Contexto operacional adicional lido no mesmo SHA: `AGENTS.md`, `docs/agent-memory/README.md`, `docs/agent-memory/workstreams/index.md`, `docs/agent-memory/workstreams/chat-codex-channel.state.json` e `scripts/agent/manageChatCodexOrchestration.js`.

## Escopo

O delta permanece restrito ao canal Chat ↔ Codex, instalador/watcher, dispatcher da ponte, notificador de auditoria, validação do workflow, documentação e testes correspondentes. Não há alteração em `src/`, lógica financeira, writers, rotas de negócio, deploy, produção ou dados privados.

A branch não possuía status checks nem workflow runs associados ao SHA no GitHub no momento da auditoria. Portanto, esta revisão distingue inspeção estática/causal dos testes de evidência de execução de CI.

## Matriz causal dos requisitos pedidos

### 1. `CHAT_READY` usa somente o bot local após confirmação remota — FECHADO

Cadeia observada:

`fetchRemoteState()` faz `git fetch origin <branch>` → lê `FETCH_HEAD:<statePath>` → `parseState()` confirma `CHAT_READY` → `resolveFetchedCommitSha()` resolve o SHA do mesmo `FETCH_HEAD` → `maybeNotifyChat()` exige `CHAT_READY`, valida script/hash/URL e só então executa o PowerShell local.

No fluxo de conclusão do Codex App, `completeChatCodexAppExecution()` publica o resultado, refaz `fetchRemoteState()`, exige `CHAT_READY` remoto para a mesma tarefa/result file e só depois chama `maybeNotifyChat()`.

O teste `modo App confirma CHAT_READY remoto e só então aciona o bot do Chat` verifica a ordem causal `published -> notified`, e o teste `campainha só dispara em CHAT_READY` cobre a guarda direta.

### 2. Ponte direta exclusiva de `CODEX_READY` — FECHADO

`chatCodexAppWake.maybeWakeCodexApp()` retorna imediatamente sem ação para qualquer estado diferente de `CODEX_READY`. O único modo produzido pelo dispatcher é `execute`.

O watcher ainda invoca o dispatcher em pontos comuns, mas em `CHAT_READY` ele retorna `action: null`; nem `wakeCodexApp()` nem `queueCodexAppWakeRequest()` são alcançados.

Há provas causais específicas:

- `CHAT_READY nunca acorda o Codex App diretamente`;
- `CHAT_READY não enfileira retorno na ponte S4U`;
- `CHAT_READY com bot configurado não usa a ponte direta do Codex App`;
- `CODEX_READY validado acorda App e não chama CLI` e preserva `mode: execute`.

### 3. URL da conversa e caminho local do notificador não foram versionados — FECHADO NO DELTA

O instalador recebe `ChatUrl` e `ChatNotifierScript` como parâmetros sem valores privados default e grava-os apenas nos argumentos da Scheduled Task local. O commit não adiciona o script PowerShell local nem um caminho absoluto real do usuário.

O delta contém somente padrões genéricos e fixtures sintéticas de teste para `chatgpt.com`; não contém a URL real da conversa nem o caminho local real do notificador.

Há histórico anterior no repositório com URLs de outras conversas, mas isso é preexistente e não foi introduzido por este commit.

### 4. Instalação fixa o hash do script — FECHADO

No `Install-ChatCodexOrchestrationWatcher.ps1`:

`Get-Item` valida arquivo local regular e recusa reparse point → `Get-FileHash -Algorithm SHA256` calcula o hash → o instalador persiste `--chat-notifier-script` e `--chat-notifier-sha256` nos argumentos da tarefa.

Em toda notificação, `chatAuditNotifier.js` recalcula SHA-256 dos bytes do script resolvido e compara com o valor instalado antes de abrir o navegador. Divergência falha antes do spawn.

`tests/chatAuditNotifier.test.js` prova causalmente que uma alteração posterior do script impede a execução do bot.

## Findings

### BLOCKER

Nenhum.

### HIGH

Nenhum.

### MEDIUM

Nenhum.

### LOW-01 — integração do instalador é provada por código + teste estrutural, não por execução real do PowerShell

O teste `tests/chatCodexWatcherInstaller.test.js` verifica textualmente a presença de `Get-FileHash`, `--chat-notifier-script` e `--chat-notifier-sha256`, mas não executa o instalador nem inspeciona uma Scheduled Task real. A parte runtime da garantia é causalmente testada no Node: script divergente falha antes do spawn.

Consequência: permanece uma lacuna pequena entre a construção textual dos argumentos do instalador e a prova em Windows de que a tarefa instalada preserva exatamente path + hash. O código inspecionado monta corretamente esses argumentos, então a lacuna não sustenta NO-GO do candidato; deve ser coberta pelo smoke local pós-auditoria já previsto no plano.

## Observação operacional — não tratada como finding do código

A mensagem que acionou esta auditoria usa `REVISÃO_FINANCASBOT_PRONTA` e um `notification_id` de 40 hex, enquanto `buildChatAuditMessage()` deste SHA produz `AUDITORIA_FINANCASBOT_PRONTA`, exige `notification_id` de 64 hex derivado do hash mecânico e inclui `state_path`, `result_file`, `state_url` e `result_url`.

Por isso, a mensagem recebida nesta conversa não foi contabilizada como prova end-to-end do novo `buildChatAuditMessage()`. Isso é compatível com o próprio plano, que coloca reinstalação e smoke documental somente depois do GO independente.

## Testes e suficiência

Os testes adicionados/alterados são materialmente causais para as duas fronteiras principais: estado `CHAT_READY` vs ponte direta e validação do hash antes do bot. Também preservam o caminho `CODEX_READY -> execute`.

Não havia CI/status checks ou workflow runs associados ao commit no GitHub durante a auditoria; portanto não atribuo contagens de execução ao candidato que eu não tenha observado.

## Veredito

`GO ORCH-02-BOT-RETURN` para o candidato imutável `b432df1246b30afc57799fb95e42e7d078255146`, limitado ao escopo de código/documentação/testes auditado.

Este GO NÃO autoriza deploy, produção, WhatsApp real, dados privados, mudança de flag ou outro acesso remoto. A próxima ação prevista pelo próprio plano é reinstalação local do watcher com URL e notificador fora do Git e um único smoke documental `CHAT_READY -> bot -> Chat`, confirmando que a ponte direta não foi chamada.
