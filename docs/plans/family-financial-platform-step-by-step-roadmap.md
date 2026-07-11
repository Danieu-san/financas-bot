# Roadmap passo a passo - FinancasBot familiar

Data: 2026-07-08
Status: Fase 3F concluida com GO de producao; proximo portao: 3F.1

## Principios de execucao

Este documento quebra o restante do roadmap mestre em fatias pequenas, ordenadas e verificaveis. Ele nao substitui `docs/plans/family-financial-platform-evolution-roadmap.md`; ele transforma o macroplano em fila operacional.

Regras permanentes:

- Manter o baseline atual disponivel para comparacao e rollback enquanto o
  nucleo analitico candidato evolui em shadow.
- Dar ao Gemini liberdade para interpretar, decompor e escolher ferramentas, sem
  permitir que calcule valor final, resolva permissao ou execute escrita.
- Centralizar significado financeiro em catalogo semantico e
  `FinancialQuerySpec`; evitar novas manutencoes baseadas apenas em frases/intents.
- Manter `INTERPRETATION_RELIABILITY_MODE=shadow` ate novo gate especifico de escrita.
- Nao remover legado antes da Fase 8.
- Cada fatia deve ter TDD, bateria adversarial repetivel, rollback por flag quando houver rollout e limpeza marker-only quando tocar dados reais.
- Quando um gate pedir observacao, substituir espera passiva por bateria ativa, exceto risco externo impossivel de simular.
- Toda promocao de leitura/escrita canonica deve preservar Sheets como espelho legivel ate a Fase 8.
- Escopo do produto: familia Daniel/Thais, dados financeiros compartilhados pelo casal.

## Estado de partida

Concluido:

- Fase 0: baseline answer/planner estabilizado com restricoes.
- Fase 1: contrato do ledger familiar.
- Fase 2: contas, datas, status, saldos e movimentos com GO de producao.
- Fase 3A: pagamento de fatura com conta pagadora.
- Fase 3B: faturas vinculadas a itens e pagamentos.
- Fase 3C: regras de recorrencia e ocorrencias materializadas, com smoke pago/nao pago limpo.
- Fase 3D: contas a pagar e receber futuras, com forecast canary e smoke read-only limpo.
- Fase 3E: cronograma canonico de parcelas concluido com GO de producao, smoke remoto read-only aprovado e flags preservadas.
- Fase 3F: reembolso e estorno vinculados concluidos com GO de producao, E2E
  completo pelo WhatsApp e classificacao publica corrigida.

Proximo trabalho: executar o portao 3F.1 - Nucleo analitico agentic governado.

## Fase 3 - Recorrencias, parcelas, contas e faturas

Objetivo da fase: transformar previsao e conciliacao em capacidades nativas, sem duplicar gastos ao importar, pagar fatura, reiniciar ou editar regras.

### 3C - Regras de recorrencia e ocorrencias materializadas

Objetivo: representar contas/receitas recorrentes como regra versionada e materializar ocorrencias sob demanda, sem precriar meses futuros como linhas definitivas.

Dentro do escopo:

- Modelo canonico de `recurrence_rules`.
- Ocorrencias derivadas por periodo, status e vencimento.
- Compatibilidade com a aba atual `Contas` e leituras de contas a pagar.
- Pagamento de conta recorrente vinculado a uma ocorrencia esperada.
- Edicao futura de regra sem duplicar ocorrencias antigas.

Fora do escopo:

- Assinaturas parceladas complexas.
- Dashboard v2.
- Remocao do fluxo legado de contas.

Passo a passo:

1. Escrever spec curta da regra recorrente v1: campos, status, timezone, competencia, vencimento e versionamento.
2. Criar testes RED do projetor para regra mensal, vencimento em dia 29/30/31, virada de ano e regra inativa.
3. Implementar projecao pura de regras a partir das fontes atuais, sem escrever em producao.
4. Criar materializador deterministico de ocorrencias por janela de datas.
5. Vincular `bill.pay` a ocorrencia esperada, preservando o pagamento como cash movement e nao como gasto livre.
6. Criar gate de idempotencia: materializar duas vezes, reiniciar, editar regra e pagar sem duplicar.
7. Expor leitura canary de proximas ocorrencias apenas atras de dominio permitido.
8. Rodar bateria local completa, audit, diff check, scan NUL e state JSON.
9. Deploy com flags preservadas e smoke marker-only/manual de conta recorrente paga e nao paga.
10. Decidir GO/NO-GO e registrar quais regras podem alimentar perguntas read-only.

Gate de saida:

- Uma regra gera exatamente uma ocorrencia por competencia.
- Pagar uma ocorrencia nao cria gasto livre nem duplica consumo.
- Editar regra futura nao altera historico ja liquidado.
- Sheets, ledger, read-model e WhatsApp concordam para proximas contas.

### 3D - Contas a pagar e receber futuras

Status em 2026-07-05: concluida com `GO` de producao. Passos 1-10 executados; leitura canonica `forecast` ativa no canary, smoke WhatsApp read-only aprovado e fixture marker-only removida sem residuos.

Objetivo: tratar compromissos futuros como previsao auditavel, separando expectativa de movimento liquidado.

Dentro do escopo:

- `payables` e `receivables` derivados de recorrencias, parcelas, faturas e lancamentos futuros.
- Status `pending`, `settled`, `cancelled`, `uncertain`.
- Perguntas como "o que vence esta semana?", "quanto ainda vai sair?" e "o que falta receber?".
- Baixa manual com confirmacao.

Fora do escopo:

- Open Finance.
- Pagamento automatico.
- Dashboard v2 completo.

Passo a passo:

1. Definir contrato publico de previsao: tipo, data, valor, origem, status e impacto esperado.
2. Criar fixtures com conta recorrente, receita recorrente, fatura, parcela e transferencia pendente.
3. Escrever testes RED para nao misturar pendente com saldo atual.
4. Implementar agregador canonico de previsoes por janela.
5. Adaptar FinancialQueryPlan para perguntas de vencimento e recebimento futuro.
6. Fazer Query Engine responder totais e listas sem expor ids internos.
7. Criar bateria adversarial com datas relativas, fim de mes, itens cancelados e itens incertos.
8. Validar paridade com Sheets/read-model/dashboard atual onde existir informacao equivalente.
9. Deploy em leitura canary; smoke WhatsApp read-only com perguntas de previsao.
10. Registrar GO/NO-GO para previsoes como fonte read-only.

Gate de saida:

- Pendencias nao alteram caixa atual.
- Itens liquidados saem da lista de aberto.
- Perguntas read-only declaram criterio de data usado.

### 3E - Cronograma de parcelas

Status em 2026-07-05: concluida com `GO` de producao. Passos 1-10 executados; cronograma canonico de parcelas ativo em leitura/projecao, smoke remoto read-only aprovado e fluxo de escrita de cartao preservado.

Objetivo: modelar compra parcelada como evento de compra unico com cronograma de competencias, evitando contar cada parcela como compra nova.

Dentro do escopo:

- `installment_schedules` canonico.
- Competencia da parcela, data da compra e fatura associada.
- Leitura de parcelas futuras por cartao, pessoa e categoria.
- Compatibilidade com lancamentos atuais de cartao.

Fora do escopo:

- Financiamentos longos da Fase 5.
- Investimentos.
- Edicao em massa de compras antigas.

Passo a passo:

1. Mapear formato atual das abas de cartao para compra original, parcela N/M e mes de cobranca.
2. Criar testes RED para compra a vista, 2x, 12x, virada de ano e duas compras iguais no mesmo comerciante.
3. Implementar construtor de cronograma a partir dos itens de cartao existentes.
4. Linkar cada parcela ao agregado de fatura da 3B.
5. Garantir que total por fatura e total por compra nao dupliquem quando consultados juntos.
6. Adicionar perguntas read-only: parcelas futuras, compras parceladas ativas, total comprometido por mes.
7. Testar cancelamento/estorno parcial como ainda fora do escopo ou marcado `uncertain`.
8. Rodar bateria local e smoke read-only com dados reais.
9. Deploy sem mudar fluxo de escrita de cartao.
10. Registrar GO e proximas lacunas para edicao/estorno.

Gate de saida:

- Parcela aparece uma vez na competencia correta.
- Compra original e parcelas sao explicaveis sem duplicar totais.
- Fatura, dashboard e WhatsApp concordam em valor por mes.

### 3F - Reembolso e estorno vinculados

Objetivo: vincular devolucoes, reembolsos e estornos ao lancamento original, reduzindo categoria/orcamento correto sem virar renda comum indevida.

Dentro do escopo:

- Link canonico entre evento original e evento de compensacao.
- Reembolso em dinheiro/PIX.
- Estorno de cartao.
- Perguntas sobre gastos liquidos por categoria.

Fora do escopo:

- Disputa de compra com multiplas etapas juridicas.
- OCR de comprovante de estorno.

Passo a passo:

1. Definir tipos: `refund`, `chargeback`, `reimbursement` e impacto contabil.
2. Criar testes RED para reembolso total, parcial, superior ao original e sem original encontrado.
3. Adicionar fluxo de matching assistido quando houver mais de um lancamento candidato.
4. Garantir confirmacao antes de vincular a compensacao.
5. Atualizar Query Engine para gasto bruto, compensacoes e gasto liquido.
6. Testar orcamento livre e por categoria com reembolso.
7. Smoke marker-only com gasto + reembolso + limpeza.
8. Registrar GO/NO-GO.

Gate de saida:

- Reembolso reduz gasto correto.
- Entrada de reembolso nao vira receita familiar comum por padrao.
- Sem original, o bot pede escolha ou marca como incerto.

### 3F.1 - Nucleo analitico agentic governado

Objetivo: substituir a evolucao por frases e excecoes por um nucleo em que Gemini
interpreta perguntas com liberdade, ferramentas leem apenas o necessario,
codigo calcula e valida, e a resposta permanece auditavel e barata.

Este e um portao tecnico dentro da Fase 3. Ele nao cria uma decima fase, nao
remove o caminho atual, nao migra escritas financeiras e nao muda o dashboard em
producao. 3G e 3H aguardam seu `GO`.

Problemas que obrigatoriamente entram no corpus de regressao:

- pergunta de progresso/resumo de metas replanejada como listagem de outro mes;
- resposta semanticamente errada aprovada pelo verificador;
- fonte de metas indisponivel apresentada como ausencia de metas;
- estado perdido durante criacao de meta;
- orcamento familiar, datas relativas e follow-ups com escopo/periodo incorretos;
- pergunta nova respondida por fallback ou frase parecida sem atender o pedido.

#### 3F.1A - Baseline e conjunto ouro

1. Extrair de 50 a 100 perguntas reais sanitizadas, priorizando os ultimos 10
   dias, e complementar com o benchmark do Meu Planner e casos adversariais.
2. Incluir metas, orcamento, gastos, entradas, contas, cartoes, faturas,
   recorrencias, parcelas, reembolsos, previsoes, familia, comparacoes, datas
   relativas, follow-ups e perguntas nao previstas literalmente.
3. Rotular pergunta, resposta esperada, dominio, metrica, operacao, dimensoes,
   filtros, entidade, periodo, base temporal, escopo autorizado, saude da fonte e
   necessidade de esclarecimento.
4. Separar conjunto de desenvolvimento e conjunto cego de aprovacao.
5. Executar o baseline atual e guardar plano, ferramentas, resposta, chamadas,
   tokens, custo estimado, latencia e falha, sempre sanitizados.
6. Transformar cada erro confirmado em teste de regressao permanente.

Gate A: conjunto ouro revisado, sem dado pessoal nos artefatos e com resultados
financeiros calculados por fixtures/SQLite controlado, nao por texto do LLM.

#### 3F.1B - Contrato semantico governado

1. Definir `FinancialQuerySpec` versionado com objetivo, dominio, metrica,
   operacao, dimensoes, filtros, entidade, periodo, base temporal, evidencias e
   motivo de esclarecimento.
2. Criar catalogo de metricas, dimensoes, sinonimos e regras para caixa,
   competencia, evento e vencimento.
3. Resolver escopo pessoal, familiar ou de membro fora do Gemini; o modelo pode
   pedir escopo, nunca conceder acesso ou escolher IDs.
4. Modelar `available`, `partial`, `stale` e `unavailable` para cada fonte. Zero e
   vazio continuam sendo resultados de dados, nao estados de infraestrutura.
5. Proibir filtros inventados. Ambiguidade material pede esclarecimento; defaults
   permitidos devem ser explicitos, versionados e visiveis na resposta.
6. Ligar cada capacidade do benchmark a metrica, ferramenta, resposta WhatsApp,
   API/tela futura e teste na matriz de rastreabilidade.

Gate B: schemas recusam planos sem dominio/periodo/escopo coerentes e todos os
conceitos financeiros usados pelo conjunto ouro possuem definicao unica.

#### 3F.1C - Ferramentas componiveis e SQL seguro

1. Oferecer um catalogo pequeno de ferramentas read-only para consultar metrica,
   listar/agrupar, comparar periodos, explicar/drill-down e verificar saude da
   fonte.
2. Selecionar para o prompt apenas as ferramentas relevantes para a pergunta.
3. Executar contas no Query Engine sobre SQLite/read-model e retornar agregados
   ou poucas linhas; nunca enviar a planilha inteira ao Gemini.
4. Criar fallback SQL somente sobre views curadas, com parser de AST,
   exclusivamente `SELECT`, colunas allowlisted, escopo injetado pela aplicacao,
   limite de linhas/tempo e bloqueio de schemas/IDs internos.
5. Registrar consulta e ferramenta de forma sanitizada e reproduzivel.
6. Manter comandos de escrita na rota existente com validacao, confirmacao,
   idempotencia e recibo; o agente read-only apenas entrega o comando a essa rota.

Gate C: nenhuma ferramenta amplia escopo, grava dados ou expoe tabela interna; os
totais do conjunto ouro batem exatamente com o motor deterministico.

#### 3F.1D - Orquestracao e estado

1. Usar o LangGraph atual para planejar, executar ferramenta, verificar e compor;
   nao migrar para outro framework sem lacuna comprovada.
2. Persistir checkpoint por conversa para reinicio, cancelamento, retomada e
   follow-up.
3. Limitar o caminho normal a duas rodadas de ferramenta; permitir terceira
   apenas com motivo de escalonamento registrado.
4. Usar Gemini Flash no caminho normal e modelo mais forte somente quando houver
   ambiguidade real ou falha de verificacao.
5. Testar handoff para fluxos deterministas existentes, inclusive criacao de
   meta, em shadow sem commit financeiro.
6. Garantir que cancelamento limpe somente o estado da operacao correta.

Gate D: restart entre mensagens nao perde nem mistura estado; uma conversa nunca
herda contexto financeiro ou permissao de outra.

#### 3F.1E - Verificador de trajetoria e resultado

1. Comparar pergunta original, `FinancialQuerySpec`, ferramentas escolhidas,
   argumentos, resultado e texto final.
2. Validar dominio, metrica, entidade, periodo, base temporal, escopo, saude da
   fonte e atendimento integral do pedido.
3. Recalcular invariantes matematicas e impedir que Gemini produza numero ausente
   do resultado verificado.
4. Remover aprovacao automatica de respostas apenas porque nao contem dinheiro.
5. Distinguir resposta correta vazia, necessidade de esclarecimento, dado parcial
   e falha de infraestrutura.
6. Emitir fallback honesto e rastreavel quando a verificacao falhar.

Gate E: nenhum erro critico conhecido recebe `verified=true`; resposta errada
falha fechada ou pede esclarecimento sem inventar ausencia/zero.

#### 3F.1F - Orcamento de custo

1. Medir tokens de entrada/saida, chamadas, rodadas, latencia e custo estimado por
   etapa, pergunta, dia e mes.
2. Reusar cache de instrucoes estaticas, catalogo e esqueletos de plano; nao
   reutilizar resposta financeira entre usuarios ou periodos.
3. Definir tetos por pergunta e mensais antes do canario, com fallback
   deterministico ao atingir o limite.
4. Enviar somente schema/ferramentas relevantes e resultados minimizados.
5. Comparar custo e latencia com o baseline para cada grupo do conjunto ouro.

Envelope inicial para validacao antes do canario: no maximo duas chamadas Gemini
por pergunta e 240 por mes do bot. Os limites podem ser reduzidos por
`FINANCIAL_AGENT_MAX_MODEL_CALLS_PER_QUESTION` e
`FINANCIAL_AGENT_MAX_MODEL_CALLS_PER_MONTH`; o contador mensal persiste somente
mes e total reservado, sem pergunta, usuario ou dado financeiro. Ao atingir um
limite, planner e composicao contextual voltam ao resultado deterministico.

Gate F: envelope de custo documentado e aprovado; nenhuma pergunta comum depende
de planilha inteira, ferramentas completas ou rodadas abertas.

#### 3F.1G - Shadow e decisao offline

1. Rodar arquitetura atual e candidata sobre os mesmos casos sem efeito no
   WhatsApp, Sheets ou ledger.
2. Usar chamadas live limitadas do Gemini para medir variacao e repetir casos
   criticos; calculos continuam em fixtures deterministicas.
3. Fazer revisao cega das divergencias sem favorecer a resposta nova.
4. Exigir 100% de isolamento de escopo, ausencia de escrita, contas exatas nos
   casos respondiveis, distincao entre fonte indisponivel e zero e aprovacao dos
   casos criticos de metas/orcamento/datas.
5. Exigir pelo menos 95% de correcao semantica no conjunto cego e resultado
   claramente superior ao baseline; todo erro restante deve ser nao critico,
   catalogado e ter fallback seguro.
6. Exigir custo e latencia dentro do envelope aprovado.

Gate G: `GO` somente com relatorio reproduzivel. Falha gera ajuste de contrato,
catalogo, ferramenta ou verificador, nao remendo de frase isolada.

#### 3F.1H - Canario familiar restrito e E2E

1. Colocar a rota candidata atras de flag read-only com rollback por uma
   alteracao, sem reiniciar ou migrar dados.
2. Liberar somente os dois membros autorizados do casal e manter qualquer
   usuario externo no baseline/fluxo fechado. Esta variacao do canario
   individual foi aprovada porque o produto sera restrito ao casal.
3. Executar pelo WhatsApp o caminho completo: pergunta real, bot no EC2,
   planejamento, ferramenta, SQLite/read-model, verificacao e resposta.
4. Para perguntas representadas no dashboard atual, comparar o mesmo usuario,
   periodo, criterio e numero.
5. Testar fonte indisponivel, timeout, restart, follow-up, cancelamento e limite
   de custo.
6. Auditar logs sanitizados, PM2, saude do dashboard, tokens/chamadas e rollback.
7. Registrar `GO/NO-GO`, residuos e evidencia; nao promover escrita.

Gate final 3F.1:

- Todos os gates A-H aprovados.
- Casos reais criticos passam E2E, nao apenas testes internos.
- Gemini interpreta e planeja; codigo resolve escopo, calcula, grava e valida.
- Nenhuma regressao de privacidade, idempotencia ou custo.
- Baseline permanece disponivel ate 3H e a promocao e reversivel.

### 3G - Reconciliacao de importacao contra lancamento manual

Objetivo: impedir duplicidade quando extratos importados encontram lancamentos manuais ja existentes.

Dentro do escopo:

- Matching deterministico por data, valor, conta/cartao, descricao normalizada e tolerancias explicitas.
- Preview obrigatorio antes de reconciliar.
- Status `matched`, `new`, `possible_duplicate`, `uncertain`.
- Auditoria de decisao.

Fora do escopo:

- OCR/PDF/imagem.
- Open Finance.
- Conciliacao automatica sem preview.

Passo a passo:

1. Definir matriz de matching e pesos aceitaveis.
2. Criar fixtures de extrato CSV/OFX com duplicata exata, duplicata provavel e item novo.
3. Escrever testes RED para nao duplicar gasto manual existente.
4. Implementar reconciliador offline primeiro, sem tocar Sheets reais.
5. Integrar preview ao fluxo de importacao atual.
6. Persistir links de reconciliacao no ledger shadow.
7. Adicionar limpeza marker-only para importacoes de teste.
8. Rodar bateria adversarial de duplicidade, datas proximas, valores iguais e descricoes parecidas.
9. Deploy com smoke manual se automacao WhatsApp for instavel.
10. Registrar GO/NO-GO.

Gate de saida:

- Importar o mesmo extrato duas vezes nao duplica.
- Lancamento manual correspondente e reconhecido.
- Itens incertos nunca sao gravados sem confirmacao.

### 3H - Gate de saida da Fase 3

Objetivo: provar que o nucleo analitico, recorrencias, parcelas, faturas,
previsoes, reembolsos e importacao convivem sem erro semantico ou duplicacao.

Passo a passo:

1. Montar bateria combinada com recorrencia paga, fatura paga, compra parcelada, reembolso e importacao.
2. Rodar replay local com restart entre etapas.
3. Rodar smoke marker-only em producao para pelo menos um caminho de escrita e varios caminhos read-only.
4. Comparar Sheets, ledger, read-model, dashboard e respostas do WhatsApp.
5. Reexecutar o conjunto cego 3F.1 e validar custo, trajetoria e falhas de fonte.
6. Verificar rollback por flag para superficies novas.
7. Documentar residuos e limpar marcadores.
8. Decidir GO/NO-GO para abrir Fase 4.

Gate de saida:

- Nenhuma duplicacao ao importar, pagar fatura, reiniciar ou editar regra recorrente.
- Todas as respostas financeiras declaram criterio de data/competencia quando relevante.
- Perguntas criticas de metas, orcamento, familia, datas e follow-up permanecem
  semanticamente corretas no E2E pelo WhatsApp.

## Fase 4 - Orcamento por categoria e Dashboard Familiar v2

Objetivo da fase: transformar o ledger confiavel em decisao visual e conversacional clara.

Rastreabilidade obrigatoria:

1. Converter o mapa de navegacao e o inventario funcional de
   `docs/audits/meu-planner-deep-product-study.md` e
   `docs/audits/meu-planner-feature-benchmark.md` em matriz de cobertura.
2. Para cada capacidade adotada, ligar pergunta de negocio, metrica semantica,
   ferramenta, resposta WhatsApp, endpoint, bloco visual e teste.
3. Preservar cockpit mensal, planejado versus realizado, pendencias,
   contas/faturas, planos, comparacoes, drill-down e qualidade dos dados.
4. Usar identidade, textos e layout proprios; nao copiar a estrutura literal do
   produto estudado.
5. Nao considerar uma capacidade concluida se existir apenas na conversa ou
   apenas no dashboard.

### 4A - Contrato de orcamento por categoria

Passo a passo:

1. Definir modelo de `budget_allocations`: ciclo, categoria, subcategoria, pessoa/familia, valor e status.
2. Criar invariantes: fatura nao duplica consumo; conta recorrente paga nao entra como gasto livre; reembolso reduz categoria correta.
3. Escrever testes RED para categorias sem orcamento, categoria nova e subcategoria criada pelo assistente.
4. Registrar metricas, dimensoes, sinonimos e criterio temporal de orcamento no
   catalogo semantico aprovado em 3F.1.
5. Implementar calculo deterministico por categoria/ciclo.
6. Adicionar perguntas read-only: restante por categoria, categorias estouradas e ritmo diario.
7. Validar contra orcamento familiar global atual.

Gate: total por categoria bate com total familiar explicavel e nao duplica cartao/fatura/conta.

### 4B - API de dashboard v2

Passo a passo:

1. Especificar contrato `/dashboard/api/v2/summary` com dados sanitizados.
2. Criar testes de contrato para caixa, competencia, reserva, contas, faturas, previsoes e qualidade dos dados.
3. Implementar endpoint usando o mesmo catalogo semantico, Query Engine e
   read-model do WhatsApp, sem calculo paralelo novo.
4. Garantir que ids internos, tokens e dados crus nao vazem.
5. Adicionar fallback seguro quando parte do ledger estiver indisponivel.

Gate: API responde todos os blocos com criterios explicaveis e sem vazamento.

### 4C - Dashboard familiar v2 mobile-first

Passo a passo:

1. Definir hierarquia de tela a partir da matriz do benchmark: hoje, ciclo,
   contas, categorias, faturas, proximos vencimentos, metas/dividas e qualidade
   dos dados.
2. Implementar primeiro painel sem trocar o dashboard atual por padrao.
3. Adicionar drill-down por bloco usando o mesmo contrato da API.
4. Testar desktop/mobile e contraste/leitura.
5. Comparar os numeros com WhatsApp para as mesmas perguntas.

Gate: dashboard e WhatsApp devolvem os mesmos valores para os KPIs principais.

### 4D - Qualidade dos dados e pendencias

Passo a passo:

1. Definir indicadores: sem categoria, incerto, pendente, nao conciliado, sem conta financeira e sem comprovante quando obrigatorio.
2. Criar query de cobertura por periodo e por origem.
3. Mostrar qualidade no dashboard sem bloquear todo o produto.
4. Criar perguntas WhatsApp sobre pendencias.
5. Testar com fixtures ruins e dados reais sanitizados.

Gate: item ruim aparece como pendencia, nao quebra totais confiaveis.

### 4E - Gate de saida da Fase 4

Passo a passo:

1. Bateria comparando dashboard v2, dashboard atual, Sheets, ledger e WhatsApp.
2. Testes de orcamento por categoria com cartao, fatura, recorrencia, reembolso e transferencia.
3. QA visual mobile/desktop.
4. Rollback por flag para dashboard v2.
5. Auditar a matriz do benchmark e justificar cada item adotado, adiado ou
   descartado.
6. Decidir GO/NO-GO para Fase 5.

## Fase 5 - Planos projetados

Objetivo da fase: evoluir metas, dividas, financiamentos e consorcios para planos auditaveis sem quebrar comandos atuais.

### 5A - Contrato comum de planos

Passo a passo:

1. Definir `plans`, `plan_movements` e adaptadores para metas/dividas atuais.
2. Criar invariantes de aporte, retirada, pagamento, juros e saldo projetado.
3. Escrever testes RED para meta simples e divida simples usando o mesmo contrato.
4. Implementar projetor puro sem mudar comandos existentes.
5. Validar restore/backup e paridade com abas antigas.

Gate: metas e dividas antigas aparecem como views compativeis do contrato novo.

### 5B - Cronograma e simulacao mensal

Passo a passo:

1. Criar calculo deterministico de cronograma mensal.
2. Adicionar perguntas: quando quito, quanto falta, impacto de antecipar.
3. Testar mudanca de aporte, retirada e pagamento extra.
4. Garantir que simulacao nao grava nada.
5. Adicionar explicabilidade dos criterios.

Gate: simulacao e historico real permanecem separados.

### 5C - Movimentos de plano com escrita confiavel

Passo a passo:

1. Adaptar comandos atuais de meta/divida para gerar recibo de plano.
2. Confirmar campos criticos antes de salvar.
3. Persistir no legado e projetar no contrato novo em shadow.
4. Testar idempotencia/retry/restart.
5. Smoke marker-only e limpeza.

Gate: nenhum movimento de plano vira despesa/renda duplicada.

### 5D - Gate de saida da Fase 5

Passo a passo:

1. Bateria de metas, dividas, financiamento e retirada.
2. Paridade Sheets/ledger/dashboard/WhatsApp.
3. Rollback por flag.
4. Decidir GO para manutencao e comprovantes.

## Fase 6 - Manutencao, formatos e comprovantes

Objetivo da fase: reduzir trabalho manual sem reduzir confiabilidade.

### 6A - Correcao e categorizacao em lote

Passo a passo:

1. Definir operacoes em lote permitidas e campos criticos.
2. Criar preview obrigatorio antes de qualquer alteracao.
3. Implementar selecionador de itens por filtro seguro.
4. Exigir confirmacao final com resumo de impacto.
5. Testar cancelamento, item inexistente, lote vazio e rollback logico.

Gate: IA nunca altera categoria em massa sem preview e confirmacao.

### 6B - Importacao XLS/XLSX e exportacao filtrada

Passo a passo:

1. Definir formatos aceitos e limites de tamanho/linhas.
2. Criar parser XLS/XLSX com preview igual ao CSV/OFX.
3. Implementar exportacao filtrada por periodo, conta, categoria e origem.
4. Testar arquivos malformados, formulas, abas extras e duplicidades.
5. Smoke com arquivo sintetico e limpeza.

Gate: arquivo importado nao grava nada sem preview; exportacao nao vaza campos internos.

### 6C - Comprovantes financeiros vinculados

Passo a passo:

1. Definir modelo de anexo: evento, tipo, Drive file id, hash, data e permissao.
2. Aceitar comprovante somente quando vinculado a evento existente ou fluxo pendente.
3. Armazenar no Drive como arquivo financeiro, nao como gestor generico.
4. Permitir busca por comprovante no WhatsApp e dashboard.
5. Testar privacidade, arquivo grande, tipo invalido e limpeza.

Gate: comprovante nunca vira transacao automaticamente.

### 6D - OCR/PDF/imagem com preview

Passo a passo:

1. Criar ADR curta para OCR e riscos.
2. Implementar extracao somente em staging/preview.
3. Reutilizar reconciliador da Fase 3G antes de qualquer escrita.
4. Exigir confirmacao do usuario para cada item critico.
5. Testar prompt injection visual/textual, baixa confianca e duplicidade.

Gate: OCR nao grava sem preview, reconciliacao e confirmacao.

### 6E - Undo por recibo/auditoria

Passo a passo:

1. Definir operacoes reversiveis e nao reversiveis.
2. Criar recibo estruturado para undo seguro.
3. Implementar undo marker-only primeiro.
4. Testar replay, undo duplo e item ja conciliado.
5. Expor historico de auditoria sanitizado.

Gate: undo nao apaga coisa errada e preserva trilha auditavel.

### 6F - Gate de saida da Fase 6

Passo a passo:

1. Bateria de importacao, lote, comprovante, OCR e undo.
2. Verificar limites, timeouts, duplicidades e privacidade.
3. Smoke manual se arquivo real for necessario.
4. Decidir GO para patrimonio/investimentos.

## Fase 7 - Patrimonio e investimentos

Objetivo da fase: responder quanto a familia possui, onde esta e como evoluiu, sem misturar caixa, patrimonio e resultado.

### 7A - ADR e modelo patrimonial

Passo a passo:

1. Definir escopo inicial: ativos manuais, contas, instituicoes, classes e liquidez.
2. Separar dinheiro em conta, reserva, investimento e rendimento.
3. Criar schema `investment_assets`, `investment_movements` e `asset_valuations`.
4. Testar aporte, resgate, rendimento e valorizacao manual.
5. Validar que resgate nao vira renda integral.

Gate: patrimonio, caixa e resultado ficam separados.

### 7B - Cadastro e movimentacao manual de ativos

Passo a passo:

1. Criar fluxo WhatsApp para cadastrar ativo com confirmacao.
2. Criar fluxo para aporte, resgate e valoracao.
3. Vincular movimentos a conta financeira quando houver caixa envolvido.
4. Testar idempotencia e rollback por flag.
5. Smoke marker-only com ativo ficticio.

Gate: aporte/resgate afetam caixa corretamente e patrimonio corretamente.

### 7C - Consultas e dashboard patrimonial

Passo a passo:

1. Adicionar perguntas sobre patrimonio total, por classe, por instituicao e por pessoa.
2. Criar blocos de dashboard sem recomendacao de investimento.
3. Declarar criterio de valoracao e data.
4. Testar dados antigos, ativo sem valoracao e liquidez.

Gate: respostas sao auditaveis e nao dao recomendacao financeira.

### 7D - Gate de saida da Fase 7

Passo a passo:

1. Bateria de aporte, resgate, rendimento, valorizacao e consulta.
2. Paridade ledger/dashboard/WhatsApp.
3. Verificar ausencia de mistura entre patrimonio e renda.
4. Decidir GO para consolidacao e remocao de legado.

## Fase 8 - Consolidacao e remocao do legado

Objetivo da fase: eliminar caminhos duplicados somente depois de uso zero comprovado.

### 8A - Inventario e telemetria de legado

Passo a passo:

1. Listar rotas, adapters, calculos e schemas legados.
2. Marcar cada consumidor atual e dono de migracao.
3. Adicionar telemetria sanitizada de uso quando faltar evidencia.
4. Rodar bateria para provar quais caminhos ainda recebem trafego.

Gate: nenhum caminho e removido sem medicao.

### 8B - Migrar consumidores restantes

Passo a passo:

1. Migrar uma superficie por vez para o contrato canonico.
2. Manter fallback por flag ate passar paridade.
3. Testar WhatsApp, dashboard, jobs e importacao.
4. Registrar GO/NO-GO por consumidor.

Gate: consumidor migrado tem paridade comprovada e rollback simples.

### 8C - Remover calculos e schemas obsoletos

Passo a passo:

1. Abrir PR/fatia apenas para remocao depois de zero uso.
2. Remover codigo morto com testes provando consumidores migrados.
3. Preservar exportacao legivel para Daniel/Thais.
4. Atualizar docs, runbooks e memoria operacional.

Gate: suite completa e bateria de regressao passam sem fallback legado.

### 8D - Cutover final de fonte de verdade

Passo a passo:

1. Definir ponto em que SQLite canonico vira fonte primaria.
2. Validar backup/restore real.
3. Manter Sheets como espelho/exportacao.
4. Rodar dry-run de rollback.
5. Fazer canario Daniel/Thais antes de GO final.

Gate: rollback testado e zero divergencia inexplicada.

### 8E - Gate de saida da Fase 8

Passo a passo:

1. Auditoria final altissima.
2. Conferir zero uso ativo de legado.
3. Conferir docs e runbooks atualizados.
4. Decidir GO para pesquisa Open Finance.

## Fase 9 - Meu Pluggy/Open Finance somente leitura

Objetivo da fase: reduzir importacao manual somente depois do nucleo estar estavel, auditavel e sem caminhos legados relevantes.

### 9A - Pesquisa atualizada e ADR

Passo a passo:

1. Verificar termos, custos, limites e disponibilidade do Meu Pluggy/Pluggy no momento da implementacao.
2. Mapear consentimento separado Daniel/Thais, revogacao e renovacao.
3. Atualizar threat model e politica de privacidade.
4. Definir criterio de GO/NO-GO comercial e tecnico.

Gate: ADR aprovado antes de conectar qualquer banco real.

### 9B - POC sandbox somente leitura

Passo a passo:

1. Criar integracao com sandbox ou conta descartavel.
2. Importar contas, saldos, extratos, cartoes e faturas para staging.
3. Bloquear qualquer escrita automatica no ledger final.
4. Testar falhas, atraso de sincronizacao e dados inconsistentes.

Gate: POC nao altera dados reais finais.

### 9C - Consentimento real limitado

Passo a passo:

1. Conectar uma instituicao real de baixo risco com consentimento explicito.
2. Validar escopo de dados, revogacao e renovacao.
3. Comparar com Sheets/ledger sem reconciliar automaticamente.
4. Documentar custos reais e limites.

Gate: consentimento pode ser revogado e dados ficam em staging.

### 9D - Conciliacao Open Finance em shadow

Passo a passo:

1. Reutilizar reconciliador da Fase 3G para extratos Open Finance.
2. Criar preview de divergencias.
3. Testar duplicatas com lancamentos manuais e importacoes antigas.
4. Medir confianca, latencia e falhas do provedor.

Gate: Open Finance nunca substitui conciliacao nem grava sem preview.

### 9E - Rollout familiar somente leitura

Passo a passo:

1. Conectar consentimentos separados Daniel e Thais se custos/termos permitirem.
2. Ativar consultas read-only por flag.
3. Monitorar divergencias e custo.
4. Manter fallback manual CSV/OFX.

Gate: custo familiar confirmado e rollback testado.

### 9F - Gate final do roadmap

Passo a passo:

1. Auditoria de seguranca, privacidade, custo e paridade.
2. Validar revogacao de consentimento.
3. Validar backup/retencao/exclusao.
4. Decidir se Open Finance permanece, recua ou fica apenas experimental.

## Ordem recomendada imediata

1. 3D, 3E e 3F concluidas com GO de producao.
2. Executar 3F.1A-B: conjunto ouro e contrato semantico.
3. Executar 3F.1C-F: ferramentas, estado, verificador e custo.
4. Rodar 3F.1G-H: shadow comparativo e canario read-only de Daniel.
5. Somente com `GO` executar 3G.
6. Rodar 3H e so entao abrir Fase 4.
7. Na Fase 4, implementar a matriz visual/funcional do benchmark sobre o mesmo
   nucleo semantico.

A proxima fatia implementavel e
`3F.1A - Baseline e conjunto ouro`, sem alterar producao.
