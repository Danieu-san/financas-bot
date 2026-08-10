# Gate 37 - candidato de transferencias e reservas patrimoniais

Data: 2026-08-10

## Estado proposto

`CANDIDATO LOCAL VERDE; AGUARDA AUDITORIA INDEPENDENTE`.

Este gate e estritamente read-only. Nao habilita escrita financeira, deploy,
promocao OCI ou acesso a dados reais.

## Contrato implementado

- somente observacoes bancarias `POSTED/new` entram no tratamento;
- par interno exige contas distintas, sinais opostos, valor exato, janela de
  dois dias e referencia forte compartilhada do provedor;
- pareamento e mutuo e unico; multiplicidade permanece nao pareada;
- valor, data e descricao sem referencia forte nunca formam par;
- uma unica revisao cifrada representa o par; os dois usuarios recebem o mesmo
  codigo na ponta acionavel, sem criar decisoes concorrentes;
- transferencia sem par forte permanece alertavel e revisavel;
- `operation_type` reconhecido sugere aplicacao, resgate ou rendimento;
- tipo generico ou descricao de Caixinha apenas abre revisao e nao escolhe a
  semantica;
- debito semantico oferece aplicacao; credito oferece resgate ou rendimento,
  sem uma opcao generica que misture principal e ganho;
- a consulta explicita exibe as duas pontas de um par antes da decisao;
- store familiar cifrado, restart, expiracao, idempotencia e conflito terminal
  permanecem herdados do Gate 36;
- toda classificacao, persistencia, entrega e decisao declara
  `financial_writes=0`.

## Arquivos do candidato

- `docs/plans/workstreams/open-finance-transfer-reserve.md`
- `src/openFinance/openFinanceProactiveReview.js`
- `src/openFinance/openFinanceProactiveReviewStore.js`
- `src/openFinance/openFinanceProactiveReviewConversation.js`
- `src/openFinance/openFinanceAlertOutbox.js`
- `src/openFinance/openFinanceWhatsappCanaryDelivery.js`
- `src/openFinance/openFinanceCanaryRuntime.js`
- `tests/openFinanceTransferReserveReview.test.js`
- `tests/openFinanceProactiveIncomeRefund.test.js`

## Evidencia local antes da suite ampla

- focal Gate 37: `10/10`;
- Gate 36 e Gate 37 combinados: `24/24`;
- bateria causal de outbox, entrega, runtime, lifecycle e handler: `173/173`;
- syntax check e `git diff --check`: verdes;
- runtime real de teste persistiu e entregou entrada e aplicacao de reserva com
  zero propostas e zero escrita;
- suite hermetica ampla: `1591/1581/0/10`, com zero falhas e os dez skips
  previstos;
- cobertura ampla: linhas `90,95%`, branches `73,65%` e funcoes `90,64%`.

As contagens sao evidencia de execucao local do Codex e nao devem ser tratadas
pelo auditor como execucao independente. Nenhuma suite ampla verde sera
repetida sem nova mudanca causal.

## Limites preservados

- Gate 34 continua pausado;
- Gate 35 continua `PARTIAL_NO_GO` sem inferencia historica;
- Gate 36 continua em GO tecnico local;
- escrita, segunda confirmacao e recibo pertencem ao Gate 38;
- nenhuma producao, Pluggy real, WhatsApp real ou dado privado foi acessado.
