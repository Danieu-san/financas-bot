# Índice de evidências

Objeto auditado: commit `94c52f23261ae2b9150edcdb7f3ba5ebaba35727`,
tree `363ef7fcbbeb18bbc3eb4810e0d4e9cce48755ae`.

## Identidade e lifecycle

| Achado/controle | Evidência | Categoria |
| --- | --- | --- |
| admin por nome | `src/utils/adminCheck.js:43-52`; nome vem de `src/services/userService.js:706-716`; admin pré-gate em `src/handlers/messageHandler.js:8011-8017`; testes `tests/unit.test.js:2506-2565` | `CODE` + `TEST` |
| OAuth state não consumível | `src/services/googleOAuthService.js:68-100,142-187` | `CODE` + `GAP` |
| callback sempre ativa | `src/services/userSpreadsheetService.js:804-830` | `CODE` + `GAP` |
| status sem cascata | lifecycle em `src/handlers/messageHandler.js:7112-7133,7971-8003`; share removido somente em fluxo próprio | `CODE` + `GAP` |
| dashboard escopado | `src/services/dashboardServer.js:701-817,835-929`; baterias dashboard | `CODE` + `TEST` |

## Entrada, estado e concorrência

| Achado/controle | Evidência | Categoria |
| --- | --- | --- |
| áudio antes dos gates | `src/handlers/messageHandler.js:8958-9021`; `src/handlers/audioHandler.js:22-78` | `CODE` + `GAP` |
| handlers antes do rate limit | `src/handlers/messageHandler.js:9041-9101` | `CODE` + `GAP` |
| sem fila por remetente | listener em `index.js`; `handleMessage` assíncrono sem mutex | `CODE` + `GAP` |
| snapshot parcial | `src/state/userStateManager.js`; testes de persistência em `tests/unit.test.js` | `CODE` + `TEST` |
| modo do snapshot | EC2 em 2026-07-17: `0664` | `PROD` |

## Integridade e leitura

| Achado/controle | Evidência | Categoria |
| --- | --- | --- |
| erro Sheets vira vazio | `src/services/google.js:1081-1137` | `CODE` |
| dashboard reduz vazio a zero | `src/services/userSheetAnalyticsService.js:565-658` | `CODE` + `GAP` |
| writers `USER_ENTERED` | `src/services/google.js:824-831,1205-1210,1262-1267` | `CODE` |
| nome pré-consentimento sem neutralização | `src/services/userService.js:210-227` | `CODE` + `GAP` |
| controles locais de fórmula | batch, importação XLSX e exportação nas baterias da fase 6 | `CODE` + `TEST` |
| operation key de writes principais | contexto com `messageId` em `src/handlers/messageHandler.js:9021`; ledger em `src/services/google.js` | `CODE` + `TEST` |

## Scheduler

| Achado/controle | Evidência | Categoria |
| --- | --- | --- |
| manhã/contas em fonte central | `src/jobs/scheduler.js:203-347` | `CODE` + `TEST` parcial |
| relatório mensal central | `src/jobs/scheduler.js:486-563` | `CODE` + `TEST` parcial |
| resumo noturno/Calendar escopados | `src/jobs/scheduler.js:349-380`; Calendar por `userId` | `CODE` + `TEST` |
| envio sem outbox | loops e `try/catch` em `src/jobs/scheduler.js`; `notifiedEventIds` em memória | `CODE` + `GAP` |

## Privacidade e logs

| Achado/controle | Evidência | Categoria |
| --- | --- | --- |
| logger estruturado redige campos | `src/utils/logger.js` e testes de privacidade | `CODE` + `TEST` |
| escapes brutos | `index.js:91-98`, `src/services/google.js:512,526,1458,1570,1583,1764`, handlers | `CODE` |
| ocorrências no tail PM2 | 179 formatos de ID WhatsApp e 7 marcadores de erro bruto; zero rótulos de token, sem imprimir valores | `PROD` |

## Open Finance

| Controle | Evidência | Categoria |
| --- | --- | --- |
| Pluggy apenas GET | `src/openFinance/pluggyReadOnlyClient.js`; `tests/openFinancePluggyReadOnly.test.js` | `CODE` + `TEST` |
| baseline/outbox/replay/revogação | stores Open Finance e baterias específicas | `CODE` + `TEST` |
| runtime de revogação fecha stores uma vez | `src/openFinance/openFinanceConsentRuntime.js`; `tests/openFinanceOperationalBackupGate.test.js` | `CODE` + `TEST` |
| backup/restore v3 | `src/openFinance/openFinanceStateBackup.js`; gate local e operacional anterior no EC2 | `CODE` + `TEST` + `PROD` histórico |
| estado atual | canary/canary/off; bancos `0600`, diretórios `0700`; journal 0; preview 1 pendente/0 expirado; health e WhatsApp verdes | `PROD` |
| frequência real | `OPEN_FINANCE_POLL_INTERVAL_MS` equivale a 6 horas; piso no código em `src/openFinance/openFinanceCanaryRuntime.js:184-206` | `CODE` + `PROD` |
| save/review remoto ausentes | nenhum handler/endpoint; write mode `off` | `CODE` + `PROD` |
| polling natural posterior | ciclo às 01h25 UTC: `GO`, new 0, três `accepted_unconfirmed`, retry 0, writes 0; journal 0, preview 1/1, expirado 0, outbox pending/in-flight 0 | `PROD` |

## Execuções reproduzidas em 2026-07-17

- `npm test`: exit `0`; pretest completo verde e etapa principal `996/996`.
- 22 arquivos locais omitidos pela bateria padrão: 115 casos, 110 aprovados,
  5 pulados pelo gate funcional explícito, 0 falhas.
- E2E WhatsApp real omitido deliberadamente: nenhuma mensagem, escrita real ou
  ativação foi autorizada pela auditoria.
- `git diff --check`: verde antes da consolidação dos artefatos.
- Leitura EC2: tree idêntica, PM2 online, health `ok/sqlite`, WhatsApp pronto,
  zero escrita Open Finance e nenhum polling forçado.

## Limites de evidência

- Não foi tentada exploração real de admin, OAuth, fórmula ou concorrência.
- Não foi feita revogação em conexão real.
- Não foi testada escrita Open Finance.
- Não foi exposto conteúdo de log, IDs, telefones, descrições ou valores.
- O polling natural posterior foi observado sem execução forçada e fechou `GO`.
