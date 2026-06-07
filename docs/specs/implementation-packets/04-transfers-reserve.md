# Packet 04 - Transfers, Caixinha and Reserve

## Objetivo

Migrar transferencias, caixinha e reserva para `query_engine_primary`, cobrindo
transferencias internas, pagamento de fatura, reserva aplicada, reserva
resgatada e disponivel estimado.

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
- `src/services/userSheetAnalyticsService.js`
- `tests/unit.test.js`
- `tests/readModelSqlite.test.js`
- `tests/financialExplainability.test.js`

## O que nao pode mudar

- Importacao de extrato continua fora da Query Engine.
- Regras de escrita em `Transferencias` continuam Command Engine.
- Nao transformar pagamento de fatura em gasto duplicado.
- Nao transformar reserva aplicada/resgatada em renda ou despesa.
- Nao expor dados de membro familiar sem escopo autorizado.

## Criterios de aceite

- Perguntas de transferencia/reserva geram `domain=transfers`.
- Disponivel estimado e explicado como saldo economico ajustado por reserva
  liquida.
- Pagamento de fatura e tratado como movimento interno/financeiro, nao consumo.
- Transferencias entre membros autorizados respeitam escopo familiar.

## Testes obrigatorios

- Aplicacao e resgate no mesmo periodo.
- Transferencia entre contas proprias.
- Transferencia para membro da familia.
- Pagamento de fatura.
- Pergunta de disponivel estimado.
- Seguranca para usuario fora do vinculo familiar.

## Perguntas de validacao

- `quanto esta realmente disponivel considerando a caixinha?`
- `quanto mandei para a caixinha esse mes?`
- `quanto resgatei da reserva?`
- `essa transferencia para thais foi gasto?`
- `quanto paguei de fatura esse mes?`

## Riscos

- Ocultar salario porque ele foi transferido automaticamente.
- Distorcer dashboard por contar caixinha como entrada.
- Vazamento familiar em transferencias por nome.

## Criterio de pronto

Transferencias e reserva sao calculadas pela Query Engine, com explicacao clara
de saldo economico, disponivel estimado e movimentos internos.
