# OF-NUMERIC-SAVE-01 - candidato do fluxo numerico de salvamento

Data: 2026-08-05

## Objetivo

Eliminar a colisao causada por varias propostas individuais com resposta
`sim`. O destinatario recebe um lote numerado de no maximo quatro compras
reconciliadas e escolhe `salvar 1`, `salvar 1 e 3` ou `salvar todas`. Uma unica
proposta preserva o fluxo anterior de `sim`, `nao` ou `cancelar`.

## Contrato implementado

- `OPEN_FINANCE_SAVE_PROPOSAL_BATCH_SIZE` limita o lote entre um e quatro e
  vale por destinatario; o fan-out familiar da mesma transacao nao consome uma
  segunda posicao no lote do outro conjuge;
- o outbox arrenda as linhas do mesmo destinatario em uma transacao SQLite e
  confirma, aceita sem ID ou libera o conjunto de forma atomica;
- uma falha ambigua depois do inicio do transporte move todo o lote para
  `accepted_unconfirmed`, impede resposta e nao cria estado de conversa;
- a mensagem unica enumera fonte, valor, descricao, data e referencia de cada
  item, sem expor bearer de confirmacao;
- `sim` isolado e recusado quando existem varios itens;
- a selecao reserva atomica e individualmente as propostas escolhidas para o
  primeiro membro autorizado do casal que responder;
- a selecao nao grava e nao autoriza o lote em massa: ela apenas inicia a
  primeira revisao guiada e guarda uma fila cifrada de referencias; cada item
  percorre separadamente revisao, revalidacao e confirmacao final;
- propostas omitidas na selecao nao sao aceitas nem recusadas implicitamente;
  permanecem sem escrita ate expirarem ou serem tratadas por outro fluxo;
- `cancelar` na lista apenas encerra a conversa, sem decisao financeira;
- replay depois de aceitar/ativar uma revisao, mas antes de atualizar o estado
  auxiliar, reencontra e retoma a revisao duravel; o mesmo vale ao avancar para
  o item seguinte;
- o estado auxiliar e persistido pelo state store cifrado existente, mas toda
  decisao e revalidada contra outbox, preview, review store e expiracao;
- `financial_writes=0` permanece no transporte, selecao, reserva e revisao.

## Fronteiras e arquivos

- `src/openFinance/openFinanceAlertOutbox.js`: claim e ACK atomicos do lote;
- `src/openFinance/openFinanceWhatsappCanaryDelivery.js`: envio agregado e
  tratamento de resultado ambiguo;
- `src/openFinance/openFinanceCanaryRuntime.js`: limite por destinatario e
  binding de estado individual ou numerico;
- `src/openFinance/openFinanceShadowPreviewStore.js`: reserva atomica e
  actor-bound das propostas selecionadas;
- `src/openFinance/openFinanceSaveProposalConversation.js`: parser, selecao,
  replay e fila sequencial;
- `src/handlers/messageHandler.js`: entrada publica, persistencia e avanco da
  fila;
- `tests/openFinanceNumericSaveFlow.test.js`: prova focal adversarial;
- `tests/financialStateMachine.test.js`: handler publico serializado;
- `tests/openFinanceSaveProposalShadow.test.js`: composicao real do runtime.

## Evidencia local

- RED inicial: 0/3 para parser, mensagem e binding inexistentes;
- bateria causal afetada: 214/214;
- prova focal apos o ajuste de contrato do ambiente: 15/15;
- suite hermetica ampla final: 1.530 testes, 1.520 aprovados, zero falhas e 10
  skips conhecidos;
- cobertura final: linhas 90,75%, branches 73,39%, funcoes 90,51%;
- syntax checks e `git diff --check` verdes;
- a primeira execucao ampla completa encontrou somente a ausencia da nova
  variavel no `.env.example`; depois dessa correcao causal, a repeticao ampla
  final ficou verde;
- uma tentativa anterior da mesma suite foi encerrada pelo timeout externo de
  dez minutos antes de produzir resultado e nao foi contabilizada como
  evidencia.

## Provas adversariais

- limite de quatro e lote restante separado;
- ACK com um lease adulterado reverte todas as linhas;
- reserva com uma proposta obsoleta reverte todas as reservas;
- fechamento e reabertura do SQLite preservam as reservas;
- Daniel e Thais recebem lotes independentes do mesmo conjunto;
- somente o primeiro conjuge reserva cada proposta;
- falha ambigua de transporte torna todo o lote nao respondivel;
- replay da selecao e do avanco nao cria segunda revisao;
- handler publico rejeita `sim`, aceita numeros e avanca apos cancelamento da
  revisao corrente sem qualquer escrita financeira.

## Limites preservados

O candidato nao ativa flags, nao altera o corte operacional de 2026-07-28, nao
leva o RX historico iniciado em 2025-07-01 para o canal de alertas, nao torna
ambiguidades nao resolvidas elegiveis, nao consulta Pluggy real, nao toca
planilha e nao faz deploy. Alertas sem proposta continuam individuais. O estado
maximo e `candidato aguardando auditoria independente`.
