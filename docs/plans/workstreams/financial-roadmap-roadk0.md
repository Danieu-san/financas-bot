# Plano — ROAD-K0 Contrato mínimo de convergência semântica

Status: `GO — CONTRATO CONGELADO, SEM RUNTIME`
Data: 2026-08-27
Branch: `chat/financial-roadmap-roadk0-20260827`
Roadmap canônico: `docs/plans/workstreams/financial-roadmap-canonical.md`
Contrato congelado: `docs/specs/financial-semantic-convergence-contract-v1.md`

## Objetivo

Congelar a linguagem financeira comum antes de ROAD-01..04, reaproveitando contratos já entregues e impedindo que cada correção crie uma semântica própria.

## Contratos fechados

- IR executável: `FinancialQueryPlan` normalizado; `FinancialQuerySpec` permanece governança/aceitação;
- `timeBasis = transaction_date | billing_month | due_date | settlement_date | as_of`;
- `evidence_state = confirmed | committed | projected | estimated | incomplete | unavailable`;
- provenance por afirmação/leitura sob autoridade server-side;
- coverage `coverage_start`, `coverage_end`, `as_of`, `completeness`, `item_count`;
- source policy por domínio;
- regra mínima de dupla contagem;
- identidade estável de entidade;
- cálculo determinístico fora do LLM;
- writer futuro com operation key/provenance/status/receipt, sem implementação.

## Compatibilidade transitória

- `purchase_date -> transaction_date` para compra;
- `current_state -> as_of`;
- `budget_cycle` é janela de período;
- `context/none` devem ser resolvidos antes da resposta quando material.

## Gate de saída

`SATISFIED`: ROAD-01..04 podem referenciar um único contrato semântico comum e não precisam inventar regras locais conflitantes.

Não houve mudança material de código; por isso a condição de revisão independente de código deste gate não foi acionada.

## Não escopo preservado

Nenhuma mudança de runtime, produção, flag, dado privado, schema real, writer, áudio, Atacadão ou retirada de legado.

## Próximo gate

`ROAD-01 — schema/identidade consumer-first`.
