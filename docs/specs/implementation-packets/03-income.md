# Packet 03 - Income

## Objetivo

Migrar entradas para `query_engine_primary`, cobrindo salario, renda extra,
rendimentos, fontes de renda, recorrencia, ranking, comparacao e evolucao.

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

## O que nao pode mudar

- Registrar entrada continua Command Engine.
- Transferencias internas, resgate de caixinha e pagamento de fatura nao podem
  inflar renda real.
- Nao pedir que Gemini decida se algo e salario com acesso a dados crus.
- Nao alterar formato de planilha para entradas neste pacote.

## Criterios de aceite

- Perguntas de renda geram `domain=income`.
- Totais de entradas reais excluem transferencias e reserva quando a pergunta
  for sobre renda.
- Ranking de fontes e comparacao mensal sao deterministicos.
- Ambiguidade em "dinheiro que entrou" e esclarecida quando reserva ou
  transferencia mudarem o resultado.

## Testes obrigatorios

- Total recebido no mes.
- Salario separado de renda extra.
- Ranking de fontes.
- Comparacao com mes anterior.
- Entrada recorrente detectada sem criar regra automaticamente.
- Seguranca contra pedido de renda de outro usuario.

## Perguntas de validacao

- `quanto recebi esse mes?`
- `quanto recebi de salario?`
- `qual minha maior fonte de renda?`
- `quanto tive de renda extra?`
- `minhas entradas aumentaram em relacao ao mes passado?`

## Riscos

- Resgate de reserva virar renda.
- Transferencia entre contas virar salario.
- Gemini gerar explicacao que altera o criterio do calculo.

## Criterio de pronto

Entradas sao respondidas pela Query Engine, separando renda real de movimentos
internos e preservando escopo.
