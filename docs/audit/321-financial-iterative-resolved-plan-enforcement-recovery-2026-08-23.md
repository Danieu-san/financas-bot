# ARQ-06 — enforcement determinístico do plano resolvido

Data: 2026-08-23

## Estado

`RECOVERY CANDIDATO AGUARDANDO REAUDITORIA INDEPENDENTE`.

O canário de produção permanece `off`. Este recovery não autoriza novo
artefato, deploy, reativação, writer ou retirada do baseline vigente.

## NO-GO anterior

A auditoria independente do hash `84f58b38...` confirmou a sanitização e a
ausência de ampliação de ferramentas, limites e escrita, mas emitiu `NO-GO`
com um achado alto: a primeira leitura exata e a proibição de esclarecimento
redundante estavam apenas no prompt. `normalizeReasonerDecision` ainda aceitava
`clarify` e um plano alternativo emitido pelo modelo.

## Recovery

O reasoner agora deriva um `resolvedPlan` sanitizado somente quando a trajetória
executada pelo servidor possui `needsContext === false` e impõe duas fases:

1. sem evidência, retorna localmente `query_financial_plan` com o plano exato;
   não reserva orçamento de modelo e não realiza chamada externa;
2. após qualquer evidência, consulta o modelo apenas para compor a resposta e
   aceita exclusivamente `action=answer`; `clarify`, ferramentas adicionais,
   plano divergente e qualquer outra ação falham fechado.

Sem plano resolvido, o comportamento anterior permanece: `clarify` continua
disponível quando ainda falta contexto indispensável. A fachada semântica ainda
injeta identidade, família, owner e fonte exclusivamente no servidor. O limite
de três leituras, o verificador de adequação, os contadores de efeito e todas as
superfícies de escrita permanecem inalterados.

## Evidência local

- RED: com plano resolvido, o modelo conseguiu devolver `clarify` e substituir
  a primeira leitura esperada;
- GREEN: a primeira decisão é o plano exato sanitizado, com zero chamadas ao
  modelo;
- controle negativo: após evidência, `clarify` é rejeitado;
- controle negativo: após evidência, ferramenta com escopo divergente é
  rejeitada;
- controle positivo: plano com `needsContext=true` ainda aceita esclarecimento;
- identificador privado inserido no plano de teste não aparece na decisão nem
  no prompt enviado;
- bateria causal de adequação, shadow, canário e agente: `134/134`, zero falha;
- suíte hermética ampla única: `1.815/1.825`, zero falha e dez skips previstos;
- cobertura ampla: linhas `91,74%`, branches `74,72%`, funções `91,20%`;
- rede e subprocessos externos foram bloqueados pelo runner amplo;
- workflow versionado e contrato de ambiente: verdes.

As contagens são execução local relatada, não execução do auditor.

## Arquivos causais para reauditoria

- este documento;
- `src/agent/financialIterativeReasoner.js`;
- `tests/financialIterativeCanary.test.js`.

## Critério de GO

O auditor deve confirmar que a primeira ferramenta e seu plano não dependem do
modelo quando o plano server-side está resolvido, que o plano é sanitizado, que
nenhuma decisão `clarify` ou `tool` posterior é aceita nesse ramo, que a
clarificação legítima do ramo não resolvido permanece funcional e que nenhuma
fronteira de identidade, fonte, leitura, efeito ou escrita foi ampliada.

Com `GO TÉCNICO LOCAL`, fica autorizado apenas construir e promover um novo
artefato OCI mantendo o canário `off`. A reativação estrita, a pergunta real, o
follow-up, a telemetria terminal e o health continuam sendo gate operacional
separado com rollback imediato.
