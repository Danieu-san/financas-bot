# Gate 41 — recovery do backup para o corte do outbox pós-RX

Data: 2026-08-21

## Estado

`CANDIDATO AGUARDANDO REAUDITORIA INDEPENDENTE`.

## NO-GO anterior

O candidato 288 recebeu NO-GO exclusivamente porque “cópia restaurável de
outbox.sqlite” não provava consistência sob SQLite/WAL. O cutoff, a ordem entre
quarantine e transporte, a preservação dos terminais e a elegibilidade
pós-cutover foram considerados causalmente consistentes.

## Recovery

O procedimento passa a usar, antes de qualquer alteração de `.env`, o gate
operacional já existente `scripts/runOpenFinanceOperationalBackupGate.js` com
as confirmações explícitas de leitura cifrada e restauração isolada.

Esse gate:

- cria os snapshots por `better-sqlite3.backup()`, inclusive do outbox em WAL;
- converte cada cópia para pacote independente sem sidecars;
- executa `integrity_check`, checksum, manifesto e retenção privada;
- restaura todos os stores em diretório isolado;
- reaplica revogações e terminais monotônicos antes de expor a cópia;
- compara paridade sanitizada entre origem e restauração;
- apaga somente a restauração isolada e preserva o backup por 30 dias;
- exige `financial_writes=0` e não inclui o segredo no pacote.

O `.env` será preservado separadamente, com permissão original, antes de usar
o atualizador atômico allowlisted.

## Sequência corrigida

1. executar o gate operacional completo e exigir `outcome=GO`, `parity=true`,
   `secret_in_backup=false` e `restore_cleanup=true`;
2. preservar `.env` em diretório privado e calcular seu checksum;
3. capturar um único timestamp de cutover do servidor;
4. atualizar os mesmos quatro aliases com
   `applyRuntimeEnvOverrides --activate-open-finance-canary`;
5. reiniciar uma única vez o processo PM2;
6. aguardar somente o startup cycle e exigir que os 110 `pending`
   pré-cutover se tornem `blocked` antes de qualquer transporte;
7. exigir preservação exata das contagens terminais anteriores, zero
   `in_flight`, zero transporte do backlog e `financial_writes=0`;
8. confirmar processo único, health, SQLite e WhatsApp `ready/healthy`.

Em falha antes do restart, restaurar somente `.env`. Em falha após o restart,
parar o processo, restaurar `.env` e o pacote de estado verificado pelo módulo
existente, e só então reiniciar. Nenhum rollback será ensaiado contra o estado
ativo: a prova ocorre no diretório isolado antes do cutover.

## Evidência local

- cutoff, quarantine e entrega: `28/28`;
- backup consistente e gate operacional: `9/9`;
- nenhuma mudança de produto e nenhuma repetição de suíte ampla sem causa.

## Arquivos para reauditoria

1. este manifesto;
2. `docs/audit/288-gate41-post-rx-alert-cutover-candidate-2026-08-21.md`;
3. `scripts/runOpenFinanceOperationalBackupGate.js`;
4. `src/openFinance/openFinanceStateBackup.js`;
5. `tests/openFinanceOperationalBackupGate.test.js`;
6. `tests/openFinanceStateBackup.test.js`;
7. `scripts/applyRuntimeEnvOverrides.js`;
8. `src/openFinance/openFinanceAlertOutbox.js`;
9. `src/openFinance/openFinanceCanaryRuntime.js`.

## Questões de reauditoria

1. O gate operacional fecha integralmente a lacuna WAL/rollback do NO-GO?
2. A sequência impede alteração do cutoff antes de existir backup verificado e
   restauração isolada paritária?
3. O rollback preserva `.env`, outbox e estados monotônicos sem criar escrita
   financeira ou reenvio?
4. Resta alguma lacuna indispensável antes do cutover controlado?
