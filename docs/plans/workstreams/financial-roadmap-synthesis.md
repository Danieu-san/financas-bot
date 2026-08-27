# Plano — síntese do roadmap financeiro

Status: `CONTROL_ONLY — aguardando auditoria Codex pré-roadmap`.

## Objetivo

Consolidar, sem perda de contexto e sem reescrever a história, o roadmap financeiro existente, as evidências da Fase 8, os shadows/canários de retirada do legado, o workstream ARQ-01..06 e os novos bugs/achados de planilha, código e experiência WhatsApp em um roadmap atualizado, completo e auditável.

## Escopo

- preservar e reconciliar os roadmaps históricos;
- distinguir estado planejado de estado atual verificado;
- inventariar shadows/canários e gates ainda vigentes;
- incorporar achados atuais somente com classe de evidência explícita;
- registrar contradições sem resolvê-las por palpite;
- incluir a regressão relatada de áudio do WhatsApp como correção explícita do roadmap, exigindo reprodução causal antes de qualquer implementação;
- no áudio, separar e testar as fronteiras `mensagem recebida -> download/retry -> reaquisição -> conversão -> transcrição -> retorno ao messageHandler -> processamento financeiro`;
- preservar como evidência de código os retries/reaquisição e testes locais já existentes, sem tratá-los como prova de funcionamento real;
- produzir `roadmap-draft-v1` somente após a auditoria independente pré-roadmap;
- submeter o draft completo a uma segunda revisão independente do Codex;
- pedir confirmação explícita do usuário antes de tornar o roadmap canônico.

## Não escopo

- corrigir produto nesta síntese;
- alterar produção, flags, Pluggy, planilha ou writers;
- remover legado;
- resetar janelas de shadow/canary já em andamento sem causa comprovada;
- declarar status atual a partir apenas de roadmap histórico;
- atribuir causa ao problema de áudio sem evidência causal de código/teste/log/runtime.

## Fontes obrigatórias

1. `docs/plans/family-financial-platform-evolution-roadmap.md`.
2. `docs/plans/family-financial-platform-step-by-step-roadmap.md`.
3. `docs/agent-memory/workstreams/financial-conversation-architecture-review.md`.
4. Evidências Fase 8A/8B e gates de cartão/legado já documentados.
5. `docs/agent-memory/workstreams/results/FIN-AUDIT-PRE-ROADMAP-RETRY-20260826.md`, quando publicado.
6. `docs/agent-memory/workstreams/financial-roadmap-synthesis.md` e seu registro estruturado de fontes.
7. `src/handlers/audioHandler.js`, `src/handlers/messageHandler.js` e `tests/audioHandlerPrivacy.test.js` para caracterização do fluxo de áudio.

## Gate de entrada do draft

- auditoria independente pré-roadmap publicada e lida, ou explicitamente marcada como indisponível com a lacuna preservada;
- estado dos shadows/canários relevantes revalidado ou marcado como `UNKNOWN/OPEN`;
- contradições registradas;
- decisões recentes do usuário preservadas;
- áudio registrado como problema de runtime relatado, sem causa inventada.

## Gate de saída

Fluxo obrigatório:

`Chat consolida -> Codex tenta refutar -> Chat reconcilia -> usuário confirma -> roadmap canônico`.

A revisão Codex do roadmap deverá dizer explicitamente se concorda com a inclusão, prioridade, estratégia de diagnóstico e critérios de aceite da correção de áudio.

Nenhuma implementação ou retirada de legado é autorizada por este plano.
