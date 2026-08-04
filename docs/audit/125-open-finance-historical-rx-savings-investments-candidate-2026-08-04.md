# RX-HIST-TIME-INV-01 - candidato de poupanca e investimentos

Data: 2026-08-04

## Base e alcance

- base: `e8df950b64b74fe08d30b23a16c7fdfe629d40f2`;
- causa: preflight privado falhou fechado porque o contrato auditado omitia uma
  conta poupanca;
- alcance: contrato local, builder e testes do RX historico;
- fora do alcance: dados reais no commit, planilha, escrita financeira, Pluggy
  live, deploy, WhatsApp e producao.

## Contrato sucessor

- quatro fontes, cinco contas bancarias e quatro cartoes;
- nove segmentos: dois Daniel e sete Thais;
- Itau Thais exige exatamente `BANK:CHECKING_ACCOUNT`,
  `BANK:SAVINGS_ACCOUNT` e `CREDIT:CREDIT_CARD`;
- demais fontes exigem `BANK:CHECKING_ACCOUNT` e `CREDIT:CREDIT_CARD`;
- contagens iguais com subtipos divergentes falham fechado;
- lifecycle e segment refs continuam independentes por conta.

## Caixinhas e investimentos

- posicoes de investimento permanecem em `investments`, nunca em conta ou
  cartao;
- saldo da posicao e snapshot atual, sem reconstruir historico ausente;
- `movement_linkage=not_provided_by_provider` torna a limitacao explicita;
- conta bancaria recebe `investment_movements` somente para linhas cujo
  `operation_type` do provedor contenha aplicacao, investimento ou resgate;
- descricoes nunca sao inspecionadas para inferir movimento;
- linhas sem rotulo permanecem fora desse subtotal;
- qualquer posicao observada sem historico ligado adiciona o bloqueador
  `investment_history_unlinked` e impede reconciliacao pronta.

## Prova causal

- RED original: a quinta conta falhou em
  `historical_rx_inventory_account_count_mismatch`;
- RED adversarial: duas correntes com as mesmas contagens nao falharam antes do
  contrato de subtipos;
- RED de Caixinha: o bloco de movimentos rotulados ainda nao existia;
- testes exigem corrente, poupanca e cartao como segmentos distintos;
- poupanca desconhecida produz `account_start_unknown`;
- descricao com indicio de Caixinha e sem `operation_type` nao entra no subtotal;
- caminho sintetico totalmente resolvido continua provando `GO`; o contrato
  realista preserva bloqueadores em vez de inventar cobertura.

## Evidencia local

- syntax checks: verdes;
- teste focal: 15/15;
- bateria causal Open Finance: 337/337;
- suite hermetica final: 1.469 testes, 1.459 aprovados, 0 falhas e 10 skips
  conhecidos;
- cobertura: linhas 90,62%, branches 72,97%, funcoes 90,23%;
- rede e subprocessos externos bloqueados pelo runner hermetico;
- `financial_writes=0` preservado.

As contagens sao evidencia local relatada e nao execucao do auditor.

## Arquivos materiais

- `src/openFinance/openFinanceHistoricalRx.js`;
- `tests/openFinanceHistoricalRx.test.js`;
- `docs/audit/125-open-finance-historical-rx-savings-investments-candidate-2026-08-04.md`.

## Estado autorizado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

Este documento nao autoriza preview privado, escrita, deploy ou producao.
