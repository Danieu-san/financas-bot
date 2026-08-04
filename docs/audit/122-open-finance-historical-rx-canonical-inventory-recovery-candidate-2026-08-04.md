# RX-HIST-TIME-INV-01 - recovery de inventario canonico

Data: 2026-08-04

## Base e alcance

- base do recovery: `3103677231897f6a64b9bcd89c8cd2c16d2835e1`;
- gate: `RX-HIST-TIME-INV-01`;
- alcance: fechar somente os achados da auditoria independente do candidato 121;
- nenhuma chamada Pluggy, dado real, planilha, escrita financeira, deploy,
  WhatsApp ou producao.

## NO-GO confrontado

O auditor leu integralmente os quatro arquivos do hash base e emitiu `NO-GO`:

- `ALTA 1`: o inventario recebido era comparado somente consigo mesmo e podia
  ser menor, desde que os itens observados fossem igualmente menores;
- `ALTA 2`: forma, fonte, titularidade e contagem do arquivo so eram validadas
  depois da abertura/leitura do vault;
- `MEDIA 1`: builder e CLI ainda publicavam `RX-HIST-SEG-01`;
- causalidade parcial: o helper de teste derivava o esperado dos itens e a CLI
  aceitava um fixture de tres segmentos.

## Recovery

- o produto exporta um contrato imutavel com quatro aliases canonicos;
- cada alias exige exatamente uma conta `BANK` e um cartao `CREDIT`;
- `daniel_nubank` exige dois segmentos no escopo Daniel;
- `thais_nubank`, `thais_itau` e `cristina_nubank` exigem seis segmentos no
  escopo Thais;
- o builder rejeita inventario ausente, malformado ou diferente do canonico;
- a CLI valida o arquivo e o conjunto exato de aliases do mapping antes de
  snapshot, copia temporaria ou abertura do vault;
- a comparacao posterior com os itens reais continua exigindo aliases,
  titularidade e contagem de tipos exatos;
- builder, stdout e erro da CLI usam `RX-HIST-TIME-INV-01`.

## Prova causal

- nenhum helper deriva o inventario esperado dos itens observados;
- todos os caminhos verdes usam quatro fontes e oito segmentos;
- o builder rejeita inventario canonico truncado;
- um vault tripwire permanece fechado para arquivo ausente, fonte ausente,
  titular incorreto, contagem incorreta, forma extra e mapping incompleto;
- o subprocesso real exige `gate=RX-HIST-TIME-INV-01` e oito segmentos;
- a conta Itau Thais e o cartao Itau Thais continuam com lifecycles distintos.

## Evidencia local executada

- syntax checks: verdes;
- teste focal: 14/14;
- bateria causal Open Finance: 339/339;
- suite hermetica final: 1.468 testes, 1.458 aprovados, 0 falhas, 10 skips
  conhecidos e 0 todo;
- cobertura: linhas 90,61%, branches 72,93%, funcoes 90,24%;
- runner hermetico valido, com rede e subprocessos externos bloqueados;
- contagens sao evidencia local relatada, nao execucao do auditor.

## Arquivos materiais

- `src/openFinance/openFinanceHistoricalRx.js`;
- `scripts/runOpenFinanceHistoricalRx.js`;
- `tests/openFinanceHistoricalRx.test.js`;
- `docs/audit/122-open-finance-historical-rx-canonical-inventory-recovery-candidate-2026-08-04.md`.

## Estado autorizado

`RECOVERY CANDIDATO AGUARDANDO REAUDITORIA INDEPENDENTE`.

Este documento nao autoriza preview real, escrita, deploy ou producao. Um novo
hash imutavel precisa ser publicado e lido integralmente antes de qualquer GO.
