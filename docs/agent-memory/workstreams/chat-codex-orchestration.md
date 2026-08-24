# Coordenação Chat ↔ Codex

Atualizado em: 2026-08-24

## Objetivo

Estender o workflow portátil existente com um estado mecânico mínimo para
coordenação assíncrona entre Chat e Codex, sem criar uma segunda memória do
projeto e sem tocar no runtime do FinancasBot, produção, WhatsApp, Pluggy,
planilhas ou writers.

## Estado

`ORCH-01 EM IMPLEMENTAÇÃO ISOLADA — PROTOCOLO MECÂNICO AINDA NÃO AUTORIZADO PARA AUTOMAÇÃO REAL`.

## Base e branch

- base imutável: `11c8fe591287d7f020338594dbd08fb4e2920bee`;
- branch isolada: `chat/chat-codex-orchestration-20260824`;
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
   dentro do repositório.

## Evidência esperada antes de ativar timer

- teste focal do validador/transitioner verde;
- `validateAgentWorkflow.js` verde;
- candidato publicado em hash imutável;
- ensaio mecânico completo da máquina de estados sem tocar no bot;
- prova real Chat -> Codex -> Chat em tarefa documental/no-op;
- nenhum acesso a OCI, WhatsApp, Pluggy, planilha ou dados financeiros durante o
  ensaio.

## Próxima ação exata

Concluir script, testes e validação estática do protocolo. Depois publicar o
candidato imutável e pedir ao Codex somente a instalação/execução do ensaio
local de despertar, sem alterar o bot e sem produção.

## Capacidade

`Chat -> GPT-5.6 Sol -> Alto -> concluir e auditar o protocolo mecânico isolado.`
