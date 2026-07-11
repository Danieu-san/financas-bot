# Recheck shadow vs legado - 2026-06-20

## Contexto

Durante a bateria manual de 2026-06-20, respostas visíveis do WhatsApp foram inicialmente avaliadas como se representassem o comportamento do sistema novo. Isso é incorreto para rollout, porque:

- `FINANCIAL_AGENT_MODE=shadow` observa perguntas analíticas read-only, mas não substitui a resposta visível;
- `FINANCIAL_AGENT_SHADOW_RECENT_ANSWER_ENABLED=true` só permite resposta direta para a ferramenta verificada `list_recent_transactions`;
- `INTERPRETATION_RELIABILITY_MODE=shadow` observa escrita financeira, mas não controla todas as respostas analíticas.

## Regra de reavaliação

Todo bloco de teste usado como evidência de rollout deve registrar:

| Campo | Obrigatório |
| --- | --- |
| Resposta visível/legado | Sim |
| Resultado do shadow/agente | Sim |
| Decisão de rollout | Sim |
| Classe da divergência | Sim |

Sem resultado do shadow/agente, o teste não conta como evidência para ativar `answer` ou ampliar `enforce`.

## Evidência coletada

Flags verificadas em produção no commit `9dea464`:

- `FINANCIAL_AGENT_MODE=shadow`
- `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=false`
- `FINANCIAL_AGENT_SHADOW_RECENT_ANSWER_ENABLED=true`
- `INTERPRETATION_RELIABILITY_MODE=shadow`
- `INTERPRETATION_RELIABILITY_OPERATIONS=expense.create,income.create`
- `DASHBOARD_ADMIN_ALL_USERS_ENABLED=false`
- `FAMILY_MODE_ENABLED=false`

Health verificado:

- PM2 online
- `/dashboard/health`: `{"ok":true,"sqlite":true}`
- `state_store.json`: `{}`

Logs sanitizados do bloco 5/6 mostraram:

- 5 chamadas do agente com `tool=list_recent_transactions`, `verified=true`;
- 11 chamadas do agente com `tool=query_financial_plan`, `verified=true`;
- 0 falhas registradas do agente nesse trecho.

## Replay read-only sanitizado

Foi executado replay sem Gemini e sem escrita usando:

- `classifyPerguntaLocally` para reconstruir planos quando possível;
- `resolveFinancialQueryScope` para escopo;
- `invokeFinancialAgent` em modo `shadow`;
- respostas sanitizadas antes de registrar evidência.

Resultados principais:

| Pergunta | Shadow/agente | Decisão |
| --- | --- | --- |
| `qual foi meu último lançamento?` | `list_recent_transactions`, `verified=true`, retornou saída antiga de 18/05/2026 | Bloqueador para `answer`: fonte/escopo/read-model não refletem a experiência esperada |
| `qual a data do meu último lançamento?` | Mesmo item de 18/05/2026, resposta não focada apenas na data | Bloqueador de composer/UX e fonte |
| `qual foi meu último gasto?` | `list_recent_transactions`, `verified=true`, saída antiga de 18/05/2026 | Bloqueador para `answer` |
| `qual foi minha última entrada?` | `list_recent_transactions`, `rows=0` | Bloqueador para `answer`: entradas não disponíveis no escopo/read-model usado |
| `quanto gastei hoje?` | `query_financial_plan`, `verified=true`, total 0 pelo escopo pessoal/read-model | Não conta para rollout; precisa alinhar escopo/fonte com o dado real do usuário |
| `quanto gastei esse mês?` | `query_financial_plan`, `verified=true`, total 0 pelo escopo pessoal/read-model | Não conta para rollout |
| Follow-ups de cartão/categoria/estabelecimento | `query_financial_plan`, `verified=true`, mas resultados vazios no replay | Não conta para rollout |

## Conclusão

O bloco 5/6 não pode ser usado como evidência verde para ativar `FINANCIAL_AGENT_MODE=answer`.

O problema não é apenas o legado responder mal. O agente também mostrou uma lacuna estrutural no replay: a ferramenta foi verificada, mas a fonte/escopo usada pelo agente não estava alinhada aos dados que o usuário espera consultar.

## Próximos passos

1. Investigar por que `financial_events_public`/read-model expõe para o agente apenas parte dos dados esperados.
2. Definir se consultas do Daniel devem usar escopo pessoal, familiar ou planilha familiar principal por padrão no agente.
3. Adicionar teste de regressão: perguntas de "último lançamento/gasto/entrada" devem usar a mesma superfície de dados que o dashboard/legado correto.
4. Só depois reexecutar os blocos 5/6 e contar evidência de rollout.

## Achado adicional - escrita de transferências em lote

Durante a bateria manual com marcador `TESTE_APAGAR_FULLLOG_20260620`, o lote:

- aplicação para caixinha;
- resgate da caixinha;
- transferência para Thaís;

foi salvo corretamente na aba `Transferências` da planilha familiar do Daniel. A validação de planilha mostrou três linhas esperadas, sem duplicidade aparente e sem impacto em `Saídas`/`Entradas`.

Entretanto, não houve registro correspondente em `data/interpretation-reliability-shadow.jsonl` para esse lote de transferências. Isso cria uma lacuna de observabilidade: o fluxo funciona, mas ainda não produz evidência suficiente para rollout de `enforce` nesse domínio.

Decisão de rollout:

- Não bloqueia `enforce` restrito a `expense.create` e `income.create` unitários.
- Bloqueia ampliar `enforce` para `transfers`, caixinha/reserva ou lotes até que a telemetria shadow cubra esse caminho.
- Próximo ajuste técnico: instrumentar transferências/lotes na camada de confiabilidade com decisão, campos críticos, severidade, quantidade de itens e zero chamadas Gemini adicionais quando possível.

## Achado adicional - blocos 5 e 6 com logs completos

Na bateria manual com `FINANCIAL_AGENT_LOG_FULL=true`, os logs do agente em shadow mostraram que as perguntas recentes passaram pela ferramenta `list_recent_transactions` e foram verificadas. As respostas de ultimo lancamento/ultimo gasto/ultima entrada voltaram a enxergar os dados recentes do marcador `TESTE_APAGAR_FULLLOG_20260620`.

Entretanto, as perguntas analiticas do bloco 6 revelaram um bloqueador para ativar `FINANCIAL_AGENT_MODE=answer` em dominios de gastos/cartoes:

- O agente em shadow respondeu `quanto gastei hoje?` com `R$ [redigido]`, mas os cartões do dia foram contados como se os mesmos lançamentos existissem em varios cartões.
- O agente em shadow respondeu `quanto gastei esse mes?` com `R$ [redigido]`, usando `cards=R$ [redigido]`, enquanto a resposta visivel/legado mostrava `cards=R$ [redigido]`.
- Em `e no cartão?`, o agente agrupou os mesmos itens em `cartao legado A`, `cartao legado C`, `cartao do membro A` e `cartao do membro B`, todos com o mesmo total, sinal de duplicacao na fonte/read-model do agente.
- Em `qual foi meu último gasto?`, a resposta visivel foi aceitavel, mas o `toolResult` interno marcou o item como `cartao legado A` apesar de o teste ter sido lançado no cartao do membro A. Isso confirma que a fonte usada por `list_recent_transactions` tambem sofre com alias/remapeamento indevido de cartões.

Causa provável:

- Caminho do agente/read-model esta lendo abas legadas `Cartão ...` que sao remapeadas para `Lançamentos Cartão`, fazendo a mesma linha aparecer uma vez por cartão legado.

Decisão de rollout:

- Bloqueava `FINANCIAL_AGENT_MODE=answer` para perguntas analiticas de gastos/cartoes ate a correcao da fonte canônica.
- Nao bloqueia `INTERPRETATION_RELIABILITY_MODE=enforce` limitado a escrita unitaria `expense.create` e `income.create`, porque os blocos de escrita unitária continuam verdes.
- Antes de reexecutar blocos 5/6 como evidencia de answer, corrigir a fonte do agente para ler apenas `Lançamentos Cartão` como fonte canônica, preservando `card_id/card_name` da propria linha.

Status da correcao local:

- `readModelService` passou a usar `Lançamentos Cartão` como fonte canônica quando a aba existe e so cair nas abas legadas `Cartão ...` quando a fonte canônica esta vazia.
- Teste de regressao cobre o caso em que quatro abas legadas remapeadas retornam o mesmo `Lançamentos Cartão`; o read-model deve manter somente uma linha com o cartao da propria linha.
- `langGraphRuntime` passou a compor respostas de `operation=extreme` sem cair no fallback generico, cobrindo maior/menor gasto.
- `langGraphRuntime` tambem ajustou a UX de respostas recentes para `Sua última entrada` e `Sua última transferência`.
- Validacao focada: `node --test tests\financialAgent.test.js` passou com 29/29.

Evidencia concluida apos deploy:

- Commit final da correcao: `19ce78c`.
- `quanto gastei hoje?`: shadow/agente `R$ [redigido]`, `transaction_date`, `verified=true`.
- `quanto gastei esse mes?`: shadow/agente `R$ [redigido]`, com `Saidas=R$ [redigido]` e `Cartoes=R$ [redigido]`, `verified=true`.
- `e no cartao?`: shadow/agente `R$ [redigido]`, 9 lancamentos, sem multiplicacao por abas legadas e com os dois gastos identicos de `R$ [redigido]` preservados em cartoes distintos.
- `maior/menor gasto`: composer especifico ativo, sem fallback generico, `verified=true`.
- `ultimo gasto` e `data do ultimo lancamento`: fonte canonica, cartao correto e resposta focada na data.

Status: bloqueadores analiticos observados nos blocos 5 e 6 foram resolvidos. Nao reabrir sem nova evidencia de regressao.
