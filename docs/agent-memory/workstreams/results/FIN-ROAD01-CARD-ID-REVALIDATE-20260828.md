# FIN-ROAD01-CARD-ID-REVALIDATE-20260828

## Bootstrap local da ponte

- Identidade efetiva: `DESK-8GBM-02\Administrador`.
- Foram comparadas e substituidas somente as duas copias instaladas permitidas em `%ProgramData%\FinancasBot\chat-codex-app-wake\bin`.
- `processCodexAppWakeRequest.js`: fonte e instalado com SHA-256 `4E20DBF3FA78818018D27E2340F27E9667BEEE987D1EB6027A0C51DD49F2BEFD`.
- `wakeCodexAppViaIpc.js`: fonte e instalado com SHA-256 `D9FC7C527D370177C3CFD11328EADD92F079B577D86B7CAE4243E26934239CD1`.
- Igualdade byte a byte confirmada pelos hashes.
- Nao foram alterados `config.json`, ACLs, Scheduled Tasks, usuarios, `thread_id`, `chat_url` ou qualquer outro arquivo instalado.

## Alvo e isolamento

- SHA validado: `d2e3e17caae79577b6c8736780d809a36d2a0f31`.
- Base de comparacao: `09a6cceb394157153516a4f8393267e47ed66a06`.
- Branch de origem: `chat/financial-roadmap-road01-20260827`, obtida por um unico fetch read-only.
- Worktree detached: `C:\Users\Administrador\Documents\FinancasBot\financas-bot-road01-revalidate`.
- Estado final da worktree de validacao: limpa, com zero entradas em `git status --short`.
- Nenhum codigo, teste, documento ou configuracao de produto foi alterado.

## Nove comandos obrigatorios

1. `node --check src/services/cardInvoiceSummaryService.js` — **PASS** (`exit 0`).
2. `node --check src/services/userSpreadsheetService.js` — **PASS** (`exit 0`).
3. `node --check src/services/google.js` — **PASS** (`exit 0`).
4. `node --check src/handlers/messageHandler.js` — **PASS** (`exit 0`).
5. `node --test tests/road01CardIdentity.test.js` — **PASS**: 7/7.
6. `node --test --test-force-exit --test-name-pattern 'card writes preserve|google user spreadsheet mapping' tests/unit.test.js` — **PASS**: 2/2.
7. `node --test --test-force-exit tests/userSpreadsheetService.test.js tests/unit.test.js tests/road01CardIdentity.test.js` — **PASS**: 233/233.
8. `git diff --check 09a6cceb394157153516a4f8393267e47ed66a06...d2e3e17caae79577b6c8736780d809a36d2a0f31` — **PASS** (`exit 0`, sem saida).
9. `node scripts/agent/validateAgentWorkflow.js` — **PASS**: `agent-workflow: OK`, detached no SHA alvo, zero entradas no status.

A primeira captura do comando 5 retornou somente o cabecalho TAP sem resumo; ele foi repetido uma unica vez para obter um resultado tecnico verificavel, sem mudanca causal entre as execucoes.

## Suite ampla proporcional

Comando unico: `npm run test:unit` — **FAIL** no lifecycle `pretest:unit`, antes da bateria `test:unit` principal.

Resumo observado em `tests/userStateSnapshotSecurity.test.js`:

- 14 testes executados;
- 9 passaram;
- 5 falharam;
- exemplo integral relevante: `restore physically compacts expired entries immediately` (`tests/userStateSnapshotSecurity.test.js:352`, chamada em `:360`) falhou com `Error: state_store_persist_failed`, originado em `flushStateToDisk` (`src/state/userStateManager.js:443`);
- codigo de saida do comando amplo: `1`.

A falha ampla pertence ao preteste de persistencia segura do state store e nao contradiz os 242 testes especificos/causais verdes do ROAD-01. Ainda assim, o manifesto determina falha fechada diante de qualquer comando obrigatorio ou suite ampla vermelha. Nao houve repeticao da suite ampla nem tentativa de correcao.

## Conclusao

O ROAD-01.2 esta verde em todos os nove checks especificos, mas o candidato nao pode receber validacao global verde porque a unica suite ampla proporcional falhou no preteste de state store. A cadeia deve ser diagnosticada em tarefa separada e com escopo proprio.

VALIDATION_FAIL
