# Plano — coordenação Chat ↔ Codex

Status: `ORCH-01: ciclo completo provado; candidato aguardando auditoria independente`.

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
8. [concluída] Auditar o watcher econômico e comprovar no Task Scheduler que
   `CHAT_WORKING` inalterado termina sem chamar modelo.
9. [concluída] Reauditar o recovery final de lifecycle: usuário interativo,
   bateria e safe.directory já foram confirmados; instalação/remoção agora
   recusam tarefa viva, lock malformado ou PID vivo e recuperam apenas PID morto.
10. [concluída] Chat -> GitHub -> watcher -> Codex CLI e single-shot foram
   provados; launcher absoluto e `gpt-5.4-mini/medium` receberam GO independente.
11. [concluída] Recuperar perfil/sandbox, hash LF/CRLF, Git explícito e
   publicação JSON-only; provar o ciclo sem intervenção até `CHAT_READY` no
   commit `4cea9e4f7ff3d97c28d7d7937329a9ea5785ac3f`.
12. [concluída com prova negativa] A tarefa agendada única do Chat foi criada e
   marcada como concluída, mas não publicou `CHAT_WORKING` nem `CODEX_READY` e
   não relatou a limitação prevista. O watcher permaneceu saudável e o remoto
   ficou em `7f2cee45f007d8dfc8151c3e18bf22ce66e2e6df`.
13. [concluída] Provar que S4U sob o usuário do Codex App alcança o IPC local e
   remover a tarefa temporária depois do resultado zero.
14. [concluída] Instalar ponte permanente com código/configuração/estado
   protegidos, caixa de entrada gravável e execução `S4U/Limited`.
15. [concluída] Provar o ciclo Chat -> GitHub -> watcher -> Codex CLI -> GitHub
   -> fila -> ponte S4U -> Codex App -> Browser -> Chat.
16. [em andamento] Publicar candidato imutável e obter auditoria independente.

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

Auditar o commit final e, somente com GO independente, fechar ORCH-01. A
automação não autoriza produto, produção, dados privados ou ação irreversível.
