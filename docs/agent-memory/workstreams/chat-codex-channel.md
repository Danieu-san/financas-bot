# Canal permanente Chat ↔ Codex

Atualizado em: 2026-08-25

## Objetivo

Manter um canal operacional reutilizável no qual o Chat publica tarefas
versionadas e delimitadas no GitHub, o watcher acorda o Codex somente para um
hash novo em `CODEX_READY`, e o resultado retorna ao Chat sem intervenção de
Daniel. O fechamento do gate que construiu o canal não encerra o serviço.

## Estado operacional

`ORCH-02 RETORNO CODEX -> CHAT PROVADO; SECURE MCP TUNNEL CONECTADO; AUTOSTART PENDENTE`.

### Fronteira congelada

O caminho `Chat -> GitHub -> watcher -> Codex App` já foi provado e não faz
parte do recovery atual. Nenhuma tentativa de corrigir o retorno pode alterar,
substituir ou repetir essa ponta sem um achado causal novo e autorização
específica. O único escopo aberto é `Codex -> Chat`.

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

## Prova isolada do retorno em 2026-08-25

O MCP local expôs uma ação sem argumentos e um widget com mensagem fixa
`ORCH_PLUGIN_WAKE_POC`. A versão `v7` usou nomes novos de ferramenta e recurso
para impedir reutilização do snapshot congelado do app anterior.

Evidência causal observada numa única tentativa, sem clique no widget:

- o Chat executou `open_chat_wake_poc_v7` uma vez;
- o widget aguardou 15 segundos para o turno originador encerrar;
- o widget exibiu `Wake enviado` com a mensagem fixa;
- o Chat produziu uma nova resposta contendo `ORCH_PLUGIN_WAKE_POC` e registrou
  o wake às `12:32:55` no fuso de Brasília;
- o caminho de ida, watcher, launcher e manifesto não foram alterados.

O endpoint usado nessa prova era temporário. Tailscale HTTPS foi
habilitado no tailnet, porém o cliente Windows não sincroniza com
`controlplane.tailscale.com`; por isso nenhum Funnel foi criado. A alternativa
adotada foi o Secure MCP Tunnel oficial, sem exposição pública do servidor.

## Endpoint definitivo em 2026-08-25

O app `FinancasBot Chat Wake Definitivo` foi criado e conectado ao Secure MCP
Tunnel oficial. O servidor permanece restrito a `127.0.0.1:3210`, expõe apenas
`open_financasbot_chat_wake` e entrega o SDK do componente embutido no próprio
recurso `ui://financasbot/chat-wake-definitive-v1.html`. Não há dependência do
Cloudflare Quick Tunnel nem carregamento de JavaScript por endereço local no
iframe do Chat.

O runtime do túnel foi reiniciado e ficou `ready`; o smoke MCP local confirmou
somente a ferramenta definitiva e o recurso novo. O processo corrente continua
ativo fora do ciclo do Codex App. A instalação de um watchdog no logon do
Windows não foi aplicada porque a elevação recusou a persistência sem uma
autorização específica posterior; isso não invalida a sessão atual, mas impede
de declarar sobrevivência a reboot.

## Próxima ação

Executar somente um smoke do retorno no app definitivo. Depois, mediante
autorização específica, instalar o watchdog no logon e validar um reinício dos
processos. Não repetir nem alterar a ponta `Chat -> Codex`.

## Capacidade

`Codex App -> Sol -> Alto -> tornar persistente somente o retorno Codex -> Chat.`
