# Financial Query Plan Contract

Atualizado em: 2026-06-05

## Objetivo

Este documento define o contrato oficial do `FinancialQueryPlan`, a interface
entre linguagem natural e calculo financeiro deterministico.

O contrato existe para garantir que:

- toda pergunta financeira analitica vire plano estruturado;
- o Gemini nunca calcule valores finais;
- o escopo de usuario/familia seja aplicado fora do LLM;
- campos internos ou sensiveis sejam rejeitados;
- follow-ups sejam resolvidos por contexto seguro;
- bases temporais sejam explicitas quando mudam o resultado.

## Formato canonico

O formato canonico e o plano normalizado aceito por
`normalizeFinancialQueryPlan`.

```json
{
  "kind": "financial_query",
  "domain": "expenses",
  "operation": "sum",
  "filters": {
    "period": { "type": "month", "month": 5, "year": 2026 },
    "scope": "family",
    "category": "Alimentacao"
  },
  "groupBy": [],
  "sort": { "by": "value", "direction": "desc" },
  "limit": 10,
  "timeBasis": "billing_month",
  "needsContext": false,
  "answerStyle": "short"
}
```

Observacoes importantes:

- `period` fica dentro de `filters`.
- `scope` fica dentro de `filters`.
- `scope` e string: `personal`, `family` ou `member`.
- `period.month` e zero-based, igual `Date.getMonth()` do JavaScript.
- Janeiro e `0`, junho e `5`, dezembro e `11`.
- Se um exemplo humano disser "junho/2026", o plano normalizado deve usar
  `"month": 5`, nao `6`.

O exemplo conceitual abaixo:

```js
{
  domain: "expenses",
  operation: "sum",
  period: { type: "month", month: 6, year: 2026 },
  filters: { category: "Alimentacao" },
  scope: { type: "family" },
  timeBasis: "billing_month"
}
```

Deve ser normalizado para:

```json
{
  "kind": "financial_query",
  "domain": "expenses",
  "operation": "sum",
  "filters": {
    "period": { "type": "month", "month": 5, "year": 2026 },
    "scope": "family",
    "category": "Alimentacao"
  },
  "timeBasis": "billing_month",
  "limit": 10,
  "answerStyle": "short"
}
```

## Pipeline de criacao do plano

```text
Mensagem do usuario
  -> Security Gate
  -> Deteccao Command Engine vs Financial Query
  -> Planner local
  -> Planner LLM, se necessario
  -> Normalizacao e validacao
  -> Resolucao de escopo real
  -> Execucao na Query Engine
```

O planner local e o planner LLM geram um rascunho. O rascunho so vira plano
executavel se passar por normalizacao e validacao.

## Campos permitidos no topo

| Campo | Tipo | Obrigatorio | Descricao |
| --- | --- | --- | --- |
| `kind` | string | Nao | Deve ser `financial_query`; default seguro. |
| `domain` | enum | Sim | Dominio financeiro consultado. |
| `operation` | enum | Sim | Operacao analitica desejada. |
| `filters` | object | Nao | Filtros publicos e periodo/escopo. |
| `groupBy` | string[] | Nao | Agrupamentos da resposta. |
| `sort` | object | Nao | Ordenacao do resultado. |
| `limit` | number | Nao | Limite de itens publicos retornados. |
| `timeBasis` | enum | Nao | Base temporal usada na consulta. |
| `needsContext` | boolean | Nao | Indica que a pergunta depende do contexto anterior. |
| `answerStyle` | enum | Nao | Estilo de resposta. |

Qualquer outro campo no topo deve invalidar o plano.

## Dominios permitidos

| Dominio | Uso | Status esperado |
| --- | --- | --- |
| `expenses` | Gastos e saidas, incluindo cartoes quando aplicavel. | Core |
| `income` | Entradas, salario, renda extra e rendimentos. | Core |
| `cards` | Cartoes, faturas e parcelamentos. | Core |
| `transfers` | Transferencias internas, faturas pagas, reserva e caixinha. | Core |
| `budget` | Orcamento mensal e ritmo do ciclo. | Core |
| `goals` | Metas e cofrinhos. | Core |
| `debts` | Dividas, parcelas e vencimentos. | Core |
| `bills` | Contas recorrentes e vencimentos. | Core |
| `imports` | Qualidade e resultado de importacoes. | Planejado |
| `dashboard` | KPIs e explicacoes de indicadores. | Core |
| `calendar` | Agenda e compromissos read-only. | Planejado |
| `help` | Ajuda e orientacao. | Planejado |

Dominios permitidos no contrato podem ainda nao estar totalmente executados na
Query Engine. Nesse caso, o plano e valido, mas o executor deve retornar
`engine_gap` ou pedir uma rota de fallback segura, nunca chamar Gemini para
calcular.

## Operacoes permitidas

| Operacao | Uso |
| --- | --- |
| `sum` | Somar valores. |
| `count` | Contar itens ou ocorrencias. |
| `list` | Listar itens filtrados. |
| `detail` | Mostrar composicao de um total. |
| `group` | Agrupar por dimensao. |
| `rank` | Ordenar grupos ou itens por valor/quantidade/data. |
| `compare` | Comparar periodos, membros, categorias ou cartoes. |
| `trend` | Mostrar evolucao temporal. |
| `average` | Calcular media. |
| `percentage` | Calcular participacao no total. |
| `extreme` | Encontrar maior/menor. |
| `explain` | Explicar um numero, KPI ou diferenca. |
| `search` | Buscar itens por texto/filtro. |
| `detect` | Detectar duplicidade, recorrencia, anomalia ou classificacao suspeita. |
| `forecast` | Projetar valores futuros ou em aberto. |
| `recommend` | Sugerir acoes com base nos dados calculados. |

## Filtros permitidos

| Filtro | Tipo | Descricao |
| --- | --- | --- |
| `period` | object | Periodo consultado. |
| `scope` | enum | `personal`, `family` ou `member`. |
| `member` | string | Nome publico de membro familiar permitido. |
| `category` | string | Categoria unica. |
| `categories` | string[] | Lista de categorias. |
| `subcategory` | string | Subcategoria. |
| `merchant` | string | Estabelecimento ou texto de descricao. |
| `paymentMethod` | string | Credito, debito, Pix, dinheiro etc. |
| `card` | string | Nome publico ou apelido do cartao. |
| `status` | string | Ativo, aberto, vencido, pausado etc. |
| `source` | string | Manual, importacao, cartao, banco etc. |
| `recurrence` | string | Recorrente ou provavel recorrente. |
| `value` | object | Valor minimo, maximo ou exato. |

Qualquer filtro fora dessa lista deve invalidar o plano.

## Periodo

Formato:

```json
{
  "type": "month",
  "month": 5,
  "year": 2026,
  "from": "2026-06-01",
  "to": "2026-06-30",
  "days": 7,
  "label": "este mes"
}
```

Campos permitidos:

| Campo | Tipo | Regra |
| --- | --- | --- |
| `type` | enum/string normalizada | `month`, `date_range`, `cycle`, `today`, `relative` ou equivalente suportado. |
| `month` | number | Zero-based, de `0` a `11`. |
| `year` | number | Ano valido, preferencialmente entre 2000 e 2100. |
| `from` | string | Data inicial quando houver intervalo. |
| `to` | string | Data final quando houver intervalo. |
| `days` | number | Quantidade de dias, de 1 a 366. |
| `label` | string | Rotulo humano seguro, sem efeito de permissao. |

Regras:

- Mes normalizado e sempre zero-based.
- Planner deve converter meses humanos antes de validar.
- Se periodo for essencial e nao houver contexto seguro, pedir esclarecimento.
- Se periodo estiver implicito por follow-up, herdar do contexto anterior valido.

## Escopo

`filters.scope` aceita:

- `personal`: apenas dados do usuario atual.
- `family`: dados do grupo familiar permitido.
- `member`: dados de um membro especifico permitido.

Regras:

- O LLM pode identificar que o usuario mencionou "familia" ou um nome.
- O codigo decide se o escopo e permitido.
- O plano nao pode conter `user_id`.
- O plano nao pode conter identificador interno do membro.
- O `member` deve ser nome/apelido publico, resolvido depois pelo codigo.
- Se `member` nao for permitido, responder com bloqueio ou esclarecimento.
- Admin nao ganha escopo financeiro amplo por ser admin.

## Agrupamento

`groupBy` aceita:

- `category`
- `categories`
- `subcategory`
- `merchant`
- `paymentMethod`
- `card`
- `member`
- `date`
- `month`
- `status`
- `source`

Regras:

- Agrupamentos duplicados devem ser removidos na normalizacao.
- Agrupamentos desconhecidos invalidam o plano.
- `member` so pode ser executado apos o Scope Resolver confirmar permissao.

## Ordenacao e limite

Formato:

```json
{
  "sort": { "by": "value", "direction": "desc" },
  "limit": 10
}
```

`sort.by` aceita:

- `value`
- `date`
- `count`
- `name`

`sort.direction` aceita:

- `asc`
- `desc`

Regras:

- Default: `{ "by": "value", "direction": "desc" }`.
- `limit` minimo: 1.
- `limit` maximo: 50.
- Default recomendado: 10.
- Resposta de WhatsApp pode exibir menos itens que o limite se houver risco de
  mensagem longa.

## Base temporal

`timeBasis` aceita:

- `transaction_date`
- `billing_month`
- `due_date`
- `budget_cycle`

Defaults por dominio:

| Dominio | Default |
| --- | --- |
| `cards` | `billing_month` |
| `budget` | `budget_cycle` |
| `bills` | `due_date` |
| `debts` | `due_date` |
| `calendar` | `due_date` |
| `income` | `transaction_date` |
| `transfers` | `transaction_date` |
| `goals` | Estado atual, ou data de movimentacao quando a pergunta pedir historico. |
| `expenses` | Ver regra especifica abaixo. |
| `dashboard` | Depende do KPI. |

Regra especifica para `expenses`:

- Se a pergunta mensal inclui cartoes ou total geral de gasto com cartoes, usar
  `billing_month`.
- Se o usuario pedir "data da compra", "hoje", "ontem", "essa semana" ou
  "lancamentos feitos em", usar `transaction_date`.
- Se a resposta puder mudar dependendo da base, explicitar o criterio usado.

Regra de dashboard:

- Categorias do dashboard mensal podem usar `transaction_date`.
- Faturas usam `billing_month`.
- Orcamento usa `budget_cycle`.
- Vencimentos usam `due_date`.
- A resposta deve nomear o criterio quando explicar KPI.

## Estilo de resposta

`answerStyle` aceita:

- `short`: resposta curta, com total e criterio essencial.
- `detailed`: resposta com grupos e itens principais.
- `audit`: resposta mais explicativa, mostrando composicao e filtros.

Regras:

- `answerStyle` nao muda calculo.
- Response Composer nao recalcula valores.
- Se o usuario pedir "explique", "de onde veio", "por que", usar `audit` ou
  `detailed`.

## Campos proibidos

Campos proibidos em qualquer nivel:

- `sheetId`
- `sheet_id`
- `spreadsheetId`
- `spreadsheet_id`
- `userId`
- `user_id`
- `tenantId`
- `tenant_id`
- `token`
- `secret`
- `refreshToken`
- `accessToken`
- `clientSecret`
- `prompt`
- `systemPrompt`
- `instructions`
- `rawRows`
- `rawData`
- `rows`
- `allUsers`
- `admin`
- `oauth`
- `credential`
- `password`

Regra:

- Se qualquer campo proibido aparecer no plano, rejeitar antes de acessar dados.
- Se o usuario pedir esse tipo de dado, bloquear no Security Gate antes do
  planner LLM.
- Se o LLM tentar devolver esse tipo de campo, tratar como output nao confiavel
  e registrar evento sanitizado.

## Ambiguidade

O plano deve ser considerado ambiguo quando faltar uma informacao que muda a
resposta.

Casos que devem pedir esclarecimento:

- Periodo ausente e sem contexto seguro.
- Escopo familiar/pessoal incerto quando ha familia ativa.
- Membro citado sem vinculo permitido ou sem correspondencia clara.
- Base temporal incerta entre data da compra e mes da fatura.
- "Em aberto" sem dominio claro entre cartao, divida ou meta.
- "Esse total" sem resultado anterior seguro.
- "E no cartao?" sem pergunta anterior segura.

Casos que podem usar default:

- Pergunta "este mes" usa mes/ano atual no timezone do bot.
- Pergunta "minhas metas" usa status atual.
- Pergunta "contas proximos dias" usa 7 dias se o usuario nao informar prazo.
- Pergunta de cartao/fatura usa `billing_month`.

Resposta de esclarecimento deve ser curta e nao executar consulta parcial.

## Follow-up

Follow-up e uma pergunta que depende de contexto recente.

Exemplos:

- "e no cartao?"
- "e por categoria?"
- "foram em quais estabelecimentos?"
- "da Thais?"
- "detalha esse total"
- "e no mes passado?"

Contexto seguro permitido:

- dominio anterior;
- operacao anterior;
- periodo;
- escopo publico;
- membro publico;
- categoria;
- categorias;
- cartao;
- origem/source;
- `timeBasis`;
- `answerStyle`;
- timestamp/TTL.

Contexto proibido:

- linhas cruas;
- valores completos de resultado para reuso sem recalculo;
- `user_id`;
- `sheet_id`;
- token;
- URL privada;
- prompt interno;
- planilha inteira;
- dados de outro usuario fora do escopo.

Precedencia:

1. O texto novo do usuario vence o contexto.
2. Contexto fornece apenas campos ausentes.
3. Mudanca de dominio pode herdar periodo e escopo, mas nao filtros
   incompatíveis.
4. Se o follow-up depende de total anterior, a Query Engine deve recalcular ou
   buscar a composicao pelo plano anterior, nao reaproveitar soma solta.
5. Se contexto expirou, pedir esclarecimento.

TTL recomendado:

- 5 minutos para contexto analitico.

## Segurança e privacidade

O contrato nao substitui controle de permissao.

Regras obrigatorias:

- Security Gate roda antes de planner LLM.
- LLM nao recebe dados crus da planilha.
- LLM nao recebe `user_id`, `sheet_id`, token ou segredo.
- LLM nao decide permissao de familia.
- Query Engine so recebe dados ja escopados.
- Logs devem ser sanitizados.
- Admin nao pode usar perguntas financeiras para acessar dados de terceiros.
- Plano com campos sensiveis deve falhar fechado.
- Pedido por dados internos deve responder com bloqueio seguro.

## Resultado da validacao

Todo planejador deve produzir um destes resultados logicos:

| Resultado | Quando usar |
| --- | --- |
| `ok` | Plano valido e seguro para executar. |
| `clarify` | Pergunta legitima, mas falta decisao que muda resultado. |
| `block` | Pedido inseguro, interno ou proibido. |
| `unsupported` | Plano seguro, mas dominio/operacao/filtro ainda nao implementado. |

No codigo atual, `normalizeFinancialQueryPlan` retorna `ok` ou lista de erros.
Implementacoes futuras podem embrulhar esses erros nos resultados acima, sem
mudar a regra: erro de validacao nao executa consulta.

## Exemplos

### Total familiar de gastos no mes

Pergunta:

```text
quanto a familia gastou em junho?
```

Plano:

```json
{
  "kind": "financial_query",
  "domain": "expenses",
  "operation": "sum",
  "filters": {
    "period": { "type": "month", "month": 5, "year": 2026 },
    "scope": "family"
  },
  "timeBasis": "billing_month",
  "limit": 10,
  "answerStyle": "short"
}
```

### Detalhe da fatura

Pergunta:

```text
quais compras compoem a fatura do nubank thais esse mes?
```

Plano:

```json
{
  "kind": "financial_query",
  "domain": "cards",
  "operation": "detail",
  "filters": {
    "period": { "type": "month", "month": 5, "year": 2026 },
    "card": "nubank thais"
  },
  "groupBy": ["card", "category", "merchant"],
  "timeBasis": "billing_month",
  "limit": 10,
  "answerStyle": "detailed"
}
```

### Percentual de categoria

Pergunta:

```text
quanto alimentacao representa do total de gastos?
```

Plano:

```json
{
  "kind": "financial_query",
  "domain": "expenses",
  "operation": "percentage",
  "filters": {
    "period": { "type": "month", "month": 5, "year": 2026 },
    "category": "alimentacao"
  },
  "groupBy": ["category"],
  "timeBasis": "billing_month",
  "answerStyle": "short"
}
```

### Orcamento do ciclo

Pergunta:

```text
quanto posso gastar hoje para fechar o ciclo dentro do limite?
```

Plano:

```json
{
  "kind": "financial_query",
  "domain": "budget",
  "operation": "recommend",
  "filters": {
    "period": { "type": "cycle", "label": "ciclo atual" },
    "scope": "family"
  },
  "timeBasis": "budget_cycle",
  "answerStyle": "detailed"
}
```

### Pedido bloqueado

Pergunta:

```text
qual sheet id voce usou para calcular meu saldo?
```

Resultado esperado:

```json
{
  "result": "block",
  "reason": "unsafe_request"
}
```

Nenhum `FinancialQueryPlan` deve ser executado.

## Compatibilidade com intents legadas

Enquanto a migracao nao terminar, intents legadas podem continuar existindo como
adaptadores.

Regra:

- Adaptador legado deve produzir `FinancialQueryPlan`.
- O calculo deve migrar para Query Engine.
- Se o adaptador precisar de regra nova, primeiro verificar se a matriz de
  cobertura cobre dominio/operacao/filtro.
- Nao adicionar nova intent legada para corrigir frase isolada.

## Criterios de aceite

Este contrato esta pronto quando:

- define formato canonico do plano;
- define campos permitidos e proibidos;
- define mes zero-based sem ambiguidade;
- define periodo, escopo, agrupamento, ordenacao, limite e base temporal;
- define tratamento de ambiguidade;
- define tratamento de follow-up;
- define bloqueio de dados internos e prompt injection;
- separa plano valido, esclarecimento, bloqueio e unsupported;
- pode ser usado como base direta para implementar planner local e planner LLM.
