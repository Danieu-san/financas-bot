# Próximo gate — FLOW-03

Atualizado em: 2026-07-22

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

## Condições de parada

- necessidade de reduzir ou trocar capacidade;
- ampliação de escopo ou mudança da ordem já decidida;
- acesso a produção, cofre, EC2/Oracle, Google ou WhatsApp real;
- conflito com alterações concorrentes do workstream AWS/Oracle.

## Capacidade

`Codex → Sol → Extra Alto → mapear e corrigir FLOW-03 sem deploy.`
