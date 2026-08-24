# Plano — coordenação Chat ↔ Codex

Status: `retorno ORCH-01 comprovado; watcher econômico candidato aguardando auditoria`.

## Objetivo

Acrescentar ao workflow portátil existente uma camada mecânica mínima para
coordenação assíncrona Chat-first com Codex sob demanda, preservando GitHub como
memória oficial e sem criar uma segunda autoridade documental.

## Base

`11c8fe591287d7f020338594dbd08fb4e2920bee`.

## Escopo

- novo workstream próprio no índice existente;
- um único arquivo JSON mecânico de estado por workstream;
- validador/transitioner Node usando apenas bibliotecas nativas;
- hash estável do arquivo para polling barato;
- transições atômicas locais por arquivo temporário + rename;
- testes de schema, transições, posse, caminhos, hashes e terminais;
- integração ao `validateAgentWorkflow.js`;
- ensaio Chat -> Codex -> Chat estritamente documental/no-op.

## Não escopo

- `docs/refactor/`, `MASTER-PLAN.md`, `CONTROL.md` ou nova memória paralela;
- alteração do runtime financeiro;
- alteração de `messageHandler`, agentes financeiros, writers ou flags;
- OCI, SSH, PM2, WhatsApp, Pluggy, Google Sheets ou dados reais;
- deploy, merge, mudança de produção ou escrita financeira;
- automatizar navegador do Chat como fila oficial;
- polling que desperte o modelo quando o hash não mudou;
- tornar Adapta ou qualquer revisor externo dependência obrigatória.

## Contrato mecânico

Campos obrigatórios:

- `schema`;
- `orchestration_state`;
- `next_executor`;
- `task_id`;
- `expected_base_sha`;
- `task_file`;
- `candidate_sha`;
- `result_file`;
- `updated_at`.

Fluxo normal:

`CHAT_WORKING -> CODEX_READY -> CODEX_RUNNING -> CHAT_READY -> CHAT_WORKING`.

Estados de parada:

`BLOCKED`, `FAILED`, `HUMAN_APPROVAL_REQUIRED`, `FINISHED`.

Mapeamento obrigatório de executor:

- `CHAT_WORKING`, `CHAT_READY` -> `chat`;
- `CODEX_READY`, `CODEX_RUNNING` -> `codex`;
- `HUMAN_APPROVAL_REQUIRED` -> `human`;
- `BLOCKED`, `FAILED`, `FINISHED` -> `none`.

Estados terminais não possuem transição de saída nesta versão.

## Etapas

1. [concluída] Inspecionar `AGENTS.md`, memória operacional, ADR-010, skills,
   scripts de handoff/resume, validator, índice e workstream financeiro atual.
2. [concluída] Confirmar que o workflow já define checkpoint, plano, workstreams,
   GitHub imutável, auditoria independente e retomada portátil.
3. [concluída] Criar o estado mecânico mínimo e o transitioner isolado.
4. [concluída] Criar e executar testes focais do protocolo (`12/12`).
5. [concluída] Executar `validateAgentWorkflow.js` e revisão adversarial do diff.
6. [concluída] Publicar commit imutável com a validação do Codex.
7. [concluída] Devolver `CHAT_READY` e confirmar a ponta Codex -> Chat sem
   tocar no bot ou produção. A ponta Chat -> Codex foi iniciada manualmente pelo
   usuário e não provou despertar automático.
8. [em execução] Auditar o watcher econômico que permanece silencioso quando o
   hash não muda e chama Codex uma vez por novo `CODEX_READY`.
9. [pendente] Com GO independente, instalar e ensaiar Chat -> watcher -> Codex
   -> Chat; remover ou pausar a tarefa se qualquer ponta falhar.

## Critérios de GO

- schema fechado rejeita campos extras e valores inválidos;
- transição fora da máquina de estados falha fechado;
- `next_executor` incoerente falha fechado;
- hashes exigidos são SHA completos e caminhos não escapam do repositório;
- hash mecânico permanece igual sem mudança e muda com alteração real;
- escrita local usa temporário + rename;
- estados terminais não reiniciam silenciosamente;
- validator do workflow reconhece o novo workstream sem alterar os existentes;
- ensaio das duas pontas ocorre sem runtime financeiro, produção ou dados reais;
- nenhuma dependência externa nova é necessária.

## Condições de parada

- necessidade de duplicar memória já existente;
- qualquer segredo/dado real no estado mecânico;
- necessidade de alterar produto para provar o protocolo;
- polling que exija manter um modelo acordado;
- transição não atômica ou execução duplicável;
- divergência entre checkpoint humano e estado mecânico.

## Próxima ação

Publicar o candidato do watcher, pedir auditoria independente por hash e, com
GO, instalar e executar somente o ensaio no-op completo.
