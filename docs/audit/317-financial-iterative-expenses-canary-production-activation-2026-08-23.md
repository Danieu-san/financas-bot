# ARQ-06 — ativação controlada do canário de despesas

Data: 2026-08-23

## Estado

`CANÁRIO ATIVO — SMOKE SINTÉTICO GO; SMOKE WHATSAPP PENDENTE`.

Este registro não autoriza writer, não remove o pipeline vigente e não amplia
o recorte para outros domínios ou fontes.

## Consentimento e segredo

- Daniel autorizou especificamente o envio ao OpenRouter das perguntas e da
  evidência financeira sanitizada necessária ao canário read-only;
- a chave foi gravada somente no `.env` privado da raiz estável da OCI;
- `.env` e backup possuem modo `0600`;
- nenhum valor secreto, ID familiar, número de telefone, texto financeiro ou
  payload foi registrado neste documento ou no Git;
- a chave foi aceita em chamada de metadados HTTP `200`, sem dados financeiros.

## Configuração aplicada

- modo: `canary`;
- usuários permitidos: exatamente `2`, obtidos server-side do único vínculo
  familiar ativo e sem exposição dos IDs;
- domínio: somente `expenses`;
- fonte: somente `central_read_model`;
- qualquer usuário, domínio ou fonte diferente falha fechado e preserva o
  pipeline vigente.

O `.env` foi atualizado atomicamente com backup privado. Um único restart PM2
carregou a chave; depois da prontidão do WhatsApp, `SIGHUP` aplicou a allowlist.
O runtime confirmou `mode=canary users=2 domains=1 sources=1`.

## Evidência operacional

- release: `ccafb858c44a4303a108f9dce83a8221160fe7b9`;
- processo PM2 único, online, com um restart controlado desta ativação;
- health após o restart e após o `SIGHUP`: SQLite verde e WhatsApp
  `ready/healthy`;
- reasoner real do release foi instanciado com um contexto sintético sem dados
  financeiros e retornou uma decisão `answer` válida;
- relatório agregado desde a ativação: zero tentativas reais, zero registros
  inválidos e zero promoções, fallbacks ou pendências;
- nenhuma escrita financeira foi habilitada ou executada por esta ativação.

## Pendência para fechamento

Executar uma pergunta real de despesas e um follow-up pelo WhatsApp de Daniel,
confirmar resposta adequada, telemetria terminal sanitizada e saúde estável.
Se houver erro, registro inválido, pendência causal ou perda de saúde, reverter
o modo para `off` pelo backup/configuração e preservar o pipeline vigente.
