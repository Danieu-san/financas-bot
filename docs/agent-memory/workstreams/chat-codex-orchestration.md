# Coordenação Chat ↔ Codex

Atualizado em: 2026-08-24

## Objetivo

Estender o workflow portátil existente com um estado mecânico mínimo para
coordenação assíncrona entre Chat e Codex, sem criar uma segunda memória do
projeto e sem tocar no runtime do FinancasBot, produção, WhatsApp, Pluggy,
planilhas ou writers.

## Estado

`ORCH-01 CANDIDATO CHAT PUBLICADO — TESTE FOCAL 12/12; ENSAIO REAL CHAT -> CODEX -> CHAT PENDENTE`.

## Base e branch

- base imutável do workstream: `11c8fe591287d7f020338594dbd08fb4e2920bee`;
- branch isolada: `chat/chat-codex-orchestration-20260824`;
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

- inspeção integral do workflow relevante: `AGENTS.md`, README/START-HERE,
  ADR-010, índice, checkpoint/plano ARQ, skills de execução/auditoria/handoff,
  `preparePortableHandoff.ps1`, `resumePortableWork.ps1` e validator;
- branch isolada criada a partir do HEAD `11c8fe591...`;
- nenhuma alteração em runtime financeiro, produção ou integração privada;
- syntax check do transitioner verde no ambiente de execução do Chat;
- teste focal `tests/chatCodexOrchestration.test.js`: `12/12` verdes;
- testes cobrem schema fechado, executor, hash estável, compare-and-swap,
  transições, `CHAT_READY`, SHA/path traversal, Windows/UNC, terminais, lock
  exclusivo e escrita atômica;
- tentativa de clonar o repositório público no container do Chat não foi usada
  como prova do workflow completo porque o ambiente não resolveu `github.com`;
  por isso `validateAgentWorkflow.js` completo permanece para a etapa Codex.

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

## Próxima ação exata

Preparar a passagem `CODEX_READY` somente quando o timer/trigger local do Codex
estiver configurado para observar este workstream. Até essa prova, o protocolo
permanece semiautomático e não deve ser usado para tarefas materiais do bot.

## Capacidade

`Codex -> Sol -> Médio -> executar apenas o ensaio local no-op ORCH-01 e devolver CHAT_READY.`
