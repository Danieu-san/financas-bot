# Packet 07 - Debts

## Objetivo

Migrar dividas para `query_engine_primary`, cobrindo saldo, vencimentos,
parcelas, pagamentos, progresso de quitacao e recomendacoes read-only de
priorizacao.

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
- `src/services/debtAvalancheService.js`
- `tests/unit.test.js`
- `tests/readModelSqlite.test.js`
- `tests/financialExplainability.test.js`

## O que nao pode mudar

- Criar divida e registrar pagamento continuam Command Engine.
- Recomendacao nao pode parecer garantia financeira absoluta.
- Nao contar pagamento futuro como pago.
- Nao expor divida de outro usuario ou membro sem escopo.
- Nao mudar scheduler de lembretes neste pacote.

## Criterios de aceite

- Perguntas de dividas geram `domain=debts`.
- Saldos, parcelas e vencimentos sao calculados deterministicamente.
- Recomendacoes explicam criterio usado: juros, vencimento, saldo ou atraso.
- Perguntas de escrita sao separadas das consultas.

## Testes obrigatorios

- Divida sem pagamento.
- Divida com pagamento parcial.
- Divida quitada.
- Vencimentos proximos e atrasados.
- Ranking por juros, vencimento e saldo.
- Prompt injection pedindo divida de outro usuario.

## Perguntas de validacao

- `quanto devo no total?`
- `quais dividas vencem nos proximos dias?`
- `quanto falta quitar da divida do banco?`
- `qual divida eu deveria priorizar?`
- `qual parcela vence este mes?`

## Riscos

- Misturar consulta com comando de pagamento.
- Aconselhamento financeiro sem criterio.
- Saldo incorreto por pagamento parcial.

## Criterio de pronto

Dividas sao consultadas pela Query Engine, com criterio auditavel e comandos de
escrita preservados fora dela.
