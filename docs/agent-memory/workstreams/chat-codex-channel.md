# Canal permanente Chat ↔ Codex

Atualizado em: 2026-09-03

## Objetivo

Manter um canal operacional reutilizável no qual o Chat publica tarefas
versionadas e delimitadas no GitHub, o watcher acorda o Codex somente para um
hash novo em `CODEX_READY`, e o resultado retorna ao Chat sem intervenção de
Daniel. O fechamento do gate que construiu o canal não encerra o serviço.

## Estado operacional

`ORCH-02 PROTOCOLO ASSIMÉTRICO SEM RECURSÃO EM CANDIDATO; AUDITORIA PENDENTE`.

### Localização canônica no GitHub

- repositório: `https://github.com/Danieu-san/financas-bot`;
- branch operacional: `chat/chat-codex-orchestration-20260824`;
- estado: `docs/agent-memory/workstreams/chat-codex-channel.state.json`;
- manifesto-slot: `docs/agent-memory/workstreams/tasks/chat-codex-task-slot.json`;
- resultados: `docs/agent-memory/workstreams/results/<task_id>.md`.

Toda auditoria referencia o SHA Git completo do candidato. Chat e Codex leem
estado e resultado no commit imutável indicado; não procuram a resposta na
`main`, em outra branch, na posição visual da conversa ou em arquivo local.

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

## Protocolo assimétrico de auditoria

O envio e o retorno têm mecanismos diferentes por propósito:

`Codex -> bot local -> Chat`: depois de publicar um candidato sanitizado e
imutável, o Codex invoca deliberadamente o bot com o prompt completo da
auditoria. O bot não faz parte do watcher nem da tarefa agendada.

`Chat -> GitHub/CODEX_READY -> watcher -> Codex`: o Chat publica o parecer pelo
canal versionado; o watcher valida o manifesto e acorda o Codex somente para
`CODEX_READY`.

Depois que o Codex consome o parecer e publica `CHAT_READY`, a tarefa termina.
Nesse estado o watcher não chama o bot, não usa a ponte direta e não começa uma
segunda auditoria. Argumentos legados de notificador são inertes. GitHub segue
como autoridade do código, do estado e do parecer recebido; a conversa é apenas
o transporte da solicitação de auditoria.

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
persistência após reboot. Em 2026-09-03, o smoke do bot local confirmou o envio
à conversa e a volta do parecer pelo canal, mas também revelou que acionar o bot
automaticamente em todo `CHAT_READY` criava uma auditoria recursiva. O protocolo
assimétrico atual elimina esse gatilho automático.

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

## Evidência local do protocolo assimétrico

O candidato remove o notificador automático do watcher e do instalador, apaga
o módulo dedicado a esse retorno e mantém a ponte direta somente no ramo
`CODEX_READY`. A bateria focal do canal passou `49/49`; os testes reais de Git,
ignored paths e validador do clone passaram isoladamente `8/8`.

A única suíte hermética ampla foi válida como runner, mas terminou com
`1885 PASS`, `8 FAIL` e `10 SKIP`. Quatro falhas eram de áreas financeiras fora
deste delta. As quatro atribuídas ao canal no agregado passaram na reprodução
isolada acima, indicando interferência do runner concorrente, não regressão
reproduzida. Por precisão, o candidato não é rotulado como suíte ampla verde e
continua aguardando auditoria independente.

## Próxima ação

Publicar e auditar o candidato do protocolo assimétrico por invocação direta do
bot. Após GO independente, reinstalar o watcher sem parâmetros de notificador e
executar um único smoke documental, confirmando que `CHAT_READY` não chama bot
nem ponte e que `CODEX_READY` continua acordando o Codex.

## Capacidade

`Codex App -> Sol -> Médio -> auditar e provar o protocolo assimétrico sem recursão.`
