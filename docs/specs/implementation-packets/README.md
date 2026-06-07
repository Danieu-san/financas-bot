# Financial Query Implementation Packets

Atualizado em: 2026-06-05

## Objetivo

Esta pasta transforma o roadmap da Financial Query Engine em pacotes pequenos
para implementacao em capacidade alta.

Cada pacote deve ser tratado como uma unidade de trabalho. A regra e simples:
nao corrigir frase isolada; migrar o dominio para `query_engine_primary`.

## Referencias obrigatorias

- `docs/specs/financial-query-architecture.md`
- `docs/specs/financial-query-coverage-matrix.md`
- `docs/specs/financial-query-plan-contract.md`
- `docs/specs/financial-query-migration-roadmap.md`
- `docs/audits/financial-query-legacy-map.md`

## Ordem oficial

1. `01-expenses.md`
2. `02-cards-invoices-installments.md`
3. `03-income.md`
4. `04-transfers-reserve.md`
5. `05-budget.md`
6. `06-goals.md`
7. `07-debts.md`
8. `08-bills-due-dates.md`
9. `09-family-scope.md`
10. `10-dashboard-summaries.md`

## Regra de uso

- Os pacotes sao sequenciais por padrao.
- Testes, fixtures e documentacao podem ser preparados em paralelo quando nao
  alterarem contratos compartilhados.
- Cada pacote deve terminar com o dominio em `query_engine_primary` ou com uma
  justificativa explicita de lacuna temporaria.
- Qualquer fallback encontrado deve ser registrado como lacuna de cobertura,
  nao como frase a remendar.

## Checklist global antes de iniciar um pacote

- Confirmar que a pergunta e read-only. Se escreve, apaga, importa, aprova,
  cria ou altera dados, e Command Engine.
- Confirmar que o planner nao recebe `user_id`, `sheet_id`, token, URL privada,
  prompt interno ou linhas cruas.
- Confirmar que Gemini, se usado, retorna somente plano ou texto final sem
  recalcular valores.
- Confirmar que SQLite/read-model e a fonte preferida.
- Confirmar que Google Sheets direto e fallback raro, escopado e observado.

## Checklist global antes de encerrar um pacote

- Planner local cobre as perguntas principais do dominio.
- Query Engine calcula todos os valores finais.
- Response Composer nao recalcula.
- Follow-ups usam apenas contexto seguro.
- Testes cobrem escopo pessoal/familiar quando aplicavel.
- Prompt injection e pedido de dado interno sao bloqueados.
- `docs/audits/financial-query-legacy-map.md` e atualizado quando o status real
  do dominio mudar.
- `npm test` deve ser rodado em pacotes que alterarem codigo. Esta pasta em si
  e apenas documentacao.
