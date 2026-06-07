# Financial Query Coverage Matrix

Atualizado em: 2026-06-05

## Objetivo

Esta matriz define o universo de perguntas financeiras que o FinancasBot deve
cobrir por composicao, nao por frases fixas.

Cada pergunta do usuario deve ser planejada como:

- dominio;
- operacao;
- filtros;
- escopo;
- base temporal;
- estilo de resposta.

Se uma pergunta nova nao encaixar nessa matriz, ela deve virar lacuna
rastreavel de cobertura, nao um novo `if` para a frase literal.

## Regras de leitura da matriz

- "Perguntas" sao exemplos de familia semantica, nao lista fechada.
- "Operacoes" usam os nomes conceituais abaixo e devem mapear para
  `FinancialQueryPlan.operation`.
- "Filtros" sao entradas permitidas ao plano, nunca permissoes de seguranca.
- "Escopo" real de usuario/familia e resolvido pelo codigo fora do LLM.
- "Base temporal" deve ser explicita quando puder mudar o resultado.
- "Resposta" nao calcula valores; apenas formata o resultado da Query Engine.

## Operacoes

| Operacao de produto | `FinancialQueryPlan.operation` | Uso |
| --- | --- | --- |
| Total | `sum` | Somar valores de um dominio ou filtro. |
| Contagem | `count` | Contar lancamentos, parcelas, contas, metas ou ocorrencias. |
| Lista | `list` | Listar itens filtrados. |
| Detalhe | `detail` | Mostrar composicao de um total com grupos e itens. |
| Ranking | `rank` | Ordenar grupos por valor, quantidade ou data. |
| Percentual | `percentage` | Calcular participacao de uma parte no total. |
| Comparacao | `compare` | Comparar periodos, categorias, pessoas, cartoes ou status. |
| Maior/menor | `extreme` | Encontrar maior e menor item. |
| Media | `average` | Calcular media por item, dia, mes ou categoria. |
| Evolucao | `trend` | Mostrar variacao ao longo do tempo. |
| Previsao | `forecast` | Projetar compromissos futuros ou parcelas abertas. |
| Explicacao | `explain` | Explicar origem de um numero, indicador ou diferenca. |
| Recomendacao | `recommend` | Sugerir cortes, prioridades ou proximas acoes com base em dados. |

## Filtros comuns

| Filtro | Uso |
| --- | --- |
| `period` | Mes, intervalo, hoje, ontem, semana, ciclo, proximos dias. |
| `scope` | Pessoal, familiar ou membro. O codigo valida permissao. |
| `member` | Pessoa citada em contexto familiar permitido. |
| `category` | Categoria unica. |
| `categories` | Lista de categorias para soma ou comparacao. |
| `subcategory` | Subcategoria ou regra mais especifica. |
| `merchant` | Estabelecimento, descricao ou busca textual aproximada. |
| `paymentMethod` | Credito, debito, Pix, dinheiro, conta corrente etc. |
| `card` | Cartao cadastrado ou nome aproximado do cartao. |
| `status` | Ativo, pausado, cancelado, concluido, aberto, vencido etc. |
| `source` | Manual, importacao, cartao, banco, transferencia ou todos. |
| `recurrence` | Recorrente, nao recorrente, provavel recorrente. |
| `value` | Minimo, maximo ou valor exato. |

## Bases temporais

| Base | Uso |
| --- | --- |
| `transaction_date` | Data real do gasto, entrada ou transferencia. |
| `billing_month` | Mes de cobranca da fatura/cartao. |
| `due_date` | Data de vencimento de conta, divida ou compromisso. |
| `budget_cycle` | Ciclo do orcamento mensal configurado pelo usuario. |

## Matriz por dominio

### Gastos

Dominio de plano: `expenses`.

Base temporal padrao:

- `billing_month` quando a pergunta mensal inclui cartoes ou total geral de
  gasto.
- `transaction_date` quando o usuario pedir explicitamente data da compra,
  gasto do dia, semana ou lancamentos fora de cartao.

| Familia de pergunta | Operacoes | Filtros principais | Resposta deve incluir |
| --- | --- | --- | --- |
| Quanto gastei em um periodo? | Total | `period`, `scope`, `member`, `source` | Total, periodo e criterio temporal. |
| Detalhe meus gastos. | Detalhe | `period`, `scope`, `member`, `source` | Total, categorias, estabelecimentos e itens principais. |
| De onde veio esse total? | Explicacao | Contexto anterior, `period`, `source` | Composicao do total e filtros herdados. |
| Quanto gastei em uma categoria? | Total | `category`, `period`, `scope` | Total da categoria e criterio. |
| Quanto duas categorias somadas deram? | Total | `categories`, `period`, `scope` | Total combinado e quebra por categoria. |
| Qual categoria consumiu mais? | Ranking | `period`, `scope`, `source` | Ranking por categoria, total e percentual. |
| Em quais estabelecimentos gastei? | Ranking, Detalhe | `merchant`, `period`, `scope`, `source` | Ranking por estabelecimento e total explicado. |
| Quantas vezes gastei com algo? | Contagem | `category`, `merchant`, `period` | Contagem e valor total relacionado. |
| Qual foi o maior ou menor gasto? | Maior/menor | `period`, `category`, `scope` | Maior, menor, valores e criterio. |
| Qual foi a media de gasto? | Media | `period`, `category`, `groupBy=date` | Media e denominador usado. |
| Como meus gastos evoluiram? | Evolucao | `period`, `category`, `scope` | Serie temporal e variacao. |
| Compare gastos entre periodos. | Comparacao | Periodo atual e anterior | Atual, anterior, diferenca e percentual. |
| Quanto uma categoria representa do total? | Percentual | `category`, `period`, `scope` | Parte, total e percentual. |
| O que posso cortar? | Recomendacao | `period`, `scope`, `category` opcional | Maiores grupos, recorrencias e sugestoes nao prescritivas. |

### Cartoes

Dominio de plano: `cards`.

Base temporal padrao: `billing_month`.

| Familia de pergunta | Operacoes | Filtros principais | Resposta deve incluir |
| --- | --- | --- | --- |
| Quanto gastei no cartao? | Total | `period`, `card`, `scope`, `member` | Total por mes da fatura e criterio. |
| Quanto tem em cada cartao? | Ranking, Lista | `period`, `scope` | Total por cartao. |
| Qual cartao pesa mais? | Ranking | `period`, `scope`, `sort=value` | Ranking por valor. |
| Qual cartao tem mais parcelas? | Ranking, Contagem | `period`, `scope`, `sort=count` | Quantidade e valor em aberto. |
| Detalhe gastos do cartao. | Detalhe | `period`, `card`, `scope` | Categorias, estabelecimentos, compras e fatura. |
| Quanto paguei no cartao? | Total | `period`, `source=card` ou transferencia de fatura | Diferenciar compra no cartao de pagamento de fatura. |
| Quais categorias pesaram no cartao? | Ranking, Percentual | `period`, `card`, `category` | Ranking por categoria e participacao. |
| Qual membro gastou em cartao? | Ranking, Detalhe | `scope=family`, `member`, `card` | Totais por membro permitido. |

### Faturas

Dominio de plano: `cards`.

Base temporal padrao: `billing_month`.

| Familia de pergunta | Operacoes | Filtros principais | Resposta deve incluir |
| --- | --- | --- | --- |
| Quanto esta a fatura do mes? | Total | `period`, `card`, `scope` | Total da fatura e mes de cobranca. |
| Quais compras compoem a fatura? | Detalhe, Lista | `period`, `card`, `scope` | Compras, categorias, estabelecimentos e parcelas. |
| Qual fatura de cada cartao? | Ranking, Lista | `period`, `scope`, `groupBy=card` | Totais por cartao. |
| Quanto paguei de fatura? | Total | `period`, `status=pagamento de fatura` | Pagamentos de fatura como transferencia, nao gasto real. |
| A fatura aumentou ou caiu? | Comparacao, Evolucao | Periodo atual e anterior, `card` | Atual, anterior e diferenca. |
| Por que a fatura veio nesse valor? | Explicacao | `period`, `card`, contexto anterior | Composicao por compra/categoria. |
| Quanto vence em faturas futuras? | Previsao | `period`, `card`, `scope` | Proximos meses e valor previsto. |

### Parcelamentos

Dominio de plano: `cards`.

Base temporal padrao: `billing_month`.

| Familia de pergunta | Operacoes | Filtros principais | Resposta deve incluir |
| --- | --- | --- | --- |
| Quais parcelamentos tenho? | Lista | `period`, `card`, `status=aberto` | Compra, parcelas, total previsto e meses. |
| Quais parcelas ainda faltam? | Previsao, Lista | `period`, `card`, `scope` | Parcelas futuras e total em aberto. |
| Qual compra parcelada foi maior? | Maior/menor, Ranking | `period`, `card` | Compra agrupada pelo total, nao parcela isolada. |
| Quanto vou pagar nos proximos meses? | Previsao | `period`, `card`, `groupBy=month` | Valor por mes de cobranca. |
| Quantas parcelas faltam por cartao? | Contagem, Ranking | `card`, `period` | Quantidade por cartao e valor total. |
| De onde vem esse valor em aberto? | Explicacao | Contexto anterior, `card` | Compras e parcelas que compoem o aberto. |

### Entradas

Dominio de plano: `income`.

Base temporal padrao: `transaction_date`.

| Familia de pergunta | Operacoes | Filtros principais | Resposta deve incluir |
| --- | --- | --- | --- |
| Quanto recebi no periodo? | Total | `period`, `scope`, `member` | Total recebido e periodo. |
| Quais entradas tive? | Lista, Detalhe | `period`, `category`, `source` | Entradas principais e categorias. |
| Quanto veio de salario? | Total | `category=salario`, `period` | Total de salario e ocorrencias. |
| Quanto veio de renda extra? | Total | `category=renda extra`, `period` | Total e fontes. |
| Minhas entradas subiram ou cairam? | Comparacao, Evolucao | Periodo atual/anterior | Variacao absoluta e percentual. |
| Qual fonte mais entrou dinheiro? | Ranking | `period`, `groupBy=merchant/category` | Ranking de fontes/categorias. |
| Isso parece renda recorrente? | Detectar, Recomendacao | `period`, `merchant`, `value` | Possivel recorrencia e sugestao de classificacao. |
| Quanto uma fonte representa da renda? | Percentual | `category` ou `merchant`, `period` | Parte, total e percentual. |

### Transferencias

Dominio de plano: `transfers`.

Base temporal padrao: `transaction_date`.

| Familia de pergunta | Operacoes | Filtros principais | Resposta deve incluir |
| --- | --- | --- | --- |
| Quais transferencias internas ocorreram? | Lista, Detalhe | `period`, `status=transferencia interna` | Origem, destino, valor e criterio. |
| Quanto transferi para alguem? | Total | `member`, `merchant`, `period` | Total e se e interno ou gasto real. |
| Pagamento de fatura entrou como o que? | Explicacao, Lista | `status=pagamento de fatura`, `period` | Mostrar que nao infla gasto real. |
| Quais transferencias podem estar erradas? | Detectar | `period`, `status=provavel` | Itens suspeitos para revisao. |
| Compare transferencias entre meses. | Comparacao, Evolucao | Periodos | Totais e diferenca. |
| Qual foi a maior transferencia? | Maior/menor | `period`, `status` | Maior/menor e contexto. |

### Caixinha e reserva

Dominio de plano: `transfers` ou `dashboard`.

Base temporal padrao: `transaction_date`.

| Familia de pergunta | Operacoes | Filtros principais | Resposta deve incluir |
| --- | --- | --- | --- |
| Quanto guardei na caixinha/reserva? | Total | `status=reserva aplicada`, `period` | Total aplicado. |
| Quanto resgatei? | Total | `status=reserva resgatada`, `period` | Total resgatado. |
| Quanto esta realmente disponivel? | Explicacao | `period`, `scope` | Saldo, reserva liquida e disponivel estimado. |
| Por que o saldo difere do dinheiro na conta? | Explicacao | `period`, contexto dashboard | Aplicado, resgatado, saldo e disponivel. |
| Como a reserva evoluiu? | Evolucao | `period`, `groupBy=month` | Aplicacoes, resgates e saldo liquido por periodo. |
| Estou guardando mais ou menos? | Comparacao | Periodos | Variacao entre periodos. |

### Orcamento

Dominio de plano: `budget`.

Base temporal padrao: `budget_cycle`.

| Familia de pergunta | Operacoes | Filtros principais | Resposta deve incluir |
| --- | --- | --- | --- |
| Qual e meu orcamento do ciclo? | Detalhe, Explicacao | `scope`, `period=cycle` | Valor, ciclo, gasto livre e restante. |
| Quanto ja usei do orcamento? | Total, Percentual | `scope`, `period=cycle` | Usado, limite, percentual e restante. |
| Quanto posso gastar hoje? | Previsao, Recomendacao | `scope`, `period=cycle` | Ritmo recomendado e restante do dia. |
| Estou acima ou abaixo do ritmo? | Comparacao, Explicacao | `scope`, `period=cycle` | Ritmo esperado vs gasto real. |
| O que esta entrando no orcamento? | Explicacao, Lista | `source`, `period=cycle` | Criterio de gasto livre e exclusoes. |
| Quem consumiu mais do orcamento familiar? | Ranking | `scope=family`, `member` | Total por membro permitido. |
| O ciclo mudou? | Lista, Explicacao | Configuracao de ciclo | Dia inicial, inicio e fim do ciclo. |
| O que cortar para fechar dentro do limite? | Recomendacao | `scope`, `period=cycle` | Categorias mais pesadas e sugestoes. |

### Metas

Dominio de plano: `goals`.

Base temporal padrao: estado atual; historico usa data de movimentacao.

| Familia de pergunta | Operacoes | Filtros principais | Resposta deve incluir |
| --- | --- | --- | --- |
| Liste minhas metas. | Lista | `status`, `scope` | Nome, alvo, atual, faltante e status. |
| Quanto falta para bater metas? | Total, Detalhe | `status=active`, `scope` | Total faltante e por meta. |
| Quanto ja guardei? | Total, Detalhe | `goal`, `scope` | Valor atual e movimentacoes se pedido. |
| Quanto retirei da meta? | Total, Lista | Historico, `goal`, `period` | Retiradas e datas. |
| Qual meta esta pausada/cancelada/concluida? | Lista, Contagem | `status` | Itens por status. |
| Quem contribuiu para meta familiar? | Ranking, Detalhe | `scope=family`, `member` | Contribuicoes por membro permitido. |
| Qual meta precisa de mais aporte? | Ranking, Recomendacao | `status=active` | Falta, prazo e aporte sugerido. |
| Explique o saldo da meta. | Explicacao | `goal`, contexto anterior | Movimentacoes que compoem saldo. |
| Como minhas metas evoluiram? | Evolucao | `goal`, `period` | Serie de aportes/retiradas. |

### Dividas

Dominio de plano: `debts`.

Base temporal padrao: `due_date`.

| Familia de pergunta | Operacoes | Filtros principais | Resposta deve incluir |
| --- | --- | --- | --- |
| Quais dividas tenho? | Lista | `status`, `scope` | Nome, saldo, parcela, vencimento e status. |
| Quanto falta quitar? | Total, Detalhe | `status=active`, `scope` | Saldo total e por divida. |
| Qual parcela vence primeiro? | Ranking, Lista | `period`, `status=active` | Ordem por vencimento. |
| Qual divida e maior? | Ranking, Maior/menor | `status=active` | Ranking por saldo/parcela. |
| Quanto paguei de divida? | Total, Lista | `period`, historico de pagamentos | Total pago e itens. |
| O que vence nos proximos dias? | Previsao, Lista | `period.days`, `due_date` | Proximos vencimentos. |
| Qual estrategia de quitacao faz sentido? | Recomendacao | `status=active`, juros se houver | Bola de neve/avalanche quando dados existirem. |
| Como fica se eu pagar mais X? | Previsao | `value`, `debt` | Simulacao local, sem alterar dados. |

### Contas

Dominio de plano: `bills`.

Base temporal padrao: `due_date`.

| Familia de pergunta | Operacoes | Filtros principais | Resposta deve incluir |
| --- | --- | --- | --- |
| Quais contas vencem nos proximos dias? | Lista, Previsao | `period.days`, `status=active` | Conta, dia, valor esperado e dias restantes. |
| O que vence amanha? | Lista | `period=relative`, `due_date` | Itens de amanha. |
| Quais contas recorrentes cadastrei? | Lista, Contagem | `recurrence`, `status` | Nome, dia, categoria e regra ativa. |
| Quanto esperava pagar de contas? | Total | `period`, `status=active` | Total esperado. |
| Qual conta veio acima do normal? | Detectar, Comparacao | `merchant`, `period` | Valor esperado vs realizado, quando houver dados. |
| Essa recorrencia ja virou conta? | Detectar, Lista | `merchant`, `recurrence` | Conta correspondente ou lacuna. |
| Explique um vencimento. | Explicacao | `bill`, contexto anterior | Dados da conta e regra de classificacao. |

### Recorrencias

Dominio de plano: depende da origem (`expenses`, `income`, `transfers`,
`bills` ou `imports` quando existir executor).

Base temporal padrao: `transaction_date` para deteccao; `due_date` quando a
recorrencia ja virou conta.

| Familia de pergunta | Operacoes | Filtros principais | Resposta deve incluir |
| --- | --- | --- | --- |
| Quais gastos se repetem todo mes? | Detectar, Ranking | `period`, `category`, `merchant` | Padroes detectados e confianca simples. |
| Quais entradas parecem recorrentes? | Detectar | `period`, `merchant`, `value` | Possivel salario/renda recorrente. |
| Quais pagamentos deveriam virar conta? | Recomendacao, Detectar | `period`, `recurrence` | Itens candidatos e sugestao. |
| Uma conta recorrente foi paga? | Detectar, Explicacao | `bill`, `period` | Conta esperada e lancamento correspondente. |
| Recorrente subiu de valor? | Comparacao, Evolucao | `merchant`, `period` | Valor atual, anterior e variacao. |
| Quais recorrencias estao canceladas? | Lista | `status=inactive` | Itens inativos ou sem recorrencia recente. |

### Familia

Familia nao e apenas um dominio; e tambem dimensao de escopo aplicavel aos
outros dominios.

Escopo real deve ser resolvido fora do LLM.

| Familia de pergunta | Operacoes | Filtros principais | Resposta deve incluir |
| --- | --- | --- | --- |
| Quanto eu gastei? | Total | `scope=member`, membro atual | Total apenas do usuario permitido. |
| Quanto a outra pessoa gastou? | Total | `scope=member`, `member` | Total se houver vinculo permitido. |
| Quanto a familia gastou? | Total, Detalhe | `scope=family`, `period` | Total familiar e criterio. |
| Quem gastou mais? | Ranking | `scope=family`, `groupBy=member` | Ranking por membro permitido. |
| Quem lancou esse item? | Busca, Detalhe | `merchant`, `value`, `period` | Responsavel publico, sem `user_id`. |
| O orcamento e pessoal ou familiar? | Explicacao | `budget`, `scope` | Escopo ativo e impacto. |
| Metas sao pessoais ou familiares? | Lista, Explicacao | `goals`, `scope` | Escopo por meta. |
| A planilha usada e a principal? | Explicacao | `scope=family` | Explicar sem expor `sheet_id`. |

### Dashboard

Dominio de plano: `dashboard`.

Base temporal padrao: depende do indicador.

| Familia de pergunta | Operacoes | Filtros principais | Resposta deve incluir |
| --- | --- | --- | --- |
| Abra meu dashboard. | Nao Query Engine | Token/dashboard command | Link seguro via fluxo proprio. |
| Por que o dashboard mostra esse saldo? | Explicacao | `period`, `scope` | Entradas, gastos, reserva e disponivel. |
| Quais dados alimentam esse grafico? | Explicacao, Detalhe | Indicador, `period` | Fonte e criterio temporal. |
| Por que maio e junho diferem? | Comparacao | Periodos | Diferenca e principais causas. |
| Qual meu disponivel estimado? | Explicacao | `period`, `scope` | Saldo, reserva liquida e disponivel. |
| O que mudou desde o mes passado? | Evolucao, Comparacao | Periodos | KPIs e variacao. |
| Quais lancamentos explicam esse KPI? | Detalhe | KPI, `period` | Itens principais e filtros. |
| O dashboard considera cartao como? | Explicacao | Indicador | Dizer data da compra, fatura ou ciclo. |

## Cobertura minima por dominio

Antes de considerar um dominio migrado para Query Engine, ele precisa cobrir:

- total;
- lista ou detalhe;
- ranking quando houver agrupamento natural;
- comparacao entre periodos quando fizer sentido;
- explicacao de total/indicador;
- filtros por periodo e escopo;
- resposta segura quando faltar contexto.

Excecoes:

- Familia nao e dominio financeiro puro; precisa de testes de escopo em todos os
  dominios sensiveis.
- Dashboard inclui abrir link, mas emissao de token e comando separado da Query
  Engine.
- Recorrencias podem depender de dados historicos suficientes; se nao houver
  dados, a resposta deve dizer que nao ha base suficiente.

## Regras de fallback

Quando uma pergunta nao for coberta, registrar lacuna com um destes motivos:

- `domain_unknown`: dominio nao identificado.
- `operation_unknown`: operacao nao identificada.
- `ambiguous_period`: periodo necessario ausente ou ambiguo.
- `ambiguous_scope`: escopo pessoal/familiar/membro incerto.
- `ambiguous_time_basis`: base temporal muda o resultado e precisa confirmacao.
- `unsupported_filter`: filtro ainda nao suportado.
- `engine_gap`: planner montou plano valido, mas executor nao suporta.
- `response_gap`: executor respondeu, mas nao ha formatador adequado.
- `unsafe_request`: pedido bloqueado por seguranca ou privacidade.

## Bateria base de aceite

Cada dominio migrado deve passar por perguntas variando:

- frase direta;
- frase informal;
- erro de digitacao;
- periodo explicito;
- periodo implicito por contexto;
- follow-up;
- escopo pessoal;
- escopo familiar quando aplicavel;
- filtro por categoria/estabelecimento/cartao quando aplicavel;
- tentativa de pedir dado interno quando aplicavel.

Exemplos transversais:

- "quanto gastei esse mes?"
- "detalha esse total"
- "e no cartao?"
- "foram em quais lugares?"
- "qual categoria levou mais dinheiro?"
- "quanto alimentacao representa do total?"
- "isso foi por data da compra ou fatura?"
- "me mostra da familia"
- "e so da Thais?"
- "qual sheet id voce usou?"

## Nao fazer nesta matriz

- Nao definir frases finais como unica fonte de verdade.
- Nao permitir que o LLM calcule valores.
- Nao permitir que o LLM escolha permissao de escopo.
- Nao incluir `user_id`, `sheet_id`, tokens ou linhas cruas como filtros de
  planner.
- Nao misturar commandos de escrita com consultas read-only.
- Nao considerar um dominio pronto sem teste de fallback e seguranca.
