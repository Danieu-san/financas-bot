# Plano — síntese do roadmap financeiro

Status: `CONTROL_ONLY — aguardando auditoria Codex pré-roadmap`.

## Objetivo

Consolidar, sem perda de contexto e sem reescrever a história, o roadmap financeiro existente, as evidências da Fase 8, os shadows/canários de retirada do legado, o workstream ARQ-01..06 e os novos bugs/achados de planilha e código em um roadmap atualizado, completo e auditável.

## Escopo

- preservar e reconciliar os roadmaps históricos;
- distinguir estado planejado de estado atual verificado;
- inventariar shadows/canários e gates ainda vigentes;
- incorporar achados atuais somente com classe de evidência explícita;
- registrar contradições sem resolvê-las por palpite;
- produzir `roadmap-draft-v1` somente após a auditoria independente pré-roadmap;
- submeter o draft completo a uma segunda revisão independente do Codex;
- pedir confirmação explícita do usuário antes de tornar o roadmap canônico.

## Não escopo

- corrigir produto;
- alterar produção, flags, Pluggy, planilha ou writers;
- remover legado;
- resetar janelas de shadow/canary já em andamento sem causa comprovada;
- declarar status atual a partir apenas de roadmap histórico.

## Fontes obrigatórias

1. `docs/plans/family-financial-platform-evolution-roadmap.md`.
2. `docs/plans/family-financial-platform-step-by-step-roadmap.md`.
3. `docs/agent-memory/workstreams/financial-conversation-architecture-review.md`.
4. Evidências Fase 8A/8B e gates de cartão/legado já documentados.
5. `docs/agent-memory/workstreams/results/FIN-AUDIT-PRE-ROADMAP-RETRY-20260826.md`, quando publicado.
6. `docs/agent-memory/workstreams/financial-roadmap-synthesis.md` e seu registro estruturado de fontes.

## Gate de entrada do draft

- auditoria independente pré-roadmap publicada e lida;
- estado dos shadows/canários relevantes revalidado ou marcado como `UNKNOWN/OPEN`;
- contradições registradas;
- decisões recentes do usuário preservadas.

## Gate de saída

Fluxo obrigatório:

`Chat consolida -> Codex tenta refutar -> Chat reconcilia -> usuário confirma -> roadmap canônico`.

Nenhuma implementação ou retirada de legado é autorizada por este plano.
