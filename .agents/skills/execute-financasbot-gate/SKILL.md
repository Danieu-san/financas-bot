---
name: execute-financasbot-gate
description: Executar ou retomar um gate, fatia, correção ou objetivo longo do FinancasBot com escopo fechado, contexto mínimo, checkpoints portáteis e validação proporcional. Usar quando o usuário disser continuar, seguir, retomar, implementar, corrigir, finalizar uma fase/gate ou trabalhar autonomamente por várias etapas no repositório. Não usar para perguntas puramente explicativas sem ação no projeto.
---

# Executar gate do FinancasBot

## Preparar

1. Publicar primeiro `Superfície → Modelo → Esforço → Próxima tarefa`.
2. Recomendar a menor capacidade suficiente, mas não trocar nem reduzir a capacidade ativa. Parar antes de uma redução e avisar Daniel.
3. Confirmar raiz Git, branch, HEAD completo e `git status` sem alterar a árvore.
4. Identificar o workstream. Para o gate raiz, ler `AGENTS.md`, `docs/agent-memory/README.md`, `docs/agent-memory/current.md` e `docs/plans/current-gate.md`. Para assunto diferente, consultar `docs/agent-memory/workstreams/index.md` e usar o checkpoint/plano próprios.
5. Se não houver checkpoint do workstream, criar um sem sobrescrever o gate raiz; usar branch/worktree separada quando outra conversa puder escrever em paralelo.
6. Abrir somente referências indicadas por esses arquivos ou exigidas pela tarefa. Não reler roadmaps e handoffs históricos por padrão.
7. Se Git, código e checkpoint divergirem, tratar Git/código/testes como evidência primária e corrigir o checkpoint antes de ampliar o trabalho.

## Fixar o contrato

Trabalhar em um objetivo material por vez. O gate ativo deve declarar objetivo, commit de partida, escopo, não escopo, invariantes, riscos, etapas, testes, critérios factuais de GO/NO-GO, condições de parada e próxima ação exata.

Não converter achados laterais em implementação silenciosa. Registrar o achado e reconciliar com o gate/roadmap antes de agir.

## Executar com economia

1. Preservar alterações preexistentes e arquivos não relacionados.
2. Usar scripts para inventário, validação, comparação e tarefas mecânicas; reservar raciocínio para decisões.
3. Preferir RED causal, implementação mínima, teste focal e bateria afetada.
4. Executar uma única suíte hermética abrangente quando o gate estiver estável. Não repetir suítes verdes sem mudança causal relevante.
5. Não usar subagentes por padrão. Usá-los somente quando Daniel pedir explicitamente e quando subtarefas independentes justificarem o consumo adicional.
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

Antes de servidor/deploy, confirmar no workstream vigente provedor, host,
usuário, chave, diretório e processo; não presumir AWS/EC2 ou Oracle.

A resposta final deve conter resultado, inteligência da decisão, capacidade recomendada e próximo passo concreto.
