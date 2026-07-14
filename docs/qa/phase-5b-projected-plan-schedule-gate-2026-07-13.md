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

### Segundo redeploy

- commit publicado e implantado: `4a880399c08f2075a48000abfd6799df62b37f98`;
- `HEAD` da EC2 antes: `fb12c74246b8b16ff891c21267cf8e2a087c4195`;
- backup: `.env.pre-5b-scope-hotfix-4a88039-20260714T002401Z`;
- dependencias atualizadas com zero vulnerabilidades e planos remotos `42/42`;
- a primeira execucao ampla de estados cruzou a virada UTC e falhou em tres
  assercoes temporais de alerta de orcamento. Sem reiniciar o runtime, o teste
  focal passou `1/1` e a mesma suite no fuso oficial
  `America/Sao_Paulo` passou `101/101`, confirmando ausencia de regressao;
- PM2 reiniciado do PID `3188958` para `3190204`, WhatsApp pronto e health
  `{"ok":true,"sqlite":true}`;
- `HEAD` final exato no commit, worktree rastreado limpo, um admin e
  `DASHBOARD_ADMIN_ALL_USERS_ENABLED=false`.

Decisao: `GO tecnico do segundo hotfix em producao`; 5B permanece
funcionalmente `NO-GO` apenas ate repetir o smoke. A 5C segue bloqueada.

## Terceiro smoke WhatsApp - NO-GO parcial

A previsao-base passou e encontrou a meta real. A simulacao com aporte mensal
de R$ 300 tambem calculou datas coerentes: o baseline terminava em 6 meses e o
cenario em 35 meses. Entretanto, a resposta exibiu `-29 meses antecipados`,
embora a data simulada fosse 29 meses posterior.

### Terceira causa raiz e correcao local

O motor preservava corretamente `months_saved=-29`, mas os dois formatadores
publicos sempre acrescentavam `antecipado(s)`, sem interpretar o sinal.

A resposta agora possui tres estados:

- positivo: `N mes(es) antecipado(s)`;
- negativo: `N mes(es) mais tarde`, usando valor absoluto;
- zero: `sem alteracao`.

O texto tambem distingue `aporte mensal total` de `aporte mensal adicional`.
A frase `aportar R$ 300 por mes` substitui o valor mensal do cenario; `aportar
mais R$ 300 por mes` adiciona ao aporte-base. A regra foi aplicada tanto na
resposta local do WhatsApp quanto no compositor do agente.

Evidencia TDD: RED reproduziu `6 -> 35` e `-29 antecipados` nas duas
superficies; GREEN `9/9`. Regressao final: planos `43/43`, direcionada
`371/371`, suite completa `837/837`, audit zero e diff check verde. Decisao:
`GO local para terceiro redeploy`; 5B ainda requer o smoke produtivo.
