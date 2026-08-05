# 135 - RX historico: transacoes de investimento por posicao

Data: 2026-08-05

## Escopo

Candidato local de `RX-HIST-INVESTMENT-LINKAGE-01`, iniciado no parent
`88f0d494286e19bdb9468ce1359c0bee2e1736d5`. Nenhum dado privado, chamada
Pluggy live, planilha, deploy, OCI, WhatsApp ou escrita financeira pertence a
este gate.

## Fonte primaria

- `GET /investments/{id}/transactions`, paginado por `pageSize` e `page`;
- tipos oficiais: `BUY`, `SELL`, `TAX`, `TRANSFER`, `INTEREST` e
  `AMORTIZATION`;
- campos obrigatorios usados no contrato: `type`, `quantity`, `value`,
  `amount`, `date` e `tradeDate`.

Referencias consultadas:

- https://docs.pluggy.ai/reference/investment-transactions-list
- https://docs.pluggy.ai/docs/investment-transactions

## Contrato do candidato

- a lista de investimentos e o historico de cada posicao possuem
  disponibilidades distintas;
- 403/404 no endpoint opcional viram `unavailable`, com contagens publicas
  nulas; lista vazia em resposta 200 permanece `available` com contagem zero;
- qualquer outro erro, warning, pagina inconsistente, limite excedido ou campo
  obrigatorio invalido rejeita o snapshot inteiro;
- chamadas sao somente `GET`, com limites explicitos de posicoes e paginas;
- o snapshot normalizado v2 descarta descricao, corretora, nota e despesas, e
  preserva apenas tipo, valores e datas necessarios ao RX;
- o vault nao exige migracao: o item normalizado inteiro continua cifrado e o
  teste prova round-trip da nova estrutura sem plaintext no SQLite;
- o RX resume o historico por posicao e nao infere ligacao com movimentacao
  bancaria por descricao, data ou valor;
- historico indisponivel continua gerando `investment_history_unlinked`;
- historico ligado pode fechar somente esse blocker. Uma movimentacao bancaria
  com rotulo/direcao contraditorios continua em
  `investment_movement_semantics_ambiguous`;
- `financial_writes=0` permanece invariavel.

## Evidencia local

- syntax check dos tres arquivos de produto e das duas suites focais: verde;
- prova RED inicial: 35 testes, 25 aprovados e 10 falhas esperadas;
- teste focal final: 36/36;
- bateria causal Open Finance: 356/356;
- uma primeira suite ampla verde foi corretamente superada depois que a revisao
  adversarial passou a rejeitar `quantity=null`; o focal foi reexecutado e a
  suite hermetica ampla final substitutiva terminou com 1.481 testes, 1.471
  aprovados, zero falhas e 10 skips conhecidos;
- cobertura final: 90,66% linhas, 73,23% branches e 90,31% funcoes;
- workflow e diff check: pendentes da preparacao final do commit;
- auditoria independente por hash imutavel: pendente.

## Arquivos da auditoria

- `src/openFinance/pluggyReadOnlyClient.js`;
- `src/openFinance/pluggyReadOnlyContract.js`;
- `src/openFinance/openFinanceHistoricalRx.js`;
- `src/openFinance/openFinanceLiveStagingVault.js`;
- `tests/openFinancePluggyReadOnly.test.js`;
- `tests/openFinanceHistoricalRx.test.js`.

## Alcance

Os testes autorizam somente a publicacao do candidato para auditoria. Nao
autorizam chamada Pluggy live, previa privada, salvamento, planilha, deploy ou
producao. Sem parecer independente, o estado maximo e candidato aguardando
auditoria.
