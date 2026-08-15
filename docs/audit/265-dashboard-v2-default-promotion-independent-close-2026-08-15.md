# Dashboard v2 como painel padrão — fechamento independente

Data: 2026-08-15

## Artefato auditado

Commit imutável:
`28f106d4e9b150cd7e04f589075d3eb873e7cc25`.

Manifesto:
`docs/audit/264-dashboard-v2-default-promotion-candidate-2026-08-15.md`.

## Evidência local do Codex

- RED causal confirmou que o comando simples ainda emitia v1;
- prova focal de comando: 10/10;
- contratos de autenticação, API, privacidade, fonte e composição: 41/41;
- suíte hermética ampla: 1.727 testes, 1.717 aprovados, zero falha e 10 skips
  esperados; cobertura de linhas 91,53%;
- sintaxe, diff e workflow: verdes.

As contagens acima são execução local do Codex, não do auditor.

## Parecer independente

O Chat confirmou o hash e os arquivos indicados e emitiu
`GO TÉCNICO LOCAL`.

O parecer registrou:

- `CRITICAL 0`, `HIGH 0`, `MEDIUM 0` e nenhum `LOW` bloqueante;
- o comando padrão solicita v2, os comandos v1 solicitam a versão anterior e
  a flag desligada produz v1 com aviso visível;
- as rotas e APIs v1 continuam servidas; uma URL v2 antiga recebe 404 quando a
  flag está desligada, coerente com o rollback do comando;
- testes unitários exercitam o handler real, o funcional atravessa a entrada
  pública, autenticação usa o builder real e contratos sobem o servidor real;
- serviços reais cobrem composição e verdade financeira sem prova circular;
- o diff não altera autenticação, servidor, fontes, cálculo, escopo ou escrita;
- nenhuma lacuna indispensável residual existe para a promoção local;
- o gate futuro do ADR-002 permanece pré-existente e fora deste escopo.

O auditor tratou as contagens locais apenas como evidência relatada.

## Veredito consolidado

`DASHBOARD-V2-DEFAULT: GO TÉCNICO LOCAL`.

O parecer autoriza preparar a promoção controlada na OCI sob a autorização de
release já concedida por Daniel. V1 e `DASHBOARD_V2_ENABLED=false` permanecem
rollback obrigatório. O deploy ainda exige artefato imutável, preservação de
estado, checksums, saúde e smoke do comando real.
