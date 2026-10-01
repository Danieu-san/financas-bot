# FIN-ROAD01-CARD-ID-VALIDATE-20260828

## Alvo e isolamento

- SHA validado: `e4bfe14b9e436c70b6f4ef08a347de2b4c718af0`.
- Base de comparacao: `09a6cceb394157153516a4f8393267e47ed66a06`.
- Origem: branch remota exata `chat/financial-roadmap-road01-20260827`, obtida por um unico fetch read-only ja permitido pelo manifesto.
- Worktree destacada: `C:\Users\Administrador\Documents\FinancasBot\financas-bot-road01-validate`.
- Estado final da worktree de validacao: limpa, em detached HEAD no SHA alvo, com `0` entradas em `git status --short`.
- Nenhum codigo, teste, documento de produto ou configuracao foi alterado.

## Validacoes obrigatorias

1. `node --check src/services/cardInvoiceSummaryService.js` — **PASS** (`exit 0`).
2. `node --check src/services/userSpreadsheetService.js` — **PASS** (`exit 0`).
3. `node --check src/services/google.js` — **PASS** (`exit 0`).
4. `node --check src/handlers/messageHandler.js` — **PASS** (`exit 0`).
5. `node --test tests/road01CardIdentity.test.js` — **FAIL**: 7 testes, 6 passaram e 1 falhou.
6. `node --test --test-force-exit --test-name-pattern 'card writes preserve|google user spreadsheet mapping' tests/unit.test.js` — **PASS**: 2 testes, 2 passaram.
7. `node --test --test-force-exit tests/userSpreadsheetService.test.js tests/unit.test.js tests/road01CardIdentity.test.js` — **FAIL**: 233 testes, 229 passaram e 4 falharam.
8. `git diff --check 09a6cceb394157153516a4f8393267e47ed66a06...e4bfe14b9e436c70b6f4ef08a347de2b4c718af0` — **PASS** (`exit 0`, sem saida).
9. `node scripts/agent/validateAgentWorkflow.js` — **PASS** (`agent-workflow: OK`; detached HEAD no SHA alvo; 0 entradas no status).

A primeira tentativa do comando 5 nao chegou a carregar o teste por bloqueio do sandbox ao resolver `node_modules` no SSD (`EPERM` em `E:\Users\horus\Documents`). Ela foi repetida uma unica vez com leitura das dependencias locais e o resultado tecnico acima e o resultado valido da validacao.

## Falhas observadas

### Comando 5 — teste focal

Teste: `invoice formula mirrors canonical/legacy identity split and resolves friendly display` (`tests/road01CardIdentity.test.js:96`; assercao em `:103`).

Erro:

```text
AssertionError [ERR_ASSERTION]: The input did not match the regular expression /'Cartões'!A:B/.
operator: match
```

A formula produzida usa intervalos separados e sem cabecalho — `TRIM('Cartões'!A2:A)` e `'Cartões'!B2:B` — em vez do trecho literal contiguo exigido pela assercao, `'Cartões'!A:B`.

### Comando 7 — bateria combinada

As quatro falhas foram:

1. `invoice formula mirrors canonical/legacy identity split and resolves friendly display` — a mesma divergencia do comando 5: esperado regex `/'Cartões'!A:B/`; formula contem os intervalos separados `A2:A` e `B2:B`.
2. `createUserSpreadsheetForUser creates spreadsheet and writes headers to every tab` (`tests/userSpreadsheetService.test.js:293`; assercao em `:353`) — `assert.ok(faturas.values[0][0].includes("'Lançamentos Cartão'!A2:J"))` retornou falso.
3. `new user spreadsheets include non-counted example rows for user-filled tabs` (`tests/userSpreadsheetService.test.js:464`; assercao em `:493`) — a mesma expectativa literal por `"'Lançamentos Cartão'!A2:J"` retornou falso.
4. `user spreadsheet card summary tabs are formula-driven from card launches` (`tests/userSpreadsheetService.test.js:517`; assercao em `:524`) — esperado regex `/^=QUERY\(/`; a formula real comeca por `=IFERROR(LET(`.

As falhas sao coerentes entre si: a nova formula de Faturas mudou sua estrutura para `IFERROR(LET(...HSTACK...QUERY...))`, mas quatro assercoes ainda exigem a forma textual anterior ou um intervalo literal que nao aparece mais. Esta validacao read-only nao determina se o defeito esta no contrato dos testes, na formula ou em ambos; apenas demonstra que o SHA imutavel nao satisfaz a bateria exigida.

## Suite ampla proporcional

Nao executada. O manifesto permite uma unica suite ampla somente depois de o candidato estar estavel. Como os comandos 5 e 7 falharam, executa-la violaria a escada de validacao e nao alteraria o veredito.

## Veredito

O SHA alvo nao pode avancar para auditoria como candidato verde enquanto as quatro assercoes causais acima permanecerem divergentes. Nenhuma correcao foi feita nesta tarefa.

VALIDATION_FAIL
