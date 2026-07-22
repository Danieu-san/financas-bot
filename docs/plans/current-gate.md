# Próximo gate — FLOW-03

Atualizado em: 2026-07-22

Commit de partida: `c1436b89df2d4a13d5cf26f562d42b9cfc5dc56e`.

## Estado anterior

`AUTH-03/WGL-07` foi encerrado com `GO TÉCNICO LOCAL` no commit imutável
`2d0092da691985bf945c35d7041b5ef4e2d2fd1d`. A revisão independente confirmou
o hash e os arquivos exigidos, sem achado `CRITICAL`, `HIGH` ou `MEDIUM` e sem
lacuna causal indispensável.

Evidência local do executor: ensaios causais `21/21`, prova negativa `4/4`,
bateria focal ampliada `399/399` e runner principal do `npm test` `1.066/1.066`,
além dos pretests verdes. O parecer externo foi estático e não reproduziu esses
testes.

## Próximo objetivo já ordenado

Tratar `FLOW-03`, item 7 do relatório exaustivo: parte do scheduler ainda lê a
planilha central enquanto os writers financeiros usam planilhas pessoais.

## Objetivo

Unificar a resolução de fonte financeira do scheduler com o escopo pessoal já
usado pelos writers, sem introduzir fallback silencioso para a planilha central.

## Escopo

- mapear jobs, leitores, writers e resolução de planilha afetados;
- corrigir somente os caminhos causais de `FLOW-03`;
- adicionar testes adversariais de escopo, indisponibilidade e ausência real;
- preservar a ordem da fila da auditoria.

## Não escopo

- deploy, EC2/Oracle, Google/WhatsApp real ou mudança de flags;
- implementação do fluxo Pluggy de proposição de salvamento;
- remoção ampla de legado, dashboard/admin ou expansão multiusuário.

Antes de implementar:

1. mapear cada job, leitura, writer e resolução de planilha afetados;
2. definir os invariantes causais e os testes adversariais do gate;
3. preservar fora do escopo deploy, EC2/Oracle e serviços reais;
4. consultar novamente ADR-002 e o checklist se o mapa tocar dashboard, admin,
   permissões ou expansão multiusuário.

## Critérios de GO

- nenhum job financeiro lê escopo central quando o contrato exige planilha
  pessoal;
- indisponibilidade de uma fonte pessoal não vira zero nem fallback central;
- scheduler e writers resolvem o mesmo usuário e a mesma fonte financeira;
- testes focais e afetados passam sem tocar serviços reais;
- diff permanece sanitizado e sem arquivos do workstream AWS/Oracle.

## Invariantes

1. Toda leitura financeira agendada para usuário ativo informa `userId`.
2. A leitura exige fonte pessoal; falha de resolução nunca cai na central.
3. Vazio real na fonte pessoal continua vazio, sem misturar usuários.
4. Lembretes, manhã e relatório mensal usam a mesma fonte dos writers.
5. O rollback de cartão pode escolher schema legado, mas não escopo central.

## Riscos

- abortar o lote inteiro quando uma fonte pessoal falhar, tratado depois por
  `FLOW-04` e não mascarado neste gate;
- linhas legadas sem `user_id`, preservadas apenas pelo fallback de usuário
  único já existente;
- confundir fallback de schema de cartão com fallback de escopo central.

## Etapas e testes

1. criar RED causal para manhã, contas e relatório mensal sem leitura central;
2. aplicar escopo pessoal obrigatório em cada leitura financeira;
3. executar `tests/schedulerJobs.test.js`;
4. executar baterias afetadas de Google, read-model e lifecycle;
5. executar uma única suíte ampla quando o gate estiver estável;
6. publicar commit sanitizado e obter revisão independente antes do fechamento.

## Evidência executada do candidato

- RED causal: os novos cenários de manhã e contas expuseram a leitura central
  antes da implementação;
- scheduler focal: `23/23`;
- bateria afetada (scheduler, Google, lifecycle, read-model e prova negativa):
  `279/279`;
- `npm test`: pretests verdes e runner principal `1.068/1.068`;
- `node --check` nos dois arquivos JavaScript alterados e `git diff --check`:
  verdes.

O candidato ainda depende de commit imutável no GitHub e auditoria independente
no Chat. Até lá, não recebe `GO` nem pode ser declarado pronto.

## Condições de parada

- necessidade de reduzir ou trocar capacidade;
- ampliação de escopo ou mudança da ordem já decidida;
- acesso a produção, cofre, EC2/Oracle, Google ou WhatsApp real;
- conflito com alterações concorrentes do workstream AWS/Oracle.

## Capacidade

`Codex → Sol → Alto → publicar e auditar o candidato FLOW-03 sem deploy.`
