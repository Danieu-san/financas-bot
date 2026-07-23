---
name: handoff-portable-work
description: Pausar e transferir com segurança um trabalho do FinancasBot entre conversas, contas Codex ou computadores usando o SSD portátil. Usar quando o usuário pedir para parar, trocar de Codex/PC, retirar o SSD, preparar handoff, continuar em outra máquina ou recuperar onde o trabalho parou. Não usar para copiar autenticação, histórico privado ou a pasta pessoal inteira do Codex.
---

# Handoff portátil

## Gatilho automático

Quando o usuário disser que vai continuar em outro Codex, conta ou computador,
que vai retirar o SSD, ou pedir para enviar/preparar o trabalho, iniciar esta
rotina imediatamente e sem pedir nova confirmação. A frase é autorização para
parar na próxima fronteira consistente, registrar o checkpoint, validar o
pacote portátil e publicar no GitHub somente os arquivos explícitos do objetivo
quando isso fizer parte do fluxo já autorizado.

O gatilho não autoriza deploy, acesso a produção nem cópia da pasta pessoal do
Codex. Se houver uma rotina histórica que copie sessões, bancos internos,
cookies, SSH ou autenticação, não executá-la; substituí-la pelo checkpoint
versionado e registrar apenas metadados locais necessários para localizar o
estado na máquina de origem.

## Parar sem perder trabalho

1. Parar na primeira fronteira consistente; não iniciar nova ação material.
2. Confirmar raiz, branch, HEAD e estado rastreado/não rastreado.
3. Não alterar, adicionar ou remover arquivos alheios ao objetivo.
4. Rodar apenas verificações rápidas necessárias para saber se o checkpoint é sintaticamente íntegro. Não repetir baterias caras só para pausar.
5. Atualizar o checkpoint e plano do workstream correspondente antes de
   encerrar. Usar `current.md`/`current-gate.md` somente para o gate raiz.

O checkpoint deve conter objetivo/gate, commit de partida, HEAD, alterações concluídas, trabalho parcial, decisões, riscos, último teste confiável, mudanças posteriores, arquivos alheios, autorizações externas, próxima ação e capacidade recomendada. Para servidor, registrar também provedor, host lógico, usuário, chave referenciada, diretório e processo vigentes sem copiar segredos.

## Persistência

Executar `node scripts/agent/validateAgentWorkflow.js`. Fazer commit de checkpoint somente quando o conjunto estiver coerente e a autorização permitir; adicionar arquivos explicitamente, nunca `git add .`. Se o trabalho não estiver pronto para commit, deixar a árvore suja e documentar isso sem mascarar o estado.

Não transportar `~/.codex`, autenticação, cookies, sessões, tokens ou histórico privado. O repositório no SSD deve transportar regras, skills, estado, plano, scripts e decisões sem segredos.

Executar `scripts/agent/preparePortableHandoff.ps1` depois de atualizar o
checkpoint. A rotina pode inventariar nomes, datas e localização de stores do
Codex, mas nunca lê nem copia seu conteúdo. Quando o usuário quiser confirmação
pós-fechamento, armar `scripts/agent/Invoke-SafePortableHandoffAfterClose.ps1`;
ela aguarda a liberação dos stores apenas para repetir as verificações seguras e
gravar o relatório no SSD.

## Retomar em outro computador

1. Montar o SSD e abrir a raiz exata do repositório.
2. Ler `docs/agent-memory/START-HERE.md` e executar
   `scripts/agent/resumePortableWork.ps1`; a rotina deve validar o Git, o
   workflow e apenas a existência das referências de chaves no SSD.
3. Instalar/atualizar a orientação global da máquina com
   `node scripts/agent/installPortableWorkflow.js` quando necessário.
4. Abrir o Codex na raiz do Git.
5. Quando o usuário disser que continuou em outro Codex, tratar a frase como
   gatilho de retomada, sem pedir que ele reconstrua o contexto.
6. Depois da validação, usar `$execute-financasbot-gate` para retomar a próxima
   ação exata de `current.md`/`current-gate.md`.
7. O novo Codex deve preservar a árvore preexistente e não acessar produção sem
   autorização correspondente.

Conversas antigas não são o mecanismo de continuidade. O checkpoint versionado no SSD é a fonte portátil; o GitHub é a cópia imutável para auditoria e recuperação.
