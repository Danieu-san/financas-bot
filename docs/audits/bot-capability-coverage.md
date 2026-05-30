# Bot Capability Coverage Audit

Atualizado em: 2026-05-26

Objetivo: manter uma matriz viva entre o que o FinancasBot promete ao usuario, o caminho de codigo correspondente e a cobertura automatizada minima. Esta auditoria existe para evitar novos casos como `metas`: funcionalidade basica existente, mas sem teste ativo atravessando o caminho principal.

## Regra de aceite por capacidade

Uma capacidade basica so deve ser considerada coberta quando tiver:

- rota/intent testada;
- estado conversacional testado, quando houver multiplas etapas;
- escrita/leitura com `user_id` testada, quando tocar planilha/dados;
- pergunta analitica testada, quando o usuario puder consultar depois;
- teste negativo de seguranca quando houver risco de vazamento, prompt injection, duplicidade ou escopo de outro usuario.

## Matriz inicial

| Capacidade | Cobertura atual | Status | Proximo passo |
|---|---|---:|---|
| Onboarding e aceite de termos | `userLifecycle.test.js`, `onboardingState.test.js`, E2E configuravel | Coberto | Manter E2E real antes de release grande. |
| Comandos de configuracao (`checkin`, `reserva`) | `unit.test.js`, `financialStateMachine.test.js` | Coberto | Manter comandos e manual sincronizados. |
| Gasto/entrada simples | `financialStateMachine.test.js` | Coberto | Adicionar casos adversariais de categoria ambigua na matriz ampla. |
| Perguntas complexas deterministicas | `unit.test.js` (`calculationOrchestrator`) | Coberto | Expandir com frases reais de beta sempre que surgirem erros. |
| Audio | `financialStateMachine.test.js`; E2E real opcional | Coberto | Smoke real de audio antes de release maior, por depender de WhatsApp/ffmpeg. |
| Importacao CSV/OFX | `statementImportService.test.js`, `financialStateMachine.test.js` | Coberto | Manter testes com arquivos reais/fakes e limites de tamanho/linhas. |
| Importacao hostil/grande | Limites `IMPORT_MAX_FILE_BYTES` e `IMPORT_MAX_ROWS` testados | Coberto | Se PDF/imagem entrar no produto, adicionar validacao por magic bytes. |
| Cartoes/faturas/parcelamentos | `userSpreadsheetService.test.js`, `unit.test.js`, `statementImportService.test.js` | Coberto | Adicionar perguntas adversariais por responsavel/familia. |
| Criacao de meta | `financialStateMachine.test.js` ativo | Coberto | Manter junto de perguntas `resumo_metas`/`progresso_metas`. |
| Perguntas sobre metas | `unit.test.js`, `readModelSqlite.test.js` | Coberto | Acrescentar variações na bateria adversarial. |
| Dividas/pagamentos | `financialStateMachine.test.js`, `unit.test.js` | Coberto | Adicionar mais casos de atualizacao/quitacao se aparecerem bugs. |
| Lembretes/Calendar | `financialStateMachine.test.js`, `schedulerJobs.test.js` | Coberto | Manter smoke real de Calendar antes de release grande. |
| Dashboard | `dashboardApiContracts.test.js`, `dashboardAuthSecurity.test.js` | Coberto | Validar em browser/EC2 antes de deploy relevante. |
| Dashboard token/auditoria | TTL curto, `#token=`, audit log sanitizado | Coberto | Futuro: token one-time/session exchange. |
| Familia/planilha compartilhada | `financialStateMachine.test.js`, `userSpreadsheetService.test.js`, `unit.test.js` | Coberto | Manter casos de Daniel/Thais/familia e adicionar frases reais de beta como regressao. |
| Admin sensivel | Confirmacao em duas etapas e AdminActionLog | Coberto | Antes de beta maior, remover/reformular acesso admin amplo conforme ADR-002. |
| Prompt injection/dados internos | Gate local e sanitizacao de logs | Coberto | Adicionar frases reais de beta como regressao. |
| Rate limit/quota | `rateLimiter.test.js`, cache Sheets, retry helpers | Coberto | Futuro: circuit breaker mais sofisticado se a quota voltar a incomodar. |
| Functional smoke amplo | Partes criticas promovidas para testes ativos; `functional.test.js` mantido como E2E opcional | Coberto | Rodar `npm run test:functional` somente com planilha dedicada e reset permitido. |

## Proximas lacunas prioritarias

1. Adicionar frases reais de beta como regressao sempre que o bot errar.
2. Rodar E2E seletivo real no WhatsApp apenas para validar integrações externas antes de release maior.
3. Manter `bot-complete-coverage-checklist.md` sincronizado com manual, comandos e novas features.
