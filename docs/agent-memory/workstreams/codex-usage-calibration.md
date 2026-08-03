# Estado - calibracao prospectiva de uso do Codex

Atualizado em: 2026-08-03

## Objetivo

Instrumentar as proximas quatro tarefas reais do FinancasBot para medir custo
por objetivo aceito sem registrar conteudo privado.

## Estado

`CODEX-USAGE-CAL-01 CANDIDATO LOCAL AGUARDANDO AUDITORIA`.

A pesquisa documental confirmou que o Codex pode exportar telemetria OTel com
identidade de conversa, modelo, effort, duracao, ferramentas, compactacoes,
subagentes e tokens por turno. O coletor local deve reter somente metadados
allowlisted e vincula-los ao `objective_id` ativo.

O candidato esta em `scripts/agent/codexTelemetryCollector.js`, com operacao por
`scripts/agent/Manage-CodexUsageTelemetry.ps1`. A configuracao global foi
instalada com backup e exige reinicio do Codex para a primeira observacao real.
O coletor permanece local; nenhum evento sintetico vale como prova de emissao
do processo Codex.

## Evidencia local

- RED inicial confirmou ausencia do modulo antes da implementacao;
- 7 de 7 testes focais verdes;
- syntax check de JavaScript e parse de PowerShell verdes;
- instalacao temporaria provou backup, bloco OTel e prompt desligado;
- listener operacional respondeu saudavel somente em loopback;
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

Executar a bateria ampla final, revisar o diff, publicar o hash imutavel e obter
auditoria independente. Depois do GO, reiniciar o Codex e confirmar eventos
reais antes de iniciar a primeira tarefa de calibracao.

## Capacidade

`Codex -> Sol -> Medio -> publicar e auditar o candidato local privado.`
