# Gate 41 — candidato operacional de corte do outbox pós-RX

Data: 2026-08-21

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

## Evidência de produção

Dois pagamentos de fatura pertencentes ao período histórico foram enviados
como alertas informativos depois do RX. Eles não foram digitados pelo operador:
foram enfileirados por um ciclo iniciado após a aplicação histórica e
transportados pelo ciclo iniciado depois do deploy seguinte.

O outbox provou que as duas entregas tinham uma tentativa e foram aceitas sem
ID retornado pelo transporte. A contagem sanitizada mostrou ainda 110 alertas
pendentes, todos criados antes do encerramento do RX. O cutoff operacional dos
quatro aliases continuava na ativação original de julho, portanto o mecanismo
existente `quarantineBeforeActivation` não reconhecia o novo corte pós-RX.

## Caracterização

Os pagamentos de fatura foram corretamente excluídos do writer histórico:
registrá-los como despesa duplicaria consumo já representado pelas compras. O
defeito está somente na entrega posterior como “nova movimentação”. O recovery
anterior cancelou propostas de salvamento reconciliadas, mas não redefiniu a
fronteira temporal do outbox informativo.

## Correção operacional proposta

Sem mudar código ou política financeira:

1. preservar cópia privada restaurável de `.env` e `outbox.sqlite`;
2. usar `scripts/applyRuntimeEnvOverrides.js --activate-open-finance-canary`
   com os mesmos quatro aliases e um único timestamp de cutover posterior ao RX;
3. reiniciar somente o processo PM2 vigente;
4. deixar o startup cycle aplicar `quarantineBeforeActivation`;
5. exigir que os 110 pendentes pré-cutover migrem para `blocked`, sem transporte
   e com `financial_writes=0`;
6. preservar terminais `accepted_unconfirmed`, `delivered_confirmed` e `sent`,
   que não podem ser reenviados;
7. confirmar processo único, zero reinícios adicionais, health e WhatsApp
   `ready/healthy`.

Novos eventos observados depois do cutover continuam elegíveis pelo fluxo
normal. Não há memória automática de estabelecimentos nem classificação nova.

## Evidência de produto já existente

- `applyRuntimeEnvOverrides` restringe chaves, valida aliases e timestamp e
  substitui o `.env` atomicamente;
- `quarantineBeforeActivation` altera somente `pending` para `blocked`;
- `claimNextBatch` não reclama eventos anteriores ao cutoff;
- terminais de entrega não pertencem ao conjunto mutável do quarantine;
- o runtime chama o quarantine antes de qualquer transporte.

Bateria focal executada no candidato: `28/28` em
`applyRuntimeEnvOverrides`, `openFinanceAlertOutbox` e
`openFinanceWhatsappCanaryDelivery`. Não houve mudança de produto nem motivo
causal para repetir a suíte ampla já executada no hash de produção.

## Arquivos para auditoria

1. este manifesto;
2. `scripts/applyRuntimeEnvOverrides.js`;
3. `src/openFinance/openFinanceAlertOutbox.js`;
4. `src/openFinance/openFinanceCanaryRuntime.js`;
5. `tests/applyRuntimeEnvOverrides.test.js`;
6. `tests/openFinanceAlertOutbox.test.js`;
7. `tests/openFinanceWhatsappCanaryDelivery.test.js`.

## Questões de auditoria

1. Atualizar os quatro cutoffs pelo script existente bloqueia o backlog
   pendente antes do próximo transporte?
2. O quarantine preserva terminais, não escreve finanças e mantém eventos
   posteriores ao cutover elegíveis?
3. Backup, atualização atômica, restart único e validação por contagens formam
   um procedimento restaurável e suficiente?
4. Há lacuna indispensável antes da execução controlada em produção?
