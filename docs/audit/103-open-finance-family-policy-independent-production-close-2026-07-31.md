# Open Finance — fechamento independente e produção da política familiar

Data: 2026-07-31

## Veredito independente

O Chat leu integralmente os seis arquivos públicos do commit
`33ab7969bf9ef4190a64f103e46b1ddce9ffe4b0` e emitiu `GO TÉCNICO LOCAL` para
`OF-FAMILY-ACT-01`.

Síntese do parecer:

- implementação suficiente;
- testes suficientes como desenho causal, sem tratar `33/33` como execução do
  auditor;
- nenhum achado crítico, alto ou médio;
- achado baixo: o SHA usado pelo harness é um fixture anterior, sem efeito na
  validação do commit real;
- nenhuma lacuna estática bloqueante;
- próximo estado autorizado: artefato imutável, `plan`, aplicação da política e
  smoke com uma próxima movimentação real nova;
- `confirm` continua bloqueado.

## Release OCI

- commit: `33ab7969bf9ef4190a64f103e46b1ddce9ffe4b0`;
- SHA-256 do artefato:
  `68ac2f4d24146cc71c011e9ff788ed0cf7ca9a6a70aec60cddb34a16e70db5b0`;
- manifesto: 723 arquivos, mesmo hash completo, sem estado ou segredo
  protegido;
- preparação isolada: `production_changed=false`;
- promoção: `promoted=true`;
- rollback: `false`;
- bootstrap de state store: `false`;
- script ativo:
  `/home/ubuntu/financas-bot/releases/33ab7969bf9ef4190a64f103e46b1ddce9ffe4b0/index.js`.

## Aplicação da política

O `plan` mostrou quatro fontes owner-only e exatamente quatro mudanças:

- `authorized_viewers` passa a conter somente Daniel e Thaís;
- `family_aggregation_allowed` passa a `true`;
- titular, destinatário principal e principal de confirmação permanecem
  inalterados;
- `financial_write_enabled=false`.

O controlador aplicou o plano com backup privado exato, health completo e sem
rollback. O plano posterior retornou `changed=0`.

## Evidência de produção

- PM2 único, online, zero reinícios instáveis;
- health local e público: SQLite verde e WhatsApp `ready/healthy`;
- proposta `prompt`, escrita `off`, aprovação `false`;
- ciclo pós-política: `GO`, `new=0`, quatro entregas aceitas sem id confirmado e
  `writes=0`;
- duas entregas cruzadas de fontes da Thaís para Daniel;
- duas entregas cruzadas de fonte do Daniel para Thaís;
- nenhum valor, descrição ou telefone foi registrado nesta evidência.

As quatro entregas comprovam que a política familiar ativa alcança o outro
cônjuge, mas são expansão de eventos já observados. Elas não substituem o smoke
causal completo de uma próxima movimentação real nova enviada aos dois
WhatsApps com a mesma referência lógica.

## Estado

`GO TÉCNICO LOCAL; POLÍTICA FAMILIAR ATIVA; SMOKE OPERACIONAL PARCIAL`.

`confirm` e qualquer escrita financeira continuam bloqueados. O próximo passo
é conferir as mensagens nos dois aparelhos e observar a próxima movimentação
real nova: os dois cônjuges devem receber a proposta, somente um pode tomar a
revisão e nenhuma linha pode ser criada enquanto write estiver `off`.
