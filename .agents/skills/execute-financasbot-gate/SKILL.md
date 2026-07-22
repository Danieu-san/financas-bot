---
name: execute-financasbot-gate
description: Executar ou retomar um gate, fatia, correção ou objetivo longo do FinancasBot com escopo fechado, contexto mínimo, checkpoints portáteis e validação proporcional. Usar quando o usuário disser continuar, seguir, retomar, implementar, corrigir, finalizar uma fase/gate ou trabalhar autonomamente por várias etapas no repositório. Não usar para perguntas puramente explicativas sem ação no projeto.
---

# Executar gate do FinancasBot

## Preparar

1. Publicar primeiro `Superfície → Modelo → Esforço → Próxima tarefa`.
2. Recomendar a menor capacidade suficiente, mas não trocar nem reduzir a capacidade ativa. Parar antes de uma redução e avisar Daniel.
3. Confirmar raiz Git, branch, HEAD completo e `git status` sem alterar a árvore.
4. Ler, nesta ordem: `AGENTS.md`, `docs/agent-memory/README.md`, `docs/agent-memory/current.md` e `docs/plans/current-gate.md`.
5. Abrir somente referências indicadas por esses arquivos ou exigidas pela tarefa. Não reler roadmaps e handoffs históricos por padrão.
6. Se Git, código e checkpoint divergirem, tratar Git/código/testes como evidência primária e corrigir o checkpoint antes de ampliar o trabalho.

## Fixar o contrato

Trabalhar em um objetivo material por vez. O gate ativo deve declarar objetivo, commit de partida, escopo, não escopo, invariantes, riscos, etapas, testes, critérios factuais de GO/NO-GO, condições de parada e próxima ação exata.

Não converter achados laterais em implementação silenciosa. Registrar o achado e reconciliar com o gate/roadmap antes de agir.

## Executar com economia

1. Preservar alterações preexistentes e arquivos não relacionados.
2. Usar scripts para inventário, validação, comparação e tarefas mecânicas; reservar raciocínio para decisões.
3. Preferir RED causal, implementação mínima, teste focal e bateria afetada.
4. Executar uma única suíte hermética abrangente quando o gate estiver estável. Não repetir suítes verdes sem mudança causal relevante.
5. Usar subagentes somente quando Daniel ou instrução aplicável autorizar e quando subtarefas independentes justificarem a paralelização.
6. Usar worktree/branch separada para trabalho simultâneo. Nunca iniciar outro agente escritor na mesma pasta e branch.
7. Manter Daniel informado durante operações longas e registrar checkpoint antes de pausa, troca de contexto ou compactação.

## Validar e encerrar

Antes de declarar conclusão:

- conferir diff, escopo e arquivos não relacionados;
- distinguir teste local, revisão estática, produção e prova externa;
- atualizar `current.md` somente com o estado vigente;
- atualizar `current-gate.md` se a etapa, evidência ou próximo passo mudou;
- executar `node scripts/agent/validateAgentWorkflow.js`;
- usar `$audit-immutable-gate` quando o gate exigir revisão independente;
- não executar commit, push, deploy ou serviço real além da autorização vigente.

A resposta final deve conter resultado, inteligência da decisão, capacidade recomendada e próximo passo concreto.
