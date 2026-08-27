# Estado — ROAD-K0 Contrato mínimo de convergência semântica

Atualizado em: 2026-08-27
Status: `GO ROAD-K0 — DOCUMENTAL/SEM RUNTIME`
Branch: `chat/financial-roadmap-roadk0-20260827`
Base: fechamento ROAD-00 em `36ae3f29471790f79347ba1068d9be10db84e4c4`
Roadmap canônico: `docs/plans/workstreams/financial-roadmap-canonical.md`

## Objetivo alcançado

Congelar o contrato semântico comum já existente no sistema antes de ROAD-01..04, sem criar um kernel novo e sem alterar runtime.

## Artefatos

- `docs/agent-memory/workstreams/financial-roadmap-roadk0-contract-inventory.md`;
- `docs/specs/financial-semantic-convergence-contract-v1.md`;
- `docs/agent-memory/workstreams/financial-roadmap-roadk0-fixtures.json`;
- `docs/agent-memory/workstreams/financial-roadmap-roadk0-close.md`.

## Decisões canônicas

- `FinancialQueryPlan` normalizado continua IR executável; `FinancialQuerySpec` é governança/aceitação;
- `timeBasis` semântico: `transaction_date | billing_month | due_date | settlement_date | as_of`;
- aliases transitórios: `purchase_date -> transaction_date`, `current_state -> as_of`; `budget_cycle` é período;
- `evidence_state = confirmed | committed | projected | estimated | incomplete | unavailable`;
- `empty`, zero e source unavailable permanecem distintos;
- coverage: `coverage_start`, `coverage_end`, `as_of`, `completeness`, `item_count`;
- provenance e fonte/escopo continuam sob autoridade server-side;
- identidade estável precede labels (`card_id`, event/invoice/schedule/operation ids);
- double-count mínimo congelado para cartão/fatura, transferências, refund, parcelamento, recorrência e import/reconciliation;
- saldo absoluto exige `as_of` + cobertura cumulativa suficiente;
- budget do ciclo não pode usar gasto diário como substituto;
- writer futuro reutiliza `operationKey`, provenance/status/receipt e confirmação quando aplicável, sem implementação neste gate.

## Evidência de escopo

Somente documentação e fixtures foram alteradas. Nenhum arquivo funcional em `src/`, `scripts/`, `tests/` ou configuração foi modificado, nenhum runtime/produção/flag/dado privado foi acessado e nenhuma escrita financeira ocorreu.

O gate exigia revisão independente **se houvesse mudança material de código**. Como não houve, não foi aberta auditoria de código separada para este fechamento documental.

## Gate de saída

ROAD-01..04 agora podem apontar para o mesmo contrato semântico e não precisam inventar IR, base temporal, evidence state, zero/unavailable, identidade ou double-count próprios.

## Próxima ação

Abrir `ROAD-01 — schema/identidade consumer-first` em workstream/branch próprios. A primeira fatia deve ser inventário de consumers por identidade/schema e desenho de migração compatível, antes de qualquer alteração funcional.

## Capacidade

`Chat/Codex -> capacidade atual -> Alto -> ROAD-01 consumer-first, com implementação somente após inventário e testes focais`.
