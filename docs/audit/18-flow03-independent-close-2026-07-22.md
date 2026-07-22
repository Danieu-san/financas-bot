# FLOW-03 — fechamento independente

Data: 2026-07-22

## Veredito

`GO TÉCNICO LOCAL` para `FLOW-03` no commit imutável
`4c1001338ca1ed919b55be4e9566258178a0175e`.

Esse GO não autoriza deploy, produção, Google/WhatsApp real ou mudança de flags.

## Evidência do executor

- dois testes causais novos falharam antes da implementação ao consumir a fonte
  central proibida;
- `tests/schedulerJobs.test.js`: `23/23`;
- bateria afetada: `279/279`;
- `npm test`: pretests verdes e runner principal `1.068/1.068`;
- sintaxe, `git diff --check` e varredura de segredos: verdes;
- nenhuma alteração do workstream AWS/Oracle entrou no candidato.

## Auditoria obrigatória no Chat

O Chat confirmou o hash completo e declarou ter lido, nesse hash:

- `docs/audit/17-flow03-scheduler-personal-source-candidate-2026-07-22.md`;
- `src/jobs/scheduler.js`;
- `tests/schedulerJobs.test.js`;
- `src/services/google.js`.

Veredito externo: `GO TÉCNICO LOCAL`. Nenhum achado `CRITICAL`, `HIGH` ou
`MEDIUM`; nenhuma lacuna indispensável residual dentro de `FLOW-03`.

O auditor considerou os testes causais consistentes porque os mocks distinguem
`userId:range` das fontes centrais, usam dados pessoais e centrais conflitantes
e verificam o contrato de escopo. Também confirmou que o fallback legado de
cartões altera schema, não a fonte pessoal.

## Confronto do executor

O parecer é compatível com o diff e com a execução local: todos os sete pontos
de leitura financeira do scheduler identificados no mapa recebem opções
produzidas por `buildScheduledUserReadOptions`, que fixa `userId`,
`requireUserScoped: true` e `telemetryConsumer: scheduler`. O contrato em
`src/services/google.js` rejeita resolução central quando a leitura exige fonte
pessoal.

O parecer externo foi estático, não reproduziu testes nem avaliou ambiente real.
Isso não reduz o GO local porque a execução foi feita pelo Codex e a inspeção
independente confirmou o desenho e a causalidade sem assumir as contagens.

## Limites preservados

- falha de um usuário ainda pode abortar o lote; permanece `FLOW-04` P2;
- produção, deploy, EC2/Oracle, Google e WhatsApp real não foram acessados;
- o bot familiar privado do casal e as regras de privacidade permanecem iguais.

## Próximo gate

`STATE-01`, serialização por remetente. Por envolver concorrência crítica sobre
estado e efeitos financeiros, exige `Codex → Sol → Extra Alto` antes do
mapeamento ou da implementação.
