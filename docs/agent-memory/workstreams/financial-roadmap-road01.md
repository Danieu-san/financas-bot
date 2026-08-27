# Estado — ROAD-01 Schema e identidade consumer-first

Atualizado em: 2026-08-27
Status: `ROAD-01 OPEN — INVENTÁRIO/PLANO PRIMEIRO`
Branch: `chat/financial-roadmap-road01-20260827`
Base: ROAD-K0 GO em `9ea7906e16c0639681e9cf9437bcef8a9ef92eda`
Contrato semântico: `docs/specs/financial-semantic-convergence-contract-v1.md`
Roadmap canônico: `docs/plans/workstreams/financial-roadmap-canonical.md`

## Objetivo

Convergir schema e identidade por consumer, preservando compatibilidade e evitando migração ampla sem necessidade. A primeira fatia é somente inventário dos leitores/escritores e desenho de migração.

## Dentro do escopo inicial

- mapear todos os consumers de `Saídas`, `Entradas`, `Lançamentos Cartão`, `Cartões`, `Contas Financeiras`, `Contas` e abas-resumo relacionadas;
- mapear identidade de cartão (`card_id` vs labels/legacy sheet names);
- mapear ranges/índices antigos e atuais, incluindo `Conta Financeira` e subcategoria;
- mapear recorrências com `user_id` ausente sem afrouxar autorização;
- mapear timezone/template/planilha real como contratos distintos;
- propor migração consumer-first e testes de compatibilidade antes de editar runtime.

## Fora do escopo inicial

- migração real de planilhas;
- backfill em dados privados;
- deploy/restart/flags;
- mudança de fechamento/fatura/parcelas (ROAD-02);
- correção de saldo/budget (ROAD-03A);
- áudio (ROAD-AUDIO-01);
- onboarding Pluggy/Atacadão (ROAD-04C);
- retirada de legado.

## Gate para primeira implementação

Nenhum código funcional será alterado até existir inventário versionado `consumer -> range/schema -> identidade -> fallback -> risco -> teste` e uma ordem de migração que preserve readers/writers atuais.

## Próxima ação

Executar ROAD-01.1: inventário consumer-first e matriz de divergências.

## Capacidade

`Chat/Codex -> capacidade atual -> Alto -> inventário transversal de schema/identidade, sem implementação funcional`.
