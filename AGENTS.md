# AGENTS.md — Mapa do Projeto: FinancasBot

## Visão Geral
Bot de WhatsApp para controle financeiro pessoal. Usa **whatsapp-web.js** (via Puppeteer), **Gemini 2.5 Flash** como LLM e **Google Sheets/Calendar** como banco de dados.

## Memória Operacional do Agente
Antes de trabalhos não triviais, leia primeiro `docs/agent-memory/README.md`.

Essa pasta é a memória curta e atualizável do projeto. Ela evita reler o histórico inteiro e aponta quais documentos/códigos consultar por tarefa. Não substitui validação em código, testes, logs ou EC2 quando a tarefa envolver produção.

## Modo de Trabalho Portátil

Para qualquer tarefa não trivial, usar o workflow versionado no SSD:

1. confirmar raiz Git, branch, HEAD completo e árvore de trabalho;
2. ler `docs/agent-memory/README.md`, `docs/agent-memory/current.md` e
   `docs/plans/current-gate.md`;
3. trabalhar em um único objetivo material e não ampliar escopo silenciosamente;
4. usar scripts para operações mecânicas e testes proporcionais ao risco;
5. atualizar o checkpoint antes de pausar, trocar de conversa/computador ou
   encerrar;
6. separar implementação de auditoria e nunca declarar GO sem evidência factual.

### Escada obrigatória de validação e economia

Este projeto aplica também o orçamento de contexto do contrato global. Antes da
primeira suíte ampla, fazer revisão adversarial local, syntax check, teste focal
e bateria causal. Executar somente uma suíte hermética ampla por candidato
estável, imediatamente antes do commit auditável. Não repetir suíte verde sem
mudança causal; depois de NO-GO com alteração de código, repetir os afetados e
uma única suíte ampla final.

Ferramentas devem devolver somente evidência necessária: resumos de manifesto,
recortes de logs desde o último evento relevante, campos agregados e a resposta
final do auditor. Não capturar página inteira do Chat, barra lateral, manifesto
completo ou logs históricos quando um seletor ou filtro resolve. Agrupar
diagnósticos somente leitura, não consultar estado externo inalterado e limitar
esperas a blocos de 60 segundos sem polling redundante.

Usar uma conversa limpa e uma tentativa automática de Chat por hash imutável.
Subagentes continuam desligados sem pedido explícito e benefício líquido claro.
Antes de etapa inevitavelmente cara, informar o custo esperado e a evidência que
ela produzirá. Estas regras reduzem tokens e tempo, mas não removem teste causal,
auditoria obrigatória ou controle de produção.

### Calibração prospectiva de uso do Codex

Enquanto `CODEX-USAGE-CAL-01` estiver ativo, as quatro primeiras tarefas reais
de calibração devem usar o coletor local versionado em
`scripts/agent/codexTelemetryCollector.js`, controlado por
`scripts/agent/Manage-CodexUsageTelemetry.ps1`. Antes da tarefa material,
confirmar que o coletor está saudável e iniciar um `objective_id` sem texto
livre; ao encerrar ou pausar, fechar o objetivo e registrar o resumo agregado no
workstream correspondente.

O coletor deve permanecer restrito a loopback, armazenar somente metadados da
allowlist e nunca persistir prompt, comando, patch, saída de ferramenta,
mensagem, segredo ou identidade de conta. Ausência de evento ou métrica é
`NAO_DISPONIVEL`, nunca zero. Os arquivos locais ficam fora do Git. Falha da
telemetria não autoriza ampliar coleta nem bloquear o produto: registrar a
lacuna e preservar a execução normal.

Ao chegar de outro computador ou conversa, ler primeiro
`docs/agent-memory/START-HERE.md` e executar
`scripts/agent/resumePortableWork.ps1`. A frase do usuário informando que
continuou em outro Codex é autorização para essa validação de retomada, sem
pedir que ele reconstrua manualmente o contexto.

O handoff para SSD deve partir da raiz canônica atual e de um HEAD já publicado,
usando `scripts/agent/syncPortableRepository.ps1`. Nunca atualizar por cima de
uma cópia antiga ou suja: criar uma cópia nova identificada pelo hash e deixar
`Trabalho Codex no outro PC/OPEN-THIS.json` apontando para ela. Na retomada,
buscar `origin`, comparar a branch registrada com o remoto e materializar uma
worktree isolada se houver commit posterior; não usar `pull`, `reset` ou a pasta
antiga como fonte vigente.

### Trava obrigatória de auditoria no Chat

Toda correção material do FinançasBot deve passar por auditoria independente no
Chat antes de ser declarada pronta, encerrada ou promovida a `GO`. Testes locais,
suíte ampla, inspeção do Codex e revisão do diff são pré-requisitos, mas não
substituem essa auditoria. O fluxo obrigatório é: produzir um commit sanitizado,
publicá-lo no GitHub, fornecer ao Chat o hash imutável e os arquivos exatos,
confrontar o veredito com a evidência local e somente então fechar a correção.
Esta trava vale para qualquer conversa, Codex ou computador que retome o
trabalho pelo repositório. Se o Chat bloquear a solicitação, aplicar a rotina de
fallback manual descrita em `Delegação para Chat`; sem resposta auditável, o
estado máximo permitido é `candidato aguardando auditoria`, nunca `pronto`.

Não reler roadmaps, handoffs e auditorias históricas indiscriminadamente. O
estado curto deve apontar as referências adicionais realmente necessárias.

Skills obrigatórias por situação:

- `$execute-financasbot-gate` para implementar, retomar ou concluir gates;
- `$audit-immutable-gate` para auditoria independente por hash;
- `$handoff-portable-work` para pausa e transferência entre Codex/PCs.

O histórico cronológico anterior permanece em
`docs/agent-memory/current-state.md` e no Git, mas não é fonte de contexto
inicial.

### Conversas e workstreams paralelos

"Um objetivo por vez" significa um objetivo por conversa/worktree, não um
único assunto para todo o repositório. Se outra conversa trabalhar em objetivo
diferente, ela deve usar branch/worktree e checkpoint próprios registrados em
`docs/agent-memory/workstreams/index.md`. Não sobrescrever `current.md` ou
`current-gate.md` de outro workstream.

### Infraestrutura remota variável

A infraestrutura pode mudar entre AWS, Oracle ou outro provedor. Antes de
qualquer deploy, SSH, cópia ou comando remoto, descobrir no workstream/runbook
vigente o provedor, host, usuário, chave, diretório e processo atuais. Nunca
reutilizar caminho EC2/AWS apenas porque aparece no histórico. Ação remota
continua exigindo autorização explícita.

Daniel concedeu autorização contínua para criar e publicar commits sanitizados
deste projeto no GitHub. Essa autorização não inclui deploy, alteração de
produção, envio de dados privados ou inclusão de segredos.

## Contrato Obrigatório de Comunicação e Capacidade

Antes de iniciar ou retomar qualquer tarefa, a primeira atualização visível ao
usuário deve conter exatamente esta estrutura:

`Superfície → Modelo → Esforço → Próxima tarefa`

Exemplo: `Codex → Sol → Alto → corrigir e revalidar o gate 4D.`

Essa linha deve ser repetida quando uma resposta do usuário abrir a próxima
ação material, mesmo que modelo e esforço não tenham mudado. Não basta informar
apenas o próximo passo.

Antes de enviar toda resposta final ou handoff, executar esta conferência:

1. **Resultado:** o que foi concluído, falhou ou permanece aguardando validação.
2. **Inteligência da decisão:** o que a evidência significa e por que o próximo
   passo é o correto, sem apenas despejar contagens de testes.
3. **Capacidade recomendada:** repetir `Superfície → Modelo → Esforço → Próxima
   tarefa` para a ação seguinte.
4. **Próximo passo:** fornecer a ação concreta, as perguntas exatas ou o gate
   que precisa ser satisfeito.

Se qualquer um dos quatro itens estiver ausente, a resposta ainda não está
pronta para ser enviada. Em testes manuais de WhatsApp, informar também o que
cada pergunta valida e qual resultado é esperado. Esta trava é obrigatória
mesmo em respostas curtas e mesmo quando a única ação seguinte depende de
Daniel.

## Controle de Esforco
Antes de iniciar cada nova tarefa de implementacao, diagnostico, teste, deploy ou revisao substancial, informar a proxima acao e o nivel de esforco recomendado. O Codex determina tecnicamente a recomendacao; nao pede ao usuario que escolha modelo ou esforco. O usuario apenas aplica a configuracao indicada quando ela diferir da atual.

Recomendar sempre a menor capacidade que preserve eficiencia e qualidade para a proxima acao material, sem dimensionar pela extensao total do projeto:

- `Baixo`: resposta, consulta, busca dirigida, edicao mecanica ou documental;
- `Medio`: diagnostico ou implementacao local delimitada, com risco moderado;
- `Alto`: mudanca transversal, causalidade entre modulos ou testes adversariais;
- `Extra Alto`: arquitetura nova, concorrencia critica, seguranca de alto risco, acao irreversivel ou auditoria final exaustiva.

`Extra Alto` e excecao, nao margem preventiva. Nao manter nivel excessivo apenas porque a selecao atual e maior ou porque Daniel ainda nao autorizou uma reducao. Quando a recomendacao diferir da selecao atual, informar a configuracao exata e parar antes da proxima acao material para que Daniel possa ajusta-la; nao perguntar qual nivel ele prefere.

Durante uma tarefa, reavaliar o esforco em cada ponto de decisao relevante. Se o nivel atual se mostrar insuficiente ou excessivo, parar antes da proxima acao material, explicar brevemente o motivo e solicitar a troca. Nao elevar, reduzir ou trocar modelo/esforco automaticamente.

Excecao: somente continuar sem pausa quando o usuario tiver autorizado expressamente uma sequencia de acoes com o mesmo nivel de esforco, ou em incidente urgente cuja continuidade tenha sido autorizada de forma explicita.

## Delegacao para Chat
Sempre que uma tarefa puder ser executada no Chat comum sem acesso ao repositorio, terminal, arquivos locais, testes, GitHub ou producao, recomendar o esforco adequado, fornecer um prompt pronto para uso e parar para aguardar a resposta do usuario. Isso inclui analise, pesquisa, revisao logica, brainstorming, comparacao de alternativas, auditoria documental e redacao.

Usar Codex diretamente somente quando a proxima acao exigir inspecao ou alteracao do repositorio, execucao de comandos/testes, leitura de logs privados, GitHub, EC2, WhatsApp, Google Sheets ou outra ferramenta local/externa. Depois que o usuario trouxer a resposta do Chat, reavaliar o esforco antes de continuar.

Quando o Chat atuar como auditor de codigo ou de evidencias do repositorio, publicar antes no GitHub um commit sanitizado com todos os arquivos necessarios e fornecer ao Chat o hash imutavel e os caminhos exatos. Nao enviar segredos, dados pessoais, arquivos locais de sessao ou alteracoes alheias ao gate. Um veredito baseado apenas em resumo deve ser rotulado como revisao logica de evidencia relatada e nao pode, sozinho, receber o rótulo de verificacao independente dos arquivos.

Para reduzir bloqueios e heranca indevida de contexto em auditorias de repositorio, preferir uma conversa limpa no Chat, prompt curto e defensivo e URLs imutaveis do commit e dos arquivos no GitHub. Exigir que o Chat confirme o hash lido e cite os arquivos antes de aceitar o veredito. Se o conector GitHub nao estiver disponivel, usar os links publicos imutaveis de `github.com` e `raw.githubusercontent.com`; se nenhum caminho abrir, nao aceitar `GO` independente.

Se o envio automatizado ao Chat for bloqueado por um filtro de seguranca, nao insistir nem tentar contornar o bloqueio. Informar que o bloqueio automatico nao constitui, por si so, uma conclusao sobre o usuario ou o projeto; fornecer ao Daniel um prompt pronto, estritamente defensivo e sem segredos; indicar explicitamente a capacidade `Superficie -> Modelo -> Esforco -> Proxima tarefa` que ele deve selecionar no Chat; e parar para aguardar que ele cole a resposta recebida. Para o modelo, recomendar o mais capaz e mais recente que esteja realmente disponivel no seletor da conta, verificando a oferta atual quando ela puder ter mudado, em vez de fixar uma versao antiga. Essa rotina substitui a tentativa automatica apenas naquele gate bloqueado e deve ser aplicada em todas as recorrencias.

O relato de Daniel de que o intersticial apareceu vale como bloqueio confirmado, mesmo que a automacao nao consiga observa-lo no DOM. Em auditoria por GitHub, fazer no maximo uma tentativa automatica por gate imutavel; ao primeiro bloqueio observado pelo Codex ou informado por Daniel, interromper imediatamente. O prompt manual deve ser minimalista e usar linguagem de revisao de testes, consistencia e rastreabilidade, deixando detalhes tecnicos nos arquivos do commit em vez de repeti-los no texto.

## Diretriz Legal/Privacidade Crítica
**Antes de escalar para multiusuário real, remover o acesso admin a gastos de todos os usuários.**

O dashboard admin com seletor `Todos os usuários` existe apenas como exceção temporária de beta/testes para diagnosticar dados presos em usuários de teste. Em produção/multiusuário, administradores não devem ter acesso amplo a lançamentos financeiros individuais por questões legais, LGPD e privacidade.

Qualquer trabalho em dashboard, admin, permissões, multiusuário ou launch deve consultar `docs/decisions/ADR-002-admin-financial-data-access.md` e o checklist de release antes de seguir.

**Administração:**
- Apenas números presentes em `ADMIN_IDS` têm privilégio de admin.
- Em produção/beta atual, `ADMIN_IDS` deve conter apenas Daniel.
- O número da Thaís deve ser tratado como usuário comum/de teste, sem privilégio administrativo.
- Cartões/abas com nome "Thaís" podem continuar existindo como dados financeiros/cartões; isso não concede permissão admin.

**Fluxo multiusuário aprovado:**
- Novo usuário envia mensagem → recebe termos → responde `ACEITO`.
- Após `ACEITO`, o status vira `PENDING_APPROVAL`; o admin é notificado.
- Admin libera com `admin aprovar <telefone>`.
- Usuário aprovado fica em `APPROVED_AWAITING_GOOGLE` até conectar Google.
- Sem conexão Google concluída, o usuário não deve usar fluxos financeiros.
- A planilha financeira final deve ser criada no Drive do próprio usuário.
- Importação de extrato começa apenas com CSV/OFX; PDF/imagem ficam fora do MVP.

---

## Referências Técnicas

- arquitetura e arquivos por domínio: `docs/agent-memory/architecture-map.md`;
- riscos vigentes: `docs/agent-memory/known-issues.md`;
- seleção de testes: `docs/agent-memory/testing-playbook.md`;
- roadmap e fila: arquivos apontados por `docs/agent-memory/current.md`;
- deploy/release: `docs/runbooks/release-checklist.md`.

Não guardar segredos, tokens, chaves, cookies, sessões ou links sensíveis em
documentos, skills, commits ou prompts de auditoria.
