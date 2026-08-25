# ORCH-01 — recovery da idempotência histórica da campainha

Data: 2026-08-25

## Origem

A auditoria independente do commit
`bf7667cec8bea693f48c1f0c544ddc670d15d96d` emitiu `NO-GO`. O marcador da
ponte conservava somente o último `observed_hash`; assim, a sequência
`A -> B -> A` podia despachar `A` duas vezes. A auditoria aceitou a fronteira
de privilégio, o fail-closed do hash corrente e a prova operacional, mas
considerou essa lacuna indispensável para a propriedade declarada de no máximo
uma campainha por hash.

## Recovery

- o resultado protegido passa do schema `v1` de registro único para o schema
  `v2`, com histórico de registros por hash;
- `dispatching` continua sendo persistido antes do IPC;
- qualquer ocorrência anterior de um hash, em `dispatching`, `accepted` ou
  `failed`, torna seu replay terminal, mesmo depois de outros hashes;
- o leitor aceita o resultado `v1` já instalado e o converte em memória para
  `v2`, preservando o último hash durante a atualização;
- registros duplicados ou estruturalmente inválidos falham fechados;
- configuração, código, helper e histórico permanecem na área protegida; a
  inbox gravável continua sem comando, destino ou prompt.

## Prova causal

`tests/codexAppWakeBridge.test.js` agora executa explicitamente:

1. `A` aceito;
2. replay imediato de `A` recusado;
3. `B` aceito;
4. replay de `A` depois de `B` recusado;
5. exatamente duas chamadas ao IPC em toda a sequência.

Também comprova que um marcador `v1` terminal impede novo envio do mesmo hash
durante a migração. Os testes usam `processWakeRequest` real e injetam somente
o efeito IPC e o relógio.

## Evidência local

- syntax check do worker: verde;
- bateria focal `codexAppWakeBridge` + `codexAppIpcWake`: `11/11` verde;
- bateria ampla única pós-recovery do domínio: `57/57` verde;
- `validateAgentWorkflow.js`, syntax check e `git diff --check`: verdes.

Contagens locais são evidência relatada, não execução do auditor.

## Critério de GO

GO técnico local somente se a revisão independente confirmar que o histórico
protegido fecha `A -> B -> A`, que a migração não reenvia o hash legado, que a
escrita `dispatching` permanece anterior ao IPC e que nenhum campo gravável
passa a controlar destino, código ou prompt. Este gate não autoriza produto,
produção, WhatsApp, Pluggy, planilhas ou dados privados.
