# ARQ-06 — recovery do raciocinador com plano resolvido

Data: 2026-08-23

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

O canário de produção está `off`. Este candidato não autoriza novo artefato,
deploy, reativação, writer ou retirada do baseline vigente.

## Falha real observada

O recovery 319 recebeu `GO TÉCNICO LOCAL`, foi promovido por artefato imutável
na OCI com o canário desligado e manteve PM2, SQLite, WhatsApp e health
local/público saudáveis.

No smoke real, a pergunta `Quais foram os maiores gastos da família neste mês?`
chegou ao raciocinador com plano server-side já completo, `scope=family`, dois
membros autorizados e `source=personal_sheet`. Mesmo assim, o modelo devolveu
`clarify` após duas leituras. O baseline foi preservado e o canário foi
imediatamente revertido para `off` por `SIGHUP`, sem restart ou escrita
financeira.

## Causa e recovery

O prompt não distinguia explicitamente um plano ainda incompleto de um plano
já resolvido pelo servidor. Assim, o modelo podia pedir novamente pessoa,
escopo, período, categoria ou dimensão mesmo quando esses campos já estavam
fixados pela fronteira determinística.

O recovery:

- deriva `resolvedPlan` somente de `trajectory.executedPlan` quando
  `needsContext === false`;
- passa o plano pelo sanitizador já usado para toda evidência enviada ao
  raciocinador;
- instrui a primeira chamada de `query_financial_plan` com o plano exato,
  sem mudar filtros, período, escopo, agrupamento ou base temporal;
- proíbe nova pergunta sobre campos já resolvidos;
- encerra leituras auxiliares quando uma evidência compatível já é suficiente;
- preserva `clarify` quando não existe plano resolvido ou quando
  `needsContext === true` e falta contexto indispensável.

As ferramentas permitidas, a resolução server-side de identidade e fonte, o
limite de leituras, o verificador de adequação, os contadores de efeitos e todas
as superfícies de escrita permanecem inalterados.

## Evidência local

- RED: o prompt não expunha nem vinculava o plano já resolvido;
- GREEN: o teste valida a instrução de plano exato, a proibição de repetir
  perguntas de contexto e o `resolvedPlan` sanitizado integralmente;
- bateria causal de adequação, shadow, canário e agente: `134/134`, zero falha;
- suíte hermética ampla única: `1.815/1.825`, zero falha e dez skips previstos;
- cobertura ampla: linhas `91,71%`, branches `74,57%`, funções `91,19%`;
- workflow versionado e contrato de ambiente: verdes;
- nenhuma nova consulta com dados financeiros reais foi enviada a provedor
  externo durante este recovery.

As contagens são execução local relatada, não execução do auditor.

## Arquivos causais para auditoria

- este documento;
- `src/agent/financialIterativeReasoner.js`;
- `tests/financialIterativeCanary.test.js`.

## Critério de GO

O auditor deve confirmar que `resolvedPlan` só existe para plano confiável já
executado e sem contexto pendente, que a sanitização continua removendo
identidade e segredos, que o modelo não pode escolher usuário, família, fonte
ou writer, que a fronteira legítima de esclarecimento permanece disponível e
que nenhum limite de ferramenta, leitura, efeito ou produção foi ampliado.

Com `GO TÉCNICO LOCAL`, fica autorizado apenas construir e promover um novo
artefato OCI mantendo o canário `off`. A reativação estrita para
`expenses`/`personal_sheet`, a pergunta real, o follow-up, a telemetria terminal
e o health continuam sendo um gate operacional separado com rollback imediato.
