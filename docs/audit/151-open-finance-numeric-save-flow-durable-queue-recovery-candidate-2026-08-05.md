# OF-NUMERIC-SAVE-01 - recovery da fila duravel

Data: 2026-08-05

## Origem do recovery

O candidato `a10931d8f8cdb2291ffe0b39927778cb71a9f46d` recebeu `NO-GO`
independente. O auditor confirmou transporte, reserva familiar e semantica da
selecao, mas encontrou uma lacuna `HIGH`: a transicao entre terminalizar a
revisao corrente e abrir o proximo item removia o estado auxiliar antes de
persistir o sucessor. Como o state store fazia flush ordinario a cada 60
segundos, uma queda nessa janela podia deixar propostas reservadas sem fila
publicamente recuperavel. Tambem faltavam provas adversariais explicitas do
rollback de `accepted_unconfirmed` e `release` em lote.

## Correcao

- `userStateManager` expoe transicoes duraveis que sincronizam imediatamente o
  snapshot cifrado depois de `setState` ou `deleteState`;
- o binding inicial de proposta no runtime exige e usa `setStateDurably`;
- selecao, revisao e confirmacao Open Finance passam a persistir seus estados
  auxiliares antes de responder;
- se houver itens restantes, o handler grava primeiro
  `awaiting_open_finance_save_batch_continue` e somente depois tenta ativar a
  proxima revisao;
- a fila nunca e apagada antes de seu sucessor duravel: falha de catalogo,
  queda ou restart preservam o estado de continuacao;
- a retomada usa o handler publico real, reabre o estado cifrado do disco e
  revalida a reserva/revisao nos stores SQLite antes de continuar;
- termino sem itens restantes usa exclusao duravel;
- nenhum desses caminhos cria escrita financeira.

## Prova causal

O teste do handler publico agora:

1. rejeita `sim` para duas propostas e aceita `salvar 1 e 2`;
2. cancela a primeira revisao;
3. injeta indisponibilidade do catalogo exatamente antes do avanco;
4. exige o estado duravel `awaiting_open_finance_save_batch_continue`;
5. elimina o estado residente, reabre o snapshot cifrado do disco e exige a
   mesma fila;
6. remove a falha, envia `continuar` pela entrada publica e abre exatamente a
   segunda revisao;
7. exige fila vazia e `financial_writes=0`.

O teste focal do outbox tambem adultera um lease por vez em
`acknowledgeAcceptedBatch` e `releaseFailedBatch`; cada operacao deve falhar e
manter todas as linhas `in_flight`, antes do ACK valido do mesmo lote.

## Evidencia local do recovery

- syntax checks dos tres modulos de produto e das duas provas principais:
  verdes;
- `git diff --check`: verde;
- focal `gate 32`: 12/12;
- bateria causal com handler publico, runtime, outbox, preview e state store:
  171/171;
- suite hermetica ampla final: 1.530 testes, 1.520 aprovados, zero falhas e 10
  skips conhecidos;
- cobertura final: linhas 90,78%, branches 73,45% e funcoes 90,52%;
- a primeira ampla encontrou somente um fixture antigo que ainda oferecia
  `setState` ao runtime; depois de alinhar o mock ao novo contrato
  `setStateDurably`, o teste focal passou e a ampla substitutiva ficou verde;
- nenhuma chamada Pluggy real, planilha real, WhatsApp real, flag, deploy ou
  producao;
- contagens locais sao evidencia relatada e nao execucao do auditor.

## Invariantes preservados

- lote de no maximo quatro por destinatario;
- fan-out familiar nao reduz o limite do outro telefone;
- `sim` continua invalido para lote e valido para proposta unica;
- o primeiro conjuge reserva o item;
- cada item exige revisao, revalidacao e confirmacao final individuais;
- omitidos nao recebem decisao implicita;
- transporte ambiguo nao vincula conversa;
- corte operacional `2026-07-28` e RX historico `2025-07-01` permanecem
  separados;
- `financial_writes=0` antes da confirmacao final;
- flags e producao permanecem intocadas.

## Estado maximo

`Recovery candidato aguardando nova auditoria independente por hash imutavel`.
Este documento nao autoriza ativacao, deploy, smoke ou producao.
