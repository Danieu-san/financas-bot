# Estado — ROAD-K0 Contrato mínimo de convergência semântica

Atualizado em: 2026-08-27
Status: `ROAD-K0 OPEN — NÃO EXECUTADO`
Branch: `chat/financial-roadmap-roadk0-20260827`
Base: fechamento ROAD-00 em `36ae3f29471790f79347ba1068d9be10db84e4c4`
Roadmap canônico: `docs/plans/workstreams/financial-roadmap-canonical.md`

## Objetivo

Congelar o contrato semântico comum já existente no sistema antes de ROAD-01..04, sem criar um kernel novo e sem alterar runtime.

## Dentro do escopo

- inventariar `FinancialQuerySpec/Plan`, semantic facade, adequacy verifier e contratos financeiros já entregues;
- escolher os contratos canônicos para `timeBasis`, `evidence_state`, provenance, coverage, source policy, identidade estável e double-count;
- definir `unavailable` vs `empty` vs `zero`;
- definir `realized` vs `committed/projected`;
- definir contratos de saldo, budget e writer sem implementar writer;
- construir fixtures/contratos de normalização e precedência.

## Fora do escopo

- corrigir código funcional de cartão, saldo, áudio ou schema;
- deploy/restart/flags;
- dados privados/produção;
- migração de planilhas;
- writer real;
- retirada de legado.

## Gate de saída

ROAD-K0 só recebe GO quando ROAD-01..04 puderem referenciar um mesmo contrato semântico sem inventar semântica própria, com testes/fixtures documentais suficientes e revisão independente se houver mudança material de código.

## Próxima ação

Inventariar os contratos existentes e mapear divergências semânticas, somente leitura/documentação.

## Capacidade

`Chat/Codex -> capacidade atual -> Alto -> inventariar e congelar contratos semânticos existentes, sem implementação`.
