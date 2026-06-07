# Financial Query Legacy Map

Atualizado em: 2026-06-05

## Resumo executivo

A Query Engine ja existe e ja cobre uma parte relevante das perguntas
financeiras, mas ainda nao e a rota unica.

O estado atual e hibrido:

- `src/query/financialQueryPlan.js` define o contrato tecnico inicial e mapeia
  intents legadas para `FinancialQueryPlan`.
- `src/query/financialQueryEngine.js` executa varios dominios de forma
  deterministica.
- `src/services/readModelService.js` tenta responder perguntas analiticas via
  SQLite/read-model antes de cair para memoria. Para gastos do pacote 01 e
  cartoes/faturas/parcelamentos do pacote 02, SQLite tambem alimenta
  `FinancialQueryPlan` + Query Engine antes do fallback legado quando o
  read-model esta sincronizado.
- `src/services/calculationOrchestrator.js` ainda tem calculos legados e alguns
  adaptadores que chamam a Query Engine por baixo. Em gastos do pacote 01 e
  cartoes/faturas/parcelamentos do pacote 02, ele ficou como adaptador
  temporario para o resultado da Query Engine.
- `src/handlers/messageHandler.js` ainda roteia por intents locais/LLM,
  carrega abas do Google Sheets em fallback e monta respostas em caminhos
  diferentes. Perguntas locais de gastos, cartoes e entradas agora carregam
  `FinancialQueryPlan` validado junto da intent temporaria.
- Gemini ainda aparece em classificacao, estruturacao, correcao de entradas e
  geracao de texto.

Conclusao: o sistema esta melhor do que antes, mas ainda pode responder duas
perguntas parecidas por criterios diferentes. A migracao deve esvaziar o legado
por dominio, nao adicionar novas frases ao roteador.

## Taxonomia usada

| Tag | Significado |
| --- | --- |
| `query_engine_primary` | Ja executa prioritariamente pela Query Engine. |
| `query_engine_adapter` | Intent legado vira plano, mas ainda passa por adaptador. |
| `sqlite_primary` | Usa SQLite/read-model antes de memoria/Sheets. |
| `memory_fallback` | Depende do read-model em memoria quando SQLite nao cobre. |
| `sheets_fallback` | Depende de leitura direta de Google Sheets no request. |
| `legacy_calculation` | Calcula em `calculationOrchestrator` sem Query Engine como fonte principal. |
| `gemini_planning_or_generation` | Depende de Gemini para classificar, estruturar ou redigir. |
| `known_inconsistent` | Ja teve ou ainda tem risco documentado de resposta incoerente. |

## Fluxo atual de pergunta financeira

```text
WhatsApp
  -> messageHandler
  -> Security/rate/onboarding/state
  -> MASTER_SCHEMA via Gemini para classificacao geral, quando necessario
  -> classifyPerguntaLocally / inferAnalyticalQueryPlan para perguntas conhecidas
  -> readModelService.executeAnalyticalIntent
  -> SQLite queryAnalyticalIntentSql, quando cobre
  -> read-model em memoria, quando SQLite nao cobre
  -> fallback de leitura direta das abas do Google Sheets
  -> calculationOrchestrator.execute
  -> resposta local ou responseGenerator/Gemini em alguns caminhos
```

Fontes principais observadas:

- `messageHandler.js` chama `getStructuredResponseFromLLM` para `MASTER_SCHEMA`.
- `messageHandler.js` tenta `classifyPerguntaLocally`.
- `messageHandler.js` chama `executeAnalyticalIntent`.
- Se o read-model falhar, `messageHandler.js` registra fallback legado e le abas
  como `Saídas`, `Entradas`, `Metas`, `Dívidas`, `Transferências`, `Contas` e
  `Lançamentos Cartão`.
- `calculationOrchestrator.js` executa intents em `operationRegistry`.

## Tabela principal

| Area | Exemplo de pergunta | Rota atual | Fonte de dados | Dependencia Gemini | Risco | Destino recomendado |
| --- | --- | --- | --- | --- | --- | --- |
| Contrato do plano | "quanto gastei este mes?" como plano | `financialQueryPlan.normalizeFinancialQueryPlan` | Nenhuma | Nao | Baixo | Manter como base e endurecer na Fase de contrato/codigo. |
| Executor generico | plano `expenses/sum` | `executeFinancialQuery` | `dataSources` ja carregado | Nao | Medio, porque ainda nao e rota unica | Migrar para Query Engine como rota principal. |
| Classificacao local | "qual categoria consumiu mais?" | `classifyPerguntaLocally` retorna intent/params | Nenhuma | Nao | Medio, ainda e intent legado | Converter para planner que retorna `FinancialQueryPlan`. |
| Perguntas comuns via read-model | "quanto gastei em fevereiro?" | `executeAnalyticalIntent` -> SQLite | SQLite/read-model | Nao | Baixo/medio | Manter SQLite como fonte preferida e alinhar com Query Engine. |
| Fallback em memoria | "quantas vezes pedi ifood?" | `executeAnalyticalIntent` -> memory fallback | read-model em memoria | Nao | Medio, custo/escala e criterios duplicados | Mover para SQLite/read-model ou Query Engine unificada. |
| Fallback Sheets | pergunta nao coberta pelo read-model | `messageHandler` le abas e chama `calculationOrchestrator` | Google Sheets direto | Nao para calculo, sim se classificacao veio do LLM | Alto, quota e inconsistencias | Reduzir ate virar excecao rara. |
| Gastos total mensal | "quanto gastei esse mes?" | `query_engine_primary` via FinancialQueryPlan; legacy intent so adapta formato | SQLite/read-model quando cobre; planilha pessoal pode usar Sheets fallback escopado | Nao apos classificar local | Baixo/medio, fallback ainda existe | Migrar planilha pessoal para read-model antes de remover fallback Sheets. |
| Gastos por categoria | "quanto gastei com alimentacao?" | `query_engine_primary` com filtro fuzzy leve | SQLite/read-model quando cobre; planilha pessoal pode usar Sheets fallback escopado | Nao apos classificar local | Baixo/medio | Consolidar resposta final no Response Composer. |
| Percentual de categoria | "quanto alimentacao representa?" | `query_engine_primary` com denominador calculado pela engine | SQLite/read-model quando cobre; planilha pessoal pode usar Sheets fallback escopado | Nao no calculo | Baixo/medio | Remover compatibilidade de formato legado apos paridade. |
| Maior/menor gasto | "qual foi meu maior gasto?" | `query_engine_primary` com base temporal explicita | SQLite/read-model quando cobre; planilha pessoal pode usar Sheets fallback escopado | Nao no calculo | Baixo/medio | Manter teste contra confusao `maior`/`maio`. |
| Detalhe de gastos | "detalhe os gastos" | `query_engine_primary` com detalhe/auditoria | SQLite/read-model quando cobre; planilha pessoal pode usar Sheets fallback escopado | Nao no calculo | Baixo/medio | Consolidar narrativa no Response Composer. |
| Ranking de estabelecimentos | "foram em quais estabelecimentos?" | `query_engine_primary` por `merchant` | SQLite/read-model quando cobre; planilha pessoal pode usar Sheets fallback escopado | Nao no calculo | Baixo/medio | Remover adaptador quando rota nova substituir intents legadas. |
| Ranking de categorias | "e por categoria?" | `query_engine_primary` por `category` | SQLite/read-model quando cobre; planilha pessoal pode usar Sheets fallback escopado | Nao no calculo | Baixo/medio | Remover adaptador quando rota nova substituir intents legadas. |
| Evolucao de gastos | "como meus gastos evoluiram nos ultimos meses?" | `query_engine_primary` com `operation=trend` e `timeBasis=billing_month` | SQLite/read-model quando cobre; planilha pessoal pode usar Sheets fallback escopado | Nao no calculo | Baixo/medio | Migrar planilha pessoal para read-model e manter serie mensal deterministicamente calculada. |
| Cartao/fatura total | "quanto esta a fatura?" | `query_engine_primary` via FinancialQueryPlan; legacy intent so adapta formato | SQLite/read-model quando cobre; Sheets fallback escopado se necessario | Nao no calculo | Baixo/medio, fallback ainda existe | Remover compatibilidade de formato legado apos paridade. |
| Composicao de fatura | "quais compras compoem a fatura?" | `query_engine_primary` com `domain=cards`, `operation=detail` | SQLite/read-model quando cobre; Sheets fallback escopado se necessario | Nao no calculo | Baixo/medio | Consolidar narrativa no Response Composer. |
| Parcelamentos em aberto | "quais parcelas ainda faltam?" | `query_engine_primary` com `operation=list/forecast` e agrupamento por compra original | SQLite/read-model com metadados de parcela; Sheets fallback escopado se necessario | Nao no calculo | Baixo/medio | Remover fallback Sheets apos sincronizacao completa de planilhas pessoais. |
| Maior compra parcelada | "qual compra parcelada foi maior?" | `query_engine_primary` com `operation=extreme` e agrupamento por compra original | SQLite/read-model com metadados de parcela; Sheets fallback escopado se necessario | Nao no calculo | Baixo/medio, porque o total da compra original e estimado por parcelas quando a janela consultada nao contem todas as parcelas | Manter a resposta clara sobre total planejado vs saldo/restante. |
| Pagamento de fatura | "quanto paguei de fatura?" | `query_engine_primary` via FinancialQueryPlan `domain=transfers` | SQLite/read-model quando cobre; Sheets fallback escopado se necessario | Nao no calculo | Baixo/medio | Remover compatibilidade de formato legado apos paridade. |
| Saldo do mes | "qual meu saldo?" | SQLite/read-model ou `saldo_do_mes` legado | SQLite, memoria ou Sheets | Nao no calculo | Medio | Unificar em Query Engine/dashboard summary. |
| Disponivel estimado | "quanto tenho disponivel depois da caixinha?" | `query_engine_primary` via FinancialQueryPlan `domain=transfers`, `operation=explain` | SQLite/read-model quando cobre; Sheets fallback escopado se necessario | Nao no calculo | Baixo/medio | Consolidar futuramente com dashboard/resumos. |
| Entradas | "quanto recebi?" | `query_engine_primary` via FinancialQueryPlan; legacy intent so adapta formato | SQLite/read-model quando cobre; Sheets fallback escopado se necessario | Nao no calculo apos classificar local | Baixo/medio, fallback ainda existe | Remover compatibilidade de formato legado apos paridade e reduzir fallback Sheets. |
| Transferencias | "transferi para Thais foi gasto?" | `query_engine_primary` via FinancialQueryPlan `domain=transfers` | SQLite/read-model quando cobre; Sheets fallback escopado se necessario; ambos recebem o Scope Resolver transversal | Nao no calculo | Baixo/medio | Manter nome citado como destino/filtro quando a pergunta nao pedir identidade de membro. |
| Orcamento mensal livre | "quanto posso gastar hoje?" | `query_engine_primary` via FinancialQueryPlan `domain=budget`, `timeBasis=budget_cycle` | SQLite/read-model com `UserSettings` + `Cartões`; Sheets fallback escopado se necessario | Nao no calculo | Baixo/medio, fallback ainda existe | Remover fallback Sheets apos sincronizacao completa; manter Command Engine para definir/alterar/desativar orcamento. |
| Metas | "liste minhas metas", "quanto falta?", "mostre o historico" | `query_engine_primary` via FinancialQueryPlan `domain=goals`; adaptador legado apenas converte formato | SQLite/read-model com `goals` + `goal_movements`; Sheets fallback escopado se necessario | Nao no calculo | Baixo/medio, fallback Sheets ainda existe | Remover adaptador de formato apos consolidar Response Composer; manter Command Engine para qualquer escrita. |
| Dividas | "quais dividas vencem?", "quanto devo no total?", "qual divida priorizar?" | `query_engine_primary` via FinancialQueryPlan `domain=debts`; adaptador legado apenas converte formato | SQLite/read-model orientado pelos cabecalhos reais de `Dívidas`; Sheets fallback escopado se necessario | Nao no calculo; criacao/pagamento seguem Command Engine | Baixo/medio, sem historico individual de pagamentos na aba atual | Manter regressao de virada de mes e compatibilidade entre schema legado/atual; remover adaptador de formato apos consolidar Response Composer; historico detalhado de pagamentos exige pacote/schema futuro. |
| Contas e vencimentos | "o que vence amanha?", "quanto era esperado e realizado?" | `query_engine_primary` via FinancialQueryPlan `domain=bills`, `timeBasis=due_date`; adaptador legado apenas converte formato | SQLite/read-model com `recurring_bills` + saidas escopadas; Sheets fallback escopado se necessario | Nao no calculo | Baixo/medio, pois pago/pendente e inferido conservadoramente por associacao com `Saídas` sem campo explicito de pagamento em `Contas`; pagamentos somente em cartao/transferencia podem permanecer pendentes | Manter Command Engine para criar/alterar conta/lembrete; preservar regressao de virada de mes/ano e isolamento pessoal/familiar; considerar identificador de regra e vinculacao explicita entre fontes em pacote/schema futuro. |
| Recorrencias | "quais gastos se repetem?" | Importador detecta; perguntas ainda nao consolidadas | Sheets/import state | Pode depender de Gemini/classificacao | Medio/alto | Criar executor `detect` por dominio. |
| Familia/escopo | "quanto a Thais gastou?", "quanto nos gastamos?" | `scope_resolver_primary`: `financialScopeResolver` decide `personal`, `family` ou `member` uma vez antes da leitura e aplica o resultado ao plano, SQLite/read-model e fallback Sheets | SQLite/read-model e Sheets recebem o mesmo escopo resolvido; tentativa de ampliar apenas por `userIds` e ignorada | Nao; LLM/planner nao decide permissao nem IDs | Baixo/medio; dashboard all-users permanece excecao separada de beta; logs operacionais legados fora da Query Engine ainda exigem sanitizacao global | Manter testes de revogacao, membro ambiguo, follow-up pessoal sem promocao para familia/membro e admin amplo bloqueado; remover/substituir excecao dashboard all-users antes de escala, conforme ADR-002; tratar logs legados em pacote proprio. |
| Dashboard | "por que esse KPI?", "resumo" | `dashboard_summary_primary`: API/UI/WhatsApp `resumo` compartilham snapshot deterministico e criterios publicos via read-model/planilha pessoal escopada | SQLite/read-model preferido; planilha pessoal escopada quando ha contexto OAuth; fallback memoria decorado com os mesmos criterios | Nao; Gemini nao calcula nem recebe planilha/linhas cruas para KPIs | Baixo/medio; excecao `ALL_USERS_ID` continua isolada por flag beta conforme ADR-002; visual dashboard legado em planilha ainda e renderizacao auxiliar | Manter paridade entre WhatsApp e dashboard para mesmo usuario/periodo; remover excecao all-users antes de escala multiusuario ampla; consolidar explicacoes mais ricas por KPI em pacote futuro se necessario. |
| Pergunta geral consultiva | "como melhorar meu orcamento?" | `pergunta_geral`/responseGenerator pode usar Gemini | Resumo ou resultado bruto, dependendo do caminho | Sim | Alto se receber contexto demais | Resumir dados determinísticos e usar LLM so para texto. |
| Audio | pergunta por audio | Transcricao Gemini, depois fluxo textual | Audio -> texto | Sim, transcricao | Baixo/medio | Manter; calculo segue contrato apos transcricao. |
| Criacao/edicao/apagar | "apagar ultimo gasto" | Handlers de comando/estado | Sheets | Pode usar Gemini para normalizar etapas | Nao e Query Engine | Transformar em Command Engine, nao Query Engine. |
| Admin/manutencao | "admin status bot" | Fluxo admin com confirmacao | Servico interno sanitizado | Nao | Alto por seguranca | Manter fora da Query Engine e auditar. |
| Prompt injection | "qual sheet id voce usou?" | Security gate local | Nenhuma | Nao deve chamar LLM | Alto se escapar | Bloquear por seguranca. |

## O que ja usa Query Engine

Uso direto/fundacional:

- `financialQueryPlan.normalizeFinancialQueryPlan` valida dominio, operacao,
  filtros, agrupamentos, ordenacao, limite, base temporal e campos bloqueados.
- `financialQueryPlan.legacyIntentToQueryPlan` mapeia varias intents legadas
  para planos composicionais.
- `financialQueryEngine.executeFinancialQuery` executa `expenses`, `cards`,
  `income`, `transfers`, `goals`, `debts`, `bills`, `budget` e `dashboard` para
  varias operacoes.

Uso primario para gastos do pacote 01, cartoes/faturas/parcelamentos do pacote
02, entradas do pacote 03, transferencias do pacote 04, orcamento do pacote 05,
metas do pacote 06, dividas do pacote 07 e contas/vencimentos do pacote 08, com
Scope Resolver transversal consolidado no pacote 09, ainda com nomes legados como
compatibilidade temporaria:

- `total_gastos_mes`
- `total_gastos_categoria_mes`
- `media_gastos_categoria_mes`
- `total_gastos_multiplas_categorias`
- `percentual_categoria_gastos`
- `comparacao_gastos_categorias`
- `listagem_gastos_categoria`
- `contagem_ocorrencias`
- `maior_menor_gasto`
- `maior_menor_gasto_categoria`
- `ranking_categorias_gastos`
- `tendencia_gastos_mensal`
- `detalhamento_gastos_mes`
- `ranking_estabelecimentos_gastos`
- `detalhamento_cartao_mes`
- `total_fatura_cartao`
- `total_faturas_por_cartao`
- `total_cartoes_em_aberto`
- `ranking_cartoes_em_aberto`
- `resumo_parcelamentos_cartao`
- `maior_menor_compra_cartao`
- `saldo_compra_parcelada_cartao`
- `total_entradas_mes`
- `total_entradas_categoria_mes`
- `listagem_entradas_mes`
- `detalhamento_entradas_mes`
- `ranking_fontes_entradas`
- `ranking_formas_recebimento`
- `maior_menor_entrada`
- `contagem_entradas_mes`
- `media_entradas_mes`
- `percentual_categoria_entradas`
- `comparacao_entradas_periodo`
- `tendencia_entradas_mensal`
- `total_transferencias_mes`
- `listagem_transferencias_mes`
- `total_reserva_aplicada_mes`
- `total_reserva_resgatada_mes`
- `total_reserva_liquida_mes`
- `total_transferencias_contas_mes`
- `total_transferencias_familia_mes`
- `transferencia_familiar_eh_gasto`
- `total_pagamentos_fatura_mes`
- `saldo_disponivel_estimado`

Risco atual:

- Ainda passam por `calculationOrchestrator`.
- Para gastos do pacote 01, cartoes/faturas/parcelamentos do pacote 02,
  entradas do pacote 03 e transferencias/reserva do pacote 04, o
  `calculationOrchestrator` adapta resultados da Query Engine, mas nao deve
  calcular o valor final.
- Ainda existe fallback Sheets escopado quando SQLite/read-model nao cobre ou
  nao esta sincronizado.
- A fonte SQLite da Query Engine para gastos/cartoes/entradas aplica filtros SQL
  de escopo, dominio e periodo antes de devolver linhas para a engine. O limite
  fixo pre-calculo foi removido apos auditoria do Packet 02 para evitar totais
  incompletos silenciosos em historicos grandes.
- Entradas usam `timeBasis=transaction_date`, isto e, data de recebimento
  registrada. Perguntas ambiguas com transferencia, caixinha/reserva ou fatura
  nao devem ser roteadas como `income`; no WhatsApp, devem pedir
  esclarecimento antes de Gemini/calculo.
- Escritas manuais como `recebi ... da caixinha/reserva` devem ser registradas
  em `Transferências`, nao em `Entradas`, para evitar inflar renda e dashboard.
- Transferencias, caixinha/reserva e pagamento de fatura usam
  `timeBasis=transaction_date`, isto e, data da transferencia registrada.
  Pagamento de fatura e reserva aplicada/resgatada sao tratados como movimentos
  internos: nao entram como gasto duplicado nem como renda nova. O disponivel
  estimado e calculado pela Query Engine a partir de saldo economico menos
  reserva liquida.
- Auditoria do Packet 04 corrigiu a resolucao de escopo em perguntas de
  transferencia: escopo pessoal explicito limita a consulta ao usuario atual,
  mas `transferencia para <membro>` preserva o escopo familiar autorizado e usa
  o nome como destino/filtro, nao como troca automatica do dono da linha.
- `gastos_valores_duplicados` ficou fora do pacote 01 porque a semantica atual
  e deteccao por valores duplicados, nao uma pergunta de consumo geral.
- `contagem_lancamentos_saida` ficou fora do pacote 01 porque conta
  literalmente linhas de `Saídas`, enquanto gasto geral deve incluir cartoes.
- `total_pagamentos_fatura_mes` ficou fora do pacote 02 porque pagamento de
  fatura e transferencia/baixa, nao compra/fatura/parcelamento de cartao.
  Perguntas como "em aberto depois do pagamento da fatura" entram em pacote
  futuro de transferencias/dashboard, nao no Packet 02.

Destino recomendado:

- Transformar esses caminhos em `query_engine_primary`.
- Manter os nomes legados apenas como compatibilidade temporaria.
- Remover fallback legado quando os testes de paridade passarem.

## O que ainda usa calculationOrchestrator legado

O `operationRegistry` ainda contem calculos diretos para varias familias:

- duplicados de gasto por valor;
- contagem literal de lancamentos em `Saídas`;
- saldo do mes;
- disponivel estimado permanece no arquivo como compatibilidade, mas o caminho
  primario do pacote 04 ja usa Query Engine;
- faturas e parcelamentos permanecem no arquivo como compatibilidade, mas o
  caminho primario do pacote 02 ja usa Query Engine;
- entradas permanecem no arquivo como compatibilidade, mas o caminho primario
  do pacote 03 ja usa Query Engine;
- pagamentos de fatura e transferencias/reserva permanecem no arquivo como
  compatibilidade, mas o caminho primario do pacote 04 ja usa Query Engine;
- contas recorrentes;
- contas vencendo;
- metas;
- comparacao de periodo.

Nem todo caminho e igualmente ruim. Alguns sao fallback aceitavel por enquanto,
mas todos devem ser vistos como temporarios para perguntas financeiras
analiticas.

Destino recomendado:

- Gastos, cartoes/faturas e entradas ja iniciaram a migracao primaria.
- Depois transferencias/reserva, orcamento, metas, dividas e contas.
- `calculationOrchestrator` deve virar adaptador fino ou ser esvaziado.

## O que depende de leitura direta da planilha

`messageHandler` ainda faz leituras diretas de abas em fallback, incluindo:

- `Saídas!A:J`
- `Entradas!A:I`
- `Transferências!A:I`
- `Contas!A:I`
- `Dívidas!A:R`
- `Metas!A:I`
- `Lançamentos Cartão!A:J`
- abas legadas de cartao como `Cartão ...`
- `Cartões!A:G`

Esse caminho e necessario hoje porque nem tudo esta no SQLite/Query Engine, mas
tem custo:

- maior risco de quota do Google Sheets;
- maior latencia;
- risco de criterios divergentes entre read-model, sheets e dashboard;
- mais pontos onde filtros de usuario/familia precisam ser aplicados
  corretamente.

Decisao do Packet 01 em 2026-06-05:

- Usuarios em planilha pessoal continuam podendo usar esse caminho como
  fallback temporario quando SQLite/read-model nao cobre ou nao esta
  sincronizado.
- O fallback deve permanecer escopado por usuario/familia antes da consulta e
  nao envia planilha inteira, linhas cruas, `user_id`, `sheet_id`, tokens,
  URLs privadas ou prompts internos ao Gemini.
- A observabilidade atual diferencia `analysis_source=personal_sheet` e
  `analysis_source=sheets_fallback`; essa lacuna deve virar trabalho proprio
  para alimentar a Query Engine pelo read-model tambem no contexto de planilha
  pessoal.
- O fallback Sheets nao e rota principal de arquitetura para gastos; e
  compatibilidade operacional ate a cobertura SQLite/read-model estar completa.

Destino recomendado:

- Reduzir `sheets_fallback` a excecao operacional.
- Garantir que todo fallback registre metricas e motivo.
- Preferir SQLite/read-model e Query Engine.

## O que depende de SQLite/read-model

Uso atual positivo:

- Dashboard APIs usam SQLite quando disponivel; WhatsApp `resumo` usa o mesmo snapshot/criterios do dashboard em vez de calculo paralelo de saude de caixa.
- `executeAnalyticalIntent` tenta `queryAnalyticalIntentSql` antes de cair para
  memoria.
- Testes `readModelSqlite` cobrem escopo por usuario, dashboard, metas e
  faturas.
- Metricas ja diferenciam `read_model.sqlite.hit`,
  `read_model.sqlite.miss` e `read_model.memory_fallback.started`.

Gaps conhecidos:

- Nem toda pergunta analitica tem SQL dedicado.
- Algumas perguntas ainda caem para read-model em memoria.
- Se memoria nao cobrir ou sincronizacao estiver atrasada, `messageHandler`
  ainda cai para Sheets.
- Para a fonte SQLite que alimenta diretamente a Query Engine em
  gastos/cartoes, filtros de escopo, dominio e periodo ja entram no SQL antes
  do calculo. Filtros fuzzy de categoria/estabelecimento/cartao continuam na
  Query Engine para preservar a semantica de normalizacao.

Destino recomendado:

- SQLite/read-model deve ser fonte preferida da Query Engine.
- Criar testes que provem quando uma pergunta nao chama Gemini nem Sheets.
- Expandir SQL para contagens, duplicados e contas.
  Transferencias ja entram no read-model SQLite com filtro de escopo e periodo
  antes do calculo no Packet 04. Orcamento tambem entra pelo SQLite/read-model
  no Packet 05 usando `UserSettings` e `Cartões` como fontes publicas/derivadas.
  A selecao da configuracao de orcamento respeita o escopo solicitado; quando
  nao ha escopo explicito, uma familia com orcamento familiar ativo prioriza
  essa configuracao, inclusive quando a consulta parte de um membro.

## O que depende demais do Gemini

Dependencias atuais:

- `MASTER_SCHEMA` no `messageHandler` usa `getStructuredResponseFromLLM` para
  classificar mensagens gerais.
- `src/ai/intentClassifier.js` usa `askLLM` para classificar intents antigas.
- `src/ai/responseGenerator.js` usa `askLLM` para redigir respostas finais.
- `creationHandler` usa `askLLM` para normalizar tipo de divida, juros e
  prioridade.
- `messageHandler` usa `getStructuredResponseFromLLM` para mapear parcelas em
  lote.
- `helpers.js` usa `askLLM` para parse auxiliar de numero/data em alguns casos.
- Audio usa Gemini para transcricao antes de cair no fluxo textual.

Dependencias aceitaveis:

- transcricao de audio;
- normalizacao de texto quando nao houver regra simples;
- planner LLM futuro, desde que retorne apenas `FinancialQueryPlan` validado;
- redacao final somente depois de calculo deterministico e com contexto
  resumido.

Dependencias a reduzir:

- Gemini como classificador principal de perguntas financeiras;
- Gemini recebendo resultados crus demais;
- Gemini redigindo resposta com oportunidade de alterar significado de valor;
- `pergunta_geral` com contexto amplo.

## Inconsistencias conhecidas

| Tema | Sintoma/risco | Estado |
| --- | --- | --- |
| Data da compra vs fatura | Total e follow-up podiam usar criterios diferentes. | Corrigido em partes, mas ainda e criterio de migracao. |
| Parser de mes | `maior` podia acionar `maio`. | Corrigido localmente; manter teste. |
| Percentual de categoria | Ja usou denominador errado por base temporal. | Corrigido em parte via Query Engine adapter. |
| Maior/menor | Ja respondeu mes errado ou base errada. | Corrigido em parte; remover fallback legado depois. |
| Fatura | Perguntas de itens podiam cair em total generico. | Corrigido em parte; migrar dominio cards. |
| Parcelamentos | Perguntas sem palavra "cartao" podiam cair em fallback. | Corrigido em parte; migrar para Query Engine/read-model. |
| Metas | Perguntas de metas ja cairam como gasto ou geral. | Corrigido em parte; migrar dominio goals. |
| Dashboard | Categoria mensal e orcamento usam bases temporais diferentes. | Intencional e agora declarado nos criterios publicos do dashboard/resumo. |
| Familia | Filtros por membro e familia eram espalhados em `messageHandler`. | Scope Resolver transversal consolidado no Packet 09; manter regressao de revogacao, ambiguidade e admin amplo bloqueado. |
| Sheets fallback | Leitura direta pode gerar quota e criterios duplicados. | Reduzir progressivamente. |
| Gemini geral | Pode ser util para linguagem, mas nao deve calcular. | Formalizado nos specs; falta aplicar em codigo. |

## Classificacao de risco

### Alta prioridade

- Familia/escopo financeiro.
- Transferencias internas e caixinha/reserva.
- Cartoes, faturas e parcelamentos.
- Perguntas que caem para Sheets em tempo real.
- `pergunta_geral` com contexto financeiro.
- Qualquer caminho que possa expor dado interno, `user_id`, `sheet_id` ou dados
  de terceiros.

### Media prioridade

- Gastos por categoria, estabelecimento, percentual, maior/menor e comparacao.
- Classificacao de renda recorrente alem dos filtros cobertos no Packet 03.
- Metas e dividas analiticas.
- Contas e recorrencias.
- Fallback em memoria do read-model.

### Baixa prioridade

- Redacao final amigavel apos resultado deterministico.
- Ajuda/manual.
- Audio, desde que a transcricao volte ao fluxo textual seguro.
- Comandos de escrita ja separados da Query Engine.

## Recomendacao de proxima fase

Ordem recomendada de migracao:

1. Gastos.
2. Cartoes, faturas e parcelamentos.
3. Entradas.
4. Transferencias, caixinha e reserva.
5. Orcamento.
6. Metas.
7. Dividas.
8. Contas e recorrencias.
9. Familia e escopo transversal.
10. Dashboard explicativo.

Regra de trabalho:

- Cada dominio deve sair do estado hibrido para `query_engine_primary`.
- SQLite/read-model deve ser fonte preferida.
- Google Sheets deve virar fallback raro e medido.
- Gemini deve virar planner/linguagem, nunca calculadora.
- Cada fallback deve registrar tag de lacuna: `engine_gap`, `response_gap`,
  `ambiguous_period`, `ambiguous_scope`, `unsupported_filter` ou
  `unsafe_request`.

## Criterios de aceite deste mapa

Este mapa cobre:

- o que ja usa Query Engine;
- o que ainda usa `calculationOrchestrator` legado;
- o que depende de leitura direta da planilha;
- o que depende de SQLite/read-model;
- o que depende demais do Gemini;
- quais respostas ja tiveram ou ainda tem risco de inconsistencia;
- qual deve ser a proxima ordem de migracao.

Nenhum dado real, token, segredo, `user_id` completo, `sheet_id` real ou valor
financeiro privado foi incluido neste documento.
