# Gate 38.5 - pacote focal de acesso para reauditoria

Data: 2026-08-10

## Finalidade

Este documento resolve somente a lacuna de acesso da auditoria do commit
`563abac60c467694a48a42ea410d3f5718b54c2d`. O Chat leu o manifesto 210,
confirmou diretamente propriedades do builder, caminho publico, catalogo,
store e testes, mas respondeu `ACESSO INSUFICIENTE` porque o prompt exigia a
leitura integral de dez arquivos, inclusive arquivos monoliticos.

Nenhum codigo mudou depois da suite hermetica verde.

## Cadeia imutavel

- pai tecnico: `927d0b8fe8a3d28f52c9d8538dca78d00b6f2987`;
- candidato tecnico: `563abac60c467694a48a42ea410d3f5718b54c2d`;
- patch publico integral:
  `https://github.com/Danieu-san/financas-bot/commit/563abac60c467694a48a42ea410d3f5718b54c2d.patch`;
- manifesto tecnico:
  `docs/audit/210-open-finance-reserve-write-candidate-2026-08-10.md`.

O patch imutavel contem integralmente todas as linhas acrescentadas ou
alteradas em produto, testes, manifesto e checkpoints. Este pacote nao resume
nem substitui o patch; apenas delimita como ele deve ser lido.

## Delta causal contido no patch

1. Um builder novo aceita somente revisao duravel de reserva decidida como
   `reserve_application` ou `reserve_redemption`, fonte bancaria `POSTED/new`,
   geracao, fingerprint, operacao do provedor, escopo e sinal coerentes.
2. O handler publico promove somente essas duas decisoes para a proposta e
   mantem zero escrita antes da revisao guiada.
3. Catalogo, store e conversa distinguem conta bancaria/poupanca de reserva,
   restringem ambas ao mesmo titular e filtram origem/destino pela direcao.
4. Shadow store e finalizacao preservam identidade, ator, geracao, fonte,
   lifecycle, reconciliacao, decisao e catalogo ate o segundo `sim`.
5. O plano final cria uma unica linha em `Transferencias`, com relacao canonica
   `reserve_application` ou `reserve_redemption` e operation key estavel.
6. O projetor canonico converte a forma legada de Caixinha em transferencia
   neutra, com contas distintas, impacto liquido zero e sem receita, despesa,
   meta ou verba livre.
7. A prova publica atravessa `messageHandler`, revisao, segundo `sim`, writer,
   replay e restart; a prova focal cobre ambas as direcoes, revogacao, contas
   invertidas, idempotencia e recibo canonico.

## Evidencia local preservada

- syntax check: verde;
- focal do Gate 38.5: `6/6`;
- caminho publico real: `1/1`;
- bateria causal: `246/246`;
- suite hermetica final: `1624/1614/0/10`, zero falhas;
- cobertura: linhas `91,22%`, branches `73,76%`, funcoes `90,85%`;
- `git diff --check`: verde.

As contagens sao evidencia local relatada, nao execucao do auditor. Como este
recovery altera apenas documentacao probatoria, elas permanecem validas e nao
foram repetidas.

## Escopo da reauditoria

A reauditoria deve ler integralmente este pacote, o manifesto 210 e o patch
publico integral. Pode consultar qualquer arquivo no mesmo hash quando desejar,
mas nao deve exigir a leitura monolitica de arquivos preexistentes que o patch
nao alterou integralmente.

O hash deste pacote prova apenas a evidencia de acesso acrescentada depois do
candidato. Ele nao modifica nem substitui o codigo tecnico auditado.

Estado maximo: `GO TECNICO LOCAL; SEM DEPLOY`.
