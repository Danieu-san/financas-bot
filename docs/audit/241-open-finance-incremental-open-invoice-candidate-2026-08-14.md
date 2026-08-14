# Gate 41.1 - candidato de compras correntes em fatura aberta no RX incremental

Data: 2026-08-14

## Objetivo

Alinhar o planejador historico incremental ao contrato ja promovido pelo Gate
40: o estado bruto `PENDING` de uma compra positiva na conta `CREDIT` pode
representar uma compra corrente da fatura aberta e nao uma autorizacao bancaria
pendente.

## Escopo e limites

- a mudanca e opt-in e permanece desligada por padrao;
- somente `classification=purchase`, conta `CREDIT`, valor positivo e estado
  bruto coerente `PENDING` ou `POSTED` podem usar a elegibilidade compartilhada;
- parcelamento formal ou descritor conservador `N/M`, parcela futura, credito,
  estorno, pagamento de fatura e saldo agregado permanecem fora;
- o estado bruto do Pluggy e preservado no contexto de revisao;
- o planejador continua `writable=false` e `financial_writes=0`;
- nao ha writer, Google, WhatsApp, deploy ou alteracao de producao neste
  candidato.

## Implementacao

- `openFinanceHistoricalImportPlanner` reutiliza o classificador inicial e a
  elegibilidade reais do fluxo de produto;
- configurador e CLI exigem a opcao explicita
  `--include-open-invoice-current-purchases`;
- o hash do plano inclui a opcao, impedindo equivalencia silenciosa entre os
  dois contratos;
- `hasUnsupportedInstallments` falha fechado tambem quando o provedor omite os
  campos formais mas a descricao contem uma fracao valida `N/M`.

## Evidencia local

- RED focal comprovou que o descritor parcelado e o opt-in eram ignorados;
- testes focais do RX: 78/78 verdes;
- bateria causal combinada do Gate 40 e do RX: 168/168 verdes;
+- a tentativa unica da suite geral excedeu o limite de seis minutos sem
+  produzir veredito; os processos de teste remanescentes foram encerrados e a
+  suite nao foi declarada verde nem repetida;
- recalculo privado de 2026-07-28 a 2026-08-14: 46 transicoes causais, sendo 31
  de `excluded` para `ready` e 15 de `excluded` para `needs_review`;
- todas as 46 transicoes sao `card_expense`; saldo agregado, parcelamentos e
  movimentos de sinal ou papel incompativel permaneceram excluidos;
- plano privado: 46 prontos, 26 em revisao, 17 excluidos e 2.268 fora da
  janela; cobertura completa e `financial_writes=0`;
- hash privado do plano:
  `9b0556291b122200f6bb788c74ad3d3c4e7b794021782ef902059f8f25db6778`.

## Arquivos auditaveis

- `src/openFinance/openFinanceHistoricalImportPlanner.js`;
- `src/openFinance/openFinanceLifecycleClassifier.js`;
- `src/openFinance/openFinancePurchaseProposalEligibility.js`;
- `scripts/buildOpenFinanceHistoricalImportConfig.js`;
- `scripts/runOpenFinanceHistoricalImportPlan.js`;
- `tests/openFinanceHistoricalImportPlanner.test.js`;
- `tests/openFinanceHistoricalImportConfig.test.js`;
- `tests/openFinanceHistoricalImportPlanCli.test.js`;
- `tests/openFinanceLifecycle.test.js`.

## Perguntas para auditoria independente

1. O opt-in reaproveita o contrato de produto sem redefinir `PENDING` como
   ausencia de compra?
2. O caminho permanece fechado para parcelamentos, creditos, estornos, saldos
   e pagamentos de fatura?
3. O estado bruto, a identidade do plano e o modo somente leitura continuam
   verificaveis?
4. Ha alguma lacuna causal indispensavel antes de encerrar tecnicamente o Gate
   41.1?
