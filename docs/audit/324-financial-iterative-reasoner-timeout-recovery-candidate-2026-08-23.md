# ARQ-06 — recovery do timeout e da observabilidade do reasoner

Data: 2026-08-23

## Estado

`RECOVERY CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

O canário de produção permanece `off`. Este recovery não autoriza artefato,
deploy, ativação, writer ou novo smoke antes de `GO TÉCNICO LOCAL`.

## Evidência operacional anterior

O recovery 323 recebeu `GO TÉCNICO LOCAL` independente no hash
`0fb7bd7c6e8bfcecbd7e1ec9eacf3a8ec094a6f9` e foi promovido na OCI por
artefato imutável, inicialmente com o canário desligado. Processo único,
WhatsApp, SQLite e health local/público ficaram saudáveis.

Na ativação estrita posterior, somente dois membros familiares autorizados,
domínio `expenses` e fonte técnica `personal_sheet` foram habilitados. Essa
fonte representa a planilha familiar compartilhada por Daniel e Thaís; não é
um escopo individual exclusivo de Daniel. Nenhum terceiro foi incluído e
nenhum writer foi habilitado.

O único smoke real autorizado executou uma leitura determinística e preservou
o baseline com `reasoner_failed`. A configuração privada usava timeout de
12.000 ms, o orçamento tinha 13 de 240 chamadas mensais consumidas e o modelo
`openai/gpt-5.6-terra` foi confirmado no catálogo autenticado do provedor. A
cronologia do runtime é compatível com expiração do timeout após a leitura, e
não com limite de orçamento. O canário foi revertido imediatamente para `off`
por `SIGHUP`, sem restart, escrita financeira ou perda de saúde.

## Recovery

O timeout padrão do reasoner passa de 12 para 30 segundos. A configuração
continua limitada deterministicamente ao intervalo de 1.000 a 30.000 ms; não
existe espera ilimitada nem retry novo.

Falhas do reasoner agora recebem somente códigos fechados e sanitizados:

- expiração local por `AbortError` vira `reasoner_timeout`;
- falhas HTTP, decisão inválida e os três bloqueios de orçamento preservam
  seus códigos técnicos fixos;
- qualquer exceção desconhecida vira apenas `reasoner_failed`.

Mensagem, identidade, stack, payload e texto bruto da exceção nunca entram no
resultado. O contrato do baseline, a allowlist familiar, owner, fonte, domínio,
plano, limite de leituras, adequação, efeitos e writers permanece inalterado.

## Evidência local

- timeout padrão: 30.000 ms;
- valor explícito de 12.000 ms: preservado;
- valor acima do teto: reduzido a 30.000 ms;
- `AbortError` com mensagem simulando identidade: `reasoner_timeout` sem texto;
- código técnico conhecido: preservado;
- erro arbitrário com identidade simulada: `reasoner_failed`;
- fallback por erro desconhecido: candidato nulo, zero mensagens e zero
  escritas financeiras;
- bateria causal: `142/142`, zero falha;
- workflow portátil: `OK`;
- contrato de ambiente: zero variável não documentada e zero acesso dinâmico
  não aprovado;
- suíte hermética ampla única: `1.820/1.830`, zero falha e dez skips previstos;
- cobertura: linhas `91,75%`, branches `74,61%`, funções `91,22%`;
- runner amplo local, com rede e subprocessos externos bloqueados.

As contagens são execução local relatada, não execução do auditor.

## Arquivos causais para auditoria

- este documento;
- `docs/audit/323-financial-adequacy-reason-allowlist-recovery-2026-08-23.md`;
- `.env.example`;
- `src/agent/financialIterativeReasoner.js`;
- `src/agent/financialIterativeShadowAgent.js`;
- `src/agent/financialIterativeCanary.js`;
- `src/handlers/messageHandler.js`;
- `tests/financialIterativeCanary.test.js`;
- `tests/financialIterativeCanaryTelemetry.test.js`;
- `tests/financialIterativeShadowAgent.test.js`.

## Critério de GO

O auditor deve confirmar que o timeout é finito e corretamente limitado, que a
classificação nunca expõe erro bruto ou identidade, que códigos desconhecidos
falham fechado, que o fallback continua sem efeito e que família, fonte, owner,
plano, adequação, leituras e writers não foram ampliados.

Com `GO TÉCNICO LOCAL`, fica autorizado apenas construir e promover novo
artefato OCI mantendo o canário `off` e ajustar atomicamente o timeout privado
para 30.000 ms. A ativação estrita e uma nova tentativa única do smoke continuam
gate operacional separado, com rollback imediato se qualquer invariante falhar.
