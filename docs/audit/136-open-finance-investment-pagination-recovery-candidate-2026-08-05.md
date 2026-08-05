# 136 - RX historico: recovery da paginacao de investimentos

Data: 2026-08-05

## Escopo

Recovery local de `RX-HIST-INVESTMENT-LINKAGE-01` sobre o candidato imutavel
`facee30b9725e4322b5cd5117c5499408c9f1910`. Nenhum dado privado, chamada
Pluggy live, planilha, deploy, OCI, WhatsApp ou escrita financeira pertence a
este gate.

## NO-GO independente anterior

O Chat leu integralmente o manifesto 135, quatro modulos de produto e duas
suites no hash imutavel. O parecer foi `NO-GO` e apontou:

- metadados `totalPages` contraditorios podiam ser aceitos como conclusao
  valida;
- faltavam provas explicitas para indisponibilidade em pagina posterior, lista
  200 vazia, limite de posicoes e todos os seis campos obrigatorios;
- a revisao descreveu como mistura a preservacao da posicao quando uma pagina
  posterior retorna 403/404.

A ultima caracterizacao nao se confirmou na revisao local: o cliente ja
retornava `rows: []` no 403/404 e o contrato recusava transacoes quando a
disponibilidade nao fosse `available`. Ainda assim, o recovery acrescenta a
prova direta para 403 e 404 apos uma pagina valida, exigindo historico vazio e
`unavailable`.

## Recovery

- `totalPages=0` so e valido na primeira pagina com lista vazia;
- `totalPages` positivo inferior a pagina corrente rejeita o snapshot;
- 403/404 em pagina posterior descarta integralmente as linhas anteriores da
  posicao e preserva apenas a posicao com historico indisponivel;
- 200 vazio e provado como `available` com zero transacoes;
- o limite de posicoes possui prova causal antes da coleta de historico;
- ausencia e nulidade de `type`, `quantity`, `value`, `amount`, `date` e
  `tradeDate` sao exercitadas individualmente.

## Evidencia local

- RED do recovery: 39 testes focais, 38 aprovados e uma falha esperada na
  rejeicao de `totalPages` contraditorio;
- syntax check: verde;
- teste focal final: 39/39;
- bateria causal Open Finance: 359/359;
- suite hermetica ampla final: 1.484 testes, 1.474 aprovados, zero falhas e 10
  skips conhecidos;
- cobertura final: 90,67% linhas, 73,26% branches e 90,32% funcoes;
- nenhuma rede real, dado privado, escrita financeira ou acao de producao.

## Arquivos da reauditoria

- `docs/audit/136-open-finance-investment-pagination-recovery-candidate-2026-08-05.md`;
- `src/openFinance/pluggyReadOnlyClient.js`;
- `src/openFinance/pluggyReadOnlyContract.js`;
- `src/openFinance/openFinanceHistoricalRx.js`;
- `src/openFinance/openFinanceLiveStagingVault.js`;
- `tests/openFinancePluggyReadOnly.test.js`;
- `tests/openFinanceHistoricalRx.test.js`.

## Alcance

O recovery continua somente candidato tecnico local. Seu commit pode ser
publicado para uma nova auditoria independente, mas nao autoriza chamada Pluggy
live, previa privada, salvamento, planilha, deploy ou producao.
