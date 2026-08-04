# RX-HIST-SEG-01 - recovery probatorio causal

Data: 2026-08-03

## Base e alcance

- base imutavel reavaliada: `1d05065646059a6c47a77e7a049300e98fb163a5`;
- gate: `RX-HIST-SEG-01`;
- alcance: somente fechamento probatorio dos achados da reauditoria;
- nenhuma chamada Pluggy, dado real, escrita financeira, deploy ou producao.

## Veredito anterior confrontado

A reauditoria independente confirmou a implementacao das barreiras, mas manteve
`NO-GO` por uma lacuna `MEDIUM` de causalidade: o teste nao exigia todo o
conjunto de derivados nulos e poderia continuar verde se fossem removidos
`readonly:true`, a abertura exclusiva da copia, o fail-closed de journal ou a
limpeza do diretorio temporario em caminho de erro.

## Recovery

- a CLI preserva o comportamento publico e agora expoe `main` e a rotina de
  copia somente como fronteira testavel;
- em producao, `main` continua usando argumentos e stdout do processo e a classe
  real `OpenFinanceLiveStagingVault`;
- o bloco executavel permanece protegido por `require.main === module`;
- testes exigem todos os campos derivados nulos para accounts, transactions e
  bills indisponiveis;
- um vault observado que herda do vault real confirma que o caminho aberto e
  diferente da fonte, esta no diretorio temporario privado e recebe
  `readonly:true`;
- o conjunto SQLite copiado e comparado com a fonte antes da abertura;
- journal nao vazio falha antes de qualquer abertura do vault ou criacao de
  relatorio;
- falha apos a abertura do vault real comprova a remocao da copia em `finally`;
- a fonte e comparada por existencia, tamanho e SHA-256 e permanece inalterada.

## Evidencia local executada

- syntax checks da CLI e dos testes: verdes;
- teste focal: 10/10;
- bateria causal ampliada: 135/135;
- suite hermetica final: 1.464 testes, 1.454 aprovados, 0 falhas, 10 skips
  conhecidos e 0 todo;
- cobertura: linhas 90,59%, branches 72,88%, funcoes 90,20%;
- runner hermetico valido, com rede e subprocessos externos bloqueados;
- contagens sao evidencia local relatada, nao execucao do auditor.

## Arquivos materiais

- `scripts/runOpenFinanceHistoricalRx.js`;
- `tests/openFinanceHistoricalRx.test.js`;
- `docs/audit/119-open-finance-historical-rx-causal-proof-recovery-candidate-2026-08-03.md`.

## Estado autorizado

`CANDIDATO AGUARDANDO REAUDITORIA INDEPENDENTE`.

Este documento nao autoriza preview com dados reais, escrita, deploy ou
producao. Um novo hash imutavel deve ser publicado e lido integralmente pelo
auditor antes de qualquer `GO TÉCNICO LOCAL`.
