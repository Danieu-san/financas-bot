# Estado — ROAD-01 Schema e identidade consumer-first

Atualizado em: 2026-08-29
Status: `ROAD-01.1 COMPLETE — ROAD-01.2 READY_FOR_DUAL_AUDIT`
Branch: `chat/financial-roadmap-road01-20260827`
Base: ROAD-K0 GO em `9ea7906e16c0639681e9cf9437bcef8a9ef92eda`
Contrato semântico: `docs/specs/financial-semantic-convergence-contract-v1.md`
Roadmap canônico: `docs/plans/workstreams/financial-roadmap-canonical.md`
Inventário: `docs/agent-memory/workstreams/financial-roadmap-road01-inventory.md`
Recovery ROAD-01.2: `docs/agent-memory/workstreams/financial-roadmap-road01-card-identity-recovery-task.md`
Evidência de validação: `docs/agent-memory/workstreams/financial-roadmap-road01-validation-evidence.md`

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

## ROAD-01.2 — primeiro candidato recusado

O primeiro candidato, commit imutável `fe39d8c57a7907da02282035130aa1fe4f56b47c`, recebeu `NO-GO ROAD-01.2` em auditoria independente.

Partes aceitas estaticamente e preservadas no recovery:

- `card_id` explícito vence ID/slug derivado;
- rota `Cartão <label>` fica separada do display persistido;
- writer personal-sheet mantém G=`card_id`, H=display, I=relation note, J=`user_id`;
- import e `saveCreditCardExpense()` propagam ID/display;
- nenhuma nova regra de titularidade exclusiva foi introduzida.

Bloqueios do NO-GO:

1. `Faturas` excluía linha histórica sem `card_id` por exigir G não nulo;
2. `Faturas` exibia `card_id` bruto em vez de nome amigável/canônico;
3. os testes não provavam causalmente esses comportamentos.

## Recovery ROAD-01.2 — IMPLEMENTED BY CHAT

O Chat principal transplantou para esta branch apenas os blobs de código/teste do primeiro candidato que haviam passado na auditoria estática, sem trazer estado, scripts ou artefatos da branch de orquestração. Em seguida aplicou diretamente o recovery delimitado.

Implementação do recovery:

- `src/services/cardInvoiceSummaryService.js` define identidade de fatura como `id:<card_id>` quando G existe e `legacy:<label>` somente quando G está vazio;
- `card_id` e label são normalizados deterministicamente com trim, sem heurística de similaridade;
- a regra pura agrupa por identidade + competência, mantém linhas legacy sem G e nunca funde automaticamente legacy com canônico por label;
- display canônico resolve primeiro o catálogo `Cartões` por `card_id`, depois o display persistido da linha e só cai no ID bruto se nenhum nome estiver disponível;
- display legacy permanece o label legacy exato normalizado;
- `Faturas` usa fórmula coerente com a mesma separação `id:` / `legacy:` e não exige mais G não nulo;
- `tests/road01CardIdentity.test.js` cobre contraexemplos causais e coerência fórmula/helper.

Candidato de código: `d2e3e17caae79577b6c8736780d809a36d2a0f31`.

## Revalidação local — checks específicos verdes

Resultado consolidado em `financial-roadmap-road01-validation-evidence.md`:

- `node --check` nos quatro módulos relevantes: PASS;
- `tests/road01CardIdentity.test.js`: 7/7 PASS;
- focais de writer/adapter em `tests/unit.test.js`: 2/2 PASS;
- bateria combinada `userSpreadsheetService + unit + road01CardIdentity`: 233/233 PASS;
- `git diff --check 09a6cceb...d2e3e17c...`: PASS;
- `node scripts/agent/validateAgentWorkflow.js`: PASS (`agent-workflow: OK`);
- worktree detached permaneceu limpa.

## Suíte ampla e diagnóstico causal

A única suíte ampla proporcional (`npm run test:unit`) falhou no lifecycle `pretest:unit`, antes da suíte principal, em `tests/userStateSnapshotSecurity.test.js`: 14 executados, 9 PASS, 5 FAIL, com `state_store_persist_failed` em persistência/compactação do state store.

Os arquivos diretamente envolvidos eram blobs idênticos no base `09a6cceb394157153516a4f8393267e47ed66a06` e no candidato `d2e3e17caae79577b6c8736780d809a36d2a0f31`:

- `src/state/userStateManager.js`: `442857d58977b64ae7f0c3a8f9e6385549db049d`;
- `tests/userStateSnapshotSecurity.test.js`: `5dcefe7d6988f404f026d8801c2557d9131f66d6`.

Uma tarefa separada de diagnóstico executou exatamente uma vez `npm run test:state-store-security` em worktrees limpas da base e do candidato, no mesmo ambiente Node `v22.17.0` / `win32` / `x64`:

- base: 14/14 PASS, exit 0;
- candidato: 14/14 PASS, exit 0.

A falha ampla anterior não foi reproduzida em nenhum dos dois hashes. Portanto não existe evidência reproduzível de regressão do ROAD-01.2; a causa exata do incidente permanece não identificada e é tratada como dependente de contexto/ambiente, com risco residual explícito. A suíte ampla não será repetida apenas para buscar um verde posterior, preservando o contrato de uma suíte ampla por candidato estável.

Essa classificação resolve o bloqueio de validação para fins de **seguir à auditoria independente**, mas não constitui GO da fatia.

## Invariantes

- cartões ativos continuam compartilhados entre usuários familiares autorizados; nome não é autorização;
- nenhuma planilha real/backfill foi executado;
- nenhuma regra de closing/competence foi alterada;
- nenhuma retirada de legado;
- nenhuma mudança de deploy/restart/flags/produção;
- nenhuma correção lateral do state store foi misturada ao ROAD-01.2;
- `GO ROAD-01.2` exige auditorias independentes do candidato imutável e reconciliação causal dos findings.

## Próxima ação

Congelar um hash imutável contendo este checkpoint + evidência sanitizada, confirmar no GitHub o SHA e os paths canônicos da auditoria e executar duas auditorias independentes:

1. conversa limpa do GPT;
2. Abacus / Claude Sonnet 5 conforme o protocolo canônico de auditoria.

Findings divergentes devem ser reconciliados pela cadeia causal no código/contrato/testes, não por maioria ou autoridade do modelo.

## Capacidade

`Chat -> GPT-5.6 Sol -> Alto -> preparar candidato imutável e prompts das duas auditorias; Chat limpo + Abacus/Claude -> Alto -> auditar de forma independente; Chat principal -> Alto -> reconciliar findings e decidir GO/NO-GO ROAD-01.2`.
