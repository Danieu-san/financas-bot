# Estado — ROAD-01 Schema e identidade consumer-first

Atualizado em: 2026-08-28
Status: `ROAD-01.1 COMPLETE — ROAD-01.2 RECOVERY IMPLEMENTED; ENV VALIDATION PENDING`
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

A falha relatada de `validateAgentWorkflow.js` por tamanho/CRLF de arquivo não alterado do watcher continua tratada como pendência separada de workflow e não como causa do NO-GO funcional desta fatia.

## Recovery ROAD-01.2 — IMPLEMENTED BY CHAT

O Chat principal transplantou para esta branch apenas os cinco blobs de código/teste do primeiro candidato que haviam passado na auditoria estática, sem trazer estado, scripts ou artefatos da branch de orquestração. Em seguida aplicou diretamente o recovery delimitado.

Implementação do recovery:

- novo helper puro `src/services/cardInvoiceSummaryService.js` define identidade de fatura como `id:<card_id>` quando G existe e `legacy:<label>` somente quando G está vazio;
- `card_id` e label são normalizados deterministicamente com trim, sem heurística de similaridade;
- a regra pura agrupa por identidade + competência, mantém linhas legacy sem G e nunca funde automaticamente legacy com canônico por label;
- display canônico resolve primeiro o catálogo `Cartões` por `card_id`, depois o display persistido da linha e só cai no ID bruto se nenhum nome estiver disponível;
- display legacy permanece o label legacy exato normalizado;
- `Faturas` usa fórmula coerente com a mesma separação `id:` / `legacy:` e não exige mais G não nulo;
- `tests/road01CardIdentity.test.js` cobre os quatro contraexemplos causais e exige igualdade exata entre a fórmula de produção e a fórmula construída pelo helper.

Candidato de código antes deste checkpoint: `550a4d2651abec7adf75c1830de153772780cd40`.

## Evidência disponível

Validação que o Chat conseguiu executar sem ambiente completo do repositório:

- helper puro: 4/4 checagens causais locais passaram para agregação canônica, inclusão legacy, separação de labels legacy e não-fusão legacy/canônico;
- sintaxe JS isolada da fórmula foi verificada localmente;
- diff GitHub do patch de produção confirmou alteração localizada na fórmula de `Faturas`;
- compare `09a6cceb394157153516a4f8393267e47ed66a06..550a4d2651abec7adf75c1830de153772780cd40` mostra apenas os arquivos esperados da fatia, mais o result file histórico do primeiro candidato publicado tardiamente;
- não há CI/status checks nem workflow run associado ao candidato.

Ainda **não executado no ambiente completo**:

- `node --check` nos módulos reais alterados com dependências instaladas;
- `node --test tests/road01CardIdentity.test.js`;
- regressão focal de `tests/unit.test.js` e `tests/userSpreadsheetService.test.js`;
- suíte ampla proporcional conforme `AGENTS.md`;
- `node scripts/agent/validateAgentWorkflow.js`.

Portanto este checkpoint **não declara GO** e ainda não autoriza auditoria final como candidato validado.

## Invariantes

- cartões ativos continuam compartilhados entre usuários familiares autorizados; nome não é autorização;
- nenhuma planilha real/backfill foi executado;
- nenhuma regra de closing/competence foi alterada;
- nenhuma retirada de legado;
- nenhuma mudança de deploy/restart/flags/produção;
- GO da fatia exige validação de ambiente e auditorias independentes posteriores.

## Próxima ação

Executar validação local somente-leitura/sem redesign sobre o SHA atual desta branch. Se os testes passarem, congelar novo SHA imutável e submetê-lo a duas auditorias independentes: conversa limpa do GPT e Abacus/Claude Sonnet 5 seguindo o protocolo canônico.

## Capacidade

`Codex/local executor -> capacidade atual -> Médio -> validar o SHA sem editar nem redesenhar; depois Chat limpo + Claude -> Alto -> auditorias independentes`.
