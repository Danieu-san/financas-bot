# Plano — canal permanente Chat ↔ Codex

Status: `ORCH-02 recovery App-only em candidato local após NO-GO independente`.

## Objetivo

Manter um serviço reutilizável de tarefas de repositório estritamente no sentido
`Chat -> GitHub -> watcher -> Codex App`, sem fallback CLI e sem modelo ocioso.
Ao encerrar, o Codex pede a Daniel que mande o Chat verificar o GitHub, sem
alegar que o push foi confirmado.

## Etapas

1. [concluída] Separar o gate ORCH-01 terminal do novo estado operacional.
2. [concluída] Definir manifesto de tarefa fechado e caminhos exatos.
3. [concluída] Generalizar prompt e publicador do watcher.
4. [concluída] Candidato amplo `62/62` verde; NO-GO nominal de segredos
   corrigido; bateria causal pós-achado `30/30` verde e recovery reauditado.
5. [concluída] Reauditoria do recovery em GO; watcher instalado e ociosidade
   comprovada sem novo lançamento de modelo.
6. [concluída] Tarefa 1 publicou `CHAT_READY`; incompatibilidade config-v1/v2
   corrigida e reauditada antes da tarefa 2.
7. [concluída] Congelar o desenho funcional
   `Chat -> GitHub -> watcher -> Codex App`; o recovery posterior limita-se à
   sincronização e ao preflight da instalação operacional, sem trocar o fluxo.
8. [histórico; rota cancelada] O PoC MCP provou envio assistido, não autonomia
   operacional sem confirmação presencial.
9. [histórico; fora da rota] O Secure MCP Tunnel não participa do canal vigente.
10. [candidato aguardando auditoria] Primeiro candidato recebeu NO-GO; o
    recovery fecha aviso não causal, bypass do request local, fallback CLI e
    corrida interprocesso. Bateria causal completa `64/64` verde; falta
    reauditar um único hash imutável.
11. [pendente de autorização específica] Instalar watchdog no logon do Windows
    e comprovar recuperação dos processos sem iniciar modelo.
12. [concluída] Isolar o watcher num clone exclusivo, validar origem,
    branch fixa, revisão e runtime físico, tornar `failed:sync_error` recuperável e
    repetir o preflight de tracked/untracked/ignored imediatamente antes do App.

O Chat editará um manifesto-slot preexistente em commit inerte e depois o
estado em commit separado; isso respeita a limitação observada do conector sem
perder a ordenação causal.

## Critérios de GO

- `CHAT_WORKING` ocioso não inicia Codex;
- novo hash `CODEX_READY` inicia exatamente uma execução;
- tarefa inválida falha antes do modelo;
- Codex App só pode publicar estado, resultado e caminhos autorizados;
- alterações sensíveis, extras ou destrutivas falham fechadas;
- duas tarefas diferentes completam no mesmo canal;
- entre tarefas, o Chat devolve o canal a `CHAT_WORKING` depois que Daniel pede
  a leitura do resultado;
- `CHAT_READY` não inicia Codex, Browser, MCP ou outro modelo;
- ausência de configuração App falha fechado e nunca inicia CLI;
- request local não escolhe clone, Git, branch, state path ou task_id;
- a ponte revalida no GitHub o hash e `CODEX_READY` antes do IPC;
- duas instâncias concorrentes não iniciam duas tarefas para o mesmo request;
- a tarefa termina com aviso que pede verificação, sem afirmar publicação remota;
- GitHub continua sendo a autoridade do resultado.

## Não escopo

- produção ou dados privados;
- execução automática via Codex App privilegiado;
- paralelismo de tarefas;
- fila com mais de um trabalho simultâneo;
- cobrança por API ou modelo mantido em espera.

## Próxima ação

Publicar e reauditar o recovery. Com GO, reinstalar o watcher no clone dedicado
e executar um único smoke marker-only, confirmando `CHAT_READY`, ausência de
pedido de retorno e CLI, e aviso final não afirmativo na tarefa do Codex.
