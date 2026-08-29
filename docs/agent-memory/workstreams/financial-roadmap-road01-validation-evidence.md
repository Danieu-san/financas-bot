# ROAD-01.2 — evidência de validação e diagnóstico

Data: 2026-08-29
Candidato de código: `d2e3e17caae79577b6c8736780d809a36d2a0f31`
Base de comparação: `09a6cceb394157153516a4f8393267e47ed66a06`
Escopo: somente validação local e classificação causal do bloqueio amplo; nenhuma alteração de produto, deploy, dado privado ou sistema real.

## Checks específicos do candidato

O executor local validou uma worktree detached e limpa do candidato:

- `node --check src/services/cardInvoiceSummaryService.js`: PASS;
- `node --check src/services/userSpreadsheetService.js`: PASS;
- `node --check src/services/google.js`: PASS;
- `node --check src/handlers/messageHandler.js`: PASS;
- `node --test tests/road01CardIdentity.test.js`: 7/7 PASS;
- focais de writer/adapter em `tests/unit.test.js`: 2/2 PASS;
- bateria combinada `tests/userSpreadsheetService.test.js tests/unit.test.js tests/road01CardIdentity.test.js`: 233/233 PASS;
- `git diff --check 09a6cceb...d2e3e17c...`: PASS;
- `node scripts/agent/validateAgentWorkflow.js`: PASS (`agent-workflow: OK`).

A worktree permaneceu limpa e nenhum código, teste, documento ou configuração de produto foi alterado pelo executor.

## Única suíte ampla proporcional

`npm run test:unit` foi executado uma única vez no candidato e falhou no lifecycle `pretest:unit`, antes da bateria principal, dentro de `tests/userStateSnapshotSecurity.test.js`:

- 14 testes executados;
- 9 PASS;
- 5 FAIL;
- erro observado: `state_store_persist_failed` durante persistência/compactação do state store.

Os arquivos diretamente envolvidos nessa falha eram idênticos entre base e candidato:

- `src/state/userStateManager.js`: blob `442857d58977b64ae7f0c3a8f9e6385549db049d` em ambos;
- `tests/userStateSnapshotSecurity.test.js`: blob `5dcefe7d6988f404f026d8801c2557d9131f66d6` em ambos.

A suíte ampla não foi repetida para evitar transformar uma execução ampla em polling de testes e para preservar o contrato de uma suíte ampla por candidato estável.

## Diagnóstico controlado base × candidato

Foi aberta tarefa separada, somente de diagnóstico, em worktrees detached e limpas. Ambiente observado: Node `v22.17.0`, `win32`, `x64`.

O mesmo comando `npm run test:state-store-security` foi executado exatamente uma vez em cada hash:

### Base `09a6cceb394157153516a4f8393267e47ed66a06`

- exit code 0;
- 14/14 PASS;
- zero falhas.

### Candidato `d2e3e17caae79577b6c8736780d809a36d2a0f31`

- exit code 0;
- 14/14 PASS;
- zero falhas.

As mensagens sanitizadas `file_persist_failed` e `file_restore_failed` apareceram apenas como parte de cenários negativos esperados e não produziram `not ok`.

## Classificação causal

A falha ampla anterior não foi reproduzida nem na base nem no candidato sob comparação controlada. Portanto:

- não há evidência reproduzível de regressão introduzida pelo ROAD-01.2;
- a causa exata do incidente amplo anterior permanece não identificada;
- o incidente é classificado para esta fatia como falha não reproduzível dependente de contexto/ambiente, com risco residual explícito;
- esta classificação permite seguir para auditoria independente, mas não constitui `GO ROAD-01.2` por si só.

## Fontes operacionais originais

Na branch de orquestração, os relatórios completos foram publicados como:

- `docs/agent-memory/workstreams/results/FIN-ROAD01-CARD-ID-REVALIDATE-20260828.md` — resultado terminal `VALIDATION_FAIL` devido à única suíte ampla vermelha antes do diagnóstico;
- `docs/agent-memory/workstreams/results/FIN-ROAD01-STATE-BASELINE-DIAG-20260828.md` — resultado terminal `DIAG_INCONCLUSIVE`, com 14/14 PASS em base e candidato e ausência de regressão reproduzível.

O presente documento é a evidência sanitizada e autocontida para auditoria do candidato ROAD-01.2.
