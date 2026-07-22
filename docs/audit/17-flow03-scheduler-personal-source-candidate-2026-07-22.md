# FLOW-03 — candidato para auditoria independente

Data: 2026-07-22

## Estado

`CANDIDATO AGUARDANDO AUDITORIA NO CHAT`. Este documento não concede `GO`, não
autoriza deploy e não afirma validação de produção.

## Base e escopo

- base: `c1436b89df2d4a13d5cf26f562d42b9cfc5dc56e`;
- objetivo: impedir que jobs financeiros do scheduler usem a planilha central
  quando o contrato exige a planilha pessoal do usuário;
- produto: `src/jobs/scheduler.js`;
- prova causal: `tests/schedulerJobs.test.js`;
- regras/checkpoint: `AGENTS.md`, `docs/agent-memory/current.md` e
  `docs/plans/current-gate.md`.

O hash do candidato será preenchido pela identidade do próprio commit publicado;
as URLs de auditoria devem usar esse hash completo, nunca `main`.

## Invariantes avaliados

1. Toda leitura financeira agendada fornece o `userId` resolvido.
2. `requireUserScoped: true` impede fallback silencioso para a fonte central.
3. `telemetryConsumer: scheduler` preserva rastreabilidade do consumidor.
4. O modo legado de cartões muda apenas o schema, não o escopo da fonte.
5. Dados centrais proibidos não aparecem nos resultados enviados ao usuário.

## Mudança

`buildScheduledUserReadOptions` centraliza o contrato de leitura pessoal. Os
jobs de contas próximas, resumo matinal, resumo noturno e relatório mensal
passaram a ler por usuário ativo. A rota unificada e o fallback de schema legado
dos cartões usam o mesmo contrato fail-closed.

## Evidência executada

- antes da correção, dois testes novos falharam ao selecionar fixtures centrais;
- `tests/schedulerJobs.test.js`: `23/23`;
- bateria afetada: `279/279`;
- `npm test`: pretests verdes e runner principal `1.068/1.068`;
- sintaxe dos módulos alterados: verde;
- `git diff --check`: verde.

A auditoria externa será estática: ela deve confirmar hash e arquivos lidos,
examinar se todos os reads financeiros do scheduler passam pelo contrato
pessoal e verificar se os testes distinguem fonte pessoal de central. Ela não
deve alegar ter reproduzido as execuções locais.

## Limites e riscos residuais declarados

- a falha de um usuário ainda pode abortar o lote do job; isso é `FLOW-04`, não
  deve ser ocultado nem ampliado neste gate;
- não houve Google, WhatsApp, EC2/Oracle, produção, mudança de flags ou deploy;
- alterações concorrentes do workstream AWS/Oracle e arquivos não rastreados do
  usuário ficam fora do commit.

## Critério de fechamento

Somente um parecer independente do Chat que confirme o hash imutável, cite os
arquivos lidos e não encontre achado bloqueante ou lacuna causal indispensável
pode permitir o fechamento local. O executor deve confrontar o parecer com a
evidência antes de registrar `GO`.
