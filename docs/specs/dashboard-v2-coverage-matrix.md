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
- comparações históricas continuam disponíveis no Query Engine, mas um bloco
  visual dedicado fica adiado até haver pergunta de decisão e contrato de
  paridade aprovados; a auditoria contra Sheets e o rollback por flag foram
  concluídos no gate 4E;
- projeções avançadas de planos pertencem à Fase 5;
- investimentos e patrimônio permanecem nas fases posteriores do roadmap.

## Auditoria final do benchmark no gate 4E

As duas fontes obrigatórias, `meu-planner-feature-benchmark.md` e
`meu-planner-deep-product-study.md`, foram reconciliadas com o roadmap e com as
evidências do produto. Itens equivalentes foram consolidados para evitar que o
mesmo conceito apareça duas vezes com nomes diferentes.

### Adotado

| Item do benchmark | Decisão e evidência |
| --- | --- |
| Livro financeiro familiar unificado | Adotado como ledger canônico, independente da interface e projetado de forma determinística. |
| Evento, efetivação, competência, vencimento e status | Adotado no modelo canônico e no catálogo temporal; `pending`, `settled`, `cancelled` e `uncertain` não são inferidos como a mesma coisa. |
| Contas/partições e saldo por conta | Adotado na Fase 2; dashboard e WhatsApp leem a mesma posição canônica. |
| Transferências internas pareadas e neutras | Adotado; não viram renda nem gasto e exigem origem/destino coerentes. |
| Planejado versus realizado por categoria | Adotado na 4A com orçamento global preservado, alocação explícita e ausência de alocação diferente de zero. |
| Faturas, itens, conta pagadora e pagamento | Adotado nas Fases 3A/3B; pagamento não duplica a compra no orçamento. |
| Recorrências e parcelas projetadas | Adotado nas Fases 3C/3E como regras e cronogramas materializados sob demanda; compromissos aparecem em faturas/forecast. |
| Reembolso/estorno vinculado | Adotado na 3F; reduz o consumo original sem virar renda comum nem tornar o gasto líquido negativo. |
| Cockpit de decisão mobile-first | Adotado no dashboard v2: caixa, disponível, competência, ciclo, estrutura, planos/histórico e confiança em hierarquia explícita. |
| Pendências e qualidade visíveis | Adotado na 4D sem bloquear os demais totais; fonte ausente permanece indisponível e não vira zero. |
| Drill-down e critério temporal | Adotado como explicação textual `criteria` em todos os blocos; não há cálculo paralelo na interface. |
| Escopo Daniel, Thaís e família | Adotado pelo vínculo autorizado e pelo token, sem limitar o modelo a dois dispositivos e sem seletor de outro usuário na v2. |
| Perguntas livres, verificação e idempotência | Mantidos como vantagem do FinançasBot: Query Engine/agente verificado, escrita confiável e limpeza marker-only. |

### Adiado para a fase decidida

| Item do benchmark | Destino e justificativa |
| --- | --- |
| Planos projetados para metas, dívidas, financiamentos e consórcios | Fase 5; exige contrato comum e simulação separada do histórico real. |
| Correção/categorização em massa com trilha | Fase 6; deve ter seleção, preview, confirmação e auditoria antes de gravar. |
| Importação XLS/XLSX | Fase 6; CSV/OFX permanecem o MVP até o fluxo em lote estar confiável. |
| PDF, imagem, OCR e comprovantes | Fase 6; somente com preview, confirmação, vínculo financeiro e indicador de obrigatoriedade aplicável. |
| Exportação XLSX filtrada | Fase 6; conveniência posterior ao núcleo financeiro e à manutenção confiável. |
| Tour/manual contextual | Fase 6/backlog de conveniência; não altera a semântica financeira da Fase 4. |
| Carteira patrimonial e investimentos | Fase 7; depende de planos, contas e conciliação já consolidados. |
| Comparações históricas em bloco visual | Adiado até existir contrato visual/paridade próprio; a consulta read-only já existe, mas não foi duplicada no dashboard v2. |
| Open Finance/Meu Pluggy somente leitura | Última fase; mais volume sem conciliação madura aumentaria risco antes de aumentar confiança. |

### Descartado deliberadamente

| Item/prática observada | Motivo do descarte |
| --- | --- |
| Copiar marca, cores, textos, navegação ou layout literal | Propriedade e identidade visual próprias; somente a lógica de decisão foi incorporada. |
| Forçar uso da web para tarefas seguras | WhatsApp continua sendo a superfície principal quando a conversa resolve a tarefa com segurança. |
| Limitar a família a dois dispositivos | Restrição de interface não deve contaminar o modelo de pessoas e vínculos. |
| Usar `float` para dinheiro | Valores financeiros permanecem em centavos inteiros ou decimal exato. |
| Precriar doze transações recorrentes | Regras versionadas e materialização sob demanda evitam duplicidade e facilitam edição futura. |
| Aceitar transferência de uma ponta só | Viola neutralidade e reconciliação entre contas. |
| Permitir OCR/IA gravar sem preview | Viola o gate de confiabilidade e confirmação de campos críticos. |
| Bloquear o dashboard inteiro por item sem categoria | Cobertura e pendências devem ser explícitas sem apagar totais confirmados. |
| Esconder ações principais apenas em ícones | Ações precisam de rótulo compreensível e alvo acessível. |
| Priorizar lembretes por e-mail | WhatsApp/Calendar continuam os canais aprovados. |
| Trocar Gemini, LangGraph ou WhatsApp por modismo | Migração de fornecedor/framework exige ganho medido, não paridade presumida. |
| Virar assistente geral ou Drive inteligente genérico | O escopo permanece financeiro; anexos futuros devem estar vinculados a eventos financeiros. |
