# 9P.2 — recuperação da prova positiva de entrega

Atualizado em: 2026-07-24

Candidato auditado:
`8e7a4716391e4fdcf32fe8ea30c341ec4d1b2f1c`.

Conversa independente:
`https://chatgpt.com/c/6a63fa36-b25c-83e9-adc4-782d546f9077`.

## Estado

`RECUPERAÇÃO LOCAL VERDE; NOVO COMMIT IMUTÁVEL E REAUDITORIA PENDENTES`.

## Achado independente

O Chat confirmou o hash, o parent
`ae9c7df91b0015d9812afdd0e06db6399254851a` e a leitura integral do manifesto
54 e dos onze arquivos solicitados.

Veredito: `NO-GO`, com `CRITICAL 0`, `HIGH 0`, `MEDIUM 1` e `LOW 0`.

O achado foi causalmente válido: `accepted_unconfirmed` é suficiente para
impedir retry automático, mas não é prova positiva de que a pergunta chegou ao
WhatsApp. Como a conversa aceitava esse estado, um `sim` genérico podia
resolver uma proposta cuja chamada de transporte falhou ambiguamente antes da
entrega efetiva.

## Correção

- somente outbox `delivered_confirmed` torna uma confirmação elegível para
  `sim`, `não` ou `cancelar`;
- `accepted_unconfirmed` continua terminal para retry automático e mantém a
  confirmação durável, mas não cria estado conversacional e não habilita
  resposta financeira;
- resposta genérica durante `accepted_unconfirmed` retorna `handled=false` e
  preserva a proposta;
- confirmação manual posterior do alerta pode promover o outbox a
  `delivered_confirmed`; a recuperação durável então volta a funcionar sem
  depender do índice conversacional;
- falha definitiva continua `pending`, reutiliza a confirmação no retry e
  também permanece inelegível antes da entrega.

## Prova causal

O teste de transporte ambíguo agora exige simultaneamente:

1. exatamente uma chamada de transporte;
2. estado `accepted_unconfirmed`;
3. nenhuma recuperação automática do alerta;
4. confirmação ainda durável;
5. `sim` genérico não tratado;
6. `financial_writes=0`.

As provas anteriores de entrega confirmada, restart, recusa, cancelamento,
terceiro, ambiguidade por múltiplas propostas e entrada pública permanecem
verdes.

## Evidência local

- correção causal e runtime: `16/16`;
- todos os testes Open Finance: `244/244`;
- workflow portátil e `git diff --check`: verdes;
- nenhuma alteração de writer financeiro;
- `OPEN_FINANCE_WRITE_MODE=off`;
- nenhuma produção, mensagem WhatsApp real, Google ou Pluggy real.

O runner hermético global `1.293/1.298` e a máquina de estados `122/122`
permanecem evidência executada antes desta microcorreção; não foram repetidos
porque a mudança posterior se restringe à elegibilidade de dois estados já
coberta pela regressão Open Finance completa.

## Arquivos alterados pela recuperação

- `src/openFinance/openFinanceSaveProposalConversation.js`;
- `src/openFinance/openFinanceCanaryRuntime.js`;
- `tests/openFinanceSaveProposalConversation.test.js`;
- `docs/audit/54-open-finance-save-proposal-conversation-candidate-2026-07-24.md`;
- `docs/plans/current-gate.md`;
- `docs/agent-memory/current.md`;
- este documento.

## Perguntas para a reauditoria

1. Restringir elegibilidade a `delivered_confirmed` fecha integralmente o
   `MEDIUM` sem reabrir retry ambíguo?
2. `accepted_unconfirmed` permanece corretamente at-most-once e incapaz de
   consumir proposta?
3. Entrega confirmada continua recuperável após restart sem estado auxiliar?
4. Resta achado `CRITICAL`, `HIGH` ou `MEDIUM` no contrato local 9P.2?
