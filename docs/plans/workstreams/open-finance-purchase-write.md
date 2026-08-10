# Gate 38.1 - escrita gradual de compras Open Finance

Atualizado em: 2026-08-10

Estado: `CANDIDATO DE REVALIDACAO LOCAL VERDE; AGUARDA AUDITORIA`.

## Objetivo

Revalidar no HEAD vigente a capacidade ja implementada de salvar somente uma
compra Open Finance depois de revisao guiada e segunda confirmacao explicita,
antes de qualquer ativacao real.

## Contrato da classe compra

- somente proposta `purchase`, `POSTED`, `new`, nao parcelada e ainda autorizada;
- o primeiro aceite abre a revisao e nunca escreve;
- a revisao completa produz uma revalidacao nova da fonte, do ledger e do
  catalogo;
- somente o segundo `sim`, em estado `awaiting_confirmation`, pode chamar o
  writer;
- a operation key e estavel, o recibo e duravel e concorrencia/replay produzem
  no maximo um append;
- estado `writing` ou `uncertain` usa somente reconciliacao, nunca novo append;
- revogacao, expiracao, fonte alterada, catalogo alterado ou correspondencia no
  ledger invalidam sem escrita;
- fila numerica avanca um item por vez e nunca confirma o seguinte por heranca;
- entradas, estornos, transferencias e reservas permanecem read-only e nao
  possuem caminho para este writer;
- `OPEN_FINANCE_WRITE_MODE=off` e aprovacao falsa continuam defaults e rollback.

## Evidencia reutilizada e atual

O writer, o store de finalizacao e a politica de ativacao nao mudaram desde os
GOs independentes de 9P.4 e da composicao fail-closed. O handler publico mudou
para suportar fila numerica e estado duravel; por isso a composicao atual foi
revalidada focalmente.

- modulos causais atuais: `94/94`;
- caminhos publicos selecionados: `2/2`;
- suite hermetica mais recente no mesmo codigo de produto: `1592/1582/0/10`;
- `financial_writes=0` no ambiente e nenhuma flag foi alterada.

## Gate de saida local

Commit sanitizado e imutavel, auditoria independente do codigo atual e ausencia
de lacuna causal indispensavel. Isso autoriza apenas o `GO TECNICO LOCAL` da
classe compra.

## Fronteira de producao

Ativacao `confirm`, deploy, restart e smoke real ficam bloqueados ate Daniel
estar presente para revisar a compra, emitir a segunda confirmacao e conferir o
recibo e a planilha. O controlador deve validar o commit OCI, preservar estado,
manter rollback imediato para `write-off` e nunca usar AWS.

