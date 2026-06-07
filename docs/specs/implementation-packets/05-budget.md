# Packet 05 - Budget

## Objetivo

Migrar orcamento mensal livre para `query_engine_primary`, cobrindo ciclo,
gasto livre, ritmo diario, restante, escopo pessoal/familiar, alertas e
explicacao do que entrou no calculo.

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
- `tests/dashboardApiContracts.test.js`

## O que nao pode mudar

- Definir, alterar ou desativar orcamento continua Command Engine.
- Orcamento nao deve usar mes calendario quando o usuario configurou ciclo.
- Compras parceladas devem seguir a regra atual de competencia/vencimento no
  orcamento, nao data da compra.
- Nao recalcular valores no Response Composer.
- Nao mudar onboarding neste pacote.

## Criterios de aceite

- Perguntas de orcamento geram `domain=budget`.
- Resposta mostra ciclo, gasto do ciclo, gasto de hoje, ritmo diario e restante.
- Escopo pessoal/familiar aparece quando relevante.
- Pergunta de explicacao lista criterios e bases temporais.
- Dashboard e WhatsApp usam o mesmo criterio para orcamento.

## Testes obrigatorios

- Ciclo cruzando meses.
- Dia inicial 1, 28, 30 e 31.
- Orcamento pessoal e familiar.
- Compra no cartao parcelada dentro/fora do ciclo.
- Dia atual diferente de data do lancamento.
- Prompt injection junto de pergunta de orcamento.

## Perguntas de validacao

- `quanto posso gastar hoje?`
- `quanto ja usei do orcamento?`
- `o que entrou nesse calculo?`
- `qual meu ritmo diario?`
- `quanto falta ate o fim do ciclo?`

## Riscos

- Gasto de ontem aparecer como hoje.
- Ritmo diario nao recalcular na virada do dia.
- Familia ativa sem escopo claro.
- Misturar fatura e compra no mesmo calculo.

## Criterio de pronto

Orcamento e respondido pela Query Engine com ciclo explicito, escopo correto e
paridade com dashboard.
