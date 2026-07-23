# PRIV-01 — fronteira sanitizada de logs candidata à auditoria

Data: 2026-07-22

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`. Este documento não concede
`GO`, não autoriza deploy e não afirma validação em produção, WhatsApp ou Google
reais.

## Base e objeto

- base: `9894d8215cec7f7b7d3add9329d3e3071f62fc58`;
- objeto: fechar escapes de warning/error do runtime que contornavam a redação
  central ou incluíam objetos e respostas de provider;
- implementação: `src/utils/logger.js` e os sete consumidores caracterizados;
- provas: `tests/unit.test.js` e expectativas afetadas em
  `tests/financialStateMachine.test.js`;
- contrato: `docs/plans/current-gate.md`.

O hash do candidato é a identidade do próprio commit publicado. A auditoria
deve usar o hash completo nas URLs e nunca a ponta mutável de `main`.

## Caracterização reproduzível

No recorte `index.js` mais `src/**/*.js`, excluindo somente `src/testing/**`,
foram inventariados 146 arquivos, 34 `console.error`, 9 `console.warn` e quatro
dumps explícitos de payload de provider. Os bypasses estavam em `index.js`,
`src/handlers/creationHandler.js`, `src/handlers/messageHandler.js`,
`src/services/google.js`, `src/services/googleOAuthService.js`,
`src/services/whatsapp.js` e `src/state/userStateManager.js`.

Os dois testes novos foram executados antes da alteração do produto. Um mostrou
que `spreadsheet_id` e a chave JSON `message` ainda preservavam dados sensíveis;
o outro enumerou os sete módulos com `console.error`/`console.warn`.

## Mudança limitada

1. `logger.safeError` reduz qualquer erro a nome e código/status sanitizados;
2. a redação cobre identificadores ampliados e conteúdo em JSON ou em
   `chave=valor`;
3. warnings e errors do runtime usam evento estável no logger central;
4. nenhum objeto de erro/resposta/configuração, stack, mensagem livre ou
   `response.data` é entregue por esses caminhos;
5. severidade e rótulo operacional permanecem disponíveis;
6. não houve mudança em retries, efeitos financeiros, respostas ao usuário,
   autorização, lifecycle ou ordem causal.

Saídas estáticas de inicialização em `console.log` não transportam os objetos
caracterizados e não fazem parte do bypass de warning/error. Logs de bibliotecas
externas e arquivos históricos já persistidos permanecem fora do alcance local.

## Provas e comparações finais

- a prova adversarial exige redação de token, URL sensível, identificadores e
  conteúdo aninhado, preservando apenas os rótulos não sensíveis;
- a prova negativa percorre o recorte de runtime e exige zero
  `console.error`/`console.warn` fora do logger;
- testes afetados observam o sink central sem substituir as decisões, os
  retries ou as falhas exercitadas;
- a inspeção final encontrou zero bypass e zero dump explícito dos quatro
  payloads de provider caracterizados.

## Evidência executada pelo Codex

- RED causal: `2/2` falharam antes da correção;
- focal verde: `2/2`;
- regressões dirigidas: `5/5`;
- recorte WhatsApp após substituir motivos dinâmicos por códigos fixos: `27/27`;
- bateria afetada: `510/510`;
- `npm test`: pretests verdes e runner principal `1.076/1.076`, sem falha,
  cancelamento ou skip;
- sintaxe dos arquivos alterados e `git diff --check`: verdes.

As contagens são evidência relatada pelo executor. O auditor externo fará
revisão estática dos arquivos imutáveis e não deve tratá-las como execução sua.

## Critério de fechamento

Somente parecer independente que confirme o hash completo e os arquivos lidos,
verifique a fronteira real do runtime e não encontre achado bloqueante ou
lacuna indispensável dentro de `PRIV-01` permite registrar `GO TÉCNICO LOCAL`.
O parecer deve ser confrontado com o código antes do fechamento.
