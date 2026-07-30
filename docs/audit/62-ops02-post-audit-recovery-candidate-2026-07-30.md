# OPS-02 — recuperação pós-NO-GO

Data: 2026-07-30

## Estado

`RECUPERAÇÃO LOCAL VERDE; REAUDITORIA INDEPENDENTE PENDENTE`.

Este documento não autoriza deploy, restart, QR, produção ou fechamento do
gate.

## Primeiro candidato e parecer

Primeiro candidato:
`4647ea775f801dcd277d0282a8cc424a43d3f4f3`.

O Chat confirmou o hash e a leitura integral dos 14 arquivos e emitiu
`NO-GO`:

1. `HIGH`: o manifesto dizia que o backfill repetia leitura/handler, porém
   `handleMessage` absorvia a falha e fazia o processamento parecer sucesso.
2. `MEDIUM`: faltava fechar por teste o sucesso tardio de um probe depois da
   decisão de recovery.
3. `MEDIUM`: faltava prova composicional de causas concorrentes atravessando
   uma única saída de supervisor.
4. `LOW`: faltava teste negativo do ready rescue para erro diferente do binding
   permitido.

## Fechamento do HIGH

O contrato foi corrigido para a fronteira segura:

- `whatsappUnreadBackfillService` repete somente a descoberta/leitura antes de
  iniciar qualquer handler;
- depois da descoberta, cada mensagem é tentada uma vez; falha ambígua não
  repete o lote nem mensagens anteriores;
- o serviço substitui erro cru do handler por
  `WHATSAPP_UNREAD_BACKFILL_HANDLER_FAILED`;
- `index.js` entrega `handleMessageForBackfill`, não o listener tolerante a
  EventEmitter;
- o novo handler usa a mesma fila pública por remetente e a mesma
  `processMessage`; a captura fatal retorna um sentinela que vira
  `WHATSAPP_BACKFILL_PUBLIC_HANDLER_FAILED` somente nessa entrada;
- o listener ao vivo continua contendo rejeições, sem `unhandledRejection`;
- o teste de estado executa a cadeia real
  `backfillUnreadMessages -> handleMessageForBackfill -> processMessage`, força
  falha dentro do processamento e também na resposta de erro, exige uma única
  descoberta, código sanitizado e zero escrita em Saídas/Entradas.

Não se remove a deduplicação para retry: após uma falha ambígua pode já existir
efeito parcial, então repetir automaticamente seria menos seguro.

## Fechamento dos MEDIUM

- O teste de probe pendente agora cruza o timeout, atinge o limiar por
  `probe_still_in_flight`, libera depois `CONNECTED` e exige que
  `recoveryRequested=true`, `status=degraded` e uma única callback permaneçam.
- `supervisorExitService` contém uma guarda síncrona única e agenda um só
  `exit(1)`.
- O teste unitário dispara três causas concorrentes e exige um timer/exit.
- O teste de `src/services/whatsapp.js` injeta a implementação real da guarda,
  combina duas falhas de liveness com `disconnected` e exige um único
  timer/exit na composição de produto.

## Fechamento do LOW

O teste do rescue injeta erro diferente do binding aceito e exige rejeição
imediata e zero execução de `page.evaluate`.

## Evidência local

- sintaxe dos módulos alterados: verde;
- focal pós-NO-GO: `142/142`;
- runner hermético depois das mudanças de produto: 125 arquivos descobertos,
  107 diretos e 18 por runners aninhados; `1.325/1.330`, zero falhas, cinco
  skips funcionais previstos;
- cobertura: linhas `90,39%`, branches `72,31%`, funções `89,81%`;
- contrato de ambiente: 188 nomes referenciados, 201 documentados e zero
  ausência/duplicidade/acesso dinâmico não aprovado;
- nenhuma rede, WhatsApp, Google, produção ou writer real;
- dependências e lockfile não foram alterados; os 11 avisos `high` transitivos
  preexistentes permanecem separados.

## Arquivos centrais para reauditoria

- `docs/audit/62-ops02-post-audit-recovery-candidate-2026-07-30.md`
- `index.js`
- `src/handlers/messageHandler.js`
- `src/services/whatsappUnreadBackfillService.js`
- `src/services/whatsappLivenessService.js`
- `src/services/supervisorExitService.js`
- `src/services/whatsapp.js`
- `src/services/whatsappReadyRescueService.js`
- `tests/financialStateMachine.test.js`
- `tests/whatsappUnreadBackfillService.test.js`
- `tests/whatsappLivenessService.test.js`
- `tests/supervisorExitService.test.js`
- `tests/whatsappServiceLiveness.test.js`
- `tests/whatsappReadyRescueService.test.js`

## Critério

A reauditoria deve confirmar o novo hash, reavaliar explicitamente os quatro
achados e verificar que a escolha at-most-once do handler elimina replay
ambíguo sem esconder a falha. Somente ausência de lacuna indispensável autoriza
`GO TÉCNICO LOCAL`; deploy OCI continua um gate separado.
