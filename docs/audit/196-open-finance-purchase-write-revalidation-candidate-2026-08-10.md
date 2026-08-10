# Gate 38.1 - candidato de revalidacao da escrita de compras

Data: 2026-08-10

## Estado proposto

`CANDIDATO DE REVALIDACAO LOCAL VERDE; AGUARDA AUDITORIA INDEPENDENTE`.

Nenhuma flag foi alterada, nenhum deploy ocorreu e nenhuma escrita real foi
executada.

## Motivo da revalidacao

O nucleo de segunda confirmacao, revalidacao, idempotencia, recibo e rollback
ja recebeu `GO TECNICO LOCAL` nos hashes
`b98157dfde061793ad94cd025c99b1f8b5145712` e
`8fa365353c693c7ba34cde62d2a1a8799a3f41e0`. Desde entao, o writer, seu store
e a politica de ativacao nao mudaram. O handler publico passou a preservar e
avancar a fila numerica, portanto essa composicao precisa de parecer no HEAD
vigente antes do Gate 38.1.

## Fronteiras causais

- `revalidateOpenFinanceSaveProposal()` aceita apenas `purchase`, `POSTED`,
  `new`, nao parcelada e ainda ausente no ledger;
- `prepareOpenFinanceSaveProposalFinalization()` revalida e persiste
  `awaiting_confirmation` com zero escrita;
- apenas a resposta explicita seguinte executa a finalizacao;
- concorrencia, replay e restart compartilham operation key e recibo;
- `writing`/`uncertain` escolhem reconciliador, nunca writer de primeiro append;
- o handler preserva o lote durante revisao e finalizacao, reconhece o recibo e
  so depois abre a proxima revisao;
- nenhuma decisao de entrada, estorno, transferencia ou reserva chama este
  finalizador;
- a politica so habilita escrita na composicao completa de flags e o
  controlador exige confirmacoes operacionais antes de mutar o ambiente.

## Evidencia local

- politica, runtime, confirmacao, conversa, finalizacao e fila numerica:
  `94/94`;
- handler publico: fila numerica read-only e escrita unica com falha de envio de
  recibo/replay: `2/2`;
- suite hermetica anterior no mesmo codigo de produto, antes apenas de commits
  documentais: `1592/1582/0/10`, zero falhas;
- arvore limpa antes deste manifesto.

As contagens sao execucao local do Codex, nao execucao independente. A suite
ampla nao foi repetida porque nenhum codigo mudou depois da passagem verde.

## Limites

O parecer solicitado pode autorizar apenas `GO TECNICO LOCAL` para compra. Ele
nao autoriza producao, mudanca de flag ou escrita real. O smoke depende de
Daniel presente e continua uma etapa separada.

