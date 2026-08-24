# Coordenação Chat ↔ Codex

Atualizado em: 2026-08-24

## Objetivo

Estender o workflow portátil existente com um estado mecânico mínimo para
coordenação assíncrona entre Chat e Codex, sem criar uma segunda memória do
projeto e sem tocar no runtime do FinancasBot, produção, WhatsApp, Pluggy,
planilhas ou writers.

## Estado

`ORCH-01 VALIDADO PELO CODEX — DEVOLUÇÃO CHAT_READY PENDENTE`.

## Base e branch

- base imutável do workstream: `11c8fe591287d7f020338594dbd08fb4e2920bee`;
- branch isolada: `chat/chat-codex-orchestration-20260824`;
- estado mecânico versionado:
  `docs/agent-memory/workstreams/chat-codex-orchestration.state.json`;
- candidato mecânico mais recente antes deste checkpoint:
  `d3c1c3e2faec87c7e61a5a5aa5f17f64bff435ba`;
- workstream independente do ARQ-01..06 já encerrado.

## Decisão de arquitetura

O GitHub continua sendo a memória imutável e os checkpoints/workstreams
existentes continuam sendo a autoridade humana. A extensão adiciona somente um
arquivo JSON mecânico deste workstream, validado por script, para indicar posse,
próximo executor e artefatos da troca.

Não existe `docs/refactor/`, `MASTER-PLAN.md`, `CONTROL.md` ou outra memória
paralela.

## Campos mecânicos

O estado versionado contém somente:

- `orchestration_state`;
- `next_executor`;
- `task_id`;
- `expected_base_sha`;
- `task_file`;
- `candidate_sha`;
- `result_file`;
- `updated_at`;
- `schema` para validar a versão do protocolo.

`expected_base_sha` identifica a base material imutável da tarefa. Commits
posteriores restritos ao próprio protocolo/checkpoint podem existir para
publicar a passagem de bastão; eles não alteram silenciosamente a base material.

Nenhum prompt, segredo, dado financeiro, log privado, token, cookie, sessão ou
conteúdo do Chat/Codex pertence ao arquivo mecânico.

## Máquina de estados

Fluxo normal:

`CHAT_WORKING -> CODEX_READY -> CODEX_RUNNING -> CHAT_READY -> CHAT_WORKING`.

Estados terminais/de parada:

- `BLOCKED`;
- `FAILED`;
- `HUMAN_APPROVAL_REQUIRED`;
- `FINISHED`.

O `next_executor` é derivado pelo estado e validado fail-closed. Estados
terminais não possuem transição de saída nesta versão.

## Proteção contra execução duplicada

O transitioner implementa duas barreiras complementares:

1. lock local exclusivo por arquivo (`wx`) para impedir dois transitioners na
   mesma worktree de reivindicarem o estado simultaneamente;
2. `--expected-state-hash` opcional para compare-and-swap lógico: se o conteúdo
   mudou desde a observação do timer, a transição falha antes de executar.

Em integração via GitHub, o executor também deve publicar sua mudança sobre o
blob/HEAD esperado e falhar fechado se o remoto avançar de forma concorrente.

## Invariantes

1. O timer do Codex deve observar somente hash/estado mecânico; ausência de
   mudança não pode despertar o modelo.
2. A automação não é considerada pronta enquanto as duas pontas reais não forem
   provadas: Chat publica `CODEX_READY` e o Codex acorda; Codex publica
   `CHAT_READY` e este Chat é reativado.
3. Dependência local ou privada continua exclusiva do Codex.
4. Chat só altera código quando GitHub/CI fornecem evidência suficiente.
5. Nenhuma transição autoriza deploy, writer, migração, alteração sensível de
   produção ou escrita financeira real.
6. `HUMAN_APPROVAL_REQUIRED` é obrigatório antes de qualquer ação irreversível
   ou previamente não autorizada.
7. Transições são validadas e o arquivo é substituído por escrita temporária +
   rename no ambiente local; no GitHub, cada commit é a unidade atômica.
8. `expected_base_sha` e `candidate_sha`, quando presente, são hashes completos
   de 40 caracteres hexadecimais.
9. `task_file` e `result_file`, quando presente, são caminhos relativos seguros
   dentro do repositório, incluindo rejeição portátil de caminhos absolutos
   Windows/UNC.

## Evidência já obtida no Chat

- workflow, ADR-010, memória, skills e scripts portáteis foram inspecionados;
- branch isolada partiu de `11c8fe591...`; nenhum runtime ou dado real mudou;
- transitioner e `12/12` testes focais ficaram verdes, cobrindo schema,
  transições, CAS, hashes/caminhos, terminais, lock e escrita atômica;
- o validator completo permanece evidência do Codex, não do Chat.

## Ensaio real pendente

A primeira troca deve ser estritamente no-op/documental:

1. Chat publica `CODEX_READY` apontando para o candidato mecânico;
2. timer local detecta mudança de hash sem acordar modelo em polls inalterados;
3. Codex reivindica `CODEX_RUNNING` com hash observado;
4. Codex executa somente `node --test tests/chatCodexOrchestration.test.js`,
   `node --check scripts/agent/manageChatCodexOrchestration.js` e
   `node scripts/agent/validateAgentWorkflow.js`;
5. Codex não toca bot, OCI, WhatsApp, Pluggy, planilha, `.env` ou dados reais;
6. Codex registra resultado no checkpoint, publica `CHAT_READY` e envia a este
   Chat apenas a campainha curta com `task_id` e SHA;
7. Chat confere GitHub e assume `CHAT_WORKING`.

## Resultado do Codex em 2026-08-24

- `CODEX_READY` foi reivindicado com compare-and-swap e publicado como
  `CODEX_RUNNING` no commit
  `63773ba47182a9f7c7295ba856508822addbb5c1`;
- syntax check do transitioner: verde;
- teste focal do protocolo: `12/12` verde;
- o validator inicialmente falhou porque exigia o valor transitório
  `CHAT_WORKING` dentro do arquivo de estado vivo e porque este checkpoint não
  citava literalmente o path do estado;
- o contrato foi corrigido para validar o campo estável
  `orchestration_state`, mantendo a enumeração de estados no transitioner, e o
  path mecânico foi explicitado neste checkpoint;
- após a correção, `validateAgentWorkflow.js` retornou
  `agent-workflow: OK` e o teste focal permaneceu `12/12` verde;
- nenhum arquivo do bot, runtime, produção ou dado real foi tocado.

Limite probatório: o usuário trouxe a passagem `CODEX_READY` a esta conversa;
portanto, esta rodada comprova reivindicação, validação e devolução mecânicas,
mas não comprova ainda que um timer desperta o Codex sozinho. A automação deve
continuar classificada como semiautomática até um ensaio posterior do trigger.

## Candidato de watcher econômico

O segundo candidato acrescenta um poller local one-shot e um instalador para o
Agendador de Tarefas do Windows:

- o poller busca somente a branch do workstream e valida o JSON remoto com o
  mesmo parser do transitioner;
- hash e estado inalterados terminam sem chamar modelo;
- apenas um hash novo em `CODEX_READY` pode chamar `codex exec`;
- cache e lock ficam em `LOCALAPPDATA`, fora do Git;
- a tarefa usa `IgnoreNew`, conta interativa atual e limite de 35 minutos;
- o prompt é fixo e local; o estado remoto não fornece comandos;
- oito testes focais verdes cobrem silêncio em estado inalterado, single-shot,
  novo ciclo por hash, lock concorrente e órfão, escopo do prompt, launcher sem
  shell e rejeição de branch semelhante a opção.

No ensaio de instalação, três limites reais foram descobertos e corrigidos:

- a tarefa deve usar o usuário da sessão interativa, não o usuário do processo
  de ferramentas;
- o poll curto deve poder iniciar e continuar em bateria;
- lock deve registrar PID e recuperar somente processo comprovadamente morto;
- Git recebe `safe.directory` apenas na invocação local validada, sem alterar
  configuração global do usuário.

A tarefa instalada foi verificada com usuário `Usuario`, logon interativo,
`IgnoreNew`, repetição de um minuto e limite de 35 minutos. Um poll real em
`CHAT_WORKING` terminou com código zero, gravou o hash observado e manteve
`launched_hash: null`, sem chamar modelo. A rodada completa com
`CODEX_READY` ainda depende do recovery imutável e de reauditoria.

A reauditoria do commit `7b26b20f182b6b7e1e06053a79ca4db469d5726d`
identificou um único achado `MEDIUM`: as ações `Install` e `Remove` ainda
apagavam o lock incondicionalmente, contornando a proteção do watcher. O
recovery seguinte tornou o lifecycle fail-closed: instalação e remoção recusam
tarefa em execução, lock malformado, PID inválido e PID vivo; somente um PID
válido e comprovadamente morto permite remover o lock órfão.

Evidência causal local do recovery:

- `9/9` testes focais do watcher verdes;
- parser PowerShell verde;
- lock com PID morto foi recuperado e a instalação prosseguiu;
- lock malformado retornou erro e permaneceu intacto;
- lock do processo vivo retornou erro e permaneceu intacto;
- após reinstalação, poll real terminou com código zero, sem lock residual e
  sem alterar `launched_hash: null` em `CHAT_WORKING`.

O primeiro `CODEX_READY` automático foi publicado pelo Chat no commit
`8efea1d0a7d700e0a86227b2f8130f73f0c407ce`. A tarefa detectou o novo hash
uma única vez e gravou `launch_status: running`, mas o processo não chegou a
abrir o Codex: a conta agendada não possuía `pwsh.exe` no `PATH` e o spawn
falhou com `ENOENT`. Nenhum arquivo de produto ou produção foi tocado.

O recovery do launcher passa o caminho absoluto de `pwsh.exe`, resolvido pelo
instalador, como argumento validado do watcher. Exceções de spawn agora também
persistem `launch_status: failed:error`, mantendo o mesmo hash sem relançamento
automático. O teste focal causal confirma caminho absoluto, persistência da
falha e single-shot após erro. Para repetir o ensaio com o mesmo estado remoto,
o cache local somente poderá ser reinicializado por decisão operacional depois
de confirmar que nenhum processo Codex foi criado.

## Próxima ação exata

Publicar e reauditar o recovery do launcher. Com GO, confirmar novamente a
ausência de processo Codex da tentativa falha, reinicializar uma única vez o
cache local e observar a tarefa completar o `CODEX_READY` já publicado até
`CHAT_READY`.

## Capacidade

`Codex -> Sol -> Médio -> executar apenas o ensaio local no-op ORCH-01 e devolver CHAT_READY.`
