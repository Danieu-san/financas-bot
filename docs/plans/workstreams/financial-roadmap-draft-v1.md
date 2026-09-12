# Roadmap consolidado do FinançasBot — draft v1

Data: 2026-08-27
Status: `DRAFT_AWAITING_CODEX_REVIEW — NAO CANONICO`
Branch de síntese: `chat/financial-roadmap-synthesis-20260826`
Snapshot de entrada da síntese: `98c30b5548a3f3ed06747acd6818adf833d3c628`
Auditoria independente pré-roadmap: `FIN-AUDIT-PRE-ROADMAP-RETRY-20260826`, publicada no commit `ea3ad3a604ce99c580bf5d18bda2ecb365d27545` da branch `chat/chat-codex-orchestration-20260824`.

> Este documento é um draft de consolidação. Ele não autoriza implementação, deploy, promoção de flag, escrita financeira, acesso privado, migração destrutiva ou retirada de legado. O fluxo obrigatório é: **Chat consolida -> Codex tenta refutar -> Chat reconcilia -> usuário confirma -> somente então roadmap canônico**.

## 1. Objetivo e regra de consolidação

O objetivo deste roadmap é continuar o trabalho já feito, sem reescrever a história e sem reconstruir capacidades que já existem. O roadmap histórico, a Fase 8, a Fase 9/Open Finance, o Financial Agent v1 e o novo agente/ARQ permanecem fontes obrigatórias. Um item antigo só desaparece se for marcado explicitamente como `MERGED`, `SUPERSEDED`, `DEFERRED` ou `REMOVED_WITH_EVIDENCE`.

Toda fase abaixo distingue:

- `planned_state`: estado pretendido;
- `verified_current_state`: estado comprovado por código, gate, auditoria ou decisão explícita;
- `evidence_refs`: fontes que sustentam o item;
- `dependencies`: pré-requisitos reais;
- `risk`: P0/P1/P2;
- `tests`: evidência causal mínima;
- `shadow_or_canary`: como observar sem substituir cedo demais o baseline;
- `rollback`: como retornar ao comportamento anterior;
- `entry_gate` e `exit_gate`;
- `status`: `ADDED`, `MERGED`, `DEFERRED`, `SUPERSEDED` ou `REMOVED_WITH_EVIDENCE`.

## 2. Decisões de produto que este roadmap não pode contradizer

1. Todos os cartões ativos da planilha familiar são compartilhados entre os usuários autorizados. O nome identifica o cartão; não cria titularidade exclusiva.
2. O Uber de R$ 22,91 de 25/08/2026 foi corretamente lançado no Nubank Daniel. O problema relevante é identidade/nome/agregação, não a escolha do cartão.
3. Não criar uma “carteira digital” para explicar esse caso.
4. A data real de fechamento do cartão pode variar por fim de semana, feriado, horário de corte ou regra do emissor. Dia configurado é fallback/projeção quando existir evidência real melhor.
5. Parcelamentos não têm necessariamente saldo restante autoritativo em tempo real. O produto deve separar fatos confirmados de projeções determinísticas.
6. O cartão Atacadão foi adicionado à conexão Pluggy de Daniel. A integração deve verificar descoberta dinâmica e onboarding/mapeamento sem autoescrita silenciosa.
7. Forma de pagamento deve aceitar menu `1 Crédito`, `2 Débito`, `3 PIX`, `4 Dinheiro`, mantendo entrada textual como fallback.
8. Shadows/canários e janelas de observação já existentes devem ser reaproveitados; não reiniciar contadores nem criar shadow duplicado sem causa.
9. O recebimento/processamento de áudio do WhatsApp está relatado como não funcional e deve ser corrigido após reprodução causal, sem presumir antecipadamente a etapa defeituosa.
10. O roadmap só vira canônico depois de revisão adversarial do Codex e confirmação explícita do usuário.

## 3. O que já foi construído e deve ser preservado

| Área histórica | Estado documentado | Tratamento neste roadmap |
| --- | --- | --- |
| Fases 1–2: ledger, contas, datas, status, saldos/movimentos | GO histórico de produção | `MERGED`: reutilizar contratos; revalidar integração atual antes de mexer |
| Fase 3A/3B: pagamento de fatura e faturas vinculadas | GO histórico | `MERGED`: preservar neutralidade de pagamento de fatura e evitar dupla contagem |
| Fase 3C: recorrências | GO histórico | `MERGED`: corrigir somente integração/dados/escopo quando necessário |
| Fase 3D: previsões | GO histórico | `MERGED`: reutilizar estados confirmado/projetado e critérios temporais |
| Fase 3E: `installment_schedules` | GO histórico read-only/projeção | `MERGED`: não reconstruir parcelamentos do zero; reparar desconexões atuais |
| Fase 3F: refund/chargeback/reimbursement | GO histórico | `MERGED`: alinhar ingestões atuais à semântica canônica já criada |
| Fase 4: orçamento/dashboard v2/qualidade | GO histórico | `MERGED`: corrigir `budget.sum`, timeBasis e paridade; não recriar dashboard do zero |
| Fases 5–6: planos, manutenção, import/export, OCR, undo técnico | GO histórico com canários específicos | `MERGED`: preservar e revalidar consumidores quando tocados |
| Fase 7: patrimônio/investimentos | adiada, não cancelada | `DEFERRED`: continua no roadmap, após estabilização da verdade financeira atual |
| Fase 8: retirada do legado | observação/migração parcial, remoção bloqueada | `MERGED`: continuar exatamente dos gates existentes, não reiniciar |
| Fase 9: Open Finance/Pluggy | GO como experimento familiar read-only + reconciliação shadow | `MERGED`: manter read-only, sem autoescrita; integrar Atacadão por gate próprio |
| ARQ-01..06 | GO; agente iterativo read-only/shadow/canário, canário final `off` | `MERGED`: é base da evolução conversacional; writer e retirada de legado continuam fora até gates próprios |

## 4. Matriz de problemas atuais e destino no roadmap

| Achado | Veredito independente | Prioridade | Destino |
| --- | --- | ---: | --- |
| Faturas/Parcelamentos usam nome textual em vez de `card_id` | CONFIRMADO | P0 | ROAD-01 + ROAD-02 |
| fechamento por dia fixo como verdade | CONFIRMADO | P1, mas bloqueia semântica de cartão | ROAD-02 |
| compra no próprio dia do fechamento | PARCIAL | P1 | ROAD-02 |
| parcelas futuras/materialização e mês da compra | CONFIRMADO | P0 | ROAD-02 |
| aba Parcelamentos não é saldo restante autoritativo | CONFIRMADO | P1 | ROAD-02 |
| `transaction_date` vs `billing_month` / `plan.timeBasis` desconectado | CONFIRMADO | P0 | ROAD-02 + ROAD-05 |
| `budget.sum` retorna gasto diário | CONFIRMADO | P1 | ROAD-03 + ROAD-05 |
| saldo de conta usa apenas recorte do mês | CONFIRMADO | P0 | ROAD-03 |
| readers antigos A:J/A:I perdem Conta Financeira | CONFIRMADO | P1 | ROAD-01 |
| `user_id` vazio em recorrência | segurança REFUTADA; dado legítimo vazio continua questão de migração | P1 dados | ROAD-01 |
| estorno/crédito/pagamento de fatura | PARCIAL | P1 | ROAD-03 |
| subcategoria de cartão é descartada | CONFIRMADO | P1 | ROAD-01 |
| menu numérico de pagamento não existe | CONFIRMADO | P2 | ROAD-04 |
| timezone sem clock único | PARCIAL | P2 | ROAD-01/ROAD-05 |
| Atacadão na Pluggy não vira opção automaticamente | PARCIAL | P1/P2 | ROAD-04 |
| source-of-truth múltiplo e fallbacks ativos | CONFIRMADO | P0 governança | ROAD-00 + ROAD-08/09 |
| áudio WhatsApp não funciona no uso real | relato atual; causa não provada | P1 de experiência/entrada | ROAD-AUDIO-01 |

## 5. Matriz de shadows/canários a preservar

| Shadow/canário existente | Estado histórico mais recente conhecido | Regra do novo roadmap |
| --- | --- | --- |
| Interpretation Reliability | shadow de escrita | não promover/retirar sem gate específico de writer |
| telemetria durável de legado 8B.0 | heartbeat + uso sanitizado | reaproveitar; revalidar saúde antes de decisão de uso zero |
| Dashboard v1/v2 8B.2 | observação; v1 havia tido uso | não remover v1 por busca estática |
| cartão read-model unified-first 8B.6 | canário reversível | continuar da evidência existente, não criar flag paralela |
| scheduler cartão unified-first 8B.7 | canário reversível | preservar fallback e telemetria |
| manutenção cartão 8B.8 | descoberta unificada caracterizada | mutação continua sem atalho |
| WhatsApp cartão 8B.9 | consumidores caracterizados; OBSERVING | usar como mapa de migração |
| Open Finance reconciliation | shadow/canary, escrita off | manter fail-closed e sem auto-write |
| ARQ-03 | agente iterativo shadow | reutilizar trajetória/evidência, não duplicar agente |
| ARQ-05/06 | canário por domínio/fonte; final `off` | reabrir por domínio somente após correções semânticas abaixo |

## 6. Matriz de fonte de verdade alvo

| Conceito | Fonte canônica desejada | Espelho/entrada | Regra |
| --- | --- | --- | --- |
| transação liquidada | ledger/read-model canônico | Sheets e Open Finance reconciliado | nenhum LLM calcula ou inventa valor |
| identidade de cartão | `card_id` estável + catálogo `Cartões` | nome de exibição | nome nunca é chave contábil |
| competência da fatura | evidência real de fatura quando disponível | `Mês de Cobrança`; fechamento configurado como fallback | registrar provenance e confiança |
| parcela confirmada | item/ocorrência confirmada por fonte | Sheets/import/Open Finance | nunca chamar projeção de confirmado |
| parcela futura | `installment_schedule` determinístico | projeção exibida | estado `projected/committed`, não `settled` |
| saldo de conta | saldo bancário reconciliado ou ledger cumulativo até `as_of` | Saldo Inicial + movimentos | declarar data/proveniência/completude |
| recorrência | regra canônica + ocorrência por período | aba Contas como espelho/entrada | linha sem escopo legítimo deve ser migrada, não autorizada por wildcard |
| estorno/refund | evento de compensação ligado ao original | Open Finance/import/manual | não virar receita comum por padrão |
| pagamento de fatura | transferência/settlement | banco/Sheets | não é novo gasto |
| orçamento | kernel determinístico por período/timeBasis | dashboard/WhatsApp | `sum` do mês/ciclo não pode usar gasto do dia |
| fonte indisponível | estado `unavailable/incomplete` | qualquer adapter | nunca transformar em zero/ausência factual |

# 7. Sequência consolidada de execução

## ROAD-00 — Baseline verificável, Golden Set e mapa de fontes

**objective:** congelar um baseline atual auditável antes de qualquer correção transversal.

**planned_state:** cada número crítico, consumidor e fonte possui contrato, fixture e evidência de estado atual. Nenhuma fase posterior depende de memória de conversa.

**verified_current_state:** roadmaps históricos registram múltiplas capacidades e a Fase 8 mantém fallbacks; a auditoria Codex confirmou source-of-truth múltiplo. O estado de julho não prova sozinho o runtime de agosto.

**evidence_refs:** roadmaps históricos; Fase 8A/8B.0–8B.9; workstream ARQ; auditoria `FIN-AUDIT-PRE-ROADMAP-RETRY-20260826`.

**dependencies:** nenhuma além da branch/worktree isolada e código publicado.

**risk:** P0 de governança.

**passos:**
1. Registrar branch, HEAD, release/runtime alvo e flags relevantes antes de cada gate.
2. Criar um inventário `capability -> consumidor -> fonte -> fallback -> telemetria -> rollback` para WhatsApp, dashboard, jobs, importação, manutenção e Open Finance.
3. Construir Golden Set financeiro com casos sanitizados: Uber/card identity, fatura por competência, compra no fechamento, compra 6x, estorno, pagamento de fatura, transferência interna, recorrência, saldo cumulativo, budget dia/mês, fonte indisponível, follow-up e áudio.
4. Rotular cada pergunta por `domain`, `metric`, `operation`, `timeBasis`, `scope`, `expected source` e `evidence state`.
5. Revalidar heartbeat das telemetrias da Fase 8 antes de usar “zero uso”.
6. Revalidar quais canários/shadows de julho/agosto continuam presentes e quais estão `off`.
7. Congelar fixtures de schema das planilhas pessoais atuais antes de migrações.

**tests:** Golden Set cego; contrato de fonte; falso zero; dupla contagem; fixture de versões de schema; smoke read-only sem escrita.

**shadow_or_canary:** somente observação; nenhuma promoção.

**rollback:** não há mudança funcional; rollback documental é retornar ao snapshot anterior.

**entry_gate:** roadmap-draft aprovado para execução futura.

**exit_gate:** mapa de fontes/consumidores completo, Golden Set revisado, flags/shadows classificados e contradições abertas explicitadas.

**status:** `ADDED`.

## ROAD-AUDIO-01 — Recuperação causal do áudio do WhatsApp

**objective:** restaurar recebimento/processamento de mensagens de voz sem reimplementar o fluxo por hipótese.

**planned_state:** áudio real percorre `mensagem -> mídia -> download/retry -> reaquisição -> conversão -> transcrição -> msg.body -> pipeline financeiro`, com telemetria sanitizada por etapa e fallback claro.

**verified_current_state:** `audioHandler.js` já possui retry limitado, `setAutoDownloadAudio(true)`, reaquisição por `getMessageById`, conversão OGG->MP3, Gemini e cleanup; testes locais cobrem vários caminhos. O usuário relata falha real, mas a etapa causal ainda não foi provada.

**evidence_refs:** `src/handlers/audioHandler.js`, `src/handlers/messageHandler.js`, `tests/audioHandlerPrivacy.test.js`, transcrição em `src/services/gemini.js`.

**dependencies:** ROAD-00 apenas para fixture/telemetria; pode executar em paralelo às correções financeiras porque não altera a verdade contábil.

**risk:** P1 de experiência; elevar a P0 operacional se áudio for a principal entrada e falhar para todos.

**passos:**
1. Reproduzir com mensagem de voz marker-only e capturar somente códigos/etapas, sem conteúdo transcrito.
2. Confirmar roteamento de tipo de mensagem e se `handleAudio` é chamado.
3. Distinguir `downloadMedia` retornando vazio, lançando erro ou mídia com mimetype/codec diferente do esperado.
4. Validar se reaquisição realmente obtém mídia fresca no whatsapp-web.js corrente.
5. Verificar `ffmpeg-static` no artefato/runtime, permissões, arquitetura e suporte ao codec real.
6. Verificar timeout/erro de transcrição Gemini separadamente da conversão.
7. Confirmar que texto transcrito volta a `msg.body` e segue exatamente o mesmo processamento de texto.
8. Adicionar código de erro sanitizado por fronteira: `route`, `download`, `reacquire`, `convert`, `transcribe`, `resume`.
9. Corrigir somente a causa demonstrada.
10. E2E real com áudio marker-only, reinício e repetição; provar ausência de arquivo temporário residual e ausência de conteúdo financeiro em log.

**tests:** unitários atuais + codec/mimetype realista + falha de ffmpeg + falha Gemini + retry/reacquire + E2E real + privacy log scan + cleanup + concorrência.

**shadow_or_canary:** se a correção alterar download/conversão, canário somente para usuários autorizados antes de rollout normal.

**rollback:** voltar ao handler anterior por release/flag se a correção ampliar regressão; mensagens de texto permanecem baseline.

**entry_gate:** reprodução identifica ao menos a fronteira da falha ou registra evidência suficiente de ambiente.

**exit_gate:** dois áudios marker-only consecutivos + um após restart chegam ao pipeline textual correto; zero vazamento, zero arquivo residual, resposta normal do bot.

**status:** `ADDED`.

## ROAD-01 — Contrato de dados, schema versionado e identidade estável

**objective:** remover ambiguidade estrutural antes de corrigir analytics.

**planned_state:** writers/readers/templates compartilham schema versionado; cartão usa `card_id`; subcategoria de cartão é estruturada; timezone e escopo têm contrato único.

**verified_current_state:** Faturas/Parcelamentos agrupam por nome; ranges antigos convivem com novos; subcategoria de cartão se perde; clock é heterogêneo. Recorrência com `user_id` vazio é descartada fail-closed — isso é segurança correta, mas dados legítimos sem escopo exigem migração explícita.

**dependencies:** ROAD-00.

**risk:** P0/P1.

**passos:**
1. Criar constantes/schema registry para Saídas, Entradas, Lançamentos Cartão, Cartões, Contas Financeiras e demais abas tocadas.
2. Definir `schema_version` e migração idempotente de planilhas existentes; não depender de “aba ausente” para reparar header.
3. Migrar Saídas para A:K e Entradas para A:J com header de Conta Financeira, preservando dados existentes.
4. Tornar `card_id` chave estável em qualquer resumo/relação; nome vem do catálogo `Cartões` apenas para display.
5. Definir estratégia de alias/migração para labels antigas sem fundir dois `card_id` diferentes.
6. Adicionar Subcategoria estruturada a cartão ou mapear o campo a contrato canônico sem quebrar espelho legível.
7. Criar migração de recorrências legítimas com `user_id` ausente; manter loader fail-closed até o dado ser classificado.
8. Centralizar `America/Sao_Paulo` e clock injetável para semântica de data de produto.
9. Testar writers e readers antigos/novos contra a mesma fixture até paridade.

**tests:** header/schema parity; migração repetida; dois labels para mesmo card_id; dois card_id homônimos; user_id vazio continua bloqueado até migração; clock 23:30–00:30.

**shadow_or_canary:** leitura dual/paridade antes de qualquer writer novo; migração em cópia/fixture antes da planilha real.

**rollback:** backup de schema/dados; migração forward-only com compat reader temporário; nenhuma remoção de coluna no mesmo gate.

**entry_gate:** Golden Set e snapshots de schema.

**exit_gate:** nenhum reader perde campos; Faturas/Parcelamentos podem receber identidade por `card_id`; migração idempotente; autorização não ampliada.

**status:** `ADDED`.

## ROAD-02 — Verdade temporal de cartões, faturas e parcelamentos

**objective:** separar compra, competência, vencimento, confirmação e projeção usando capacidades históricas já existentes.

**planned_state:** `timeBasis` é causal; fatura usa evidência real quando disponível; cronograma canônico 3E alimenta projeções sem contaminar realizados.

**verified_current_state:** `buildBillingMonthName` usa `> closingDay`; dashboard prefere data da compra; parcelas futuras podem carregar a mesma Data e serem somadas no mês da compra; Fase 3E já criou `installment_schedules`, mas a planilha/adapter atual não preserva essa semântica uniformemente.

**dependencies:** ROAD-01.

**risk:** P0.

**passos:**
1. Definir `transaction_date`, `billing_month`, `invoice_due_date`, `settlement_date` e `as_of` como campos/semânticas distintas.
2. Fazer `FinancialQueryPlan.timeBasis` efetivamente selecionar linhas/metricas, não apenas aparecer em metadata.
3. Criar `CardCycleResolver` com precedência: evidência real de fatura/statement > competência já confirmada na linha > metadado confiável do provedor > closingDay configurado como projeção.
4. Não corrigir apenas `>` para `>=`; incluir data/hora real e fallback documentado.
5. Reutilizar `installment_schedules` da Fase 3E para reconstruir compra/cronograma quando houver metadado N/M.
6. Separar `confirmed installment` de `projected installment`; projeção não vira linha liquidada nem gasto realizado.
7. Adaptar importação que hoje reduz cartão a `1/1` para preservar metadado de parcela quando a fonte fornecer; quando não fornecer, marcar desconhecido, não inventar.
8. Redesenhar a visão `Parcelamentos`: apenas N>1, identidade da compra, parcela atual/total, total contratado quando demonstrável, confirmado até hoje, restante projetado e estado de evidência.
9. Corrigir Faturas para uma fatura por `card_id + billing_period`, com display canônico.
10. Validar o caso Uber: um único bucket Nubank Daniel, mantendo o card_id correto.

**tests:** antes/no/depois do fechamento; sábado/domingo/feriado; compra 6x; duas compras iguais; fatura por card_id; import com/sem N/M; projection != realized; due_date vs billing_month; Uber label split.

**shadow_or_canary:** comparar novo resolver e cronograma com fontes atuais sem mudar resposta; promover por domínio cartão após paridade.

**rollback:** manter resolver atual como fallback por flag até duas faturas/ciclos ou evidência equivalente definida no gate.

**entry_gate:** ROAD-01 verde.

**exit_gate:** WhatsApp, dashboard, Faturas e Parcelamentos concordam por competência; parcelas futuras não entram no realizado; `timeBasis` muda causalmente o resultado; fallback de fechamento é explicitamente rotulado.

**status:** `MERGED` com Fase 3E/3B + correções novas.

## ROAD-03 — Contabilidade operacional: saldo, orçamento, transferências e compensações

**objective:** garantir que os números principais não dependam de recorte incompleto ou semântica de ingestão.

**planned_state:** saldo é cumulativo/as-of; orçamento respeita período; transferência e pagamento de fatura são neutros; refund reduz o gasto original.

**verified_current_state:** saldo atual da planilha é “saldo inicial + movimentos do período”; `budget.sum` usa `dailyGoal.spent`; pagamentos de fatura/transferências têm separação canônica, mas caminhos de importação de créditos ainda não são uniformes.

**dependencies:** ROAD-01 e semântica temporal de ROAD-02.

**risk:** P0/P1.

**passos:**
1. Definir contrato de saldo: saldo bancário reconciliado quando disponível ou opening balance + todos movimentos confirmados até `as_of`.
2. Adicionar `coverage/completeness/provenance` ao saldo; saldo incompleto não pode ser exibido como “atual”.
3. Corrigir `budget.sum` para `monthSpent/cycleSpent` conforme período; diário só quando operação/pergunta pedir dia.
4. Tipar eventos de cartão/importação: `charge`, `merchant_refund`, `bill_payment`, `payment_reversal`, `prior_balance`, `fee_interest`.
5. Preservar pagamento de fatura e transferências internas como transferências, fora de renda/despesa.
6. Reutilizar Fase 3F para link de estorno/reembolso ao original quando possível; sem original, `uncertain/review`.
7. Fazer Open Finance/import CSV/OFX convergir para a mesma semântica, sem descartar merchant refund por keyword genérica.
8. Expor bruto, compensações e líquido quando a pergunta exigir explicação.

**tests:** saldo multi-mês; data de abertura; fatura paga; estorno total/parcial; prior balance; cashback; transferência interna; budget dia vs mês; fonte incompleta.

**shadow_or_canary:** cálculo paralelo novo/antigo e diff sanitizado; nenhuma troca automática se divergência não explicada.

**rollback:** flag por serviço de saldo/budget/event mapping; manter ledger anterior e Sheets sem reclassificação destrutiva.

**entry_gate:** ROAD-01; partes de cartão dependem ROAD-02.

**exit_gate:** Golden Set sem dupla contagem; saldo as-of reproduzível; `budget.sum` correto; refund e bill payment semanticamente distintos.

**status:** `MERGED` com Fases 2/3A/3F + correções atuais.

## ROAD-04 — Personal Sheet, UX de escrita e onboarding de cartões/Pluggy

**objective:** tornar a planilha pessoal um adapter consistente do kernel, e melhorar UX sem ampliar autorização.

**planned_state:** personal_sheet respeita contratos canônicos; forma de pagamento aceita números; cartões Pluggy novos passam por onboarding explícito.

**verified_current_state:** planilha pessoal contém fórmulas/analytics que divergem do ledger; parser de pagamento não aceita 1–4; Pluggy descobre contas CREDIT dinamicamente, mas WhatsApp usa somente cartões ativos da aba `Cartões`.

**dependencies:** ROAD-01/02/03.

**risk:** P1/P2.

**passos:**
1. Atualizar Faturas/Parcelamentos/Dashboard pessoal para adapters do mesmo significado, evitando fórmulas independentes como fonte lógica final.
2. Garantir `financialPersonalSheetSemanticAdapters` respeitando `timeBasis` e evidence states.
3. Implementar menu numerado 1–4 com parser textual retrocompatível.
4. Criar onboarding read-only para cartão novo descoberto na Pluggy: candidato -> revisão/mapeamento -> cadastro ativo em `Cartões`; nada vira writer automaticamente.
5. Para Atacadão, comparar conta Pluggy, catálogo `Cartões`, aliases e closing/due config; registrar se já está corretamente cadastrado ou se falta mapear.
6. Preservar regra de cartões familiares compartilhados; onboarding não cria owner restriction.
7. Garantir subcategoria, Conta Financeira e provenance no espelho.

**tests:** 1/2/3/4 + texto; Atacadão candidate sem escrita; após cadastro ativo opção aparece; family-shared card disponível a usuários autorizados; adapter personal_sheet = kernel.

**shadow_or_canary:** novo adapter personal_sheet em shadow/ARQ primeiro; onboarding Pluggy read-only.

**rollback:** fallback para adapter anterior; cadastro de cartão é ação separada/confirmada e não automática.

**entry_gate:** contratos ROAD-01–03.

**exit_gate:** números personal_sheet = kernel para Golden Set; menu funciona; Atacadão tem estado explícito e auditável; zero ampliação de escopo.

**status:** `ADDED/MERGED`.

## ROAD-05 — Financial Truth Kernel e execução semântica única

**objective:** transformar regras hoje espalhadas em um kernel determinístico usado por legado, Financial Agent v1, ARQ, dashboard e personal_sheet.

**planned_state:** interpretação pode ser livre; escopo, fonte, tempo, matemática, evidência e ausência são determinísticos.

**verified_current_state:** roadmap histórico já define catálogo semântico/FinancialQuerySpec; ARQ traz fachada/read tools/verificador; auditoria confirmou que `timeBasis` pode estar declarado mas desconectado do adapter real.

**dependencies:** ROAD-01–04.

**risk:** P0 arquitetural.

**contratos mínimos:**
- registry de métricas e dimensões;
- `timeBasis = transaction_date | billing_month | due_date | settlement_date | as_of`;
- source policy por domínio;
- evidence state `confirmed | committed | projected | estimated | incomplete | unavailable`;
- regra explícita de dupla contagem;
- schema de provenance/cobertura;
- calculadores puros; LLM não soma valores finais.

**passos:**
1. Reutilizar `FinancialQueryPlan/Spec`, semantic facade e adequacy verifier em vez de criar nova IR concorrente.
2. Implementar adapters por domínio que retornem envelopes equivalentes independentemente da fonte.
3. Unificar ausência: unavailable != empty != zero.
4. Unificar card/time/installment semantics do ROAD-02.
5. Unificar balance/budget/event semantics do ROAD-03.
6. Exigir que resposta numérica cite internamente métrica, período, escopo, timeBasis e provenance.
7. Fazer Golden Set passar tanto no caminho determinístico quanto via Agent/ARQ.

**tests:** contrato de cada métrica; property tests de soma; fonte indisponível; multi-read; follow-up; pessoal/familiar; timeBasis; evidence states.

**shadow_or_canary:** kernel primeiro sob adapters existentes; diffs sanitizados por fingerprint, não por dado financeiro bruto.

**rollback:** cada consumidor mantém fallback até gate próprio; kernel não apaga fonte antiga.

**entry_gate:** correções semânticas fundamentais prontas.

**exit_gate:** mesma pergunta + mesmo scope/timeBasis gera o mesmo resultado em dashboard, WhatsApp, personal_sheet e read-model; falso zero = 0 casos no Golden Set.

**status:** `MERGED` com macro roadmap + ARQ.

## ROAD-06 — Evolução conversacional ARQ e follow-ups

**objective:** promover o novo agente/ARQ somente onde o kernel já é confiável, sem transformar rollout conversacional em migração de fonte ou writer.

**planned_state:** reasoner iterativo usa 2–3 tools semânticas, até ~4 em análise ampla; follow-ups preservam escopo/período/evidência; baseline continua rollback até paridade.

**verified_current_state:** ARQ-01..06 GO, canário off após smoke; personal_sheet já teve lacuna de ranking recuperada; writer e retirada do legado ficaram explicitamente fora.

**dependencies:** ROAD-05; ROAD-AUDIO-01 para equivalência de entrada por voz, mas texto pode avançar antes.

**risk:** P1.

**passos:**
1. Revalidar ARQ atual contra Golden Set pós-correções.
2. Abrir canário por domínio/fonte, começando read-only de menor risco.
3. Exigir adequacy verifier + evidence verifier + zero side effects.
4. Revalidar follow-ups de categoria, período, pessoa, fatura, parcelamento e saldo.
5. Tratar `personal_sheet` como fonte semântica governada, não bypass analítico.
6. Medir fallback/promoted/selected com telemetria sanitizada e heartbeat.
7. Não remover Financial Agent v1/legado nessa fase; apenas reduzir tráfego quando gate de cada consumidor autorizar.

**tests:** corpus cego; follow-up; multi-tool; timeout; provider fail; reply fail; source unavailable; zero writer; restart; rollback por flag.

**shadow_or_canary:** reutilizar ARQ-03/05/06; sem criar novo shadow paralelo.

**rollback:** canário `off` por SIGHUP/flag e baseline intacto.

**entry_gate:** kernel e adapters do domínio verdes.

**exit_gate:** >=95% roteamento/adequação não adversarial no corpus acordado; zero leak/scope/writer; zero falso zero; fallback residual explicado por motivo.

**status:** `MERGED` com ARQ.

## ROAD-07 — Writers confiáveis e contrato de confirmação

**objective:** só depois de leitura estável, alinhar escritas ao kernel sem dar autoridade financeira ao modelo.

**planned_state:** model interpreta; servidor resolve IDs/escopo; preview determinístico; usuário confirma; executor idempotente grava; recibo/reconciliação prova resultado.

**verified_current_state:** Interpretation Reliability permanece shadow; ARQ não possui writer autorizado; writers históricos possuem confirmações/idempotência em partes do produto.

**dependencies:** ROAD-05/06; gates específicos de segurança.

**risk:** P0 de integridade.

**passos:**
1. Inventariar commands atuais e reutilizar contratos confiáveis existentes.
2. Definir `preview -> confirm -> commit` com idempotency key e receipt.
3. Proibir LLM de escolher ID, ampliar escopo ou executar SQL/write livre.
4. Integrar menu de pagamento, cartão canônico, financial account e subcategoria.
5. Reconciliar escrita com ledger/Sheets/read-model antes de resposta final.
6. Manter Interpretation Reliability como shadow até corpus de escrita provar paridade.

**tests:** duplicate/replay; cancel; ambiguous entity; restart entre preview/confirm; concurrent reply; partial external failure; unauthorized family scope; receipt reconciliation.

**shadow_or_canary:** writer shadow -> allowlist mínima -> canário; nunca promoção ampla direta.

**rollback:** writer flag off; baseline writer permanece até cutover individual.

**entry_gate:** read path e kernel estáveis.

**exit_gate:** zero escrita sem confirmação quando exigida; idempotência; zero scope violation; reconcile/receipt 100% nos casos críticos.

**status:** `MERGED` com confiabilidade histórica; trabalho novo de integração.

## ROAD-08 — Retirada progressiva do legado, continuando a Fase 8

**objective:** remover apenas consumidores realmente migrados, não “o legado” como bloco.

**planned_state:** cada rota antiga tem destino canônico, telemetria saudável, janela cumprida, zero uso ou soft-disable explicitamente permitido e rollback testado.

**verified_current_state:** Fase 8 já mostrou uso real de legado; cartões continuam fortemente legados em checkpoint 2026-07-30; read-model/scheduler tiveram canários; WhatsApp foi caracterizado; 8C ficou bloqueada por janela. Data mínima histórica para remoção física de cartões: 2026-09-12, além de dois fechamentos ou 60 dias. Política geral de uso zero: 45 dias + ciclo completo; ADR-008 permite soft-disable reversível apenas em perfis específicos, não mutação/fonte.

**dependencies:** ROAD-00 e destino canônico comprovado nas fases anteriores.

**risk:** P0 de regressão.

**passos por consumidor:**
1. Revalidar heartbeat/retention/rotação da telemetria, inclusive backups rotacionados.
2. Identificar consumidor e fallback exatos.
3. Provar paridade semântica com Golden Set e tráfego sintético/replay.
4. Cumprir janela aplicável ou registrar por que soft-disable reversível é permitido.
5. Soft-disable individual por flag quando elegível; observar.
6. Provar rollback.
7. Só então remover código/schema morto que não seja necessário ao cutover de fonte.
8. Repetir para o próximo consumidor.

**ordem sugerida:** read-only isolado comprovadamente zero -> periódico read-only -> consumers de cartão já unified-first -> dashboard/fallback analítico apenas quando adoção/paridade permitirem -> mutação/fonte por último.

**tests:** telemetry heartbeat; rotation; zero-use; canary; rollback; WhatsApp/dashboard/jobs/import/maintenance; source unavailable; double count.

**shadow_or_canary:** reutilizar Fase 8B.*.

**rollback:** obrigatório até ROAD-09; 8C não remove fallback necessário a 8D/cutover.

**entry_gate:** candidato individual possui destino e evidência.

**exit_gate:** `REMOVED_WITH_EVIDENCE` por componente; nunca GO global baseado em busca estática.

**status:** `MERGED` com Fase 8; não reiniciar observação sem causa.

## ROAD-09 — Cutover final da fonte canônica e Sheets como espelho legível

**objective:** concluir o que a Fase 8D já previa, somente após consumidores estarem prontos.

**planned_state:** ledger/read-model canônico é fonte primária; Sheets continua exportação/espelho legível; rollback real é testado.

**verified_current_state:** múltiplas fontes/fallbacks ainda existem; Open Finance é read-only/shadow e não substitui automaticamente Sheets/ledger.

**dependencies:** ROAD-01–08, especialmente Legacy Removal Gate por consumidor.

**risk:** P0.

**passos:**
1. Definir boundary oficial de source-of-truth por domínio.
2. Rodar reconciliação completa e listar divergências explicadas/inexplicadas.
3. Backup/restore real do ledger/read-model e espelho.
4. Canary familiar com read path canônico e Sheets mirror.
5. Dry-run de rollback completo.
6. Cutover monotônico: não reabrir backlog/histórico já encerrado.
7. Manter fallback de fonte durante janela de estabilidade.
8. Retirar fallback somente depois do gate final.

**tests:** restore; replay; idempotência; outage; stale mirror; Open Finance unavailable; rollback; parity total.

**shadow_or_canary:** canário Daniel/Thaís, domínio por domínio.

**rollback:** restore + source flag; preservar semantics/ids.

**entry_gate:** consumidores críticos migrados e observados.

**exit_gate:** zero divergência inexplicada, rollback provado, mirror legível e sem writer duplicado.

**status:** `MERGED` com Fase 8D.

## ROAD-10 — Hardening final, documentação e gate de produto

**objective:** fechar o ciclo sem declarar “pronto” por testes unitários isolados.

**planned_state:** documentação, runbooks, privacy, observabilidade, custos, SLOs e rollback refletem o produto realmente ativo.

**dependencies:** todas as fases aplicáveis.

**risk:** P1.

**passos:**
1. Auditoria independente final por hash imutável.
2. Bateria adversarial completa; uma suíte ampla por candidato estável.
3. WhatsApp texto + áudio marker-only, dashboard, jobs, import/export, Open Finance read-only e writers autorizados.
4. Validar LGPD/admin scope e ADR-002 antes de qualquer expansão multiusuário.
5. Revisar telemetria para zero dado sensível.
6. Atualizar `current.md`, workstreams, known issues, testing playbook e runbooks.
7. Registrar resíduos/deferred work e próximos gates.

**exit_gate:** critérios de segurança e finanças críticos 100%; >=95% roteamento não adversarial; zero falso zero conhecido; rollback real; auditoria independente GO; usuário confirma estado final.

**status:** `ADDED`.

# 8. Trabalho deliberadamente adiado, mas preservado

## Patrimônio/investimentos — Fase 7

Continua `DEFERRED`, não cancelado. Reabrir somente depois de a verdade financeira atual estar estável e houver necessidade concreta de patrimônio, rendimento, reserva ou valuation. O modelo deve manter patrimônio, caixa e resultado separados e não produzir recomendação de investimento por inferência conversacional.

# 9. Ordem prática sugerida

Sequência principal:

`ROAD-00 -> ROAD-01 -> ROAD-02 -> ROAD-03 -> ROAD-04 -> ROAD-05 -> ROAD-06 -> ROAD-07 -> ROAD-08 -> ROAD-09 -> ROAD-10`

`ROAD-AUDIO-01` começa logo após o baseline mínimo do ROAD-00 e pode rodar em paralelo, porque é uma regressão de entrada e não deve esperar toda a reestruturação financeira.

A retirada do legado não espera “o roadmap inteiro”, mas cada candidato só pode avançar quando o seu destino canônico específico estiver pronto e o gate de observação for satisfeito. Isso permite progresso sem apagar prematuramente fallbacks úteis.

# 10. Gates transversais obrigatórios

1. **Scope Gate:** nenhuma mudança amplia escopo de usuário por inferência.
2. **Money Gate:** LLM não calcula valor final nem escreve diretamente.
3. **Evidence Gate:** unavailable/incomplete nunca vira zero.
4. **Double-count Gate:** transferência, pagamento de fatura, refund e parcela não podem duplicar consumo.
5. **Time Gate:** pergunta declara/resolve timeBasis.
6. **Schema Gate:** writer/header/reader versionados e testados juntos.
7. **Shadow Gate:** shadow/canary existente é reutilizado quando aplicável.
8. **Legacy Removal Gate:** destino + paridade + heartbeat + janela + uso + rollback.
9. **Write Gate:** preview/confirm/idempotency/receipt.
10. **Production Gate:** commit imutável, auditoria independente, backup/rollback, health e smoke marker-only.

# 11. Critérios globais de aceitação

- zero violação de autorização/família/escrita no corpus crítico;
- zero pagamento de fatura contado novamente como gasto;
- zero transferência própria como despesa/renda;
- zero falso “R$ 0” quando fonte está indisponível;
- card identity estável por `card_id`;
- purchase-date spend e billing-month commitment distinguíveis;
- parcela futura rotulada como projeção, nunca como liquidada;
- saldo com `as_of`, provenance e cobertura;
- orçamento mensal/ciclo não confundido com gasto diário;
- personal_sheet, dashboard e WhatsApp compartilham semântica;
- áudio real funcional sem conteúdo sensível em logs;
- canários/shadows existentes preservados e mensurados;
- nenhuma retirada de legado sem gate individual;
- rollback executável e testado.

# 12. Contradições abertas que o Codex deve tentar resolver

1. O cronograma canônico de parcelas 3E existe, mas a planilha atual materializa/agrupa linhas de forma que pode quebrar a semântica. Determinar exatamente qual componente deve ser corrigido primeiro.
2. O fechamento configurado é aproximação, mas a melhor fonte real disponível pode variar entre Sheets, Pluggy e fatura observada. Definir a precedência sem criar dependência frágil de provedor.
3. O Atacadão está adicionado na conexão Pluggy do usuário, mas o vínculo exato com o catálogo `Cartões` ainda não foi provado por dado externo autorizado.
4. A Fase 8 tem evidência histórica e checkpoint de 2026-07-30; decidir quais janelas continuam válidas sem reset e quais exigem revalidação de heartbeat.
5. O áudio tem capacidade de código/testes mas falha relatada em runtime; causa permanece aberta até reprodução.
6. Writer moderno deve reutilizar Interpretation Reliability/command contracts sem misturar o rollout do ARQ read-only com autorização de escrita.

# 13. Changelog desta síntese em relação ao roadmap antigo

- `MERGED`: ledger, faturas, recorrências, forecast, installment schedules, refunds, budget/dashboard, planos, Open Finance e Fase 8 continuam como base.
- `ADDED`: correções explícitas de card identity, schema drift, timeBasis, saldo cumulativo, `budget.sum`, subcategoria, menu numérico, onboarding Atacadão e áudio.
- `MERGED`: ARQ-01..06 passa a ser a trilha conversacional oficial para evolução read-only, sem apagar Financial Agent v1/legado antes dos gates.
- `DEFERRED`: patrimônio/investimentos permanece preservado.
- `REMOVED_WITH_EVIDENCE`: nenhum componente é declarado removido neste draft.
- `SUPERSEDED`: nenhuma decisão histórica é silenciosamente substituída; qualquer supersessão futura deve citar evidência/decisão.

# 14. Pedido obrigatório para a revisão do Codex

O Codex deve revisar este draft inteiro e, para cada `ROAD-*`, responder:

- `CONCORDO`;
- `DISCORDO` — com alternativa concreta;
- `FALTA EVIDÊNCIA` — indicando qual evidência é necessária;
- `RISCO NÃO COBERTO` — indicando severidade e gate proposto.

Também deve verificar se:

1. alguma capacidade já construída foi indevidamente proposta como reconstrução;
2. alguma fase viola ou duplica Fase 8/9 ou ARQ;
3. a ordem cria dependência circular;
4. a estratégia de fechamento/parcelamento é consistente com os contratos históricos;
5. o áudio está corretamente tratado como regressão causal e não como reimplementação presumida;
6. algum legado foi colocado como removível cedo demais;
7. faltou consumidor, source-of-truth, teste, rollback, privacy ou gate de produção;
8. os P0/P1/P2 devem ser alterados;
9. existe uma ordem menor/mais segura sem perder cobertura;
10. o roadmap está pronto para ser submetido ao usuário como `roadmap-draft-v2` após reconciliação.
