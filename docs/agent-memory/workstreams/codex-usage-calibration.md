# Estado - calibracao prospectiva de uso do Codex

Atualizado em: 2026-08-03

## Objetivo

Instrumentar as proximas quatro tarefas reais do FinancasBot para medir custo
por objetivo aceito sem registrar conteudo privado.

## Estado

`CODEX-USAGE-CAL-01 PROVA DE ADOPTION CANDIDATA AGUARDANDO REAUDITORIA`.

A pesquisa documental confirmou que o Codex pode exportar telemetria OTel com
identidade de conversa, modelo, effort, duracao, ferramentas, compactacoes,
subagentes e tokens por turno. O coletor local deve reter somente metadados
allowlisted e vincula-los ao `objective_id` ativo.

O candidato esta em `scripts/agent/codexTelemetryCollector.js`, com operacao por
`scripts/agent/Manage-CodexUsageTelemetry.ps1`. A configuracao global foi
instalada com backup e exige reinicio do Codex para a primeira observacao real.
O coletor permanece local; nenhum evento sintetico vale como prova de emissao
do processo Codex.

O hash `682fd9546a9eeee1d15a4f6e15165b2a6e303cc9` recebeu NO-GO
independente: strings allowlisted ainda podiam conservar identidade, o
`event_id` dependia do objetivo vigente no recebimento, a atribuicao nao usava
intervalos temporais, junctions nao eram resolvidos fisicamente e nao havia
rollback executavel da configuracao.

O primeiro recovery `a3c6134a8a861daa42e0de9d4cd34c538684f171`
tambem recebeu NO-GO: versoes ainda aceitavam sufixo livre, comparacoes de
rollback eram textuais e sobreposicoes do mesmo objetivo eram colapsadas. O
segundo recovery remove versoes da persistencia, compara configuracao e backup
em bytes e conta cada janela concorrente antes de atribuir.

O segundo recovery `ee3cff39c212a69c7c62231a5f7551c9fdb5da65`
recebeu NO-GO somente por ausencia de prova executavel da trilha
`adopted_existing`. O codigo de produto nao foi alterado: dois testes agora
acionam o manager real e cobrem a adocao positiva e a recusa binaria por BOM.

## Evidencia local

- RED inicial confirmou ausencia do modulo antes da implementacao;
- 18 de 18 testes focais verdes no candidato de prova de adoption;
- syntax check de JavaScript e parse de PowerShell verdes;
- instalacao temporaria provou backup, bloco OTel e prompt desligado;
- listener operacional respondeu saudavel somente em loopback;
- nove eventos OTel reais `codex.api_request`, todos nao atribuidos, com zero
  identificador bruto e somente chaves sanitizadas;
- instalacao real reconheceu o backup original sem reescrever a configuracao e
  deixou rollback gerenciado disponivel;
- teste de adoption remove somente o estado de instalacao, executa novo
  `Install`, exige `adopted_existing=true` e configuracao byte-identica;
- teste adversarial altera somente o BOM do backup, exige recusa, configuracao
  byte-identica e ausencia de novo estado de instalacao;
- workflow validator verde como bateria ampla final do candidato.

## Limites

- nunca registrar prompt, comando, patch, resultado de ferramenta ou mensagem;
- nunca registrar segredo, dado financeiro ou identificador de usuario do bot;
- indicador semanal agregado nao sera atribuido a uma tarefa;
- ausencia de metrica vira `NAO_DISPONIVEL`, nunca zero;
- telemetria fica fora do Git em armazenamento local privado;
- nenhuma mudanca de produto, OCI, WhatsApp, Pluggy ou planilha pertence a este
  workstream.

## Proxima acao

Revisar e publicar o candidato de prova de adoption em hash imutavel e obter
reauditoria independente. Somente depois do GO iniciar a primeira tarefa real
de calibracao.

## Capacidade

`Codex -> Sol -> Medio -> publicar e reauditar a prova causal de adoption.`
