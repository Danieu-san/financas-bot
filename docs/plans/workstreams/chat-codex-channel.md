# Plano — canal permanente Chat ↔ Codex

Status: `ORCH-02 recovery candidato aguardando reauditoria independente`.

## Objetivo

Converter a prova ORCH-01 em um serviço reutilizável de tarefas de repositório,
sem manter modelo ocioso e sem encerrar o canal ao concluir um trabalho.

## Etapas

1. [concluída] Separar o gate ORCH-01 terminal do novo estado operacional.
2. [concluída] Definir manifesto de tarefa fechado e caminhos exatos.
3. [concluída] Generalizar prompt e publicador do watcher.
4. [em andamento] Candidato amplo `62/62` verde; NO-GO nominal de segredos
   corrigido; bateria causal pós-achado `30/30` verde; reauditar recovery.
5. [pendente] Instalar o watcher apontando ao canal permanente.
6. [pendente] Provar duas tarefas sequenciais e retorno ocioso.

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

Publicar e reauditar o recovery por hash; com GO, executar a prova sequencial.
