# Controle de síntese do roadmap financeiro

Status: `CONTROL_ONLY — roadmap final ainda não consolidado`
Data: 2026-08-26
Branch de trabalho: `chat/financial-roadmap-synthesis-20260826`
Snapshot-base desta síntese: `8c93e1edd5b8c9b98055cfc6ca4283c2932de96b`

## Objetivo

Preservar fatos, decisões, evidências, shadows/canários, gates antigos e novas descobertas antes de produzir um novo roadmap do FinançasBot. Este arquivo NÃO substitui os roadmaps existentes e NÃO autoriza implementação ou retirada de legado. Ele existe para impedir perda de contexto, reinterpretação silenciosa e alucinação entre Chat, Codex e futuras conversas.

## Regra de ouro

Nenhuma afirmação entra no roadmap final apenas porque apareceu em uma conversa, em um roadmap antigo ou em uma resposta de modelo. Toda afirmação operacional deve carregar uma classe de evidência, uma fonte verificável e um status explícito.

Classes permitidas:

- `USER_DECISION`: decisão explícita mais recente do usuário; prevalece sobre preferência antiga quando houver conflito.
- `CURRENT_CODE`: comportamento verificado no código do commit usado para a análise.
- `PRODUCTION_EVIDENCE`: evidência operacional/smoke/telemetria de produção documentada.
- `QA_GATE`: gate, auditoria, teste ou relatório versionado no Git.
- `HISTORICAL_PLAN`: intenção/ordem documentada em roadmap anterior; não prova estado atual por si só.
- `PENDING_AUDIT`: item aguardando confirmação independente.
- `HYPOTHESIS`: hipótese ainda não comprovada; nunca pode ser apresentada como fato.

## Fontes obrigatórias que NÃO podem ser esquecidas

### Roadmaps anteriores

1. `docs/plans/family-financial-platform-evolution-roadmap.md`
   - macroplano do produto;
   - contém princípios de ledger canônico, datas financeiras distintas, recorrências, faturas, parcelamentos, Open Finance e limites do LLM.

2. `docs/plans/family-financial-platform-step-by-step-roadmap.md`
   - fila operacional detalhada;
   - documenta Fases 1–9, gates já executados, Fase 8 de consolidação/remoção do legado e Fase 9 Open Finance.

### Consolidação/retirada do legado já em andamento

Obrigatório revisar antes de propor nova remoção ou novo shadow:

- `docs/qa/phase-8a-legacy-inventory-audit-2026-07-14.md`
- `docs/qa/phase-8b0-durable-legacy-telemetry-gate-2026-07-14.md`
- `docs/qa/phase-8b1-bill015-analytical-gate-2026-07-14.md`
- `docs/qa/phase-8b2-dashboard-adoption-telemetry-gate-2026-07-15.md`
- `docs/qa/phase-8b3-financial-undo-product-decision-gate-2026-07-15.md`
- `docs/qa/phase-8b4-card-sheet-and-quarantine-characterization-gate-2026-07-15.md`
- `docs/qa/phase-8b5-card-consumer-parity-and-migration-plan-gate-2026-07-15.md`
- `docs/qa/phase-8b6-card-read-model-unified-first-gate-2026-07-15.md`
- `docs/qa/phase-8b7-card-scheduler-unified-first-gate-2026-07-15.md`
- `docs/qa/phase-8b8-card-user-id-validation-unified-first-gate-2026-07-15.md`
- `docs/qa/phase-8b9-whatsapp-card-consumer-characterization-gate-2026-07-15.md`

Regras históricas preservadas até prova explícita de supersessão:

- não remover legado sem medição;
- fallback/rollback permanece até paridade comprovada por consumidor;
- remoção física depende de uso zero comprovado;
- cartões exigiam dois fechamentos ou pelo menos 60 dias de observação, com data mínima histórica documentada de 2026-09-12;
- soft-disable reversível podia ocorrer antes apenas sob critérios do ADR-008; mutação/fonte não recebia atalho;
- `8C` não autoriza desmontar fallback necessário ao cutover/rollback de `8D`.

### Arquitetura financeira mais recente

- `docs/agent-memory/workstreams/financial-conversation-architecture-review.md`
- documentos de auditoria ARQ-01 a ARQ-06 referenciados nesse workstream.

Estado documentado em 2026-08-24 que deve ser tratado como evidência versionada, não como suposição eterna:

- `ARQ-01 A ARQ-06 EM GO`;
- agente iterativo read-only nasceu em shadow;
- canário por domínio/fonte foi implementado;
- smoke real base + follow-up foi comprovado;
- canário foi restaurado para `off`;
- writer, retirada do legado e expansão de escopo continuaram fora do objetivo ARQ-06.

### Fluxo de áudio

Evidência atual de código que precisa ser confrontada com o relato real de falha:

- `src/handlers/audioHandler.js` contém retry limitado de download, tentativa de habilitar auto-download, reaquisição da mensagem, conversão OGG->MP3 e transcrição;
- `tests/audioHandlerPrivacy.test.js` cobre sucesso, falha de transcrição, retry/reaquisição, exaustão de download e limpeza/privacidade;
- `src/handlers/messageHandler.js` chama `handleAudio(msg)` e substitui `msg.body` pelo texto transcrito quando há sucesso.

Isso NÃO prova que áudio funciona em produção. O usuário relatou em 2026-08-26 que o recebimento/processamento de áudio do bot não está funcionando. Até reprodução e diagnóstico, classificar como `USER_DECISION + PENDING_AUDIT`, não como causa raiz confirmada.

### Auditoria independente pré-roadmap em andamento

Tentativa original: `FIN-AUDIT-PRE-ROADMAP-20260826`.
Retry atual: `FIN-AUDIT-PRE-ROADMAP-RETRY-20260826`.
Nome da conversa/tarefa Codex: `FinançasBot — Auditoria independente pré-roadmap — RETRY 2026-08-26`.
Resultado esperado:
`docs/agent-memory/workstreams/results/FIN-AUDIT-PRE-ROADMAP-RETRY-20260826.md`.

Até esse resultado existir e ser lido, os 17 achados enviados ao Codex permanecem `PENDING_AUDIT`, mesmo quando o Chat já encontrou evidência forte.

## Decisões recentes do usuário a preservar

Estas decisões não devem ser revertidas por inferência posterior:

1. Todos os cartões ativos da planilha familiar são intencionalmente compartilhados entre os usuários autorizados; nomes servem para identificar o cartão, não para restringir titularidade/uso.
2. O Uber de R$ 22,91 em 25/08/2026 foi corretamente pago no Nubank Daniel; o problema a investigar é identidade/nome/agregação e demais semânticas, não a escolha do cartão.
3. Não criar `carteira digital` para explicar esse caso.
4. A data real de fechamento de cartão pode mudar por fim de semana/feriado; dia configurado não deve ser tratado como verdade absoluta quando houver evidência real de fatura.
5. Parcelamentos não têm necessariamente atualização externa em tempo real do saldo restante; o bot deve usar parcelas/mês de cobrança existentes e, quando necessário, distinguir confirmado de projetado sem inventar saldo.
6. O cartão Atacadão foi adicionado pelo usuário à conexão Pluggy de Daniel; é obrigatório verificar se descoberta é dinâmica ou se há configuração/mapeamento a atualizar.
7. Forma de pagamento no fluxo deve virar lista numerada: `1 Crédito`, `2 Débito`, `3 PIX`, `4 Dinheiro`, preservando texto como fallback.
8. O novo roadmap deve ser completo e detalhado, e só poderá virar canônico após revisão independente do Codex e confirmação explícita do usuário.
9. Trabalhos já existentes em shadow/canary para retirada de partes do legado devem ser reutilizados; não duplicar esforço nem resetar contadores/janelas sem causa.
10. O recebimento/processamento de mensagens de áudio do WhatsApp está atualmente relatado como não funcional e deve entrar no roadmap como correção explícita, precedida por reprodução causal e auditoria para distinguir download, reaquisição, conversão, transcrição, roteamento e integração pós-transcrição.

## Inventário mínimo de shadows/canários a revalidar antes do roadmap final

A lista abaixo é um índice de coisas documentadas historicamente. O status atual de cada item precisa ser revalidado no código/telemetria antes de ser chamado de ativo hoje.

- Interpretation Reliability em shadow para escritas.
- Telemetria durável de uso do legado (Fase 8B.0).
- Observação Dashboard v1/v2 (8B.2).
- Read-model de cartão unified-first em canário reversível (8B.6).
- Scheduler de cartão unified-first em canário (8B.7).
- Manutenção/validação de cartão unified-first caracterizada (8B.8).
- Consumidores WhatsApp de cartão caracterizados (8B.9).
- Reconciliação Open Finance em shadow (Fase 9D).
- Agente iterativo financeiro em shadow (ARQ-03).
- Canário iterativo por domínio/fonte (ARQ-05/06), documentado como `off` após o fechamento ARQ-06.

## Protocolo anti-perda e anti-alucinação

### 1. Não sobrescrever história

Quando uma decisão antiga deixar de valer, marcar como `SUPERSEDED` e registrar por qual evidência/decisão foi substituída. Nunca apagar silenciosamente uma etapa antiga do roadmap.

### 2. Separar plano de estado real

Cada item do novo roadmap deverá conter dois campos distintos:

- `planned_state`: o que o plano deseja;
- `verified_current_state`: o que foi comprovado no commit/telemetria atual.

Roadmap antigo sozinho só pode preencher `planned_state` ou histórico, nunca `verified_current_state`.

### 3. Matrizes obrigatórias

O roadmap final terá, no mínimo:

- matriz de problemas/causas/evidências;
- matriz de shadows/canários já existentes;
- matriz de consumidores do legado e destino canônico;
- matriz de fontes de verdade por conceito financeiro;
- matriz de testes/gates/rollback por fase;
- matriz de contradições abertas.

Nenhum item pode desaparecer entre versões sem aparecer em um changelog de `ADDED`, `MERGED`, `DEFERRED`, `SUPERSEDED` ou `REMOVED_WITH_EVIDENCE`.

### 4. Contradições não são resolvidas por palpite

Se Chat, Codex, roadmap antigo, código atual ou evidência de produção divergirem:

1. registrar a contradição;
2. identificar as fontes conflitantes;
3. classificar qual é histórica e qual é atual;
4. buscar código/teste/telemetria que resolva;
5. se ainda não resolver, manter `OPEN` e pedir confirmação humana quando for decisão de produto.

### 5. Nenhuma retirada de legado sem `Legacy Removal Gate`

Cada candidato à retirada deverá provar, separadamente:

- consumidor conhecido e destino canônico;
- paridade funcional/semântica;
- telemetria viva com heartbeat;
- janela de observação aplicável;
- uso legado zero ou justificativa explícita de soft-disable;
- teste de rollback;
- cobertura de WhatsApp, dashboard, jobs, importação e manutenção pertinentes;
- ausência de falso zero/fonte indisponível;
- ausência de dupla contagem;
- rollback preservado até o cutover final de fonte.

### 6. Nomenclatura fixa

Não colapsar os três termos abaixo:

- `legado`: pipeline histórico/compatibilidade ainda potencialmente usado;
- `Financial Agent v1`: agente LangGraph atual/linear que não substitui todos os caminhos da planilha pessoal;
- `novo agente/ARQ`: reasoner iterativo read-only, fachada semântica, verificador e canário.

### 7. Snapshot antes de cada síntese

Antes de editar o roadmap final:

1. registrar HEAD da branch usada;
2. revalidar os dois roadmaps antigos nesse HEAD;
3. revalidar o workstream ARQ;
4. ler a auditoria Codex pré-roadmap;
5. verificar se houve novo resultado de shadow/canary desde a última síntese;
6. somente então gerar nova versão.

### 8. Revisão dupla antes de canonizar

Fluxo obrigatório:

`Chat consolida -> Codex tenta refutar -> Chat reconcilia divergências -> usuário confirma -> roadmap vira canônico`

A revisão Codex deve listar explicitamente `CONCORDO`, `DISCORDO`, `FALTA EVIDÊNCIA` ou `RISCO NÃO COBERTO` por fase.

## Questões abertas já conhecidas

- O roadmap de julho descreve fases 1–6 como GO e Fase 8/9 avançadas; mapear o que continua vigente no código/produção de agosto antes de reutilizar qualquer status.
- A janela histórica de remoção física de cartões ainda não chegou à data mínima de 2026-09-12 em 2026-08-26; qualquer plano de exclusão antes disso exige evidência explícita de supersessão, não interpretação.
- O novo cartão Atacadão no Pluggy de Daniel precisa ser confrontado com descoberta dinâmica, aliases e gates atuais.
- Parcelamentos precisam reconciliar o cronograma canônico histórico (Fase 3E) com a planilha atual e com os achados de `Lançamentos Cartão`/`Parcelamentos`.
- Fechamento configurado versus fechamento real observado precisa de política de precedência temporal.
- O roadmap final deve incorporar os bugs atuais da planilha/código sem apagar capacidades canônicas já implementadas anteriormente.
- O fluxo de áudio precisa ser reproduzido ponta a ponta: identificar se a falha atual ocorre antes do download, na reaquisição da mídia, no ffmpeg, na transcrição Gemini, no retorno ao `messageHandler` ou depois da transcrição. Testes existentes são evidência de cobertura local, não de funcionamento real.

## Próximo passo

Confrontar a auditoria Codex pré-roadmap quando publicada, revisar as evidências de Fase 8 e ARQ, incluir o diagnóstico de áudio e só então produzir `roadmap-draft-v1`. Nenhuma correção de produto ou remoção de legado é autorizada por este arquivo.
