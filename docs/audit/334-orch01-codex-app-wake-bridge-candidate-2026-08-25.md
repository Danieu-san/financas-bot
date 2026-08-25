# ORCH-01 — candidato da ponte Codex App → Browser → Chat

Data: 2026-08-25

## Veredito solicitado

Revisão defensiva e independente do fechamento técnico local de ORCH-01. O
hash auditável é o commit imutável que contém este manifesto.

## Escopo

- fila mínima de `CHAT_READY` contendo somente schema, SHA-256 e horário;
- ponte S4U limitada sob o usuário do Codex App;
- configuração e executáveis copiados para área protegida;
- separação entre inbox gravável e marcador idempotente somente leitura;
- IPC local com prompt fixo de campainha;
- prova do ciclo completo sem tocar no FinançasBot ou em dados privados.

## Arquivos de produto do gate

- `scripts/agent/watchChatCodexOrchestration.js`;
- `scripts/agent/Install-ChatCodexOrchestrationWatcher.ps1`;
- `scripts/agent/processCodexAppWakeRequest.js`;
- `scripts/agent/Install-CodexAppWakeBridge.ps1`;
- `scripts/agent/wakeCodexAppViaIpc.js`.

## Controles causais

1. O watcher aceita IPC direto ou fila, nunca ambos.
2. A fila recusa caminho relativo e symlink e não carrega prompt, destino,
   tarefa, comando, segredo ou dado do projeto.
3. Destino, thread e task ficam na configuração protegida da ponte.
4. A tarefa S4U executa cópias protegidas em `ProgramData`, não scripts do
   worktree gravável.
5. O usuário do watcher possui `Modify` somente na inbox; código, configuração
   e estado idempotente são `ReadAndExecute`.
6. A ponte recusa symlinks e schema extra em pedido/configuração.
7. `dispatching` é gravado antes do IPC; o mesmo hash nunca é reenviado após
   `dispatching`, `accepted` ou `failed`.
8. O helper exige aceite IPC e UUID do cliente do Codex App.
9. Poll inalterado não inicia Codex nem reenvia campainha.

## Testes

Bateria ampla única do domínio:

`node --experimental-test-isolation=none --test <8 suítes chatCodex/codexApp>`

Resultado local: `56/56` verdes.

Também passaram syntax checks dos três scripts Node, parsing dos dois
instaladores PowerShell e `node scripts/agent/validateAgentWorkflow.js`.

## Evidência operacional relatada

- PoC S4U temporário: resultado zero, wake recebido e tarefa removida;
- tarefas permanentes: watcher `Interactive/Limited`, ponte `S4U/Limited`,
  ambas `Ready`, resultado zero e `IgnoreNew`;
- ACL: inbox `Modify` para o watcher; state `ReadAndExecute`;
- Chat publicou `CODEX_READY` em `b48e22ebe6281cfb3f6fd8f6e2bbc83153a324b8`;
- watcher publicou `CHAT_READY` em `e09708e8e5810addf1ab9278a161db4ce4161c74`;
- cache final: `launch_status: succeeded`, `app_wake_status: queued`;
- ponte: resultado `accepted` para o mesmo hash final;
- Codex App acordou esta tarefa, que enviou uma única campainha pelo Browser.

Essas contagens e observações são execução local relatada, não execução do
auditor.

## Limites

- requer Codex App em execução e Chat autenticado/aberto no navegador interno;
- tarefas Node consultam estado a cada minuto, embora modelo não seja iniciado
  em hash inalterado;
- falha da ponte é terminal por hash para priorizar não duplicação;
- GitHub permanece autoridade; mensagem do navegador não é evidência de estado;
- não autoriza deploy, produto, produção, WhatsApp, Pluggy, planilha ou dados.

## Critério de GO

GO técnico local somente se a revisão confirmar que a fronteira de privilégio
não permite substituir código/configuração/estado, que o pedido gravável não
injeta comando ou destino, que a idempotência é fail-closed e que os testes
executam as funções reais relevantes. Qualquer lacuna causal indispensável
mantém ORCH-01 em NO-GO.
