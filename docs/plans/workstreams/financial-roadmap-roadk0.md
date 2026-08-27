# Plano — ROAD-K0 Contrato mínimo de convergência semântica

Status: `OPEN — SOMENTE CONTRATO/BASELINE SEMÂNTICO`
Data: 2026-08-27
Branch: `chat/financial-roadmap-roadk0-20260827`
Roadmap canônico: `docs/plans/workstreams/financial-roadmap-canonical.md`

## Objetivo

Congelar a linguagem financeira comum antes de ROAD-01..04, reaproveitando contratos já entregues e impedindo que cada correção crie uma semântica própria.

## Contratos mínimos

- IR/`FinancialQuerySpec` existente, sem segunda IR;
- `timeBasis = transaction_date | billing_month | due_date | settlement_date | as_of`;
- `evidence_state = confirmed | committed | projected | estimated | incomplete | unavailable`;
- provenance por campo/evento;
- cobertura `coverage_start`, `coverage_end`, `as_of`, `completeness`;
- source policy por domínio;
- regra de dupla contagem;
- identidade estável de entidade;
- cálculo determinístico fora do LLM.

## Etapas

1. inventariar contratos existentes e seus consumers;
2. escolher a representação canônica, sem reconstrução greenfield;
3. documentar precedência por domínio e por evidence state;
4. congelar `unavailable` vs `empty` vs `zero`;
5. congelar `realized` vs `committed/projected`;
6. definir contratos de saldo e budget;
7. definir contrato de writer, sem implementá-lo;
8. criar fixtures de serialização/normalização/precedência/double-count.

## Gate de saída

ROAD-K0 recebe GO quando ROAD-01..04 puderem apontar para o mesmo contrato semântico comum e não precisarem inventar regras locais conflitantes.

## Não escopo

Nenhuma mudança de runtime, produção, flag, dado privado, schema real, writer, áudio, Atacadão ou retirada de legado.
