# ROAD-00.1/00.2 — Snapshot de autoridade e inventário de capacidades/consumidores

Data: 2026-08-27
Workstream: `financial-roadmap-road00`
Branch: `chat/financial-roadmap-road00-20260827`
HEAD estático de entrada: `2c97774c5be2b0d449e890bc19f48a7a3e130d88`
Roadmap canônico: `docs/plans/workstreams/financial-roadmap-canonical.md`
Conteúdo normativo aprovado: `docs/plans/workstreams/financial-roadmap-draft-v2.md`, blob `904d652fc1931ff5c80d6c1066ac5f57a96f5b84`

Status deste artefato: `ROAD-00.1/00.2 COMPLETE — STATIC/READ-ONLY BASELINE`

> Este inventário registra somente o que pode ser sustentado pelo Git e pelos checkpoints versionados. Nenhum runtime, OCI, WhatsApp real, Google Sheets real, Pluggy real, segredo ou dado financeiro privado foi consultado. Por isso, capacidade presente no código não equivale a capacidade ativa em produção; evidência histórica não equivale a estado atual.

## 1. Classes de estado usadas

- `VERIFIED`: wiring/contrato/caminho existe no snapshot Git e foi localizado diretamente no código ou checkpoint do mesmo workstream.
- `STALE`: há evidência operacional ou gate histórico, mas anterior a 2026-08-27 e ainda não revalidado neste ROAD-00.
- `UNKNOWN`: o estado atual depende de runtime, flag, fonte externa ou cobertura que não foi consultada.
- `NOT_APPLICABLE`: a coluna não se aplica ao consumer/capability.

`VERIFIED` nesta etapa significa **verificado estaticamente**, não “saudável em produção”.

## 2. ROAD-00.1 — snapshot e autoridade

| Item | Evidência | Estado em 2026-08-27 |
| --- | --- | --- |
| Branch de trabalho | `chat/financial-roadmap-road00-20260827` | `VERIFIED` |
| HEAD de entrada | `2c97774c5be2b0d449e890bc19f48a7a3e130d88` | `VERIFIED` |
| Roadmap canônico | `financial-roadmap-canonical.md` ancorando o draft v2 aprovado | `VERIFIED` |
| Release/commit atualmente executado na produção | não consultado em ROAD-00.1/00.2 | `UNKNOWN` |
| Flags reais da produção | não consultadas | `UNKNOWN` |
| Saúde atual da telemetria Fase 8 | último checkpoint de 2026-07-30; rotação já teve lacuna de relatório | `STALE` |
| Estado ARQ | checkpoint 2026-08-24: ARQ-01..06 GO, canário devolvido para `off` | `STALE` para runtime atual; capacidade `VERIFIED` no código |
| Open Finance writers | checkpoint 2026-08-10 registra produção write `off` | `STALE` para runtime atual |
| Áudio WhatsApp | pipeline existe no código; usuário relata falha real; fronteira causal não reproduzida | `UNKNOWN` |
| Atacadão/Pluggy | usuário informa inclusão na conexão; mapeamento real não consultado | `UNKNOWN` / `EXTERNAL_REQUIRED` |

## 3. Modos/flags que o snapshot de código reconhece

Estes são contratos estáticos; o valor ativo no runtime permanece `UNKNOWN` até revalidação específica.

| Capacidade | Contrato de modo/flag localizado |
| --- | --- |
| Telemetria de legado | `LEGACY_USAGE_TELEMETRY_ENABLED`; arquivo, rotação e backups configuráveis |
| ARQ iterative canary | `FINANCIAL_ITERATIVE_CANARY_MODE=off|canary`, allowlist de 2 usuários, domínios e fontes; reload por `SIGHUP` |
| Projected Plans shadow | `PROJECTED_PLAN_WRITES_MODE=off|shadow` + allowlist de usuários |
| Open Finance reconciliation | `OPEN_FINANCE_RECONCILIATION_MODE=off|canary` |
| Dashboard v2 | `isDashboardV2Enabled()` é usado pelo servidor; valor efetivo não consultado |

## 4. ROAD-00.2 — matriz capability → consumer → source → fallback → telemetry → rollback

| # | Capability/domínio | Consumer(s) | Source primária observada/esperada | Fallback/compatibilidade | Flag/modo | Telemetria/heartbeat | Rollback conhecido | Última evidência relevante | Estado atual |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Entrada textual e roteamento WhatsApp | `messageHandler` | mensagem WhatsApp + estado server-side + Google/serviços conforme intenção | pipeline textual vigente é o baseline para canários | vários gates internos; sem flag global única localizada | metrics/logs; `recordLegacyUsageEvent` no handler | manter handler vigente; canários não substituem baseline sem seleção | código atual importa handlers, planner, legacy, ARQ, Open Finance, áudio | `VERIFIED` estático / runtime `UNKNOWN` |
| 2 | Perguntas financeiras — pipeline legado/Financial Agent v1 | WhatsApp analítico | central read model ou personal sheet conforme contexto; `intentClassifier -> calculationOrchestrator -> responseGenerator`; `financialAgent` também presente | fallback analítico legado permanece compatibilidade; personal sheet pode evitar read model central | agente/canários governados separadamente | legacy usage telemetry contém consumers `financial_agent`, `message_handler`, `query_engine` | baseline legado permanece disponível enquanto canários não promovem | arquitetura histórica + imports atuais do `messageHandler` | capacidade `VERIFIED`; uso real `UNKNOWN` |
| 3 | Analytics de planilha pessoal/familiar | WhatsApp, dashboard, ARQ personal_sheet | Google Sheets sob `runWithUserSheetContext`, escopo derivado pelo servidor | sem fallback seguro para outra família; ausência deve ficar indisponível | não há flag global localizada | telemetria via consumidores do handler/dashboard; cobertura específica ARQ em telemetry própria | permanecer no adapter atual se nova leitura falhar | `userSheetAnalyticsService` lê Sheets diretamente; ARQ histórico usa `personal_sheet` | `VERIFIED` estático |
| 4 | ARQ iterative read-only | WhatsApp financeiro elegível | semantic read facade/read model ou `personal_sheet`, resolvidos server-side | resposta baseline vigente; falha/timeout/evidência inadequada retorna ao baseline | `FINANCIAL_ITERATIVE_CANARY_MODE=off|canary`; allowlists de usuários/domínios/fontes | telemetry própria `selected/promoted/fallback`; histórico exige falha de telemetry => sem promoção | `off` por config/SIGHUP preserva baseline | checkpoint 2026-08-24 registra ARQ-01..06 GO e canário `off` após smoke | capacidade `VERIFIED`; runtime `STALE` |
| 5 | Central read model | WhatsApp analítico, dashboard, scheduler, ARQ central | Google Sheets sincronizado para read model em memória/disco e SQLite | memória/read-model compatível quando SQLite não atende, conforme arquitetura/gates históricos | intervalos/env próprios; nenhum modo global único | `recordLegacyUsageEvent`; legacy telemetry possui `read_model_service`; scheduler emite heartbeat | manter fonte/fallback anterior por consumer | `readModelService` importa Google, SQLite e legacy telemetry | `VERIFIED` estático; precedência runtime por query ainda `UNKNOWN` |
| 6 | Dashboard v1/v2 | browser dashboard, link emitido por WhatsApp | `readModelService`/SQLite + `userSheetAnalyticsService`; v2 compõe `dashboardV2SummaryService` e financial truth/Open Finance | v1 permanece presente; v2 condicionado por enablement | `isDashboardV2Enabled()` | `recordDashboardAccessEvent` + legacy telemetry `dashboard_v1/dashboard_v2` | v1 é fallback histórico enquanto v2 não tiver adoção/paridade | Fase 8 em 2026-07-30: v1 teve uso, v2 sem adoção observada | código `VERIFIED`; adoção `STALE` |
| 7 | Cartões — leitura, agregação e compatibilidade | WhatsApp, dashboard, scheduler, personal sheet, Open Finance reconciliation | `Lançamentos Cartão`, `Cartões`, read model/personal sheet; identidade alvo `card_id` ainda não uniforme | rotas legadas de cartão permanecem | canários históricos unified-first; flags atuais não revalidadas | legacy telemetry possui surface `cards`, card-sheet usage e consumers específicos; Phase 8 checkpoint | voltar ao consumer legado individual | Fase 8 em 2026-07-30: cartões ainda usavam fortemente legado | wiring `VERIFIED`; uso/telemetria `STALE` |
| 8 | Writers básicos de gasto/entrada/cartão | WhatsApp `messageHandler` + Google Sheets | planilha escopada do usuário/família; append/update Google | caminhos legados continuam ativos; alguns writers têm receipt/idempotência em trilhas próprias | não há flag única de todos os writers | reliability shadow/admin/legacy telemetry em partes; cobertura global não inventariada nesta etapa | command-specific; rollback global `UNKNOWN` | imports atuais mostram `appendRowToSheet`, `updateRowInSheet`, reliability gate | capability `VERIFIED`; segurança/rollback global `UNKNOWN` |
| 9 | Importação de extratos/documentos | WhatsApp import state machine | mídia/CSV/OFX/OCR -> `statementImportService` -> preview/classificação -> Sheets; reconciliation shadow também importada | usuário pode abandonar antes da persistência; comportamento legado preservado | sem modo global localizado | QA/metrics do handler; telemetry dedicada de import não confirmada aqui | não persistir/abortar preview; rollback posterior `UNKNOWN` | `messageHandler` importa parsing, dedup, recorrências e `statementReconciliationShadow` | `VERIFIED` estático |
| 10 | Metas/dívidas + Projected Plans | WhatsApp, forecast/read model, writers de meta/dívida | Sheets legadas + `projectedPlansStore` SQLite shadow quando permitido | Sheets legadas são caminho material; shadow pode ficar indisponível sem bloquear | `PROJECTED_PLAN_WRITES_MODE=off|shadow` + user allowlist | legacy telemetry contém `projected_plan_runtime`; receipts no store | `off`/sem shadow preserva writer legado; receipt suporta replay nos caminhos cobertos | arquitetura histórica: Fase 5A shadow; código atual confirma política off/shadow | capacidade `VERIFIED`; modo runtime `UNKNOWN/STALE` |
| 11 | Scheduler — contas, dívidas, cartões, agenda e ops | jobs agendados | Google Sheets escopado, Calendar e read model/canonical card entries | caminhos legados de leitura continuam disponíveis por consumer | cron/config; sem flag única | heartbeat de legacy telemetry + daily ops + outbox | desabilitar job específico/config operacional; estado runtime não consultado | `scheduler.js` usa São Paulo, Google, read model e heartbeat | `VERIFIED` estático; execução runtime `UNKNOWN` |
| 12 | Open Finance reconciliation read-only | jobs/fluxos Open Finance, dashboard financial truth | provedor/Open Finance + fonte interna familiar em Sheets; reconciliation shadow/preview | `off` retorna sem reconciliação; fonte interna indisponível deve ficar `unavailable` | `OPEN_FINANCE_RECONCILIATION_MODE=off|canary` | stores/relatórios próprios; heartbeat global não confirmado aqui | `off`; zero financial writes no reconciler | código atual declara `financial_writes: 0`; gates históricos read-only/canary | capacidade `VERIFIED`; runtime `UNKNOWN` |
| 13 | Open Finance reviewed writers | conversa WhatsApp de propostas/revisões | decisões revisadas + fonte revalidada; append command-specific quando gate permite | sem confirmação/gate => não escrever; read-only/proposal permanece | checkpoint histórico registra produção write `off`; flags atuais não consultadas | receipts/journals/gates próprios; telemetria operacional atual `UNKNOWN` | manter write `off`; operação por classe | workstream 2026-08-10: 38.1/38.4 GO local, 38.5 candidato, produção write `off` | código `VERIFIED`; runtime `STALE` |
| 14 | Áudio WhatsApp | `messageHandler -> handleAudio` | `downloadMedia`/reaquisição -> arquivo OGG -> ffmpeg -> MP3 -> Gemini transcription -> texto | canal textual continua independente; áudio retorna `null` em falha | sem flag de áudio localizada | logs sanitizados por etapa; sem heartbeat específico | texto continua baseline; rollback de dependência/handler não versionado aqui | código tem retry, auto-download, reaquisição, ffmpeg e cleanup; usuário relata falha real | capability `VERIFIED`; funcionalidade real `UNKNOWN` |
| 15 | Exclusão, manutenção, exportação e recibos | handlers WhatsApp/admin | Sheets/serviços internos conforme comando | handlers legados específicos ainda coexistem; `debtUpdateHandler` histórico em quarentena | flags variam por serviço | admin action log, legacy telemetry para alguns consumers | command-specific; não há rollback agregado | imports atuais do `messageHandler` incluem deletion, batch maintenance, export e receipt | `VERIFIED` estático; uso real `UNKNOWN` |
| 16 | Escopo familiar/OAuth/autorização | WhatsApp, dashboard, Sheets, Open Finance | `userService`, `oauthTokenStore`, membership compartilhada; identidade server-side | fail-closed quando membership/scope indisponível | config/admin/OAuth; sem modo único | admin/action logs e eventos específicos; telemetry financeira não substitui auth evidence | revocation/compensation services; rollback por operação | `messageHandler`, dashboard e reconciliation importam resolvers de escopo server-side | `VERIFIED` estático |
| 17 | Telemetria de retirada do legado / tripwire | scheduler, read model, dashboard, cards, message handler, manutenção e candidatos | JSONL local allowlisted com HMAC refs, heartbeat, rotação e backups | falha não deve alterar produto; ausência de evento não é zero | `LEGACY_USAGE_TELEMETRY_ENABLED` | a própria capability é telemetry; heartbeat e rotation previstos | desabilitar telemetry sem alterar produto; jamais remover consumer por isso | checkpoint Fase 8 2026-07-30 detectou lacuna de relatório de backups rotacionados e candidato de correção | código `VERIFIED`; saúde/janela atual `STALE` |
| 18 | Retirada de legado por consumer | Phase 8 consumers individuais | evidência runtime + destino canônico + paridade + janela | fallback legado permanece até cutover estável e rollback provado | soft-disable/removal por gate, não global | depende de telemetry saudável, incluindo backups/rotation | reativar fallback individual | 2026-07-30: `legacy_auth_utility` candidato; cartões/dashboard explicitamente não candidatos | decisão histórica `STALE`; nenhum componente removível declarado agora |

## 5. Consumidores mutáveis explicitamente presentes no mapa

Para evitar um inventário enviesado apenas para leitura, ROAD-00.2 inclui como mutáveis:

- writers de gasto, entrada e cartão no `messageHandler`/Google Sheets;
- metas e dívidas, inclusive projected-plan shadow quando permitido;
- importação e persistência após preview/confirmação;
- exclusão e manutenção em lote;
- writers Open Finance revisados por classe;
- OAuth/membership revocation/compensation quando aplicável.

Nenhum desses caminhos recebeu autorização de mudança por ROAD-00.

## 6. Fallbacks/shadows/canários que NÃO podem ser reconstruídos do zero

1. Financial Agent v1/analytical legacy continuam baseline/compatibilidade em partes do fluxo.
2. ARQ-03/05/06 já entregaram shadow/canary read-only com baseline preservado.
3. Card consumers já passaram por gates unified-first/parity na Fase 8; estado atual precisa ser revalidado, não reiniciado por memória.
4. Projected Plans já possui shadow write off/shadow e receipts.
5. Open Finance reconciliation já possui `off|canary` e shadow/preview read-only.
6. Dashboard v1/v2 já possuem telemetria/adoption gates históricos.
7. Legacy telemetry já possui heartbeat, HMAC refs, rotação e backups; o risco atual é saúde/continuidade da evidência, não ausência de mecanismo.

## 7. Lacunas carregadas para ROAD-00.3+

As seguintes lacunas permanecem deliberadamente abertas:

- commit/release realmente executado na produção em 2026-08-27;
- valores atuais de flags e saúde real dos heartbeats/arquivos rotacionados da Fase 8;
- continuidade da janela histórica de observação da Fase 8;
- `legacy_auth_utility`: se a auditoria independente posterior ao checkpoint 2026-07-30 foi concluída e qual o veredito vigente;
- cartões/dashboard: uso atual, sem assumir que o padrão de julho continua igual;
- causa real da falha de áudio;
- vínculo real Atacadão Pluggy -> alias -> `card_id` -> fechamento/vencimento;
- quais planilhas pessoais reais ainda usam headers antigos;
- provenance das linhas históricas de `Mês de Cobrança`;
- cobertura cumulativa por conta para saldo `as_of`;
- estado runtime atual dos gates Open Finance writer e projected-plan shadow;
- rollback agregado de writers básicos, que permanece command-specific/`UNKNOWN` nesta etapa.

## 8. Conclusão de 00.1/00.2

ROAD-00.1 e ROAD-00.2 estão completos **no alcance estático autorizado**: base/autoridade registrada, consumidores read-only e mutáveis incluídos, fontes/fallbacks/modos/telemetria/rollback mapeados e todo estado que exigiria produção ou fonte externa mantido como `STALE`/`UNKNOWN` em vez de inferido.

Este artefato não fecha ROAD-00. Próxima etapa canônica: **ROAD-00.3 — Golden Set sanitizado**, seguida de revalidação específica de telemetria Fase 8, fixtures de schema e lacunas externas antes de qualquer GO para ROAD-K0.
