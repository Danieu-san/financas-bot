# PHASE8-OBS-01 - prova de rotacao da telemetria

Data: 2026-07-30

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

Este gate corrige somente a leitura da evidencia de observacao. Ele nao
autoriza soft-disable, exclusao, alteracao de flag, restart ou deploy.

## Problema reproduzido

`scripts/reportLegacyTripwireObservation.js` lia apenas o arquivo JSONL ativo.
Os relatorios de cartoes e dashboard ja liam o arquivo ativo e seus backups
rotacionados. Assim, um uso real presente somente em `.1` poderia ser omitido e
o relatorio poderia declarar zero indevidamente.

O teste causal grava:

- heartbeat no arquivo ativo;
- tripwire `real_user` de `legacy_auth_utility` no backup `.1`.

Antes da correcao, o relatorio devolvia `files_read` ausente e zero para esse
tripwire. Depois da correcao, exige dois arquivos lidos, um tripwire e um evento
`real_user`.

## Correcao

O relatorio passou a usar o mesmo carregador limitado de rotacoes empregado
pelos relatorios de adocao do dashboard e de cartoes. O limite continua vindo
de `LEGACY_USAGE_TELEMETRY_MAX_BACKUPS`, com default quatro.

O agregado continua expondo somente contagens allowlisted. Linhas invalidas de
qualquer rotacao sao contabilizadas e impedem que a instrumentacao seja tratada
como prova limpa.

## Evidencia local

- RED causal reproduzido: `1/2`, com falha exclusiva no arquivo rotacionado;
- focal apos a correcao: `20/20`;
- sintaxe e `git diff --check`: verdes.

## Evidencia OCI somente leitura

Producao continua na Oracle/OCI, executando o marcador imutavel
`a874e3706c3c508f05fb875543eb77c772035f44`, sem alteracao remota.

Antes desta correcao local, os arquivos implantados de tripwire, politica,
wrapper de autenticacao, relatorio e testes focais possuíam os mesmos SHA-256
da base local. Este candidato altera deliberadamente apenas o relatorio e seu
teste causal; ele ainda nao foi implantado.

Desde `2026-07-16T18:34:25Z`, os dois arquivos rotacionados observados
continham:

- 11.774 linhas no total;
- 406 heartbeats por contagem textual allowlisted;
- duas ocorrencias de `legacy_auth_utility`, ambas `synthetic`;
- zero ocorrencia `real_user` ou `production_replay` para o candidato.

O campo `source=runtime` das duas probes descreve o ponto instrumentado; nao
substitui `evidence_type=synthetic` e nao constitui uso real.

O relatorio oficial anterior nao e aceito como prova completa desse periodo
porque leu somente o arquivo ativo. A contagem dos dois arquivos sustenta apenas
a caracterizacao do problema e a selecao do candidato; o relatorio corrigido
ainda nao foi implantado.

Cartoes permanecem fora do candidato, com 8.216 leituras legadas e 2.102
unificadas. Dashboard v1 teve tres eventos; v2 teve zero. Nenhum deles pode ser
desligado com esta evidencia.

## Arquivos para auditoria

- `scripts/reportLegacyTripwireObservation.js`;
- `tests/legacyTripwireObservationReport.test.js`;
- `src/telemetry/dashboardAdoptionReport.js`;
- `src/telemetry/cardSheetUsageReport.js`;
- `src/reliability/legacyEntrypointTripwire.js`;
- `src/reliability/legacyRetirementPolicy.js`;
- `src/utils/auth.js`;
- este manifesto.

## Criterio de fechamento

Auditoria independente deve confirmar que:

1. backups rotacionados entram no agregado na ordem limitada esperada;
2. uso real arquivado nao pode ser omitido;
3. linhas invalidas continuam visiveis;
4. o teste executa o relatorio real;
5. nenhuma conclusao de soft-disable ou producao foi antecipada.
