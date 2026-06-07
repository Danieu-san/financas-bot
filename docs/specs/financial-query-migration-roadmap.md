# Financial Query Migration Roadmap

Atualizado em: 2026-06-05

## Objetivo

Este documento define a ordem oficial de migracao da camada atual hibrida de perguntas financeiras para uma Query Engine dominante.

A meta final e que toda pergunta financeira analitica/read-only saia do caminho de frases soltas, calculos legados e respostas improvisadas, e passe pelo fluxo:

`mensagem -> Security Gate -> Query Planner -> validacao do FinancialQueryPlan -> Scope Resolver -> fonte de dados -> Query Engine -> Response Composer`.

Uma fase de dominio so e considerada concluida quando o dominio deixa de ser hibrido e passa a ser `query_engine_primary`, com testes cobrindo planner, engine, resposta, seguranca e perguntas reais.

## Fontes de referencia

- `docs/specs/financial-query-architecture.md`: arquitetura alvo e limites entre Query Engine e Command Engine.
- `docs/specs/financial-query-coverage-matrix.md`: universo de perguntas por dominio, operacao, filtro, tempo e escopo.
- `docs/specs/financial-query-plan-contract.md`: contrato oficial do `FinancialQueryPlan`, campos permitidos/proibidos e tratamento de ambiguidade.
- `docs/audits/financial-query-legacy-map.md`: mapa do legado, rotas hibridas, riscos e dependencias atuais.

## Principios

- Um dominio so avanca para pronto quando sua rota principal for `query_engine_primary`.
- SQLite/read-model e a fonte preferida para leitura; Google Sheets deve ser fallback escopado, justificado e observavel.
- Gemini pode interpretar linguagem natural e ajudar na redacao, mas nao pode calcular saldo, total, percentual, ranking, parcelas, previsao, orcamento, meta, divida ou comparacao.
- O planner LLM, quando usado, retorna apenas plano estruturado validado por `normalizeFinancialQueryPlan`.
- Escopo pessoal/familiar e resolvido fora do LLM; o planner nao recebe nem decide `user_id`, `sheet_id`, tokens, links privados ou linhas cruas.
- Query Engine e read-only. Escritas continuam na Command Engine: registrar gasto, importar extrato, criar meta, apagar item, admin, onboarding, OAuth, calendario de escrita e manutencao.
- Toda resposta financeira deve informar a base temporal relevante quando isso mudar o resultado: data da compra, mes da fatura, vencimento ou ciclo de orcamento.
- Fallback nao pode ser um "nao entendi" perdido. Toda lacuna deve ser rastreavel como falta de cobertura de planner, engine, dado ou resposta.

## Padrao fixo por dominio

Cada dominio deve seguir o mesmo roteiro:

1. Preparar planner: mapear frases reais para `FinancialQueryPlan`, com regras locais primeiro e planner LLM apenas como fallback validado.
2. Executar Query Engine: implementar ou completar operacoes do dominio sem calculo financeiro no Gemini.
3. Compor resposta: usar Response Composer que transforma resultado auditavel em WhatsApp sem recalcular valores.
4. Testar: cobrir planner, engine, resposta, follow-up, ambiguidade, seguranca e perguntas reais.
5. Observar fallback: registrar lacunas de cobertura de forma sanitizada.
6. Remover legado: depois de paridade, retirar ou isolar o fallback legado que calculava aquele dominio.

## Gates entre fases

Nao avancar para o proximo dominio se qualquer gate abaixo falhar:

- Vazamento de escopo: pergunta de um usuario pode ler dado de outro usuario fora do vinculo autorizado.
- Inconsistencia temporal: respostas misturam data de compra, mes da fatura, vencimento ou ciclo sem declarar criterio.
- Sheets fallback injustificado: caminho comum ainda depende de leitura direta do Google Sheets no request sem motivo.
- Gemini calculando: valores finais, percentuais, rankings ou previsoes sao calculados pelo LLM.
- Plano inseguro: planner aceita campo interno/sensivel ou pedido de bypass/admin/dado de terceiros.
- Follow-up inseguro: contexto conversacional guarda dados crus, IDs internos, tokens ou listas financeiras completas.
- Sem teste realista: dominio nao tem perguntas naturais cobrindo variacoes e ambiguidades comuns.

## Definicao global de pronto

Um dominio migrado deve cumprir todos os itens:

- Planner local cobre perguntas comuns e seguras.
- Planner LLM, se usado, so produz plano validado e nunca resposta final.
- `FinancialQueryPlan` usa somente campos permitidos pelo contrato.
- Query Engine calcula todos os valores relevantes do dominio.
- Resultado inclui detalhes auditaveis: filtros aplicados, periodo, base temporal, quantidade de itens e lista limitada quando necessario.
- Response Composer nao recalcula valores.
- Ambiguidade gera pergunta de esclarecimento, nao chute silencioso.
- Prompt injection ou pedido de dado interno e bloqueado antes de qualquer consulta.
- Testes cobrem escopo pessoal e familiar quando o dominio puder cruzar familia.
- Fallback legado e removido ou marcado como temporario com criterio de remocao.

## Ordem oficial de migracao

| Ordem | Dominio | Justificativa curta | Resultado esperado |
| --- | --- | --- | --- |
| 1 | Gastos | Base de quase todas as perguntas e ja tem adaptadores Query Engine. | Totais, detalhes, rankings e follow-ups consistentes. |
| 2 | Cartoes/faturas/parcelamentos | Maior risco de erro temporal entre compra, fatura e parcelas. | Faturas e parcelamentos auditaveis por cartao e mes. |
| 3 | Entradas | Necessario para saldo, renda, recorrencia e comparacoes. | Receitas explicadas por fonte, categoria e periodo. |
| 4 | Transferencias/caixinha/reserva | Afeta saldo disponivel e pode distorcer dashboard. | Transferencias internas, reserva e resgates separados de renda/gasto. |
| 5 | Orcamento | Depende de gastos/cartoes/transferencias para calcular ritmo. | Ciclos pessoais/familiares explicados sem confundir com mes calendario. |
| 6 | Metas | Tem estado e historico, mas consultas sao read-only. | Progresso, faltante e historico consistentes por escopo. |
| 7 | Dividas | Precisa explicar saldo, parcelas, vencimentos e quitacao. | Visao de dividas sem escrita nem recomendacao inventada. |
| 8 | Contas/vencimentos | Depende de recorrencias e datas; conecta WhatsApp, planilha e cron. | Vencimentos e esperado vs realizado claros. |
| 9 | Familia/escopo | Transversal; consolida protecao depois dos principais dominios. | Resolver escopo sem vazamento entre membros. |
| 10 | Dashboard/resumos | Deve refletir as mesmas regras das respostas no WhatsApp. | KPIs e explicacoes alinhados ao motor analitico. |

## 1. Gastos

Objetivo:

- Migrar perguntas sobre despesas para `query_engine_primary`, incluindo total, contagem, lista, detalhe, ranking, percentual, maior/menor, media, comparacao, evolucao e follow-ups.
- Unificar gastos de `Saidas` e cartao quando a pergunta pedir gasto total, declarando a base temporal usada.

Dependencias:

- `FinancialQueryPlan` para `domain=expenses`.
- Read-model com saidas e lancamentos de cartao normalizados.
- Regras de tempo para decidir compra vs fatura quando houver cartao.
- Contexto conversacional seguro para follow-ups como "e por categoria?".

Riscos:

- Misturar data da compra com mes da fatura.
- Deixar cartao fora de categorias e rankings.
- Corrigir frases isoladas em vez de ampliar o planner.
- Percentuais calculados sobre subconjunto errado.

Criterios de pronto:

- `quanto gastei`, `detalhe`, `por categoria`, `por estabelecimento`, `maior/menor`, `percentual` e `comparar com mes anterior` usam Query Engine.
- Resposta informa se cartoes entraram por compra ou por fatura.
- Follow-ups herdam periodo/filtro sem guardar dados crus.
- Fallback legado de gastos fica removido ou desativado depois de paridade.

Testes minimos:

- Planner local para perguntas simples, complexas e follow-ups.
- Engine com saidas, cartoes, categorias, typos leves e filtros combinados.
- Resposta para "me explica de onde veio esse total".
- Seguranca: bloquear pedido de planilha, IDs internos ou dados de outro usuario embutido em pergunta de gasto.
- E2E realista com perguntas em sequencia.

## 2. Cartoes/faturas/parcelamentos

Objetivo:

- Migrar faturas, itens de fatura, aberto futuro, parcelamentos, agrupamento por cartao, ranking de cartoes e explicacao de parcelas.
- Diferenciar explicitamente data da compra, mes da fatura, vencimento e parcelas futuras.

Dependencias:

- Dominio de gastos migrado para compartilhar categorias e estabelecimentos.
- Cadastro de cartoes normalizado.
- Read-model com `Lancamentos Cartao`, faturas e parcelamentos.
- Contrato de `timeBasis` para `billing_month`, `purchase_date`, `due_date` e `installment_cycle`.

Riscos:

- Compra parcelada aparecer como multiplas compras independentes.
- Fatura zerada por leitura de aba/formula.
- Usuario perguntar "este mes" e o bot alternar compra/fatura sem explicar.
- Valor em aberto ser confundido com valor ja pago.

Criterios de pronto:

- Perguntas de composicao de fatura usam Query Engine.
- Parcelamentos agrupam compra original, parcelas lancadas, parcelas futuras e total previsto.
- Rankings por cartao consideram base temporal declarada.
- Respostas deixam claro "fatura de" vs "compra em".

Testes minimos:

- Fatura atual, anterior e futura.
- Compra parcelada em 1x e varias parcelas.
- Itens de fatura por cartao especifico.
- Cartao com mais valor em aberto.
- Follow-up: "e no Nubank da Thais?", "quais compras compoem?".

## 3. Entradas

Objetivo:

- Migrar consultas sobre renda, salario, renda extra, recorrencia de entrada, ranking de fontes, comparacao e evolucao.
- Separar entradas reais de transferencias internas e resgates de reserva.

Dependencias:

- Read-model com entradas normalizadas.
- Regras de classificacao de salario/renda extra ja persistidas ou detectaveis.
- Dominio de transferencias preparado para nao contaminar entradas.

Riscos:

- Transferencia entre contas virar renda.
- Resgate de caixinha virar entrada e inflar saldo.
- Pergunta sobre salario recorrente ser respondida com qualquer entrada.

Criterios de pronto:

- `quanto recebi`, `quanto de salario`, `maior fonte de renda`, `renda extra`, `compare entradas` usam Query Engine.
- Resposta identifica entradas recorrentes sem escrever dados.
- Transferencias/reservas ficam excluidas quando a pergunta for renda real.

Testes minimos:

- Total recebido no mes e no ciclo.
- Salario vs renda extra.
- Ranking de fontes.
- Comparacao com mes anterior.
- Pergunta ambigua sobre "dinheiro que entrou" pedindo esclarecimento se incluir reserva/transferencia mudar resultado.

## 4. Transferencias/caixinha/reserva

Objetivo:

- Migrar consultas sobre transferencias internas, pagamento de fatura, reserva aplicada/resgatada, caixinha e disponivel estimado.
- Explicar o que entra no saldo economico e o que afeta apenas disponibilidade.

Dependencias:

- Entradas migradas.
- Regras de importacao que marcam transferencias internas/reserva.
- Read-model com transferencias e tipo/subtipo normalizados.

Riscos:

- Salario transferido automaticamente ser tratado como transferencia interna e esconder renda.
- Pagamento de fatura virar gasto duplicado.
- Aplicacao/resgate de reserva distorcer dashboard.

Criterios de pronto:

- `quanto mandei para caixinha`, `quanto resgatei`, `quanto esta disponivel`, `transferencias internas` usam Query Engine.
- Pagamento de fatura e identificado como movimentacao financeira, nao despesa nova.
- Resposta explica saldo economico vs disponivel estimado.

Testes minimos:

- Aplicacao e resgate no mesmo periodo.
- Transferencia entre membros da familia.
- Pagamento de fatura.
- Pergunta "por que meu disponivel e menor que meu saldo?".
- Seguranca: usuario fora da familia nao ve transferencias do outro.

## 5. Orcamento

Objetivo:

- Migrar consultas sobre ciclo mensal, gasto livre, ritmo diario, escopo pessoal/familiar, restante, alertas e explicacao do que entra no orcamento.
- Garantir que ciclo de orcamento nao seja confundido com mes calendario.

Dependencias:

- Gastos, cartoes e transferencias migrados.
- Settings de orcamento com dia inicial e escopo.
- Scope Resolver seguro para familia.

Riscos:

- Contar parcela pela data da compra quando o orcamento usa competencia/vencimento.
- Manter gasto de ontem como "hoje".
- Nao recalcular ritmo diario quando vira o dia.
- Familia ativa sem perguntar se orcamento e pessoal ou familiar.

Criterios de pronto:

- `quanto ja usei do orcamento`, `quanto posso gastar hoje`, `qual meu ritmo`, `o que entrou nesse calculo` usam Query Engine.
- Resposta mostra ciclo completo, dias restantes, gasto do dia e gasto do ciclo.
- Escopo pessoal/familiar aparece quando relevante.

Testes minimos:

- Ciclo que cruza meses.
- Dia inicial 1, 28, 30 e 31.
- Orcamento pessoal vs familiar.
- Compra no cartao parcelada dentro/fora do ciclo.
- Follow-up: "por que esse valor?" e "e so hoje?".

## 6. Metas

Objetivo:

- Migrar consultas sobre metas, progresso, faltante, historico, status, pausadas/canceladas/concluidas e metas pessoais/familiares.
- Manter a Query Engine read-only: movimentar, ajustar, pausar, retomar, cancelar e concluir continuam na Command Engine.

Dependencias:

- Read-model ou leitura normalizada de `Metas` e `Movimentacoes Metas`.
- Scope Resolver para metas familiares.
- Status de meta padronizado.

Riscos:

- Meta pausada/cancelada entrar como ativa.
- Movimentacao de um membro aparecer como se fosse de outro.
- Pergunta "tirar dinheiro da meta" ser tratada como consulta em vez de comando.

Criterios de pronto:

- `liste minhas metas`, `quanto falta`, `qual progresso`, `historico da meta`, `metas familiares` usam Query Engine.
- Respostas distinguem ativas, pausadas, canceladas e concluidas.
- Comandos de escrita permanecem fora da Query Engine.

Testes minimos:

- Meta pessoal e familiar.
- Movimentacao de aporte e retirada.
- Meta pausada/cancelada/concluida.
- Pergunta ambigua entre consulta e comando.
- Seguranca: membro sem vinculo nao ve meta familiar.

## 7. Dividas

Objetivo:

- Migrar consultas sobre saldo, vencimentos, parcelas, pagamentos, progresso de quitacao e recomendacoes read-only de priorizacao.
- Preservar a separacao entre perguntar sobre divida e registrar pagamento.

Dependencias:

- Read-model de dividas e pagamentos.
- Regras de vencimento.
- Response Composer com explicacoes de saldo e parcelas.

Riscos:

- Recomendacao financeira parecer garantia ou aconselhamento absoluto.
- Pagamento futuro ser contado como pago.
- Pergunta "pagar divida" acionar consulta em vez de comando ou vice-versa.

Criterios de pronto:

- `quanto devo`, `quais vencem`, `qual parcela`, `quanto falta quitar`, `qual priorizar` usam Query Engine.
- Recomendacoes sao explicadas por criterio objetivo: juros, vencimento, saldo ou atraso.
- Registrar pagamento continua Command Engine.

Testes minimos:

- Divida sem pagamento, com pagamento parcial e quitada.
- Vencimentos proximos e atrasados.
- Ranking por juros/vencimento/saldo.
- Pergunta ambigua de pagamento.
- Seguranca contra pedido de divida de outro usuario.

## 8. Contas/vencimentos

Objetivo:

- Migrar consultas sobre contas recorrentes, vencimentos proximos, valor esperado, status pago/pendente e comparacao com realizado.
- Alinhar resposta do WhatsApp com alertas de cron sem depender do cron para calcular.

Dependencias:

- Aba/estrutura de contas normalizada.
- Regras recorrentes de classificacao.
- Read-model com contas e lancamentos realizados.

Riscos:

- Conta cadastrada sem categoria nao ser encontrada.
- Dia 31 quebrar em meses curtos.
- Conta paga ser marcada como pendente por descricao diferente.
- Misturar lembrete de calendario com conta financeira.

Criterios de pronto:

- `quais contas vencem`, `o que vence amanha`, `ja paguei aluguel?`, `quanto tenho de contas fixas` usam Query Engine.
- Vencimentos usam data valida do mes.
- Resposta separa esperado, realizado e pendente quando houver dados.

Testes minimos:

- Vencimentos nos proximos 7 dias.
- Mes curto com dia 31.
- Conta paga com descricao similar.
- Conta familiar vs pessoal.
- Comparacao esperado vs realizado.

## 9. Familia/escopo

Objetivo:

- Consolidar o Scope Resolver transversal para todos os dominios migrados.
- Garantir que perguntas pessoais, familiares e por membro usem escopo autorizado, sem depender do LLM.

Dependencias:

- Dominios principais ja migrados para expor necessidades reais de escopo.
- Modelo de familia/planilha principal.
- Auditoria de acesso sanitizada.

Riscos:

- Vazamento entre usuarios.
- Admin enxergar dados financeiros sem consentimento.
- Pergunta "da Thais" ser resolvida por nome de cartao em vez de membro autorizado.
- Planner LLM tentar decidir `user_id`.

Criterios de pronto:

- Scope Resolver decide `personal`, `family`, `member` e `admin-support` fora do LLM.
- Toda Query Engine recebe escopo resolvido e nao campos internos.
- Perguntas por membro so funcionam dentro de vinculo autorizado.
- Admin amplo continua bloqueado por padrao.

Testes minimos:

- Usuario solo.
- Familia com dono e membro.
- Perguntas "meu", "nosso", "da outra pessoa", "da familia".
- Membro removido do vinculo.
- Prompt injection pedindo dados de outro usuario.

## 10. Dashboard/resumos

Objetivo:

- Alinhar KPIs, graficos, resumos e explicacoes do dashboard com as mesmas regras da Query Engine usada no WhatsApp.
- Manter a emissao de token segura sem transformar dashboard em canal de vazamento.

Dependencias:

- Dominios anteriores migrados.
- Dashboard API consumindo resultados auditaveis da Query Engine ou servico equivalente.
- Politica de token e auditoria ja preservada.

Riscos:

- Dashboard e WhatsApp mostrarem totais diferentes.
- Graficos omitirem cartao/categoria.
- Token de dashboard expor dados fora do escopo.
- Dashboard admin amplo voltar a ser dependencia de beta.

Criterios de pronto:

- KPIs principais usam a mesma base temporal e filtros das respostas WhatsApp.
- Dashboard mostra criterio de cada numero quando houver ambiguidade.
- Resumos nao recalculam por caminho paralelo.
- Token continua curto, sanitizado em logs e sem dados de terceiros por padrao.

Testes minimos:

- Comparar pergunta WhatsApp vs API/dashboard para mesmo periodo.
- Mes com cartao, saida, entrada, transferencia, reserva e orcamento.
- Usuario solo e familia.
- Token expirado, token valido e escopo invalido.
- Regressao visual para graficos nao cortados.

## Como usar este roadmap

- Cada item deve virar um pacote pequeno de implementacao, preferencialmente um dominio por branch/commit.
- Antes de codar um dominio, criar ou atualizar testes que expressem as perguntas reais da matriz de cobertura.
- Durante a implementacao, qualquer pergunta que cair em fallback deve ser registrada como lacuna de cobertura do dominio, nao como frase isolada a ser remendada.
- Depois de cada dominio, atualizar `docs/audits/financial-query-legacy-map.md` marcando o caminho como `query_engine_primary` quando a paridade for real.
- Ao final da migracao, remover rotas legadas de calculo financeiro ou manter apenas adaptadores sem calculo.

## Nao fazer

- Nao enviar planilha inteira ao Gemini.
- Nao deixar Gemini calcular valores finais.
- Nao criar intents por frase isolada quando a pergunta puder ser expressa por dominio, operacao, periodo, filtro, escopo e base temporal.
- Nao permitir que planner decida IDs internos, planilha, token ou permissao.
- Nao usar fallback Sheets como caminho principal para perguntas comuns.
- Nao misturar Query Engine read-only com comandos que escrevem ou alteram dados.
- Nao avancar de dominio se WhatsApp, dashboard e testes estiverem usando criterios temporais diferentes.
