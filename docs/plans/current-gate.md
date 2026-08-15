# Gate ativo - desativacao do check diario das 09:05

Atualizado em: 2026-08-15

## Estado

`GATE 43 E DASHBOARD V2 EM GO DE PRODUCAO; CHECK 09:05 EM DIAGNOSTICO`.

## Objetivo

Desativar somente a mensagem operacional `FinancasBot - check diario` enviada
as 09:05, sem afetar os resumos de agenda/financeiro nem outros agendamentos.

## Escopo

- localizar o job e sua fronteira de envio;
- desativar o envio por configuracao ou codigo com teste causal;
- preservar todos os demais jobs e mensagens programadas.

## Nao escopo

- mudar horarios ou conteudo de outros resumos;
- alterar dados financeiros, RX ou Open Finance;
- revisar o limite mensal nesta etapa.

## Invariantes

1. Somente o check operacional das 09:05 deixa de ser enviado.
2. Resumos matinal/noturno e demais crons permanecem ativos.
3. Nenhum dado financeiro ou estado conversacional e alterado.

## Evidencia

- dashboard v2 encerrado em producao no hash
  `28f106d4e9b150cd7e04f589075d3eb873e7cc25`;
- WhatsApp mostra mensagens distintas de resumo as 07:00/20:00 e o check
  operacional `FinancasBot - check diario` as 09:05.

## Criterios de GO

1. Teste causal prova ausencia do envio das 09:05.
2. Testes preservam os demais agendamentos.
3. Auditoria independente confirma o escopo do diff.

## Condicoes de parada

- o check compartilhar uma fronteira inseparavel com outro resumo;
- a alteracao afetar qualquer escrita financeira ou outro job.

## Proxima acao

Mapear o agendamento e criar prova causal focal antes da alteracao.
