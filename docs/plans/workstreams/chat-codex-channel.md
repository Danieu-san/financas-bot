# Plano — canal permanente Chat ↔ Codex

Status: `ORCH-02 segundo recovery pós-NO-GO em candidato local; instalação isolada pendente`.

## Objetivo

Converter a prova ORCH-01 em um serviço reutilizável de tarefas de repositório,
sem manter modelo ocioso e sem encerrar o canal ao concluir um trabalho.

## Etapas

1. [concluída] Separar o gate ORCH-01 terminal do novo estado operacional.
2. [concluída] Definir manifesto de tarefa fechado e caminhos exatos.
3. [concluída] Generalizar prompt e publicador do watcher.
4. [em andamento] Candidato amplo `62/62` verde; NO-GO nominal de segredos
   corrigido; bateria causal pós-achado `30/30` verde; reauditar recovery.
5. [concluída] Reauditoria do recovery em GO; watcher instalado e ociosidade
   comprovada sem novo lançamento de modelo.
6. [em andamento] Tarefa 1 publicou `CHAT_READY`; campainha state-aware pronta;
   NO-GO de incompatibilidade config-v1/v2 corrigido; reauditar e executar a
   tarefa 2.
7. [concluída] Congelar o desenho funcional
   `Chat -> GitHub -> watcher -> Codex App`; o recovery posterior limita-se à
   sincronização e ao preflight da instalação operacional, sem trocar o fluxo.
8. [concluída] Provar em PoC isolado que o widget MCP `v7` envia a campainha
   após o turno originador e cria nova resposta no Chat sem clique.
9. [concluída] Substituir o túnel temporário por Secure MCP Tunnel oficial,
   mantendo o servidor local restrito a `127.0.0.1:3210` e embutindo o SDK.
10. [em andamento] Executar um único smoke no app definitivo.
11. [pendente de autorização específica] Instalar watchdog no logon do Windows
    e comprovar recuperação dos processos sem iniciar modelo.
12. [em reauditoria] Isolar o watcher num clone exclusivo, validar origem,
    branch fixa, revisão e runtime físico, tornar `failed:sync_error` recuperável e
    repetir o preflight de tracked/untracked/ignored imediatamente antes do App
    ou CLI.

O Chat editará um manifesto-slot preexistente em commit inerte e depois o
estado em commit separado; isso respeita a limitação observada do conector sem
perder a ordenação causal.

## Critérios de GO

- `CHAT_WORKING` ocioso não inicia Codex;
- novo hash `CODEX_READY` inicia exatamente uma execução;
- tarefa inválida falha antes do modelo;
- Codex só pode publicar estado, resultado e caminhos autorizados;
- alterações sensíveis, extras ou destrutivas falham fechadas;
- duas tarefas diferentes completam no mesmo canal;
- entre tarefas, o canal volta a `CHAT_WORKING` e continua armado;
- retorno Browser continua sendo somente campainha; GitHub é a autoridade.

## Não escopo

- produção ou dados privados;
- execução automática via Codex App privilegiado;
- paralelismo de tarefas;
- fila com mais de um trabalho simultâneo;
- cobrança por API ou modelo mantido em espera.

## Próxima ação

Publicar e auditar o recovery, provisionar o clone dedicado, reinstalar o
watcher e deixar a tarefa `FIN-AUDIT-PRE-ROADMAP-RETRY-20260826` completar uma
única vez. Confirmar `CHAT_READY` e retorno ao Chat sem reabrir o escopo.
