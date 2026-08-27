# Roadmap consolidado do FinançasBot — draft v2

Data: 2026-08-27
Status: `DRAFT_V2_AWAITING_USER_CONFIRMATION — NAO CANONICO`
Branch de síntese: `chat/financial-roadmap-synthesis-20260826`
Draft anterior: `docs/plans/workstreams/financial-roadmap-draft-v1.md`
Revisão adversarial Codex: `FIN-ROADMAP-V1-REVIEW-20260827`
Veredito Codex: `APROVÁVEL APÓS AJUSTES`

> Este documento reconcilia integralmente as dez mudanças obrigatórias da revisão adversarial do Codex. Ele não autoriza implementação, deploy, promoção de flag, acesso a dado privado, escrita financeira, migração destrutiva ou retirada de legado. O próximo gate é exclusivamente humano: **o usuário precisa confirmar explicitamente se concorda com este draft v2**. Só depois disso um documento canônico pode ser criado.

# 1. Objetivo

Consolidar o roadmap histórico, a Fase 8, a Fase 9/Open Finance, as capacidades já entregues das Fases 1–6, a Fase 7 adiada, o Financial Agent v1, o novo agente/ARQ, a auditoria financeira pré-roadmap, a regressão de áudio e a revisão adversarial do draft v1 em uma única sequência executável, sem reconstruir trabalho existente e sem perder gates antigos.

A ordem do roadmap foi alterada após a revisão Codex para evitar dois riscos estruturais:

1. criar correções locais de schema/cartão/saldo/adapters antes de congelar a semântica financeira comum;
2. tratar retirada de legado e cutover de fonte como fases globais lineares, criando uma dependência circular.

O desenho v2 passa a usar um **contrato mínimo de convergência semântica imediatamente após o baseline** e um **loop por domínio/consumidor para migração, cutover, estabilidade e retirada**.

# 2. Regras de evidência e autoridade

Nenhum status histórico é promovido automaticamente a estado atual. Cada decisão operacional deve indicar uma das classes abaixo:

- `USER_DECISION`: decisão explícita atual do usuário;
- `CURRENT_CODE`: comportamento demonstrável no commit avaliado;
- `QA_GATE`: gate/auditoria/teste versionado;
- `PRODUCTION_EVIDENCE`: telemetria/smoke/runtime documentado e datado;
- `HISTORICAL_PLAN`: intenção ou estado histórico que exige revalidação antes de uso operacional;
- `EXTERNAL_REQUIRED`: depende de dado/serviço autorizado ainda não consultado;
- `OPEN`: divergência ou lacuna sem evidência suficiente.

## 2.1 Matriz de autoridade por domínio

| Domínio | Autoridade lógica alvo | Evidência secundária/espelho | Regra de segurança |
| --- | --- | --- | --- |
| escopo/autorização | servidor/policy determinística | planilha/config | LLM nunca amplia escopo |
| transação liquidada | ledger/read-model canônico reconciliado | Sheets/Open Finance/import | ausência de fonte não vira zero |
| cartão | `card_id` estável + catálogo | nome textual | nome nunca é identidade contábil |
| competência de fatura | evidência com provenance | `Mês de Cobrança`, provider forecast, closingDay | presença de mês não prova confirmação |
| parcela | compra + ocorrência confirmada + cronograma projetado | Sheets/import/Open Finance | projeção nunca é realizada |
| saldo | snapshot bancário reconciliado ou ledger cumulativo com cobertura | Saldo Inicial + movimentos | saldo incompleto não é “saldo atual” |
| orçamento | kernel determinístico por ciclo/timeBasis | dashboard/WhatsApp | gasto do dia não substitui gasto do ciclo |
| refund/estorno | evento de compensação ligado ao original | import/Open Finance/manual | não vira receita comum por padrão |
| pagamento de fatura | transferência/settlement | banco/Sheets | não cria novo gasto |
| recorrência | regra + ocorrência | aba Contas | fail-closed para escopo ausente |
| áudio | pipeline WhatsApp -> transcrição -> texto | logs sanitizados | nunca registrar conteúdo financeiro bruto |

# 3. Decisões de produto preservadas

1. Todos os cartões ativos da planilha familiar são compartilhados entre usuários autorizados; o nome identifica o cartão e não restringe titularidade.
2. O Uber de R$ 22,91 de 25/08/2026 foi corretamente lançado no Nubank Daniel; o problema é identidade/nome/agregação.
3. Não criar “carteira digital” para explicar esse caso.
4. Fechamento configurado é fallback/projeção; fins de semana, feriados, horário de corte e evidência real podem alterar a competência.
5. Parcelamento não tem necessariamente saldo restante autoritativo em tempo real; confirmado e projetado devem ser separados.
6. O Atacadão foi adicionado à conexão Pluggy de Daniel, mas o vínculo Pluggy -> alias -> `card_id` -> configuração de fechamento/vencimento continua `EXTERNAL_REQUIRED` até verificação autorizada.
7. Forma de pagamento: `1 Crédito`, `2 Débito`, `3 PIX`, `4 Dinheiro`, mantendo texto como fallback.
8. Shadows/canários e janelas existentes não serão reiniciados sem causa.
9. Áudio do WhatsApp está relatado como não funcional; causa continua aberta até reprodução.
10. Nenhuma retirada de legado por busca estática.
11. ARQ-01..06 permanece read-only; writer é trilha separada.
12. Fase 7 patrimônio/investimentos permanece `DEFERRED`, não removida.

# 4. Capacidades históricas: preservar, não reconstruir

| Capacidade | Estado histórico documentado | Tratamento v2 |
| --- | --- | --- |
| ledger/contas/datas/status | GO histórico | `MERGED`; reaproveitar contratos |
| fatura + pagamento de fatura | GO histórico | `MERGED`; preservar neutralidade |
| recorrências | GO histórico | `MERGED`; reparar integração/dados quando comprovado |
| forecast | GO histórico | `MERGED`; reutilizar estados e janelas |
| `installment_schedules` 3E | GO read-only/projeção | `MERGED`; corrigir integração atual, não recriar |
| refund/chargeback 3F | GO histórico | `MERGED`; alinhar ingestões atuais |
| orçamento/dashboard v2 | GO histórico | `MERGED`; reparar `budget.sum`/timeBasis/paridade |
| planos/maintenance/import/export/OCR/undo | entregues com gates próprios | `MERGED`; inventariar antes de tocar |
| Fase 7 patrimônio | adiada | `DEFERRED` |
| Fase 8 | observação/migração parcial | `MERGED`; continuar dos gates existentes |
| Fase 9 Open Finance | experimento familiar read-only + reconciliation shadow/canary | `MERGED`; sem auto-write |
| ARQ-01..06 | GO; canário final off | `MERGED`; base da evolução read-only |

# 5. Ordem revisada

```text
ROAD-00  baseline verificável + Golden Set + inventário
   |
ROAD-K0  contrato mínimo de convergência semântica
   |
ROAD-01  schema/identidade consumer-first
   |
   +--> ROAD-02  cartão/fatura/parcela/tempo/provenance
   |       |
   |       +--> ROAD-03B  eventos de cartão/refund/fatura
   |
   +--> ROAD-03A  saldo as-of/budget/transferências
   |
   +--> ROAD-AUDIO-01  em paralelo após baseline mínimo
   |
   +--> ROAD-04B  menu numérico pode antecipar após ROAD-01
   |
ROAD-04A personal_sheet adapter governado
ROAD-04C onboarding Pluggy/Atacadão read-only
   |
ROAD-05  gate de convergência/paridade do Financial Truth Kernel
   |
ROAD-06  ARQ read-only, máximo 3 tools, canário por domínio/fonte
   |
ROAD-07  writers por comando/classe
   |
LOOP POR DOMÍNIO/CONSUMIDOR:
  ROAD-08B migrar consumidor -> canário/paridade
  ROAD-09  cutover da fonte do domínio -> janela de estabilidade/rollback
  ROAD-08C remover apenas fallback/código morto comprovado
   |
ROAD-10 hardening final + gate de produto
```

# 6. ROAD-00 — Baseline verificável, Golden Set e inventário total

**objective:** criar o ponto de verdade operacional antes das correções.

**planned_state:** cada domínio, consumidor, writer, fonte, fallback, flag, telemetria, shadow/canário e rollback tem status datado e evidência.

**verified_current_state:** existem roadmaps históricos, Fase 8, Fase 9, ARQ, fallbacks e capacidades sobrepostas; o estado documentado de julho/agosto não prova sozinho o runtime atual.

**risk:** P0 governança.

**dependencies:** nenhuma além de branch/worktree controlada.

**passos:**
1. Registrar branch, HEAD, release/runtime e flags observadas para cada gate futuro.
2. Montar matriz `capability -> consumer -> source -> fallback -> telemetry -> rollback` cobrindo WhatsApp, dashboard, jobs, importação, manutenção, Open Finance e writers.
3. Incluir **todos os consumidores mutáveis** na matriz, não só read-only.
4. Construir Golden Set sanitizado com: card identity, fatura, compra no fechamento, compra 6x, refund, pagamento de fatura, transferência, recorrência, saldo multi-mês, budget dia/ciclo, fonte indisponível, personal_sheet, follow-up, áudio.
5. Rotular cada caso por `domain`, `metric`, `operation`, `timeBasis`, `scope`, `source`, `evidence_state`, `expected_side_effects`.
6. Revalidar heartbeat, retenção, rotação e arquivos rotacionados da telemetria Fase 8 antes de usar qualquer janela histórica.
7. Carregar explicitamente o estado do candidato `legacy_auth_utility`; não promover cartões/dashboard a candidatos enquanto a evidência atual não permitir.
8. Congelar fixtures de versões de schema de planilhas.
9. Registrar lacunas externas separadamente: Atacadão real, áudio real, headers reais antigos, provenance histórico de competência, cobertura de saldo.

**tests:** Golden Set cego, falso zero, dupla contagem, schema versions, telemetry heartbeat/rotation, zero side-effect read-only.

**shadow_or_canary:** observação apenas.

**rollback:** documental; nenhuma mudança funcional.

**entry_gate:** roadmap v2 confirmado pelo usuário.

**exit_gate:** inventário completo, autoridade por domínio registrada, Golden Set revisado, telemetria Fase 8 classificada como `HEALTHY/STALE/BROKEN/UNKNOWN`, lacunas externas marcadas.

**status:** `ADDED`.

# 7. ROAD-K0 — Contrato mínimo de convergência semântica

**objective:** congelar a semântica comum antes de ROAD-01..04 sem construir um kernel greenfield.

**planned_state:** Fases 3F.1, `FinancialQuerySpec/Plan`, semantic facade e adequacy verifier existentes tornam-se a base contratual comum para correções posteriores.

**verified_current_state:** os componentes já existem, mas `timeBasis`, source policy e evidência podem não ser executados uniformemente em adapters atuais.

**risk:** P0 arquitetural.

**dependencies:** ROAD-00.

**contratos mínimos a congelar:**
- IR/`FinancialQuerySpec` existente, sem criar segunda IR;
- `timeBasis = transaction_date | billing_month | due_date | settlement_date | as_of`;
- `evidence_state = confirmed | committed | projected | estimated | incomplete | unavailable`;
- provenance por campo/evento;
- cobertura `coverage_start`, `coverage_end`, `as_of`, `completeness`;
- source policy por domínio;
- regra de dupla contagem;
- identidade estável de entidade;
- calculadores determinísticos; LLM não calcula valor final.

**passos:**
1. Inventariar contratos já entregues e escolher quais são canônicos.
2. Definir envelope único de leitura e eventos financeiros sem reimplementar adapters.
3. Especificar precedence de source/evidence, incluindo cartão.
4. Definir unavailable vs empty vs zero.
5. Definir realized vs committed/projected.
6. Definir contratos de saldo e budget antes de corrigi-los.
7. Definir contrato de writer sem implementá-lo.

**tests:** contratos de serialização/normalização, precedence, unavailable/zero, evidence state, timeBasis, double-count invariants.

**shadow_or_canary:** nenhum rollout; contrato e fixtures.

**rollback:** retornar ao contrato anterior; sem mudança de runtime.

**entry_gate:** ROAD-00.

**exit_gate:** ROAD-01..04 não precisam inventar semântica própria; todos referenciam o mesmo contrato.

**status:** `ADDED`, extraído do ROAD-05 v1 após revisão Codex.

# 8. ROAD-AUDIO-01 — Recuperação causal do áudio do WhatsApp

**objective:** restaurar o pipeline real de voz sem presumir causa.

**planned_state:** `ptt/audio -> handleAudio -> download/retry -> reacquire -> codec/convert -> transcribe -> msg.body -> pipeline` é observável por códigos sanitizados.

**verified_current_state:** código tem retry, auto-download, reaquisição, ffmpeg, Gemini e retorno ao handler; testes locais existem. O relato real continua sem fronteira causal comprovada. A revisão Codex identificou que erro de transcrição pode virar `null` e ser confundido com áudio incompreensível.

**risk:** P1; elevar a P0 operacional se todo áudio real estiver quebrado e áudio for canal principal de captura.

**dependencies:** ROAD-00 mínimo; independente do restante da semântica financeira.

**passos:**
1. Criar códigos sanitizados separados: `route_not_called`, `download_empty`, `download_error`, `reacquire_error`, `media_type_unsupported`, `codec_error`, `convert_error`, `transcribe_timeout`, `transcribe_quota`, `transcribe_http`, `transcribe_empty`, `resume_error`.
2. Não registrar conteúdo transcrito, IDs privados, caminho local ou payload.
3. Reproduzir com áudio marker-only e identificar a primeira fronteira defeituosa.
4. Verificar tipo/mimetype/codec real recebido.
5. Validar reaquisição no whatsapp-web.js corrente.
6. Validar `ffmpeg-static` no artefato/runtime alvo.
7. Separar “API/transcrição falhou” de “modelo não entendeu conteúdo”.
8. Confirmar retorno a `msg.body` e continuidade do pipeline.
9. Corrigir somente a causa demonstrada.
10. E2E marker-only antes/depois de restart, concorrência e cleanup.

**tests:** unitários existentes + codecs realistas + ffmpeg absent/fail + provider timeout/quota/http + empty result + E2E real + privacy scan + cleanup.

**shadow_or_canary:** canário limitado se a correção tocar dependência de mídia/conversão.

**rollback:** release/flag para handler anterior; texto permanece baseline.

**entry_gate:** ROAD-00 mínimo.

**exit_gate:** dois áudios consecutivos + um após restart percorrem até processamento textual; códigos de falha distinguem causas; zero conteúdo sensível/resíduo.

**status:** `ADDED`.

# 9. ROAD-01 — Schema e identidade consumer-first

**objective:** corrigir consumidores e identidade antes de migrar planilhas físicas.

**planned_state:** registry/version detector define contratos; consumers usam campos corretos; migração física ocorre somente onde drift é comprovado.

**verified_current_state:** template atual já define Saídas A:K e Entradas A:J; readers legados ainda podem pedir A:J/A:I. `card_id` existe, mas fórmulas/resumos usam nome. Subcategoria de cartão não está estruturada.

**risk:** P0 identidade/contract; P1 migração/subcategoria.

**dependencies:** ROAD-K0.

## ROAD-01A — registry e detector de versão
1. Criar registry central de headers/índices por versão.
2. Detectar versão/drift por planilha sem assumir que toda planilha é antiga.
3. Inventariar todos os readers/writers por range.
4. Criar compat reader dual temporário.

## ROAD-01B — reparar consumidores e identidade
1. Alterar resumos/queries para `card_id` como identidade.
2. Usar catálogo `Cartões` só para display.
3. Garantir labels antigos como alias, sem fundir `card_id` distintos.
4. Corrigir readers A:J/A:I para consumir contrato atual quando disponível.

## ROAD-01C — migração física somente quando necessária
1. Dry-run por planilha com drift comprovado.
2. Migração idempotente preservando dados.
3. Migração de recorrência legítima sem escopo somente após classificação explícita; loader continua fail-closed.
4. Definir compatibilidade de subcategoria antes de adicionar coluna/campo.
5. Centralizar clock/timezone de produto sem quebrar datas históricas.

**tests:** detector de versão, dual reader, repeated migration, labels/card_ids, schema correct vs old, empty user_id fail-closed, timezone boundary.

**shadow_or_canary:** dual-read parity; nenhuma migração real antes de dry-run.

**rollback:** compat reader + backup; nenhuma remoção de coluna no mesmo gate.

**entry_gate:** ROAD-K0.

**exit_gate:** consumers atuais usam schema correto; `card_id` é identidade; migração só ocorreu em drift real; autorização não ampliada.

**status:** `ADDED`, corrigido para consumer-first.

# 10. ROAD-02 — Cartões, competência, faturas e parcelamentos com provenance

**objective:** separar fato observado, previsão de provedor, projeção da planilha e estimativa por fechamento.

**planned_state:** nenhuma linha é tratada como confirmação apenas porque possui `Mês de Cobrança`.

**verified_current_state:** writer atual pode gerar `Mês de Cobrança` por `closingDay`; parcelas futuras podem compartilhar a data da compra; `timeBasis` não governa uniformemente a seleção.

**risk:** P0 para realizado/projetado e competência; P1 para calendário/closingDay isolado.

**dependencies:** ROAD-K0 + ROAD-01 identidade.

**provenance mínimo:**
- `statement_confirmed`;
- `provider_confirmed` quando contrato realmente demonstrar confirmação;
- `provider_forecast`;
- `sheet_observed_unknown_origin`;
- `sheet_projected`;
- `closing_day_estimate`.

**passos:**
1. Introduzir provenance antes de mudar precedence.
2. Separar compra original, ocorrência de parcela confirmada e projeção do cronograma.
3. Fazer `timeBasis` governar seleção causal.
4. Reutilizar Fase 3B/3E; não reconstruir `installment_schedules`.
5. Corrigir Faturas para `card_id + billing_period`.
6. Definir `CardCycleResolver` por evidence/provenance, não por presença de coluna.
7. `closingDay` só projeta quando não há evidência melhor.
8. Não aplicar `>` -> `>=` como correção universal.
9. Preservar N/M de import quando fornecido; ausente = unknown.
10. Redesenhar visão Parcelamentos com N>1, compra, total/posição, confirmado e restante projetado rotulado.
11. Garantir que parcelas futuras não contaminem realizado do mês da compra.
12. Usar o caso Uber como regressão de identidade, sem alterar cartão escolhido.

**tests:** precedence por provenance, before/on/after close, fim de semana/feriado/hora, 6x, two identical purchases, import N/M, projection != realized, same card labels, provider forecast != confirmed.

**shadow_or_canary:** resolver paralelo e diff sanitizado; promoção por domínio.

**rollback:** fallback resolver atual; a janela desse rollback não substitui/antecipa janelas da Fase 8.

**entry_gate:** ROAD-01 identidade + ROAD-K0 evidence contract.

**exit_gate:** fatura/parcelas/dashboard/WhatsApp concordam por competência e provenance; projeção nunca aparece como confirmado.

**status:** `MERGED` com Fase 3B/3E + correções.

# 11. ROAD-03A — Saldo as-of, orçamento e transferências neutras

**objective:** corrigir números independentes do cartão sem esperar ROAD-02 inteiro.

**planned_state:** saldo possui cobertura/completude; budget soma o período correto; transferências próprias não viram consumo.

**verified_current_state:** saldo de personal sheet pode usar apenas movimentos do mês; `budget.sum` usa gasto diário.

**risk:** P0.

**dependencies:** ROAD-K0 + ROAD-01; não depende integralmente de ROAD-02.

**passos:**
1. Definir saldo por `as_of`, `coverage_start`, `coverage_end`, provenance e completeness.
2. Não chamar “saldo atual” quando houver buraco de cobertura.
3. Calcular opening balance + movimentos confirmados desde abertura quando esse histórico for completo.
4. Preferir snapshot bancário reconciliado quando disponível e semanticamente comparável.
5. Corrigir `budget.sum` para ciclo/mês; diário somente quando solicitado.
6. Preservar transferências internas como neutras.
7. Validar multi-mês, abertura posterior, período sem fonte e fonte incompleta.

**tests:** multi-month, openedOn, missing interval, unavailable source, cycle vs day, internal transfer.

**shadow_or_canary:** cálculo paralelo.

**rollback:** flag por serviço de saldo/budget.

**exit_gate:** saldo não mascara incompletude; budget período correto; zero dupla contagem de transferências.

**status:** `MERGED` com Fases 2/4 + correções.

# 12. ROAD-03B — Eventos de cartão, refund, pagamento e reversões

**objective:** convergir semântica de compensações depois do contrato temporal de cartão.

**planned_state:** `charge`, `merchant_refund`, `bill_payment`, `payment_reversal`, `prior_balance`, `fee_interest` são distintos.

**verified_current_state:** pagamento de fatura já tem caminho neutro; ingestões de crédito/refund não são uniformes.

**risk:** P0/P1 por dupla contagem.

**dependencies:** ROAD-02 + ROAD-K0.

**passos:**
1. Reutilizar Fase 3F para vínculo refund/original.
2. Diferenciar merchant refund de pagamento recebido da fatura.
3. Vincular `payment_reversal` ao pagamento, não ao merchant charge.
4. Unificar import/Open Finance/manual no mesmo envelope canônico.
5. Não descartar refund legítimo por heurística textual genérica.
6. Sem original: `uncertain/review`, não receita comum.

**tests:** refund total/parcial, bill payment, reversed payment, prior balance, cashback, fees, ambiguous credit.

**shadow_or_canary:** event mapping paralelo.

**rollback:** mapping anterior preservado até paridade.

**exit_gate:** bruto/compensação/líquido reproduzíveis; zero duplicação de pagamento/transferência/refund.

**status:** `MERGED` com 3A/3F.

# 13. ROAD-04A — Personal Sheet como adapter governado

**objective:** eliminar semântica própria divergente da planilha pessoal.

**planned_state:** personal_sheet usa o mesmo contrato de ROAD-K0/ROAD-02/03.

**verified_current_state:** adapters podem carregar `timeBasis` em metadata sem executá-lo; fórmulas locais ainda podem divergir.

**risk:** P1.

**dependencies:** ROAD-01 + partes verdes de ROAD-02/03.

**passos:**
1. Fazer adapter aceitar/produzir envelope canônico.
2. `timeBasis` precisa mudar causalmente o conjunto consultado.
3. Faturas/Parcelamentos/Dashboard pessoal deixam de definir significado independente.
4. Preservar unavailable/empty/zero.
5. Validar ranking, follow-up, categoria, pessoa, período e cartões.

**tests:** same query same envelope across personal_sheet/read-model; timeBasis causal; unavailable; budget/card cases.

**shadow_or_canary:** personal_sheet shadow primeiro via ARQ/fachada.

**rollback:** adapter anterior.

**exit_gate:** Golden Set personal_sheet = kernel semântica.

**status:** `ADDED/MERGED`.

# 14. ROAD-04B — Menu numérico de pagamento

**objective:** melhorar UX de escrita de forma independente.

**planned_state:** `1/2/3/4` e equivalentes textuais normalizam para Crédito/Débito/PIX/Dinheiro.

**risk:** P2.

**dependencies:** ROAD-01 contrato mínimo; não precisa esperar saldo/cartão/Pluggy.

**passos:** parser numérico + texto fallback + mensagem numerada + regressão de estados conversacionais.

**tests:** 1,2,3,4; crédito/debito/pix/dinheiro; abreviações; resposta inválida; replay.

**rollback:** parser anterior/textual.

**exit_gate:** menu funciona sem quebrar usuários que respondem texto.

**status:** `ADDED`.

# 15. ROAD-04C — Onboarding Pluggy/Atacadão read-only

**objective:** mapear novas contas/cartões Open Finance ao catálogo sem auto-write.

**planned_state:** descoberta Pluggy gera candidato revisável; só cartão cadastrado/ativo em `Cartões` participa do writer/conversa.

**verified_current_state:** contrato aceita contas `CREDIT` dinamicamente; vínculo Atacadão real continua `EXTERNAL_REQUIRED`.

**risk:** P1.

**dependencies:** ROAD-01 identidade + ROAD-K0 source policy.

**passos:**
1. Candidato read-only por conta Pluggy nova.
2. Revisão explícita de alias, `card_id`, nome display, closing/due config.
3. Sem presença externa autorizada, manter `FALTA EVIDÊNCIA`, não “ausente”.
4. Cadastro em `Cartões` é ação separada e confirmada.
5. Cartões continuam familiares compartilhados.

**tests:** new credit account candidate; no auto-write; mapping alias; active catalog appears; family-shared access.

**shadow_or_canary:** read-only staging.

**rollback:** remover candidato/mapping sem tocar transações.

**exit_gate:** Atacadão ou outro cartão novo tem estado explícito e auditável; nenhuma escrita automática.

**status:** `ADDED/MERGED` com Fase 9.

# 16. ROAD-05 — Gate de convergência do Financial Truth Kernel

**objective:** provar que as correções de ROAD-01..04 implementam o contrato ROAD-K0; não construir nova arquitetura.

**planned_state:** dashboard, personal_sheet, read-model, legacy adapters e ARQ observam a mesma semântica por domínio.

**verified_current_state:** Fase 3F.1/ARQ já entregaram IR/fachada/verificador; o trabalho aqui é convergência/paridade.

**risk:** P0 de integração.

**dependencies:** ROAD-K0 + domínios corrigidos aplicáveis.

**passos:**
1. Executar Golden Set por cada fonte/consumer.
2. Comparar fingerprints/resultados sanitizados.
3. Exigir mesmo scope/timeBasis/source policy.
4. Validar unavailable/empty/zero.
5. Validar double-count gates.
6. Nenhum consumer promove se semântica divergir.

**tests:** cross-source parity, multi-read, source outage, follow-up, personal/family, timeBasis, evidence states.

**shadow_or_canary:** adapters existentes + diff telemetry.

**rollback:** consumidor mantém fallback individual.

**exit_gate:** mesma pergunta, escopo e base temporal resultam semanticamente iguais; zero falso zero no corpus crítico.

**status:** `MERGED`, redefinido de “construção de kernel” para gate de convergência.

# 17. ROAD-06 — ARQ read-only e follow-ups

**objective:** promover o novo agente apenas em domínios com verdade financeira já convergente.

**planned_state:** reasoner iterativo mantém **máximo atual de 3 tools**. Uma quarta tool exige gate próprio futuro com ganho medido.

**verified_current_state:** ARQ-01..06 GO, canário off; writer fora do escopo.

**risk:** P1 enquanto read-only; qualquer expansão de tool budget/writer exige gate próprio P0.

**dependencies:** ROAD-05 por domínio.

**passos:**
1. Revalidar ARQ contra Golden Set pós-correção.
2. Reutilizar ARQ-03/05/06, sem shadow novo.
3. Canary por domínio/fonte, baseline intacto.
4. Exigir adequacy/evidence verifier e zero side effects.
5. Follow-ups preservam pessoa/período/timeBasis/dimensão/fonte.
6. Telemetria sanitizada de selected/promoted/fallback + heartbeat.
7. Não remover Financial Agent v1/legado nesta fase.

**aceitação em duas camadas:**
- invariantes críticos: **100%** em escopo, money, unavailable/zero, timeBasis, writer/side-effects e privacidade;
- qualidade semântica não crítica: `>=95%` no corpus cego **e superior ao baseline**.

**tests:** blind corpus, follow-up, max 3 tools, timeout/provider fail/reply fail/source unavailable/restart/rollback.

**rollback:** canário off por flag/SIGHUP; baseline intacto.

**exit_gate:** críticos 100%; qualidade não crítica >=95% e acima do baseline; fallback residual explicado.

**status:** `MERGED` com ARQ.

# 18. ROAD-07 — Writers confiáveis fatiados por comando

**objective:** alinhar escrita ao kernel sem um “writer genérico” e sem misturar ARQ read-only.

**planned_state:** cada operação tem seu próprio `preview -> confirm -> commit -> receipt -> reconcile`.

**verified_current_state:** Interpretation Reliability está em shadow; commands históricos e propostas Open Finance possuem gates próprios; isso não autoriza promoção global.

**risk:** P0 integridade.

**dependencies:** read path convergente no domínio + ROAD-05; ROAD-06 não é autorização de writer.

**ordem de inventário antes de implementar:**
- `expense.create`;
- `income.create`;
- transfer;
- card expense;
- refund/adjustment;
- debt/plan movements quando aplicável;
- Open Finance proposal/review/save, respeitando gates existentes.

**passos por comando:**
1. Mapear implementação/gates existentes.
2. Definir corpus e invariantes próprios.
3. Server resolve IDs/escopo; LLM não escolhe identidade interna.
4. Preview determinístico.
5. Confirmação quando exigida.
6. Idempotency key + receipt.
7. Reconcile ledger/Sheets/read-model.
8. Shadow -> allowlist mínima -> canário.
9. Auditoria independente própria.

**tests:** replay/duplicate, cancel, ambiguity, restart preview-confirm, concurrency, partial external failure, unauthorized scope, receipt reconciliation.

**rollback:** flag por comando, baseline writer preservado até cutover individual.

**exit_gate:** 100% críticos; nenhum comando promove por herdar status de outro.

**status:** `MERGED` + integração nova por operação.

# 19. ROAD-08 + ROAD-09 — Migração, cutover e retirada intercalados por domínio

A v2 remove a dependência circular do draft v1. ROAD-08 não precisa “terminar globalmente” antes de ROAD-09.

## 19.1 Estado histórico que deve ser respeitado

- checkpoint Fase 8 de 2026-07-30: cartões ainda tinham uso legado forte;
- dashboard v1 tinha uso observado;
- `legacy_auth_utility` era candidato aguardando auditoria independente;
- read-model/scheduler/cartões possuem evidências/canários específicos;
- telemetria histórica precisa ter saúde atual revalidada;
- janela antiga não reinicia sem causa, mas também não é considerada contínua se heartbeat/retention/rotation estiverem quebrados.

## 19.2 Loop obrigatório por domínio/consumer

### ROAD-08B — migrar consumidor
1. Revalidar telemetria e coverage atual.
2. Definir consumer, source e fallback exatos.
3. Provar paridade no Golden Set.
4. Canary/soft-disable somente quando ADR/gate permitir.
5. Provar rollback.

### ROAD-09 — cutover de fonte do domínio
1. Definir authority/source primária do domínio.
2. Reconciliar divergências.
3. Backup/restore/dry-run de rollback.
4. Canary familiar do domínio.
5. Cutover com fallback ainda preservado.
6. Janela de estabilidade específica.

### ROAD-08C — remover fallback/código morto
1. Confirmar uso zero com telemetria saudável e janela aplicável.
2. Confirmar que fallback não é mais necessário ao rollback.
3. Remover apenas componente morto.
4. Reexecutar regressões/auditoria.
5. Marcar `REMOVED_WITH_EVIDENCE` individualmente.

**risk:** P0 regressão.

**regras:**
- cartões/dashboard não são candidatos automaticamente;
- `legacy_auth_utility` mantém status individual até evidência atual;
- busca estática nunca basta;
- ausência de evento com telemetry stale = `FALTA EVIDÊNCIA`, não zero;
- janelas históricas só contam se continuidade da observabilidade for demonstrável;
- 8C nunca desmonta rollback necessário ao cutover ainda instável.

**tests:** heartbeat, rotation, retention, zero-use, parity, outage, restore, rollback, WhatsApp/dashboard/jobs/import/maintenance.

**exit_gate:** por domínio, não global; cutover e remoção possuem provas separadas.

**status:** `MERGED` com Fase 8B/8C/8D e ROAD-09 v1.

# 20. ROAD-10 — Hardening final e gate de produto

**objective:** fechar o roadmap somente quando o produto ativo e a documentação coincidirem.

**risk:** P1 final, com invariantes críticos P0.

**dependencies:** fases aplicáveis e loops por domínio concluídos onde realmente necessários.

**passos:**
1. Uma suíte ampla por candidato estável, evitando repetição indiscriminada.
2. Cada mudança material anterior já precisa de auditoria própria; ROAD-10 não substitui gates locais.
3. Auditoria final por hash imutável.
4. WhatsApp texto + áudio marker-only, dashboard, jobs, import/export, Open Finance read-only e writers efetivamente autorizados.
5. ADR-002, LGPD, admin scope e privacy review.
6. Inventário final de flags: `on/canary/shadow/off`, com evidência de runtime; não descrever shadow/canário off como ativo.
7. Validar telemetria sem conteúdo sensível.
8. Backup/restore/rollback real para domínios cutover.
9. Atualizar memory/workstreams/known issues/testing playbook/runbooks.
10. Registrar resíduos e itens `DEFERRED`.

**aceitação:**
- invariantes críticos 100%;
- qualidade não crítica >=95% e acima do baseline;
- zero falso zero conhecido;
- zero scope violation;
- zero pagamento de fatura duplicado;
- zero transferência própria como gasto/renda;
- card identity por `card_id`;
- realized vs projected distintos;
- saldo com cobertura/as_of;
- budget período correto;
- personal_sheet/dashboard/WhatsApp semanticamente equivalentes;
- áudio real funcional e diagnosticável;
- rollback testado;
- auditoria final GO;
- usuário confirma estado final.

**status:** `ADDED`.

# 21. Fase 7 — Patrimônio/investimentos preservada

Continua `DEFERRED`, não cancelada. Reabrir quando houver necessidade concreta e somente depois de a verdade financeira atual estar estável. Patrimônio, caixa e resultado permanecem conceitos separados. Nenhuma recomendação de investimento deve ser produzida por inferência conversacional.

# 22. Gates transversais

1. **Scope Gate:** LLM não amplia usuário/família.
2. **Money Gate:** LLM não calcula valor final.
3. **Evidence Gate:** unavailable/incomplete != zero.
4. **Time Gate:** timeBasis é causal e verificável.
5. **Provenance Gate:** campo presente não equivale a confirmado.
6. **Double-count Gate:** transfer, bill payment, refund, installment não duplicam consumo.
7. **Schema Gate:** registry/detector/consumer parity antes de migração física.
8. **Audio Privacy Gate:** logs sem conteúdo transcrito/IDs/payloads privados.
9. **Shadow Gate:** reutilizar shadow/canary existente.
10. **ARQ Gate:** máximo 3 tools; 100% críticos.
11. **Write Gate:** command-specific preview/confirm/idempotency/receipt.
12. **Legacy Gate:** telemetry healthy + consumer destination + parity + window + rollback.
13. **Cutover Gate:** backup/restore + canary + stability window antes de retirar fallback.
14. **Production Gate:** commit imutável + auditoria + smoke marker-only + rollback.

# 23. Lacunas que permanecem abertas e não podem ser inventadas

- estado runtime atual de flags/telemetria Fase 8 em 2026-08-27;
- vínculo real Atacadão Pluggy -> alias -> card_id -> closing/due config;
- etapa causal da falha real de áudio;
- quais planilhas pessoais ainda têm headers antigos;
- provenance histórico de `Mês de Cobrança` já existente;
- cobertura cumulativa por conta suficiente para saldo as-of;
- estado atual dos gates de writer/Open Finance posteriores à documentação usada na revisão.

Essas lacunas não impedem o roadmap documental, mas impedem GO operacional das respectivas fatias.

# 24. Changelog v1 -> v2 após revisão Codex

Mudanças obrigatórias incorporadas:

1. `ROAD-K0` criado imediatamente após ROAD-00.
2. ROAD-01 reescrito consumer-first; migração física só após detector de versão/drift.
3. Provenance obrigatório antes de confiar em `Mês de Cobrança`/forecast.
4. ROAD-03 dividido em 03A saldo/budget e 03B eventos/compensações.
5. ROAD-04 dividido em 04A adapter, 04B menu e 04C Pluggy.
6. ARQ preserva máximo de três tools; quarta requer novo gate.
7. Invariantes críticos passam a 100%; >=95% apenas não críticos e acima do baseline.
8. Writers fatiados por operação/classe e precedidos por inventário do que já existe.
9. Fase 8 exige revalidação atual de telemetry/rotation/retention e carrega `legacy_auth_utility` individualmente.
10. ROAD-08/09 passam a ser intercalados por domínio, removendo dependência circular.

Mudanças opcionais também incorporadas:
- ROAD-05 renomeado para gate de convergência, não kernel greenfield;
- ROAD-AUDIO-01 explicitamente paralelo;
- evidence states/provenance tornados visíveis no contrato;
- loop por domínio explicitado para migração/cutover/removal.

Nenhum componente foi marcado `REMOVED_WITH_EVIDENCE` neste draft.

# 25. Gate atual

Este draft v2 já incorporou a revisão adversarial Codex, cujo veredito foi `APROVÁVEL APÓS AJUSTES`.

**Próxima decisão obrigatória:** confirmação explícita do usuário.

Opções de decisão:
- `CONCORDO COM O ROADMAP V2` -> criar versão canônica e abrir ROAD-00 como primeiro gate, sem implementação automática das fases seguintes;
- `CONCORDO COM RESSALVAS: ...` -> registrar as ressalvas e produzir v3 antes de canonizar;
- `NÃO CONCORDO: ...` -> preservar v2 como histórico e revisar somente os pontos indicados.
