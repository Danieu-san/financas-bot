# Plano — canal permanente Chat ↔ Codex

Status: `ORCH-02 campainha state-aware candidata aguardando auditoria independente`.

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
6. [em andamento] Tarefa 1 publicou `CHAT_READY`; corrigir a campainha que ainda
   apontava a ORCH-01, validar retorno e executar a tarefa 2.

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

Publicar e auditar o recovery da campainha; com GO, atualizar a ponte e concluir
a prova sequencial.
