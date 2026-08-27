# Canal permanente Chat ↔ Codex

Atualizado em: 2026-08-27

## Objetivo

Manter um canal operacional reutilizável no qual o Chat publica tarefas
versionadas e delimitadas no GitHub e o watcher acorda o Codex somente para um
hash novo em `CODEX_READY`. O Codex publica o resultado no GitHub e encerra a
própria tarefa com um aviso padronizado para Daniel; Daniel então pede ao Chat
que leia o resultado. O fechamento do gate que construiu o canal não encerra o
serviço.

## Estado operacional

`ORCH-02 SEGUNDO RECOVERY APP-ONLY EM VALIDAÇÃO LOCAL APÓS NO-GO INDEPENDENTE`.

### Fronteira congelada

O desenho funcional `Chat -> GitHub -> watcher -> Codex App` permanece
congelado: não será substituído nem refeito sem achado causal novo. O incidente
de 2026-08-26 abriu somente um recovery delimitado da implementação operacional
do watcher — isolamento do clone, sincronização e preflight antes do wake — sem
alterar o protocolo, o manifesto ou a autoridade do GitHub.

Em 2026-08-27, Daniel cancelou explicitamente o retorno automático
`Codex -> Chat` pelo navegador. Os testes anteriores provaram apenas um retorno
assistido, pois o envio exige confirmação presencial; portanto essa rota nunca
satisfez o requisito de operação ausente. O primeiro candidato recusava
`mode=return` e não enfileirava wake em `CHAT_READY`, mas a auditoria
independente encontrou quatro lacunas causais: aviso que alegava publicação
remota sem prova, fallback CLI, confiança em campos graváveis do request e
corrida entre workers da ponte.

O recovery atual exige Codex App e falha fechado sem ele; reduz o request v4 a
hash, modo e data; deriva clone, Git, branch e state path da configuração
protegida; deriva task_id do estado remoto revalidado; exige no GitHub o mesmo
SHA-256 e `CODEX_READY` antes do IPC; protege o wake com lock interprocesso; e
terminaliza/remove pedidos legados `mode=return`. O aviso final não afirma push:

`✅ Tarefa <task_id> encerrada. Peça ao Chat para verificar o resultado no GitHub.`

Enquanto não há trabalho, o estado permanece `CHAT_WORKING`: o Chat possui o
canal, mas nenhum modelo local é iniciado. Para cada trabalho, o Chat cria um
manifesto `financasbot-chat-codex-task-v1`, publica-o com a transição a
`CODEX_READY` e aguarda Daniel pedir a leitura do resultado depois do aviso do
Codex.

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

O executor não pode alterar o manifesto, scripts de agente, GitHub Actions,
instruções do agente, segredos, sessões ou dados privados. O Codex App publica
somente o estado, o resultado e os caminhos exatos autorizados; rename, cópia,
deleção, staged change ou caminho adicional falham fechados.

## Responsabilidade do Chat

1. atualizar o manifesto preexistente
   `docs/agent-memory/workstreams/tasks/chat-codex-task-slot.json` enquanto o
   estado ainda estiver `CHAT_WORKING`;
2. somente após confirmar esse commit inerte, publicar em outro commit a
   transição do estado para `CODEX_READY`, apontando ao slot;
3. após Daniel informar que recebeu o aviso de conclusão, ler estado, resultado
   e diff no GitHub;
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

## Prova isolada do retorno em 2026-08-25 — evidência histórica, rota cancelada

O PoC MCP local demonstrou apenas retorno assistido ao Chat. Como exigia
confirmação presencial, não atende operação ausente e foi retirado da rota.

## Endpoint criado em 2026-08-25 — fora da rota vigente

O Secure MCP Tunnel provado anteriormente não participa mais do canal
operacional. Sua eventual remoção física é limpeza separada.

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
- um segundo preflight mecânico, imediatamente antes do despacho ao App, recusa
  mudanças rastreadas, não rastreadas e ignoradas que tenham surgido depois da
  sincronização.

O primeiro candidato deste recovery recebeu `NO-GO` porque o modo App ainda não
repetia a verificação de caminhos ignorados antes do wake. O recovery atual
fecha essa lacuna e substitui a prova textual do instalador por testes causais
com clones Git temporários, incluindo worktree vinculada, origem divergente,
revisão atrasada, untracked, ignored, runtime interno/junction, branch
divergente e watcher ausente.

O segundo candidato, `7b3c4d5af97393089ff652fa4b6604bc74855206`,
fechou o preflight App, mas recebeu `NO-GO` porque a branch ainda era parâmetro
do instalador, o runtime era comparado apenas lexicalmente e faltavam negativos
causais dessas fronteiras. O recovery atual remove o parâmetro de branch,
canonicaliza o runtime através do filesystem e acrescenta essas provas sem
alterar o protocolo do canal.

O recovery App-only posterior passou em `64/64` testes herméticos. Ele remove
o caminho executável do CLI, reduz o request local a dados não autoritativos,
revalida hash e `CODEX_READY` no remoto a partir da configuração protegida,
serializa workers concorrentes e terminaliza pedidos legados de retorno. Esse
resultado foi publicado em `6f9a5efd9c682e23004c84185607368806bab953` e
recebeu `NO-GO` independente. O parecer fechou aviso, request, CLI e retorno
legado, mas encontrou quatro lacunas: modo App direto ainda instalável, ACL que
virava `FullControl` quando App e writer eram a mesma conta, reclaim concorrente
de lock sujeito a ABA e state path ainda configurável no watcher.

O segundo recovery remove completamente o modo direto e aceita somente a ponte
endurecida; fixa o mesmo state path nos dois instaladores; limita App e writer a
leitura em raiz/bin e a `Modify` apenas onde cada processo escreve; e proíbe
reclaim automático de lock pelos workers. Lock obsoleto agora falha fechado e
só pode ser limpo pelo instalador depois de provar tarefa parada e PID morto. A
bateria causal afetada passou em `43/43` e a suíte hermética ampla final passou
em `63/63`; o workflow e `git diff --check` também estão verdes.

Os artefatos que causaram o incidente foram preservados fora da worktree em
`%LOCALAPPDATA%\FinancasBot\orchestration-artifacts\20260827-sync-error`.

## Próxima ação

Concluir a suíte ampla, publicar e reauditar o segundo recovery que preserva
somente `CODEX_READY -> ponte endurecida -> Codex App`.
Com GO, reinstalar o watcher no clone dedicado e executar um único smoke
marker-only: a tarefa deve alcançar `CHAT_READY`, exibir o aviso não afirmativo
na própria tarefa do Codex e não criar pedido `mode=return`, mensagem de
navegador ou execução CLI.

## Capacidade

`Codex -> Sol -> Alto -> fechar o candidato e pedir uma única reauditoria por hash.`
