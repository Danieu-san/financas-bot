# Read-Model Coverage Audit

## Direction Marker
Destination: personal finance operating system.

Path: reliable data-driven core first, then expand surfaces and automation.

This audit maps analytical questions to the cheapest safe data path available today.

## Summary
The common finance questions are mostly covered by SQLite through `queryAnalyticalIntentSql()` and dashboard query helpers. The remaining gaps are not blocking, but they matter for cost and latency because they either use the in-memory read-model fallback or eventually fall back to broader Sheets/AI paths.

## Analytical Intent Matrix
| Intent | Example question | Primary path | Fallback path | Status | Notes |
|---|---|---|---|---|---|
| `saldo_do_mes` | `qual meu saldo de março?` | SQLite | In-memory read-model | Covered | Uses entries minus expenses plus card charges, scoped by `user_id`. |
| `total_gastos_mes` | `quanto gastei em fevereiro?` | SQLite | In-memory read-model | Covered | Includes `Saídas` and card expenses. |
| `total_gastos_categoria_mes` | `quanto gastei com alimentação?` | SQLite | In-memory read-model | Covered | Matches category, subcategory, and description. |
| `media_gastos_categoria_mes` | `qual minha média com mercado?` | SQLite | In-memory read-model | Covered | SQLite computes from filtered expense rows. |
| `listagem_gastos_categoria` | `liste meus gastos com transporte` | SQLite | In-memory read-model | Covered | SQLite limits list to 100 rows. |
| `maior_menor_gasto` | `qual meu maior gasto?` | SQLite | In-memory read-model | Covered | Uses expenses table only, already includes card source rows. |
| `contagem_ocorrencias` | `quantas vezes pedi ifood?` | In-memory read-model | Legacy calculation | Partial | Should move to SQLite to avoid memory fallback for larger datasets. |
| `gastos_valores_duplicados` | `tenho gastos duplicados?` | In-memory read-model | Legacy calculation | Partial | Should move to SQLite grouping by rounded value. |
| `pergunta_geral` | `como melhorar meu orçamento?` | AI language fallback | None | Intentional | Should receive summarized context only, not raw tabs. |

## Dashboard API Coverage
| Endpoint/data | Primary path | Status | Notes |
|---|---|---|---|
| KPIs | SQLite `queryKpis()` | Covered | Scoped by token `user_id`. |
| Top categories | SQLite `queryTopCategories()` | Covered | Uses expenses table, includes card charges. |
| Cashflow | SQLite `queryCashflow()` | Covered | Daily entry/expense aggregation. |
| Debts | SQLite `queryDebts()` | Covered | Scoped by `user_id`; status filtering also used in alerts/KPIs. |
| Goals | SQLite `queryGoals()` | Covered | Scoped by `user_id`. |
| Recent transactions | SQLite `queryRecentTransactions()` | Covered | Entries + expenses for selected period. |
| Alerts | SQLite `queryAlerts()` | Basic | Currently only negative cashflow and high debt load. |
| Summary | SQLite aggregation via dashboard service | Covered | Uses the endpoint helpers above. |

## Cost And Latency Implications
- Best path: local classifier plus SQLite query. This avoids Gemini and avoids reading full Sheets tabs.
- Acceptable fallback: in-memory read-model after scheduled sync. This avoids Gemini but can grow in memory cost.
- Expensive path: classification/generation through Gemini with broad context. This should be reserved for ambiguous natural language or advisory responses.
- Risk path: full Sheets reads in a user request. This should shrink over time as read-model tests expand.

## Gaps To Close Next
1. Move `contagem_ocorrencias` to SQLite.
2. Move `gastos_valores_duplicados` to SQLite.
3. Add regression tests proving common intents do not call Gemini or full Sheets reads.
4. Add routing metrics that explicitly say `sqlite_hit`, `memory_fallback`, `sheets_fallback`, or `ai_fallback`.
5. Keep `pergunta_geral` as AI-backed, but only with summarized context.

## Acceptance For Phase 3.1
- Supported analytical intents are mapped.
- AI/raw-data fallbacks are identified.
- Missing common query coverage is explicit.
