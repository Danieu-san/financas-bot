# FIN-ROAD01-STATE-BASELINE-DIAG-20260828

## Ambiente e isolamento

- Node: `v22.17.0`.
- Plataforma: `win32`.
- Arquitetura: `x64`.
- Base: worktree detached e limpa em `09a6cceb394157153516a4f8393267e47ed66a06`.
- Candidato: worktree detached e limpa em `d2e3e17caae79577b6c8736780d809a36d2a0f31`.
- `git status --short` terminou vazio nas duas worktrees.
- Nenhum codigo, teste, documento ou configuracao de produto foi alterado.

## Execucao unica por hash

### Base `09a6cceb394157153516a4f8393267e47ed66a06`

- Comando, executado exatamente uma vez nesta tarefa: `npm run test:state-store-security`.
- Exit code: `0`.
- Total: 14.
- Passaram: 14.
- Falharam: 0.
- Testes falhos: nenhum.
- Primeira cadeia de erro relevante: nenhuma falha de teste. As mensagens sanitizadas `file_persist_failed` e `file_restore_failed` emitidas durante os cenarios negativos esperados nao produziram `not ok` e a suite terminou verde.

### Candidato `d2e3e17caae79577b6c8736780d809a36d2a0f31`

- Comando, executado exatamente uma vez nesta tarefa: `npm run test:state-store-security`.
- Exit code: `0`.
- Total: 14.
- Passaram: 14.
- Falharam: 0.
- Testes falhos: nenhum.
- Primeira cadeia de erro relevante: nenhuma falha de teste. As mesmas mensagens sanitizadas dos cenarios negativos esperados nao produziram `not ok` e a suite terminou verde.

## Comparacao causal

Os dois hashes produziram resultados tecnicamente equivalentes: `14/14`, zero falhas e exit code `0`. Portanto:

- nao ha evidencia de `CANDIDATE_REGRESSION`;
- nao e possivel declarar `BASELINE_FAILURE_CONFIRMED`, pois a falha ampla anterior nao se reproduziu nem no base nem no candidato;
- o `state_store_persist_failed` observado anteriormente foi transitorio ou dependente do contexto daquela execucao ampla, mas esta comparacao unica nao identifica sua causa.

Pelo contrato terminal do manifesto, a classificacao correta e inconclusiva, apesar de excluir regressao reproduzivel do candidato nesta bateria.

DIAG_INCONCLUSIVE
