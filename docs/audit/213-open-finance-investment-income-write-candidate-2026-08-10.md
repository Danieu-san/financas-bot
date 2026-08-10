# Gate 38.6 - candidato de escrita de rendimento de investimento

Data: 2026-08-10

## Estado

`CANDIDATO LOCAL VERDE; AGUARDANDO AUDITORIA INDEPENDENTE; SEM DEPLOY`.

## Objetivo

Promover somente uma decisao duravel `investment_income` de observacao atual
`POSTED/new` para uma unica entrada financeira, sem absorver principal,
aplicacao ou resgate de reserva.

## Cadeia causal implementada

1. O handler publico recebe a decisao tipada da revisao proativa.
2. O builder exige revisao `reserve` decidida como `investment_income`, credito
   positivo e `operation_type` do provedor iniciado por
   `RENDIMENTO_APLIC_FINANCEIRA`.
3. A fonte, geracao, fingerprint, reconciliacao e revisao sao reconstruidas a
   partir dos stores reais antes de preparar a proposta.
4. A primeira confirmacao abre revisao guiada com uma unica pessoa do mesmo
   titular, somente categoria `Investimentos`, formas de recebimento e contas
   autorizadas desse titular. Nenhuma escrita ocorre.
5. A confirmacao final rele lifecycle, reconciliacao, revisao semantica,
   `operation_type`, catalogo e fonte atuais.
6. O writer comum recebe uma unica operacao `income.create` em `Entradas` e o
   projetor canonico valida a relacao `investment_income` como ganho positivo.

## Separacao de principal

- `reserve_application` e `reserve_redemption` nao sao aceitos pelo builder;
- valor negativo e qualquer operacao de resgate/aplicacao falham fechado;
- descricao isolada nao concede elegibilidade;
- a categoria final e fixada no catalogo autorizado `Investimentos`;
- a conta final pertence ao mesmo titular da decisao;
- aplicacao e resgate continuam no Gate 38.5 como transferencias patrimoniais
  neutras, nunca como entradas.

## Idempotencia e seguranca de escrita

- proposal ref, operation key e transaction ref possuem namespaces proprios;
- ingestao repetida reaproveita a proposta duravel;
- somente o segundo `sim` alcança o executor comum;
- revogacao, replay, restart, concorrencia, recibo e resultado incerto usam as
  barreiras ja provadas do finalizador comum;
- qualquer divergencia final de fonte, operacao, geracao, revisao,
  reconciliacao ou catalogo bloqueia a escrita.

## Evidencia local

- RED inicial: modulo de produto ausente;
- focal Gate 38.6: `3/3`;
- entrada publica real no `messageHandler`: `1/1`;
- bateria causal afetada: `223/223`;
- unica suite hermetica ampla final: `1628` testes, `1618` aprovados, zero
  falhas e `10` skips previstos;
- cobertura final: linhas `91,25%`, branches `73,73%`, funcoes `90,88%`;
- sintaxe e `git diff --check`: verdes;
- runner amplo valido, local e com guarda de rede.

As contagens sao evidencia local relatada pelo Codex, nao execucao do auditor.

## Arquivos causais

- `src/openFinance/openFinanceReviewedInvestmentIncomeSaveProposal.js`;
- `src/handlers/messageHandler.js`;
- `src/openFinance/openFinanceShadowPreviewStore.js`;
- `src/openFinance/openFinanceSaveProposalReviewStore.js`;
- `src/openFinance/openFinanceSaveProposalConversation.js`;
- `src/openFinance/openFinanceSaveProposalFinalization.js`;
- `src/ledger/canonicalLedgerReceiptProjector.js`;
- `tests/openFinanceInvestmentIncomeSaveProposal.test.js`;
- `tests/financialStateMachine.test.js`.

## Perguntas para auditoria

1. O patch prova que somente rendimento comprovado pode chegar a `Entradas`?
2. Principal, aplicacao e resgate permanecem impossiveis de classificar como
   ganho neste caminho?
3. O catalogo final preserva categoria e titular sem autorizacao indireta?
4. A prova publica atravessa handler, revisao, finalizador, writer e projetor
   reais e exige uma unica escrita depois do segundo consentimento?
5. Replay, restart, revogacao, concorrencia, recibo e resultado incerto
   permanecem cobertos pelo executor comum sem lacuna causal indispensavel?

Estado maximo antes do parecer: `CANDIDATO LOCAL VERDE; SEM DEPLOY`.
