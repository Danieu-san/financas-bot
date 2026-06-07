# Packet 01 - Expenses

## Objetivo

Migrar perguntas de gastos para `query_engine_primary`, cobrindo total,
contagem, lista, detalhe, ranking, percentual, maior/menor, media, comparacao,
evolucao, explicacao e follow-ups.

## Referencias

- `docs/specs/financial-query-architecture.md`
- `docs/specs/financial-query-coverage-matrix.md`
- `docs/specs/financial-query-plan-contract.md`
- `docs/specs/financial-query-migration-roadmap.md`
- `docs/audits/financial-query-legacy-map.md`

## Arquivos provaveis

- `src/query/financialQueryPlan.js`
- `src/query/financialQueryEngine.js`
- `src/handlers/messageHandler.js`
- `src/services/calculationOrchestrator.js`
- `src/services/readModelService.js`
- `tests/unit.test.js`
- `tests/readModelSqlite.test.js`
- `tests/financialExplainability.test.js`

## O que nao pode mudar

- Registrar gasto, apagar gasto, importar extrato, onboarding, OAuth e comandos
  admin continuam fora da Query Engine.
- Nao enviar planilha inteira ao Gemini.
- Nao permitir `user_id`, `sheet_id`, token, URL privada ou prompt interno no
  planner.
- Nao mudar o schema da planilha real para concluir este pacote.
- Nao trocar criterio temporal sem avisar na resposta.

## Criterios de aceite

- Perguntas de gastos comuns geram `FinancialQueryPlan` com `domain=expenses`.
- Total, detalhe, categoria, estabelecimento, percentual, maior/menor e media
  sao calculados pela Query Engine.
- Cartoes entram no total quando a pergunta pedir gasto geral.
- A resposta informa se usou data da compra ou mes da fatura.
- Fallback legado de gastos fica removido ou isolado apos paridade.

## Status local em 2026-06-05

- Implementado: `total`, `detail`, `rank`, `percentage`, `average`,
  `extreme`, `compare` e `trend` para gastos comuns passam por
  `FinancialQueryPlan` + `executeFinancialQuery`.
- Implementado: perguntas de evolucao como `como meus gastos evoluiram nos
  ultimos meses?` geram `domain=expenses`, `operation=trend`,
  `timeBasis=billing_month` e serie mensal calculada deterministicamente pela
  Query Engine.
- Implementado: respostas com cartao no total por `billing_month` avisam que
  cartoes entram pelo mes de cobranca/fatura, nao necessariamente pela data da
  compra.
- Lacuna aceita deste pacote: usuarios em planilha pessoal ainda podem cair no
  fallback escopado de Google Sheets quando o caminho SQLite/read-model nao
  cobre ou nao esta sincronizado. O caminho e medido por logs/metricas
  `analysis_source=personal_sheet` e `analysis_source=sheets_fallback`; nao
  envia dados crus ao Gemini, nao muda schema e preserva filtros de escopo
  pessoal/familiar. A migracao do read-model para planilhas pessoais fica para
  pacote proprio antes de remover o fallback.

## Testes obrigatorios

- Planner local para total, detalhe, categoria, estabelecimento e follow-up.
- Query Engine com saidas, cartoes, filtros combinados e fuzzy leve.
- SQLite/read-model como fonte preferida quando disponivel; planilha pessoal
  permanece fallback Sheets escopado e observado ate migracao propria.
- Seguranca contra pedido de IDs internos ou dados de outro usuario.
- Regressao para pergunta de explicacao do total.
- Trend/evolucao mensal por `billing_month`.

## Perguntas de validacao

- `quanto gastei esse mes?`
- `detalhe os gastos pra mim`
- `me explica de onde veio esse total`
- `quanto alimentacao representa do total?`
- `qual foi meu maior gasto esse mes?`
- `foram em quais estabelecimentos?`
- `e por categoria?`

## Riscos

- Misturar data da compra com mes da fatura.
- Calcular percentual sobre subconjunto errado.
- Manter caminho antigo no `calculationOrchestrator`.
- Criar nova regra por frase em vez de ampliar dominio/operacao/filtro.

## Criterio de pronto

O dominio de gastos e `query_engine_primary`, com testes cobrindo as perguntas
acima e sem Gemini calculando valores.
