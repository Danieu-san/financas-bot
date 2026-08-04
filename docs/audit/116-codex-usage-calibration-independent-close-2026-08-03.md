# CODEX-USAGE-CAL-01 — fechamento independente

Data: 2026-08-03

## Candidato auditado

Hash imutavel: `da331b83c4100bd79a0b434d93d20e7785b08967`.

Arquivos confirmados pelo auditor:

- `docs/audit/115-codex-usage-calibration-adoption-proof-candidate-2026-08-03.md`;
- `scripts/agent/Manage-CodexUsageTelemetry.ps1`;
- `tests/codexTelemetryCollector.test.js`.

## Parecer independente

O auditor informou leitura integral dos tres arquivos no mesmo hash. A prova
positiva foi classificada como suficiente porque executa o manager PowerShell
real, entra em `adopted_existing`, exige o marcador verdadeiro, recria o estado
instalado, conserva backup existente e preserva a configuracao byte a byte.

A prova adversarial tambem foi classificada como suficiente: a diferenca apenas
de BOM no unico backup provoca recusa, sem alteracao da configuracao corrente e
sem recriacao de `install-state.json`. O filesystem temporario apenas isola a
execucao; nao substitui a decisao do manager.

Achados por severidade: nenhum. Lacuna indispensavel residual: nenhuma no
escopo probatorio. A contagem local `18/18` nao foi tratada como execucao do
auditor.

## Veredito e alcance

`CODEX-USAGE-CAL-01: GO TECNICO LOCAL`.

O GO autoriza iniciar a calibracao prospectiva por objetivo. Nao autoriza
deploy, producao, escrita financeira ou inferencia retroativa de consumo.
