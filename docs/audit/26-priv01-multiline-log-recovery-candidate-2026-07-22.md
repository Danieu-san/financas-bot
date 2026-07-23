# PRIV-01 — recuperação dos escapes multilinha candidata à reauditoria

Data: 2026-07-22

## Estado

`CANDIDATO APÓS SEGUNDO NO-GO, AGUARDANDO COMMIT IMUTÁVEL E REAUDITORIA
INDEPENDENTE`. Este documento não concede `GO`, não autoriza deploy e não
afirma validação em produção, WhatsApp ou Google reais.

## Base e segundo parecer independente

- candidato reauditado: `44d703bd3792674d1089e118f08403e1c2e55ee4`;
- parecer: `NO-GO` após leitura integral dos 27 arquivos exigidos;
- HIGH: cinco chamadas multilinha em `messageHandler.js` ainda entregavam
  `error.message` a `logger.warn`, e `google.js` entregava `warning.error`;
- MEDIUM: `safeError` ainda consultava `error.response?.status`, contrariando a
  fronteira declarada;
- lacuna probatória: o scanner usava `[^\r\n]*` e, portanto, não atravessava
  quebras de linha de uma mesma chamada ao logger.

O hash do novo candidato será a identidade do commit que contém este arquivo.
A próxima revisão deve usar o hash completo, nunca a ponta mutável de `main`.

## Reprodução pelo executor

Os cinco sinks multilinha, `warning.error` e a leitura de `response` foram
confirmados no código do hash reauditado. O scanner anterior permaneceu verde
por inspecionar somente a linha inicial da chamada. O parecer foi aceito apenas
depois dessa reprodução local.

## Correção

1. os cinco sinks administrativos preservam apenas contexto sanitizado e
   acrescentam `logger.safeError(error)` fora do objeto serializado;
2. os warnings das projeções canônicas e da conciliação de importação passam
   códigos por `safeError`, sem interpolar erro livre;
3. `safeError` consulta apenas `name`, `code` e `status` diretos, com allowlist
   de nomes e formato estrito de código; não lê `message`, `payload`,
   `response`, `config` ou `stack`;
4. a prova negativa extrai a chamada completa de `logger.warn/error`, atravessa
   quebras de linha e rejeita propriedades livres após remover somente o
   argumento protegido por `logger.safeError`;
5. fixtures adversariais provam que o scanner detecta chamada multilinha e
   código livre de warning, aceita o equivalente sanitizado e não atravessa
   falsamente para um `msg.reply(error.message)` posterior;
6. retries, respostas, efeitos financeiros, decisões e ordem causal não foram
   alterados.

## Arquivos do delta

- `src/handlers/messageHandler.js`;
- `src/services/google.js`;
- `src/utils/logger.js`;
- `tests/unit.test.js`;
- `docs/audit/26-priv01-multiline-log-recovery-candidate-2026-07-22.md`;
- `docs/plans/current-gate.md`;
- `docs/agent-memory/current.md`.

## Evidência executada pelo Codex

- reprodução dos achados do segundo `NO-GO`: confirmada;
- sintaxe dos quatro JavaScript alterados: verde;
- provas focais `PRIV-01`: `3/3`;
- bateria intermediária afetada: `342/342`;
- `npm test`: pretests verdes e runner principal `1.077/1.077`, sem falha,
  cancelamento ou skip.

As contagens são evidência relatada pelo executor. A reauditoria é estática e
não deve tratá-las como execução própria.

## Critério de fechamento

Somente um novo parecer independente que confirme o hash e os arquivos lidos,
confronte os seis sinks, a fronteira de `safeError` e a prova por chamada
completa, e não encontre achado bloqueante ou lacuna indispensável dentro de
`PRIV-01`, permite registrar `GO TÉCNICO LOCAL` em documento separado.
