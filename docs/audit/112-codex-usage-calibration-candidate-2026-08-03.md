# CODEX-USAGE-CAL-01 — coletor local privado de telemetria

Data: 2026-08-03

## Veredito local

`CANDIDATO LOCAL; AUDITORIA INDEPENDENTE PENDENTE; MEDICAO REAL PENDENTE DE REINICIO`.

O candidato habilita a exportacao OTel opt-in do Codex para um receptor
OTLP/HTTP local. Ele mede somente metadados allowlisted necessarios para as
quatro tarefas prospectivas de calibracao e nao altera o runtime do
FinancasBot, a OCI ou qualquer integracao financeira.

## Controles de privacidade e isolamento

- o servidor recusa bind fora de loopback e requisicoes remotas;
- somente `/v1/logs`, `/v1/metrics` e `/health` sao aceitos;
- payload JSON bruto nunca e persistido;
- prompt, comando, patch, resultado de ferramenta, mensagem, host e identidade
  de conta nao pertencem a allowlist;
- strings permitidas recusam espacos, barras e arroba, evitando caminhos,
  e-mails e texto livre mesmo em uma chave allowlisted;
- o corpo de log so pode fornecer um nome no formato limitado `codex.*`;
- a CLI recusa armazenamento dentro do repositorio;
- arquivos locais usam modo restrito quando suportado e ficam em
  `%LOCALAPPDATA%\FinancasBot\codex-usage-calibration`;
- `event_id` deterministico evita dupla contagem sem conservar o payload bruto.

## Operacao e atribuicao

`Manage-CodexUsageTelemetry.ps1` instala um bloco `[otel]` com backup da
configuracao global, `log_user_prompt=false`, JSON, endpoints `127.0.0.1` e
traces desligados. O processo e iniciado oculto e o stop valida PID e linha de
comando antes de encerrar.

O objetivo ativo e um identificador tecnico restrito. Estado ausente, invalido
ou encerrado produz evento nao atribuido. Ausencia de metrica permanece
`NAO_DISPONIVEL`, nunca zero. O resumo agrega somente contagens por objetivo,
tipo de telemetria, metricas de token e eventos de ferramenta.

## Evidencia executada localmente

- RED inicial: falha esperada por modulo ainda ausente;
- `node --check` em coletor, teste e validador: verde;
- parse de `Manage-CodexUsageTelemetry.ps1`: verde;
- `npm run test:codex-usage-calibration`: `7/7` verde;
- `node scripts/agent/validateAgentWorkflow.js`: verde;
- instalacao temporaria: backup unico, bloco OTel e prompt desligado;
- processo local reforcado: configurado, running e health verdes;
- `git diff --check` e varredura dirigida de segredos: verdes.

## Arquivos da revisao

- `scripts/agent/codexTelemetryCollector.js`;
- `scripts/agent/Manage-CodexUsageTelemetry.ps1`;
- `tests/codexTelemetryCollector.test.js`;
- `AGENTS.md`;
- `scripts/agent/validateAgentWorkflow.js`;
- `docs/agent-memory/workstreams/codex-usage-calibration.md`;
- `docs/plans/workstreams/codex-usage-calibration.md`;
- `docs/agent-memory/workstreams/index.md`;
- `package.json`.

## Limites e proximo estado

Testes sinteticos provam sanitizacao, atribuicao e operacao do receptor, mas nao
provam que este processo Codex ja emitiu OTel: a configuracao foi instalada
depois de seu inicio. Somente apos auditoria independente, reinicio do Codex e
observacao real sanitizada o gate pode fechar e iniciar `RX-HIST-SEG-01`.
