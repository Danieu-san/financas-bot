# Estado — ROAD-01 Schema e identidade consumer-first

Atualizado em: 2026-08-28
Status: `ROAD-01.1 COMPLETE — ROAD-01.2 NO-GO; RECOVERY READY`
Branch: `chat/financial-roadmap-road01-20260827`
Base: ROAD-K0 GO em `9ea7906e16c0639681e9cf9437bcef8a9ef92eda`
Contrato semântico: `docs/specs/financial-semantic-convergence-contract-v1.md`
Roadmap canônico: `docs/plans/workstreams/financial-roadmap-canonical.md`
Inventário: `docs/agent-memory/workstreams/financial-roadmap-road01-inventory.md`
Recovery ROAD-01.2: `docs/agent-memory/workstreams/financial-roadmap-road01-card-identity-recovery-task.md`

## Objetivo

Convergir schema e identidade por consumer, preservando compatibilidade e evitando migração ampla sem necessidade.

## ROAD-01.1 — COMPLETE

O inventário consumer-first foi versionado e cobre template, readers, writers, adapters, manutenção, dashboard/personal-sheet, Open Finance e exports.

Achados principais:

- **P0:** `Faturas` agrupava por label H, não por `card_id` G;
- **P0/P1:** personal card writer usava `sheetName=Cartão ${label}` e o adapter Google persistia esse legacy sheet name como display H, permitindo duas labels para o mesmo G;
- **P1:** `Lançamentos Cartão` não possui subcategoria estruturada;
- **P1:** template/readers usam Conta Financeira K/J enquanto maintenance de user_id ainda lê A:J/A:I;
- **P1:** existência de aba não prova header atual em planilha histórica;
- **P1:** recorrência sem `user_id` é migração de dado, não autorização para ler linha sem escopo;
- **P2:** resource de criação não congela timezone da planilha.

## ROAD-01.2 — candidato recusado

Candidato implementado pelo Codex no commit imutável `fe39d8c57a7907da02282035130aa1fe4f56b47c` recebeu `NO-GO ROAD-01.2` em auditoria independente.

Partes aceitas estaticamente:

- `card_id` explícito vence ID/slug derivado;
- rota `Cartão <label>` fica separada do display persistido;
- writer personal-sheet mantém G=`card_id`, H=display, I=relation note, J=`user_id`;
- import e `saveCreditCardExpense()` propagam ID/display;
- nenhuma nova regra de titularidade exclusiva foi introduzida.

Bloqueios obrigatórios do recovery:

1. `Faturas` não pode excluir linha histórica sem `card_id`; G vazio precisa continuar contabilizável por identidade legacy derivada do label, sem fundir labels distintos;
2. `Faturas` deve agrupar por identidade estável, mas apresentar nome amigável/canônico — não `card_id` bruto;
3. testes precisam provar causalmente esses comportamentos, não apenas verificar substrings da fórmula.

A falha relatada de `validateAgentWorkflow.js` por tamanho/CRLF de arquivo não alterado do watcher é tratada como pendência separada de workflow e não como causa do NO-GO funcional desta fatia.

## Recovery ROAD-01.2 — READY

O recovery está delimitado em `financial-roadmap-road01-card-identity-recovery-task.md` e não amplia o escopo para schema v2, fechamento, competência, parcelas, saldo, budget, áudio, Open Finance, backfill ou produção.

## Invariantes

- cartões ativos continuam compartilhados entre usuários familiares autorizados; nome não é autorização;
- nenhuma planilha real/backfill será executado nesta fatia;
- nenhuma regra de closing/competence será alterada;
- nenhuma retirada de legado;
- mudança material de código só fecha após testes e nova auditoria independente em conversa limpa do Chat.

## Próxima ação

Executar no Codex somente o recovery ROAD-01.2, preservar o patch já aceito, adicionar compatibilidade histórica + display amigável em `Faturas` e testes causais; depois publicar novo hash imutável para reauditoria independente.

## Capacidade

`Codex -> capacidade atual -> Alto -> corrigir somente os bloqueios do NO-GO ROAD-01.2, com testes causais e sem deploy/dados privados`.
