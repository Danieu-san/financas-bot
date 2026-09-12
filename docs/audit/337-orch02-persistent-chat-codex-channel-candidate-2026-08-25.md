# ORCH-02 — candidato do canal permanente Chat ↔ Codex

Data: 2026-08-25

## Objetivo

Separar o fechamento técnico do ORCH-01 do serviço operacional: o gate pode
ficar `FINISHED`, enquanto um novo estado permanece `CHAT_WORKING` ocioso e
reutilizável para tarefas sequenciais publicadas pelo Chat.

## Mudança

- novo estado `chat-codex-channel.state.json`, inicialmente `CHAT_WORKING`;
- manifesto fechado `financasbot-chat-codex-task-v1`;
- objetivo, leituras, escritas, relatório, validações e restrições explícitos;
- watcher carrega o manifesto somente depois de sincronizar o hash remoto;
- tarefa inválida falha antes de iniciar Codex;
- prompt deixou de ser o ensaio no-op e usa somente o contrato versionado;
- publicador aceita apenas estado, relatório e caminhos exatos autorizados;
- deleção, rename/copy, staged change, caminho extra, symlink e artefato não
  regular falham fechados;
- scripts/instruções do canal, GitHub Actions, segredos, sessões e dados
  privados não podem ser caminhos de leitura ou escrita da tarefa;
- instalador aceita `StatePath` relativo seguro e usa o canal permanente por
  padrão.

## Reutilização

O teste causal executa duas tarefas com IDs distintos no mesmo watcher:

`JOB-1 -> CHAT_READY -> CHAT_WORKING -> JOB-2 -> CHAT_READY`.

O contador confirma duas execuções, uma por hash/tarefa. Em `CHAT_WORKING`
inalterado o watcher apenas observa o hash e não inicia modelo.

## Evidência local

- bateria ampla única pós-implementação: `62/62` verde;
- syntax checks dos dois scripts Node: verdes;
- parser PowerShell do instalador: verde;
- `validateAgentWorkflow.js`: verde;
- `git diff --check`: verde.

As contagens são evidência local relatada, não execução do auditor.

## Arquivos centrais

- `scripts/agent/chatCodexTaskContract.js`;
- `scripts/agent/watchChatCodexOrchestration.js`;
- `scripts/agent/Install-ChatCodexOrchestrationWatcher.ps1`;
- `tests/chatCodexTaskContract.test.js`;
- `tests/chatCodexWatcher.test.js`;
- `tests/chatCodexWatcherSync.test.js`;
- `docs/agent-memory/workstreams/chat-codex-channel.md`;
- `docs/agent-memory/workstreams/chat-codex-channel.state.json`.

## Limites

O canal automático executa tarefas de repositório em `workspace-write`, uma
por vez. Acesso privado, produção, OCI, WhatsApp, Pluggy, planilhas e navegador
não são delegados por este gate. A campainha Browser continua sendo retorno ao
Chat, e o GitHub continua sendo a única autoridade.

## Critério de GO

GO técnico local somente se a revisão confirmar que o canal não termina entre
tarefas, que o manifesto não permite ampliar a fronteira, que o publicador
impede efeitos fora dos caminhos exatos, que tarefa inválida não inicia modelo
e que a prova causal sustenta duas tarefas sequenciais sem espera ativa.
