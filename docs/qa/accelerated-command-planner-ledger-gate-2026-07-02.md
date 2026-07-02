# Gate acelerado: Command Planner e ledger canonico - 2026-07-02

## Decisao

`GO` para encerrar o gate de evidencia acelerada da etapa atual e continuar o
roadmap. Este GO nao autoriza `route` global, `INTERPRETATION_RELIABILITY_MODE=enforce`,
novos dominios de leitura canonica ou remocao imediata do legado.

## Evidencia gerada

- bateria focada planner/estado/ledger/agente: `232/232`;
- Command Planner offline: `11/11`, zero gaps, zero chamadas Gemini;
- Command Planner live: `11/11`, zero gaps, 11 chamadas sob teto rigido;
- dry-run do ledger: 15 eventos, zero diferencas, `privacy_ok=true`;
- suite final depois das correcoes: `640/640`;
- `npm audit --audit-level=high`: zero vulnerabilidades;
- `git diff --check` e scan NUL: sem erro.

## E2E de producao

Foram executados cancelamento e confirmacao para `bill.pay`, `debt.pay`,
`invoice.pay` e `expense.create`, com fixtures marker-only isoladas. A verificacao
remota confirmou:

- divida atualizada uma vez;
- pagamento de fatura somente em `Transferencias`, sem duplicar gasto;
- gasto comum em `Saidas`, recorrente falso e elegivel ao orcamento livre;
- pagamento de conta recorrente em `Saidas`, `Recorrente=SIM` e fora do
  orcamento livre;
- quatro cancelamentos sem escrita;
- cleanup repetido com zero linhas restantes.

A telemetria sanitizada da rodada principal registrou 16 eventos: duas rotas por
operacao, quatro `saved`, quatro `cancelled`, zero erro, zero severidade critica,
zero registro invalido e zero campo sensivel. Latencias: planner p95 `5583 ms` e
handler p95 `1460 ms`, abaixo dos limites de `15000 ms` e `30000 ms`.

## Defeito encontrado e corrigido

A auditoria adversarial encontrou `created_at=1970-01-01` nos recibos reais do
ledger shadow. A causa era o timestamp deterministico do projetor de dry-run
sendo preservado pelo adaptador de recibos. O commit `6377747` passou a usar o
`updatedAt/createdAt` estavel do Financial Write Ledger.

Smoke marker-only posterior comprovou:

- `created_at=2026-07-02T12:07:33.500Z`, correspondente a `09:07:33` em
  `America/Sao_Paulo`;
- `kind=bill_payment`;
- `free_budget_eligible=0`;
- data financeira `2026-07-02` preservada.

## Limpeza e estado final

- Sheets: todos os marcadores removidos, segunda limpeza retornou zero;
- ledger shadow: zero eventos depois da limpeza;
- backups SQLite criados antes de cada exclusao marker-only;
- `state_store.json`: JSON valido, zero chaves, 2 bytes;
- PM2 online, WhatsApp pronto, dashboard/SQLite saudaveis;
- flags preservadas: Gemini Planner ativo, Command Planner em `canary`,
  Interpretation Reliability em `shadow` e leitura canonica somente em
  `transactions`.
