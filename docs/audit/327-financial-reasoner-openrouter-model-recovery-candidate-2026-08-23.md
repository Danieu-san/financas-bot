# ARQ-06 — recovery do modelo público do OpenRouter

Data: 2026-08-23

## Estado

`RECOVERY CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

O canário de produção está `off`. Este recovery não autoriza alteração do
`.env` privado, novo artefato, deploy ou smoke antes de `GO TÉCNICO LOCAL`.

## Falha observada

O recovery 326 recebeu `GO TÉCNICO LOCAL`, foi promovido por artefato imutável
com o canário desligado e preservou processo único e health verde. Na única
pergunta base posterior, o baseline foi preservado e a telemetria fechada
registrou `reasoner_http_failure`, uma leitura e zero efeitos.

Uma sonda sintética sem dados financeiros reproduziu a requisição estruturada
com o modelo configurado `openai/gpt-5.6-terra`. O OpenRouter respondeu HTTP
404 porque nenhum endpoint público aceitava o modelo e os parâmetros pedidos.
Esse identificador pertence à superfície Codex e não é um slug público válido
para este runtime do OpenRouter.

## Recovery

O default do reasoner e o contrato de exemplo passam a usar
`openai/gpt-4o-mini`. A documentação oficial do OpenRouter declara suporte a
JSON Schema em `response_format` para esse modelo. Uma única sonda sintética,
sem conteúdo financeiro, confirmou HTTP 200, provider OpenAI, choice presente
e término normal com o mesmo schema estrito e
`provider.require_parameters=true` usados pelo produto.

O teste focal deixa de injetar um nome fictício e exige que o request real
construído pelo produto use exatamente o default público. Schema, validação
local, orçamento, timeout, prompt sanitizado, escopo familiar, owner, fonte,
adequação, telemetria, adapters, efeitos e writers não mudam.

## Evidência local

- sintaxe do reasoner válida;
- focal do canário: `34/34`, zero falha;
- bateria causal: `142/142`, zero falha;
- suíte hermética ampla: `1.820/1.830`, zero falha e dez skips previstos;
- cobertura: linhas `91,76%`, branches `74,74%`, funções `91,22%`;
- sonda sintética externa: HTTP 200, sem dado financeiro e sem mudança de
  runtime;
- produção restaurada para canário `off`, WhatsApp `ready/healthy` e zero
  efeito financeiro no smoke que revelou a causa.

As contagens são execução local relatada, não execução do auditor. A sonda
externa valida somente catálogo, roteamento e contrato de parâmetros; ela não
substitui teste do produto nem o smoke operacional posterior.

## Arquivos causais para auditoria

- este documento;
- `docs/audit/326-financial-reasoner-structured-output-recovery-candidate-2026-08-23.md`;
- `.env.example`;
- `src/agent/financialIterativeReasoner.js`;
- `tests/financialIterativeCanary.test.js`.

## Critério de GO

O auditor deve confirmar que o slug público substitui somente o default
inexecutável, que o request continua exigindo Structured Outputs e provider
compatível, que o teste cobre o default efetivo e que nenhuma fronteira de
dados, escopo, efeito ou escrita foi ampliada.

Com `GO TÉCNICO LOCAL`, fica autorizado somente atualizar o modelo privado,
gerar novo artefato com canário `off` e repetir uma única pergunta base. O
follow-up continua condicionado à promoção da resposta base; qualquer fallback
exige retorno imediato para `off`, sem repetição no mesmo hash.
