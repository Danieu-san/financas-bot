# STATE-01 — correção pós-commit candidata à reauditoria

Data: 2026-07-22

## Estado

`CANDIDATO AGUARDANDO REAUDITORIA NO CHAT`. Este documento não concede `GO`,
não autoriza deploy e não afirma validação em produção ou no WhatsApp real.

## Base e objeto

- base auditada: `549ba68b200031c000ee14827f54293a67ee7153`;
- objeto: fechar a lacuna causal encontrada pela auditoria independente no
  estado `confirming_transactions`;
- implementação: `src/handlers/messageHandler.js`;
- prova causal: `tests/financialStateMachine.test.js`;
- regras e evidência anterior: `docs/plans/current-gate.md` e
  `docs/audit/19-state01-sender-serialization-candidate-2026-07-22.md`.

O hash do novo candidato é a identidade do próprio commit publicado. A
reauditoria deve usar o hash completo nas URLs e nunca a ponta mutável de
`main`.

## Achado independente reproduzido

O candidato anterior serializava mensagens do mesmo remetente, mas mantinha a
confirmação ativa enquanto aguardava a resposta final depois de gravar. Se essa
resposta falhasse, a tarefa terminava sem excluir o estado e a confirmação
seguinte na fila podia repetir o efeito.

O novo teste injeta falha em toda resposta da primeira mensagem imediatamente
depois da gravação e já deixa uma segunda confirmação enfileirada. Antes da
correção, o RED determinístico observou duas linhas em `Saídas` (`2 !== 1`).

## Mudança limitada

No ramo confirmatório que já possui todos os métodos de pagamento:

1. as tentativas de escrita continuam sequenciais e contam sucessos;
2. falhas de itens são acumuladas sem enviar mensagens dentro da região crítica;
3. ao terminar as tentativas, o estado é excluído sincronicamente;
4. somente depois são enviadas mensagens de falha e o resumo final.

O cancelamento do mesmo estado também passa a excluí-lo antes de responder.
Não houve alteração na fila por remetente, deduplicação, writers, chaves de
operação, acesso, planilhas ou contratos financeiros.

## Invariantes e alcance

- nenhuma comunicação é aguardada entre o primeiro efeito confirmado desse
  ramo e o consumo definitivo do estado;
- falha de resposta pós-commit não reabre nem preserva a confirmação;
- a segunda mensagem do mesmo remetente observa o estado já consumido;
- paralelismo entre remetentes, FIFO local, liberação da fila e contenção de
  rejeições continuam cobertos pelas provas do candidato anterior;
- coordenação entre processos e reordenação retroativa por timestamp continuam
  fora do gate original.

## Evidência executada pelo Codex

- RED novo: `2 !== 1` no teste de falha de resposta pós-commit;
- provas focais depois da correção: `3/3`;
- bateria afetada — máquina financeira, backfill e ready rescue: `125/125`;
- `npm test`: pretests verdes e runner principal `1.074/1.074`, sem falha,
  cancelamento ou skip;
- sintaxe e `git diff --check`: verdes.

Essas contagens são evidência relatada pelo executor. A reauditoria externa é
estática e não deve alegar que reproduziu as execuções.

## Critério de fechamento

Somente um parecer independente do Chat que confirme o hash completo, cite os
arquivos lidos e não encontre achado bloqueante ou lacuna causal indispensável
dentro de `STATE-01` permite registrar `GO TÉCNICO LOCAL`. O parecer deve ser
confrontado com o código e com esta evidência antes do fechamento.
