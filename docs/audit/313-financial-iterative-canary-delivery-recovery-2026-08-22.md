# ARQ-06 — recovery causal da entrega do canário iterativo

Data: 2026-08-22

## Estado

`RECOVERY AGUARDANDO REAUDITORIA INDEPENDENTE`.

Este recovery não autoriza ativação, consumo de OpenRouter, deploy, writer nem
retirada do legado.

## NO-GO anterior

O Chat leu integralmente os oito arquivos do commit imutável
`5ac43f9f15354fa6ec799fdd69e3716953537638` e emitiu `NO-GO` por um achado
crítico: o evento durável `promoted` era gravado antes de `await msg.reply`.
Uma falha de entrega produziria falso sucesso operacional, embora a decisão
interna de seleção estivesse correta e fail-closed.

Privacidade, elegibilidade server-side, bloqueio por falha de persistência,
contadores explícitos de side effect, modo `off`, legado, read-only e rollback
foram considerados consistentes no mesmo parecer.

## Recovery

- uma tentativa adequada recebe um `attemptId` aleatório e registra `selected`
  antes de qualquer chamada de entrega;
- a fronteira pública de entrega aguarda `msg.reply` e só depois registra o
  terminal `promoted` com motivo `reply_succeeded`;
- se `msg.reply` rejeitar, a mesma fronteira registra `fallback` com motivo
  `reply_failed` e propaga o erro para o fallback vigente;
- se o processo cair entre `selected` e o terminal, o relatório marca a
  tentativa como `pending`; nunca a conta como promovida;
- falha ao registrar o terminal depois de uma entrega já concluída preserva o
  `selected` durável como pendente e emite somente log operacional sanitizado;
- terminais conflitantes são contabilizados separadamente pelo relatório;
- entradas JSON sintaticamente válidas, mas sem esquema, timestamp, `attemptId`
  ou outcome válidos, são contadas como inválidas e não alteram a consolidação;
- o cache da resposta promovida é escrito somente depois da entrega concluída;
- os dois pontos reais de resposta do handler usam a mesma função pública de
  entrega, testável e causalmente ordenada.
- o predicado de promoção inclui a elegibilidade recalculada na própria
  fronteira pública; um runner que devolva resultado incoerente não promove.

O `attemptId` é um UUID aleatório operacional. Ele não deriva de usuário,
telefone, mensagem, valor, conta, cartão, planilha ou resposta.

## Evidência local após o recovery

- focal do canário e telemetria: `22/22`, zero falha;
- controle positivo: `reply` resolvido ocorre antes do terminal `promoted`;
- controle negativo: rejeição de `reply` ocorre antes do terminal `fallback`;
- relatório: uma seleção sem terminal aparece como `pending`;
- bateria causal: `119/119`, zero falha;
- aceitação financeira: `265/265`, zero gap, 23 bloqueios de segurança, 238
  respostas verificadas e zero chamada Gemini;
- suíte hermética ampla final: `1.810/1.820`, zero falha e dez skips previstos;
- cobertura: linhas `91,70%`, branches `74,66%`, funções `91,16%`;
- rede bloqueada na suíte ampla; WhatsApp real explicitamente excluído.

As contagens são execução local relatada, não execução do auditor.

## Arquivos causais da reauditoria

- este recovery;
- `src/agent/financialIterativeCanaryTelemetry.js`;
- `src/handlers/messageHandler.js`;
- `tests/financialIterativeCanary.test.js`;
- `tests/financialIterativeCanaryTelemetry.test.js`;
- `scripts/reportFinancialIterativeCanary.js`.

## Critério de GO

O auditor deve confirmar que `promoted` agora significa entrega concluída, que
falha de entrega produz `fallback`, que interrupção entre fases permanece
visível como `pending`, que nenhum caminho real contorna a fronteira comum e
que o recovery não enfraquece privacidade, escopo, baseline ou read-only.

Com GO fica autorizado apenas fechar tecnicamente o ARQ-06 e preparar um
artefato OCI imutável com o canário ainda desligado.
