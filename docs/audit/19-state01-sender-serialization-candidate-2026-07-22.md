# STATE-01 — candidato para auditoria independente

Data: 2026-07-22

## Estado

`CANDIDATO AGUARDANDO AUDITORIA NO CHAT`. Este documento não concede `GO`, não
autoriza deploy e não afirma validação em produção ou no WhatsApp real.

## Base e objeto

- base: `083be71580292ff09d11ffb2d4c0b7b99a065bf3`;
- objetivo: impedir que mensagens distintas do mesmo remetente avancem em
  paralelo a máquina de estado e disputem os mesmos efeitos financeiros;
- entrada de produto: `src/handlers/messageHandler.js`;
- ligação dos ingressos ao vivo e backfill: `index.js`;
- prova causal: `tests/financialStateMachine.test.js`;
- regras e invariantes: `docs/plans/current-gate.md`.

O hash do candidato é a identidade do próprio commit publicado. Toda auditoria
deve usar o hash completo nas URLs, nunca `main`.

## Causa reproduzida

O listener ao vivo entrega `handleMessage` a um `EventEmitter`, que não aguarda
a promessa. O backfill usa o mesmo handler exportado. Antes da correção, duas
mensagens distintas do mesmo remetente podiam ler o mesmo estado antes de uma
delas concluir I/O e excluir ou substituir esse estado. Deduplicação por
`messageId` e operation keys não eliminavam a disputa entre IDs diferentes.

O RED determinístico observou:

- duas regiões assíncronas ativas para o mesmo remetente, quando o máximo
  esperado era uma;
- duas gravações de `Saídas` após duas confirmações simultâneas consumirem o
  mesmo estado `confirming_transactions`, quando o esperado era uma.

O controle com dois remetentes distintos já executava em paralelo e foi
preservado.

## Mudança

A entrada pública agora resolve o remetente e agenda o processamento numa cauda
em memória específica para essa chave. A cauda anterior sempre é aguardada; uma
rejeição é convertida apenas na promessa de continuidade da fila, sem alterar o
resultado da operação que falhou. Quando a última operação termina, sua chave é
removida do mapa.

O handler público também contém uma rejeição inesperada, registra métrica e log
sanitizado e resolve a promessa entregue ao `EventEmitter`. Assim, uma falha
anterior à captura interna não produz rejeição não tratada nem impede a mensagem
seguinte do mesmo remetente.

Não houve mudança em estados, writers, chaves de operação, deduplicação, acesso,
rate limit, planilhas ou contratos financeiros.

## Invariantes provados

1. Mensagens do mesmo remetente não se sobrepõem e seguem a ordem de invocação.
2. Remetentes diferentes continuam paralelos.
3. Duas confirmações concorrentes consomem o estado uma vez e gravam uma vez.
4. Rejeição não envenena a cauda; a tarefa seguinte ainda executa.
5. Chaves ociosas são removidas.
6. A regressão existente de deduplicação de áudio por `messageId` permanece
   verde dentro da fronteira serializada.

## Evidência executada pelo Codex

- RED causal: duas falhas esperadas e controle de paralelismo verde;
- provas focais finais: `5/5`;
- bateria afetada final — máquina financeira, backfill e ready rescue:
  `124/124`;
- `npm test` final: pretests verdes e runner principal `1.073/1.073`, sem falha,
  skip ou cancelamento;
- sintaxe dos arquivos alterados e `git diff --check`: verdes.

A auditoria externa será estática. Ela não deve alegar que reproduziu essas
execuções; deve verificar se o código e os testes sustentam a causalidade e as
contagens relatadas apenas como evidência do executor.

## Limites declarados

- a fila é local a um processo; múltiplas instâncias simultâneas exigiriam
  coordenação distribuída, fora do achado original e deste gate;
- a ordem garantida é a ordem de invocação local, não reordenação retroativa por
  timestamp entre uma mensagem ao vivo e uma mensagem antiga descoberta depois;
- uma tarefa lenta retém mensagens posteriores apenas do mesmo remetente, por
  desenho, sem bloquear outros remetentes;
- não houve produção, deploy, EC2/Oracle, Google/WhatsApp real ou mudança de
  flags;
- alterações concorrentes do workstream AWS/Oracle e arquivos não rastreados do
  usuário permanecem fora do candidato.

## Critério de fechamento

Somente um parecer independente do Chat que confirme o hash completo, cite os
arquivos lidos e não encontre achado bloqueante ou lacuna causal indispensável
dentro de `STATE-01` permite registrar `GO TÉCNICO LOCAL`. O executor deve
confrontar o parecer com o código e a evidência antes de fechar o gate.
