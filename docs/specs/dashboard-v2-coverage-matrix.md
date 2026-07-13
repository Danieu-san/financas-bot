# Matriz de cobertura — Dashboard familiar v2

Atualizada em: 2026-07-13

Esta matriz traduz os estudos de produto para a identidade e o núcleo semântico
do FinançasBot. Ela não autoriza cálculos paralelos na interface: todos os
valores vêm do contrato sanitizado `/dashboard/api/v2/summary`.

| Capacidade adotada | Pergunta de negócio | Métrica e base temporal | Ferramenta/fonte compartilhada | Pergunta equivalente no WhatsApp | Bloco visual | Evidência automatizada |
| --- | --- | --- | --- | --- | --- | --- |
| Hoje e caixa atual | Quanto há nas contas agora? | `currentBalance`, estado atual | domínio `accounts` + snapshot autorizado | `Quanto tenho nas minhas contas?` | O essencial primeiro | `dashboardV2SummaryService.test.js` e `dashboardApiContracts.test.js` |
| Disponível e reserva | Quanto está disponível sem confundir reserva com gasto? | `availableBalance`, estado atual | snapshot/read-model compartilhado | `Quanto tenho disponível?` | O essencial primeiro | `dashboardV2SummaryService.test.js` |
| Resultado econômico | Quanto entrou, saiu e foi comprometido no período? | `periodInflows`, `periodDirectOutflows`, `periodCardCommitments`, data da transação | snapshot do mesmo read-model | `Qual foi meu saldo econômico neste mês?` | O essencial primeiro + drill-down | `dashboardV2SummaryService.test.js` |
| Competência | Quanto foi gasto pela competência correta? | `realizedExpenses`, competência de cobrança | Query Engine, domínio `expenses` | `Quanto gastei neste mês por competência?` | Categorias por competência | `dashboardV2SummaryService.test.js` |
| Orçamento por categoria | Quanto planejei, realizei e ainda resta? | contrato 4A, ciclo de orçamento | Query Engine, domínio `budget` | `Quanto resta do orçamento de alimentação?` | Orçamento do ciclo | `categoryBudget.test.js` e `dashboardV2SummaryService.test.js` |
| Contas | Onde está o dinheiro? | saldo por conta, estado atual | leitor canônico de contas | `Mostre o saldo das minhas contas` | Contas | `dashboardV2SummaryService.test.js` |
| Faturas | Quanto há em faturas previstas? | total por vencimento | forecast canônico, itens `invoice` | `Quais faturas vencem neste mês?` | Faturas | `dashboardV2SummaryService.test.js` |
| Próximos vencimentos | O que entra e sai depois? | a pagar, a receber e líquido, data de vencimento | domínio `forecast` | `O que vence nos próximos dias?` | Próximos vencimentos | `dashboardV2SummaryService.test.js` |
| Metas e dívidas | Como estão os compromissos de longo prazo? | posição atual read-only | snapshot autorizado | `Como estão minhas metas?` / `Quais dívidas estão ativas?` | Metas e Dívidas | `dashboardApiContracts.test.js` |
| Conferência | Quais itens ajudam a explicar os totais? | lançamentos recentes por tipo | snapshot sanitizado | `Quais foram meus últimos lançamentos?` | Atividade recente | `dashboardApiContracts.test.js` |
| Qualidade | Posso confiar na cobertura apresentada? | sem categoria, incertos, status pendente, não conciliados, sem conta financeira, comprovante obrigatório, cobertura por categoria e origem; data da transação | ledger canônico read-only + decisões sanitizadas de importação | `Como está a qualidade dos meus dados este mês?`, `Quais pendências de dados tenho este mês?`, `Mostre a cobertura dos dados por origem` | Qualidade dos dados | `dataQualityService.test.js`, `canonicalLedgerDataQualityReader.test.js`, `dashboardV2SummaryService.test.js` |

## Decisões de hierarquia

1. **Decisão de hoje:** caixa, disponível, saldo econômico e competência.
2. **Ciclo atual:** orçamento e categorias, com critérios visíveis.
3. **Estrutura:** contas, faturas e próximos vencimentos.
4. **Planos e histórico:** metas, dívidas e lançamentos recentes.
5. **Confiança:** qualidade isolada, sem bloquear os demais blocos.

Todos os blocos têm drill-down textual por `criteria`, estados explícitos
`available`, `fallback`, `partial` e `unavailable`, e não exibem `null` como
zero. O escopo vem exclusivamente do token e do vínculo familiar autorizado;
não existe seletor de usuário na v2.

## Adiado sem pular fase

- upload, OCR, armazenamento e exigência ampla de comprovantes pertencem à
  Fase 6; na 4D o indicador só é aplicável a eventos que já declarem essa
  exigência de forma explícita;
- comparações históricas, auditoria final contra Sheets e rollback por flag
  pertencem ao gate 4E;
- projeções avançadas de planos pertencem à Fase 5;
- investimentos e patrimônio permanecem nas fases posteriores do roadmap.
