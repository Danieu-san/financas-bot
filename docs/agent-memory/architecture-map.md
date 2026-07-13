# Mapa operacional da arquitetura

Use este mapa para escolher rapidamente quais arquivos abrir por tarefa.

## Entrada e ciclo de vida

- `index.js` - inicializa Google, WhatsApp, dashboard/read model e scheduler.
- `ecosystem.config.js` - PM2 em producao.
- `src/services/whatsapp.js` - cliente WhatsApp singleton, eventos `qr`, `ready`, `disconnected`.

## Mensagens WhatsApp

- `src/handlers/messageHandler.js` - handler principal, onboarding, estados, importacao, perguntas e roteamento.
- `src/state/userStateManager.js` - estados em memoria. Reinicio do processo perde estados.
- `src/handlers/audioHandler.js` - transcricao de audio via Gemini e reentrada no fluxo textual.
- `src/handlers/creationHandler.js` - criacao de metas e dividas.
- `src/handlers/deletionHandler.js` - exclusao de itens.
- `src/handlers/debtHandler.js` e `src/handlers/debtUpdateHandler.js` - pagamentos/atualizacao de dividas.
- `src/services/goalService.js` - movimentacoes de metas/cofrinho, ajuste de valor atual, status e auditoria.
- `src/plans/projectedPlansContract.js` - contrato puro da Fase 5A para
  `plans`/`plan_movements`, adapters read-only de metas/dividas legadas,
  identidade, centavos, visao publica e backup/restore portatil.
- `src/plans/projectedPlansStore.js` - SQLite shadow local da Fase 5A com
  identidade persistente/rebind, versoes imutaveis, idempotencia de movimentos,
  snapshots, readiness e backup/restore; writes ficam desativados por padrao e
  o modulo nao esta ligado ao runtime.
- `src/plans/projectedPlansParityReport.js` e
  `scripts/runProjectedPlansReadOnlyGate.js` - gate 5A sanitizado, restrito ao
  unico admin configurado; compara views em centavos, usa identidade tecnica
  persistente e nao escreve no Google Sheets.

## Importacao de extratos

- `src/services/statementImportService.js` - parse de CSV/OFX, classificacao inicial, duplicidade, recorrencias, previa de importacao.
- `src/handlers/messageHandler.js` - estados de importacao e gravacao nas abas.
- Testes principais: `tests/statementImportService.test.js`, `tests/financialStateMachine.test.js`.

## Planilhas Google

- `src/services/google.js` - API Google Sheets/Calendar, leitura/escrita, estrutura central/legada.
- `src/services/userSpreadsheetService.js` - cria planilha individual do usuario, abas, formulas, exemplos e visual.
- `src/services/userSheetAnalyticsService.js` - calcula dashboard a partir da planilha do usuario/familia.
- Abas principais: `Saídas`, `Entradas`, `Transferências`, `Dívidas`, `Metas`, `Movimentações Metas`, `Contas`, `Cartões`, `Lançamentos Cartão`, `Faturas`, `Parcelamentos`.

## Perguntas financeiras e calculos

- `src/ai/intentClassifier.js` - classifica perguntas analiticas.
- `src/services/calculationOrchestrator.js` - executa intents em dados carregados.
- `src/ai/responseGenerator.js` - gera resposta final.
- `src/services/readModelService.js` e `src/services/sqliteReadModelService.js` - read model e consultas otimizadas.
- `src/services/financialHealthService.js` - resumo de saude financeira, alertas e vencimentos.

## Dashboard

- `src/services/dashboardServer.js` - servidor web, HTML, API, auth por token.
- `src/services/dashboardV2SummaryService.js` - contrato sanitizado da API v2;
  combina snapshot e ferramentas financeiras sem recalcular em paralelo.
- Contrato: `docs/contracts/dashboard-api.md`.
- Testes: `tests/dashboardApiContracts.test.js`,
  `tests/dashboardV2SummaryService.test.js`, `tests/dashboardAuthSecurity.test.js`.

## Onboarding, usuarios e OAuth

- `src/services/userService.js` - status de usuario, aprovacao, dados de usuario.
- `src/services/googleOAuthService.js` - OAuth Google, tokens e state.
- `docs/specs/multiuser-google-oauth.md` e `docs/plans/multiuser-google-oauth.md` - desenho do fluxo.
- Testes: `tests/userLifecycle.test.js`, `tests/onboardingState.test.js`, `tests/googleOAuthService.test.js`, `tests/oauthRoutes.test.js`.

## Familia/compartilhamento

- Regras de dono/membro vivem principalmente em `src/services/userService.js` e chamadas no `messageHandler`.
- Importacao com familia pergunta de quem e o extrato e grava na planilha do dono, preservando `user_id` do responsavel.
- Antes de mexer, verificar privacidade em `docs/decisions/ADR-002-admin-financial-data-access.md`.

## Scheduler e Calendar

- `src/jobs/scheduler.js` - resumo matinal, resumo noturno, vencimentos, agenda.
- Usa `Contas`, `Dívidas` e Google Calendar.
- Testes: `tests/schedulerJobs.test.js`.

## Configuracao e seguranca

- `src/config/constants.js` - admins, mapas e configuracoes.
- `src/utils/adminCheck.js` - verificacao admin.
- `src/utils/rateLimiter.js` - rate limit.
- `docs/security/threat-model.md` - riscos e mitigacoes.
- Nunca registrar segredos em docs ou logs.

## Comandos uteis

- `npm test` - suite principal.
- `npm run test:unit` - unidade/contratos sem testes funcionais pesados.
- `npm run test:functional` - funcional.
- `npm run test:whatsapp:e2e:check` - checagem E2E WhatsApp.
- `node --check <arquivo>` - validar sintaxe de arquivo alterado.

## Producao

- EC2: `ubuntu@56.125.165.13`.
- App: `~/financas-bot`.
- PM2: processo `financas-bot`.
- Health: `https://financasbot.duckdns.org/dashboard/health`.
- Antes de deploy: testes locais e revisar `docs/runbooks/release-checklist.md`.
