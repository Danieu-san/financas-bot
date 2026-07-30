# 9P.4 — fechamento independente da finalização idempotente

Atualizado em: 2026-07-30

Commit reavaliado:
`b98157dfde061793ad94cd025c99b1f8b5145712`.

Primeiro candidato:
`a512a07a8f18c9dffcf62676357c35f41f50395d`.

## Veredito

`9P.4: GO TÉCNICO LOCAL`.

A reauditoria independente confirmou os oito arquivos solicitados no mesmo
hash, emitiu `CRITICAL 0`, `HIGH 0`, `MEDIUM 0`, `LOW 0` e não identificou
lacuna causal indispensável residual no escopo local de processo único.

O parecer foi estático e somente leitura. O Chat não executou as contagens
locais publicadas no manifesto.

## Fechamento dos achados anteriores

### HIGH 1 — replay de `writing`

Fechado. Um estado anterior `writing` ou `uncertain` seleciona exclusivamente
o `reconciler`, nunca o writer de primeira tentativa. O reconciliador de
produto força `reconcileOnly=true`; sem operação durável ou prova positiva,
`appendRowToSheet` bloqueia antes de qualquer append.

### HIGH 2 — incerteza rebaixada a falha

Fechado. `FINANCIAL_WRITE_UNCERTAIN` é interceptado antes do tratamento
genérico, mantém o ledger `uncertain` e retorna à finalização como resultado
incerto. Ele não alcança o ramo que marca `failed`.

### MEDIUM 1 — composição causal dos testes

Fechado. A prova:

1. persiste `writing` e fecha o primeiro store;
2. reabre outro store no mesmo banco;
3. atravessa o handler e o `appendRowToSheet` reais;
4. usa um `FinancialWriteLedger` real;
5. exige `appendCalls=0` e `financial_writes=0` sem ledger;
6. exige os mesmos zeros ao reconciliar uma operação `pending` por linha exata.

Mocks de transporte e de Sheets funcionam como backing store e tripwire; não
substituem a decisão de writer versus reconciliador nem a decisão durável do
ledger.

## Evidência local preservada

- finalização focal: `9/9`;
- adaptador Google/ledger para append: `6/6`;
- entrada pública 9P.4 afetada: `1/1`;
- suíte unitária completa: `205/205`;
- workflow e `git diff --check`: verdes.

O runner hermético do primeiro candidato permaneceu como evidência histórica,
não foi atribuído ao recovery e não foi repetido sem mudança causal que o
justificasse.

## Alcance

Este `GO` autoriza somente encerrar tecnicamente o gate local 9P.4.

Não autoriza:

- ativar `OPEN_FINANCE_WRITE_MODE`;
- ativar ou ampliar canário;
- chamar Pluggy, Google ou WhatsApp reais;
- deploy, restart, QR ou alteração na Oracle/OCI;
- retorno à AWS;
- escrita financeira real.

## Próximo estado

O contrato local aprovado de proposta proativa agora cobre reconciliação,
revisão guiada, segunda confirmação, writer idempotente, restart, revogação e
recibo. Produção e integrações reais continuam desligadas.

A fila posterior deve ser retomada na ordem já registrada, começando por
verificar se a atribuição familiar uniforme a Daniel ou Thaís está integralmente
coberta pelo fluxo 9P.3/9P.4 antes de abrir qualquer mudança nova.
