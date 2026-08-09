# Gate 35 — fechamento humano do RX historico

Atualizado em: 2026-08-09

## Objetivo

Compor, sem reimplementar os nucleos ja auditados, um fluxo operacional privado
e reversivel que:

1. gere a revisao numerada somente a partir do RX e do snapshot privado exatos;
2. entregue a revisao apenas aos dois atores familiares autorizados;
3. consuma somente decisoes duraveis e completas;
4. recalcule o RX read-only contra a mesma identidade de origem;
5. separe o que foi resolvido, o que continua ambiguo e o que permanece
   inelegivel, sem inferir parcelas ou semantica de investimento;
6. preserve `financial_writes=0` em todas as etapas.

## Dependencia excepcional

O Gate 34 permanece funcionalmente pendente e observavel em paralelo. Por
decisao explicita de Daniel, isso nao impede a preparacao e a validacao local do
Gate 35. Esta excecao nao autoriza alterar a janela vigente, ativar a revisao em
producao, recalcular dados privados reais ou habilitar escrita.

## Reuso obrigatorio

- `buildOpenFinanceHistoricalAmbiguityReview` para preparar o estado cifrado;
- `OpenFinanceHistoricalAmbiguityReviewStore` para decisoes familiares
  duraveis;
- `reconcileOpenFinanceHistoricalAmbiguityDecisions` para recalculo read-only;
- `buildOpenFinanceHistoricalRx` e seu inventario canonico como fonte do
  contrato temporal e patrimonial.

## Invariantes

- inicio historico `2025-07-01`; cutoff de alertas `2026-07-28` nao entra no RX;
- quatro fontes, cinco contas bancarias e quatro cartoes, mantendo conta,
  cartao, poupanca e investimento separados;
- snapshot, RX, revisao e decisoes devem compartilhar a mesma identidade HMAC;
- revisao parcial, expirada, adulterada ou de outro RX falha fechada;
- parcela ambigua e movimento de investimento contraditorio continuam
  bloqueados quando a decisao humana nao tiver evidencia suficiente;
- nenhuma descricao textual autoriza classificacao ou pareamento;
- nenhum caminho cria proposta financeira, altera planilha ou chama Pluggy;
- `OPEN_FINANCE_WRITE_MODE=off`, aprovacao falsa e `confirm` bloqueado.

## Primeira fatia local

Criar um orquestrador testavel que produza apenas um plano sanitizado de
preparacao ou de recalculo. Ele deve validar precondicoes antes de abrir stores,
usar os componentes reais, classificar o resultado sem dados privados e sempre
declarar `financial_writes=0`.

## Gate de saida local

- teste RED/focal e bateria causal afetada verdes;
- falhas antes e depois da persistencia comprovadamente fail-closed;
- restart e replay produzem o mesmo resultado;
- nenhuma mutacao de fonte e nenhum dado financeiro em stdout/log;
- uma unica suite hermetica ampla final;
- commit sanitizado publicado e auditoria independente por hash imutavel.

Somente depois desse GO pode ser planejada uma ativacao operacional privada. A
ativacao, a revisao humana real e o recalculo privado continuam sendo passos
separados e reversiveis; nenhum deles autoriza escrita financeira.
