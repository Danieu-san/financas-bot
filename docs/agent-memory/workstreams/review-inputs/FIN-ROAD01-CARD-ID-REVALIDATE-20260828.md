# FIN-ROAD01-CARD-ID-REVALIDATE-20260828 — brief sanitizado

## Objetivo

Validar, sem editar, o candidato ROAD-01.2 atual no SHA imutável `d2e3e17caae79577b6c8736780d809a36d2a0f31` da branch `chat/financial-roadmap-road01-20260827`.

O SHA anterior `e4bfe14b9e436c70b6f4ef08a347de2b4c718af0` falhou apenas porque quatro asserções ainda codificavam a forma textual antiga da fórmula de `Faturas`. O Chat corrigiu somente os testes, em dois commits consecutivos:

- `b40effbf3f3fc806d6a9719d3ef54d63ffd8e195` — ajusta a asserção do teste focal para os intervalos atuais `Cartões!A2:A` e `Cartões!B2:B`, mantendo a prova de `FILTER`, identidade canônica/legacy e agrupamento;
- `d2e3e17caae79577b6c8736780d809a36d2a0f31` — substitui três expectativas textuais obsoletas em `tests/userSpreadsheetService.test.js` por verificações da estrutura semântica atual de `Faturas`.

Nenhum código de produção foi alterado depois de `e4bfe14b9e436c70b6f4ef08a347de2b4c718af0`.

## Restrições

- tarefa exclusivamente read-only;
- não modificar código, testes, documentação, configuração ou task files;
- não fazer commit, push, deploy, restart, mudança de flag ou migração;
- não acessar Google Sheets real, WhatsApp real, Pluggy, OCI, segredos, `.env`, sessões ou dados privados;
- se o SHA não estiver presente localmente, é permitido no máximo um fetch read-only da branch `chat/financial-roadmap-road01-20260827`, sem alterar a branch de produto;
- terminar com worktree limpa.

## Validação obrigatória

No SHA exato `d2e3e17caae79577b6c8736780d809a36d2a0f31`:

1. `node --check src/services/cardInvoiceSummaryService.js`
2. `node --check src/services/userSpreadsheetService.js`
3. `node --check src/services/google.js`
4. `node --check src/handlers/messageHandler.js`
5. `node --test tests/road01CardIdentity.test.js`
6. `node --test --test-force-exit --test-name-pattern 'card writes preserve|google user spreadsheet mapping' tests/unit.test.js`
7. `node --test --test-force-exit tests/userSpreadsheetService.test.js tests/unit.test.js tests/road01CardIdentity.test.js`
8. `git diff --check 09a6cceb394157153516a4f8393267e47ed66a06...d2e3e17caae79577b6c8736780d809a36d2a0f31`
9. `node scripts/agent/validateAgentWorkflow.js`

Somente se todos os itens acima passarem e o candidato estiver estável, execute uma única suíte ampla proporcional conforme `AGENTS.md`.

## Relatório

Escrever somente `docs/agent-memory/workstreams/results/FIN-ROAD01-CARD-ID-REVALIDATE-20260828.md`, contendo:

- SHA realmente validado;
- cada comando e PASS/FAIL;
- contagens de testes;
- eventual erro integral relevante;
- confirmação de worktree limpa;
- se houve ou não qualquer alteração fora do relatório;
- conclusão exatamente `VALIDATION_PASS` ou `VALIDATION_FAIL`.

Se algo falhar, não corrigir: reportar a cadeia causal observável e parar.
