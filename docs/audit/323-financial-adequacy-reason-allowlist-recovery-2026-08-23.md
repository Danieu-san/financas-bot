# ARQ-06 — allowlist fechada do motivo de adequação

Data: 2026-08-23

## Estado

`RECOVERY CANDIDATO AGUARDANDO REAUDITORIA INDEPENDENTE`.

O canário de produção permanece `off`. Este recovery não autoriza artefato,
deploy, ativação, writer ou smoke antes de `GO TÉCNICO LOCAL`.

## NO-GO anterior

A auditoria independente do hash
`c9a4a2a9b0daabb7eca7396a1bd3f6ff441a2dea` confirmou a semântica de ranking,
a preservação de `trend/group`, os bloqueios numéricos e a ausência de ampliação
de escopo. O veredito foi `NO-GO` por um achado alto de privacidade:
`sanitizeReasonCode` validava somente o formato `snake_case`, permitindo que
uma identidade já nesse formato atravessasse o JSONL, e o handler aplicava
sanitização genérica novamente sobre o motivo bruto antes do log.

## Recovery

`sanitizeReasonCode` agora aceita exclusivamente a allowlist fechada dos
códigos produzidos por `resultVerifier` e
`financialEvidenceAdequacyVerifier`, além dos estados operacionais mínimos
`none`, `unknown`, `unavailable` e `contained_error`. Qualquer texto ou código
desconhecido, inclusive um identificador já em `snake_case`, vira `unknown`.

O construtor de telemetria sanitiza o motivo antes de expô-lo. O handler aplica
o mesmo sanitizador como defesa adicional, usa esse único valor no registro
JSONL, no log e no envelope terminal e nunca volta a ler o motivo bruto para
qualquer sink. A allowlist é fail-closed para códigos futuros: até serem
explicitamente reconhecidos, aparecem somente como `unknown`.

Também foi acrescentado o controle regressivo explícito que comprova que
`operation=group` ainda exige a lista completa e ordenada. O contrato de
prefixo de `rank`, os bloqueios de valores/percentuais/contagens, identidade,
owner, família, planilha, fonte, plano, leituras, efeitos e writers permanecem
inalterados.

## Evidência local

- RED: `private_user` atravessava o construtor, o JSONL e o log;
- GREEN: `private_user` vira `unknown` nos três pontos;
- controle positivo: `wrong_result_order` permanece visível como código
  técnico conhecido;
- controle de sink: o log contém `adequacy_reason=unknown` e não contém a
  identidade simulada;
- controle de regressão: `group` completo em ordem passa, omissão e inversão
  falham com `wrong_result_order`;
- bateria causal: `149/149`, zero falha;
- suíte hermética ampla única do recovery: `1.819/1.829`, zero falha e dez
  skips previstos;
- cobertura: linhas `91,75%`, branches `74,73%`, funções `91,21%`;
- runner amplo local, com rede e subprocessos externos bloqueados.

As contagens são execução local relatada, não execução do auditor.

## Arquivos causais para reauditoria

- este documento;
- `docs/audit/322-financial-ranking-prefix-and-adequacy-telemetry-recovery-candidate-2026-08-23.md`;
- `src/agent/resultVerifier.js`;
- `src/agent/financialIterativeReasoner.js`;
- `src/agent/financialIterativeCanary.js`;
- `src/agent/financialIterativeCanaryTelemetry.js`;
- `src/handlers/messageHandler.js`;
- `tests/financialAgent.test.js`;
- `tests/financialIterativeCanary.test.js`;
- `tests/financialIterativeCanaryTelemetry.test.js`.

## Critério de GO

O auditor deve confirmar que nenhuma string arbitrária compatível com
`snake_case` atravessa telemetria ou log, que ambos usam o mesmo código
allowlisted, que códigos desconhecidos falham para `unknown`, que o ranking e
os bloqueios numéricos do recovery 322 permanecem corretos e que `trend/group`
continuam no ramo exaustivo anterior.

Com `GO TÉCNICO LOCAL`, fica autorizado apenas construir e promover novo
artefato OCI mantendo o canário `off`. Ativação estrita, pergunta base,
follow-up familiar, telemetria terminal e health permanecem gate operacional
separado com rollback imediato.
