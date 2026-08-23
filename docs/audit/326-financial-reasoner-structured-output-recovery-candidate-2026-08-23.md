# ARQ-06 — recovery de saída estruturada do reasoner

Data: 2026-08-23

## Estado

`RECOVERY CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

O canário de produção permanece `off`. Este recovery não autoriza artefato,
deploy, ativação ou novo smoke antes de `GO TÉCNICO LOCAL`.

## Falha observada

O hash 324 eliminou a ambiguidade de timeout. Com a janela de 30 segundos, a
única pergunta base executou a primeira leitura determinística, mas o reasoner
retornou uma decisão incompatível com o protocolo local. A telemetria fechada
registrou `reasoner_invalid_decision`, uma leitura e zero efeitos. O conteúdo
bruto do provedor não foi registrado nem reutilizado.

O request anterior apenas instruía em texto que a resposta fosse JSON. Depois
de uma leitura de plano resolvido, o kernel aceita somente `answer`; JSON
malformado, `clarify` ou nova `tool` falham fechado no mesmo código.

## Recovery

O request passa a usar o recurso oficial de Structured Outputs do OpenRouter:
<https://openrouter.ai/docs/guides/features/structured-outputs>.

Quando há plano resolvido e evidência, `response_format` exige JSON Schema
estrito com exatamente:

- `action`, limitado a `answer`;
- `answer`, string obrigatória;
- nenhuma propriedade adicional.

Também é enviado `provider.require_parameters=true`, impedindo roteamento para
um provider que ignore silenciosamente o parâmetro. Em contexto ainda não
resolvido, `response_format=json_object` preserva o fluxo existente de
`tool/clarify`; a validação determinística local continua sendo a autoridade.

Não há retry novo. Timeout, orçamento, prompt sanitizado, família, owner,
`personal_sheet`, domínio, plano, três leituras, adequação, telemetria, baseline,
efeitos, adapters e writers não foram alterados.

## Evidência local

- request pós-leitura contém schema `strict=true`, action `answer` por enum,
  answer obrigatória e `additionalProperties=false`;
- request ainda ambíguo preserva `json_object`;
- ambos exigem provider compatível com os parâmetros;
- `clarify` após evidência continua rejeitado pelo kernel;
- fluxo legítimo de `clarify` sem plano resolvido continua aceito;
- segredo, identidade e `user_id` permanecem ausentes do request capturado;
- focal: `34/34`, zero falha;
- bateria causal: `142/142`, zero falha;
- suíte hermética ampla única: `1.820/1.830`, zero falha e dez skips previstos;
- cobertura: linhas `91,77%`, branches `74,76%`, funções `91,22%`;
- runner amplo local, com rede e subprocessos externos bloqueados.

As contagens são execução local relatada, não execução do auditor. Nenhuma
completion externa foi usada para validar este candidato.

## Arquivos causais para auditoria

- este documento;
- `docs/audit/324-financial-iterative-reasoner-timeout-recovery-candidate-2026-08-23.md`;
- `docs/audit/325-financial-reasoner-timeout-independent-production-close-2026-08-23.md`;
- `src/agent/financialIterativeReasoner.js`;
- `src/agent/financialIterativeShadowAgent.js`;
- `src/agent/financialIterativeCanary.js`;
- `src/handlers/messageHandler.js`;
- `tests/financialIterativeCanary.test.js`;
- `tests/financialIterativeCanaryTelemetry.test.js`;
- `tests/financialIterativeShadowAgent.test.js`.

## Critério de GO

O auditor deve confirmar que a saída estruturada restringe deterministicamente
o caminho pós-leitura a `answer`, que providers incompatíveis falham fechado,
que o caminho ainda ambíguo não foi removido, que a validação local permanece
autoritativa e que nenhum escopo, efeito ou writer foi ampliado.

Com `GO TÉCNICO LOCAL`, fica autorizado somente novo artefato OCI com canário
`off`. A ativação estrita e uma única pergunta base continuam gate operacional
separado, com rollback imediato e sem follow-up se não houver promoção.
