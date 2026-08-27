# Estado — ROAD-01 Schema e identidade consumer-first

Atualizado em: 2026-08-27
Status: `ROAD-01.1 COMPLETE — ROAD-01.2 CARD IDENTITY IMPLEMENTATION NEXT`
Branch: `chat/financial-roadmap-road01-20260827`
Base: ROAD-K0 GO em `9ea7906e16c0639681e9cf9437bcef8a9ef92eda`
Contrato semântico: `docs/specs/financial-semantic-convergence-contract-v1.md`
Roadmap canônico: `docs/plans/workstreams/financial-roadmap-canonical.md`
Inventário: `docs/agent-memory/workstreams/financial-roadmap-road01-inventory.md`

## Objetivo

Convergir schema e identidade por consumer, preservando compatibilidade e evitando migração ampla sem necessidade.

## ROAD-01.1 — COMPLETE

O inventário consumer-first foi versionado e cobre template, readers, writers, adapters, manutenção, dashboard/personal-sheet, Open Finance e exports.

Achados principais:

- **P0:** `Faturas` agrupa por label H, não por `card_id` G;
- **P0/P1:** personal card writer usa `sheetName=Cartão ${label}` e o adapter Google persiste esse legacy sheet name como display H, permitindo duas labels para o mesmo G;
- **P1:** `Lançamentos Cartão` não possui subcategoria estruturada;
- **P1:** template/readers usam Conta Financeira K/J enquanto maintenance de user_id ainda lê A:J/A:I;
- **P1:** existência de aba não prova header atual em planilha histórica;
- **P1:** recorrência sem `user_id` é migração de dado, não autorização para ler linha sem escopo;
- **P2:** resource de criação não congela timezone da planilha.

O inventário separa explicitamente identidade/schema (ROAD-01) de competência/fechamento/schedule (ROAD-02) e saldo/budget (ROAD-03A).

## Próxima fatia — ROAD-01.2

Implementar primeiro somente a identidade estável de cartão e compatibilidade associada:

1. preservar `card_id` como chave em writer/readers;
2. separar legacy routing (`Cartão <label>`) do display persistido;
3. fazer `Faturas` agregar por `card_id` + competência e resolver label pelo catálogo para apresentação;
4. manter fallback seguro para linhas antigas sem card_id, sem fundir cartões distintos por nome;
5. adicionar testes causais de duas labels para o mesmo card_id e round-trip do adapter legacy.

Subcategoria/schema v2, headers/account repair, recorrências e timezone permanecem para fatias seguintes de ROAD-01.

## Invariantes

- cartões ativos continuam compartilhados entre usuários familiares autorizados; nome não é autorização;
- nenhuma planilha real/backfill será executado nesta fatia;
- nenhuma regra de closing/competence será alterada;
- nenhuma retirada de legado;
- mudança material de código só fecha após testes e auditoria independente em conversa limpa do Chat.

## Capacidade

`Codex -> capacidade atual -> Alto -> implementar ROAD-01.2 card identity em branch dedicada, testes focais/causais, sem deploy nem dados privados`.
