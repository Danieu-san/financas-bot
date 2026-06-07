# Packet 06 - Goals

## Objetivo

Migrar metas para `query_engine_primary`, cobrindo listagem, progresso,
faltante, historico, status, metas pessoais e metas familiares.

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
- `src/services/goalService.js`
- `tests/unit.test.js`
- `tests/readModelSqlite.test.js`

## O que nao pode mudar

- Criar, pausar, retomar, ajustar, cancelar, concluir, aportar ou retirar meta
  continua Command Engine.
- Metas pausadas/canceladas nao podem aparecer como progresso ativo.
- Planner nao pode receber IDs internos de meta ou usuario.
- Nao alterar a aba `Movimentacoes Metas` sem necessidade.

## Criterios de aceite

- Perguntas de metas geram `domain=goals`.
- Resposta distingue ativa, pausada, cancelada e concluida.
- Progresso e faltante usam movimentacoes auditaveis.
- Metas familiares respeitam escopo familiar.
- Pergunta ambigua entre consulta e comando pede esclarecimento ou vai para o
  fluxo correto.

## Testes obrigatorios

- Meta pessoal e familiar.
- Aporte, retirada e ajuste historico.
- Meta pausada, cancelada e concluida.
- Pergunta de progresso e pergunta de faltante.
- Seguranca para membro sem vinculo.

## Perguntas de validacao

- `liste minhas metas`
- `quanto falta para bater minhas metas?`
- `qual o progresso da meta reserva?`
- `mostre o historico da meta reserva`
- `quais metas familiares temos?`

## Riscos

- Misturar consulta com comando de retirada.
- Mostrar meta familiar para usuario fora do vinculo.
- Contar status encerrado como ativo.

## Criterio de pronto

Metas sao consultadas pela Query Engine, com historico e status corretos, sem
escrever dados.
