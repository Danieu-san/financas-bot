# RX-HIST-TIME-INV-01 - candidato temporal e inventarial

Data: 2026-08-04

## Base e alcance

- base: `cf37ea136b34323f3ff842f86575c4fda004060e`;
- gate: `RX-HIST-TIME-INV-01`;
- alcance: contrato local read-only do RX historico;
- nenhuma chamada Pluggy, dado real, planilha, escrita financeira, deploy,
  WhatsApp ou producao.

## Motivo da reabertura

O fechamento anterior de `RX-HIST-SEG-01` foi correto para o contrato auditado,
mas nao incorporava os esclarecimentos posteriores do usuario. O RX deve
comecar em `2025-07-01`; `2026-07-28` e somente o corte a partir do qual novas
observacoes podem gerar alertas. As datas nao sao intercambiaveis.

Tambem era necessario provar o inventario familiar exato: Daniel Nubank conta e
cartao pertencem a Daniel; Thais Nubank conta e cartao, Thais Itau conta e
cartao e Cristina Nubank conta e cartao pertencem ao escopo Thais. A conta Itau
de Thais existia no inicio historico e o cartao Itau nao.

## Implementacao

- `cutoffDate` foi substituido por `historyStartDate` no builder e por
  `--history-start` na CLI;
- nomes publicos do relatorio usam `history_start_*` e nao expoem corte de
  alertas;
- lifecycle e resolvido por conta, permitindo que conta e cartao do mesmo item
  tenham datas de existencia diferentes;
- o builder exige `expectedInventory` e a CLI exige
  `--expected-inventory-file` antes de abrir o vault;
- o inventario valida aliases, titularidade e contagem exata de `BANK` e
  `CREDIT`, falhando fechado em ausencia, excesso ou divergencia;
- o resumo sanitizado declara a validacao e as contagens por tipo, sem IDs.

## Prova causal

- o fixture familiar contem quatro fontes, cada uma com uma conta e um cartao;
- as assercoes exigem 8 segmentos, 4 contas, 4 cartoes, 2 segmentos Daniel e 6
  segmentos Thais;
- assercoes distintas exigem conta Itau disponivel em `2025-07-01` e cartao
  Itau nao aplicavel nessa data;
- remover uma fonte, acrescentar um cartao ou atribuir Cristina a outro escopo
  falha fechado;
- o builder sem inventario falha fechado; a CLI sem arquivo de inventario
  falha antes de abrir o vault ou criar a saida;
- nenhum teste trata `2026-07-28` como inicio historico do RX.

## Evidencia local executada

- syntax checks: verdes;
- teste focal: 14/14;
- bateria causal Open Finance: 339/339;
- suite hermetica final: 1.468 testes, 1.458 aprovados, 0 falhas, 10 skips
  conhecidos e 0 todo;
- cobertura: linhas 90,60%, branches 72,95%, funcoes 90,23%;
- runner hermetico valido, com rede e subprocessos externos bloqueados;
- contagens sao evidencia local relatada, nao execucao do auditor.

## Arquivos materiais

- `src/openFinance/openFinanceHistoricalRx.js`;
- `scripts/runOpenFinanceHistoricalRx.js`;
- `tests/openFinanceHistoricalRx.test.js`;
- `docs/agent-memory/workstreams/open-finance-historical-rx.md`;
- `docs/plans/workstreams/open-finance-historical-rx.md`;
- `docs/audit/121-open-finance-historical-rx-temporal-inventory-candidate-2026-08-04.md`.

## Estado autorizado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

Este documento nao autoriza preview com dados reais, escrita, deploy ou
producao. O estado maximo permanece candidato ate leitura independente do hash
imutavel e dos arquivos materiais.
