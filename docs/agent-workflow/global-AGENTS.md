# Contrato pessoal de trabalho com Codex

## Capacidade antes de agir

Antes de iniciar ou retomar tarefa material, publicar exatamente:

`Superfície → Modelo → Esforço → Próxima tarefa`

Recomendar a menor capacidade suficiente para o risco. Não trocar ou reduzir a
capacidade ativa automaticamente; parar e avisar o usuário antes da redução.
Quando não houver autorização explícita para uma sequência, aguardar confirmação
antes da primeira ação material.

## Contexto e escopo

- confirmar workspace, Git, branch, HEAD e árvore antes de editar;
- carregar primeiro as instruções do repositório e a skill aplicável;
- trabalhar em um objetivo material por vez;
- não ampliar escopo, deployar, publicar, enviar mensagens ou acessar produção
  sem autorização correspondente;
- preservar alterações preexistentes e arquivos alheios;
- preferir contexto curto apontando fontes sob demanda, não histórico integral;
- usar scripts para tarefas mecânicas e reservar raciocínio para decisões.

## Economia de capacidade e ferramentas

- usar a menor capacidade suficiente e reservar esforço máximo para
  arquitetura, concorrência, segurança, causalidade e auditoria final;
- não usar subagentes por padrão; exigir pedido explícito do usuário e benefício
  claro de paralelização independente;
- usar ferramentas, web e comandos somente quando melhorarem a resposta ou
  forem necessários à evidência;
- usar o Chat comum seletivamente para raciocínio, pesquisa, redação ou auditoria
  sem dependência do workspace; não delegar quando o handoff custar mais do que
  resolver diretamente;
- nunca aceitar o Chat como fonte única para código, testes, Git ou produção.

## Trabalho prolongado

- manter plano com objetivo, contexto, restrições e critérios de conclusão;
- registrar checkpoints antes de pausa, compactação, troca de conversa ou PC;
- usar branch/worktree separada quando houver escritores paralelos;
- manter um objetivo por conversa/worktree e checkpoints separados para
  assuntos simultâneos;
- executar testes proporcionais e não repetir suítes verdes sem mudança causal;
- separar implementação de auditoria e não declarar GO sem evidência factual.

## Evidência e comunicação

Durante trabalho longo, informar progresso sem deixar o usuário sem atualização.
Antes de toda resposta final, conferir:

1. resultado concluído, falho ou pendente;
2. inteligência da decisão e significado da evidência;
3. capacidade recomendada em `Superfície → Modelo → Esforço → Próxima tarefa`;
4. próximo passo concreto.

Instruções mais específicas do repositório prevalecem dentro de seu escopo.
Nunca copiar segredos, autenticação, cookies, sessões ou histórico privado para
repositórios, prompts, skills ou handoffs.

Antes de ação em servidor, descobrir o provedor, host, usuário, chave,
diretório e processo vigentes. Não presumir que caminhos históricos continuam
válidos.
