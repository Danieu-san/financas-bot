# Gate 42 - recuperacao dos alertas proativos numerados

Data: 2026-08-15

## Veredito do candidato

`CANDIDATO TECNICO LOCAL; AGUARDANDO AUDITORIA INDEPENDENTE`.

O ciclo Open Finance de producao falhava fechado antes de alcancar o outbox.
O diagnostico foi executado uma unica vez contra backups consistentes dos cinco
bancos de estado da OCI, usando o release ativo e um transporte WhatsApp falso.
Nenhuma fila ou arquivo de producao foi alterado e `financial_writes=0`.

## Causa comprovada

1. Uma compra `PENDING` manteve a mesma identidade, valor, descricao, conta e
   estado, mas o Pluggy corrigiu somente `source.date`.
2. A proposta estava `pending`, com confirmacao `pending`, e nunca teve linha de
   transporte para Daniel ou Thais. O replay imutavel derrubava o ciclo inteiro
   com `save_proposal_replay_conflict`.
3. Superada essa fronteira no clone, uma revisao proativa duravel divergia apenas
   porque o novo ciclo recalculava `created_at` e `expires_at`; isso gerava
   `open_finance_proactive_review_replay_conflict` em todo segundo ciclo.
4. O logger preservava ambos como `code=unknown`, impedindo diagnostico dirigido.

## Correcao

- uma data corrigida pelo provedor pode atualizar a proposta somente quando:
  - a identidade e todos os demais campos causais permanecem identicos;
  - a compra continua elegivel e no mesmo estado do provedor;
  - a proposta e a confirmacao continuam pendentes;
  - o outbox prova ausencia total de transporte;
- qualquer valor, descricao, conta, status, parcela, principal, reconciliacao ou
  proposta ja transportada continua produzindo conflito e rollback atomico;
- revisoes proativas reaproveitam `created_at` e `expires_at` duraveis no replay,
  sem estender retencao;
- o log de `NO_GO` inclui `reason` somente para os dois codigos fechados
  `save_proposal_replay_conflict` e
  `open_finance_proactive_review_replay_conflict`; qualquer outro texto,
  inclusive um identificador sintaticamente valido, e reduzido a `unknown`.

## Reauditoria corretiva

O primeiro hash publicado, `f413010a2a8b58cc12808476cfb9cee5f1b3d6f9`,
recebeu `NO-GO` independente por um unico achado `MEDIO`: a validacao de
`reason` era uma expressao regular e nao uma lista fechada. A recuperacao das
propostas, o replay proativo e a fronteira de transporte foram aprovados.

O candidato atual substitui a expressao regular pela lista fechada acima e
acrescenta prova causal de que `private_token_12345` nao aparece no log.

## Evidencia

- testes focais depois da correcao: `43/43` verdes;
- bateria causal ampliada: `402/402` verde;
- uma unica suite hermetica ampla:
  - `1723` testes;
  - `1713` aprovados;
  - `0` falhas;
  - `10` ignorados previstos;
  - cobertura de linhas `91.49%`;
- clone do estado real da OCI com o candidato:
  - `outcome=GO`;
  - `refreshed=8` propostas nunca transportadas;
  - `pending_proposals=76`;
  - duas entregas simuladas, correspondentes ao compartilhamento familiar;
  - `financial_writes=0`.

## Limites

Este documento nao autoriza deploy. O commit ainda precisa ser publicado e
auditado por hash imutavel. Depois do `GO` independente, a promocao OCI deve
preservar os bancos, executar o primeiro ciclo real e confirmar um unico lote
numerado nos dois telefones antes de qualquer consentimento financeiro.

## Arquivos para auditoria

- `src/openFinance/openFinanceCanaryRuntime.js`;
- `src/openFinance/openFinanceShadowPreviewStore.js`;
- `src/openFinance/openFinanceProactiveReviewStore.js`;
- `tests/openFinanceCanaryRuntime.test.js`;
- `tests/openFinanceSaveProposalShadow.test.js`;
- `tests/openFinanceProactiveIncomeRefund.test.js`.
