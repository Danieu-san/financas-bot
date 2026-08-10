# Gate 40 - candidato de compras em fatura aberta

Data: 2026-08-10

## Estado

`CANDIDATO LOCAL; SEM GO INDEPENDENTE; SEM DEPLOY`.

## Problema observado

Compras reais e ja visiveis na fatura aberta do cartao eram apresentadas como
"pendentes no banco" e nao recebiam proposta numerada. O fluxo exigia
`provider_state=POSTED` em store, outbox e revalidacao final.

Segundo a documentacao oficial do Pluggy, transacoes de cartao na fatura aberta
e parcelas futuras podem permanecer `PENDING`; `POSTED` passa a representar a
transacao associada a uma fatura fechada ou vencida. Portanto, `PENDING` de
cartao nao prova autorizacao bancaria pendente.

Referencias oficiais:

- `https://docs.pluggy.ai/docs/transactions`;
- `https://docs.pluggy.ai/docs/credit-card-installments`.

## Correcao

- `openFinancePurchaseProposalEligibility.js` centraliza a elegibilidade:
  classificacao `purchase`, conta `CREDIT`, valor positivo, estado bruto
  `PENDING|POSTED` coerente e ausencia de serie parcelada;
- `openFinanceShadowPreviewStore.js` cria a proposta durante a fatura aberta e
  aceita somente a progressao monotona `PENDING -> POSTED` do mesmo conteudo;
- mudancas de valor, descricao, data, conta, identidade, classificacao ou
  regressao `POSTED -> PENDING` continuam falhando fechado;
- `openFinanceAlertOutbox.js` usa o marco estavel `save_proposal`, evitando uma
  segunda mensagem quando o provedor promove o status;
- `openFinanceSaveProposalFinalization.js` revalida a mesma compra em
  `PENDING` ou depois da progressao para `POSTED`, mantendo o bloqueio explicito
  de parcelamentos, reconciliacao `new`, revisao e segundo consentimento;
- a mensagem read-only deixa de afirmar que o banco ainda nao confirmou.

## Limites preservados

- parcela futura e compra parcelada permanecem inelegiveis;
- conta `BANK`, entrada, estorno e transferencia nao recebem esta excecao;
- o estado bruto do Pluggy nao e reescrito;
- nenhuma escrita ocorre antes da revisao guiada e do segundo consentimento;
- nenhuma mudanca de flags ou producao faz parte deste commit candidato.

## Evidencia local

- RED causal: compras `PENDING` nao criavam propostas e a finalizacao rejeitava
  a fonte; ambos os testes falharam antes da correcao;
- bateria causal final: `90/90`, zero falhas;
- backup/restore afetado: `4/4`, zero falhas;
- suite hermetica ampla final: `1632` testes, `1622` aprovados, `0` falhas,
  `10` skips esperados, `0` todo;
- cobertura ampla: linhas `91.28%`, branches `73.75%`, funcoes `90.91%`;
- rede bloqueada pelo runner hermetico e E2E WhatsApp real excluido por contrato;
- contagens sao execucao local relatada, nao execucao do auditor independente.

## Arquivos de produto para auditoria

- `src/openFinance/openFinancePurchaseProposalEligibility.js`;
- `src/openFinance/openFinanceShadowPreviewStore.js`;
- `src/openFinance/openFinanceAlertOutbox.js`;
- `src/openFinance/openFinanceSaveProposalFinalization.js`;
- `src/openFinance/openFinanceWhatsappCanaryDelivery.js`.

## Testes causais para auditoria

- `tests/openFinanceLifecycle.test.js`;
- `tests/openFinanceCanaryRuntime.test.js`;
- `tests/openFinanceSaveProposalShadow.test.js`;
- `tests/openFinanceAlertOutbox.test.js`;
- `tests/openFinanceNumericSaveFlow.test.js`;
- `tests/openFinanceWhatsappCanaryDelivery.test.js`;
- `tests/openFinanceSaveProposalFinalization.test.js`;
- `tests/openFinanceRuntimeReconciliation.test.js`;
- `tests/openFinanceStateBackup.test.js`;
- `tests/openFinanceOperationalBackupGate.test.js`.

## Criterio pedido ao auditor

Confirmar que o candidato corrige a semantica de fatura aberta sem transformar
todo `PENDING` em elegivel; preserva o bloqueio de parcelas futuras e series
parceladas; aceita apenas a mudanca monotona de status do mesmo lancamento;
evita proposta/mensagem duplicada; e mantem revalidacao, segundo consentimento,
reconciliacao e efeito unico antes de qualquer escrita.

O estado maximo antes da auditoria independente e `CANDIDATO LOCAL`.
