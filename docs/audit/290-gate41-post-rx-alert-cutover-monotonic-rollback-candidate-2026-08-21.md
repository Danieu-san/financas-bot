# Gate 41 — recovery monotônico do rollback do corte pós-RX

Data: 2026-08-21

## Estado

`CANDIDATO AGUARDANDO REAUDITORIA INDEPENDENTE`.

## NO-GO anterior

O candidato 289 fechou integralmente a lacuna SQLite/WAL, mas recebeu NO-GO
porque seu rollback pós-restart restaurava ao mesmo tempo o `.env` antigo e o
snapshot pré-cutover do outbox. Essa combinação reintroduziria os 110 itens
como `pending` sob o cutoff antigo e poderia reenviá-los.

## Decisão monotônica

O bloqueio do backlog é uma migração de segurança `pending -> blocked`, não uma
alteração financeira reversível. Depois de aplicado, ele nunca deve ser
desfeito no rollback ordinário.

O procedimento corrigido é:

1. antes do restart, qualquer falha restaura somente o `.env`; o outbox ainda
   não foi alterado;
2. depois do restart/quarantine, falha de health restaura código ou `.env` se
   necessário, mas preserva o outbox já bloqueado;
3. o snapshot SQLite verificado permanece apenas como recuperação de desastre,
   não como rollback normal do cutoff;
4. se desastre exigir restaurar o snapshot pré-cutover, o processo permanece
   parado; o timestamp novo é reaplicado e o quarantine é executado sobre a
   restauração antes de habilitar qualquer transporte;
5. somente depois de provar `pending=0`, incremento esperado de `blocked`,
   terminais invariantes, `in_flight=0` e `financial_writes=0` o processo pode
   voltar a enviar eventos posteriores ao corte.

Assim, nenhum caminho autorizado combina cutoff antigo com backlog restaurado
como elegível. O backup continua válido e restaurável, mas a proteção monotônica
é reaplicada antes da exposição, do mesmo modo que revogações e terminais já
são reaplicados pelo módulo de estado.

## Sequência de produção

1. executar e validar o gate de backup/restauração isolada do candidato 289;
2. preservar `.env` e contagens terminais;
3. atualizar atomicamente os quatro aliases para o timestamp de cutover;
4. reiniciar uma vez e aguardar o startup cycle;
5. comprovar `pending=0`, os 110 pré-cutover em `blocked`, terminais invariantes,
   zero `in_flight`, processo único e health `ready/healthy`;
6. em qualquer falha, manter o transporte parado até que a proteção monotônica
   esteja presente no estado efetivamente carregado.

## Escopo preservado

Não há mudança de código, classificação, política financeira ou memória de
estabelecimentos. Os testes `28/28` e `9/9` permanecem evidência executada pelo
executor; não são execução do auditor.

## Arquivos para reauditoria

1. este manifesto;
2. `docs/audit/289-gate41-post-rx-alert-cutover-backup-recovery-candidate-2026-08-21.md`;
3. `src/openFinance/openFinanceAlertOutbox.js`;
4. `src/openFinance/openFinanceCanaryRuntime.js`;
5. `src/openFinance/openFinanceStateBackup.js`;
6. `scripts/runOpenFinanceOperationalBackupGate.js`;
7. `scripts/applyRuntimeEnvOverrides.js`.

## Questões de reauditoria

1. A separação entre rollback ordinário e recuperação de desastre elimina o
   caminho cutoff antigo + backlog `pending` exposto ao transporte?
2. Preservar `blocked`, ou reaplicar o novo cutoff antes de uma restauração ser
   exposta, mantém a propriedade de não reenvio?
3. Resta alguma lacuna indispensável antes do cutover controlado?
