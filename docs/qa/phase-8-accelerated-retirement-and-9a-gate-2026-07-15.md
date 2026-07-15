# Gate: retirada acelerada da Fase 8 e abertura da Fase 9A

Data: 2026-07-15

## Veredito

- `GO` para politica de soft-disable acelerado e reversivel;
- `GO` para encerrar a pesquisa 9A e iniciar 9B somente em sandbox;
- `NO-GO` para exclusao fisica antecipada sem os gates do ADR-008;
- `NO-GO` para API Pluggy paga, contas reais ou escrita financeira.

## Evidencia de observacao

Desde 2026-07-14:

- telemetria de cartoes `OBSERVING`, 39 heartbeats, 217 eventos, zero linha
  invalida e zero escrita;
- 45 leituras unificadas e 124 legadas;
- dashboard `OBSERVING`, sem sessao nova na amostra;
- gate analitico `GO`, 265/265 e migration gaps 6/6;
- uso historico do fallback analitico continua bloqueando retirada imediata.

O snapshot executavel esta em
`docs/qa/phase-8-accelerated-retirement-snapshot-2026-07-15.json`.
O relatorio atual classifica 1 item como candidato a soft-disable e zero para
exclusao fisica imediata.

## Decisao de prazo

A janela de 60 dias deixa de bloquear trabalho e passa a proteger apenas a
exclusao fisica dos perfis de maior risco. Read-only pode entrar em soft-disable
apos 7 dias; periodico apos 14 dias e dois ciclos simulados. Mutacao e fonte de
rollback nao recebem atalho para exclusao.

## Fase 9A

Pesquisa oficial confirmou:

- API comercial de Dados a partir de R$ 2.500/mes: inviavel para o projeto;
- teste completo por 14 dias: util para produto comercial, mas nao atende o
  requisito permanente de custo zero;
- Meu Pluggy + Conector 200: caminho gratuito tecnicamente disponivel para os
  proprios dados, sem SLA, webhooks, categorizacao comercial ou portabilidade;
- sandbox oficial cobre sucesso, erros, MFA, QR, Open Finance e volume.

Decisao: POC 9B em sandbox, adapter substituivel e staging sem escrita. A
hipotese real futura exige contas e consentimentos separados de Daniel e Thais.

## Proximo passo

Implementar 9B.0: contrato local do provider, fixtures oficiais sanitizadas,
store de staging descartavel e testes de idempotencia/revogacao. Nenhuma chave,
conta real ou deploy produtivo do conector.
