# Fase 0 revisada - estabilizacao do baseline answer/planner - 2026-06-24

## Escopo

Executar a Fase 0 revisada do roadmap familiar: estabilizar e auditar o baseline
atual antes de abrir a Fase 1 do ledger canonico.

Baseline registrado no handoff:

- Producao em `853bdc3`.
- `FINANCIAL_AGENT_MODE=answer`.
- `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true`.
- `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer`.
- `INTERPRETATION_RELIABILITY_MODE=enforce` segue separado para escritas
  unitarias aprovadas.

Esta auditoria nao inicia schema novo, dashboard v2, Open Finance, OCR/PDF nem
Family Mode.

## Gates da Fase 0

1. Confirmar producao, commit, flags e aprovacoes do check diario.
2. Observar `enforce` para `expense.create` e `income.create` sem divergencia
   critica, duplicidade ou escrita errada.
3. Rodar bateria offline de confiabilidade, Financial Agent e planner.
4. Rodar replay real sanitizado e live curta controlada do planner/contextual
   analyst.
5. Testar ou documentar rollback por flag para agente, planner, contextual
   analyst e enforce.
6. Validar release/smoke do pacote de orcamento livre e categorias novas, ou
   declarar explicitamente que ele fica fora do baseline.
7. Validar e documentar a allowlist Daniel/Thais antes de ativar Family Mode.
8. Atualizar memoria/roadmap antes da Fase 1.

## Evidencia local

Status: verde para o baseline local, com um ajuste de classificador incluido
durante a rodada.

Achado e correcao local:

- A bateria `Financial Query Acceptance` encontrou 3 mismatches reais: pedidos
  explicitos de lista (`liste gastos acima de 100 reais esse mes`,
  `liste entradas acima de 1000 reais`, `mostre so meus gastos`) caiam como
  `detail`.
- Foi adicionada regressao em `tests/unit.test.js` e o classificador passou a
  separar pedido explicito de listagem de pedido de detalhamento.

| Check | Resultado | Evidencia |
| --- | --- | --- |
| Worktree revisado antes de editar | OK | Worktree estava suja antes da rodada; mudancas nao relacionadas preservadas. |
| Teste RED do classificador | OK | Falhou antes da correcao: `detalhamento_gastos_mes` em vez de `listagem_gastos_mes`. |
| Teste focado do classificador | OK | `node --test tests\unit.test.js --test-name-pattern "messageHandler.classifyPerguntaLocally covers complex analytical questions"`: 174/174. |
| Financial Query Acceptance strict | OK | `node scripts\runFinancialQueryAcceptanceBattery.js --strict --report-dir=data\qa-runs\PHASE0_20260624_FQ --json`: 265/265, mismatches `[]`. |
| `npm test` | OK | 500/500. |
| `npm run test:financial-agent` | OK | `FAGENT_20260624213415`: total 265, accepted 265, gaps 0, security_blocked 23, verified_answers 238, gemini_calls 0. |
| `npm run test:financial-agent:novel` dry-run | OK | `data\qa-runs\PHASE0_20260624_NOVEL_DRY`: total 255, accepted 255, gaps 0, gemini_calls 0. |
| `npm run test:interpretation-reliability` | OK | total 350, matched 350; execute 100/100, confirm 140/140, clarify 80/80, block 30/30. |
| `npm run gate:enforce:accelerated` | Bloqueado por evidencias reais | `KEEP_SHADOW`; offline 350/350, mas faltam `shadow_cutoff_not_configured`, `real_e2e_not_verified`, `rollback_not_verified`, `logs_not_verified`. |
| Planner live curto | OK | `node scripts\runFinancialAgentNovelPlannerBattery.js --live --max-calls 6 --limit 6 --stratified --report-dir data\qa-runs\PHASE0_20260624_NOVEL_LIVE_6`: 6/6, gaps 0, gemini_calls 6. |
| `npm audit --audit-level=high` | OK | 0 vulnerabilidades. |
| `git diff --check` | OK | Sem erros; apenas avisos de normalizacao LF/CRLF em arquivos ja tocados. |
| NUL scan | OK | `rg -n -a -U "\x00" src tests docs package.json package-lock.json`: sem matches. |
| `state_store.json` | OK | Testes deixaram estado fake; arquivo foi limpo e confirmado como `{}`. |

## Evidencia de producao

Status: auditada.

A auditoria SSH foi destravada com a chave local informada em
`C:\Users\horus\Documents\FinancasBot\financasBot.pem`. Producao esta no commit
esperado e saudavel no health/PM2, mas o `.env` remoto diverge do handoff em um
ponto importante: `INTERPRETATION_RELIABILITY_MODE=shadow`, nao `enforce`.
Em 2026-06-24, Daniel decidiu manter esse modo como postura intencional:
continuar acompanhando divergencias da escrita em shadow e ajustar ate a camada
ficar madura o suficiente para nova decisao de `enforce`.

| Check | Resultado | Evidencia |
| --- | --- | --- |
| Commit de producao | OK | SSH: `commit=853bdc3`, `branch=main`. |
| Worktree remoto | OK | `git status --short` vazio. |
| Flags criticas | OK | `.env`: `FINANCIAL_AGENT_MODE=answer`, `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true`, `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer`, `INTERPRETATION_RELIABILITY_MODE=shadow`, `FAMILY_MODE_ENABLED=false`, `DASHBOARD_ADMIN_ALL_USERS_ENABLED=false`. |
| Flags de aprovacao do check diario | OK parcial | `.env`: `FINANCIAL_AGENT_ANSWER_APPROVED=true`, `FINANCIAL_AGENT_LLM_PLANNER_APPROVED=true`, `INTERPRETATION_RELIABILITY_ENFORCE_APPROVED=true`. Nao foi encontrada flag equivalente para contextual analyst. |
| PM2 e WhatsApp ready | OK | `pm2 status financas-bot`: online, uptime 21h, pid `2866081`. Logs de startup em 2026-06-24 mostram Google autorizado, planilha sincronizada, read-model pronto, integridade `user_id` sem pendencias, dashboard ativo, WhatsApp pronto e bot pronto. |
| `/dashboard/health` | OK | Local na EC2 e publico: `{"ok":true,"sqlite":true}`. |
| `state_store.json` remoto | OK | `wc -c state_store.json`: 2 bytes, compatível com `{}`. |
| Logs recentes sem erro novo | OK com ressalva | `financas-bot-error.log` tem historico de timeouts/perf/quota, mas `stat` mostra ultima modificacao em `2026-06-24 03:51:41 +0000`; `out.log` segue atualizando read-model ate `2026-06-25 01:30 +0000`. |
| Telemetria do Financial Agent | OK | `data/qa-runs/FAGENT_20260622121332/financial-agent-acceptance-report.json`: total 265, accepted 265, gaps 0, securityBlocked 23, verifiedAnswers 238. |
| Telemetria do planner/contextual analyst | OK parcial | `data/qa-runs/FAGENT_NOVEL_20260624023556/financial-agent-novel-planner-report.json`: total 5, accepted 5, gaps 0, geminiCalls 5. Contextual analyst nao tem relatorio remoto separado nesta rodada; cobertura local segue em `npm test`. |
| Telemetria de Interpretation Reliability | OK para shadow continuo | `npm run report:interpretation-readiness -- --json`: recommendedMode `keep_shadow`, totalEntries 96, shadowEntries 44, criticalDivergences 0, autoSaveCandidatePrecision 1, ambiguousAutoSaveViolations 0, additionalGeminiCalls 0, latency p95 6 ms. Blockers esperados para `enforce`: `not_enough_decisions`, `observation_window_too_short`. |
| Rollback por flags documentado | OK parcial | Runbooks existem e o gate remoto `ACCEL_GATE_POST_SMOKE_20260619T201000Z` registrou `rollbackVerified=true` para IR. Nesta rodada nao houve troca real de flags, por decisao de preservar producao. |

## Live curta controlada

Status: executada e verde.

Comando planejado para planner live, com teto duro de chamadas:

```powershell
node scripts\runFinancialAgentNovelPlannerBattery.js --live --max-calls 6 --limit 6 --stratified --report-dir data\qa-runs\PHASE0_20260624_NOVEL_LIVE_6
```

Resultado: total 6, accepted 6, gaps 0, gemini_calls 6.

## Pacote de orcamento livre e categorias novas

Status: fora do baseline de producao.

O pacote local foi validado por testes no desenvolvimento anterior, mas ainda deve
ser tratado como fora do baseline de producao ate haver release/smoke/rollback.

## Decisao

Status: `APROVADO PARA FASE 1 COM RESTRICOES`.

Localmente, o baseline answer/planner/contextual analyst esta verde para as
baterias executadas. A producao tambem foi auditada para commit, flags, PM2,
health, state, logs basicos e telemetrias remotas disponiveis.

A Fase 1 pode ser iniciada sob estas restricoes:

- manter `INTERPRETATION_RELIABILITY_MODE=shadow` como decisao intencional;
- continuar monitorando divergencias de escrita ate haver volume/janela
  suficientes e zero divergencia critica antes de nova decisao de `enforce`;
- nao ativar Family Mode sem validar allowlist Daniel/Thais;
- nao tratar o pacote local de orcamento livre/categorias novas como baseline de
  producao ate release/smoke/rollback proprio;
- nao ampliar `answer`, planner ou contextual analyst sem bateria e rollback por
  flag.

Opcoes possiveis ao fechar a rodada:

- `APROVADO PARA FASE 1`: todos os gates verdes ou riscos aceitos e documentados.
- `MANTER FASE 0`: gaps de observabilidade, producao, live planner ou rollback.
- `RECUAR FLAG`: qualquer falha critica em answer/planner/contextual analyst ou
  enforce parcial.
