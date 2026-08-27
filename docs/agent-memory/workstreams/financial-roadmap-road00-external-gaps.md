# ROAD-00.6 — Lacunas externas registradas

Data: 2026-08-27
Workstream: `financial-roadmap-road00`
Status: `COMPLETE — GAPS REGISTERED, NOT GUESSED`

ROAD-00 não exige resolver estas lacunas por inferência. O objetivo desta etapa é impedir que fases seguintes tratem ausência de evidência como fato.

| ID | Lacuna | Estado | Evidência disponível | O que NÃO pode ser afirmado ainda | Gate que deverá resolver |
| --- | --- | --- | --- | --- | --- |
| EXT-CARD-ATACADAO-01 | vínculo Atacadão `Pluggy -> alias -> card_id -> closing/due` | `UNKNOWN / EXTERNAL_REQUIRED` | código aceita contas/cartões em fluxos Open Finance e catálogo de cartões existe na planilha | que o novo cartão já está corretamente mapeado no WhatsApp ou que exige alteração de código | ROAD-04C, com leitura autorizada da topologia real |
| EXT-AUDIO-01 | primeira fronteira real quebrada no áudio WhatsApp | `UNKNOWN / EXTERNAL_REQUIRED` | pipeline estático possui download, retry, reaquisição, ffmpeg, Gemini e retorno textual; existe relato real de falha | se a causa é WhatsApp media, codec, ffmpeg, provider, timeout, quota, resposta vazia ou retomada do handler | ROAD-AUDIO-01, marker-only e logs sanitizados |
| EXT-SCHEMA-LIVE-01 | quais planilhas existentes ainda têm headers antigos | `UNKNOWN / EXTERNAL_REQUIRED` | template atual e reader contracts foram congelados em ROAD-00.5 | que toda planilha real corresponde ao template atual ou que qualquer migração é segura | ROAD-01, inspeção/migração controlada |
| EXT-BILLING-PROVENANCE-01 | origem histórica de `Mês de Cobrança` por linha | `UNKNOWN / EXTERNAL_REQUIRED` | coluna existe; writers históricos podem tê-la projetado por fechamento configurado | que uma célula preenchida é `statement_confirmed` | ROAD-02, provenance e precedence |
| EXT-BALANCE-COVERAGE-01 | cobertura acumulada suficiente para saldo `as_of` | `UNKNOWN / EXTERNAL_REQUIRED` | opening balance + movimentos existem em fontes atuais | que recorte mensal ou conjunto parcial representa saldo atual | ROAD-03A, contrato de coverage/as_of |
| EXT-PHASE8-RUNTIME-01 | heartbeat/retention/rotation atuais da telemetria Fase 8 | `UNKNOWN / EXTERNAL_REQUIRED` | mecanismo estático existe; última observação útil é histórica | que ausência de evento atual significa uso zero ou que janela histórica continua válida | ROAD-08 por consumer antes de qualquer retirement |
| EXT-LEGACY-AUTH-01 | uso real atual de `legacy_auth_utility` | `UNKNOWN / EXTERNAL_REQUIRED` | última evidência histórica tinha somente probes sintéticas | que o candidato pode ser soft-disabled/removido | ROAD-08 com telemetria saudável e janela válida |
| EXT-DASHBOARD-ADOPTION-01 | adoção atual v1/v2 sob telemetria de retirement | `UNKNOWN / EXTERNAL_REQUIRED` | checkpoints mais recentes indicam evolução do v2; janela Fase 8 antiga está stale | que v1 é morto ou que v2 tem paridade/adoption suficiente para retirada | ROAD-08/09 por consumer |
| EXT-CARD-ROUTES-01 | uso atual de rotas legadas/unified-first de cartões | `UNKNOWN / EXTERNAL_REQUIRED` | evidência histórica mostrou uso legado relevante | que cartão é candidato a retirada | ROAD-08B/09/08C por consumer |
| EXT-WRITERS-OF-01 | estado runtime atual dos writers Open Finance | `UNKNOWN / EXTERNAL_REQUIRED` | checkpoints históricos registram write off e gates locais por classe | que qualquer writer está ativo ou pronto para ampliação | ROAD-07, revalidação explícita antes de writer |
| EXT-RELEASE-FLAGS-01 | release e flags realmente ativos em 2026-08-27 | `UNKNOWN / EXTERNAL_REQUIRED` | checkpoints de produção anteriores existem | que o commit/flag histórico ainda é o runtime corrente | primeiro gate operacional que necessitar runtime; não é requisito para inventário estático |

## Regra de propagação

Cada gate posterior que tocar uma destas lacunas deve carregar o ID correspondente e substituir `UNKNOWN` apenas por evidência autorizada e datada. Uma lacuna não resolvida não pode ser silenciosamente convertida em `confirmed`, `zero`, `unused`, `healthy` ou `ready`.

## Resultado 00.6

`ROAD-00.6 COMPLETE`: todas as lacunas exigidas pelo plano foram registradas, receberam estado explícito e foram roteadas para o gate que pode resolvê-las. Nenhum acesso externo, mudança de flag, deploy, writer, migração, onboarding ou correção foi executado.
