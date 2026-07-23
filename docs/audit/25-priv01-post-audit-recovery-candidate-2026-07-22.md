# PRIV-01 — recuperação pós-NO-GO candidata à reauditoria

Data: 2026-07-22

## Estado

`CANDIDATO AGUARDANDO REAUDITORIA INDEPENDENTE`. Este documento não concede
`GO`, não autoriza deploy e não afirma validação em produção, WhatsApp ou Google
reais.

## Base e parecer anterior

- candidato auditado: `45dbfa1632779924bc8795baefd969f03afde7e7`;
- parecer: `NO-GO` após leitura integral dos 12 arquivos solicitados;
- HIGH 1: warnings/errors ainda interpolavam propriedades livres como
  `error.message` antes da sanitização;
- HIGH 2: módulos injetáveis aceitavam `console` como logger e
  `src/services/whatsapp.js` passava esse alias ao ready-rescue;
- lacuna probatória: o scanner detectava somente chamadas diretas a
  `console.warn/error`.

O hash do novo candidato é a identidade do commit que contém este arquivo. A
reauditoria deve usar o hash completo, nunca a ponta mutável de `main`.

## Reprodução pelo executor

Uma busca no mesmo recorte confirmou dezenas de propriedades livres em sinks e
quatro classes de fallback/alias para `console`. O `logger: console` do
ready-rescue estava alcançável pela inicialização normal do WhatsApp. O parecer
foi aceito somente depois dessa reprodução local.

## Correção pós-parecer

1. warnings/errors de entrypoint, agentes, áudio, scheduler, handlers, Google,
   Gemini, dashboard, read models, telemetria, estado e Open Finance agora usam
   eventos estáveis mais `safeError`;
2. `safeError` não lê mensagem, payload, response, config ou stack; nomes fora
   de classes conhecidas viram `Error`, e códigos só sobrevivem se forem HTTP
   de três dígitos ou categóricos em caixa alta e formato estrito;
3. configs de runtime, canário Open Finance, unread backfill e ready-rescue usam
   o logger central como fallback, nunca `console`;
4. o entrypoint WhatsApp injeta o logger central no ready-rescue e não registra
   motivo livre de desconexão;
5. a prova negativa percorre `index.js` e `src/**/*.js`, exclui somente
   `src/testing/**` e reprova console warning/error direto, aliases de console e
   propriedades livres de erro em sinks warning/error;
6. retries, backoff, respostas, decisões, efeitos e ordem causal não mudaram.

## Arquivos de produto e prova pós-NO-GO

- `index.js`;
- `src/agent/contextualFinancialAnalyst.js`;
- `src/ai/intentClassifier.js`;
- `src/config/financialAgentRuntimeConfig.js`;
- `src/config/financialCommandPlannerRuntimeConfig.js`;
- `src/handlers/audioHandler.js`;
- `src/handlers/messageHandler.js`;
- `src/jobs/scheduler.js`;
- `src/openFinance/openFinanceCanaryRuntime.js`;
- `src/services/adminActionLogService.js`;
- `src/services/dashboardAccessLogService.js`;
- `src/services/dashboardServer.js`;
- `src/services/gemini.js`;
- `src/services/google.js`;
- `src/services/qaFailureLogService.js`;
- `src/services/readModelService.js`;
- `src/services/sqliteReadModelService.js`;
- `src/services/whatsapp.js`;
- `src/services/whatsappReadyRescueService.js`;
- `src/services/whatsappUnreadBackfillService.js`;
- `src/state/userStateManager.js`;
- `src/telemetry/legacyUsageTelemetry.js`;
- `src/utils/logger.js`;
- `tests/unit.test.js`.

## Evidência executada pelo Codex

- reprodução dos dois achados: confirmada;
- padrões estáticos do `NO-GO` após a correção: zero;
- sintaxe dos JavaScript alterados: verde;
- provas focais ampliadas: `3/3`;
- bateria transversal afetada: `526/526`;
- bateria final dos últimos sinks: `418/418`;
- `npm test`: pretests verdes e runner principal `1.077/1.077`, sem falha,
  cancelamento ou skip.

As contagens são evidência relatada pelo executor. A reauditoria será estática
e não deve tratá-las como execução própria.

## Critério de fechamento

Somente parecer independente em conversa limpa que confirme o novo hash e os
arquivos lidos, confronte explicitamente os dois achados HIGH e não encontre
novo achado bloqueante ou lacuna indispensável dentro de `PRIV-01` permite
registrar `GO TÉCNICO LOCAL` em documento separado.
