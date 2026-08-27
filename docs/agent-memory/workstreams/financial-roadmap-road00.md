# Estado — ROAD-00 Baseline verificável, Golden Set e inventário total

Atualizado em: 2026-08-27
Status: `ROAD-00 OPEN — 00.1/00.2 COMPLETE; 00.3 NEXT`
Branch: `chat/financial-roadmap-road00-20260827`
Roadmap canônico: `docs/plans/workstreams/financial-roadmap-canonical.md`
Conteúdo normativo aprovado: `docs/plans/workstreams/financial-roadmap-draft-v2.md` blob `904d652fc1931ff5c80d6c1066ac5f57a96f5b84`
Inventário 00.1/00.2: `docs/agent-memory/workstreams/financial-roadmap-road00-inventory.md`
Commit do inventário: `4f472576e56cf4db8af9ef938213e7b38035686d`

## Objetivo

Criar o ponto de verdade operacional antes de qualquer correção transversal: inventário datado de capacidades/consumidores/fontes/fallbacks/flags/telemetria/shadows/rollback, Golden Set sanitizado e classificação explícita das lacunas externas.

## Estado de entrada preservado

- roadmap v2 confirmado explicitamente pelo usuário;
- revisão adversarial Codex concluída com `APROVÁVEL APÓS AJUSTES` e ajustes incorporados;
- síntese encerrada sem implementação de produto;
- roadmaps históricos, Fase 8, Fase 9/Open Finance e ARQ continuam evidências obrigatórias;
- telemetria histórica não será tratada como atual sem revalidação;
- Atacadão, causa do áudio, headers realmente antigos, provenance histórico de `Mês de Cobrança` e cobertura cumulativa de saldo continuam lacunas abertas.

## ROAD-00.1 — COMPLETE

A autoridade estática foi congelada no inventário:

- branch `chat/financial-roadmap-road00-20260827`;
- HEAD de entrada `2c97774c5be2b0d449e890bc19f48a7a3e130d88`;
- roadmap canônico e blob normativo aprovados;
- release/commit de produção e flags reais permaneceram `UNKNOWN`, porque nenhuma consulta de runtime foi feita;
- evidência histórica foi separada de evidência atual com estados `VERIFIED`, `STALE`, `UNKNOWN` e `NOT_APPLICABLE`.

## ROAD-00.2 — COMPLETE

O arquivo `financial-roadmap-road00-inventory.md` versiona a matriz
`capability -> consumer -> source -> fallback -> telemetry -> rollback` e inclui:

- WhatsApp textual, pipeline analítico legado/Financial Agent v1 e personal sheet;
- ARQ iterative read-only;
- central read model;
- dashboard v1/v2;
- cartões;
- writers de gasto/entrada/cartão;
- importação;
- metas/dívidas + Projected Plans;
- scheduler;
- Open Finance reconciliation e writers revisados;
- áudio;
- exclusão/manutenção/export/recibos;
- escopo/OAuth/membership;
- telemetria/tripwire e retirada de legado por consumer.

Consumidores mutáveis foram incluídos explicitamente. Nenhum foi alterado.

### Achados de baseline que carregam adiante

- ARQ, card unified-first, Projected Plans shadow, Open Finance reconciliation e dashboard v1/v2 já possuem trabalhos/shadows/canários históricos: não reconstruir do zero;
- Fase 8 possui mecanismo de telemetria com heartbeat/rotação/backups, mas a saúde atual continua `STALE/UNKNOWN` até revalidação;
- `legacy_auth_utility` continua apenas candidato histórico; cartões e dashboard não são candidatos de remoção;
- áudio possui pipeline estático completo, mas o relato real de falha mantém a funcionalidade em `UNKNOWN` até reprodução causal;
- Open Finance writers tinham produção `write off` no checkpoint de 2026-08-10; valor atual não foi inferido;
- release/runtime/flags reais, Atacadão, schema real e provenance histórica continuam lacunas externas explícitas.

## Dentro do escopo restante de ROAD-00

- construir Golden Set financeiro sanitizado;
- revalidar/classificar telemetria Fase 8 como `HEALTHY`, `STALE`, `BROKEN` ou `UNKNOWN` usando evidência autorizada;
- carregar estado individual vigente de `legacy_auth_utility` sem promover cartões/dashboard;
- congelar fixtures de versões de schema;
- registrar e, quando autorizado, resolver lacunas externas sem inferência.

## Fora do escopo

- corrigir código do produto;
- deploy/restart/promoção de flag;
- acesso a segredo ou dado privado não explicitamente autorizado;
- escrita financeira;
- migração de schema real;
- retirada ou soft-disable de legado;
- onboarding real do Atacadão;
- correção do áudio;
- avanço para ROAD-K0.

## Gate de saída

ROAD-00 recebe GO somente quando:

1. inventário de fontes/consumidores/fallbacks/telemetria/rollback estiver completo para os domínios tocados pelo roadmap — **00.2 COMPLETE no alcance estático**;
2. Golden Set sanitizado estiver revisado e versionado — **PENDENTE 00.3**;
3. consumidores mutáveis estiverem incluídos no mapa — **COMPLETE**;
4. telemetria Fase 8 tiver saúde atual classificada, sem falso zero — **PENDENTE 00.4**;
5. shadows/canários/flags conhecidos tiverem status datado ou `UNKNOWN` explícito — **baseline estático COMPLETE; revalidação runtime pendente quando necessária**;
6. fixtures de schema estiverem congeladas — **PENDENTE 00.5**;
7. lacunas externas estiverem registradas como lacunas, não inferências — **registro COMPLETE; resolução não exigida sem autorização**;
8. nenhuma alteração funcional de produto tiver sido feita para obter esse GO — **preservado até aqui**.

## Próxima ação

Executar somente `ROAD-00.3 — Golden Set sanitizado`, usando o inventário versionado como mapa. Não tocar runtime ou produção.

## Capacidade

`Chat/Codex -> capacidade atual -> Alto -> construir e revisar Golden Set ROAD-00.3, sem implementação`.
