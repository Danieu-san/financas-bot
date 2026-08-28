# FIN-ROAD01-CARD-ID-VALIDATE-20260828 — validação mecânica read-only

## Alvo imutável

Repositório: `Danieu-san/financas-bot`
Branch de produto: `chat/financial-roadmap-road01-20260827`
SHA a validar: `e4bfe14b9e436c70b6f4ef08a347de2b4c718af0`
Base de comparação da fatia: `09a6cceb394157153516a4f8393267e47ed66a06`

## Objetivo único

Validar mecanicamente o candidato ROAD-01.2 atual. Não implementar, não corrigir, não refatorar e não redesenhar nada.

Se o objeto do SHA alvo não estiver disponível localmente, é permitido executar **somente** um fetch read-only da branch exata `chat/financial-roadmap-road01-20260827` para obtê-lo. Push é proibido.

Use checkout/worktree temporária detached no SHA alvo se necessário para garantir que todos os comandos rodem exatamente sobre o commit imutável. A worktree do repositório usada pelo canal não pode terminar modificada.

## Validações obrigatórias

Executar e registrar PASS/FAIL, saída relevante e contagem quando aplicável:

1. `node --check src/services/cardInvoiceSummaryService.js`
2. `node --check src/services/userSpreadsheetService.js`
3. `node --check src/services/google.js`
4. `node --check src/handlers/messageHandler.js`
5. `node --test tests/road01CardIdentity.test.js`
6. `node --test --test-force-exit --test-name-pattern 'card writes preserve|google user spreadsheet mapping' tests/unit.test.js`
7. `node --test --test-force-exit tests/userSpreadsheetService.test.js tests/unit.test.js tests/road01CardIdentity.test.js`
8. `git diff --check 09a6cceb394157153516a4f8393267e47ed66a06..e4bfe14b9e436c70b6f4ef08a347de2b4c718af0`
9. `node scripts/agent/validateAgentWorkflow.js`

Depois, apenas se tudo acima estiver estável, execute **uma única suíte ampla proporcional** prevista por `AGENTS.md` e `package.json`. Não repita suíte ampla.

## Regras de interpretação

- Não trate testes do candidato antigo `fe39d8c57a7907da02282035130aa1fe4f56b47c` como prova do SHA atual.
- Não altere código para fazer teste passar.
- Se qualquer teste falhar, preserve o erro observado e termine `VALIDATION_FAIL`.
- Se `validateAgentWorkflow.js` falhar por condição preexistente não causada pelo diff, registre isso separadamente, mas ainda termine `VALIDATION_FAIL`; o Chat decidirá materialidade.
- Se o SHA alvo não puder ser obtido de forma determinística, termine `VALIDATION_FAIL`.

## Proibições

- sem edição de código, testes, docs ou configuração;
- sem `git add`, commit ou push;
- sem deploy, restart ou flags;
- sem OCI/SSH;
- sem Google Sheets, WhatsApp ou Pluggy reais;
- sem `.env`, segredos, sessões ou dados privados;
- sem migração/backfill;
- sem auditoria de mérito: esta tarefa apenas executa a validação.

## Relatório obrigatório

Escrever somente em:
`docs/agent-memory/workstreams/results/FIN-ROAD01-CARD-ID-VALIDATE-20260828.md`

O relatório deve conter:
- SHA efetivamente validado;
- como o SHA foi obtido localmente;
- cada comando executado;
- PASS/FAIL;
- contagens de testes;
- erro integral relevante em caso de falha;
- suíte ampla executada, se houver;
- confirmação de worktree limpa ao final;
- nenhuma alteração fora do próprio result file.

Terminar exatamente com uma destas linhas:

`VALIDATION_PASS`

ou

`VALIDATION_FAIL`
