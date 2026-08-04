# RX-HIST-TIME-INV-01 - recovery probatorio pre-vault

Data: 2026-08-04

## Base e alcance

- base do recovery: `5cee2aa4fcd0814d0f783f6680b035e8c8408bae`;
- gate: `RX-HIST-TIME-INV-01`;
- alcance: fechar somente as lacunas probatorias da reauditoria do candidato 122;
- nenhuma chamada Pluggy, dado real, planilha, escrita financeira, deploy,
  WhatsApp ou producao.

## NO-GO confrontado

O auditor confirmou que a implementacao fechou materialmente o inventario
canonico, a ordem pre-vault e o identificador do gate, mas manteve `NO-GO` por
tres lacunas de prova:

1. ausencia de JSON sintaticamente malformado;
2. o teste provava zero abertura do vault, mas nao zero snapshot e copia;
3. ausencia de subprocesso cobrando o JSON de erro em stderr com o gate novo.

## Recovery probatorio

- `main` aceita funcoes observacionais injetaveis para snapshot e copia, usando
  as funcoes reais por padrao e preservando a entrada publica;
- tripwires contam e falham se snapshot ou copia forem chamados;
- arquivo ausente, JSON quebrado, inventario truncado, titular incorreto,
  contagem incorreta, forma extra e mapping incompleto exigem zero snapshot,
  zero copia, zero vault e nenhuma saida criada;
- subprocesso real executa a CLI com JSON quebrado e exige status 1, stdout
  vazio e stderr JSON exato com `gate=RX-HIST-TIME-INV-01`, `NO_GO`, motivo
  sanitizado e `financial_writes=0`.

## Consistencia causal

As funcoes injetaveis nao substituem decisao de produto: somente observam se a
CLI ultrapassou a fronteira. Parsing, contrato canonico, validacao de mapping,
ordem de execucao e emissao do erro continuam nas funcoes reais. O subprocesso
nao injeta dependencias e cobre a entrada executavel real protegida por
`require.main === module`.

## Evidencia local executada

- syntax checks: verdes;
- teste focal: 15/15;
- bateria causal Open Finance: 340/340;
- suite hermetica final: 1.469 testes, 1.459 aprovados, 0 falhas, 10 skips
  conhecidos e 0 todo;
- cobertura: linhas 90,62%, branches 72,96%, funcoes 90,22%;
- runner hermetico valido, com rede e subprocessos externos bloqueados;
- contagens sao evidencia local relatada, nao execucao do auditor.

## Arquivos materiais

- `scripts/runOpenFinanceHistoricalRx.js`;
- `tests/openFinanceHistoricalRx.test.js`;
- `docs/audit/123-open-finance-historical-rx-pre-vault-causal-proof-candidate-2026-08-04.md`.

## Estado autorizado

`RECOVERY PROBATORIO CANDIDATO AGUARDANDO REAUDITORIA INDEPENDENTE`.

Este documento nao autoriza preview real, escrita, deploy ou producao. Um novo
hash imutavel deve ser publicado e lido integralmente antes de qualquer GO.
