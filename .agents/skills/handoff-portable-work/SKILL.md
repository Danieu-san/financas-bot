---
name: handoff-portable-work
description: Pausar e transferir com segurança um trabalho do FinancasBot entre conversas, contas Codex ou computadores usando o SSD portátil. Usar quando o usuário pedir para parar, trocar de Codex/PC, retirar o SSD, preparar handoff, continuar em outra máquina ou recuperar onde o trabalho parou. Não usar para copiar autenticação, histórico privado ou a pasta pessoal inteira do Codex.
---

# Handoff portátil

## Parar sem perder trabalho

1. Parar na primeira fronteira consistente; não iniciar nova ação material.
2. Confirmar raiz, branch, HEAD e estado rastreado/não rastreado.
3. Não alterar, adicionar ou remover arquivos alheios ao objetivo.
4. Rodar apenas verificações rápidas necessárias para saber se o checkpoint é sintaticamente íntegro. Não repetir baterias caras só para pausar.
5. Atualizar `docs/agent-memory/current.md` e `docs/plans/current-gate.md` antes de encerrar.

O checkpoint deve conter objetivo/gate, commit de partida, HEAD, alterações concluídas, trabalho parcial, decisões, riscos, último teste confiável, mudanças posteriores, arquivos alheios, autorizações externas, próxima ação e capacidade recomendada.

## Persistência

Executar `node scripts/agent/validateAgentWorkflow.js`. Fazer commit de checkpoint somente quando o conjunto estiver coerente e a autorização permitir; adicionar arquivos explicitamente, nunca `git add .`. Se o trabalho não estiver pronto para commit, deixar a árvore suja e documentar isso sem mascarar o estado.

Não transportar `~/.codex`, autenticação, cookies, sessões, tokens ou histórico privado. O repositório no SSD deve transportar regras, skills, estado, plano, scripts e decisões sem segredos.

## Retomar em outro computador

1. Montar o SSD e abrir a raiz exata do repositório.
2. Instalar/atualizar a orientação global da máquina com `node scripts/agent/installPortableWorkflow.js` quando necessário.
3. Abrir o Codex na raiz do Git.
4. Pedir: `Use $execute-financasbot-gate e retome o objetivo ativo.`
5. O novo Codex deve confirmar branch/HEAD/status e ler somente as fontes curtas antes de agir.

Conversas antigas não são o mecanismo de continuidade. O checkpoint versionado no SSD é a fonte portátil; o GitHub é a cópia imutável para auditoria e recuperação.
