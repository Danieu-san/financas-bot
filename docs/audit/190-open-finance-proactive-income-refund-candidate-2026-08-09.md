# Gate 36 - candidato de revisao proativa de entradas e estornos

Data: 2026-08-09

## Estado proposto

`CANDIDATO LOCAL VERDE; AGUARDA AUDITORIA INDEPENDENTE`.

Este gate e estritamente read-only. Nao ativa escrita financeira, nao altera
planilhas ou ledger e nao autoriza deploy ou promocao OCI.

## Contrato implementado

- somente eventos `POSTED`, reconciliados como `new`, originam revisao;
- entradas bancarias com uma ponta oposta exata em outra conta familiar no
  intervalo de dois dias ficam adiadas para o Gate 37;
- movimentos com semantica explicita de Caixinha, reserva ou investimento
  tambem ficam adiados para o Gate 37;
- estorno usa mesma fonte/conta, valor absoluto exato, ordem temporal e uma
  identidade unica por referencia do provedor ou descricao compativel;
- compra ainda nao salva e seu estorno integral sao neutralizados, inclusive
  quando a proposta da compra nasceu em ciclo anterior;
- estorno sem vinculo unico permanece revisavel, mas nunca apto a escrita;
- a revisao e cifrada, familiar, terminal, restart-safe e usa comando explicito
  com codigo opaco, sem reutilizar `sim`;
- expiracao remove o payload cifrado e falha fechado;
- toda saida declara `financial_writes=0`.

## Arquivos do candidato

- `docs/plans/workstreams/open-finance-proactive-income-refund.md`
- `src/openFinance/openFinanceProactiveReview.js`
- `src/openFinance/openFinanceProactiveReviewStore.js`
- `src/openFinance/openFinanceProactiveReviewConversation.js`
- `src/openFinance/openFinanceCanaryRuntime.js`
- `src/openFinance/openFinanceShadowPreviewStore.js`
- `src/openFinance/openFinanceAlertOutbox.js`
- `src/openFinance/openFinanceWhatsappCanaryDelivery.js`
- `src/handlers/messageHandler.js`
- `tests/openFinanceProactiveIncomeRefund.test.js`
- `tests/financialStateMachine.test.js`

## Evidencia local

- focal Gate 36: `13/13`;
- bateria causal Open Finance A: `62/62`;
- bateria causal Open Finance B: `69/69`;
- entrada publica completa da maquina de estados: `130/130`;
- syntax check dos novos nucleos: verde;
- `git diff --check`: verde;
- suite hermetica ampla: `1580/1570/0/10`, com os dez skips previstos;
- cobertura ampla: linhas `90,93%`, branches `73,56%` e funcoes `90,62%`;
- nenhuma chamada de escrita financeira nos caminhos novos.

As contagens acima sao evidencia de execucao local do Codex e nao devem ser
tratadas pelo auditor como execucao independente.

## Limites preservados

- Gate 34 continua pausado e seu smoke funcional permanece separado;
- o blocker historico do Gate 35 continua preservado;
- transferencia, aplicacao, resgate e rendimento de reserva pertencem ao Gate
  37;
- escrita financeira e segunda confirmacao pertencem ao Gate 38;
- producao, Pluggy real, WhatsApp real e dados privados nao foram acessados.
