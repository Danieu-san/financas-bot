# Estado — ROAD-00 Baseline verificável, Golden Set e inventário total

Atualizado em: 2026-08-27
Status: `ROAD-00 00.1..00.6 COMPLETE — CANDIDATO AGUARDANDO REVISÃO INDEPENDENTE`
Branch: `chat/financial-roadmap-road00-20260827`
Roadmap canônico: `docs/plans/workstreams/financial-roadmap-canonical.md`
Conteúdo normativo aprovado: `docs/plans/workstreams/financial-roadmap-draft-v2.md` blob `904d652fc1931ff5c80d6c1066ac5f57a96f5b84`

## Objetivo

Criar o ponto de verdade operacional antes de qualquer correção transversal: inventário datado de capacidades/consumidores/fontes/fallbacks/flags/telemetria/shadows/rollback, Golden Set sanitizado, fixtures de schema e classificação explícita das lacunas externas.

## Artefatos produzidos

- `docs/agent-memory/workstreams/financial-roadmap-road00-inventory.md` — ROAD-00.1/00.2;
- `docs/agent-memory/workstreams/financial-roadmap-road00-golden-set.json` — ROAD-00.3;
- `docs/agent-memory/workstreams/financial-roadmap-road00-telemetry-health.md` — ROAD-00.4;
- `docs/agent-memory/workstreams/financial-roadmap-road00-schema-fixtures.json` — ROAD-00.5;
- `docs/agent-memory/workstreams/financial-roadmap-road00-external-gaps.md` — ROAD-00.6;
- `docs/agent-memory/workstreams/financial-roadmap-road00-close-candidate.md` — candidato para auditoria independente.

## Estado por etapa

### ROAD-00.1 — COMPLETE

Autoridade estática congelada com branch/HEAD, roadmap canônico e classes `VERIFIED`, `STALE`, `UNKNOWN` e `NOT_APPLICABLE`. Release/flags reais não foram inventados.

### ROAD-00.2 — COMPLETE

Matriz `capability -> consumer -> source -> fallback -> telemetry -> rollback` cobre WhatsApp, pipeline analítico, personal_sheet, ARQ, read model, dashboard, cartões, writers, importação, metas/dívidas, Projected Plans, scheduler, Open Finance, áudio, manutenção, auth/OAuth e retirada de legado. Consumers mutáveis estão explícitos.

### ROAD-00.3 — COMPLETE

Golden Set sintético/sanitizado cobre identidade de cartão, competência/fatura, antes/no/depois do fechamento, compra 6x, projeção, refund, pagamento de fatura, transferência, recorrência, saldo completo/incompleto, budget dia/ciclo, unavailable vs zero, personal_sheet, follow-up, áudio marker-only/falha e double-count. Todos os casos têm `domain`, `metric`, `operation`, `timeBasis`, `scope`, `expected_source`, `evidence_state` e `expected_side_effects`.

### ROAD-00.4 — COMPLETE

Telemetria Fase 8 recebeu classificação datada sem falso zero. Mecanismo estático de heartbeat/rotação/backups existe, mas saúde do runtime atual ficou `UNKNOWN`; evidência de `legacy_auth_utility`, cartões e dashboard ficou `STALE/UNKNOWN` quando não revalidada. Nenhum consumer foi promovido a retirada.

### ROAD-00.5 — COMPLETE

Fixtures congelam template atual, ranges/índices de readers e view de compatibilidade de cartão. Headers de planilhas reais existentes permanecem `UNKNOWN_EXTERNAL_REQUIRED`; nenhuma migração foi executada.

### ROAD-00.6 — COMPLETE

Lacunas externas foram registradas para Atacadão/Pluggy, áudio real, schema real, provenance de `Mês de Cobrança`, coverage de saldo, telemetria Fase 8, `legacy_auth_utility`, dashboard, cartões, writers Open Finance e release/flags atuais. Cada lacuna foi roteada para gate futuro; nenhuma foi resolvida por inferência.

## Invariantes preservados

- nenhuma alteração em `src/`, `scripts/`, `tests/` ou configuração de runtime;
- nenhum deploy/restart/flag;
- nenhum acesso a segredo ou dado financeiro privado;
- nenhuma escrita financeira;
- nenhuma migração de schema;
- nenhuma retirada ou soft-disable de legado;
- nenhum onboarding real do Atacadão;
- nenhuma correção do áudio;
- ROAD-K0 continua bloqueado até parecer independente.

## Gate de saída

1. matriz de autoridade e consumers — `SATISFIED`;
2. Golden Set versionado — `SATISFIED`;
3. telemetria Fase 8 classificada com saúde datada — `SATISFIED` com `UNKNOWN/STALE` onde não houve runtime;
4. fixtures de schema congeladas — `SATISFIED`;
5. shadows/canários/flags relevantes datados ou `UNKNOWN` — `SATISFIED`;
6. lacunas externas registradas — `SATISFIED`;
7. revisão independente — `PENDING`;
8. nenhuma alteração funcional — `SATISFIED`.

## Próxima ação

Executar uma única revisão independente do candidato ROAD-00 por hash imutável. Se o parecer for GO sem lacuna indispensável, registrar o fechamento de ROAD-00 e somente então abrir ROAD-K0. Se houver NO-GO, corrigir apenas o artefato documental afetado e reauditar.

## Capacidade

`Codex App -> capacidade atual -> Alto -> revisar adversarialmente o candidato ROAD-00; zero produção e zero implementação`.
