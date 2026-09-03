# Canal permanente Chat ↔ Codex

Atualizado em: 2026-09-03

## Objetivo

Manter um canal operacional reutilizável no qual o Chat publica tarefas
versionadas e delimitadas no GitHub, o watcher acorda o Codex somente para um
hash novo em `CODEX_READY`, e o resultado retorna ao Chat sem intervenção de
Daniel. O fechamento do gate que construiu o canal não encerra o serviço.

## Estado operacional

`ORCH-02 RETORNO PELO BOT LOCAL EM CANDIDATO; AUDITORIA PENDENTE`.

### Localização canônica no GitHub

- repositório: `https://github.com/Danieu-san/financas-bot`;
- branch operacional: `chat/chat-codex-orchestration-20260824`;
- estado: `docs/agent-memory/workstreams/chat-codex-channel.state.json`;
- manifesto-slot: `docs/agent-memory/workstreams/tasks/chat-codex-task-slot.json`;
- resultados: `docs/agent-memory/workstreams/results/<task_id>.md`.

Toda campainha de retorno inclui o SHA Git completo que contém `CHAT_READY`.
Chat e Codex leem estado e resultado nesse commit imutável; não procuram a
resposta na `main`, em outra branch, na posição visual da conversa ou em arquivo
local.

### Fronteira congelada

O desenho funcional `Chat -> GitHub -> watcher -> Codex App` permanece
congelado: não será substituído nem refeito sem achado causal novo. O incidente
de 2026-08-26 abriu somente um recovery delimitado da implementação operacional
do watcher — isolamento do clone, sincronização e preflight antes do wake — sem
alterar o protocolo, o manifesto ou a autoridade do GitHub. O retorno
`Codex -> Chat` também permanece funcionalmente congelado.

Enquanto não há trabalho, o estado permanece `CHAT_WORKING`: o Chat possui o
canal, mas nenhum modelo local é iniciado. Para cada trabalho, o Chat cria um
manifesto `financasbot-chat-codex-task-v1`, publica-o com a transição a
`CODEX_READY` e aguarda a campainha de retorno.

Fluxo por tarefa:

`CHAT_WORKING -> CODEX_READY -> CODEX_RUNNING -> CHAT_READY -> CHAT_WORKING`.

O último `CHAT_WORKING` é o estado ocioso reutilizável, não o encerramento do
canal. `FINISHED` fica reservado à desativação explícita do serviço.

## Contrato de tarefa

O manifesto JSON contém somente:

- `schema` e `task_id`;
- um objetivo curto;
- arquivos que o executor pode ler;
- caminhos exatos que pode alterar;
- um relatório obrigatório sob
  `docs/agent-memory/workstreams/results/`;
- validações e restrições textuais.

O executor não pode alterar o manifesto, o canal, scripts de agente, GitHub
Actions, instruções do agente, segredos, sessões ou dados privados. O watcher
publica somente o estado e os caminhos exatos autorizados; rename, cópia,
deleção, staged change ou caminho adicional falham fechados.

## Responsabilidade do Chat

1. atualizar o manifesto preexistente
   `docs/agent-memory/workstreams/tasks/chat-codex-task-slot.json` enquanto o
   estado ainda estiver `CHAT_WORKING`;
2. somente após confirmar esse commit inerte, publicar em outro commit a
   transição do estado para `CODEX_READY`, apontando ao slot;
3. após `CHAT_READY`, ler estado, resultado e diff no GitHub;
4. auditar ou solicitar novo trabalho conforme o risco;
5. devolver o canal a `CHAT_WORKING` antes de encerrar sua resposta.

A publicação em duas fases é intencional: o conector do Chat consegue editar
arquivos existentes, mas bloqueou a criação de um manifesto novo e o commit
atômico de dois arquivos. O primeiro commit não desperta executor; o segundo só
é publicado depois que o slot válido já existe no remoto.

Daniel não precisa criar objetivo, arquivo ou transição manualmente. “Novo
objetivo” é apenas a ficha de trabalho que o próprio Chat publica.

## Limites

Esta primeira versão permanente executa tarefas de repositório dentro do
sandbox `workspace-write`. Produção, OCI, WhatsApp, Pluggy, planilhas, navegador
e segredos continuam fora do executor automático; necessidade privada deve ser
registrada no resultado e encaminhada ao Codex App por fluxo separado, sem
ampliar silenciosamente a tarefa.

## Retorno pelo bot local

Quando o watcher confirma no GitHub um estado remoto `CHAT_READY`, ele deixa de
usar a campainha direta do Codex App e executa exclusivamente o notificador
PowerShell local configurado. O notificador recebe a URL exata da conversa e
uma mensagem curta com `notification_id`, `task_id`, commit imutável, branch,
state path, result path e URLs GitHub. O Chat consulta a evidência no GitHub e
devolve seu parecer pelo canal versionado.

O caminho local do notificador e a URL privada da conversa não entram no Git.
O instalador grava ambos somente nos argumentos da tarefa local e fixa o
SHA-256 do script; alteração posterior do arquivo falha antes de abrir o
navegador. O cache não reenvia um hash já confirmado e o aviso carrega
`notification_id` para deduplicação. Falha ou dispatch interrompido permite
retry; queda entre envio e persistência pode repetir o aviso sem mudar a
autoridade Git.

`CODEX_READY` continua podendo usar a ponte local para iniciar o executor. A
substituição vale somente para o retorno `CHAT_READY -> Chat`.

## Achado e recovery

O primeiro parecer independente recusou o candidato porque variantes como
`.env.local` e `config/secrets.json` ainda podiam ser declaradas no manifesto.
O recovery amplia a recusa nominal de recipientes e extensões de segredo antes
do modelo, com testes negativos simétricos para leitura e escrita.

A primeira tarefa operacional alcançou `CHAT_READY`, mas a campainha foi
rejeitada pelo Chat porque a ponte ainda usava a constante histórica
`ORCH-01`. O recovery seguinte transporta no pedido validado a tarefa e o
caminho exatos do estado remoto, de modo que o Chat consulte o canal ORCH-02.

A auditoria desse recovery encontrou que o instalador ainda produzia
`config-v1` enquanto o worker atualizado exigia `config-v2`. O literal foi
alinhado e um teste cruzado passou a comparar o schema do instalador com a
constante exportada pelo worker.

## Histórico relevante do retorno

Em 2026-08-25, uma prova isolada confirmou que a antiga campainha MCP conseguia
acordar a conversa sem clique. Ela dependia de endpoint/túnel e não provava
persistência após reboot. O retorno atual substitui essa rota somente no
`CHAT_READY`: o bot local abre a conversa já configurada, enquanto GitHub segue
como fonte única do estado e do resultado.

## Incidente de sincronização em 2026-08-26

O Chat publicou corretamente `CODEX_READY` duas vezes. O watcher observou o
hash remoto final, mas não acordou o Codex App porque a worktree compartilhada
continha `.npm-cache`, `.runtime` e `tools/chat-wake-mcp/.npm-cache`. A recusa
`failed:sync_error` foi correta pelo contrato fail-closed; o defeito foi a
instalação apontar para uma worktree usada também durante o desenvolvimento e
tratar a falha transitória como terminal para aquele hash.

O recovery preserva a recusa de qualquer alteração inesperada e acrescenta
duas barreiras:

- o instalador aceita somente o clone dedicado em
  `%LOCALAPPDATA%\FinancasBot\chat-codex-orchestration-repo`, limpo, sem caminhos
  ignorados e com `.git` próprio; worktrees de desenvolvimento são recusadas;
  origem, branch operacional fixa e revisão são conferidas contra o remoto
  antes da instalação; a branch não é parâmetro do chamador;
  o runtime é canonicalizado fisicamente, inclusive através de junctions, e
  precisa permanecer fora do clone;
- `failed:sync_error` limpa apenas o latch daquele lançamento e permite nova
  tentativa mecânica do mesmo hash no próximo ciclo, sem iniciar modelo antes
  de a sincronização ficar limpa;
- um segundo preflight mecânico, imediatamente antes do despacho tanto ao App
  quanto ao CLI, recusa mudanças rastreadas, não rastreadas e ignoradas que
  tenham surgido depois da sincronização.

O primeiro candidato deste recovery recebeu `NO-GO` porque o modo App ainda não
repetia a verificação de caminhos ignorados antes do wake. O recovery atual
fecha essa lacuna e substitui a prova textual do instalador por testes causais
com clones Git temporários, incluindo worktree vinculada, origem divergente,
revisão atrasada, untracked, ignored, runtime interno/junction, branch
divergente e watcher ausente.

O recovery final removeu a branch configurável, canonicalizou o runtime pelo
filesystem e acrescentou negativos causais sem alterar o protocolo do canal.

Os artefatos que causaram o incidente foram preservados fora da worktree em
`%LOCALAPPDATA%\FinancasBot\orchestration-artifacts\20260827-sync-error`.

## Próxima ação

Publicar e auditar o candidato do retorno pelo bot. Após GO independente,
reinstalar o watcher no clone dedicado com o notificador pinado e executar um
único smoke documental `CHAT_READY -> bot -> Chat`, confirmando que a ponte
direta não foi chamada.

## Capacidade

`Codex App -> Sol -> Alto -> auditar e provar o retorno CHAT_READY pelo bot local.`
