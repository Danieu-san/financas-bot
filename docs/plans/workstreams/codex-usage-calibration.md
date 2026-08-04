# Plano - calibracao prospectiva de uso do Codex

Status: `CODEX-USAGE-CAL-01 segundo recovery candidato aguardando reauditoria`.

## Objetivo

Criar instrumentacao local minima para as quatro tarefas de calibracao, com
roll-up por objetivo autorizado e sem conteudo de usuario ou ferramenta.

## Base

`1f675b721a8989b8da876f741e3aa0244d6a166e`.

## Escopo

- receptor OTLP/HTTP somente em loopback;
- allowlist de metadados de logs e metricas;
- descarte de prompts, comandos, patches e saidas;
- controle de `objective_id` pelo proprio workflow;
- armazenamento JSONL local fora do Git;
- instalacao reversivel da configuracao OTel com backup;
- testes causais de privacidade, limites e atribuicao.

## Nao escopo

- medir retroativamente tarefas antigas;
- converter duracao ou indicador semanal em tokens;
- enviar telemetria para servico externo;
- instrumentar o runtime do FinancasBot em producao;
- iniciar o RX financeiro antes da validacao deste gate.

## Invariantes

1. O listener aceita conexoes somente de loopback.
2. Payload bruto nunca e persistido.
3. Campos sensiveis sao descartados mesmo quando aninhados.
4. Evento sem `objective_id` ativo e contado, mas nao atribuido a tarefa.
5. Cada evento persistido recebe `event_id` deterministico para roll-up sem
   dupla contagem.
6. Arquivos de telemetria permanecem fora do repositorio.
7. Falha do coletor nao interfere no Codex nem no produto.

## Etapas

1. [concluida] Implementar receptor, sanitizacao e controle de objetivo.
2. [concluida] Implementar instalacao reversivel e configuracao segura.
3. [concluida] Executar RED/focal e bateria causal.
4. [concluida] Validar workflow e revisar o diff.
5. [concluida com NO-GO] Publicar candidato sanitizado e obter auditoria independente.
6. [concluida] Corrigir privacidade, causalidade temporal, junction e rollback.
7. [concluida com NO-GO] Publicar recovery e obter nova auditoria independente.
8. [concluida] Corrigir versoes livres, sobreposicao e comparacao binaria.
9. [em andamento] Publicar segundo recovery e obter reauditoria independente.
10. [pendente] Ativar objetivo e iniciar a calibracao `RX-HIST-SEG-01`.

## Criterios de GO

- teste prova que prompt, comando, patch e saida nao chegam ao JSONL;
- apenas metadados allowlisted sao persistidos;
- payload invalido, grande ou nao loopback falha fechado;
- objective start/stop e event_id sao deterministas;
- instalacao preserva configuracao existente e forca `log_user_prompt=false`;
- testes focais e workflow validator verdes;
- auditoria independente sem lacuna indispensavel.

## Condicoes de parada

- qualquer conteudo privado persistido;
- configuracao global sobrescrita sem backup;
- dependencia externa ou envio para rede nao local;
- necessidade de alterar producao;
- NO-GO independente.

## Proxima acao

Concluir a bateria ampla do workflow, revisar o diff e publicar o recovery
sanitizado para nova auditoria independente por hash imutavel.
