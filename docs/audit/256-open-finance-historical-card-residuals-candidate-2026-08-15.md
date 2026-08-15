# Gate 41.7 - residuos historicos de cartao

Data: 2026-08-15

## Veredito solicitado

Avaliar se o candidato sustenta `GO TECNICO LOCAL` para encerrar os residuos
historicos de cartao sem autorizar writer, importacao real, planilha, WhatsApp
ou producao.

## Base e arquivos do produto

- base publicada: `858d0155c9115d75999a3d85c9388e2c4f5dc463`;
- `scripts/buildOpenFinanceHistoricalImportConfig.js`;
- `src/openFinance/openFinanceHistoricalImportPlanner.js`;
- `tests/openFinanceHistoricalImportConfig.test.js`;
- `tests/openFinanceHistoricalImportPlanner.test.js`.

O hash imutavel do candidato sera o commit que publicar este documento e os
quatro arquivos acima.

## Contrato implementado

1. estorno de cartao revisado exige duas decisoes privadas exatas e reciprocas;
2. o par ainda exige mesmo cartao, compra `DEBIT`, credito `CREDIT`, ambos
   `POSTED`, BRL, valores opostos, compra anterior ao estorno, distancia maxima
   de 30 dias, identidade estavel e ausencia de linha ja gravada;
3. somente o par completo e valido neutraliza compra e estorno, com zero plano
   de escrita; pares incompletos, cruzados ou ja registrados falham fechado;
4. credito de cartao sem contraparte forte vira ajuste negativo somente por
   decisao privada exata, categoria explicita, origem `CREDIT`, tipo `CREDIT` e
   estado `POSTED`;
5. no Pix financiado pelo cartao, a decisao explicita cria somente a despesa da
   taxa calculada pelo trio causal; principal bancario e principal do cartao
   continuam neutralizados;
6. compra estrangeira `POSTED` exige valor BRL positivo inteiro em centavos e
   categoria revisados; o plano preserva moeda e valor originais apenas como
   contexto de revisao;
7. compra estrangeira `PENDING` comum e excluida como fato ainda nao historico;
   ela nao recebe conversao nem plano de escrita;
8. nenhuma decisao privada, referencia, descricao, pessoa, valor ou conta real
   e versionada.

## Evidencia privada agregada

- cardinalidade preservada: `2.351 -> 2.351`;
- decisoes novas: seis pontas de tres pares de estorno, 13 ajustes de credito,
  quatro taxas de Pix financiado e tres compras estrangeiras confirmadas;
- plano final: 1.863 prontos, 2 existentes, 34 duplicatas provaveis, 291
  excluidos, zero em revisao e 161 fora da janela;
- os tres valores BRL revisados reproduzem individualmente o IOF observado e
  sao compativeis com a referencia cambial aplicavel, sem inferir saldo;
- cobertura completa, oito bindings, hash do plano
  `4b765e1a7c2ebdf3fa21d0b2659effbd1f8e979e884dc6d56c9c8a1f7230de92`,
  hash da configuracao
  `c0f4d276518013e36ca4b8dbd951e332d0d681bc4c0056ce54624dfbe2d0d9ec`,
  hash das decisoes privadas
  `66893e79268e09a6cd3c41cb2fb15106bf03455e2ee0cdeba3421d735382851f`
  e `financial_writes=0`.

## Testes executados

- syntax check dos dois arquivos executaveis alterados: verde;
- bateria focal de configurador e planejador: 79/79, sem falhas;
- controles negativos: par nao reciproco, par ja registrado, valor BRL
  ausente/invalido, moeda nao revisada, compra estrangeira pendente, fonte,
  tipo ou estado incompativeis;
- unica suite ampla final: 138 arquivos, 1.711 testes aprovados, 0 falhas e 10
  skips controlados; cobertura de linhas 91,48%;
- `git diff --check`: sem erro;
- nenhuma suite ampla foi repetida.

## Limites

- o planejador continua `writable=false`;
- nao houve chamada ao writer, alteracao de planilha, deploy, restart ou teste
  de producao;
- este candidato encerra somente a classificacao read-only do RX; a aplicacao
  financeira do plano permanece em gate separado e exige controles proprios.

## Perguntas para a auditoria

1. Os quatro tipos de decisao privada falham fechado nas fronteiras causais?
2. Pares de estorno e Pix financiado impedem dupla contabilizacao?
3. Ajustes negativos e conversoes BRL preservam sinal, centavos e evidencia?
4. Ha achado material ou lacuna indispensavel para o fechamento tecnico local
   deste escopo read-only?
