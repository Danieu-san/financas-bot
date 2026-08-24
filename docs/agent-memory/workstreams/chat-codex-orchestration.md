# Coordenação Chat ↔ Codex

Atualizado em: 2026-08-24

## Objetivo

Estender o workflow portátil existente com um estado mecânico mínimo para
coordenação assíncrona entre Chat e Codex, sem criar uma segunda memória do
projeto e sem tocar no runtime do FinancasBot, produção, WhatsApp, Pluggy,
planilhas ou writers.

## Estado

`ORCH-01 COM EXECUTOR AUTOMÁTICO PROVADO — CAMPAINHA CHAT PENDENTE`.

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

- `CODEX_READY` foi reivindicado por CAS e publicado como `CODEX_RUNNING` em
  `63773ba47182a9f7c7295ba856508822addbb5c1`;
- syntax, `12/12` testes e validator ficaram verdes após alinhar o contrato ao
  campo estável `orchestration_state`;
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

A auditoria encontrou e o recovery fechou um achado `MEDIUM`: `Install` e
`Remove` agora recusam tarefa viva, lock malformado/PID inválido ou PID vivo;
somente PID comprovadamente morto permite remover lock órfão. Testes reais
confirmaram os três casos, `10/10` focais e validator verde.

## Prova operacional concluída em 2026-08-24

- o evento `CODEX_READY` publicado em `ea0e30b08abf2fbc9ef34e7b00c131941610f7ca`
  foi detectado pelo Agendador sem intervenção humana;
- o watcher iniciou o Codex com perfil isolado, `workspace-write` e esforço
  médio, usando prompt mecânico auditado;
- o Codex executou `13/13` testes focais, syntax check e validator verde;
- o watcher revalidou o estado remoto, aceitou somente o JSON e publicou
  `CHAT_READY` em `4cea9e4f7ff3d97c28d7d7937329a9ea5785ac3f`;
- cache final: `launch_status: succeeded`, tarefa pronta para novos polls;
- nenhuma parte do bot, produção, OCI, WhatsApp, Pluggy, planilha ou dado real
  foi acessada.

Os recoveries de newline, perfil, prompt mecânico, fronteira JSON-only e Git
explícito receberam GO independente antes desta prova. A ponta comprovada é
`GitHub/CODEX_READY -> watcher -> Codex -> GitHub/CHAT_READY`.

## Lacuna restante

O Chat comum ainda não pode ser considerado um cérebro autônomo despertado por
`CHAT_READY`. Daniel criou manualmente a tarefa única `ORCH-01 ciclo completo`,
agendada para 2026-08-24 20:37. A interface marcou a tarefa como `Concluído`,
mas a branch remota permaneceu em
`7f2cee45f007d8dfc8151c3e18bf22ce66e2e6df`: nenhum commit `CHAT_WORKING` ou
`CODEX_READY` foi publicado e a tarefa não relatou a limitação exigida pelo
prompt. O watcher local continuou saudável, com execuções por minuto e resultado
zero, mas corretamente não iniciou o Codex sem `CODEX_READY`.

Essa prova negativa encerra a tentativa via tarefa agendada do Chat comum nesta
configuração. A ponta comprovada continua sendo somente
`GitHub/CODEX_READY -> watcher -> Codex -> GitHub/CHAT_READY`.

## Próxima ação exata

Definir e provar um canal de cérebro diferente da tarefa agendada do Chat comum,
preservando GitHub como memória oficial e o watcher/Codex já comprovado como
executor. Não repetir a mesma tarefa agendada sem mudança material de capacidade
ou permissão da plataforma.

## Capacidade

`Codex -> Sol -> Alto -> desenhar o canal autônomo de cérebro substituto.`
