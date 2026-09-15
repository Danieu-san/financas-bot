# ORCH-02 — recovery da campainha Browser consciente do canal

Data: 2026-08-25

## Evidência operacional que encontrou o defeito

A primeira tarefa real do canal foi publicada pelo Chat em duas fases, executada
pelo Codex CLI e publicada pelo watcher em `CHAT_READY` no commit
`5e0124bf51cea404f4eccbbb96e5de0a47521df3`.

A campainha chegou ao Codex App, mas foi rejeitada corretamente pelo Chat: a
ponte instalada ainda identificava toda notificação como `ORCH-01`. O Chat
consultou o estado terminal antigo em vez de
`chat-codex-channel.state.json`. Nenhuma escrita indevida ocorreu.

## Correção

- o pedido gravável da ponte passou para schema v2 e carrega o `task_id` e o
  `state_path` observados no estado remoto;
- a configuração protegida mantém somente o destino fixo: task do Codex App e
  conversa do Chat;
- tarefa e caminho não são mais constantes antigas da instalação;
- a ponte valida `task_id` e limita `state_path` a arquivos `.state.json` sob
  `docs/agent-memory/workstreams/`;
- o helper inclui tarefa, hash e caminho exatos na mensagem `ORCH_WAKE`;
- idempotência continua baseada no hash mecânico observado.

## Evidência local

- bateria focal watcher/ponte/IPC: `23/23` verde;
- suíte hermética ampla final: `62/62` verde;
- syntax checks dos três scripts Node: verdes;
- a instalação permanece S4U e `Limited`.

As contagens são execução local relatada, não execução do auditor.

## Critério de GO

GO técnico local se a revisão independente confirmar que a campainha deriva a
tarefa e o caminho do estado remoto validado, não do pedido gravável nem de uma
constante ORCH-01, e que a mensagem entregue permite ao Chat verificar o
`CHAT_READY` correto sem ampliar acesso privado.
