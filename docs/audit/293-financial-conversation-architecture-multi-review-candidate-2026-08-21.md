# Candidato de revisão múltipla da arquitetura conversacional financeira

Data: 2026-08-21  
Base examinada: `efc762deaa031dab691e9328b7cbf0d2b88caaf8`  
Natureza: diagnóstico e proposta; nenhuma mudança de runtime, dado ou produção.

## 1. Pergunta de decisão

O FinançasBot acumulou correções durante meses e ainda produz erros novos em
perguntas financeiras e follow-ups. A decisão pendente não é qual frase deve
receber mais um `if`, mas qual divisão de responsabilidade deve existir entre
IA e código determinístico.

Hipótese a revisar: a camada determinística deve continuar soberana em
autorização, escopo familiar, cálculos financeiros, idempotência e escrita; a
IA deve ganhar liberdade para entender a conversa, escolher ferramentas
read-only, iterar sobre resultados e redigir a resposta, sem ser obrigada a
reproduzir uma taxonomia interna exata antes de consultar dados.

## 2. Evidência quantitativa de retrabalho

Entre 2026-06-01 e esta base, o histórico Git contém 165 commits distintos que
tocam `src/agent`, `src/query` ou `src/handlers/messageHandler.js`; 88 têm assunto
explicitamente rotulado como correção. Isso não prova que todos corrigem o mesmo
defeito, mas demonstra a frequência de alteração na mesma fronteira causal.

Tamanho atual das principais superfícies:

| Arquivo | Linhas | Papel |
|---|---:|---|
| `src/handlers/messageHandler.js` | 12.547 | classificação, estado, follow-up, agente, fallback e resposta |
| `src/agent/langGraphRuntime.mjs` | 1.338 | planejamento, ferramentas, composição e verificação |
| `src/query/financialQueryEngine.js` | 2.399 | execução semântica e cálculos por domínio |
| `src/query/financialQueryPlan.js` | 637 | ontologia e validação do plano |
| `src/agent/financialAgentPlanner.js` | 347 | prompt, normalização e reparos do planner |
| `src/agent/contextualFinancialAnalyst.js` | 191 | redação LLM e fallback verificado |
| `tests/financialAgent.test.js` | 3.701 | regressões do agente |
| `tests/financialStateMachine.test.js` | 6.849 | regressões ponta a ponta do handler |

O corpus dourado existente possui 60 casos, 20 casos de aprovação e 15
críticos. A bateria documental de aceitação especifica 250 perguntas, incluindo
20 follow-ups. Ainda assim, smokes reais encontraram falhas depois de suítes
verdes. A conclusão sustentada é que volume de testes não elimina competição
entre rotas nem divergência entre o contrato testado e o comportamento real.

## 3. Arquitetura executada hoje

Uma pergunta pode atravessar, total ou parcialmente:

1. classificação local e fast paths no `messageHandler`;
2. checkpoint analítico de cinco minutos contendo `intent`, `parameters` e
   `metric` sanitizados;
3. reconstrução de follow-up por regex e precedências específicas;
4. `FinancialQueryPlan` vindo do classificador legado;
5. planner Gemini, limitado a ferramentas selecionadas por heurística textual;
6. reparos pós-LLM para aliases, tipos, datas e filtros;
7. normalização fechada de domínio, operação, filtros, agrupamento e base
   temporal;
8. seleção entre plano local, plano LLM e rotas especiais no LangGraph;
9. execução na Query Engine, SQL seguro, dashboard ou leitores/fallbacks;
10. composição determinística da resposta;
11. composição contextual opcional por Gemini, proibida de calcular, reordenar
    ou alterar o sentido do fallback;
12. verificação textual e possível retorno à resposta determinística;
13. fallback legado por domínio quando a rota agente não é selecionada.

Essa cadeia implementa defesa em profundidade, mas distribui a intenção do
usuário entre muitas autoridades. Uma etapa pode corrigir ou sobrescrever a
decisão de outra sem que o usuário tenha mudado a pergunta.

## 4. Erros reais preservados na documentação

### 4.1 Base temporal perdida em follow-ups de cartão — 2026-06-04

Perguntas de gasto mensal combinavam saídas e cartão pela competência da
fatura. Follow-ups como detalhe, estabelecimentos e categorias mudavam para a
data da compra. A mesma conversa passava a responder sobre conjuntos diferentes.
O reparo preservou `timeBasis=billing_month` no contexto.

### 4.2 Rotas livres e recentes exigiram sucessivas precedências — junho/julho

O histórico registra correções para: totais conversacionais que não entravam no
agente; maior gasto e transação recente; compras idênticas em cartões distintos;
plural de transações; aliases de cartão; plano LLM sobrescrevendo plano antigo;
datas civis relativas; e gastos recentes indevidamente limitados ao cartão.
Cada caso isolado era plausível, mas as correções alteravam precedência global.

### 4.3 Primeiro canário real do agente — 2026-07-11

Depois de testes remotos verdes, o WhatsApp revelou quatro falhas sistêmicas:

- mês zero-based exibido sem rótulo humano correto;
- métrica perdida no checkpoint de follow-up;
- filtro estruturado convertido em `[object Object]`;
- gastos recentes comuns excluídos por restrição indevida a cartão.

Um follow-up de dashboard também mudou domínio/métrica quando deveria alterar
somente o período. O gate só fechou depois de correção e novo E2E real.

### 4.4 Orçamento por categoria — 2026-07-13

No primeiro smoke, as três perguntas falharam apesar de 284 testes focados e
769 testes da suíte:

- o Gemini removeu o filtro da categoria e a resposta descreveu o orçamento
  global como se fosse daquela categoria;
- perguntas explícitas de orçamento foram capturadas como follow-ups genéricos
  e responderam ranking de gastos;
- depois do primeiro hotfix, categoria existente sem alocação ainda foi
  confundida com categoria ausente.

O fechamento tornou o plano determinístico autoritativo para orçamento,
ignorou follow-up genérico diante de sinal explícito e impediu composição LLM
em alguns subcasos. A correção resolveu o smoke, mas retirou liberdade da IA.

### 4.5 Qualidade dos dados — 2026-07-13

O primeiro smoke converteu resumo em listagem e adicionou filtro de status a uma
pergunta geral, eliminando as próprias pendências que deveriam aparecer. A
causa documentada foi a substituição indevida do plano local pelo planner
Gemini. O hotfix passou qualquer plano `quality` local antes do LLM e garantiu
zero chamada Gemini nesse domínio.

### 4.6 Metas e simulações — 2026-07-13/14

Foram necessários três ciclos de NO-GO:

1. o agente consultou read-model central vazio e encerrou, embora a autoridade
   fosse a planilha pessoal; o fallback detectava a planilha, mas perdia
   `userId`; duas frases dependiam do Gemini por falta de fast path;
2. o pronome “minha meta” virou `scope=personal` e excluiu a única meta familiar
   autorizada do próprio usuário;
3. o cálculo produziu `months_saved=-29`, mas dois formatadores sempre diziam
   “antecipado”, exibindo o sentido oposto ao resultado.

Esse episódio reúne três classes distintas: fonte/escopo, interpretação e
apresentação. Nenhuma troca isolada de modelo resolveria as três.

### 4.7 Verdade do gasto livre — 2026-08-15/21

Três commits sucessivos alteraram handler, Query Engine, serviços de read-model,
analytics e elegibilidade para reconciliar cartões, família, recorrentes,
competência e categorias. Em 2026-08-21, nova correção foi necessária para a
fonte de recorrentes. O domínio ilustra que a política de produto estava
replicada em mais de uma camada e fonte.

### 4.8 Bateria conversacional de 2026-08-21

Onze perguntas e follow-ups sanitizados cobriram gastos, entradas, contas,
gasto livre e vencimentos. O experimento isolado com
`openai/gpt-5.6-terra` via OpenRouter fez 33 chamadas, três por caso, sem escrita
externa:

- 33 respostas estruturadas válidas;
- 18/33 atenderam ao plano esperado;
- 6/11 casos foram corretos e estáveis;
- cinco falharam da mesma forma nas três repetições: operação de ranking,
  operação de saldo de contas, escopo/conta em follow-up, clarificação indevida
  do gasto livre e período/status de contas a vencer.

O experimento prova que trocar Gemini por GPT mantendo a mesma obrigação de
produzir o `FinancialQueryPlan` exato não é solução suficiente. Ele não prova
que o GPT falharia como agente iterativo orientado ao resultado. Também existe
uma questão metodológica: operações internas semanticamente equivalentes podem
ser marcadas como erro mesmo que levassem à resposta correta. O parecer externo
deve avaliar essa possível rigidez do benchmark.

## 5. Causas estruturais propostas

### C1. Muitas autoridades semânticas

Fast path, regex de follow-up, classificador, planner LLM, reparos e seleção no
LangGraph podem decidir domínio/operação. O plano vencedor depende de
precedências que cresceram por regressão.

### C2. Contexto conversacional reduzido cedo demais

O checkpoint guarda campos já interpretados, não uma representação de objetos,
referências e evidências da conversa. Follow-ups precisam ser reconstituídos por
regex. Se a primeira interpretação estiver errada ou incompleta, o erro é
herdado.

### C3. Ontologia interna virou objetivo do modelo

Antes de ler dados, a IA precisa escolher exatamente entre vários domínios,
18 operações, filtros, agrupamentos e seis bases temporais. A linguagem do
usuário nem sempre possui uma única decomposição interna correta.

### C4. IA usada como componente estreito, não como agente

O planner pode escolher apenas ferramentas pré-selecionadas. O analista final
recebe resultado e fallback, mas é proibido de calcular, alterar ordem ou
corrigir a ferramenta. Não há ciclo natural de “consultar, observar, refinar e
responder”. O LangGraph existe, porém grande parte da autonomia é eliminada por
fast paths e retornos determinísticos obrigatórios.

### C5. Segurança, cálculo e linguagem estão acoplados

Algumas correções legítimas de segurança ou exatidão exigiram retirar o LLM de
domínios inteiros. O desenho não separa claramente “IA pode decidir o que
consultar” de “IA não pode escolher usuário, inventar moeda ou escrever”.

### C6. Múltiplas autoridades de dados

Ledger canônico, SQLite/read-model, planilha pessoal, planilha central,
dashboard e fallbacks não têm uma única política de autoridade por consulta.
Uma interpretação correta pode receber fonte vazia ou parcial e responder como
se a realidade estivesse vazia.

### C7. Verificação orientada ao plano e ao texto

A bateria exige plano interno específico; o verificador textual compara a
resposta com o pacote de ferramenta. Falta uma avaliação principal por
resultado: conjunto consultado, fatos usados, cálculo, escopo, período,
incerteza e utilidade da resposta.

### C8. Suítes verdes não exercem a seleção real completa

Muitos testes validam funções, planos ou respostas com dependências injetadas.
Smokes reais mostraram que cache, flags, fonte autorizada, precedência e estado
de follow-up compõem uma trajetória diferente da unidade aprovada.

## 6. Solução proposta para revisão

### 6.1 Princípio

Dar autonomia sem entregar invariantes. A IA passa a ser proprietária da
compreensão conversacional e da estratégia read-only; o código determinístico
passa a ser proprietário das capacidades permitidas e da verdade financeira.

### 6.2 Novo caminho read-only

1. Receber mensagem e um contexto conversacional estruturado por entidades e
   referências, sem pré-classificar obrigatoriamente domínio/operação.
2. Oferecer catálogo pequeno de ferramentas financeiras de alto nível, por
   exemplo: resumo de gastos, listar eventos, saldos de contas, orçamento,
   vencimentos, metas e qualidade.
3. Injetar escopo autorizado, identidade familiar e fonte no servidor da
   ferramenta; o modelo nunca fornece `userId`, planilha ou tenant.
4. Permitir duas ou três chamadas de ferramenta, com limite de custo, para a IA
   observar resultado parcial, reformular filtros ou pedir esclarecimento.
5. Ferramentas calculam centavos, períodos, competência, compensações,
   parcelamentos e políticas de elegibilidade. A IA não soma linhas cruas.
6. A resposta da IA deve carregar internamente referências aos fatos retornados
   e uma declaração de cobertura/limitação.
7. Um verificador de afirmações valida números, datas, escopo e completude contra
   o pacote de evidência. Falha produz resposta segura ou esclarecimento, não
   migração silenciosa para outra semântica.

### 6.3 Escritas continuam separadas

Nenhuma autonomia adicional deve alcançar escrita direta. Comandos mutáveis
continuam em duas fases: intenção, preview determinístico, confirmação explícita,
comando tipado, idempotência e recibo. O agente pode explicar e preencher uma
proposta, mas não escolher autorização nem executar sem o gate existente.

### 6.4 Contexto

Substituir o checkpoint de `intent/parameters/metric` por estado curto com:

- pergunta anterior;
- entidades públicas referidas;
- ferramenta e argumentos públicos usados;
- período, escopo e base temporal efetivamente executados;
- referências opacas aos fatos retornados;
- pergunta ainda aberta ou ambiguidade;
- expiração e versão do contrato.

O follow-up pode então ser resolvido pelo agente contra a trajetória real, sem
uma árvore crescente de regex por domínio.

### 6.5 Avaliação finita

- preservar o corpus atual como regressão, mas avaliar resposta e evidência, não
  igualdade total do plano interno;
- criar corpus cego separado, não usado para ajustar prompt;
- incluir trajetórias completas com flags, cache, fonte e contexto;
- medir: correção factual, escopo, período, cobertura, necessidade de
  esclarecimento, vazamento, custo e latência;
- condição de parada anterior ao canário: zero violação crítica, 100% dos casos
  críticos e limiar explícito para casos não críticos;
- canário somente leitura para Daniel e Thaís, com shadow comparável e rollback
  por uma flag;
- só depois discutir substituição do caminho legado.

## 7. Alternativas

### A. Continuar endurecendo o `FinancialQueryPlan`

Menor mudança inicial, preserva ferramentas e testes. Risco alto de continuar
adicionando precedências, fast paths e reparos por novo tipo de pergunta.

### B. Agente read-only orientado a ferramentas, com núcleo determinístico

Proposta recomendada. Reutiliza Query Engine e leitores como capacidades, mas
remove a obrigação de acertar uma classificação única antes de observar dados.
Exige novo contexto, verificação por evidência e migração gradual.

### C. IA livre para consultar dados brutos, calcular e escrever

Não recomendada. Reduz código no curto prazo, mas transfere autorização,
aritmética, duplicação e efeitos financeiros a um componente probabilístico.

## 8. Questões obrigatórias aos revisores

1. A caracterização dos erros e das causas é sustentada pelos arquivos citados?
2. O problema dominante é excesso de determinismo, competição entre autoridades,
   fonte de dados, avaliação inadequada ou combinação desses fatores?
3. O benchmark de 11 casos mede semântica útil ou conformidade excessiva ao
   plano interno? Quais falhas continuariam críticas num agente por ferramentas?
4. O LangGraph atual pode ser simplificado/evoluído ou deve ser substituído?
5. Quais decisões devem permanecer absolutamente determinísticas?
6. Qual é o menor desenho que reduz regressões sem criar um projeto ilimitado?
7. Como provar melhora com corpus cego, trajetórias reais e condição de parada?
8. Qual alternativa deve ser adotada e quais são os principais riscos de
   migração e rollback?

## 9. Arquivos primários a ler no mesmo commit

- `src/handlers/messageHandler.js`
- `src/agent/financialAgentPlanner.js`
- `src/agent/langGraphRuntime.mjs`
- `src/agent/contextualFinancialAnalyst.js`
- `src/agent/resultVerifier.js`
- `src/agent/financialAgentToolCatalog.js`
- `src/agent/financialAgentTools.js`
- `src/query/financialQueryPlan.js`
- `src/query/financialQueryEngine.js`
- `tests/financialAgent.test.js`
- `tests/financialStateMachine.test.js`
- `tests/fixtures/agentic/phase-3f1a-golden-corpus.json`
- `docs/qa/financial-query-acceptance-battery.md`
- `docs/qa/phase-3f1h-local-canary-readiness-2026-07-11.md`
- `docs/qa/phase-4a-category-budget-gate-2026-07-13.md`
- `docs/qa/phase-4d-data-quality-gate-2026-07-13.md`
- `docs/qa/phase-5b-projected-plan-schedule-gate-2026-07-13.md`
- `docs/agent-memory/known-issues.md`

## 10. Limites deste candidato

- revisão estática e histórico Git; não é teste de produção;
- os 33 resultados GPT são execução relatada e sanitizada deste workstream
  anterior, não execução dos revisores;
- nenhum parecer externo foi incorporado ainda;
- a proposta não autoriza implementação, mudança de flag ou deploy.

