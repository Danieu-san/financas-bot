# Próximo gate — STATE-01

Atualizado em: 2026-07-22

Commit de partida previsto: fechamento documental posterior ao candidato
`4c1001338ca1ed919b55be4e9566258178a0175e`.

## Estado anterior

`FLOW-03` recebeu `GO TÉCNICO LOCAL` independente no commit imutável
`4c1001338ca1ed919b55be4e9566258178a0175e`. O Chat confirmou o hash, leu os
quatro arquivos exigidos e não encontrou achado bloqueante ou lacuna causal
indispensável. Evidência local: scheduler `23/23`, bateria afetada `279/279` e
runner principal do `npm test` `1.068/1.068`, além dos pretests verdes.

## Próximo objetivo já ordenado

Tratar `STATE-01`, item 8 do relatório exaustivo: mensagens do mesmo remetente
podem avançar concorrentemente a máquina de estado e disputar os mesmos efeitos.

## Objetivo

Definir e implementar serialização causal por remetente, preservando paralelismo
entre remetentes diferentes, deduplicação e recuperação segura após falhas.

## Escopo

- mapear entrypoints, máquina de estado, confirmações e writers afetados;
- corrigir somente os caminhos causais de `STATE-01`;
- adicionar testes adversariais com duas mensagens simultâneas do mesmo remetente;
- preservar a ordem da fila da auditoria.

## Não escopo

- deploy, EC2/Oracle, Google/WhatsApp real ou mudança de flags;
- implementação do fluxo Pluggy de proposição de salvamento;
- `FLOW-04`, outbox do scheduler, logs globais e snapshot;
- remoção ampla de legado, dashboard/admin ou expansão multiusuário.

Antes de implementar:

1. mapear cada job, leitura, writer e resolução de planilha afetados;
2. definir os invariantes causais e os testes adversariais do gate;
3. preservar fora do escopo deploy, EC2/Oracle e serviços reais;
4. consultar novamente ADR-002 e o checklist se o mapa tocar dashboard, admin,
   permissões ou expansão multiusuário.

## Trava antes do mapeamento

`STATE-01` é concorrência crítica sobre estado e efeitos financeiros. O nível
mínimo suficiente é `Extra Alto`; nenhuma inspeção ou alteração material desse
gate deve começar enquanto o Codex permanecer em `Alto`.

Os invariantes, riscos, testes causais e critérios de GO serão fixados somente
depois do mapeamento no nível correto. O fechamento continuará exigindo commit
sanitizado no GitHub e auditoria independente obrigatória no Chat.

## Condições de parada

- necessidade de reduzir ou trocar capacidade;
- ampliação de escopo ou mudança da ordem já decidida;
- acesso a produção, cofre, EC2/Oracle, Google ou WhatsApp real;
- conflito com alterações concorrentes do workstream AWS/Oracle.

## Capacidade

`Codex → Sol → Extra Alto → mapear e corrigir STATE-01 sem deploy.`
