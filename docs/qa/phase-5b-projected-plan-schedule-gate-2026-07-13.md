# Gate da Fase 5B - cronogramas e simulacoes de planos

Data: 2026-07-13

## Veredito local

`GO local` para implantar a leitura e a simulacao deterministicas da 5B.

Este gate nao autoriza a 5C, dual-write, alteracao de fatos financeiros ou
persistencia de simulacoes. O GO de producao depende do deploy por
fast-forward, verificacao do commit exato na EC2, saude do processo e smoke
read-only no WhatsApp.

## Escopo entregue

- cronograma mensal puro para meta, divida, financiamento e consorcio;
- valores financeiros em centavos e arredondamento a cada etapa;
- PRICE, SAC e parcela observada sem inventar taxa, prazo ou saldo;
- ordem declarada: juros, custos, pagamento e reducao do principal;
- datas de fato, efeito, competencia e vencimento separadas;
- cenarios de aporte mensal, aporte adicional, retirada e pagamento extra;
- comparacao entre cenario-base projetado e cenario simulado;
- perguntas read-only sobre quando conclui/quita, quanto falta e impacto de
  antecipar;
- resposta deterministica no WhatsApp e no agente financeiro, sem reescrita do
  modelo para os numeros do cronograma;
- saida publica sanitizada, sem identidades internas ou referencias legadas.

## Invariantes comprovados

- `occurred_on` permanece nulo em toda linha projetada ou simulada;
- a data efetiva de um movimento de cenario nao e substituida pelo vencimento;
- projecao, simulacao e historico realizado permanecem rotulados e separados;
- `writes_performed=0` e nenhuma resposta cria `plan_movements`;
- fonte ausente produz `partial`/`unavailable` e premissa ausente explicita;
- taxa de juros ausente no read-model SQLite permanece nula, nunca zero;
- repeticao com a mesma entrada e data civil gera resultado identico;
- pagamento que nao amortiza e detectado e a simulacao e limitada;
- cenarios ambiguos entre varios planos pedem esclarecimento;
- `quanto falta quitar` passa pelo Query Engine 5B e nao pelo fallback generico.

## Evidencia automatizada

- sintaxe dos arquivos alterados: verde;
- `npm run test:plans`: `42/42`;
- `node --test tests/readModelSqlite.test.js`: `20/20`;
- regressao direcionada de unidade, agente, query e estados: verde;
- `npm test`: `835/835`;
- `npm audit --audit-level=high`: `0` vulnerabilidades;
- `git diff --check`: verde.

## Escritas e privacidade

O runtime novo faz somente leitura das views ja autorizadas de metas e dividas.
Ele nao chama funcoes de escrita do Google, nao altera o ledger canonico, nao
persiste o store shadow e nao grava o cenario. A resposta publica usa uma lista
fechada de campos e os testes recusam `plan_id`, `owner_user_id`,
`household_id`, `legacy_ref`, `operation_key` e fingerprints.

## Rollback

O rollback de codigo e um `git revert` do commit da 5B, seguido de restart do
PM2 e verificacao do health. Nao ha dado novo para migrar ou apagar, pois a
fatia nao persiste simulacoes nem fatos.

## Pendencia para GO de producao

- publicar e implantar o commit exato;
- confirmar PM2, Google, read-model, dashboard health e WhatsApp pronto;
- executar smoke read-only das novas perguntas sem criar divida/meta de teste
  em producao.
