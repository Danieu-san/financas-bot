# RX-HIST-TIME-INV-01 - candidato de ambiguidade de parcelas

Data: 2026-08-04

## Base e causa factual

- base publicada: `677ba84a1f5c4f47cccff5314682464e6ef895e2`;
- a unica previa privada read-only autorizada terminou em `NO_GO` antes de
  criar relatorio, com `duplicate_historical_rx_installment_number`;
- o conjunto SQLite copiado permaneceu byte a byte inalterado;
- `financial_writes=0`;
- diagnostico sanitizado encontrou uma unica colisao heuristica: duas linhas
  observadas, IDs distintos, mesma parcela e mesmos metadados economicos, sem
  identificador forte, mas com datas distintas;
- nenhum ID, descricao, valor ou data privada foi publicado.

## Decisao causal

Sem identidade forte, o RX nao pode concluir se as linhas sao duplicatas ou
compras distintas. O candidato portanto:

- preserva a contagem de todas as linhas observadas;
- mantem os numeros de parcela observados sem duplicacao logica;
- registra os numeros repetidos em `duplicate_numbers`;
- marca a serie como `ambiguous_duplicate_installment_number`;
- nao infere `missing_numbers` para a serie ambigua;
- marca os totais do cartao como `ambiguous_raw_provider_rows`;
- adiciona `installment_series_ambiguous` aos blockers;
- mantem `ready_for_reconciliation=false` e nunca sintetiza, exclui ou grava.

## Prova causal

- RED: a fixture reproduziu `duplicate_historical_rx_installment_number`;
- GREEN focal: 17/17;
- bateria causal Open Finance: 338/338;
- a CLI real grava relatorio sanitizado com exit 2, blocker explicito e copia
  SQLite inalterada;
- IDs e descricoes sinteticos da colisao nao aparecem em stdout ou relatorio;
- suite hermetica ampla: 1.471 testes, 1.461 aprovados, 0 falhas e 10 skips
  conhecidos;
- cobertura: linhas 90,63%, branches 73,02%, funcoes 90,26%.

## Arquivos materiais

- `src/openFinance/openFinanceHistoricalRx.js`;
- `tests/openFinanceHistoricalRx.test.js`;
- este manifesto.

## Estado autorizado

`CANDIDATO LOCAL AGUARDANDO AUDITORIA INDEPENDENTE`.

Nao autoriza nova previa privada, planilha, escrita financeira, deploy,
WhatsApp ou producao.
