# Estado — ROAD-00 Baseline verificável, Golden Set e inventário total

Atualizado em: 2026-08-27
Status: `ROAD-00 OPEN — NÃO EXECUTADO`
Branch: `chat/financial-roadmap-road00-20260827`
Roadmap canônico: `docs/plans/workstreams/financial-roadmap-canonical.md`
Conteúdo normativo aprovado: `docs/plans/workstreams/financial-roadmap-draft-v2.md` blob `904d652fc1931ff5c80d6c1066ac5f57a96f5b84`

## Objetivo

Criar o ponto de verdade operacional antes de qualquer correção transversal: inventário datado de capacidades/consumidores/fontes/fallbacks/flags/telemetria/shadows/rollback, Golden Set sanitizado e classificação explícita das lacunas externas.

## Estado de entrada

- roadmap v2 confirmado explicitamente pelo usuário;
- revisão adversarial Codex concluída com `APROVÁVEL APÓS AJUSTES` e ajustes incorporados;
- síntese encerrada sem implementação de produto;
- roadmaps históricos, Fase 8, Fase 9/Open Finance e ARQ continuam evidências obrigatórias;
- telemetria histórica não será tratada como atual sem revalidação;
- Atacadão, causa do áudio, headers realmente antigos, provenance histórico de `Mês de Cobrança` e cobertura cumulativa de saldo continuam lacunas abertas.

## Dentro do escopo

- registrar HEAD/release/runtime/flags observáveis quando a evidência correspondente estiver autorizada;
- construir matriz `capability -> consumer -> source -> fallback -> telemetry -> rollback`;
- incluir consumidores read-only e mutáveis;
- construir Golden Set financeiro sanitizado;
- classificar telemetria Fase 8 como `HEALTHY`, `STALE`, `BROKEN` ou `UNKNOWN`;
- carregar estado individual de `legacy_auth_utility` e não promover cartões/dashboard a candidatos sem evidência;
- congelar fixtures de versões de schema;
- registrar lacunas externas sem inventar respostas.

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

1. inventário de fontes/consumidores/fallbacks/telemetria/rollback estiver completo para os domínios tocados pelo roadmap;
2. Golden Set sanitizado estiver revisado e versionado;
3. consumidores mutáveis estiverem incluídos no mapa;
4. telemetria Fase 8 tiver saúde atual classificada, sem falso zero;
5. shadows/canários/flags conhecidos tiverem status datado ou `UNKNOWN` explícito;
6. fixtures de schema estiverem congeladas;
7. lacunas externas estiverem registradas como lacunas, não inferências;
8. nenhuma alteração funcional de produto tiver sido feita para obter esse GO.

## Próxima ação

Executar apenas a etapa 1 do ROAD-00: levantar o inventário versionado e registrar a base/HEAD/fontes a serem confrontadas, sem tocar runtime ou produção.

## Capacidade

`Chat/Codex -> capacidade atual -> Alto -> inventário e evidência ROAD-00, sem implementação`.
