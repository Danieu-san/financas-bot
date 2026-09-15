# FIN-ROAD01-STATE-BASELINE-DIAG-20260828 — brief sanitizado

## Objetivo único

Classificar causalmente a única falha da suíte ampla da revalidação ROAD-01.2 sem editar produto: comparar o mesmo preteste de state store no base do recovery e no candidato validado.

## Hashes imutáveis

- Base: `09a6cceb394157153516a4f8393267e47ed66a06`
- Candidato ROAD-01.2: `d2e3e17caae79577b6c8736780d809a36d2a0f31`
- Branch de origem: `chat/financial-roadmap-road01-20260827`

## Evidência já confirmada no GitHub

Os arquivos diretamente envolvidos têm blobs idênticos nos dois hashes:

- `src/state/userStateManager.js`: `442857d58977b64ae7f0c3a8f9e6385549db049d`
- `tests/userStateSnapshotSecurity.test.js`: `5dcefe7d6988f404f026d8801c2557d9131f66d6`

`package.json` executa `test:state-store-security` como primeiro passo de `pretest:unit`, antes da bateria principal.

Na revalidação do candidato, `npm run test:unit` falhou no primeiro preteste: 14 testes, 9 PASS, 5 FAIL, com exemplo `restore physically compacts expired entries immediately` falhando em `state_store_persist_failed`. Os nove checks específicos do ROAD-01 passaram, incluindo 7/7 causais, 233/233 combinados, `git diff --check` e `validateAgentWorkflow.js`.

## Execução permitida

1. Use duas worktrees detached, limpas e separadas, uma em cada hash imutável.
2. Registre `node -v`, `process.platform` e `process.arch` uma vez.
3. Execute exatamente uma vez em cada hash:
   `npm run test:state-store-security`
4. Capture para cada hash: exit code, total/pass/fail, nomes dos testes falhos e a primeira cadeia de erro relevante.
5. Compare os resultados.
6. Confirme `git status --short` vazio nas duas worktrees.

Não execute `npm run test:unit` novamente. Não rode nenhuma outra suíte ampla. Não corrija a falha.

## Classificação terminal

- `BASELINE_FAILURE_CONFIRMED`: base e candidato falham causalmente da mesma forma no mesmo preteste.
- `CANDIDATE_REGRESSION`: base passa e candidato falha, ou a falha do candidato diverge materialmente de modo atribuível ao candidato.
- `DIAG_INCONCLUSIVE`: não foi possível obter comparação técnica equivalente.

## Proibições

- nenhuma edição de código, teste, doc ou configuração de produto;
- sem commit/push/add;
- sem produção, OCI/SSH, WhatsApp, Google Sheets, Pluggy, navegador, segredos, `.env` ou dados privados;
- sem alteração adicional da ponte/wake, ACL, Scheduled Task ou ProgramData nesta tarefa;
- sem deploy/restart/flags/backfill/migração;
- apenas o result file autorizado pode ser publicado.
