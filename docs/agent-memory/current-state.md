# Estado atual do FinancasBot

Atualizado em: 2026-06-30

## Produto

- Bot de WhatsApp para controle financeiro pessoal e familiar.
- Stack: Node.js, whatsapp-web.js/Puppeteer, Gemini 2.5 Flash, Google Sheets, Google Calendar, SQLite read model e dashboard web.
- Producao atual em EC2 com dominio `https://financasbot.duckdns.org`.
- Baseline operacional mais recente registrado no handoff: producao em `853bdc3` com `FINANCIAL_AGENT_MODE=answer`, `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true` e `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer`. Revalidar EC2/PM2/logs antes de afirmar saude atual.
- Multiusuario existe, mas ainda exige cuidado juridico/privacidade antes de beta amplo.
- Roadmap final de evolucao familiar esta em `docs/plans/family-financial-platform-evolution-roadmap.md`. Ele preserva o baseline atual com Financial Agent em `answer`, Gemini Planner ativo e contextual analyst em `answer`; abre o ledger canonico antes de contas/conciliacao, orcamento por categoria, dashboard v2, planos, Open Finance, comprovantes e investimentos. A Fase 1 foi iniciada por ADR/spec/plan, sem schema real ou mudanca de producao.
- Auditoria profunda de produto/UX do Meu Planner Financeiro registrada em `docs/audits/meu-planner-deep-product-study.md` em 2026-06-20. Conclusao: o concorrente e forte em web app, ledger, datas/status, pendencias, planejamento, faturas, planos, investimentos e dashboard; o FinancasBot deve incorporar os conceitos de dominio, mas manter o diferencial conversacional com LangGraph, ferramentas verificadas e WhatsApp como interface principal.
- Pesquisa de produto do Meu Assessor registrada em `docs/audits/meu-assessor-product-research.md` em 2026-06-20. Conclusao: Open Finance, conta compartilhada, onboarding e painel sao referencias relevantes; projetos, tarefas, reunioes e Drive generico ficam fora do foco atual. Calendar ja existe no FinancasBot e deve ser lapidado, nao reconstruido.

## Arquitetura familiar com LangGraphJS - historico do shadow inicial

- Decisao arquitetural registrada em `docs/decisions/ADR-004-family-langgraph-financial-agent.md`: LangGraphJS passa a ser o runtime final de orquestracao para analises financeiras read-only do assistente familiar Daniel/Thais.
- Spec criada em `docs/specs/family-langgraph-financial-agent.md`. A Query Engine vira ferramenta confiavel; SQL sandbox read-only cobre perguntas novas; Gemini pode planejar/redigir, mas nao calcular valores finais.
- `@langchain/langgraph` foi adicionado como dependencia e isolado em `src/agent/langGraphRuntime.mjs`, com wrapper CommonJS em `src/agent/financialAgent.js`. O projeto agora declara Node `>=20.0.0`; a EC2 foi verificada com Node `v22.17.1`.
- Family Mode foi adicionado em `src/services/familyModeService.js` e ligado ao `messageHandler`: `FAMILY_MODE_ENABLED=true` restringe acesso normal ao allowlist `FAMILY_MODE_USER_IDS`/`FAMILY_MODE_WHATSAPP_IDS`. O padrao permanece desligado; se ativado sem allowlist, o modo fica fechado por seguranca. Ele nao apaga nem altera status de usuarios antigos automaticamente.
- SQLite ganhou a superficie publica `financial_events_public`, exportada por `queryFinancialEventsPublicRows` sem `user_id`, `sheet_id`, tokens, OAuth, prompts, URLs privadas ou linhas cruas.
- Ferramentas iniciais do agente: `list_recent_transactions` e `run_safe_readonly_sql`. O verificador bloqueia valores inventados e vazamento de campos internos antes da resposta.
- Planner Gemini do agente foi criado em `src/agent/financialAgentPlanner.js`, mas fica desligado por padrao via `FINANCIAL_AGENT_LLM_PLANNER_ENABLED`. Quando ligado, ele recebe apenas a pergunta e o contrato publico de ferramentas/tabela; a saida e tratada como nao confiavel e passa por allowlist + `validateSafeReadonlySql`.
- `messageHandler` integra o agente atras de `FINANCIAL_AGENT_MODE=off|shadow|answer`; `enforce` e aceito como alias de `answer`. O padrao permanece `off`. Em `shadow`, o agente observa sem responder; em `answer`, planner gaps caem no legado e respostas so saem se aprovadas pelo verificador.
- Cobertura local inicial: `tests/financialAgent.test.js` cobre superficie publica, SQL sandbox, ferramenta de ultimos lancamentos, verificador, runtime LangGraph e politica de ativacao; `tests/familyModeService.test.js` cobre allowlist familiar e falha fechada sem configuracao.
- Ainda nao foi implementado nesta fatia: wrapper da Query Engine como ferramenta, dashboard snapshot tool, bateria agentic de 200 perguntas e inativacao operacional de usuarios fora de Daniel/Thais. O planner Gemini estruturado existe, mas permanece desligado por seguranca/custo ate a cobertura agentic evoluir.
- Deploy shadow concluido em 2026-06-14 no commit `5615915`. Producao ficou com `FINANCIAL_AGENT_MODE=shadow`, `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=false` e `FAMILY_MODE_ENABLED=false`; o agente observa perguntas analiticas sem substituir respostas, sem chamada Gemini adicional pelo planner novo e sem restringir usuarios ainda.
- Backup pre-deploy: `/home/ubuntu/financas-bot-backups/release-20260614-family-langgraph-shadow-5615915`. Rollback de codigo: `192acb7`.
- Pos-deploy validado: PM2 online, WhatsApp pronto, health publico `{"ok":true,"sqlite":true}`, worktree remoto limpo e read-model com `financialEventsPublic=45`. Nenhum novo registro foi gravado no error log apos o restart.
- Proximos gates: observar telemetria sanitizada do shadow, implementar ferramentas agentic restantes, executar bateria livre de pelo menos 200 perguntas e somente depois considerar `FINANCIAL_AGENT_MODE=answer`. Family Mode deve ser ativado apenas depois de validar a allowlist real de Daniel/Thais para evitar bloqueio acidental.

## Rollout do Financial Agent answer mode - 2026-06-16

- Regra atual registrada em `docs/decisions/ADR-005-financial-agent-answer-rollout-gates.md`: producao deve permanecer com `FINANCIAL_AGENT_MODE=shadow` ate os gates de evidencia passarem.
- Runbook operacional: `docs/runbooks/financial-agent-answer-rollout.md`.
- Incidente observado: perguntas naturais sobre "ultimo lancamento" falharam no caminho legado, enquanto o agente em shadow produziu resposta verificada com `list_recent_transactions`.
- `FINANCIAL_AGENT_MODE=answer` chegou a ser habilitado temporariamente para validar a resposta com Daniel. Isso foi util como evidencia, mas foi cedo demais para rollout global.
- Apenas Daniel enviou perguntas nessa janela; nenhum outro usuario gerou evidencia suficiente. Uma resposta correta do Daniel nao libera `answer` global.
- Proximo passo correto: voltar/ficar em `shadow`, coletar telemetria sanitizada, implementar allowlist controlada se necessario e so ativar `answer` depois dos gates do ADR-005.
- Nao confundir `FINANCIAL_AGENT_MODE=answer` (respostas analiticas read-only) com `INTERPRETATION_RELIABILITY_MODE=enforce` (escritas financeiras).

## Check diario e divergencias do shadow - 2026-06-17

- Alerta observado: `Shadow/enforce: shadow com 33 divergencia critica(s); decisoes=35`.
- Causa confirmada nos registros sanitizados: o fluxo legado teria gravado enquanto a camada de confiabilidade teria pedido confirmacao por `critical_field_not_deterministic`; isso bloqueia `enforce`, mas nao significa que WhatsApp/SQLite/dashboard estejam fora do ar.
- O check diario operacional deve classificar esse caso como `ATENCAO`/rollout bloqueado, nao como status geral `CRITICO`. Status `CRITICO` fica reservado para indisponibilidade operacional, flags perigosas ou falha real de saude.
- O notifier separado de prontidao continua podendo enviar `Divergencia critica no shadow`; ele e um alerta de seguranca para nao ativar `enforce`.
- Nao apagar a telemetria para "limpar" o alerta; ela e evidencia util. Corrigir o comportamento por capacidade e so avancar quando as divergencias forem explicadas ou eliminadas.
- Correcao local em 2026-06-17: o persistidor de `Saídas`/`Entradas` deixou de rebaixar `amount` e `movementType` para `inferred/supported` ao registrar shadow de transacoes ja estruturadas. Ele agora reutiliza `buildTransactionReliabilityFields`, preservando `deterministic`, `llm` ou `user_state` conforme a origem do item. Regressao em `tests/financialStateMachine.test.js` cobre gasto e entrada confirmados. Sem deploy nesta etapa.
- Etapa 2 offline em 2026-06-17/18: Financial Query Acceptance 265/265, Interpretation Reliability 340/340, Financial Agent Acceptance 265/265 e Novel Planner dry-run 255/255, todos com 0 chamadas Gemini. Relatorio sanitizado em `data/qa-runs/STAGE2_OFFLINE_20260618011834/stage2-offline-batteries-report.json`.
- Etapa 3 replay sanitizado em 2026-06-17/18: perguntas reais recentes conhecidas sobre "ultimo lancamento/gasto" foram comparadas sem escrita e sem chamadas Gemini novas. O fluxo atual/legado divergiu em 3/3 casos: 2 por falta de capacidade deterministica de transacao recente sem Gemini e 1 por overmatch de palavra-chave que classificava "ultimo gasto" como total mensal. Logs sanitizados de producao mostraram 5 eventos do agente em 16/06, todos `list_recent_transactions`, verificados e com `rows=1` (2 em shadow, 3 no periodo temporario de answer). Decisao: nao remendar frases no legado; continuar rollout controlado do agente read-only. Relatorio sanitizado em `data/qa-runs/STAGE3_REPLAY_20260618013528/stage3-sanitized-replay-report.json`.
- Evolucao local em 2026-06-18: adicionada flag estreita `FINANCIAL_AGENT_SHADOW_RECENT_ANSWER_ENABLED=true` para permitir que, mesmo com `FINANCIAL_AGENT_MODE=shadow`, apenas respostas verificadas da ferramenta `list_recent_transactions` sejam enviadas ao usuario. Isso cobre "ultimo lancamento/gasto/entrada" sem ligar `answer` global, sem planner Gemini, sem SQL livre e sem mudar fluxos de escrita. O check diario passa a exibir `recent_answer=true|false` como detalhe operacional.
- Deploy desta evolucao concluido em 2026-06-18 no commit `d673230`. Producao ficou com `FINANCIAL_AGENT_MODE=shadow`, `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=false`, `FINANCIAL_AGENT_SHADOW_RECENT_ANSWER_ENABLED=true`, `FAMILY_MODE_ENABLED=false` e `DASHBOARD_ADMIN_ALL_USERS_ENABLED=false`. Smoke real read-only pelo WhatsApp do Daniel respondeu "ultimo lancamento" via agente verificado (`list_recent_transactions`, `verified=true`, `rows=1`) sem ativar `answer` global. Backup: `/home/ubuntu/financas-bot-backups/pre-d673230-20260618T2356Z`.
- Etapa 4 E2E pos-hotfix em 2026-06-18/19 usou marcador `TESTE_APAGAR_STAGE4_20260619T001525Z`: gasto PIX, cartao, entrada, caixinha/reserva com confirmacao, dashboard e exclusao passaram; limpeza marker-only confirmou zero restos em Sheets/read-model/SQLite/state. Achado real: "ultimo lancamento" respondeu o cartao em vez da caixinha confirmada no mesmo dia. Causa: `list_recent_transactions` ordenava apenas por data e dependia da ordem de fontes em empates. Correcao deployada em `6e86a8a`: `financial_events_public` expõe `insertion_order` publico derivado de `rowid`, e `list_recent_transactions` usa `iso_date desc, insertion_order desc`. Regressao em `tests/financialAgent.test.js`; `npm test` local passou 453/453. Recut real com marcador `TESTE_APAGAR_STAGE4_RECENT_20260619T125005Z` confirmou resposta verificada via `list_recent_transactions`: "ultimo lancamento" apontou para a movimentacao de caixinha/reserva feita depois do cartao no mesmo dia. Limpeza final precisou rodar no contexto da planilha pessoal do Daniel; marcador ficou zero em `Transferências`, `Lançamentos Cartão`, planilha central e `financial_events_public`. Backup do deploy: `/home/ubuntu/financas-bot-backups/pre-6e86a8a-20260619T124749Z`.
- Evolucao local em 2026-06-19: o monitor de prontidao para `enforce` ganhou janela auditada via `INTERPRETATION_RELIABILITY_READINESS_SINCE` ou `--since`. Divergencias criticas antigas continuam preservadas na telemetria, mas podem ser excluidas explicitamente do gate quando a causa raiz ja foi corrigida e uma nova janela pos-hotfix esta sendo observada. Relatorio: `docs/qa/stage4-enforce-gate-report-2026-06-19.md`. Isso nao autoriza `enforce`; o status correto continua `KEEP_SHADOW` ate haver amostra pos-fix suficiente, janela minima, cobertura por operacao e zero divergencia critica nova.
- Etapa 4.5 acelerada concluida em 2026-06-19: `npm run gate:enforce:accelerated` substitui a espera passiva por evidencia ativa antes da auditoria final. Ele consolida bateria offline, shadow pos-cutoff, E2E real verificado, rollback por flag e logs limpos. O resultado verde e apenas `READY_FOR_ALTISSIMA_AUDIT`, nunca ativacao automatica. A bateria IRAB tem 350 casos, incluindo confirmacao para `income.create` quando campo critico depende de inferencia. E2E real minimo com Daniel usou marcador `TESTE_APAGAR_ENFORCEGATE_20260619155922`: 1 saida e 1 entrada foram criadas na planilha pessoal e removidas por limpeza marker-only; segunda limpeza e `financial_events_public` ficaram com zero restos. Rollback por flag foi verificado no servidor mantendo `INTERPRETATION_RELIABILITY_MODE=shadow`, com testes do gate/allowlist verdes. Logs da janela `19/06/2026 19:05` ficaram sem WARN/ERROR/CRITICAL e com IDs redigidos. Gate final em producao: `READY_FOR_ALTISSIMA_AUDIT`, relatorio em `/home/ubuntu/financas-bot/data/qa-runs/ACCEL_GATE_VERIFIED_20260619T190912Z/accelerated-enforce-gate-report.json`. Proximo passo: voltar para capacidade altissima e auditar se `enforce` pode ser ativado somente para `expense.create` e `income.create`.
- Auditoria final em capacidade altissima concluida em 2026-06-19. A condicao `IRA-AUDIT-001` foi implantada em `1d67069`; smoke real pos-deploy validou gasto PIX, entrada PIX, credito completo, pergunta analitica e dashboard, com limpeza marker-only idempotente na planilha de producao e refresh do read-model. Telemetria pos-cutoff registrou 14 decisoes (`expense.create=8`, `income.create=6`) e zero divergencia critica. Testes focados 90/90, suite completa 458/458, audit com zero vulnerabilidades e checks de sintaxe verdes. Veredito: aprovado para ativacao controlada somente de lancamentos unitarios `expense.create` e `income.create`; lotes/importacoes e demais mutacoes ficam fora. Proximo passo operacional: em capacidade alta, mudar apenas `INTERPRETATION_RELIABILITY_MODE=enforce`, preservar a allowlist atual, reiniciar PM2, executar smoke marker-only e reverter imediatamente para `shadow` diante de qualquer gate vermelho.
- Ativacao controlada concluida em 2026-06-19. Producao esta com `INTERPRETATION_RELIABILITY_MODE=enforce` e allowlist `expense.create,income.create`; `FINANCIAL_AGENT_MODE=shadow`, planner Gemini e dashboard all-users continuam desligados. Backup do `.env`: `/home/ubuntu/financas-bot-backups/.env.pre-interpretation-enforce-20260619T204543Z`. Canario real marker-only confirmou `expense.execute`, `income.clarify` e `income.execute`, sem divergencia ou chamada Gemini adicional; duas linhas foram removidas, a segunda limpeza encontrou zero e o SQLite publico ficou sem marcador. PM2, WhatsApp ready, health/SQLite, state e logs ficaram verdes. Rollback: restaurar o backup do `.env`, reiniciar PM2 e validar os mesmos gates.
- Observabilidade do canario ajustada para evitar falso `CRITICO` no check diario: `enforce` so e tratado como aprovado quando `INTERPRETATION_RELIABILITY_ENFORCE_APPROVED=true` e a allowlist e exatamente `expense.create,income.create`. Sem aprovacao explicita ou com qualquer operacao adicional, o check continua critico. Regressao coberta em `tests/dailyOpsCheckService.test.js`.

## Estado de producao conhecido

- Registro mais recente vindo do handoff em 2026-06-24: producao esta no commit `853bdc3`.
- Flags recentes registradas: `FINANCIAL_AGENT_MODE=answer`, `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true` e `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer`.
- `INTERPRETATION_RELIABILITY_MODE=shadow` segue como decisao intencional para acompanhar divergencias de escrita; nao confundir com o agente read-only.
- O pacote local de orcamento livre/categorias novas ainda precisa release e smoke antes de ser tratado como deployado em producao.
- Fase 0 revisada executada localmente em 2026-06-24: `npm test` 500/500, Financial Query Acceptance 265/265, Financial Agent 265/265, Novel Planner dry-run 255/255, Interpretation Reliability 350/350, planner live curto 6/6 e audit high com 0 vulnerabilidades. A auditoria SSH foi destravada com a chave local informada e confirmou producao em `853bdc3`, branch `main`, worktree remoto limpo, `FINANCIAL_AGENT_MODE=answer`, planner Gemini ligado, contextual analyst em `answer`, PM2/health/read-model/WhatsApp saudaveis e `state_store.json` remoto com 2 bytes. Decisao de Daniel: `INTERPRETATION_RELIABILITY_MODE` permanece `shadow`; vamos acompanhar divergencias de escrita e ajustar ate maturar. Readiness remoto recomendou `keep_shadow` com 96 entradas totais, 0 divergencias criticas, precisao 1.0 em candidatos a auto-save, p95 6 ms e blockers esperados de volume/janela. Decisao da Fase 0: `APROVADO PARA FASE 1 COM RESTRICOES`. Restricoes: nao ativar Family Mode sem allowlist Daniel/Thais, nao considerar orcamento/categorias como baseline de producao sem release/smoke/rollback proprio, e nao ampliar answer/planner/contextual sem bateria e rollback por flag.
- Fase 1 do ledger canonico concluida localmente em 2026-06-24: ADR/spec/fixtures, projetor puro, relatorio dry-run, SQLite shadow versionado, backup/restore e politica de rollout coberta por TDD. `src/ledger/canonicalLedgerRolloutPolicy.js` exige flags separadas para modo, consentimento de escrita, aprovacao de producao e leituras canario; valores invalidos falham fechados. Runbook: `docs/runbooks/canonical-ledger-dual-projection-gate.md`. Decisao de saida: `NO-GO` para shadow em producao nesta fase; o codigo nao foi conectado ao fluxo produtivo. Primeiro corte da Fase 2: projetar recibos unitarios ja verificados no dominio `transactions`, medir paridade e repetir gate altissima. O Gemini Planner permanece ativo no baseline (`FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true`) e `INTERPRETATION_RELIABILITY_MODE` permanece `shadow`.
- Fase 2 do ledger canonico iniciada em 2026-06-25: adapter local de recibos comprometidos para `Saídas`, `Entradas` e `Transferências`, hook shadow pos-append em `appendRowToSheet`, persistencia idempotente por `operationKey`, dominios canario `transactions`, `accounts` e `transfers`, e fallback legado em `src/ledger/canonicalLedgerCanaryRouter.js`. Tudo permanece falhando fechado por flags; producao ainda nao deve habilitar canonical projection/canary sem repetir gates completos. Plano: `docs/plans/phase-2-canonical-ledger-implementation-plan.md`.

- Deploy conjunto das Fases 1+2 concluido em 2026-06-25 no commit `30b1bf4`. O pacote corrige pagamentos de contas recorrentes no orcamento livre, adiciona esclarecimento de categoria nova e entrega o ledger canonico atras de flags.
- Shadow write canonico ativado de forma controlada depois do deploy inerte, health/logs/state, backup/restore vazio e rollback por flags. Producao esta com `CANONICAL_LEDGER_PROJECTION_MODE=shadow`, escrita e aprovacao de producao habilitadas, banco em `/home/ubuntu/financas-bot/data/canonical_ledger_shadow.sqlite` e leituras canario desligadas.
- Baseline preservado: `FINANCIAL_AGENT_MODE=answer`, `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true`, `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer` e `INTERPRETATION_RELIABILITY_MODE=shadow`.
- Proximo gate: observar escritas reais elegiveis, comparar contagens/valores/datas/status com o legado e manter canary reads desligadas ate uma janela completa de paridade sem vazamento ou divergencia.

Sempre revalidar EC2/PM2/logs antes de afirmar que producao esta saudavel.

## Validacao completa e benchmark Gemini - 2026-06-12

- A bateria offline da Financial Query Engine executou `265/265` casos sem divergencias; `23` casos adversariais foram bloqueados intencionalmente antes do planner.
- E2E real de importacao via WhatsApp do Daniel validou cancelar, confirmar, arquivo complexo sem abreviacao, duplicidade e limpeza seletiva dos marcadores.
- A deteccao de cartao pessoal citado na mensagem agora ignora diferencas de pontuacao e separadores, por exemplo `Nubank - Thais` versus `nubank thais`, sem escolher silenciosamente quando mais de um cartao combina com um nome generico.
- O smoke analitico real passou a exigir um mes populado. Ele encontrou e corrigiu uma inconsistencia em que o total mensal incluia cartoes, mas o subtotal `Cartões` era exibido como zero; a Query Engine agora devolve subtotais por fonte tambem em operacoes de soma.
- O benchmark sintetico comparou `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-3.1-flash-lite` e `gemini-3.5-flash` sem usar dados reais. Na triagem, `gemini-3.1-flash-lite` teve a melhor precisao de campos; nenhuma troca de modelo foi feita.
- A etapa final do benchmark esta bloqueada por `429` com mensagem de limite mensal de gastos do projeto. O runner interrompe com seguranca apos tres erros consecutivos desse tipo.
- Consultas deterministicas da Query Engine continuam funcionando sem Gemini. Fluxos que dependem do Gemini permanecem degradados ate o limite mensal ser elevado ou renovado.

## Convites de pre-onboarding

Correcao implantada em 2026-06-03:

- `admin convidar <telefone>` e `admin mensagem <telefone> <texto>` agora usam fallback para o singleton global do WhatsApp quando `msg.client` nao esta anexado ao objeto da mensagem; respostas admin tambem usam fallback quando `msg.reply` nao existe.
- Isso corrige o caso real em que `confirmar admin` era recebido, mas o convite nao era disparado, com log `convidar_cliente_indisponivel`.
- Testes de regressao: `messageHandler admin invite uses fallback sender when message client is missing` e `messageHandler admin confirmation replies through fallback when reply is missing`.
- GitHub/local: `26f22e9` e `90b3ab7`.
- EC2 via `git am`: os mesmos patches foram aplicados em producao.
- `npm test` passou com 219 testes em 2026-06-02/03 antes do deploy final.
- Validacao de producao: `/dashboard/health` retornou `{"ok":true,"sqlite":true}`, PM2 ficou `online` e WhatsApp confirmou `Bot pronto para receber mensagens`.
- O `error.log` nao teve novas escritas apos `2026-06-03 00:08:11 UTC`; os erros `convidar_cliente_indisponivel` e `msg.reply is not a function` vistos no tail eram historico anterior ao deploy final.

## Usuarios e privacidade

- Em beta atual, `ADMIN_IDS` deve conter apenas Daniel.
- Thais deve ser tratada como usuario comum/teste, mesmo que existam cartoes/abas com nome dela.
- Dashboard admin nao deve expor `Todos os usuarios` por padrao. Acesso cruzado a dados financeiros so pode existir com `DASHBOARD_ADMIN_ALL_USERS_ENABLED=true`, em modo suporte/teste controlado e com aprovacao explicita.
- Consultar `docs/decisions/ADR-002-admin-financial-data-access.md` antes de qualquer mudanca em admin, dashboard, familia, permissoes ou launch.

## Funcionalidades importantes ja implementadas

- Onboarding com consentimento, aprovacao admin e OAuth Google.
- Planilha criada no Drive do usuario.
- Manual/link de orientacao enviado no onboarding.
- Importacao de CSV/OFX com previa completa, confirmacao e deteccao de duplicados.
- Importacao de CSV/OFX tem limites antes do parse: `IMPORT_MAX_FILE_BYTES` padrao 1 MiB e `IMPORT_MAX_ROWS` padrao 1000 linhas nao vazias.
- Importacao diferencia conta corrente, cartao, transferencias internas, caixinha/reserva e rendimentos.
- Familia/planilha compartilhada: lancamentos podem ir para a planilha dona do grupo com `user_id` do responsavel.
- Dashboard com filtros de usuario/mes e API de resumo consolidada para reduzir quota de Google Sheets.
- Links do dashboard enviados pelo WhatsApp usam `#token=`; a pagina guarda o token em `sessionStorage` e remove o token da barra de endereco para reduzir exposicao em logs/historico/referrer.
- Tokens de dashboard agora sao curtos por padrao: `DASHBOARD_TOKEN_TTL_SECONDS` padrao 900s e `DASHBOARD_TOKEN_MAX_TTL_SECONDS` padrao 1800s.
- Acesso ao dashboard grava auditoria local sanitizada em `data/dashboard-access.jsonl` por padrao, controlada por `DASHBOARD_ACCESS_LOG_ENABLED` e `DASHBOARD_ACCESS_LOG_PATH`. O log guarda hashes de token/usuarios, evento, escopo e caminho sem querystring; nao guarda token, URL completa, telefone ou dados financeiros.
- Comandos admin sensiveis agora exigem segunda mensagem `confirmar admin` antes de executar. A confirmacao fica so em memoria, expira em 5 minutos e nao grava o comando pendente em `state_store.json`.
- AdminActionLog local foi adicionado para acoes admin sensiveis: grava JSONL sanitizado em `data/admin-actions.jsonl` por padrao, com actor/target em hash e sem corpo de mensagem manual. Validar deploy antes de assumir ativo em producao.
- Comandos de manutencao admin seguros foram adicionados em 2026-06-03: `admin status bot`/`admin health` retorna resumo operacional sanitizado sem segredos/dados financeiros individuais, e `admin reiniciar bot` exige `confirmar admin` antes de agendar `process.exit(0)` para o PM2 reiniciar o processo. Nao existe comando de shell livre pelo WhatsApp.
- Leituras diretas do Google Sheets passam por cache curto em memoria (`GOOGLE_SHEETS_READ_CACHE_TTL_MS`, padrao 20s) com invalidacao apos escrita, para reduzir bursts de quota sem misturar dados entre planilhas.
- Perguntas financeiras via read model/SQLite e fallback.
- Cron jobs de resumo, agenda e vencimentos.
- Validacao real de cron em 2026-05-26 confirmou agenda do Google Calendar e vencimentos de `Contas`; marcadores `TESTE_APAGAR Cron` foram removidos ao final (`remainingRows=0`, `remainingEvents=0`).
- Auditoria de cobertura criada em `docs/audits/bot-capability-coverage.md` para rastrear caminhos basicos prometidos pelo bot e evitar lacunas de teste como a de metas.
- Checklist completo de cobertura criado em `docs/audits/bot-complete-coverage-checklist.md`, mapeando cada caminho conhecido do bot para teste ativo ou E2E opcional documentado.
- `npm test` agora roda apenas testes ativos. O antigo `tests/integration.test.js` foi removido por ser legado/pulado e o `tests/functional.test.js` ficou apenas como E2E opcional via `npm run test:functional`.
- Fluxos de audio e lotes financeiros foram promovidos para cobertura ativa em `tests/financialStateMachine.test.js`: audio transcrito entra no mesmo roteamento textual, lote misto grava entradas/saidas, lote sem pagamento pergunta uma vez, e lote no credito grava parcelas por item.
- Dependencias moderadamente vulneraveis foram atualizadas em 2026-05-26: `googleapis`, `node-cron` e `qs`. Validar sempre com `npm audit --audit-level=moderate` antes de release.
- Orcamento mensal livre substitui a meta diaria fixa: comando `definir orçamento mensal <valor> dia <1-31>`, comando `desativar orçamento mensal`, alertas por WhatsApp em 50%, 80% e 100% do ritmo diario recomendado e graficos diario/ciclo no dashboard. O onboarding sugere `definir orçamento mensal 3000 dia 5`.
- Orcamento mensal livre tem escopo `personal` ou `family`. Com familia ativa, `definir orçamento mensal <valor>` pergunta se o orçamento e pessoal ou familiar. A resposta curta `orçamento mensal família`/`orçamento mensal pessoal` altera o escopo de um orçamento ja ativo.
- Orcamento mensal livre usa ciclo configuravel por dia de inicio: `monthly_budget_cycle_start_day`. Dia pode ser 1 a 31; em meses curtos, dia 31/30 cai no ultimo dia valido. O ciclo do dashboard pode cruzar meses, por exemplo 17/05 a 16/06.
- Correcao local em 2026-05-30: `UserSettings` deve ser lido/escrito em `A:S`; usar ranges antigos `A:M`/`A:R` quebra o salvamento do orçamento mensal porque os campos `monthly_budget_*` ficam nas colunas N:S.
- Ao ativar vinculo familiar por `admin compartilhar planilha`, se o dono ja tiver orçamento mensal ativo, o bot envia ao dono uma pergunta para decidir se ele continua pessoal ou vira familiar.
- Roteamento de gastos ficou mais inteligente em 2026-05-29: se a mensagem ja trouxer `credito`, nome do cartao e `a vista`/parcelas, o bot pula perguntas redundantes e grava direto. Ha fallback para contar cartoes em `Lançamentos Cartão` e em abas legadas `Cartão ...` no orçamento mensal.
- Metas passaram a funcionar como cofrinho rastreavel em 2026-06-03. Comandos suportados: `guardei 500 na meta reserva`, `retirei 200 da meta reserva`, `ajustar meta reserva para 1500`, `pausar meta reserva`, `retomar meta reserva`, `cancelar meta reserva` e `concluir meta reserva`. A aba nova `Movimentações Metas` audita valor antes/depois, responsavel e dono da meta.
- Metas familiares usam a planilha principal do grupo e preservam `user_id` de quem movimentou. Na criacao de meta, se houver familia ativa, o bot pergunta se a meta e pessoal ou familiar. Perguntas e dashboard carregam status, escopo e ultima movimentacao; metas pausadas/canceladas nao entram como progresso ativo.
- Validacao local do sistema de metas em 2026-06-03: `npm test` passou com 224 testes e `npm audit --audit-level=moderate` retornou 0 vulnerabilidades.
- Deploy em producao do sistema de metas em 2026-06-03: GitHub/local `1ba4932`; EC2 aplicado via patch como `b38f7e1` porque o repo privado bloqueou `git pull` HTTPS no servidor. Validacao: `/dashboard/health` publico retornou `{"ok":true,"sqlite":true}`, PM2 `financas-bot` online, logs mostraram `WhatsApp pronto` e `Bot pronto para receber mensagens`.
- Planilha do usuario teve correcoes em 2026-05-31: `Faturas` e `Parcelamentos` agora sao tratadas como abas da planilha pessoal, lancamentos de cartao passam a gravar valor numerico (nao texto) e as formulas `QUERY` dos resumos usam `headers=0` para nao ignorar a primeira compra real.
- Planilha real do Daniel foi copiada antes da limpeza (`Backup FinancasBot Daniel antes limpeza 2026-05-31 0249`) e depois teve linhas financeiras anteriores a 29/05/2026 removidas de `Entradas`, `Saídas`, `Transferências` e `Lançamentos Cartão`. Configuracoes, contas, metas, dividas, manual, dashboard e formulas foram preservados.
- Correcao em 2026-05-31: quando o usuario cita um cartao cadastrado pelo nome (ex.: `cartao nubank thais`) sem dizer `debito`, o bot trata como cartao de credito mesmo se a IA classificar equivocadamente como `Débito`; `à vista` vira parcela `1/1`. Se o usuario disser explicitamente `debito`, o fluxo de debito e preservado.
- Dado real corrigido em 2026-05-31: `restaurante malz` de R$125,25 foi movido de `Saídas/Débito` para `Lançamentos Cartão/Cartão Nubank - Thais`, apos backup `Backup FinancasBot Daniel antes mover restaurante malz 2026-05-31 1249`.
- Correcao local em 2026-05-31: lancamentos manuais como `guardei ... na caixinha` agora entram em `Transferências` como reserva/investimento, nao em `Entradas`; transferencias manuais para membro do escopo familiar entram em `Transferências`, nao em `Saídas`; valores manuais usam `parseValue` para preservar centavos com virgula. Cobertura adicionada em `tests/financialStateMachine.test.js`; `npm test` passou com 214 testes.
- Correcao local em 2026-05-31: formulas da aba `Dashboard` da planilha pessoal passaram a somar linhas com `user_id` preenchido, em vez de depender de uma linha inicial fixa. Isso evita zerar totais quando o usuario apaga a linha de exemplo. `Faturas` e `Parcelamentos` tambem passam a consultar `Lançamentos Cartão!A2:J` filtrando `J is not null`, para ignorar exemplos sem perder a primeira linha real.
- Correcao local em 2026-05-31: orçamento mensal livre passou a contar lançamentos de cartão pela competência/vencimento da parcela/fatura, usando `Lançamentos Cartão` + `Cartões`, e nao pela data da compra. Assim uma compra parcelada impacta o ciclo apenas pela parcela que vence nele. O dashboard tambem mudou o rótulo de `Orçamento do ciclo` para `Gasto livre no ciclo` e mostra a data explicita em `Hoje`.
- Correcao implantada em 2026-05-31: o dashboard web mensal passou a mostrar consumo de cartao pela data da compra, para que categorias de `Lançamentos Cartão` apareçam no mês em que o gasto aconteceu. Isso nao altera a regra do orçamento mensal livre, que continua usando competência/vencimento da fatura. O gráfico financeiro tambem foi ajustado para nao cortar a quinta barra (`Disponível`).
- Dado real corrigido em 2026-05-31: o lançamento `restaurante malz` de R$125,25 do Daniel em `Lançamentos Cartão` foi ajustado de `31/05/2026` para `30/05/2026 22:00`, apos backup `Backup FinancasBot Daniel antes ajustar data restaurante malz 2026-05-31T14-16-28-865Z`.
- Manuais externos em `C:\Users\horus\Documents\FinancasBot\manuals` foram regenerados em 2026-05-31 com backup dos PDFs anteriores. O manual do usuário usa a capa aprovada `ChatGPT Image 29 de mai. de 2026, 19_42_25.png`; ambos incluem a regra nova de parcelamentos no orçamento.

## Mudanca recente sobre caixinha/reserva

O dashboard agora separa:

- `Saldo`: resultado economico do periodo.
- `Disponivel estimado`: saldo economico menos reserva liquida enviada para caixinha/aplicacao.

Exemplo real validado em maio/2026:

- Saldo economico: R$ 3.470,24.
- Aplicado em reserva: R$ 2.738,86.
- Resgatado da reserva: R$ 1.330,00.
- Reserva liquida: R$ 1.408,86.
- Disponivel estimado: R$ 2.061,38.

## Contas e classificacao recorrente

Status: implementado e coberto por testes; confirmar deploy/PM2 antes de assumir que esta ativo em producao.

Comportamento:

- O bot detecta saidas recorrentes e pergunta se deve cadastrar em `Contas`.
- Ao responder `sim`, ele agora pergunta como chamar/classificar a conta.
- A aba `Contas` mantem as quatro primeiras colunas compativeis: `Nome da Conta`, `Dia do Vencimento`, `Observações`, `user_id`.
- Novas colunas opcionais depois de `user_id`: `Nome Amigável`, `Categoria`, `Subcategoria`, `Valor Esperado`, `Regra Ativa`.
- Se `Categoria`, `Subcategoria` e `Regra Ativa=SIM` existirem, futuras importacoes de conta corrente usam essa regra antes da classificacao generica.
- Exemplo: `GRPLQ` pode virar `Moradia / ALUGUEL`.

Atencao:

- Planilhas existentes precisam ter os novos cabecalhos aplicados por template/ensure ou manualmente antes de a regra ficar visivel para o usuario.
- O scheduler le `Contas!A:I` e resolve os campos por cabecalho, preservando compatibilidade com layouts atuais e legados sem depender de posicoes fixas.

## Dashboard - lançamentos recentes

Status: implementado e validado em producao em 2026-05-31.

Deploy:

- GitHub/local: `0c82a54`.
- EC2 via `git am`: `83346c1`.
- Health confirmado: `/dashboard/health` retornou `{"ok":true,"sqlite":true}`.
- WhatsApp confirmou `Bot pronto para receber mensagens` apos restart automatico do PM2.

Comportamento esperado:

- Datas serializadas do Google Sheets, como `46173`, devem ser exibidas em formato brasileiro (`31/05/2026`) no dashboard.
- A lista `Lançamentos Recentes` deve sinalizar o tipo do item: `Entrada`, `Saída` ou `Cartão`.
- Compras parceladas no cartão devem aparecer agrupadas como uma compra só, com o valor total exibido e sufixo como `(3x no cartão)`.
- O agrupamento dos parcelamentos e somente visual no dashboard recente; nao altera os lancamentos reais nem as abas de faturas/parcelamentos.

Teste de regressao:

- `userSheetAnalytics recent transactions format serial dates, label types and group installments`.

## UserSettings e orçamento mensal

Status: implementado e validado em producao em 2026-05-31.

Deploy:

- GitHub/local: `88caf5c`.
- EC2 via `git am`: `f33ed71`.
- Health confirmado: `/dashboard/health` retornou `{"ok":true,"sqlite":true}`.
- WhatsApp confirmou `Bot pronto para receber mensagens`.

Causa raiz do erro `UserSettings!A2:M2 ... tried writing to column [N]`:

- `UserSettings` foi expandida para 19 colunas (`A:S`) com orçamento mensal, escopo familiar e dia inicial do ciclo.
- Um processo/codigo antigo ainda tentou atualizar somente `A:M`, mas enviou dados além da coluna M.

Mitigacao:

- `userService` agora deriva o range de leitura/escrita a partir de `SETTINGS_HEADERS`.
- Novas linhas default de `UserSettings` ja sao criadas com o schema completo.
- Teste de regressao: `userService UserSettings range follows the full settings schema`.

## Perguntas financeiras adversariais

Status: perguntas deterministicas implantadas em producao no commit `1efb5d3`; gate de seguranca contra extracao interna/prompt injection implantado em producao no commit `6dfca42`, coberto por testes unitarios.

Deploy confirmado em producao no commit `1efb5d3`.

Depois de uma bateria real no WhatsApp, perguntas abertas que antes caiam em fallback generico ou categoria errada agora sao roteadas para calculo deterministico:

- `quais contas vencem nos proximos 7 dias?`
- `tenho algum pagamento vencendo amanha?`
- `qual categoria consumiu mais dinheiro este mes?`
- `quantos lancamentos de saida eu tive este mes?`
- `qual cartao tem mais parcelas em aberto?`
- `considerando minha reserva ou caixinha, quanto esta realmente disponivel?`
- `me diga onde eu deveria cortar gastos com base nos meus lancamentos`
- `compare meus gastos com o mes anterior`

Tambem foi endurecido o calculo de vencimento recorrente para meses curtos: vencimento dia 31 usa o ultimo dia valido quando o mes nao tem dia 31.

Nova correcao local pendente/recente: perguntas de metas agora tambem tem rota deterministica:

- `liste minhas metas`
- `minhas metas`
- `quanto falta para eu bater minhas metas?`

Isso evita o erro observado em beta no qual metas caiam como `listagem_gastos_categoria` ou `pergunta_geral`.

O gate de seguranca bloqueia antes de IA/calculo financeiro mensagens que pedem:

- IDs internos (`sheet id`, `user id`, identificadores de planilha/tenant).
- Prompt, regras internas, schema interno ou instrucoes do sistema.
- Tokens, secrets, credenciais OAuth ou chaves.
- Dados/planilhas de outros usuarios/clientes ou `todos os usuarios`.
- Bypass de regras, modo admin/suporte/desenvolvedor ou tentativas de ignorar seguranca.
- Probing de instrucoes recebidas antes da conversa e frases de completacao do tipo `Nao posso responder...`.

Tambem sanitiza logs de mensagens para esconder tokens, parametros OAuth e IDs de documentos Google.

Complemento de seguranca da Financial Query:

- Checklist de seguranca LLM/dados criado em `docs/security/financial-query-security-checklist.md` e auditoria documental aplicada em `docs/audits/financial-query-security-audit.md`.
- A bateria de aceite usa `security/block/clarify` apenas como resultado pre-plano de Security Gate, roteamento ou esclarecimento. Esses valores nao sao operacoes executaveis do `FinancialQueryPlan`.

## Modo analista para detalhamento de gastos

Status: implantado em producao em 2026-06-04.

Motivacao:

- Uma usuaria perguntou detalhes sobre gastos e estabelecimentos; o bot classificou perguntas como `detalhe os gastos pra mim`, `foram gastos como no cartão?` e `foram em quais estabelecimentos?` como totais genericos ou `pergunta_geral`.
- O dashboard nao substitui esse caso: o usuario queria explicar a composicao de um valor diretamente no WhatsApp.

Comportamento novo:

- Novas intents deterministicas: `detalhamento_gastos_mes`, `detalhamento_cartao_mes` e `ranking_estabelecimentos_gastos`.
- O roteamento local reconhece pedidos como `detalhe os gastos`, `explique esse total`, `foram gastos como no cartão?`, `em quais estabelecimentos?` e variacoes de fala/transcricao como `os 328 e 81 foram gastos em quais estabelecimentos?`.
- A resposta local mostra total, quebra por categoria, principais estabelecimentos e lancamentos que compoem o valor.
- Para cartoes, o criterio e `Mês de Cobrança`/fatura, coerente com as perguntas de fatura. A resposta avisa que cartoes entram pela competencia da fatura.
- SQLite/read-model e fallback em memoria tambem sabem responder essas intents, reduzindo dependencia de leituras diretas do Google Sheets.

Decisao arquitetural:

- Nao enviar planilha inteira ao LLM.
- A IA pode ajudar a entender a pergunta, mas os calculos e agrupamentos devem ser feitos por codigo deterministico.
- Documento de ideia/contrato salvo em `docs/ideas/financial-query-engine.md`.
- Em 2026-06-04, o documento foi ampliado para cobrir o universo de perguntas financeiras por dominios, operacoes, filtros, escopo familiar e base temporal.
- Nova base local: `src/query/financialQueryPlan.js` valida planos `FinancialQueryPlan`, bloqueia campos sensiveis/internos vindos de planner LLM e mapeia todos os intents analiticos legados atuais para um contrato composicional.
- Nova base local: `src/query/financialQueryEngine.js` executa a engine generica para `expenses`, `cards`, `income`, `transfers`, `goals`, `debts`, `bills`, `budget` e `dashboard`, com operacoes de soma, contagem, lista, detalhe, agrupamento, ranking, media, percentual, extremos, comparacao, forecast, busca, trend/recommend inicial e deteccao inicial.
- `calculationOrchestrator` ja usa a Query Engine por baixo para `detalhamento_gastos_mes`, `detalhamento_cartao_mes` e `ranking_estabelecimentos_gastos`, preservando o formato legado de resposta para nao quebrar o WhatsApp.
- `messageHandler` agora guarda contexto analitico curto por remetente (TTL 5 minutos) apos uma pergunta financeira bem sucedida. O contexto preserva apenas intent e parametros seguros (`mes`, `ano`, `categoria`, `categorias`, `cartao`, `origem`), sem linhas da planilha, `user_id`, sheet id, token ou dados crus.
- Follow-ups como `e no cartão?`, `foram em quais estabelecimentos?`, `e por categoria?` e `detalha esse total` herdam periodo/cartao/categoria da pergunta anterior quando nao houver periodo explicito. Em follow-up, mes/ano so sao substituidos se o usuario mencionar explicitamente outro periodo.

Testes:

- `node --test tests/unit.test.js` passou com 86 testes.
- `node --test tests/readModelSqlite.test.js` passou com 4 testes.
- `npm test` passou com 241 testes em 2026-06-04.

Deploy:

- GitHub/local: `9c59e88` (`feat: add financial query engine`).
- EC2 via `git am`: `ea0e943`, porque o repo privado bloqueia `git pull` HTTPS sem credencial interativa.
- Validacao em producao: `npm install` retornou 0 vulnerabilidades, `/dashboard/health` retornou `{"ok":true,"sqlite":true}`, PM2 ficou `online`, logs mostraram `WhatsApp pronto` e `Bot pronto para receber mensagens`.

Correcao local em 2026-06-04 apos teste real no WhatsApp:

- Sintoma: `quanto gastei esse mês?` respondia R$328,81, mas follow-ups como `detalhe os gastos pra mim`, `foram em quais estabelecimentos?` e `e por categoria?` caiam para R$55,85 porque alguns caminhos usavam data da compra enquanto outros usavam mes da fatura.
- Ajuste: intents analiticas legadas de gastos passam a usar `timeBasis: billing_month` de forma consistente quando incluem cartoes; follow-ups com `origem=cartao` usam dominio `cards`.
- `ranking_categorias_gastos` tambem passou pela Query Engine antes do fallback legado para nao misturar criterios.
- `me explica de onde veio esse total` agora e reconhecido como pergunta analitica rapida, evitando fallback generico.
- Teste de regressao adicionado em `tests/unit.test.js` cobrindo compras feitas em maio com fatura de junho, ranking por estabelecimento no cartao e explicacao de total.

Nova correcao local em 2026-06-04 apos "bloco 2" real no WhatsApp:

- Sintoma: `qual foi meu maior gasto esse mês?` respondia `maio/2026`, porque o parser de mes encontrava `maio` dentro da palavra `maior`.
- Sintoma: `quanto alimentação representa do total de gastos?` usava R$23,46/R$55,85 em vez de R$206,19/R$328,81, pois `percentual_categoria_gastos` ainda passava pelo calculo legado por data da compra.
- Ajuste: parser de mes agora compara tokens limpos, nao substring; `percentual_categoria_gastos`, `maior_menor_gasto` e `maior_menor_gasto_categoria` usam a Query Engine com `billing_month`; `contagem_ocorrencias` usa linhas detalhadas com fatura para cartoes e mantem fuzzy matching para typos como `onibis`.
- Teste de regressao: `calculationOrchestrator block 2 analytics keep card billing-month totals consistent`.

Complemento local em 2026-06-04:

- Sintoma UX: `me explica de onde veio esse total` era classificado como detalhe, mas a resposta parecia uma listagem generica (`Detalhamento dos gastos...`) em vez de responder diretamente a pergunta do usuario.
- Ajuste: `buildLocalPerguntaResponse` detecta perguntas de explicacao/composicao do total e abre a resposta com `Esse total ... vem de:` e `Total explicado`, mantendo categorias, estabelecimentos e lancamentos.
- Teste de regressao atualizado em `messageHandler local replies cover richer spreadsheet calculations`.

Novo complemento local em 2026-06-04:

- A familia semantica de cartoes/faturas/parcelamentos foi ampliada sem depender de frases exatas.
- Perguntas como `quais compras compõem a fatura deste mês?`, `me mostra os itens da fatura`, `quais lançamentos estão na fatura desse mês?`, `qual cartão tem mais valor em aberto?` e `quais parcelas ainda tenho para pagar?` agora roteiam para respostas deterministicas de composicao de fatura, ranking de cartoes em aberto ou resumo de parcelamentos.
- Respostas de composicao de fatura abrem com `Compras que compõem a fatura...`, evitando UX ambigua de detalhe generico.
- Itens vindos de `Lançamentos Cartão` sao sinalizados como `Cartão - <nome>` mesmo quando o payload nao traz `tipo=cartao`, desde que contenha origem/pagamento/cartao compativel.
- Testes adicionados em `messageHandler.classifyPerguntaLocally covers complex analytical questions`, `messageHandler local replies cover richer spreadsheet calculations` e `calculationOrchestrator calculates card invoices and open installments deterministically`.

Arquitetura alvo oficial:

- Em 2026-06-05, a arquitetura alvo das perguntas financeiras foi formalizada em `docs/specs/financial-query-architecture.md`.
- Decisao central: perguntas financeiras sao consultas analiticas read-only; devem virar `FinancialQueryPlan`, ser calculadas pela Query Engine e formatadas pelo Response Composer.
- Gemini pode interpretar linguagem natural ou melhorar redacao, mas nao pode calcular saldo, total, percentual, ranking, parcelas, orcamento, metas ou dividas.
- Query Engine fica separada da Command Engine: registrar gasto, importar extrato, criar/apagar itens, admin, OAuth e manutencao continuam fora da Query Engine.
- A matriz de cobertura das perguntas financeiras foi criada em `docs/specs/financial-query-coverage-matrix.md`, organizando dominios, operacoes, filtros, bases temporais, fallback e aceite por dominio.
- O contrato oficial do `FinancialQueryPlan` foi criado em `docs/specs/financial-query-plan-contract.md`. Formato canonico: `period` e `scope` ficam dentro de `filters`; `period.month` e zero-based (`0` janeiro, `5` junho, `11` dezembro); campos internos/sensiveis como `user_id`, `sheet_id`, tokens, prompts e linhas cruas devem ser bloqueados antes da execucao.
- O mapa do legado das perguntas financeiras foi criado em `docs/audits/financial-query-legacy-map.md`, classificando rotas atuais como Query Engine, adaptadores legados, SQLite/read-model, fallback em memoria, fallback Sheets, Gemini e riscos conhecidos.
- O roadmap oficial de migracao por dominio foi criado em `docs/specs/financial-query-migration-roadmap.md`. A ordem fixada e: gastos; cartoes/faturas/parcelamentos; entradas; transferencias/caixinha/reserva; orcamento; metas; dividas; contas/vencimentos; familia/escopo; dashboard/resumos. Implementacoes futuras devem seguir esse roteiro e so marcar um dominio como pronto quando ele virar `query_engine_primary`.
- Os pacotes de implementacao para capacidade alta foram criados em `docs/specs/implementation-packets/`. Cada pacote fixa objetivo, arquivos provaveis, limites, aceite, testes, perguntas reais, riscos e criterio de pronto para migrar um dominio sem voltar a remendar frases isoladas.
- A bateria oficial de aceitacao da Financial Query Engine foi criada em `docs/qa/financial-query-acceptance-battery.md`. Ela registra 265 casos porque os minimos por bloco somam 265, cobrindo dominios financeiros, familia, dashboard, adversariais, typos e follow-ups.

Inicio local do Packet 01 - Expenses em 2026-06-05:

- Perguntas locais de gastos agora carregam um `FinancialQueryPlan` validado antes da consulta de dados; `calculationOrchestrator` fica como adaptador temporario de formato para gastos.
- A Query Engine calcula soma, detalhe, ranking por categoria/estabelecimento, percentual, media, maior/menor e trend/evolucao mensal para gastos gerais, incluindo cartoes por `billing_month` quando a pergunta e mensal geral.
- Perguntas de hoje/ontem/ultimos dias e metodos como Pix/dinheiro/debito usam `transaction_date`.
- Respostas de gastos com cartao por `billing_month` agora avisam que cartoes entram pelo mes de cobranca/fatura, nao necessariamente pela data da compra. Isso cobre total mensal, detalhamento, ranking, percentual e evolucao.
- SQLite/read-model segue como fonte preferida quando disponivel e alimenta a Query Engine em caminhos cobertos. Decisao do Packet 01: usuarios em planilha pessoal ainda podem cair no fallback escopado de Google Sheets quando SQLite/read-model nao cobre ou nao esta sincronizado; esse caminho fica documentado como lacuna aceita, medido por `analysis_source=personal_sheet`/`analysis_source=sheets_fallback`, sem enviar dados crus ao Gemini, sem mudar schema e preservando escopo pessoal/familiar.
- Lacunas explicitas do pacote: `gastos_valores_duplicados` e `contagem_lancamentos_saida` permanecem fora do caminho primario porque nao representam consumo geral com cartoes inclusos.
- Validacao local apos revisao do Packet 01: `node --check` passou nos JS alterados; `node --test tests/unit.test.js tests/readModelSqlite.test.js` passou com 100 testes; `npm test` passou com 251 testes.

Inicio local do Packet 02 - Cards, Invoices and Installments em 2026-06-05:

- Perguntas analiticas de cartao/fatura/parcelamento agora entram como `FinancialQueryPlan` com dominio `cards` e passam pelo `query_engine_primary` antes de qualquer fallback.
- Cobertura implementada: total de fatura, faturas por cartao, composicao/itens da fatura, ranking por cartao em aberto, parcelas/parcelamentos ativos, previsao por meses futuros, maior/menor compra parcelada e saldo restante por estabelecimento.
- A Query Engine calcula valores finais, rankings, extremos, previsoes e agrupamentos; `calculationOrchestrator` segue apenas como adaptador temporario para formatos legados de resposta.
- Respostas de cartao declaram a base temporal: fatura/cartao por mes de cobranca/fatura; compras feitas hoje/ontem/data explicita por data da compra.
- SQLite/read-model recebeu metadados derivados de cartao (`card_id`, `card_name`, `installment_text`) para alimentar a Query Engine tambem em parcelamentos sem mudar schema da planilha real.
- Correcao local apos auditoria do Packet 02: a fonte SQLite da Query Engine nao usa mais `LIMIT 1000` antes do calculo. O read-model aplica filtros SQL de escopo, dominio e periodo antes de devolver linhas para a engine, evitando total incompleto silencioso em historicos grandes.
- Semantica ajustada para compra parcelada: quando a pergunta e sobre a compra original maior/menor, o total planejado usa o maior valor entre a soma das parcelas no escopo e `valor da parcela * total de parcelas`; o saldo/restante continua usando apenas parcelas em aberto/no escopo consultado.
- Fallback Sheets continua existindo como rota escopada quando SQLite/read-model nao esta sincronizado ou nao cobre o contexto, mas nao e rota principal e nao envia dados crus ao Gemini.

Inicio local do Packet 03 - Income/Entradas em 2026-06-05:

- Perguntas analiticas de entradas/recebimentos/renda agora entram como `FinancialQueryPlan` com dominio `income` e `timeBasis=transaction_date`, usando a Query Engine como rota primaria.
- Cobertura implementada: total recebido, total por categoria/fonte, salario, renda extra, listagem/detalhe, ranking de fontes e formas de recebimento, maior/menor entrada, contagem, media, percentual, comparacao com mes anterior e evolucao mensal.
- Entradas usam criterio temporal explicito de data de recebimento registrada; respostas locais incluem `Critério: data de recebimento registrada.` quando relevante.
- SQLite/read-model passou a alimentar a Query Engine para entradas com filtros SQL de escopo e periodo antes do calculo, incluindo `Recebimento` e `Recorrente` como metadados derivados, sem alterar schema de planilha real.
- Perguntas ambiguas entre entrada, transferencia, caixinha/reserva ou fatura nao sao roteadas como `income` pelo planner local; quando chegam como pergunta, recebem esclarecimento antes de Gemini/calculo.
- Escritas manuais como `recebi ... da caixinha/reserva` sao tratadas como `Transferências` (resgate de reserva), nao como `Entradas`, para nao inflar renda/dashboard.

Inicio local do Packet 04 - Transferencias/Caixinha/Reserva em 2026-06-05:

- Perguntas analiticas de transferencias, caixinha/reserva e pagamento de fatura agora entram como `FinancialQueryPlan` com dominio `transfers` e `timeBasis=transaction_date`, usando a Query Engine como rota primaria.
- Cobertura implementada: total de transferencias, listagem, reserva aplicada, reserva resgatada, reserva liquida, transferencias entre contas proprias, transferencias para membro familiar autorizado, pagamento de fatura e disponivel estimado.
- A Query Engine classifica transferencias em categorias canonicas (`reserve_applied`, `reserve_redeemed`, `invoice_payment`, `own_transfer`, `family_transfer`) e calcula disponivel estimado como saldo economico ajustado pela reserva liquida.
- SQLite/read-model passou a sincronizar `Transferências` e alimentar a Query Engine com filtros SQL de escopo e periodo antes do calculo, sem mudar schema da planilha real.
- Respostas locais explicam que transferencia interna, pagamento de fatura e caixinha/reserva nao sao gasto real nem renda nova; tambem declaram `Critério: data da transferência registrada.`
- Correcao apos auditoria do Packet 04: escopo explicito pessoal em perguntas de transferencia (`transferi`, `mandei`, `enviei`, `paguei`) agora limita a consulta ao usuario atual; frases como `transferencia para Thais` preservam o escopo familiar/autorizado e usam `Thais` como destino/filtro de membro, nao como troca automatica de `user_id`.
- Fallback Sheets continua existindo apenas como compatibilidade escopada quando SQLite/read-model nao cobre ou nao esta sincronizado; ele nao envia dados crus ao Gemini.

Inicio local do Packet 05 - Budget/Orcamento em 2026-06-06:

- Perguntas analiticas de orcamento mensal livre agora entram como `FinancialQueryPlan` com dominio `budget` e `timeBasis=budget_cycle`, usando a Query Engine como rota primaria.
- Cobertura implementada: quanto posso gastar hoje, quanto ja usei do orcamento, ritmo diario, restante ate o fim do ciclo, escopo pessoal/familiar e explicacao auditavel do calculo.
- A Query Engine calcula ciclo configurado, gasto livre do ciclo, gasto de hoje, ritmo diario recomendado, restante no ciclo, dias restantes, totais por saidas/cartoes e criterios; Response Composer/local reply apenas formata.
- A semantica do dashboard foi preservada: orcamento nao usa mes calendario quando ha dia inicial configurado; ciclos podem cruzar meses; dias 1/28/30/31 usam o helper existente de ciclo; cartoes impactam o orcamento por vencimento/competencia da parcela, nao por data da compra.
- SQLite/read-model passou a sincronizar configuracao publica de orcamento (`UserSettings`) e cadastro de cartoes (`Cartões`) para alimentar a Query Engine com escopo e periodo filtrados antes do calculo, sem mudar schema da planilha real.
- Escopo familiar continua resolvido fora do LLM; resultados de agrupamento por membro usam rotulos publicos (`Membro 1`, etc.) e nao expõem `user_id`.
- Correcao apos auditoria do Packet 05: configuracao de orcamento agora e selecionada pelo escopo pedido. Consulta pessoal nao reutiliza silenciosamente orcamento familiar; consulta familiar usa a configuracao familiar mesmo quando o membro possui orcamento pessoal antigo; sem escopo explicito, vinculo familiar com orcamento familiar ativo prioriza o familiar, em paridade com o dashboard.
- Definir, alterar e desativar orcamento continuam na Command Engine; alertas existentes seguem fora da Query Engine. Fallback Sheets permanece apenas como compatibilidade escopada quando SQLite/read-model nao cobre/sincroniza.
- Auditoria de recuperacao concluida em 2026-06-06: a cobertura equivalente dos Packets 01-04 foi reconstruida por capacidade em `tests/unit.test.js`, cobrindo planner, Query Engine, Response Composer, bases temporais, follow-ups seguros, escopo pessoal/familiar e seguranca. A auditoria encontrou e corrigiu regressões funcionais causadas pela recuperacao: tendencia mensal agrupando linhas/dias em vez de meses, maior/menor compra parcelada comparando parcelas isoladas e reserva liquida somando aplicacao com resgate em vez de subtrair. Uma revisao adversarial posterior tambem corrigiu tendencias por `transaction_date` que ainda agrupavam cartoes pelo mes da fatura, limite de tendencia que retornava os meses mais antigos e fusao indevida de compras parceladas distintas com mesmo estabelecimento/cartao/categoria. `tests/unit.test.js` passou com 110/110; bateria focada com SQLite e maquina de estados passou com 161/161; `npm test` passou com 274/274. O blocker de cobertura antes do Packet 06 foi removido, mas nenhum trabalho do Packet 06 foi iniciado.

## Packet 06 - Goals/Metas (local, sem deploy)

- Consultas analiticas de metas agora usam `FinancialQueryPlan` com `domain=goals` e passam por `query_engine_primary`.
- `Metas` permanece a fonte autoritativa de valor atual, alvo, status e escopo. `Movimentacoes Metas` alimenta historico, aportes, retiradas e explicacao auditavel; a Query Engine nao soma as duas fontes, evitando dupla contagem.
- O read-model SQLite ganhou `goal_movements` e filtra metas pessoais/familiares autorizadas antes da Query Engine. Sheets permanece como fallback escopado e observado.
- Metas pausadas, canceladas e concluidas sao distinguidas e nao entram no faltante/progresso ativo.
- Criacao, aporte, retirada, ajuste e mudanca de status continuam exclusivamente no Command Engine.
- Cobertura local adicionada para planner, progresso/faltante, historico, status, escopo familiar, ausencia de IDs publicos e compatibilidade com a maquina de estados.
- Correcao apos auditoria do Packet 06: `resumo_metas` agora preserva filtros seguros vindos do planner, incluindo `scope=family`, e o classificador local reconhece `familiares` no plural. Isso evita que perguntas como "quais metas familiares temos?" misturem metas pessoais na resposta.
- Validacao apos auditoria: bateria focada (`unit`, `readModelSqlite`, `financialStateMachine`) passou com 167/167 e `npm test` passou com 280/280. Nenhum deploy, commit ou Packet 07 iniciado.

## Packet 07 - Debts/Dividas (local, sem deploy)

- Consultas analiticas de dividas agora usam `FinancialQueryPlan` com `domain=debts` e `timeBasis=due_date`, passando por `query_engine_primary`.
- Cobertura implementada: saldo total, saldo por divida/credor, parcelas/vencimentos proximos, atrasadas, quitadas, ranking por juros/vencimento/saldo, recomendacao read-only de prioridade e explicacao auditavel.
- SQLite/read-model sincroniza campos ja existentes da aba `Dívidas` para uma tabela local expandida e alimenta a Query Engine com escopo filtrado antes do calculo. A planilha real nao teve schema alterado.
- Criar divida e registrar pagamento continuam no Command Engine; perguntas de escrita nao entram na Query Engine.
- Resultados publicos nao expoem `user_id`, `sheet_id`, tokens, URLs privadas ou linhas cruas. Escopo pessoal/familiar segue resolvido antes da Query Engine.
- Lacuna aceita: a aba atual nao possui historico individual de pagamentos de dividas; "pagamentos registrados" sao inferidos de forma deterministica como `Valor Original - Saldo Atual`. Historico detalhado exigiria pacote/schema proprio futuro.
- Correcao apos auditoria do Packet 07: perguntas de vencimento relativo como "nos proximos dias" nao recebem mais mes/ano implicitos e atravessam corretamente a virada do mes.
- Correcao apos auditoria do Packet 07: o read-model preserva e usa os cabecalhos reais da aba `Dívidas`, mantendo compatibilidade com o schema legado e com o schema atual de planilhas de usuario.
- Correcao apos auditoria do Packet 07: dividas ativas sem `Próximo Vencimento` explicito derivam o proximo vencimento pelo dia cadastrado e nao ficam atrasadas para sempre; dias 29/30/31 sao ajustados para meses curtos.
- Correcao apos auditoria do Packet 07: a criacao de divida monta a linha conforme os cabecalhos da planilha ativa, evitando gravar status, parcelas pagas e proximo vencimento em colunas incorretas.
- Validacao apos auditoria: bateria focada (`unit`, `readModelSqlite`, `financialExplainability`, `financialStateMachine`) passou com 178/178 e `npm test` passou com 289/289. A bateria `functional.test.js` habilitada permaneceu bloqueada corretamente pela trava de seguranca de reset de planilha; ela nao foi forçada contra dados reais. Nenhum deploy, commit ou Packet 08 iniciado.

## Packet 08 - Bills/Contas e vencimentos (local, sem deploy)

- Consultas analiticas de contas recorrentes e vencimentos agora usam `FinancialQueryPlan` com `domain=bills` e `timeBasis=due_date`, passando por `query_engine_primary`.
- Cobertura implementada: cadastro/listagem de contas recorrentes, vencimentos hoje/amanha/proximos N dias, total esperado, total realizado associado, total pendente, status pago/pendente, comparacao esperado versus realizado e explicacao auditavel.
- A Query Engine materializa ocorrencias mensais deterministicamente e ajusta dias 29, 30 e 31 para o ultimo dia valido em meses curtos. Janelas relativas atravessam viradas de mes e ano.
- `Contas` continua sendo a fonte do valor esperado e vencimento; `Saídas` fornece o realizado. Cada saida e atribuida a melhor conta compativel do mesmo usuario e mes por descricao, categoria e subcategoria, sem dupla contagem. `Regra Ativa` continua significando classificacao automatica, nao status pago.
- SQLite/read-model ganhou a tabela local `recurring_bills` e alimenta a Query Engine com contas e apenas as saidas do escopo/periodo necessario antes do calculo. Nao houve mudanca no schema real da planilha.
- Scheduler e Query Engine compartilham a mesma regra de vencimento recorrente para meses curtos. Eventos do Calendar permanecem fora do calculo financeiro de contas.
- Escopo pessoal/familiar continua resolvido antes da Query Engine; resultados publicos nao expoem IDs internos. Criar/alterar conta, lembrete e calendario continuam fora da Query Engine.
- Lacunas aceitas: a aba `Contas` nao possui confirmacao explicita de pagamento, entao pago/pendente e inferido por associacao com `Saídas`; uma conta manual paga somente por cartao ou registrada apenas como transferencia pode continuar pendente ate existir vinculacao explicita entre fontes. Contas muito parecidas podem exigir um identificador de regra em pacote/schema futuro. Planilha pessoal ainda pode usar fallback Sheets escopado quando o read-model nao cobre ou nao esta sincronizado.
- Validacao apos auditoria do Packet 08: bateria focada (`unit`, `readModelSqlite`, `schedulerJobs`, `financialExplainability`, `financialStateMachine`) passou com 197/197; `npm test` passou com 301/301. Nenhum deploy, commit ou Packet 09 iniciado.
- Correcao apos auditoria do Packet 08: o scheduler agora calcula o proximo vencimento recorrente, atravessando viradas de mes e ano, e mostra o dia real quando um vencimento 29/30/31 e ajustado para mes curto.
- Correcao apos auditoria do Packet 08: a inferencia de pagamento deixou de aceitar subcategoria isolada como evidencia suficiente; exige nome/descricao compativel ou categoria, subcategoria e valor esperado compativeis.
- Correcao apos auditoria do Packet 08: textos muito curtos nao podem produzir correspondencia fuzzy e marcar uma conta como parcialmente realizada por engano.
- Correcao apos auditoria do Packet 08: consultas familiares autorizadas reconhecem pagamento feito por outro membro, enquanto consultas pessoais continuam isoladas. Perguntas por conta especifica filtram tanto nome amigavel quanto nome original cadastrado.

## Packet 09 - Family and Scope (local, sem deploy)

- O `Scope Resolver` transversal foi consolidado em `src/services/financialScopeResolver.js` e agora roda uma unica vez, fora do LLM, depois do plano e antes de qualquer leitura financeira.
- Escopo pessoal virou o default efetivo. Familia exige vinculo ativo; membro exige correspondencia unica dentro do vinculo autorizado; ambiguidade ou membro nao autorizado gera esclarecimento antes da Query Engine.
- O escopo resolvido e aplicado ao `FinancialQueryPlan`, ao SQLite/read-model e ao fallback Sheets. O read-model ignora listas de usuarios que tentem ampliar acesso sem um escopo resolvido autorizado.
- Follow-ups preservam apenas `scope` e nome publico seguro do membro. Contexto pessoal nao pode ser promovido silenciosamente para familia/membro, e revogar o vinculo remove o membro da proxima resolucao imediatamente.
- Correcao apos auditoria do Packet 09: follow-up generico vindo de contexto pessoal tambem nao pode ser promovido para `member` apenas porque planner/contexto trouxe `requestedMember`. A promocao para membro segue permitida quando o usuario nomeia explicitamente o membro na nova pergunta.
- Correcao apos auditoria do Packet 09: `matchedUser` no resultado do resolver foi reduzido a rotulo publico, evitando carregar o registro completo do usuario em objetos que podem circular por helpers, logs ou testes.
- Nomes de cartao nao concedem identidade/permissao de membro. Consultas como fatura do `Nubank Thais` continuam pessoais salvo pedido familiar ou por pessoa explicitamente autorizado.
- Admin nao ganha acesso financeiro amplo pela Query Engine. `ALL_USERS_ID` e pedidos de todos os usuarios sao bloqueados nesse caminho; a excecao temporaria do dashboard continua separada e regida pelo ADR-002.
- Logs novos de resolucao registram apenas escopo, contagem e motivo seguro. Logs de vinculo/revogacao familiar deixaram de imprimir IDs internos.
- Lacuna aceita: o dashboard ainda possui excecao all-users controlada por flag para beta/teste, fora da Financial Query Engine; sua remocao/substituicao permanece gate obrigatorio antes de escala multiusuario, conforme ADR-002.
- Lacuna aceita: logs novos da rota analitica e de vinculo/revogacao familiar nao imprimem IDs internos, mas ainda existem logs operacionais legados fora da Query Engine, especialmente em admin/OAuth/escritas, que carregam IDs. A sanitizacao global deve ser tratada em pacote proprio para nao ampliar o Packet 09 sobre onboarding, OAuth, admin e escrita financeira.
- Validacao local do Packet 09: `node --check` passou nos 12 arquivos JS alterados; bateria focada de escopo, seguranca, Query Engine, SQLite, OAuth, explainability e maquina de estados passou com 207/207; `npm test` passou com 307/307. Nenhum deploy, commit ou Packet 10 iniciado.
- Revalidacao apos auditoria corretiva do Packet 09: `node --check` passou nos arquivos revisados; bateria focada (`unit`, `readModelSqlite`, `googleOAuthService`, `financialStateMachine`, `dashboardAuthSecurity`) passou com 204/204; `npm test` passou com 307/307; `state_store.json` foi restaurado para `{}`. Nenhum deploy, commit ou Packet 10 iniciado.

## Packet 10 - Dashboard and Summaries (local, sem deploy)

- Dashboard API, UI e WhatsApp `resumo` passaram a compartilhar criterios publicos de calculo via `dashboardSummaryService`, sem Gemini calcular KPIs, percentuais, rankings, orcamento, metas, dividas ou parcelas.
- O `resumo` do WhatsApp deixou de montar leitura paralela de Sheets/saude de caixa e agora formata o mesmo snapshot deterministico do dashboard/read-model ou da planilha pessoal escopada.
- O dashboard declara bases temporais: entradas por data de recebimento/lancamento, saidas por data da compra/lancamento, cartoes do dashboard mensal por data da compra, orcamento por ciclo configurado/competencia da parcela, e transferencias internas fora de renda/gasto.
- SQLite/read-model agora inclui reserva/caixinha no `saldoDisponivelEstimado` e mostra transferencias em lancamentos recentes com tipo explicito, sem misturar com renda ou despesa.
- Planilha pessoal continua como fonte primaria quando existe contexto OAuth do usuario, mas o contrato publico agora e decorado com os mesmos criterios do dashboard. A excecao admin `ALL_USERS_ID` continua apenas como modo beta/suporte isolado por flag conforme ADR-002.
- Validacao local do Packet 10: `node --check` passou nos JS alterados; bateria obrigatoria (`dashboardApiContracts`, `dashboardAuthSecurity`, `financialExplainability`, `readModelSqlite`, `unit`) passou com 170/170; `npm test` passou com 309/309; `git diff --check` passou; varredura NUL sem achados; `state_store.json` restaurado para `{}`. Nenhum deploy, commit ou Packet 11 iniciado.

## Higiene do workspace

## Validacao completa de 2026-06-12

- A bateria `Financial Query Acceptance` passou com 265/265 casos, incluindo 23 pedidos adversariais bloqueados antes do planner.
- O seletor de usuario do dashboard deixou de exibir telefone, `user_id` e status no rotulo visivel; o identificador interno continua restrito ao valor usado pela autorizacao da API.
- O E2E real com a Thais revelou que respostas de importacao familiar podem chegar por identificador diferente do usado para salvar o estado inicial da midia. O handler agora recupera estados pendentes de importacao pelo mesmo `user_id`, migra para o `senderId` atual e segue o fluxo sem expor dados de outro usuario.
- O smoke analitico real de Daniel passou usando um periodo populado (`junho de 2026`) e confirmou totais, detalhamento, categorias, extremos e estabelecimentos coerentes.
- O runner do WhatsApp Web deixou de depender apenas da contagem de texto visivel. Ele agora reconhece a ultima mensagem recebida por fingerprint, evitando falso timeout quando o WhatsApp virtualiza uma resposta antiga e uma nova resposta identica entra no DOM.
- O security gate passou a bloquear identificadores internos escritos com separadores, como `sheet_id` e `user-id`, antes de chamar Gemini ou Query Engine.
- Benchmark final: `gemini-3.1-flash-lite` teve 96/120 correspondencias, JSON valido 120/120, zero saida insegura, consistencia 40/40 e media de 1138 ms; `gemini-3.5-flash` teve 90/120, JSON valido 120/120, zero saida insegura, consistencia 40/40 e media de 5141 ms. Nenhum atingiu o gate de 98% de campos criticos, portanto nao trocar o modelo de producao ainda.
- O teto mensal foi liberado temporariamente e permitiu concluir o benchmark, mas o proprio benchmark consumiu a nova margem. Mesmo apos novo aumento informado em 2026-06-12, uma chamada minima ainda recebeu `monthly_spending_cap`; pode haver atraso de propagacao no AI Studio. Consultas deterministicas continuam operacionais; audio e interpretacao livre dependem da liberacao efetiva do teto.

## Fechamento da validacao completa de 2026-06-13

- A bateria `Financial Query Acceptance` foi reexecutada com 265/265 casos aceitos, zero divergencias e 23 pedidos bloqueados antes do planner. Os 20 casos `ADV-*` continuam bloqueados intencionalmente pelo Security Gate.
- A suite automatizada completa passou com 342/342 testes antes do hardening final de logs. O fechamento final deve sempre reexecutar a suite depois das ultimas alteracoes.
- O E2E real controlado de Calendar/scheduler com usuario comum passou: evento exato criado e lido, lembrete isolado capturado por cliente falso, limpeza exata confirmada e segunda limpeza idempotente com zero exclusoes.
- Foi criada a primitiva `deleteTestCalendarEventsByExactSummary`, que exige `user_id`, marcador `TESTE_APAGAR_`, titulo exato, propriedade privada do usuario e origem `whatsapp`. Ela nao aceita limpeza fuzzy nem titulos normais.
- A auditoria de logs encontrou identificadores crus em caminhos operacionais legados. O logger Winston passou a sanitizar centralmente IDs, telefones, tokens, URLs privadas e conteudo de `msg`/`command`; escapes `console.*` identificados em mensagem, scheduler, Google e rate limit foram movidos para o logger sanitizado.
- Quatro rejeicoes nao tratadas encontradas nos ultimos logs de producao pertenciam a fluxos ja corrigidos no codigo atual: feedback seguro ao falhar salvamento de orcamento e fallback de resposta em comandos admin sem `msg.reply`.
- Producao auditada antes do hardening final: PM2 online, health com SQLite saudavel, worktree remoto limpo, all-users desativado, `state_store.json` limpo e zero marcadores `TESTE_APAGAR_` em dados.
- Onboarding/OAuth novo completo continua dependendo de numero e conta Google descartaveis. Acoes admin destrutivas e alteracao real de familia permanecem validadas automaticamente ou por evidencia historica, sem serem repetidas contra dados reais apenas para cumprir ritual.
- A release final foi implantada no commit `dfbf528`, com rollback registrado em `05b4d85`. O pos-deploy confirmou PM2 online, WhatsApp ready, health/SQLite saudaveis, worktree remoto limpo, all-users desativado, estado limpo e zero marcadores de teste.
- A verificacao de logs posteriores ao marcador sintetico de seguranca confirmou zero identificadores crus, zero rejeicoes nao tratadas e zero dumps crus de respostas da IA. Linhas antigas anteriores ao hardening permanecem no arquivo historico ate a politica de retencao remove-las.
- O plano de validacao completa esta encerrado. O relatorio oficial esta em `docs/qa/complete-validation-report-2026-06-13.md` e o manifesto em `docs/qa/complete-validation-manifest-2026-06-13.json`.

## Auditoria de confiabilidade de interpretacao - 2026-06-13

- Foi iniciada uma camada model-independent para escrita financeira, documentada em `docs/specs/interpretation-reliability-layer.md` e auditada em `docs/audits/interpretation-reliability-audit.md`.
- A bateria offline de confiabilidade gera 350 casos em `src/reliability/interpretationReliabilityAcceptance.js`; o artefato de QA esta em `docs/qa/interpretation-reliability-acceptance-battery.md`.
- Correcoes locais cobertas por TDD: avaliador Gemini v2 por campo, defaults inseguros de pagamento/recebimento, composer analitico sem Gemini/raw rows, privacidade de audio, append sem retry cego por padrao, ledger opcional de escrita, estado persistido redigido, shadow telemetry sanitizada, remocao de telefones reais de codigo/docs/fixtures versionados, parse de valor/data sem Gemini, confirmacao obrigatoria para escritas financeiras derivadas de linguagem livre/LLM e QA log com hash/referencia em vez de mensagem financeira.
- Verificacao local final: `npm test` 377/377, `npm audit --audit-level=high` sem vulnerabilidades, bateria financeira 265/265, bateria de confiabilidade 340/340, `node --check` nos JS alterados sem erro, `git diff --check` sem erro bloqueante, `state_store.json` `{}`, NUL scan sem achados e varredura de padroes sensiveis sem achados nos artefatos novos/testes auditados. Sem deploy e sem commit nesta etapa.
- Shadow mode usa `INTERPRETATION_RELIABILITY_MODE=off|shadow|enforce` e `INTERPRETATION_RELIABILITY_OPERATIONS`; o padrao continua `off`. Nao ativar `enforce` antes de observar decisoes reais sanitizadas conforme os gates da spec.
- O monitor local de prontidao para `enforce` foi adicionado em `src/reliability/enforceReadinessMonitor.js`, com comando `npm run report:interpretation-readiness`. Ele le a telemetria sanitizada do shadow, exige volume minimo, janela de observacao, operacoes obrigatorias e zero divergencia critica, mas nunca muda flag nem habilita `enforce` automaticamente; no maximo recomenda `manual_review_for_enforce`.
- O notifier de prontidao foi conectado ao scheduler para rodar diariamente as 09:15. Em shadow, ele fica silencioso durante a coleta, avisa admins uma unica vez quando chegar a `manual_review_for_enforce` e alerta quando surgir/aumentar divergencia critica. O estado local de deduplicacao nao guarda dados financeiros ou IDs de usuarios, e o notifier nunca ativa `enforce`.
- Revalidacao local do monitor/notifier: `npm test` 385/385, `npm audit --audit-level=high` sem vulnerabilidades, bateria financeira 265/265, bateria de confiabilidade 340/340, `npm run report:interpretation-readiness` recomendou `keep_shadow` por falta esperada de telemetria real, `git diff --check` sem erro bloqueante, NUL scan sem achados e `state_store.json` `{}`. Sem deploy nesta etapa.
- Nesta etapa offline foram usadas 0 chamadas Gemini. O manifesto esta em `docs/qa/interpretation-reliability-manifest-2026-06-13.json`.
- Deploy do shadow/notifier concluido em 2026-06-14 com o codigo `3cab49d`. Producao ficou com `INTERPRETATION_RELIABILITY_MODE=shadow`, allowlist `expense.create,income.create`, alertas habilitados e `DASHBOARD_ADMIN_ALL_USERS_ENABLED=false`. PM2, WhatsApp e `/dashboard/health` ficaram saudaveis; o monitor recomendou `keep_shadow` com 0 decisoes, 0 divergencias criticas e nenhum alerta indevido. Rollback: `79d0a9b`; backup: `/home/ubuntu/financas-bot-backups/release-20260614T0218Z-interpretation-shadow`.
- Evolucao local em 2026-06-14: `enforce` deixou de ser apenas um nome aceito pela telemetria e ganhou policy gate real. Para gasto/entrada unitarios fora do credito, `execute` segue, `confirm` exige confirmacao, `clarify` pede campo ausente e `block` interrompe. A proveniencia `deterministic|llm|user_state` atravessa perguntas de pagamento/recebimento, evitando salvar valor LLM-only depois de o usuario responder apenas o metodo.
- O readiness monitor local passou a exigir tambem pelo menos 10 decisoes por operacao obrigatoria, alinhamento operacional de auto-save >= 99,5%, zero caso ambiguo auto-gravado, zero chamada Gemini adicional, evidencia completa de latencia e p95 <= 50 ms. Esse alinhamento e proxy operacional, nao prova de correcao semantica; `enforce` continua dependendo de revisao humana e bateria offline.
- Revisao adversarial local em 2026-06-14 fechou tres riscos antes de `enforce`: metadados internos vindos do JSON LLM sao removidos, frases com multiplos numeros sem valor monetario inequivoco nao escolhem o primeiro numero, e conflitos entre parser deterministico e interpretacao exigem esclarecimento.
- Evolucao local de recuperacao em 2026-06-14: `deleteRowsByIndices` e `updateRowInSheet` passaram a usar operation key e `financialWriteLedger` quando ha contexto/chave de mensagem. Replays `committed` retornam recibo idempotente sem chamar o Google de novo; deletes `pending/uncertain` bloqueiam para evitar apagar linha deslocada; updates `pending/uncertain` reconciliam apenas quando a linha atual ja bate com o valor esperado, caso contrario bloqueiam para evitar restaurar valor antigo. Importacoes confirmadas usam chave estavel por item do arquivo para impedir duplicacao em replays de confirmacao. Appends, updates, deletes e importacoes estao cobertos; batches manuais e comandos operacionais fora desse contexto continuam como proximos pacotes.
- Producao permanece em `shadow`; esta evolucao local nao ativa `enforce`. Credito, transferencias, lotes, audio, importacao e demais mutacoes continuam fora do gate inicial.
- Revalidacao local da recuperacao em 2026-06-14: `node --check` passou em 10 JS alterados, testes focados de ledger/importacao passaram, confiabilidade+state machine 81/81, bateria IRAB 340/340, bateria Financial Query 265/265, `npm audit --audit-level=high` 0 vulnerabilidades, `npm test` 408/408, `git diff --check` sem erro bloqueante, NUL scan limpo, `state_store.json` `{}` e readiness `KEEP_SHADOW` por falta esperada de amostra real.

## Expansao local do LangGraph financial agent - 2026-06-14

- O agente read-only passou a reutilizar o `FinancialQueryPlan` ja validado pelo roteamento local e executa a Query Engine como ferramenta; o Gemini nao pode construir esse plano.
- Foram adicionadas ferramentas deterministicas de snapshot do dashboard e explicacao de metricas. Resultados aninhados passam por sanitizacao de chaves internas antes de circular no agente.
- Orcamento sem configuracao ativa passou a ser um estado consultavel e seguro, em vez de parecer indisponibilidade do read-model.
- Pedidos de navegacao/geracao de dashboard sao esclarecidos e nao confundidos com analise financeira.
- O runner `npm run test:financial-agent` executou os 265 casos oficiais pelo LangGraph com 265/265 aceitos, 23 bloqueios de seguranca, 238 respostas verificadas e 0 chamadas Gemini.
- Revisao adversarial confirmou: ferramentas somente leitura, escopo resolvido fora do LLM, SQL sandbox em memoria sobre dados publicos escopados, planner Gemini desligado e `answer` desligado.
- Verificacao local deste incremento: testes focados 19/19, `npm test` 430/430, Financial Query Acceptance 265/265, Interpretation Reliability 340/340, `npm audit --audit-level=high` sem vulnerabilidades, `git diff --check` sem erro bloqueante, NUL scan limpo e `state_store.json` restaurado para `{}`.
- Proximo gate: deploy apenas em `shadow`, mantendo `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=false`, `FAMILY_MODE_ENABLED=false` e sem ativar `answer`. Antes de `answer`, ainda faltam verificador forte de percentuais/ordenacao/contagens/tendencias e bateria livre controlada do planner Gemini.
- Deploy da expansao shadow concluido no commit `565e843` em 2026-06-14. Backup: `/home/ubuntu/financas-bot-backups/release-20260614-agent-shadow-tools-565e843`; rollback: `9c6047a`.
- Pos-deploy: PM2 online, `/dashboard/health` com SQLite saudavel, Google/Sheets/read-model prontos, WhatsApp ready apos o timeout controlado da primeira tentativa e um reinicio automatico do PM2. Smoke sintetico read-only retornou `query_financial_plan` com resposta verificada.
- Flags confirmadas em producao: `FINANCIAL_AGENT_MODE=shadow`, `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=false`, `FAMILY_MODE_ENABLED=false` e `DASHBOARD_ADMIN_ALL_USERS_ENABLED=false`. O agente ainda nao responde ao usuario e nao faz chamadas Gemini adicionais.
- Evolucao local pos-deploy em 2026-06-14: o `resultVerifier` deixou de validar apenas valores monetarios e passou a bloquear percentuais inventados, relacao percentual matematicamente invalida, contagens sem suporte, resposta de "ultimo" fora da primeira linha ordenada e tendencias/rankings com ordem diferente da ferramenta. A regra de `parte de total` fica restrita a `operation=percentage`; comparacoes continuam validadas por `difference / previous`.
- Foi criada a bateria `scripts/runFinancialAgentNovelPlannerBattery.js` para perguntas livres do planner agentic. O padrao e `dry-run`, com 0 chamadas Gemini. O modo live exige `--live --max-calls N`, tem teto duro de 40 chamadas e registra consumo por caso. O novo script esta ligado ao `npm test` por `tests/financialAgentNovelPlannerRunner.test.js`, mas nao ativa planner nem `answer`.
- Revalidacao local desta evolucao: `npm test` passou com 438/438; `npm audit --audit-level=high` sem vulnerabilidades; `node --check` nos JS alterados passou; Financial Agent Acceptance passou com 265/265, 23 bloqueios de seguranca, 238 respostas verificadas e 0 chamadas Gemini; Financial Query Acceptance passou com 265/265; Interpretation Reliability passou com 340/340; NUL scan sem achados e `state_store.json` em `{}`. Ainda falta decidir se vale fazer uma bateria live curta do planner. Nao houve deploy nem commit desta evolucao.
- Bateria live curta do planner Gemini executada em 2026-06-14 com teto controlado. Rodada inicial: 5 casos, 5 chamadas Gemini, 4 aceitos e 1 gap (`NOVEL-003`, pergunta com "do mes" que virou esclarecimento por falta de data de referencia no prompt). Correcao local: o prompt do planner passou a incluir data de referencia no calendario de `America/Sao_Paulo`, mes/ano atual e regra geral para interpretar `hoje`, `ontem`, `este mes`, `do mes`, `lancamento`, `movimento` e `transacao`; o runner ganhou `--case` para revalidar gaps com uma unica chamada. Revalidacao focada: `NOVEL-003` passou com 1/1 e 1 chamada Gemini. Total desta auditoria live curta: 6 chamadas Gemini. `answer` e planner em producao continuam desligados.
- Fechamento local desta fatia: `npm test` passou com 439/439; Financial Agent Acceptance passou com 265/265, 23 bloqueios de seguranca, 238 respostas verificadas e 0 chamadas Gemini; Financial Query Acceptance passou com 265/265; Interpretation Reliability passou com 340/340. A bateria live curta nao substitui a bateria agentic ampla de pelo menos 200 perguntas livres exigida antes de considerar `answer`.
- Deploy shadow desta fatia concluido no commit `a3c3c33`. Backup de codigo anterior: `/home/ubuntu/financas-bot-backups/pre-release-20260615T0112Z-f6457db-before-planner-relative-dates.tar.gz`; rollback Git: `f6457db`. Pos-deploy confirmou PM2 online, WhatsApp ready, `/dashboard/health` com `{"ok":true,"sqlite":true}`, worktree remoto limpo e flags preservadas: agente em `shadow`, planner Gemini desligado, Family Mode desligado e dashboard all-users desligado.
- Evolucao local em 2026-06-16: a bateria livre do planner agentic foi ampliada para 255 perguntas, incluindo recentes, SQL livre, dashboard/metricas, periodos relativos, clarificacoes e adversariais. O runner ganhou selecao estratificada por tag para amostras live pequenas e representativas, mantendo live bloqueado sem `--max-calls`.
- A bateria livre ampliada passou offline com `255/255`, `0` gaps e `0` chamadas Gemini. A amostra live estratificada inicial usou 6 chamadas, encontrou 1 gap em dashboard (`NOVEL-008`) e foi corrigida sistemicamente: negacoes como "sem abrir o dashboard" nao sao mais tratadas como pedido de navegacao; dashboard familiar exige `ownerUserId` dentro do escopo autorizado; e o verificador passou a preservar moeda negativa (`-R$ ...`) para nao bloquear respostas legitimas de reserva/disponivel. Revalidacao focada de `NOVEL-008`: `1/1`, `0` gaps, `1` chamada Gemini. Producao ainda nao recebeu esta fatia.
- Evolucao local em 2026-06-16: adicionado check diario operacional em `src/services/dailyOpsCheckService.js`, chamado pelo scheduler as 09:05 quando `DAILY_OPS_CHECK_ENABLED=true`. O check envia aos admins um resumo sanitizado sem Gemini, cobrindo cliente WhatsApp disponivel para envio, SQLite/read-model, flags perigosas (`DASHBOARD_ADMIN_ALL_USERS_ENABLED`, `FINANCIAL_AGENT_MODE=answer`, planner Gemini ligado, Family Mode e `INTERPRETATION_RELIABILITY_MODE=enforce`), readiness do shadow e metricas locais. O notifier de readiness as 09:15 continua separado e nunca ativa `enforce`.
- Auditoria final local em 2026-06-19 para ativacao parcial de `INTERPRETATION_RELIABILITY_MODE=enforce` encontrou e corrigiu um achado `HIGH`: gastos no credito completos podiam ser bloqueados porque o gate de `expense.create` nao recebia `card`/`installments` antes de decidir. A correcao local faz o gate enxergar cartao/parcelas explicitos ou selecionados, adiciona confirmacao antes de salvar credito quando campo critico veio do Gemini, e registra telemetria sanitizada para gravacoes em cartao. Validacao local: `node --check src\handlers\messageHandler.js`, testes focados 88/88, `npm test` 458/458, `npm audit --audit-level=high` 0 vulnerabilidades, gate acelerado `READY_FOR_ALTISSIMA_AUDIT` com cutoff `2026-06-18T00:00:00.000Z`. Producao ainda estava em `df58504` no momento da auditoria; nao ativar `enforce` antes de commitar/deployar esta correcao e repetir smoke/gate. Relatorio: `docs/qa/enforce-final-audit-2026-06-19.md`.

## Financial Agent answer + Gemini Planner - 2026-06-23

- Produto atual esta em transicao para uso familiar/conversacional. O Financial Agent pode responder perguntas read-only verificadas em `FINANCIAL_AGENT_MODE=answer`; escritas financeiras continuam fora do agente read-only e seguem pela camada de confiabilidade/estado.
- Baseline operacional registrado no handoff de 2026-06-24: producao em `853bdc3` com `FINANCIAL_AGENT_MODE=answer`, `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true` e `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer`. Isso torna a Fase 0 antiga do roadmap defasada como texto: ela nao e mais decisao de ativar `answer`/planner, e sim estabilizacao e auditoria do baseline ja ativo.
- O Gemini Planner foi expandido para poder criar `FinancialQueryPlan` validado quando o roteamento local nao cobre uma pergunta. Isso e fallback de planejamento, nao calculadora: valores, percentuais, rankings, orcamento, contas, metas e dividas continuam calculados por Query Engine, SQL sandbox read-only ou snapshot deterministico.
- `query_financial_plan` vindo do Gemini so e aceito depois de `normalizeFinancialQueryPlan`; campos internos como `user_id`, `sheet_id`, tokens, OAuth, prompts e raw rows continuam bloqueados. SQL livre segue restrito a `SELECT` em `financial_events_public`, com `LIMIT` e allowlist de colunas/tabela.
- O prompt do planner agora explicita que `period.month` no `FinancialQueryPlan` e zero-based (`janeiro=0`, `junho=5`) para evitar consultas no mes errado.
- Perguntas livres sobre contas pendentes/em aberto podem ser planejadas pelo Gemini para `domain=bills`, `operation=list`, `status=pending`, evitando a regressao em que "conta" podia virar categoria de gastos. A resposta de contas pendentes ganhou UX propria com vencimento, status e valor pendente/esperado.
- O check diario operacional aceita `FINANCIAL_AGENT_MODE=answer` e `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true` somente quando houver flags explicitas `FINANCIAL_AGENT_ANSWER_APPROVED=true` e `FINANCIAL_AGENT_LLM_PLANNER_APPROVED=true`. Sem essas aprovacoes, continua alertando como flag perigosa.
- Revisao de roadmap em 2026-06-24: `docs/plans/family-financial-platform-evolution-roadmap.md` agora define a Fase 0 como estabilizacao de `answer + planner + contextual analyst + enforce parcial`, incluindo auditoria de logs, custo/chamadas Gemini, fallbacks, replay sanitizado, live curta controlada e rollback separado por flag.
- O planner Gemini read-only ajuda consultas; ele nao deve salvar, apagar, criar categoria, criar conta ou reclassificar gasto sem passar pela camada de confiabilidade/confirmacao.

## Orcamento livre e categorias novas - 2026-06-24

- Correcao local: pagamentos que batem com `Contas` cadastradas deixam de entrar no gasto livre do orcamento na Query Engine, no dashboard pessoal e no alerta diario de orcamento do `messageHandler`. O matching fica em `src/utils/recurringBillMatcher.js`, preserva escopo por `user_id` e reutiliza criterio de descricao/nome amigavel ou categoria+subcategoria+valor compativel.
- Escrita de gasto unitario com categoria ausente, `Outros` ou categoria desconhecida agora pede classificacao antes de salvar. O usuario responde `Categoria / Subcategoria` ou `Outros`; depois o fluxo continua para forma de pagamento/cartao/salvamento com a camada de confiabilidade. Lotes e importacoes continuam fora desta fatia.
- Este pacote local fecha a pendencia imediata que estava separada do planner, mas ainda precisa release/smoke/rollback antes de virar baseline de producao. A Fase 0 revisada exige validar esse pacote ou declarar explicitamente que ele fica fora do baseline antes de abrir a Fase 1 do ledger.

Em 2026-05-26, `git status --short` ainda mostrava arquivos nao rastreados antigos:

- `.claude/`
- `.env.bak-manual-url`
- `debug.log`
- `site-analysis/`
- `update_spreadsheet.js`
- `update_spreadsheet_v2.js`

Decisao recomendada registrada em `docs/audits/bot-complete-coverage-checklist.md`:

- `.env.bak-manual-url`: mover para cofre fora do repo ou apagar com cuidado, pois e backup sensivel.
- `debug.log`: apagar se nao houver investigacao ativa.
- `site-analysis/`: apagar ou mover para pasta de artefatos fora do repo.
- `update_spreadsheet.js` e `update_spreadsheet_v2.js`: apagar ou migrar para `scripts/` com travas antes de qualquer uso, pois podem alterar planilha real.
- `.claude/settings.local.json`: manter fora do Git se ainda for usado pela ferramenta, ou apagar se estiver obsoleto.

Nao ler nem imprimir conteudo de backups `.env*` em respostas/logs.
## Unified Financial Command Planner - Fase 2A

- Gate corretivo iniciado em 2026-06-25 para impedir que pagamentos de contas,
  dividas, faturas e novos gastos sejam colapsados antes da execucao.
- Etapa 1 registrou ADR-007, spec, plano e fixtures, incluindo as frases reais de
  pagamento da conta de telefone.
- Etapa 2 concluiu o contrato puro em
  `src/planning/financialCommandPlanContract.js`: allowlists de operacoes e
  ferramentas, normalizacao, rejeicao recursiva de escopo interno/dados crus,
  protecao contra chaves de prototype pollution e confirmacao obrigatoria para
  escritas.
- Testes da Etapa 2: contrato `9/9` e suite completa `542/542`. Foram feitas zero
  chamadas Gemini e nenhum acesso a Sheets, banco ou rede.
- Nenhum roteamento produtivo ou flag foi alterado. O Gemini Planner analitico
  existente permanece ativo no baseline; o novo planner de comandos ainda nao
  existe no runtime.
- Etapa 3 concluiu o prompt compacto, extracao deterministica paralela,
  reconciliacao segura e runner offline/live limitado.
- Bateria offline: `7/7`, zero gaps e zero chamadas Gemini. Amostra live
  controlada: `4/4`, zero gaps e quatro chamadas, cobrindo conta recorrente,
  divida e fatura.
- Relatorios registram apenas IDs de caso e decisoes sanitizadas. O novo planner
  ainda nao recebe Sheets, banco, escopo interno ou historico financeiro.
- Etapa 4 iniciou com `match_recurring_bill` local em
  `src/planning/financialCommandContextTools.js`. A ferramenta recebe escopo
  confiavel do app, filtra `Contas` por usuarios permitidos, retorna apenas
  rotulos/categoria/subcategoria/valor esperado/vencimento e classifica
  `single_match`, `multiple_matches` ou `no_match`; nao devolve `user_id`, notas,
  indices, linhas cruas ou escopo interno.
- `match_debt` tambem foi implementado localmente na Etapa 4. Ele normaliza a
  aba `Dívidas`, filtra apenas dividas ativas do escopo confiavel e retorna
  rotulos/credor/tipo/saldo/parcela/vencimento/status/restricao de valor, sem
  `user_id`, observacoes, indices ou linhas cruas.
- `match_card_invoice` foi implementado localmente a partir de
  `Lançamentos Cartão`, nao da aba-resumo `Faturas`, para preservar escopo por
  `user_id` antes de somar faturas. A saida publica traz rotulo, cartao, mes de
  cobranca, total, quantidade de parcelas e compatibilidade do valor, sem
  compras, observacoes, `user_id`, indices ou linhas cruas.
- `resolve_category` foi implementado localmente. Ele monta candidatos a partir
  de historico escopado de `Saídas`, `Lançamentos Cartão`, regras de `Contas` e
  lista publica conhecida, mas retorna apenas categoria/subcategoria/fonte; as
  descricoes historicas sao usadas so para pontuacao local e nao saem da
  ferramenta.
- `list_user_accounts` concluiu a Etapa 4 localmente. A ferramenta lista rotulos
  de contas/roles a partir de transferencias escopadas, cartoes ativos e contas
  publicas conhecidas, sem descricoes de movimentos, observacoes, `user_id`,
  indices ou linhas cruas.
- Teste focado da Etapa 4 completa: `node --test tests\financialCommandPlanContract.test.js tests\financialCommandPlanner.test.js tests\financialCommandPlannerRunner.test.js tests\financialCommandContextTools.test.js` passou `28/28`.
- Etapa 5 recebeu implementacao local de shadow comparison em 2026-06-26: `FINANCIAL_COMMAND_PLANNER_MODE=off|shadow|canary|route` falha fechado para `off`; em `shadow`, apenas mensagens iniciais sem estado ativo sao observadas; a resposta visivel continua 100% pelo legado.
- Telemetria local do command planner fica em JSONL sanitizado (`data/financial-command-planner-shadow.jsonl` por padrao), com fingerprints e operacoes/divergencias, sem texto cru, telefone, `user_id`, linhas cruas, planilha ou escopo interno.
- O caso real da conta de telefone agora aparece como divergencia critica em shadow quando o legado classifica como `expense.create`/`debt.pay` e o planner classifica `bill.pay`. Isso ainda nao corrige o fluxo produtivo; a correcao de execucao fica para a vertical slice `bill.pay` da Etapa 6.
- Teste focado atualizado: `node --test tests\financialCommandPlanContract.test.js tests\financialCommandPlanner.test.js tests\financialCommandPlannerRunner.test.js tests\financialCommandContextTools.test.js tests\financialCommandPlannerShadow.test.js` passou `33/33`. Gate de producao ainda pendente: 50 decisoes/14 dias, cobertura por operacao, zero divergencia critica e zero vazamento.
- Etapa 6 teve a primeira vertical slice local em 2026-06-26: em `FINANCIAL_COMMAND_PLANNER_MODE=route`, um plano `bill.pay` validado entra antes do fallback local de gasto, resolve uma conta unica em `Contas` por escopo confiavel, pergunta forma de pagamento se faltar, pede confirmacao final e grava `Saídas` com `Recorrente=SIM`, categoria/subcategoria da conta e telemetria `bill.pay` confirm-only.
- Etapa 7 do Unified Financial Command Planner concluida localmente em
  2026-06-27: `debt.pay` resolve divida ativa escopada, permite selecao
  numerada/valor ausente, confirma e atualiza com idempotencia; `invoice.pay`
  resolve fatura conhecida escopada, permite selecao/metodo ausente e grava
  somente `Transferências` com status `Pagamento de fatura`; e
  `expense.create` nao credito usa confirmacao final propria sem cruzar os
  dominios. `debt.pay` e `invoice.pay` entraram na Interpretation Reliability
  como confirm-only, mantendo `INTERPRETATION_RELIABILITY_MODE=shadow`.
- Protecao de rollout adicionada:
  `FINANCIAL_COMMAND_PLANNER_ROUTE_OPERATIONS` assume somente `bill.pay` quando
  ausente/vazia. Assim, publicar o codigo enquanto producao esta em `canary`
  nao ativa automaticamente as novas verticais. Ativacao de
  `debt.pay,invoice.pay,expense.create` permanece `NO-GO` ate E2E marker-only,
  canario Daniel e limpeza/paridade. Evidencia local: maquina de estados 77/77,
  focados planner/reliability 70/70, suite 598/598, planner offline 7/7, audit
  high 0 vulnerabilidades e ledger dry-run 15 eventos/0 diferencas/privacy ok.
- Essa fatia cobre o bug da conta de telefone em teste local. Em 2026-06-26, a etapa local tambem passou a cobrir cancelamento sem escrita e replay idempotente via `operationKey` estavel para `bill.pay`. Ainda nao autoriza producao: faltam E2E marker-only, dry-run/paridade do ledger e decisao GO/NO-GO. `route` deve permanecer desligado fora de teste controlado.
- Gate local adicional da Etapa 6 em 2026-06-26: `node scripts\runCanonicalLedgerDryRun.js --run-id LEDGER_DRY_RUN_PHASE2A_BILLPAY_20260626` gerou relatorio em `data/qa-runs/LEDGER_DRY_RUN_PHASE2A_BILLPAY_20260626/canonical-ledger-dry-run-report.json` com 15 eventos, 0 diferencas inexplicadas e `privacy_ok=true`; `bill_payment` permaneceu com impacto liquido zero no orcamento livre. Decisao: `NO-GO` para ativar roteamento produtivo porque o E2E WhatsApp marker-only especifico de `bill.pay` ainda nao foi executado de ponta a ponta. Proximo passo: rodar `npm run test:whatsapp:e2e:bill-pay` com `WHATSAPP_E2E_ENABLED=true` contra o ambiente real em `route` controlado ou `canary` com o usuario E2E allowlisted antes de qualquer ampliacao.
- Rollout do command planner em 2026-06-26: codigo ate `eebb49f` foi deployado, producao permanece em `FINANCIAL_COMMAND_PLANNER_MODE=shadow`, Gemini planner continua ativo e health/PM2/WhatsApp ficaram saudaveis. A telemetria command-planner ainda estava ausente no primeiro check porque nenhuma mensagem inicial elegivel havia passado apos a ativacao. Localmente, o proximo incremento adiciona canary fail-closed por `FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS`, preserva shadow sanitizado para usuarios nao allowlisted e adapta o E2E marker-only; ainda falta commit/deploy e execucao real antes de qualquer GO.
- Diagnostico operacional em 2026-06-26: a Thais estava `ACTIVE`, mas cadastrada por identificador WhatsApp `@lid`; o E2E `bill.pay` falhava ao resolver apenas por telefone/`@c.us`. O script passou a aceitar `WHATSAPP_E2E_TEST_USER_LOOKUP` como fallback explicito para usuario unico `ACTIVE`. Na mesma janela, producao travou em `Autenticado/Carregando chats` com `whatsapp-web.js` antigo; atualizar o pacote para o commit `1780711a...` recuperou `Bot pronto`. Apos tentativas de canary, producao foi deixada segura em `FINANCIAL_COMMAND_PLANNER_MODE=shadow`, allowlist vazia, health OK e WhatsApp pronto; E2E real `bill.pay` ainda pendente.
- Incremento operacional local em 2026-06-26: foi adicionada recarga seletiva do command planner por `SIGHUP`, sem reiniciar o cliente WhatsApp. O parser le somente `FINANCIAL_COMMAND_PLANNER_MODE` e `FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS` do `.env`; aplica atomicamente apenas `off|shadow|canary`, rejeita `route` e canario vazio, deduplica a allowlist e registra apenas modo/contagem. Testes focados passaram `95/95`, suite completa `578/578`, planner offline `7/7` com zero Gemini, ledger dry-run com 15 eventos/0 diferencas/`privacy_ok=true`, audit high com zero vulnerabilidades, NUL zero e estado valido. Ainda faltam deploy em shadow, prova de PID inalterado e E2E real `bill.pay` antes de qualquer GO.

## Bill pay canary manual - 2026-06-27

- Produção em `5c12337` recebeu canário restrito somente para Thaís por `SIGHUP`, com PID inalterado; Thaís foi validada como não-admin e `ADMIN_IDS` ficou restrito ao Daniel.
- O E2E automático revelou dois problemas no runner, não no planner: seed local apontava para outro vínculo OAuth/planilha e o DOM do WhatsApp agrupava respostas sem `tail-in`, permitindo também falso avanço por histórico.
- O runner local ganhou fixture `external`, espera de propagação para fixture local, reconhecimento de bolhas agrupadas e espera por novo `data-id` contendo todos os textos esperados.
- Canário manual limpo passou de ponta a ponta com marcador novo: `bill.pay` reconheceu conta recorrente, pediu PIX, pediu confirmação e gravou a saída recorrente correta.
- Pós-teste: baseline restaurado para `FINANCIAL_COMMAND_PLANNER_MODE=shadow` e allowlist vazia por `SIGHUP`; health verde e PID inalterado. Cleanup removeu duas linhas marker-only e um run do ledger shadow; zero resíduos em Sheets, canonical ledger, `financial_events_public` e `state_store.json`.
- Veredito: GO para evidência da vertical `bill.pay` em canário controlado. KEEP_SHADOW como baseline e NO-GO para `route` global ou ampliação a outras operações sem gates próprios.
- Estabilização iniciada em 2026-06-27: `FINANCIAL_COMMAND_PLANNER_MODE=canary` foi ativado para os dois usuários beta ativos (Daniel e Thaís) por `SIGHUP`, sem restart. `INTERPRETATION_RELIABILITY_MODE=shadow` e o Gemini planner permaneceram ativos; `ADMIN_IDS` continuou com apenas Daniel. Backup protegido do `.env` foi criado, PID permaneceu `2910914`, health ficou verde e o log confirmou `allowlisted_users=2`. O próximo gate depende de uso real de `bill.pay`; qualquer duplicidade, escrita fora da conta recorrente, impacto no orçamento livre ou aumento de falhas exige rollback para `shadow` com allowlist vazia.
- Testes reais posteriores encontraram dois gaps: `Gás` caiu no fluxo legado de gasto quando o planner variou para `expense.create`, e a referência ambígua `conta do ap` não oferecia escolha. O canário foi imediatamente revertido por `SIGHUP` para `shadow` com allowlist vazia. A correção TDD promove pagamentos com verbo forte somente quando há conta recorrente escopada compatível e cria seleção numerada para múltiplas contas, ainda exigindo confirmação final. Gates locais: `584/584`, planner offline `7/7`, ledger 15 eventos/0 diferenças/`privacy_ok=true`, audit high zero, NUL zero e estado vazio. Produção deve permanecer em `shadow` até novo reteste real de `Gás` e da seleção ambígua.
- Fechamento de `bill.pay` em 2026-06-27: os retestes reais passaram. `Gás` foi reconhecido como conta recorrente mesmo após variação do planner para gasto; `conta do ap` listou `Mensal do ap` e `Taxa de obra do ap`, aceitou escolha numerada, pediu método e confirmação. Ambos foram cancelados sem escrita; verificação escopada confirmou zero resíduo e zero estado pendente. Produção ficou em `FINANCIAL_COMMAND_PLANNER_MODE=canary` para Daniel e Thaís, `INTERPRETATION_RELIABILITY_MODE=shadow`, Gemini planner ativo, apenas Daniel admin, PID inalterado e health verde. GO para a vertical `bill.pay`; `route` global continua NO-GO.
- Etapa 7 ganhou o runner local marker-only
  `npm run test:whatsapp:e2e:planner-writes` para `debt.pay`, `invoice.pay` e
  `expense.create`. Ele cria fixtures isoladas, verifica os efeitos específicos
  em `Dívidas`, `Transferências` e `Saídas` e limpa somente o marcador exato.
  O gate permanece `NO-GO` até execução real em canário, limpeza no ambiente
  alvo e revisão de paridade; produção deve manter essas operações fora de
  `FINANCIAL_COMMAND_PLANNER_ROUTE_OPERATIONS` até essa aprovação.
  Gates frescos após o runner: suíte `598/598`, planner offline `7/7` com zero
  chamadas Gemini, audit high com zero vulnerabilidades, ledger dry-run com 15
  eventos/zero diferenças/`privacy_ok=true`, `git diff --check` sem erros e
  scan de NUL sem ocorrências.
- O runner ganhou ações remotas fail-closed `seed`, `verify-cleanup` e
  `cleanup`, com lookup explícito de um único usuário `ACTIVE`. Isso permite
  semear e limpar na EC2 enquanto o navegador local executa somente a conversa,
  sem misturar vínculos OAuth. Ledger shadow e read-model continuam exigindo
  verificação/limpeza marker-only separada antes do GO.
- Criação assistida de categorias permanente iniciada em 2026-06-27: gastos sem
  categoria segura agora listam opções existentes por número, com candidatos
  vindos de histórico escopado, cartões, contas recorrentes, categorias
  conhecidas do bot e cadastro persistido na aba `Categorias`. Texto livre
  deixou de ser aceito como categoria final; se nenhuma opção servir, o usuário
  escolhe criar nova categoria/subcategoria, informa os nomes em passos guiados
  e o bot mantém o cadastro pendente para salvar com `user_id` somente após a confirmação final do gasto. Novas
  planilhas e reparos de template passam a criar a aba `Categorias`; a estrutura
  central também passa a garantir essa aba. Cobertura local: `tests/unit.test.js`,
  `tests/financialStateMachine.test.js` e `tests/userSpreadsheetService.test.js`.
- Correção local em 2026-06-28: o caminho legado de categoria assistida não grava
  mais o gasto imediatamente quando a mensagem original já contém Pix/Débito/
  Dinheiro. Depois de escolher ou criar categoria/subcategoria, o bot entra em
  confirmação final; `sim` grava uma vez e `não` cancela sem linha em `Saídas`.
  Regressão coberta em `tests/financialStateMachine.test.js` pelo caso real
  `TESTE_APAGAR_CATPERM_20260627_173500`.
- Correção local complementar em 2026-06-28: a criação assistida de categoria/
  subcategoria também deixou de persistir a linha em `Categorias` antes da
  confirmação final do gasto. O cadastro novo fica pendente no estado da
  conversa; `não` cancela sem salvar nada e `sim` registra a categoria antes do
  lançamento. Regressão cobre o fluxo planejado (`FINANCIAL_COMMAND_PLANNER_MODE=route`)
  e o legado.
- Correção local em 2026-06-29: `expense.create` do command planner passou a auto-confirmar categoria existente quando a descrição simples resolve para exatamente uma opção compatível, como `mercado` -> `Alimentação / SUPERMERCADO`. Após reteste real, o filtro também passou a ignorar marcadores/referências técnicas como `TESTE_APAGAR_*` na decisão de categoria automática, sem alterar a descrição persistida. A lista numerada permanece para textos ambíguos ou com termos extras, preservando o fluxo permanente de criação assistida quando nenhuma opção servir. Regressão em `tests/financialStateMachine.test.js` cobre auto-resolução com marcador e mantém o caso ambíguo perguntando.
- GO de canário controlado em 2026-06-30 para `debt.pay`, `invoice.pay` e `expense.create`: teste real manual com marcador `TESTE_APAGAR_PLANNER_WRITES_20260630_001` passou em produção para dívida, fatura e gasto comum, com confirmação final e efeitos corretos. O runner `planner-writes` foi corrigido no commit `849e9fc` para verificar e limpar gastos cuja descrição final foi saneada para `mercado`, sem marcador técnico. Evidência: `node --check scripts\runWhatsappPlannerWritesE2E.js`, `node --test tests\whatsapp-real-e2e-config.test.js` 21/21, `npm test` 609/609, `git diff --check`, `state_store.json` OK, deploy do runner sem restart do PM2, prova remota `verify-cleanup` com gasto limpo passou e limpou zero resíduos. Produção permanece em `FINANCIAL_COMMAND_PLANNER_MODE=canary`, `FINANCIAL_COMMAND_PLANNER_ROUTE_OPERATIONS=debt.pay,invoice.pay,expense.create`, Gemini planner ativo e `INTERPRETATION_RELIABILITY_MODE=shadow`. Isso não libera `route` global; manter observação em Daniel/Thaís e rollback por flag se houver duplicidade, escrita cruzada de domínio ou falha de limpeza.
- Fechamento corretivo do gate Step 7 em 2026-06-30: após testes adversariais reais, `bill.pay` foi recolocado em `FINANCIAL_COMMAND_PLANNER_ROUTE_OPERATIONS` por `SIGHUP` sem restart e a falha de fatura que podia escolher `Cartão Nubank - Thais` mesmo com texto explícito `Nubank Daniel` foi corrigida em `dd6d054`. O matcher de fatura agora exige que termos explícitos do cartão apareçam na fatura candidata antes de aceitar compatibilidade por valor. Evidência: teste RED em `tests/financialCommandContextTools.test.js`, focused `95/95`, `npm test` `614/614`, `npm audit --audit-level=high` com zero vulnerabilidades, deploy em produção `dd6d054`, health verde, WhatsApp pronto e `state_store.json` com 2 bytes. Reteste manual real: conta fantasma retornou `bill.pay` sem match e não virou dívida/gasto; fatura `Nubank Daniel no crédito` não cruzou para Thaís; `conta do ap` listou opções numeradas e cancelou sem salvar. Produção permanece em `FINANCIAL_COMMAND_PLANNER_MODE=canary`, `FINANCIAL_COMMAND_PLANNER_ROUTE_OPERATIONS=bill.pay,debt.pay,invoice.pay,expense.create`, Gemini planner ativo e `INTERPRETATION_RELIABILITY_MODE=shadow`. GO apenas para canário controlado Daniel/Thaís; `route` global segue NO-GO.

- Gate Step 8/canonical ledger retomado em 2026-06-30: EC2 sincronizado em `f998ff7` e auditoria sanitizada do SQLite shadow encontrou somente residuos marker-only dos testes de planner writes. Foi criado backup em `data/backups/canonical_ledger_shadow.pre-marker-cleanup-2026-06-30T03-38-54-994Z.sqlite` e removidos 4 runs candidatos; reauditoria ficou com `events=0`, `publicProjectionRows=0`, `markerCounts=0` e `state_store.json` remoto `{}`. Decisao: `NO-GO` para `CANONICAL_LEDGER_CANARY_READ_ENABLED=true` agora, porque nao ha janela real nao-marker para comparar Sheets, ledger, read-model e dashboard. Proximo gate: manter shadow write ligado, observar novos recibos reais elegiveis e so abrir canary read de `transactions` depois de paridade real sem vazamento/divergencia.

- Integração local da leitura canary `transactions` em 2026-06-30: `list_recent_transactions` ganhou integração real com o canonical ledger por `readCanonicalLedgerCanaryWithFallback`, sempre atrás das flags `CANONICAL_LEDGER_CANARY_READ_*`. O agente normaliza linhas canônicas para o contrato público atual e cai para o read-model legado quando a leitura canônica está desligada, falha, vem vazia ou não contém o tipo solicitado. Cobertura TDD em `tests/financialAgent.test.js`; focado agente+ledger passou `68/68`. Produção ainda deve manter `CANONICAL_LEDGER_CANARY_READ_ENABLED=false` até haver janela real de paridade não-marker.
- Guard adicional em 2026-07-01: a leitura canary `transactions` tambem cai para o legado quando a janela canonical filtrada e menor que o `limit` pedido e o read-model legado tem mais linhas correspondentes. Isso evita respostas truncadas de ultimos lancamentos enquanto o shadow ainda esta acumulando cobertura. RED/GREEN em `tests/financialAgent.test.js`; suite local `618/618` e audit high `0` vulnerabilidades antes do deploy inerte.
- Correcao local em 2026-07-01: o teste real marker-only do Step 8 mostrou que um gasto comum de mercado podia ser projetado no canonical ledger como `bill_payment` quando existia uma conta recorrente de categoria/valor parecido. A regra do projetor foi estreitada: linhas de `Saidas` so podem virar `bill_payment` quando o lancamento estiver explicitamente marcado como recorrente (`Recorrente=SIM` ou equivalente); despesas comuns continuam `expense` e elegiveis ao orcamento livre mesmo se houver uma conta cadastrada compativel. RED/GREEN em `tests/canonicalLedgerReceiptProjector.test.js`; focused ledger `28/28`, suite local `619/619`, audit high `0`, `git diff --check` sem erro, NUL zero e `state_store.json` `{}`. Producao ainda nao recebeu essa correcao neste registro; depois do deploy, repetir paridade/limpeza antes de qualquer canary read.

- Deploy/canario real pos-fix em 2026-07-01: `fd20b49` foi aplicado na EC2 com planner Gemini ativo, `INTERPRETATION_RELIABILITY_MODE=shadow`, `FINANCIAL_COMMAND_PLANNER_MODE=canary`, `FINANCIAL_COMMAND_PLANNER_ROUTE_OPERATIONS=bill.pay,debt.pay,invoice.pay,expense.create` e `CANONICAL_LEDGER_CANARY_READ_ENABLED=false`. Teste real marker-only com `TESTE_APAGAR_LEDGER_FIX_20260701_1415` e `TESTE_APAGAR_LEDGER_BILLFIX_20260701_1415` validou dívida, fatura, mercado, conta telefone, reembolso e Uber. No ledger shadow, mercado virou `expense` com `free_budget_eligible=1`, telefone virou `bill_payment` com `free_budget_eligible=0`, fatura ficou `invoice_payment`, reembolso `reimbursement` e Uber `expense`. Limpeza marker-only removeu todos os resíduos em planilhas e os 5 runs do ledger; backups SQLite: `canonical_ledger_shadow.pre-recurring-marker-cleanup-2026-07-01T17-08-41-001Z.sqlite` e `canonical_ledger_shadow.pre-ledger-fix-cleanup-2026-07-01T17-16-11-950Z.sqlite`. Gate continua `NO-GO` para ligar canary read em produção até haver janela real não-marker ou decisão explícita de canário controlado com fallback.
- Ativacao controlada da leitura canary `transactions` em 2026-07-01: por decisao explicita de Daniel, producao foi alterada para `CANONICAL_LEDGER_CANARY_READ_ENABLED=true`, `CANONICAL_LEDGER_CANARY_READ_APPROVED=true` e `CANONICAL_LEDGER_CANARY_READ_DOMAINS=transactions`, preservando `FINANCIAL_AGENT_MODE=answer`, Gemini planner ativo, contextual analyst em `answer`, `INTERPRETATION_RELIABILITY_MODE=shadow`, command planner em `canary` e rotas `bill.pay,debt.pay,invoice.pay,expense.create`. Backup do `.env`: `/home/ubuntu/financas-bot-backups/.env.pre-canonical-canary-read-2026-07-01T17-24-58-793Z`. Checks pre-ativacao: health OK, `state_store.json` `{}`, focused ledger/agente `62/62`, audit high `0`. Pos-restart: PM2 online, WhatsApp pronto, health OK, flags carregadas. Smoke read-only da ferramenta `list_recent_transactions` retornou `source=legacy`, `fallbackReason=canonical_empty`, `rowCount=5` com ledger shadow limpo (`events=0`, `publicRows=0`), provando fallback seguro enquanto a janela canonical real ainda acumula dados. Rollback por flag: restaurar o backup do `.env` ou voltar `CANONICAL_LEDGER_CANARY_READ_ENABLED=false`, `CANONICAL_LEDGER_CANARY_READ_APPROVED=false`, `CANONICAL_LEDGER_CANARY_READ_DOMAINS=` e reiniciar PM2.
- Correcao local em 2026-07-01 apos lancamento real de categoria nova no credito: o command planner e o fallback legado agora extraem datas naturais escritas no texto, como `no dia 28 de junho`, sem depender do Gemini; a reconciliacao preenche `date` deterministica quando o modelo omite e tambem sobrescreve default divergente do modelo, como data de hoje em vez da data escrita; e `expense.create` planejado aceita `Credito` depois de selecao/criacao assistida de categoria, pergunta cartao/parcelas, mantem confirmacao final e salva no cartao preservando a data retroativa. A categoria nova continua pendente ate `sim`. Evidencia local: teste RED/GREEN em `tests\financialCommandPlanner.test.js` para `Gastei 25 reais lanchando em petropolis no dia 28 de junho`, estado financeiro planejado cobrindo categoria assistida -> Credito -> cartao -> parcelas, `npm test` 624/624 e `npm audit --audit-level=high` com 0 vulnerabilidades. Deploy aplicado em producao em 2026-07-01 no commit `0e36b4e`, preservando Gemini planner ativo e `INTERPRETATION_RELIABILITY_MODE=shadow`; backup `.env`: `/home/ubuntu/financas-bot-backups/.env.pre-deterministic-date-hotfix-20260701T193141Z`; PM2/health/WhatsApp ready e `state_store.json` `{}` verificados.
- Melhoria local em 2026-07-01 no fluxo de categorias de `expense.create`: quando o Gemini planner devolve apenas a categoria ampla, ou quando a descricao permite inferi-la com seguranca (por exemplo, `lanchando` -> `Alimentacao`), o bot deixa de mostrar a lista global e oferece todas as subcategorias cadastradas/conhecidas daquele grupo. A opcao assistida passa a criar somente uma nova subcategoria dentro da categoria focada, sem perguntar novamente a categoria. A selecao preserva a proveniencia original do Gemini para que `INTERPRETATION_RELIABILITY_MODE=enforce` continue exigindo confirmacao quando aplicavel. TDD em `tests/financialStateMachine.test.js`; maquina financeira `88/88`, suite completa `626/626` e audit high `0`. Deploy aplicado em producao no commit `094facb`, com backup `.env` e arquivo de codigo no carimbo `20260701T201117Z`; PM2 online, health/SQLite verdes, WhatsApp pronto, flags preservadas e `state_store.json` com 2 bytes. Falta apenas o smoke conversacional manual do caso real.
- Correcao local em 2026-07-01 para consultas plurais de lancamentos recentes: a pergunta real `Quais foram os ultimos 4 gastos no cartao Nubank - Thais?` era interceptada antes do Gemini pelo atalho deterministico singular, que fixava `limit=1`. O planner Gemini agora recebe primeiro as consultas recentes quando esta habilitado, preserva `limit` e o filtro publico `card`, e a ferramenta faz filtro/ordenacao deterministica em memoria com limite maximo de 20. Respostas com multiplas linhas sao formatadas integralmente e o verificador rejeita omissao de qualquer item. Dry-run real do Gemini devolveu `card_expense`, `limit=4` e `card=Nubank - Thais`; TDD em `tests/financialAgent.test.js`, agente `54/54` e suite completa `628/628`. Ainda sem deploy neste registro.

- Correcao local em 2026-07-01 para totais de cartao por intervalo de compra: a pergunta real `Quanto gastei no cartao Nubank - Thais entre 30 de junho e 1 de julho de 2026?` era capturada pelo `financialQueryPlan` legado como fatura/billing_month de maio e cartao generico `nubank`, antes de o Gemini Planner poder corrigir. Com `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true`, o runtime agora deixa um plano Gemini valido (`tool`/`block`) substituir o plano legado em consultas analiticas; se o planner nao produzir plano valido, o legado segue como fallback. O prompt reforca que compras/gastos em cartao com intervalo usam `timeBasis=transaction_date` e `period date_range from/to`, enquanto `billing_month` fica restrito a fatura/vencimento/mes de cobranca. O normalizador tambem repara os casos seguros `expenses + card + date_range + summary` para `cards + sum` e aliases vivos do Gemini como `card_expenses` para `cards`, preservando o cartao nomeado.

- Correcao local em 2026-07-01 para datas relativas em consultas analiticas com Gemini Planner: apos o deploy de totais por cartao, a pergunta `quanto gastei no cartao nubank thais ontem?` em 01/07/2026 foi planejada como 29/06/2026, e `anteontem` como 28/06/2026. Causa raiz: `currentDate` entrava no planner como data civil `01/07/2026`, era convertida para `Date` a meia-noite no servidor e, ao formatar em `America/Sao_Paulo`, recuava para `2026-06-30`; o Gemini entao calculava ontem/anteontem a partir da referencia errada. O planner agora preserva strings civis `DD/MM/YYYY`/`YYYY-MM-DD` sem timezone e repara planos de `query_financial_plan` que contenham `hoje`, `ontem` ou `anteontem`, sobrescrevendo o periodo por `date_range` deterministico calculado a partir da data civil do bot. Regressao em `tests/financialAgent.test.js`; suite local `630/630`, audit high `0`.
- Conferencia analitica real em 2026-07-01/02: Daniel validou pelo WhatsApp `ultimos 4 gastos no cartao Nubank - Thais`, total do cartao entre 30/06 e 01/07, `ontem`, `anteontem`, total de Alimentacao no periodo e `ultimos 5 gastos`. Logs de producao confirmaram `verified=true` para todos; consultas planejadas vieram de `source=llm_planner`, com `timeBasis=transaction_date`, cartao/categoria preservados e datas relativas corretas (`ontem=2026-06-30`, `anteontem=2026-06-29` para a referencia civil de 01/07/2026). `list_recent_transactions` usou fallback seguro para o legado por `canonical_empty`, sem truncar a lista. Veredito: GO para a etapa de conferencias analiticas do Gemini Planner; proximo passo do plano e continuar a reducao controlada do legado analitico, mantendo calculo/verificacao deterministica e rollback por flag.
- Observabilidade local adicionada em 2026-07-01/02 para o rollout controlado do Unified Financial Command Planner: novo JSONL sanitizado `data/financial-command-planner-canary.jsonl` registra eventos de rota e confirmacao para `bill.pay`, `debt.pay`, `invoice.pay` e `expense.create`, sem mensagem bruta, telefone, user_id, planilha, linhas cruas ou valores sensiveis. A integracao grava `route`, `confirmation`, `saved`, `cancelled`, `replayed` e `error`, com fingerprints e latencias, preservando comportamento do bot e flags atuais. Evidencia local: `node --check src\handlers\messageHandler.js`, focados `97/97`, `npm test` `633/633`, audit high `0`, `git diff --check`, NUL zero e `state_store.json` valido. Proximo passo: deploy inerte/observavel em producao mantendo `FINANCIAL_COMMAND_PLANNER_MODE=canary`, rotas atuais e `INTERPRETATION_RELIABILITY_MODE=shadow`; depois acompanhar volume, severidade e latencia antes de qualquer expansao.
- Deploy da observabilidade canary do Unified Financial Command Planner concluido em 2026-07-01/02 no commit `944b7c4`, sem alterar flags. Producao preservou `FINANCIAL_COMMAND_PLANNER_MODE=canary`, `FINANCIAL_COMMAND_PLANNER_ROUTE_OPERATIONS=bill.pay,debt.pay,invoice.pay,expense.create`, `FINANCIAL_AGENT_MODE=answer`, Gemini planner ativo, contextual analyst em `answer`, canonical canary read `transactions` e `INTERPRETATION_RELIABILITY_MODE=shadow`. Pos-deploy: PM2 online, dashboard health OK em `127.0.0.1:8787`, SQLite/read-model pronto, WhatsApp autenticado/pronto, `state_store.json` com 2 bytes e JSON valido. `data/financial-command-planner-canary.jsonl` ainda nao existia imediatamente apos restart porque nenhuma mensagem elegivel havia passado pelo planner; confirmar criacao/volume no proximo uso real antes de qualquer expansao.
