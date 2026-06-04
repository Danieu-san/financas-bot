# Financial Query Engine

Atualizado em: 2026-06-04

## Problem Statement

Como permitir que usuarios facam perguntas financeiras livres, investigativas e de acompanhamento sem depender de uma intent hardcoded para cada frase, sem enviar a planilha inteira para o LLM e sem deixar a IA calcular valores finais?

## Recommended Direction

Construir uma Query Engine financeira. A IA deve atuar como planejadora sem acesso a dados brutos sensiveis: ela traduz linguagem natural em um plano estruturado e limitado. O codigo executa o plano de forma deterministica sobre SQLite/read-model ou, quando inevitavel, sobre as abas da planilha pessoal/familiar ja escopadas por `user_id`.

A mudanca importante e parar de pensar em "uma intent por pergunta" e passar a pensar em:

- Dominio: gastos, entradas, cartoes, metas, dividas, contas, orcamento, transferencias, importacoes, familia.
- Operacao: somar, contar, listar, detalhar, agrupar, ranquear, comparar, calcular media, percentual, extremos, explicar, procurar, detectar anomalia, projetar.
- Filtros: periodo, pessoa, familia, categoria, subcategoria, cartao, estabelecimento, forma, recorrencia, valor, status, origem.
- Perspectiva temporal: data da compra, competencia da fatura, vencimento, ciclo de orcamento, hoje, proximos dias.
- Resposta: curta, auditavel, com total + criterio usado + itens que compoem o resultado.

Isso deve cobrir perguntas novas por composicao, nao por frase decorada. Por exemplo, "onde foi parar meu dinheiro do cartao em maio?" vira `domain=expenses`, `source=card`, `period=may/2026`, `operation=detail`, `groupBy=[category, merchant]`.

## External Research Notes

Padroes observados em produtos e conteudo de financas pessoais:

- CFPB recomenda olhar historico de conta corrente e cartao por varios meses para avaliar gastos, e incluir contribuicoes regulares a metas/reserva no orcamento.
- Consumer.gov descreve orcamento como comparacao entre dinheiro que entra, contas/gastos e dinheiro que sobra para poupanca.
- YNAB organiza relatatorios em spending breakdown/trends, com perguntas por categoria, grupo, periodo, tendencias e comparacao entre planejado e realizado.
- NerdWallet trata categorizacao, renda, gastos e transferencias internas como conceitos diferentes; pagamentos de cartao podem precisar ser marcados como transferencia interna para nao inflar renda/gasto.

Referencias consultadas:

- https://www.consumerfinance.gov/owning-a-home/prepare/assess-your-spending/
- https://consumer.gov/your-money/making-budget
- https://support.ynab.com/en_us/spending-trends-H1inlhzAc
- https://support.ynab.com/en_us/spending-breakdown-H1H7YxmD0
- https://support.nerdwallet.com/hc/en-us/articles/115003111046-Transaction-Categories

## Universe of User Questions

### 1. Gastos e saidas

- Quanto gastei este mes?
- Quanto gastei hoje, ontem, na semana, no ciclo do orcamento ou em um intervalo?
- Detalhe meus gastos.
- De onde veio esse total?
- Quais lancamentos compoem esse valor?
- Em quais categorias eu gastei mais?
- Em quais estabelecimentos eu gastei?
- Quantas vezes gastei com transporte/mercado/iFood/onibus?
- Quanto gastei em duas ou mais categorias somadas?
- Qual foi meu maior/menor gasto?
- Quais gastos parecem fora do normal?
- Quais gastos foram recorrentes?
- Quais gastos eu poderia cortar?
- Quais gastos foram feitos por Daniel/Thais/membro da familia?

### 2. Entradas e renda

- Quanto recebi este mes?
- Quais foram minhas entradas?
- O que foi salario, renda extra, reembolso ou rendimento?
- Minha renda recorrente caiu/subiu?
- Esse recebimento repetido parece salario?
- Quanto recebi por fonte?
- Quais entradas foram reclassificadas de transferencia?
- Quanto entrou em comparacao ao mes anterior?

### 3. Saldo, fluxo e dinheiro disponivel

- Qual meu saldo do mes?
- Quanto realmente ficou disponivel?
- Quanto sobrou depois da caixinha/reserva?
- Por que o saldo parece diferente do dinheiro na conta?
- Quanto apliquei e quanto resgatei da reserva?
- Qual foi meu fluxo por dia?
- Em quais dias eu fiquei negativo?
- O dinheiro que saiu foi gasto real ou transferencia interna?

### 4. Cartoes, faturas e parcelamentos

- Quanto esta a fatura de maio?
- Quanto tem em cada cartao?
- Quais compras compoem essa fatura?
- Quais parcelas ainda estao em aberto?
- Qual cartao tem mais parcelas?
- Quanto vou pagar nos proximos meses?
- Qual foi o total da compra parcelada?
- A compra parcelada esta entrando no mes certo?
- Quais categorias estao pesando no cartao?
- Quais compras no cartao foram feitas por cada membro da familia?
- Quanto paguei de fatura este mes?
- Pagamento de fatura esta sendo tratado como transferencia, nao como gasto?

### 5. Transferencias internas, reserva e caixinha

- Quais transferencias internas aconteceram?
- Quanto mandei para caixinha/reserva?
- Quanto resgatei?
- Transferencia para membro da familia entrou como gasto ou transferencia?
- Quais transferencias podem estar erradas?
- Esse Pix e gasto real ou movimento entre minhas contas?
- Quanto dinheiro esta separado do disponivel?

### 6. Orcamento mensal livre e ritmo diario

- Qual e meu orcamento do ciclo?
- Quanto ja usei do orcamento?
- Quanto posso gastar hoje?
- Estou acima ou abaixo do ritmo?
- O ciclo comeca em qual dia?
- Esse orcamento e pessoal ou familiar?
- Qual membro consumiu mais do orcamento familiar?
- O que esta entrando no gasto livre?
- Parcelamento entra pelo vencimento da fatura ou pela data da compra?
- O que preciso fazer para fechar o ciclo dentro do limite?

### 7. Metas/cofrinhos

- Liste minhas metas.
- Quanto falta para bater minhas metas?
- Quanto ja guardei em cada meta?
- Quanto retirei da meta?
- Qual meta esta pausada/cancelada/concluida?
- Qual meta precisa de mais aporte mensal?
- Quem contribuiu para a meta familiar?
- Mostre o historico da meta.
- O que mudou no saldo da meta?

### 8. Dividas, parcelas e estrategia de quitacao

- Quais dividas eu tenho?
- Quanto falta quitar?
- Qual parcela vence primeiro?
- Qual divida tem maior juros?
- Qual a ordem recomendada pela bola de neve/avalanche?
- Quanto paguei de divida este mes?
- Como fica se eu pagar mais X?
- Quais dividas estao atrasadas ou proximas?
- Qual impacto das dividas no mes?

### 9. Contas recorrentes e vencimentos

- Quais contas vencem nos proximos 7 dias?
- O que vence amanha?
- Quais contas recorrentes eu cadastrei?
- Quais regras de classificacao estao ativas?
- Essa recorrencia ja virou conta?
- Quais contas nao tiveram lancamento correspondente?
- Qual valor esperado de aluguel/luz/internet?
- Alguma conta veio acima do normal?

### 10. Importacoes, extratos e qualidade de dados

- O arquivo foi importado corretamente?
- Quantos lancamentos vieram no extrato?
- Quais foram ignorados como duplicados?
- O bot identificou conta corrente ou cartao?
- De quem e esse extrato na familia?
- Quais lancamentos viraram transferencia interna?
- Quais categorias precisam revisao?
- Houve duplicidade entre lancamento manual e extrato?
- O que ficou pendente de classificacao?
- Quais entradas recorrentes precisam ser salario/renda/transferencia?

### 11. Familia e responsavel

- O que eu gastei?
- O que a outra pessoa gastou?
- Qual o total da familia?
- Quem lancou esse item?
- A planilha usada foi a do dono da familia?
- O membro ve somente o que deve ver?
- Quais metas/orcamentos sao pessoais e quais sao familiares?

### 12. Dashboard e explicabilidade

- Abra meu dashboard.
- Por que o dashboard mostra esse saldo?
- Por que maio e junho estao diferentes?
- Quais dados alimentam esse grafico?
- O grafico considera cartao por data da compra ou fatura?
- Por que aparece disponivel estimado?
- Quais lancamentos recentes explicam esse KPI?

### 13. Calendario, lembretes e cron

- O que tenho hoje na agenda?
- O que tenho amanha?
- Quais pagamentos/vencimentos vem esta semana?
- Criar lembrete de uma conta.
- O resumo diario leu contas, dividas e calendario?
- O horario esta correto no timezone America/Sao_Paulo?

### 14. Ajuda, onboarding e configuracoes

- Como usar o bot?
- Como cadastrar cartao?
- Como importar extrato?
- Como desfazer uma meta/orcamento/check-in?
- O que significa cada aba?
- Onde esta o manual?
- Como trocar orcamento, dia inicial, escopo familiar?

### 15. Admin, suporte e seguranca

- Quem esta aprovado?
- Enviar convite.
- Compartilhar planilha.
- Ver status do bot.
- Reiniciar bot.
- Essas perguntas nao devem permitir acesso a dados financeiros de terceiros, sheet id, tokens, prompts internos ou bypass admin.

## Query Plan Contract

O plano ideal deve ser mais expressivo que uma intent antiga:

```json
{
  "kind": "financial_query",
  "domain": "expenses|income|cards|transfers|budget|goals|debts|bills|imports|dashboard|calendar|help",
  "operation": "sum|count|list|detail|group|rank|compare|trend|average|percentage|extreme|explain|search|detect|forecast|recommend",
  "filters": {
    "period": { "type": "month|date_range|cycle|today|relative", "month": 5, "year": 2026 },
    "scope": "personal|family|member",
    "member": "nome opcional",
    "category": "opcional",
    "subcategory": "opcional",
    "merchant": "opcional",
    "paymentMethod": "opcional",
    "card": "opcional",
    "status": "opcional",
    "source": "manual|import|card|bank|all"
  },
  "groupBy": ["category", "merchant"],
  "sort": { "by": "value|date|count", "direction": "desc" },
  "limit": 10,
  "timeBasis": "transaction_date|billing_month|due_date|budget_cycle",
  "needsContext": false,
  "answerStyle": "short|detailed|audit"
}
```

## Architecture

### Query Engine

- Entrada: pergunta do usuario + contexto conversacional curto.
- Saida: resposta deterministica, com total, criterio usado e evidencias resumidas.
- Nao grava dados.
- Nao usa LLM para calcular.
- Nao envia planilha inteira ao LLM.

### Planner

- Primeiro tenta regras locais para perguntas comuns e seguras.
- Se nao conseguir, chama LLM com schema estrito para gerar `FinancialQueryPlan`.
- O plano passa por validacao: dominio permitido, operacao permitida, filtros seguros, escopo do usuario.
- Se o plano for inseguro ou ambiguo demais, pede esclarecimento curto.

### Executors

- Cada dominio tem executor proprio.
- Cada executor usa operadores genericos: filter, aggregate, group, rank, compare, list, explain.
- A fonte preferida e SQLite/read-model. Google Sheets fica como fallback escopado.

### Response Composer

- Formata resposta localmente.
- Sempre informa criterio quando houver ambiguidade: fatura por mes de cobranca, dashboard por data da compra, orcamento por vencimento/competencia.
- Para detalhes longos, mostra top itens e oferece "quer ver mais?".

### Command Engine

Continuar separado da Query Engine:

- Registrar gasto/entrada.
- Importar extrato.
- Criar/editar/apagar meta, divida, conta, orcamento.
- Admin e manutencao.
- Lembretes e calendario.

Perguntas podem sugerir comandos, mas nao devem executar escrita sem confirmacao explicita.

## Implementation Sequence

### Phase 0 - Freeze and Reframe Current Patch

- Manter a fatia ja feita de detalhamento como prototipo.
- Nao expandir com mais intents soltas.
- Adaptar os testes atuais para virarem golden cases da Query Engine.

### Phase 1 - Contract and Fixtures

- Criar `src/query/financialQueryPlan.js` com schema/validacao.
- Criar fixtures controladas cobrindo usuario individual e familia.
- Criar matriz de perguntas por dominio/operacao/filtro.
- Criar testes que validam plano, execucao e resposta.

### Phase 2 - Core Engine for Expenses and Cards

- Criar `src/query/financialQueryEngine.js`.
- Migrar gastos e cartoes para operadores genericos.
- Substituir `detalhamento_*`, ranking, listagem e totais por chamadas ao motor.
- Preservar compatibilidade das intents antigas como adaptadores.

### Phase 3 - Income, Transfers and Available Cash

- Cobrir entradas, salario, renda extra, rendimentos, transferencias internas, reserva/caixinha e saldo disponivel.
- Garantir que pagamento de fatura e transferencia interna nao inflem gasto/renda.

### Phase 4 - Budget, Goals, Debts and Bills

- Cobrir orcamento mensal livre, metas, movimentacoes de metas, dividas, contas recorrentes e vencimentos.
- Permitir perguntas de explicacao: "por que meu orcamento esta assim?", "quanto falta?", "o que vence?".

### Phase 5 - Conversation Context

- Guardar o ultimo resultado analitico por usuario por poucos minutos.
- Resolver follow-ups: "e no cartao?", "e por estabelecimento?", "e da Thais?", "me mostra os maiores".
- O contexto nao deve guardar dados sensiveis brutos demais; guardar plano, escopo, periodo e ids internos sanitizados.

### Phase 6 - LLM Planner and Safety Gate

- Chamar LLM apenas quando regras locais nao bastarem.
- Enviar somente schema, exemplos e metadados seguros, nunca linhas da planilha.
- Validar output com allowlist.
- Registrar falhas em `qaFailureLogService` por familia de consulta.

### Phase 7 - Full Coverage and Migration

- Roteador de perguntas passa a chamar Query Engine primeiro.
- `intentClassifier` antigo vira fallback temporario.
- `calculationOrchestrator` antigo vira adaptador ou e gradualmente esvaziado.
- Dashboard pode reaproveitar executors quando fizer sentido, sem acoplar UI ao WhatsApp.

## MVP Scope

O MVP correto da Query Engine nao e "responder tres perguntas". E:

- Contrato unico de plano.
- Executor generico para gastos/cartoes.
- Test matrix cobrindo combinacoes de pergunta, nao frases exatas.
- Adaptador para manter as intents antigas funcionando.
- Respostas auditaveis para `sum`, `count`, `list`, `detail`, `group`, `rank`, `compare`, `average`, `percentage`, `extreme`, `detect`.

## Not Doing

- Nao mandar planilha inteira para o Gemini.
- Nao transformar a IA em fonte da verdade matematica.
- Nao permitir escrita de dados pela Query Engine.
- Nao misturar admin/suporte com perguntas financeiras comuns.
- Nao prometer "todas as perguntas possiveis" literalmente; o objetivo e cobrir familias de perguntas por composicao.
- Nao criar um DSL complexo demais antes de validar com gastos/cartoes.

## Key Assumptions to Validate

- Um plano composicional cobre muito mais perguntas que novas intents manuais.
- SQLite/read-model contem dados suficientes para a maioria das consultas sem bater Google Sheets.
- Usuarios aceitam respostas resumidas com opcao de detalhar mais.
- A diferenca entre data da compra, mes da fatura, vencimento e ciclo de orcamento precisa aparecer na resposta.
- Perguntas familiares precisam preservar `user_id` e escopo com rigor juridico/privacidade.

## Golden Question Matrix

Cada linha da matriz de testes deve variar frase, periodo, escopo e dominio:

- `quanto gastei este mes?`
- `detalhe meus gastos de maio`
- `onde foi parar o dinheiro do cartao?`
- `em quais lojas eu gastei mais?`
- `quanto eu e a Thais gastamos separados?`
- `quanto recebi de salario este mes?`
- `esse Pix foi transferencia interna ou gasto?`
- `quanto realmente tenho disponivel depois da caixinha?`
- `qual fatura pesa mais nos proximos meses?`
- `quais parcelamentos ainda tenho em aberto?`
- `por que meu orcamento familiar passou do ritmo?`
- `quanto posso gastar hoje para fechar o ciclo?`
- `quanto falta para minhas metas?`
- `mostre o historico da meta reserva`
- `quais dividas vencem primeiro?`
- `qual estrategia de quitacao faz sentido?`
- `quais contas vencem nos proximos 7 dias?`
- `qual conta veio acima do normal?`
- `o que foi importado do ultimo extrato?`
- `quais lancamentos parecem duplicados?`
- `por que o dashboard mostra esse saldo?`
