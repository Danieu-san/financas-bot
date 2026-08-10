# Gate 38.5 - fechamento independente da escrita de reserva

Data: 2026-08-10

## Hashes auditados

- candidato funcional: `563abac60c467694a48a42ea410d3f5718b54c2d`;
- pacote focal de acesso: `27e0295a4f7ea1a27e4c7208a9e7ded4cf4f6492`.

## Veredito

`GO TECNICO LOCAL; SEM DEPLOY`.

A reauditoria independente leu integralmente o pacote focal, o manifesto e o
patch tecnico. Confirmou que o segundo hash altera somente documentacao e
checkpoints e que o patch funcional sustenta a cadeia publica real ate o writer
e o projetor. O parecer registrou zero achados bloqueantes e nenhuma lacuna
indispensavel residual no escopo local.

## Semantica financeira fechada

- somente decisoes duraveis `reserve_application` e `reserve_redemption` de
  observacoes atuais `POSTED/new` podem ser promovidas;
- conta bancaria e reserva sao distintas, tipadas e do mesmo titular;
- aplicacao e resgate preservam a direcao e geram uma unica linha em
  `Transferencias`;
- o ledger canonico classifica o resultado como transferencia patrimonial
  neutra, com impacto liquido zero e fora de receita, despesa, meta e verba
  livre;
- `investment_income` e principal sem semantica comprovada permanecem fora;
- o segundo `sim` e o unico caminho ao writer; revalidacao, operation key,
  recibo, replay, restart, revogacao, concorrencia e resultado incerto impedem
  regravacao.

## Evidencia local confrontada

- bateria focal: `6/6`;
- caminho publico real: `1/1`;
- bateria causal afetada: `246/246`;
- unica suite hermetica ampla final: `1624/1614/0/10`, zero falhas;
- cobertura: linhas `91,22%`, branches `73,76%`, funcoes `90,85%`;
- workflow, sintaxe e diff check verdes.

As contagens sao execucao local relatada pelo Codex, nao execucao do auditor.

## Alcance

O fechamento e exclusivamente tecnico local. Nenhuma flag, planilha, sessao
WhatsApp, Pluggy ou servidor real foi alterado. Producao continua com escrita
desligada. O proximo gate autorizado e o 38.6, rendimento de investimento como
ganho separado de principal, aplicacao e resgate.
