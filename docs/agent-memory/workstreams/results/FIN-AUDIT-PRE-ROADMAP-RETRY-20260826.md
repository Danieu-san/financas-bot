# FinançasBot — Auditoria independente pré-roadmap — RETRY 2026-08-26

## Escopo e método

Auditoria defensiva e somente de leitura do commit-base
`443baa687cbe438b3e69bbb452f1cdfc70d432f2`. A análise tentou refutar cada
hipótese com os arquivos obrigatórios do manifesto. Não houve chamada a Pluggy,
Google Sheets, WhatsApp, OCI ou produção; nenhum dado financeiro foi escrito.

Classificações: **CONFIRMADO** quando o comportamento decorre diretamente do
código; **PARCIAL** quando só parte da hipótese é demonstrável; **REFUTADO**
quando existe controle causal contrário; **NÃO PROVÁVEL SEM DADO EXTERNO**
quando o repositório não basta para concluir o fato real.

## Veredito executivo

Há problemas reais anteriores ao próximo roadmap. Os de maior impacto são:

- identidade de cartão não canônica nos resumos (`card_id` existe, mas Faturas e
  Parcelamentos agrupam pelo nome textual);
- competência de cartão calculada por dia fixo, sem calendário bancário, e
  consultas do dashboard que preferem a data da compra à competência;
- todas as parcelas futuras recebem a mesma data da compra e podem ser somadas
  no mês da compra pelo dashboard;
- saldo de conta financeira é recalculado com movimentos apenas do período
  consultado, não de forma cumulativa até a data de corte;
- `budget.sum` devolve gasto livre do dia, apesar da semântica de orçamento
  mensal/ciclo;
- leitores legados ainda pedem faixas anteriores ao schema corrente e perdem o
  campo Conta Financeira.

O achado de recorrência sem `user_id` foi **REFUTADO**: o carregador exclui a
linha vazia antes de criar as regras. O novo cartão Atacadão é descoberto
dinamicamente apenas se já estiver cadastrado na aba `Cartões`; aparecer na
Pluggy, sozinho, não prova integração com a planilha.

## Auditoria dos 17 achados

### 1. Uber R$ 22,91: `card_id` versus nome textual — **CONFIRMADO**

O schema unificado preserva `card_id` em G e nome em H
(`userSpreadsheetService.js`, definição de `Lançamentos Cartão`). Porém
`buildInvoiceSummaryRows` agrupa por H/F, não por G/F, e
`buildInstallmentSummaryRows` também usa H. Logo `nubank-daniel` pode coexistir
com `Cartão Nubank - Daniel` e `Nubank - Daniel` como identidades textuais
separadas. O caso Uber é consistente com um defeito estrutural de agregação;
o lançamento específico não foi consultado.

### 2. Fechamento real variável por fim de semana/feriado — **CONFIRMADO**

`buildBillingMonthName` e `saveCreditCardExpense` usam somente
`purchaseDate.getDate() > closingDay`. Não há calendário bancário, feriado,
fim de semana, horário de corte nem data real de fatura Pluggy. A capacidade
existe, mas é uma aproximação determinística por dia configurado.

### 3. Parcelamentos, saldo restante, meses, `1/1` e futuras — **CONFIRMADO**

`saveCreditCardExpense` materializa todas as parcelas futuras no momento da
compra, com rótulos `i/N` e competência mensal. A aba `Parcelamentos` apenas
agrupa descrição/cartão/categoria e calcula `count(D)`/`sum(D)`; não calcula
parcelas restantes em tempo real, saldo restante nem estado do banco. Ela inclui
`1/1`, pois não há filtro `N > 1`. Se o histórico estiver incompleto, o resumo
representa somente as linhas presentes, não o contrato real.

### 4. Novo cartão Atacadão na Pluggy — **PARCIAL**

`pluggyReadOnlyContract.normalizeAccount` aceita contas `CREDIT` dinamicamente e
o reconciliador percorre as contas recebidas; não há allowlist por nome do
cartão nesses pontos. No fluxo WhatsApp pessoal, entretanto,
`buildCreditCardOptionsForUser` lê somente a aba `Cartões` e cria opções das
linhas ativas. Portanto cartão novo na Pluggy não é automaticamente opção de
escrita nem configuração de competência. O legado ainda contém `Cartão
Atacadão`, mas isso não prova vínculo com a conta Pluggy atual. A presença real
e seus aliases são **NÃO PROVÁVEIS SEM DADO EXTERNO**.

### 5. Faturas agrupadas por nome versus `card_id` — **CONFIRMADO**

A fórmula de `Faturas` seleciona e agrupa H (`Cartão`) e F (`Mês de Cobrança`).
O identificador G não participa. Renomear um cartão fragmenta o histórico e
dois cartões homônimos colidem. A Fase 8 documentou que o legado já perdia
`card_id`/nome e que fallbacks não podiam ser removidos sem paridade; a
capacidade unificada existe, mas o resumo não a usa corretamente.

### 6. Compra no próprio dia do fechamento — **PARCIAL**

O código é inequívoco: no dia igual ao fechamento a compra fica na competência
corrente, pois a mudança ocorre apenas com `> closingDay`. Se o banco já tiver
fechado naquele horário, o resultado diverge. A regra implementada está
confirmada; a competência bancária correta de uma compra concreta é **NÃO
PROVÁVEL SEM DADO EXTERNO**.

### 7. Semântica de Parcelamentos e fragmentação `1/6`, `2/6` — **CONFIRMADO**

O resumo não interpreta a coluna Parcela. Ele agrupa por descrição, nome do
cartão e categoria. `1/6` e `2/6` só permanecem juntos se esses três textos
forem idênticos; variação de descrição/categoria/nome fragmenta a compra. O
“Total Previsto” é a soma das linhas existentes, não um saldo restante.

### 8. Estorno/crédito versus pagamento de fatura — **PARCIAL**

No contrato Open Finance, sinal e tipo da conta distinguem débito/crédito;
`sourceDirection` trata valor negativo de cartão como crédito. Pagamento de
fatura confirmado é salvo em `Transferências`, com status `Pagamento de
fatura`, e não como renda/despesa. Essa separação evita dupla contagem no fluxo
planejado. Ainda assim, sem payload externo não é possível provar que todo
provedor sinaliza estorno e pagamento de modo consistente; descrições ambíguas
continuam dependentes da reconciliação.

### 9. Drift de schema Saídas/Entradas e readers antigos — **CONFIRMADO**

O schema atual é `Saídas!A:K` e `Entradas!A:J`, com Conta Financeira ao final.
O fallback analítico de `messageHandler.js` ainda lê `Saídas!A:J` e
`Entradas!A:I`. Os índices de `user_id` (9 e 8) continuam corretos, portanto
não há prova de vazamento de escopo; porém o fallback perde Conta Financeira e
pode responder diferente do read-model atual. `userSheetAnalyticsService` já
usa as faixas novas.

### 10. Recorrências com `user_id` ausente — **REFUTADO**

`loadRecurringAccountRows` monta a allowlist com
`getFinancialScopeUserIds(userId)` e aceita somente linhas cujo `row[3]` esteja
nela. `user_id` vazio não pertence ao conjunto e é descartado antes de
`accountRowsToClassificationRules`. O helper isolado não conhece escopo, mas o
fluxo real de importação o alimenta com linhas já filtradas. Deve haver teste de
regressão para preservar esse fail-closed.

### 11. `transaction_date`, `billing_month` e `plan.timeBasis` — **CONFIRMADO**

`cardRowMatchesDashboardPeriod` aceita primeiro a data da compra; só consulta
`Mês de Cobrança` quando a data não pode ser parseada. Assim uma linha válida
com compra em julho e competência agosto entra em julho no dashboard. O adapter
semântico inclui `plan.timeBasis` apenas em `details`; ele não muda a seleção do
snapshot. A capacidade declarativa existe, mas está desconectada da execução.

### 12. `budget.sum`: dia versus mês/ciclo — **CONFIRMADO**

`buildDailyGoalSummary` calcula `spent` (hoje) e `monthSpent` (ciclo). Contudo
`financialPersonalSheetSemanticAdapters.selectPlanResult`, para domínio
`budget` e operação `sum`, retorna `snapshot.dailyGoal.spent`. Uma pergunta de
soma mensal pode receber o total diário. `detail` preserva ambos.

### 13. Saldo de Contas Financeiras cumulativo versus recorte — **CONFIRMADO**

`getUserSheetDashboardData` filtra Saídas, Entradas e Transferências pelo mês
consultado e passa somente esse recorte a `buildFinancialAccountsSummary`.
Este começa no Saldo Inicial e aplica apenas esses movimentos. Portanto o saldo
de agosto ignora movimentos anteriores à abertura do mês, em vez de acumular
até a data de corte. O resultado é fotografia “saldo inicial + mês”, não saldo
atual confiável.

### 14. Forma de pagamento numerada — **CONFIRMADO**

`normalizePaymentReply` reconhece texto/abreviações (`PIX`, crédito, débito,
dinheiro), mas não `1`, `2`, `3`, `4`. As perguntas também pedem texto. Logo o
contrato desejado `1 Crédito, 2 Débito, 3 PIX, 4 Dinheiro`, com fallback textual,
não está implementado de forma canônica.

### 15. Subcategoria em cartão — **CONFIRMADO**

`Lançamentos Cartão` não possui coluna Subcategoria. `saveCreditCardExpense`
grava descrição, categoria, valor, parcela, competência e usuário; a
subcategoria capturada no gasto é descartada no cartão. O orçamento injeta
artificialmente `Cartão de Crédito` como subcategoria, o que não preserva a
classificação original.

### 16. Timezone — **PARCIAL**

Há usos corretos de `America/Sao_Paulo` em orçamento, dashboard e Calendar.
Porém `normalizePeriod`, o adapter semântico e partes do handler usam `new
Date()`, `getMonth()`/`getFullYear()` ou `toISOString()` sem uma abstração única
de relógio. Em torno da meia-noite/UTC, caminhos distintos podem escolher dias
ou meses diferentes. A inconsistência é demonstrável; ocorrência real exige
teste com relógio controlado.

### 17. Problemas adicionais independentes — **CONFIRMADO/PARCIAL**

1. **CONFIRMADO — parcelas futuras no mês da compra:** todas as parcelas têm a
   mesma coluna Data da compra. Como o dashboard prefere Data a competência,
   ele pode somar todas as parcelas futuras no mês da compra.
2. **CONFIRMADO — source-of-truth múltiplo:** Fase 8 mantém read-model unificado,
   quatro fallbacks legados, scheduler/WhatsApp em canário e rollback. “Existe”
   não significa “é fonte ativa para todos os consumidores”.
3. **CONFIRMADO — transferências neutras no fluxo atual:** pagamentos de fatura
   e transferências internas ficam em aba própria; o dashboard de consumo não
   os soma como renda/despesa. Preservar esse controle evita dupla contagem.
4. **PARCIAL — projeções:** materializar futuras parcelas é útil para previsão,
   mas misturá-las ao mesmo conjunto usado por realizados exige `timeBasis`
   efetivo; hoje essa separação não é uniforme.
5. **PARCIAL — reconciliação de parcelamento:**
   `openFinanceRuntimeReconciliation.annotateTransaction` marca parcelamentos
   como `installment_reconciliation_unsupported`, falhando fechado. É uma
   proteção existente, mas deixa a capacidade desconectada.

## Confronto com roadmap, Fase 8 e ARQ/shadows

- A Fase 8 prova read-model unificado em canário e fallbacks preservados; não
  autoriza concluir que toda consulta usa a fonte unificada.
- Scheduler e WhatsApp tiveram gates separados. Paridade de um consumidor não
  corrige fórmulas de Faturas/Parcelamentos nem o fallback analítico antigo.
- Financial Agent/ARQ carrega `timeBasis`, mas o adapter da planilha não o
  executa nos filtros de cartão; trata-se de capacidade existente porém
  desconectada.
- Ledger, projected plans e command planner aparecem em shadow/canário. Eles
  não substituem automaticamente Sheets como source-of-truth do dashboard.
- Ausência de evento não prova uso zero; a documentação exige janela e rollback
  antes de remover legado.

## Prioridades para o roadmap posterior

### P0

1. Definir identidade canônica de cartão por `card_id` e migrar Faturas,
   Parcelamentos, analytics e reconciliação sem perder nomes de exibição.
2. Separar explicitamente data da transação, competência, vencimento e estado
   realizado/projetado; fazer `timeBasis` governar a consulta.
3. Corrigir saldo de conta para acumular movimentos desde a abertura até a data
   de corte ou usar saldo bancário reconciliado com proveniência.
4. Impedir que parcelas futuras sejam contabilizadas no mês da compra pelo
   dashboard.

### P1

1. Modelar fechamento com data real quando disponível e política de fallback
   auditável para fins de semana, feriados e compra no dia de corte.
2. Redesenhar Parcelamentos com identidade da compra, total contratado,
   parcela atual, saldo restante e status; excluir `1/1` da visão parcelada.
3. Fazer `budget.sum` respeitar período/ciclo e preservar `spent` diário apenas
   quando solicitado.
4. Eliminar drift de ranges e preservar Conta Financeira no fallback.
5. Preservar subcategoria de cartão no schema canônico.

### P2

1. Adicionar resposta numérica canônica para formas de pagamento, mantendo
   texto como fallback.
2. Centralizar relógio/timezone e injetar clock nos testes.
3. Tornar explícito o onboarding de cartões descobertos na Pluggy para a aba
   `Cartões`, sem autoescrita silenciosa.

## Testes mínimos de regressão

1. Dois nomes para o mesmo `card_id` produzem uma única fatura; dois `card_id`
   homônimos permanecem separados.
2. Compra antes, no dia e depois do fechamento, incluindo sábado, domingo,
   feriado e horário de corte, com fallback documentado.
3. Compra 6x: dashboard realizado soma somente a competência pedida; projeção
   mostra futuras; Parcelamentos informa 2/6 e saldo restante sem incluir 1/1.
4. `plan.timeBasis=transaction_date|billing_month|due_date` muda causalmente o
   conjunto retornado.
5. `budget.sum` de dia e de ciclo devolvem valores diferentes e corretos.
6. Saldo de agosto inclui movimentos anteriores a agosto desde a abertura.
7. Readers novos e fallback produzem mesma saída com schemas A:K/A:J.
8. Regra recorrente com `user_id` vazio ou não autorizado nunca classifica.
9. Respostas `1`, `2`, `3`, `4` e textos equivalentes normalizam para Crédito,
   Débito, PIX e Dinheiro.
10. Estorno de cartão, pagamento de fatura e transferência interna não viram
    renda/despesa nem se duplicam.
11. Cartão Pluggy novo não vira opção de escrita antes de cadastro/revisão; após
    cadastro ativo, é descoberto dinamicamente.
12. Casos 23:30–00:30 UTC/São Paulo mantêm data e período consistentes.

## Dependências e critério de saída

O roadmap posterior precisa de contrato de identidade de cartão, política de
tempo/competência, estratégia de migração de linhas históricas, fixtures de
calendário bancário, definição de saldo (bancário versus ledger) e telemetria
por consumidor. Nenhum legado deve ser removido apenas por busca estática; os
gates de Fase 8 exigem paridade, canário, janela de observação e rollback.

Esta auditoria não autoriza correção, deploy, produção ou acesso a dados reais.
