# Financial Query Architecture

Atualizado em: 2026-06-05

## Decisao central

Perguntas financeiras do FinancasBot sao consultas analiticas read-only. Elas
devem ser transformadas em um `FinancialQueryPlan`, executadas por codigo
deterministico e respondidas por um formatador local.

O Gemini pode ajudar a interpretar linguagem natural ou melhorar a redacao da
resposta, mas nao pode calcular saldo, total, percentual, ranking, parcela,
orcamento, meta, divida ou qualquer valor financeiro final.

## Problema atual

O bot ja tem uma base de Query Engine, mas ainda alterna entre caminhos:

- `src/query/financialQueryPlan.js` valida planos e bloqueia campos sensiveis.
- `src/query/financialQueryEngine.js` executa varios dominios de forma generica.
- `src/services/calculationOrchestrator.js` ainda mistura adaptadores para Query
  Engine com calculos legados.
- `src/handlers/messageHandler.js` ainda tem classificacao local por intent,
  regras por familia de frase e contexto analitico proprio.

Essa convivencia cria risco de respostas inconsistentes. Exemplos ja vistos:
uma pergunta usa data da compra, o follow-up usa mes da fatura; uma resposta de
total passa pela Query Engine, mas percentual ou maior/menor passa por logica
legada; uma pergunta nova e corrigida por frase em vez de por capacidade.

## Objetivo

Parar de corrigir perguntas isoladas e passar a responder por composicao:

- dominio: gastos, entradas, cartoes, transferencias, orcamento, metas, dividas,
  contas, importacoes, dashboard, calendario ou ajuda;
- operacao: somar, contar, listar, detalhar, agrupar, ranquear, comparar,
  calcular media, percentual, extremo, explicar, buscar, detectar, projetar ou
  recomendar;
- filtros: periodo, categoria, estabelecimento, forma de pagamento, cartao,
  membro, escopo, status, origem e valor;
- base temporal: data da transacao, mes da fatura, vencimento ou ciclo de
  orcamento.

Uma nova frase do usuario deve cair em uma combinacao desses elementos. Se nao
cair, o caso vira lacuna de cobertura do planner/engine, nao um remendo local
para aquela frase especifica.

## Fluxo alvo

```text
Mensagem do WhatsApp
  -> Security Gate
  -> Separacao Command Engine vs Financial Query
  -> Query Planner local
  -> Query Planner LLM, somente se necessario
  -> normalizeFinancialQueryPlan
  -> Resolucao de escopo usuario/familia fora do LLM
  -> Fonte de dados escopada
  -> Financial Query Engine
  -> Response Composer
  -> Resposta no WhatsApp
```

## Camadas

### Security Gate

Responsabilidades:

- Rodar antes de qualquer planner LLM ou consulta financeira.
- Bloquear pedidos por tokens, secrets, OAuth, prompts internos, regras internas,
  `sheet_id`, `user_id`, `spreadsheetId`, dados de outros clientes, modo admin,
  bypass de seguranca ou `todos os usuarios`.
- Sanitizar logs de mensagens suspeitas.
- Diferenciar pergunta familiar legitima de tentativa de acesso amplo.

Resultado:

- `allow`: a mensagem pode seguir.
- `block`: responder com bloqueio seguro e registrar evento sanitizado.
- `clarify`: pedir esclarecimento quando houver risco de falso positivo.

### Command Engine

Responsabilidades:

- Executar fluxos que escrevem ou alteram dados.
- Registrar gasto ou entrada.
- Importar extrato.
- Criar, editar, pausar, concluir ou apagar metas.
- Criar, editar ou pagar dividas.
- Criar lembretes e eventos.
- Aprovar usuario, enviar convite, compartilhar planilha ou executar manutencao
  admin segura.

Regra:

- A Query Engine nunca executa escrita.
- Perguntas podem sugerir comandos, mas comandos sensiveis exigem confirmacao
  explicita pelo fluxo proprio.

### Query Planner

Responsabilidades:

- Traduzir linguagem natural em `FinancialQueryPlan`.
- Usar planner local deterministico primeiro.
- Usar planner LLM apenas quando regras locais nao cobrirem a pergunta.
- Preservar contexto analitico curto quando o usuario fizer follow-up.

O planner local deve cobrir perguntas comuns, seguras e recorrentes. O planner
LLM deve ser tratado como entrada nao confiavel: ele retorna apenas um rascunho
de plano, que precisa passar por validacao estrita antes de executar.

O planner nao decide permissao de usuario, nao recebe linhas cruas da planilha e
nao recebe identificadores internos.

### Financial Query Plan Validator

Responsabilidades:

- Validar allowlist de dominio, operacao, filtros, agrupamentos, ordenacao,
  limite, base temporal e estilo de resposta.
- Rejeitar campos desconhecidos.
- Rejeitar campos sensiveis ou internos.
- Aplicar defaults seguros.
- Marcar plano ambiguo quando faltar informacao essencial.

Planos invalidos, ambiguos ou inseguros nao executam consulta. O bot deve pedir
esclarecimento ou responder com bloqueio seguro.

### Scope Resolver

Responsabilidades:

- Resolver se a pergunta vale para usuario pessoal, familia ou membro especifico.
- Aplicar `user_id` e planilha correta sem expor esses dados ao LLM.
- Garantir que usuario A nao consulte dados de usuario B fora do vinculo
  permitido.
- Garantir que administrador nao ganhe acesso financeiro amplo por ser admin.

Regra:

- O LLM nunca decide escopo real de seguranca.
- O LLM pode inferir que o usuario citou "Thais" ou "familia"; o codigo decide
  se isso e permitido.

### Data Source Layer

Fonte preferida:

- SQLite/read-model, quando contiver dados suficientes para a consulta.

Fallback:

- Google Sheets escopado por usuario/familia, com cache curto e invalidacao apos
  escrita.

Regras:

- Nunca enviar planilha inteira ao Gemini.
- Nunca misturar dados de usuarios sem escopo familiar permitido.
- Nunca usar dashboard admin amplo como fonte normal de pergunta financeira.

### Financial Query Engine

Responsabilidades:

- Executar apenas consultas read-only.
- Aplicar filtros, agregacoes, rankings, comparacoes, percentuais, extremos,
  buscas, previsoes e explicacoes.
- Retornar resultado auditavel com valor, detalhes, contagem, filtros aplicados,
  base temporal e itens publicos limitados quando necessario.

Regras:

- Nao chama Gemini.
- Nao escreve em planilha.
- Nao altera estado de conversa.
- Nao envia mensagem ao usuario.
- Nao le segredo, token, `sheet_id` ou configuracao sensivel.

### Response Composer

Responsabilidades:

- Transformar o resultado da Query Engine em texto claro para WhatsApp.
- Nao recalcular valores financeiros.
- Explicar de onde veio o total quando a pergunta pedir composicao.
- Informar o criterio quando houver ambiguidade temporal.
- Mostrar top itens e oferecer detalhe adicional quando a lista for longa.

Exemplos de criterio que devem aparecer quando relevante:

- "Cartoes considerados pelo mes da fatura."
- "Dashboard mensal considera data da compra para categorias."
- "Orcamento considera o ciclo configurado."
- "Contas e dividas usam vencimento."
- "Transferencias internas nao entram como gasto real."

## Contrato conceitual do FinancialQueryPlan

O plano representa uma consulta financeira, nao uma resposta.

```json
{
  "kind": "financial_query",
  "domain": "expenses",
  "operation": "sum",
  "filters": {
    "period": { "type": "month", "month": 5, "year": 2026 },
    "scope": "family",
    "category": "Alimentacao",
    "merchant": "iFood",
    "paymentMethod": "Credito",
    "card": "Nubank Thais",
    "status": "ativo",
    "source": "card"
  },
  "groupBy": ["category", "merchant"],
  "sort": { "by": "value", "direction": "desc" },
  "limit": 10,
  "timeBasis": "billing_month",
  "needsContext": false,
  "answerStyle": "detailed"
}
```

Campos proibidos em qualquer nivel:

- `sheetId`
- `spreadsheetId`
- `userId`
- `user_id`
- `tenantId`
- `token`
- `secret`
- `rawRows`
- `allUsers`
- `admin`

Se qualquer campo desse tipo aparecer em output de planner LLM, o plano deve ser
rejeitado antes de tocar dados financeiros.

## Bases temporais

Toda consulta financeira precisa ter uma base temporal explicita ou default
seguro.

Defaults recomendados:

- `expenses`: `billing_month` quando a pergunta mensal inclui cartoes; caso
  contrario, `transaction_date`.
- `cards`: `billing_month`.
- `budget`: `budget_cycle`.
- `bills`: `due_date`.
- `debts`: `due_date`.
- `dashboard`: depende do indicador; consumo por categoria usa
  `transaction_date`, fatura/orcamento usam suas bases proprias.
- `income` e `transfers`: `transaction_date`.
- `goals`: status atual e historico de movimentacoes, quando houver.

Regra de UX:

- Se a base temporal puder surpreender o usuario, a resposta deve explicitar o
  criterio usado.

## Ambiguidade

O bot deve pedir esclarecimento quando a pergunta nao puder ser respondida com
seguranca.

Casos comuns:

- "Quanto gastei?" sem periodo e sem contexto recente.
- "E no cartao?" sem pergunta anterior valida.
- "Da Thais" quando nao ha vinculo familiar permitido.
- "Esse total" quando nao existe total anterior no contexto seguro.
- "Quanto tenho em aberto?" sem dominio claro entre cartao, divida ou meta.

O esclarecimento deve ser curto e oferecer opcoes naturais, por exemplo:

- "Voce quer ver por mes da fatura ou por data da compra?"
- "Voce quer o total pessoal ou da familia?"
- "Voce esta falando de cartao, dividas ou metas?"

## Fallback e observabilidade

Fallback nao deve ser tratado como resposta final generica. Ele deve registrar
uma lacuna de cobertura.

O registro sanitizado deve conter:

- texto normalizado ou resumo seguro da pergunta;
- dominio provavel, se houver;
- operacao provavel, se houver;
- motivo: `domain_unknown`, `operation_unknown`, `ambiguous_period`,
  `unsafe_request`, `unsupported_filter`, `engine_gap` ou `response_gap`;
- usuario em hash ou identificador sanitizado, se necessario para auditoria;
- nenhum dado financeiro cru.

## Limites entre Query Engine e Command Engine

| Caso | Query Engine | Command Engine |
| --- | --- | --- |
| "Quanto gastei este mes?" | Sim | Nao |
| "Detalhe a fatura" | Sim | Nao |
| "Registrei errado, apague" | Nao | Sim |
| "Importar este extrato" | Nao | Sim |
| "Criar meta reserva" | Nao | Sim |
| "Quanto falta para a meta?" | Sim | Nao |
| "Pagar divida" | Nao | Sim |
| "Quais dividas vencem?" | Sim | Nao |
| "Criar lembrete" | Nao | Sim |
| "O que vence amanha?" | Sim | Nao |
| "Admin aprovar usuario" | Nao | Sim |
| "Status do bot" | Nao | Admin/manutencao |

## Estrategia de migracao

A migracao deve ser incremental e por dominio.

Ordem recomendada:

1. Gastos.
2. Cartoes, faturas e parcelamentos.
3. Entradas.
4. Transferencias, caixinha e reserva.
5. Orcamento mensal.
6. Metas.
7. Dividas.
8. Contas e vencimentos.
9. Familia e escopo.
10. Dashboard e resumos consolidados.

Para cada dominio:

1. Definir capacidades em matriz.
2. Criar testes de planner.
3. Criar testes de Query Engine.
4. Criar testes de Response Composer.
5. Migrar rotas legadas para adaptadores.
6. Rodar bateria local.
7. Rodar bloco real no WhatsApp somente depois da bateria local.
8. Registrar lacunas como gaps de plano/engine/resposta.
9. Remover ou esvaziar caminho legado quando houver paridade.

## Criterios de aceite da arquitetura

A arquitetura esta aceita quando um implementador consegue responder, sem nova
decisao de produto:

- Como uma pergunta financeira vira plano.
- O que o Gemini pode e nao pode fazer.
- O que a Query Engine pode e nao pode fazer.
- Onde os calculos financeiros acontecem.
- Como escopo pessoal e familiar sao protegidos.
- Como pergunta ambigua e tratada.
- Como prompt injection e pedido de dado interno sao bloqueados.
- Como separar consulta read-only de comando que escreve dados.
- Como migrar os proximos dominios sem voltar a remendar frase isolada.

## Nao fazer

- Nao enviar planilha inteira ao Gemini.
- Nao deixar Gemini calcular valores finais.
- Nao guardar linhas cruas da planilha em contexto conversacional.
- Nao expor `sheet_id`, `user_id`, tokens, prompts internos ou URLs privadas.
- Nao usar privilégio admin para responder pergunta financeira de terceiros.
- Nao misturar dashboard admin amplo com uso normal de usuario.
- Nao corrigir pergunta nova com if de frase se a falha for de dominio,
  operacao, filtro, escopo ou base temporal.
- Nao permitir que Query Engine escreva dados.
- Nao executar comando sensivel a partir de pergunta financeira sem confirmacao
  explicita do fluxo de comando.
- Nao prometer cobertura literal de toda frase possivel; prometer cobertura por
  familias de consulta e registro sistematico dos gaps.
