# Plano — síntese do roadmap financeiro

Status: `DRAFT_V1 CREATED — CODEX ADVERSARIAL REVIEW NEXT`.

## Objetivo

Consolidar, sem perda de contexto e sem reescrever a história, o roadmap financeiro existente, as evidências da Fase 8, os shadows/canários de retirada do legado, o workstream ARQ-01..06 e os novos bugs/achados de planilha, código e experiência WhatsApp em um roadmap atualizado, completo e auditável.

## Escopo

- preservar e reconciliar os roadmaps históricos;
- distinguir estado planejado de estado atual verificado;
- inventariar shadows/canários e gates ainda vigentes;
- incorporar achados atuais somente com classe de evidência explícita;
- registrar contradições sem resolvê-las por palpite;
- incluir a regressão relatada de áudio do WhatsApp exigindo reprodução causal;
- preservar capacidades canônicas históricas antes de propor reconstrução;
- submeter o draft completo a uma segunda revisão independente do Codex;
- pedir confirmação explícita do usuário antes de tornar o roadmap canônico.

## Não escopo

- corrigir produto nesta síntese;
- alterar produção, flags, Pluggy, planilha ou writers;
- remover legado;
- resetar janelas de shadow/canary já em andamento sem causa comprovada;
- declarar status atual a partir apenas de roadmap histórico;
- atribuir causa ao problema de áudio sem evidência causal de código/teste/log/runtime.

## Fontes obrigatórias já lidas para o draft v1

1. `docs/plans/family-financial-platform-evolution-roadmap.md`.
2. `docs/plans/family-financial-platform-step-by-step-roadmap.md`.
3. `docs/agent-memory/workstreams/financial-conversation-architecture-review.md`.
4. Evidências Fase 8A/8B e checkpoint `phase-8-legacy-retirement`.
5. Auditoria independente `FIN-AUDIT-PRE-ROADMAP-RETRY-20260826`, publicada no commit `ea3ad3a604ce99c580bf5d18bda2ecb365d27545` da branch de orquestração.
6. `docs/agent-memory/workstreams/financial-roadmap-synthesis.md` e registro estruturado de fontes.
7. `src/handlers/audioHandler.js`, `src/handlers/messageHandler.js` e testes de áudio para caracterização de capacidade, sem confundir com prova de runtime.

## Artefato atual

`docs/plans/workstreams/financial-roadmap-draft-v1.md`

Commit inicial do draft: `a894895a2b5c0d0662981c43d731584e12dc1430`.

O draft contém os campos obrigatórios por fase, matrizes de problemas, shadows/canários, fonte de verdade, gates transversais, critérios globais, contradições abertas e changelog de preservação/supersessão.

## Próximo gate

Enviar o draft completo ao Codex em tarefa somente de leitura. Para cada `ROAD-*`, o revisor deve emitir `CONCORDO`, `DISCORDO`, `FALTA EVIDÊNCIA` ou `RISCO NÃO COBERTO`, tentando especificamente encontrar:

- reconstrução indevida de capacidade já existente;
- conflito com Fase 8/9 ou ARQ;
- dependência circular;
- risco de dupla contagem/source-of-truth;
- retirada prematura de legado;
- lacuna de teste/rollback/privacy;
- tratamento incorreto de áudio como reimplementação em vez de regressão causal.

## Gate de saída

`Chat consolida -> Codex tenta refutar -> Chat reconcilia -> usuário confirma -> roadmap canônico`.

Nenhuma implementação ou retirada de legado é autorizada por este plano.
