# Plano — síntese do roadmap financeiro

Status: `DRAFT_V2_AWAITING_USER_CONFIRMATION — revisão Codex concluída`.

## Objetivo

Consolidar, sem perda de contexto e sem reescrever a história, o roadmap financeiro existente, as evidências da Fase 8, os shadows/canários de retirada do legado, o workstream ARQ-01..06 e os novos bugs/achados de planilha, código e experiência WhatsApp em um roadmap atualizado, completo e auditável.

## Estado atual

- auditoria independente pré-roadmap concluída: `FIN-AUDIT-PRE-ROADMAP-RETRY-20260826`;
- `financial-roadmap-draft-v1.md` criado e submetido à revisão adversarial Codex;
- revisão concluída em `FIN-ROADMAP-V1-REVIEW-20260827` com veredito `APROVÁVEL APÓS AJUSTES`;
- as dez mudanças obrigatórias do Codex foram reconciliadas em `docs/plans/workstreams/financial-roadmap-draft-v2.md`;
- nenhum item do roadmap está autorizado para implementação automática;
- próximo gate é confirmação explícita do usuário sobre o draft v2.

## Escopo

- preservar e reconciliar os roadmaps históricos;
- distinguir estado planejado de estado atual verificado;
- inventariar shadows/canários e gates ainda vigentes;
- incorporar achados atuais somente com classe de evidência explícita;
- registrar contradições sem resolvê-las por palpite;
- incluir regressão de áudio com diagnóstico causal, sem assumir causa;
- preservar provenance/confirmed/projected como contratos explícitos;
- preservar a Fase 8 e intercalar migração/cutover/retirada por domínio, evitando dependência circular;
- separar ARQ read-only de writers;
- manter Fase 7 patrimônio/investimentos como `DEFERRED`.

## Não escopo

- corrigir produto nesta síntese;
- alterar produção, flags, Pluggy, planilha ou writers;
- remover legado;
- resetar janelas de shadow/canary sem causa comprovada;
- declarar status atual apenas por roadmap histórico;
- atribuir causa ao áudio sem evidência causal;
- tornar o draft canônico sem confirmação do usuário.

## Fontes obrigatórias

1. `docs/plans/family-financial-platform-evolution-roadmap.md`.
2. `docs/plans/family-financial-platform-step-by-step-roadmap.md`.
3. `docs/agent-memory/workstreams/financial-conversation-architecture-review.md`.
4. Evidências Fase 8A/8B e gates de cartão/legado já documentados.
5. Auditoria `FIN-AUDIT-PRE-ROADMAP-RETRY-20260826` no commit publicado pela branch de orquestração.
6. `docs/agent-memory/workstreams/financial-roadmap-synthesis.md` e registro estruturado de fontes.
7. `src/handlers/audioHandler.js`, `src/handlers/messageHandler.js` e testes de áudio.
8. `docs/plans/workstreams/financial-roadmap-draft-v1.md`.
9. Revisão `FIN-ROADMAP-V1-REVIEW-20260827`, candidato `d2e045d44dbc9ec3419530884e0cb3674969d0f3`, retornado por commit state-only `3144c9cfb6d7d59933aa9e07800420158c9f487b`.
10. `docs/plans/workstreams/financial-roadmap-draft-v2.md`.

## Gate de saída

Fluxo obrigatório:

`Chat consolidou v1 -> Codex refutou/revisou -> Chat reconciliou v2 -> usuário confirma -> roadmap canônico`.

A confirmação pode ser:
- `CONCORDO COM O ROADMAP V2`;
- `CONCORDO COM RESSALVAS: ...`;
- `NÃO CONCORDO: ...`.

Nenhuma implementação ou retirada de legado é autorizada por este plano.
