# Gate da Fase 5B - cronogramas e simulacoes de planos

Data: 2026-07-13

## Veredito

`GO tecnico de producao` para a leitura e a simulacao deterministicas da 5B.

Este gate nao autoriza a 5C, dual-write, alteracao de fatos financeiros ou
persistencia de simulacoes. O encerramento funcional da 5B depende somente do
smoke read-only no WhatsApp operado pelo usuario.

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

## Evidencia de deploy

- commit publicado e implantado: `8b0f7f6`;
- `HEAD` da EC2 antes: `2de67b04236882b7d5cd8f78512c545d18781986`;
- `HEAD` da EC2 depois: `8b0f7f6780c7363d38d103c638b4c89775a51eae`;
- atualizacao por `git pull --ff-only`, com worktree rastreado limpo antes e
  depois;
- backup: `.env.pre-5b-8b0f7f6-20260713T230155Z`;
- `ADMIN_IDS` com um unico admin e
  `DASHBOARD_ADMIN_ALL_USERS_ENABLED=false`;
- `npm install`: atualizado e zero vulnerabilidades;
- testes remotos: planos `42/42` e read-model `20/20`;
- PM2 online com novo PID, Google autorizado, planilha sincronizada,
  read-model pronto, integridade de usuario verde, dashboard ativo e WhatsApp
  pronto;
- health remoto: `{"ok":true,"sqlite":true}`.

## Pendencia para encerramento funcional da 5B

- executar smoke read-only das novas perguntas no WhatsApp sem criar
  divida/meta de teste em producao;
- registrar GO/NO-GO das respostas antes de iniciar 5C.

## Primeiro smoke WhatsApp - NO-GO

As quatro perguntas chegaram aos intents corretos da 5B, mas o agente canario
respondeu com zero linhas. As perguntas de meta alternaram entre mensagens
genericas e a resposta deterministica de fonte ausente. A pergunta de divida
falhou com seguranca, sem inventar saldo, mas nao validou calculo porque nao ha
divida cadastrada.

O gate real repetido depois do smoke confirmou que a planilha pessoal ainda
possuia 1 meta, 0 dividas e 0 movimentos, com paridade GO, privacidade true e
zero escritas. Portanto o problema era a fonte usada no WhatsApp, nao ausencia
do dado.

### Causa raiz

- o Financial Agent consultava primeiro o read-model central e encerrava a
  resposta mesmo quando a autoridade do usuario era uma planilha pessoal;
- o fallback de Sheets detectava a planilha pessoal, mas nao passava `userId`
  para as leituras, voltando ao spreadsheet central;
- duas frases do smoke dependiam do Gemini para serem promovidas a pergunta,
  pois o fast path ainda nao catalogava meta, aporte, retirada e alcance.

### Hotfix local

- todas as quatro frases entram no fast path deterministico;
- o agente central e ignorado quando a fonte autorizada e uma planilha pessoal;
- todas as leituras do fallback pessoal recebem `userId`, inclusive Metas e
  Dividas;
- teste de estado reproduz fonte central vazia e planilha pessoal com meta,
  valida as quatro respostas e prova zero append/delete;
- regressao afetada `371/371`, planos `42/42`, suite completa `836/836`, audit
  high zero e diff check verde.

Decisao do hotfix: `GO local para redeploy`; a 5B permanece funcionalmente
`NO-GO` ate repetir o mesmo smoke no WhatsApp.

### Redeploy do hotfix

- commit do hotfix publicado e implantado: `e7359d237deb301a09fe5c6a2ae0574a2d05ef8d`;
- `HEAD` da EC2 confirmado antes em
  `863f1013e6616f531f5554e8ed3215f26a1eafe3` e depois exatamente no commit do
  hotfix;
- backup: `.env.pre-5b-hotfix-e7359d2-20260713T233513Z`;
- `npm install`: dependencias atualizadas, audit com zero vulnerabilidades;
- testes remotos: planos `42/42` e maquina de estados financeira `41/41`;
- PM2 reiniciado do PID `3187768` para `3188958`, WhatsApp pronto e health
  `{"ok":true,"sqlite":true}`;
- worktree rastreado limpo, `ADMIN_IDS` com um unico admin e
  `DASHBOARD_ADMIN_ALL_USERS_ENABLED=false` ao final.

Decisao apos redeploy: `GO tecnico do hotfix em producao`; a 5B continua
funcionalmente `NO-GO` somente ate o usuario repetir as quatro perguntas no
WhatsApp. A 5C permanece bloqueada ate esse registro.

## Segundo smoke WhatsApp - NO-GO

As duas primeiras perguntas repetidas depois do hotfix ainda responderam que
nao havia plano ativo com dados suficientes. Os logs de `23:54` confirmaram o
caminho correto: fast path, intents `previsao_meta`/`simulacao_meta`, agente
central ignorado, planilha pessoal e fallback de Sheets com resposta local.

Uma leitura real sanitizada da mesma fonte encontrou uma meta com:

- escopo `family`, status ativo e dono igual ao usuario do contexto;
- alvo positivo, valor atual zero e aporte mensal positivo;
- data-alvo ausente, mas cronograma `available`, conclusao calculavel, nenhuma
  premissa ausente, nenhum issue e zero escritas.

### Segunda causa raiz e correcao local

O resolvedor interpretava o pronome de `minha meta` como pedido explicito de
escopo pessoal e injetava `scope=personal` no Query Plan. Isso eliminava a
unica meta, embora ela fosse familiar, autorizada e pertencente ao proprio
usuario.

A correcao mantem o conjunto autorizado restrito ao usuario atual e remove
somente o filtro de escopo em previsoes de meta sem pedido de escopo no plano.
Pedidos explicitos como `minha meta pessoal`, `somente minha` ou `individual`
continuam isolados. Nenhum outro dominio ou operacao foi ampliado.

O teste RED/GREEN agora replica o formato real sanitizado: planilha pessoal,
meta familiar do usuario, valor atual zero, data-alvo ausente e linha sem a
ultima coluna opcional. Ele valida as quatro frases, a protecao de escopo
pessoal explicito, `userId` em todas as leituras e zero append/delete.

Evidencia local: teste focal `1/1`, planos `42/42`, regressao direcionada
`371/371`, suite completa `836/836`, audit com zero vulnerabilidades e diff
check verde. Decisao: `GO local para segundo redeploy`; a 5B permanece
funcionalmente `NO-GO` ate o smoke produtivo.
