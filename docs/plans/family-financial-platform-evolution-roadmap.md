# Plano mestre: evolucao do FinancasBot familiar

Data: 2026-07-08
Status: Fases 1, 2 e 3 concluidas com GO de producao; Fase 4 nao iniciada e
depende de autorizacao explicita.

## 1. Norte do produto

Construir o melhor assistente financeiro pessoal familiar para Daniel e Thais:

- WhatsApp como interface principal de captura e conversa;
- dashboard como cockpit claro para decisao;
- um livro financeiro familiar coerente por baixo;
- IA para entender, planejar e explicar;
- codigo para calcular, validar, gravar e reconciliar;
- nenhuma resposta financeira importante baseada em improviso do LLM.

O objetivo nao e copiar o Meu Planner Financeiro nem virar um clone amplo do Meu
Assessor. Os benchmarks servem como referencia de conceitos contabeis, clareza
visual, onboarding e automacao, nao como especificacao de produto ou identidade.

Referencias internas:

- `docs/audits/meu-planner-feature-benchmark.md`
- `docs/audits/meu-planner-deep-product-study.md`
- `docs/audits/meu-assessor-product-research.md`

Decisao central depois dos benchmarks: o FinancasBot deve ser menor em escopo e
mais profundo em confiabilidade. O produto final desejado e um assistente
financeiro familiar conversacional, nao um assistente generico de produtividade.

## 2. Estado atual que deve ser preservado

Em 2026-06-24, a Fase 0 original ficou defasada como texto operacional: o
produto avancou de shadow puro para um baseline com respostas agenticas ativas.
O novo nucleo financeiro ainda nao deve atropelar estes rollouts, mas o gate
agora e de estabilizacao do que ja esta ligado, nao de decisao inicial de
ativacao:

1. Escritas: `INTERPRETATION_RELIABILITY_MODE=shadow` permanece intencionalmente
   ativo para acompanhar divergencias antes de qualquer nova decisao de
   `enforce`.
2. Analises read-only: `FINANCIAL_AGENT_MODE=answer` esta ativo para respostas
   verificadas; escritas financeiras continuam fora do agente read-only.
3. Planner Gemini: `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true` esta ativo como
   fallback de planejamento para `FinancialQueryPlan`, nunca como calculadora
   nem como executor de escrita.
4. Contextual analyst: `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer` esta ativo
   para compor respostas read-only ja verificadas, com fallback deterministico
   quando a composicao nao passa no verificador.
5. Family Mode continua desligado ate a allowlist real e o tratamento dos
   usuarios antigos serem validados.
6. O pacote local de orcamento livre e categorias novas corrige comportamento de
   escrita/consulta, mas ainda precisa release, smoke e rollback documentados
   antes de ser considerado parte do baseline de producao.

Interpretation Reliability, Financial Agent, Gemini Planner e Contextual Analyst
nao sao a mesma migracao. A primeira protege escritas; as demais orquestram,
planejam ou redigem consultas read-only verificadas.

## 3. Regra de congelamento

Durante a abertura da Fase 1:

- nao expandir a allowlist de `enforce`;
- nao ampliar `answer`, planner Gemini ou contextual analyst para novas
  superficies sem bateria, canario e rollback;
- nao permitir que planner/contextual analyst gravem, apaguem, reclassifiquem ou
  calculem valores finais;
- nao ativar Family Mode sem allowlist Daniel/Thais validada e plano reversivel
  para usuarios antigos;
- nao mudar schema real das planilhas;
- nao introduzir OCR/PDF, investimentos ou novo dashboard em producao;
- permitir somente correcoes criticas, observabilidade, testes, documentacao e
  prototipos offline.

Especificacao e fixtures podem avancar em paralelo, mas sem alterar fonte de
verdade, schema real ou superficie de escrita canonica.

## 3.1. Protocolo permanente de evidencia acelerada

Nenhuma fase deve ficar parada apenas para "esperar e observar" volume natural.
Quando um gate pedir janela, amostra, observacao ou uso real, o trabalho padrao e
gerar imediatamente uma bateria que produza a evidencia necessaria de forma
controlada, adversarial, repetivel e limpavel.

Para cada superficie implementada, a bateria deve cobrir:

1. caminho feliz e todas as operacoes liberadas;
2. ambiguidades, campos ausentes, texto contraditorio e entidades inexistentes;
3. cancelamento em cada estado, resposta invalida e retomada de conversa;
4. duplicidade, replay, mensagens repetidas, ordem inesperada e idempotencia;
5. datas absolutas/relativas, virada de dia/mes/ano e fuso do bot;
6. falha e timeout de Gemini, Sheets, SQLite/read-model e WhatsApp, verificando
   fallback e ausencia de escrita parcial;
7. reinicio entre etapas, concorrencia plausivel e recuperacao por recibo;
8. paridade entre Sheets, ledger, read-model, dashboard e resposta do WhatsApp;
9. classificacao contabil, impacto no orcamento livre e ausencia de duplicacao;
10. telemetria sanitizada, severidade, latencia, custo e ausencia de dados
    sensiveis nos artefatos;
11. rollback por flag e retorno ao baseline sem perda ou corrupcao;
12. limpeza marker-only comprovada nas fontes tocadas.

A execucao deve combinar testes unitarios/contratuais, maquina de estados, replay
sanitizado, bateria live do Gemini com teto de chamadas e E2E de producao
marker-only. Se a automacao do WhatsApp tiver dificuldade, Daniel envia as
mensagens manualmente e devolve as respostas; nao manter espera ativa.

Um gate acelerado so recebe `GO` quando a matriz de operacoes e invariantes esta
completa, nao ha divergencia critica, os fallbacks sao seguros, a paridade foi
demonstrada e a limpeza passou. Qualquer falha gera `NO-GO`, teste de regressao e
correcao da causa raiz antes de repetir apenas o bloco afetado.

Espera cronologica real fica reservada a riscos que nao possam ser simulados,
como mudanca externa do protocolo do WhatsApp ou indisponibilidade do provedor.
Nesse caso, o documento do gate deve justificar por que relogio falso, replay,
injecao de falha, reinicio e carga sintetica nao bastam. Nao existe espera
passiva generica nem repeticao integral de testes ja aprovados sem nova causa.

## 4. O que o FinancasBot ja faz melhor e sera mantido

### Arquitetura conversacional

- LangGraphJS como runtime final de orquestracao.
- Query Engine como ferramenta deterministica.
- SQL read-only seguro para perguntas nao previstas.
- Verificador antes da resposta.
- Follow-ups com contexto sanitizado.

Nao reabrir a decisao de arquitetura nem voltar a intents por frase.

### Confiabilidade de escrita

- extracao deterministica primeiro;
- Gemini somente para lacunas;
- confirmar campos criticos dependentes de IA;
- idempotencia, reconciliacao e recibo estruturado;
- telemetria sanitizada e rollback por flag.

O novo ledger deve ser chamado pelo executor confiavel, nunca contorna-lo.

### Diferenciais do produto

- conversa livre pelo WhatsApp;
- perguntas analiticas abertas;
- responsabilidade por pessoa no contexto familiar;
- deteccao de duplicados entre importacao e lancamento manual;
- Google Calendar, resumos e vencimentos;
- dados acessiveis no Drive/Sheets;
- dashboard explicavel pelo mesmo motor de consulta;
- seguranca contra vazamento, prompt injection e escopo incorreto.
- Calendar ja funcional para lembretes, agenda/resumos e vencimentos;
- foco familiar Daniel/Thais, sem tentar resolver empresa, equipe, reunioes ou
  gestao geral de arquivos neste ciclo.

## 5. O que incorporar do benchmark

### Prioridade P0: nucleo financeiro

1. Data do evento, efetivacao, competencia e vencimento como conceitos distintos.
2. Status universal `pending`, `settled`, `cancelled` e `uncertain`.
3. Contas financeiras com saldo inicial e movimentos conciliaveis.
4. Transferencias neutras ligadas nas duas pontas.
5. Orcamento por categoria e mes, alem do orcamento familiar global.

### Prioridade P1: previsao e conciliacao

1. Contas a pagar e receber futuras.
2. Recorrencias como regras, sem duplicar linhas antecipadamente.
3. Faturas vinculadas a itens, cartao, conta pagadora e pagamento.
4. Parcelamentos como cronograma de competencias.
5. Reembolso/estorno ligado ao lancamento original.
6. Correcao e conciliacao em lote com trilha auditavel.

### Prioridade P2: patrimonio e conveniencia

1. Planos projetados para metas, dividas, financiamentos e consorcios.
2. Carteira de investimentos com aportes, resgates, saldos e valoracoes.
3. Importacao XLS/XLSX e, depois, PDF/imagem com preview obrigatorio.
4. Exportacao filtrada em XLSX.

### Prioridade P3: comprovantes e conveniencia operacional

1. Comprovantes financeiros vinculados a lancamentos, usando Drive apenas como
   arquivo financeiro, nao como gestor geral de documentos.
2. OCR/imagem/PDF somente com preview, confirmacao e reconciliacao.
3. Exportacao e manutencao em lote para reduzir trabalho manual.

### Ultima fase: Meu Pluggy/Open Finance somente leitura

1. Pesquisa/ADR de Open Finance, com foco inicial em Meu Pluggy gratuito para uso
   pessoal/familiar.
2. Modelo recomendado: Daniel e Thais com consentimentos separados, cada titular
   autorizando suas proprias contas, e o FinancasBot consolidando no ledger
   familiar.
3. Validar se o uso gratuito continua disponivel apos trial e quais limites se
   aplicam ao uso pessoal/desenvolvedor.
4. Sincronizacao bancaria somente leitura em shadow antes de qualquer conciliacao
   automatica.

Open Finance tem alto valor porque reduz importacao manual, mas deve ser a ultima
alteracao estrutural do roadmap. Antes de existir ledger canonico, contas, faturas,
reconciliacao forte e remocao do legado, ele aumenta volume de dados sem aumentar
confiabilidade.

### Rastreabilidade obrigatoria do benchmark

Os estudos `meu-planner-feature-benchmark.md` e
`meu-planner-deep-product-study.md`, inclusive seu mapa de navegacao, continuam
como entrada obrigatoria do produto. Eles nao ficam adiados como inspiracao
visual: cada capacidade aproveitada deve aparecer em uma matriz versionada com:

1. conceito financeiro e pergunta de negocio;
2. metrica, dimensoes e regra temporal no catalogo semantico;
3. ferramenta read-only ou comando deterministico que atende a capacidade;
4. resposta equivalente no WhatsApp;
5. contrato de API e bloco correspondente do dashboard, quando visual;
6. fixture, pergunta real sanitizada e teste de paridade.

A matriz deve cobrir inicialmente cockpit do mes/ciclo, planejado versus
realizado, pendencias, contas e faturas, recorrencias e parcelas, metas/dividas,
comparacoes historicas, drill-down e qualidade dos dados. Patrimonio e
investimentos entram na mesma matriz apenas nas fases previstas.

Uma capacidade nao esta concluida se existir somente na tela ou somente na
conversa. WhatsApp, Query Engine, API e dashboard devem compartilhar significado,
criterio temporal e numero. A identidade visual, os textos e o layout literal do
produto estudado nao serao copiados.

## 6. O que deliberadamente nao incorporar

- Nao copiar identidade visual, textos, navegacao ou layout do concorrente.
- Nao obrigar uso da web para tarefas seguras que cabem no WhatsApp.
- Nao limitar a familia artificialmente a dois dispositivos no modelo de dados.
- Nao usar `float` para dinheiro; usar centavos inteiros ou decimal exato.
- Nao precriar 12 transacoes para uma recorrencia; materializar ocorrencias sob
  demanda e preservar a regra de origem.
- Nao permitir categorizacao em massa por IA sem preview e confirmacao.
- Nao bloquear todo o dashboard por um item sem categoria; exibir cobertura e
  confianca dos dados.
- Nao priorizar lembrete por email; o canal principal continua WhatsApp/Calendar.
- Nao construir modulo de investimento antes de contas e conciliacao.
- Nao trocar Gemini, LangGraph ou provedor de WhatsApp por modismo. A arquitetura
  interna do agente e da Query Engine pode ser redesenhada por contrato e
  evidencia; migracao de framework exige ganho medido que o LangGraph atual nao
  consiga entregar.
- Nao virar assistente geral de projetos, tarefas, atas, reunioes ou notificacoes
  para terceiros.
- Nao criar um "Drive inteligente" generico; anexos devem ser financeiros e
  vinculados a eventos.
- Nao implementar Open Finance antes de ADR, consentimento, revogacao,
  reconciliacao e rollback estarem definidos.
- Nao prometer precisao de IA sem medicao, auditoria e verificador.

## 7. Arquitetura alvo

```text
WhatsApp                         Dashboard familiar
    |                                   |
    +---------- Security/Scope ---------+
                       |
          Conversation Orchestrator / LangGraph
                       |
          +------------+-------------+
          |                          |
  Command route                 Gemini Planner
  (writes)                      (read-only)
          |                          |
  Validated command       Validated FinancialQuerySpec
  + confirmation                     |
          |                 Semantic tool catalog
  Idempotent executor        + curated safe SQL
          |                          |
          +------ Deterministic Domain Services ------+
                                  |
                    Canonical Ledger / Read Model
                              SQLite
                                  |
                    Trajectory + Result Verifier
                                  |
                         Response Composer
                                  |
             Dashboard snapshots / Sheets mirror
```

### Liberdade interpretativa com limites deterministas

O Gemini recebe liberdade para compreender linguagem natural, contexto,
parafrases e perguntas nao previstas, decompor a pergunta e escolher ferramentas.
Ele nao recebe liberdade para decidir permissao, inventar dados, calcular o valor
final, executar escrita ou transformar indisponibilidade em zero.

Toda consulta deve produzir um `FinancialQuerySpec` validado com, no minimo:

- objetivo, dominio, metrica e operacao;
- dimensoes, filtros, entidade e periodo;
- base temporal (`caixa`, `competencia`, `evento` ou `vencimento`);
- pedido de escopo, resolvido e autorizado fora do LLM;
- evidencias necessarias e motivo de esclarecimento, quando houver ambiguidade.

O catalogo semantico e a fonte governada de metricas, dimensoes, sinonimos,
criterios temporais e relacionamentos. O Gemini recebe apenas as ferramentas
relevantes para a pergunta. O Query Engine calcula sobre SQLite/read-model e
devolve agregados ou poucas linhas, nunca a planilha inteira.

Perguntas novas que sejam respondiveis pelos dados podem usar SQL somente leitura
sobre views curadas. Esse caminho exige parser de AST, apenas `SELECT`, injecao de
escopo pela aplicacao, allowlist de colunas, limite de linhas/tempo e bloqueio de
schemas internos, IDs e qualquer escrita.

O verificador cruza pergunta original, plano, trajetoria, resultado e resposta.
Ele valida dominio, periodo, escopo, entidade, saude da fonte, atendimento do
pedido e invariantes matematicas. Resultado vazio, fonte indisponivel e zero real
sao estados diferentes. Respostas sem dinheiro nao passam automaticamente.

Escritas continuam em rota separada, com plano de comando validado, confirmacao,
idempotencia e recibo. A orquestracao deve persistir estado por conversa para
reinicio, cancelamento e retomada sem perder fluxos como criacao de meta.

### Controle de custo e complexidade

- Gemini Flash atende o caminho normal; modelo mais forte so entra por ambiguidade
  real ou falha de verificacao.
- O caminho normal usa no maximo duas rodadas de ferramentas; uma terceira exige
  escalonamento registrado.
- Instrucoes estaticas, catalogo semantico e esqueletos de plano podem usar cache;
  respostas financeiras do usuario nao.
- Apenas agregados e linhas estritamente necessarias entram no contexto.
- Tokens, chamadas, latencia, falhas e custo estimado sao medidos por pergunta,
  por dia e por mes, com tetos e fallback deterministico.
- Novas ferramentas nascem de lacunas demonstradas no corpus de avaliacao, nao de
  uma lista crescente de frases especiais.

### Fonte de verdade recomendada

Para dois usuarios, SQLite com WAL, migracoes versionadas e backup criptografado
automatizado e suficiente e reduz complexidade. O ledger canonico deve migrar para
SQLite; Sheets passa gradualmente de fonte primaria para espelho legivel/exportavel.

Essa decisao exige ADR especifico e prova de restauracao antes do cutover. Se os
requisitos de disponibilidade crescerem, o mesmo contrato pode migrar para Postgres
sem alterar o dominio.

### Modelo conceitual minimo

- `households`
- `people`
- `accounts`
- `cards`
- `categories`
- `financial_events`
- `transfer_links`
- `installment_schedules`
- `recurrence_rules`
- `reconciliations`
- `budget_allocations`
- `plans` e `plan_movements`
- `investment_assets` e `asset_valuations` somente na fase patrimonial

Todo evento financeiro deve registrar:

- valor em centavos;
- tipo e direcao;
- pessoa responsavel;
- conta/cartao quando aplicavel;
- data do evento;
- data de efetivacao;
- competencia;
- vencimento quando aplicavel;
- status;
- origem (`whatsapp`, `import`, `manual`, `recurrence`, `reconciliation`);
- chave idempotente e vinculos com eventos relacionados.

## 8. Estrategia de migracao

Usar Strangler Pattern, sem big bang:

1. Criar ledger novo sem mudar respostas ou escritas atuais.
2. Fazer backfill em dry-run e comparar totais/contagens por dominio.
3. Projetar recibos do executor atual para o ledger em shadow.
4. Comparar Sheets, ledger, read-model e dashboard automaticamente.
5. Ativar leitura do ledger por dominio e por flag.
6. Ativar escrita canonica somente depois da paridade.
7. Manter Sheets como espelho durante periodo de seguranca.
8. Remover caminhos antigos somente apos uso zero comprovado.

Rollback em qualquer fase deve ser troca de flag, nunca reversao destrutiva de dados.

## 9. Fases de execucao

O detalhamento operacional do restante do roadmap esta em `docs/plans/family-financial-platform-step-by-step-roadmap.md`. Use esse documento como fila passo a passo apos a Fase 3B; este arquivo continua sendo o macroplano e a fonte de escopo/gates gerais.

### Fase 0 - Estabilizar o baseline answer/planner atual

**Objetivo:** provar que o baseline atual de producao e estavel antes do novo
nucleo. `answer`, planner Gemini e contextual analyst ja estao ligados; esta
fase decide se eles permanecem, recuam ou avancam, nao se podem ser ligados pela
primeira vez.

**Status em 2026-06-24:** rodada registrada em
`docs/qa/phase-zero-baseline-stabilization-2026-06-24.md`. Baterias locais e
planner live curto ficaram verdes; auditoria SSH da EC2 confirmou commit,
worktree, flags do agente, PM2, health e state. Daniel decidiu manter
`INTERPRETATION_RELIABILITY_MODE=shadow` de proposito, acompanhando divergencias
de escrita ate a camada ficar madura para nova decisao de `enforce`. Com isso,
a Fase 0 fica `APROVADA PARA FASE 1 COM RESTRICOES`: Family Mode continua
desligado ate validar allowlist Daniel/Thais; o pacote orcamento/categorias nao
entra no baseline de producao sem release/smoke/rollback proprio; e answer,
planner e contextual analyst nao devem ser ampliados sem bateria e rollback por
flag.

**Tarefas:**

1. Confirmar paridade entre codigo local/GitHub/EC2, commit de producao e flags
   documentadas.
2. Auditar uso real de `expense.create` e `income.create` em `enforce`, com zero
   divergencia critica nova, duplicidade, escrita errada ou limpeza falha.
3. Auditar `FINANCIAL_AGENT_MODE=answer`: ferramentas chamadas, respostas
   verificadas, fallbacks, bloqueios de seguranca, latencia e custo indireto.
4. Auditar `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true`: planos aceitos/rejeitados,
   gaps, campos bloqueados, periodos relativos, dominios acionados e chamadas
   Gemini.
5. Auditar `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer`: composicoes aceitas,
   rejeicoes por verificador, fallback deterministico e qualquer tentativa de
   expor dado interno.
6. Executar baterias offline, replay real sanitizado e uma bateria live curta e
   controlada do planner no estado atual.
7. Testar rollback separado por flag para `FINANCIAL_AGENT_MODE`,
   `FINANCIAL_AGENT_LLM_PLANNER_ENABLED`, `FINANCIAL_CONTEXTUAL_ANALYST_MODE` e
   `INTERPRETATION_RELIABILITY_MODE`.
8. Validar e, se aprovado, publicar o pacote de orcamento livre/categorias novas
   com smoke marker-only e limpeza idempotente.
9. Validar allowlist Daniel/Thais e planejar inativacao reversivel dos demais
   usuarios antes de ligar Family Mode.

**Gate de saida:**

- canario de escrita verde;
- agente read-only, planner Gemini e contextual analyst com decisao documentada
  de manter, recuar ou expandir;
- rollback de cada flag critica testado;
- pacote de orcamento/categorias validado ou explicitamente mantido fora do
  baseline;
- logs e estado limpos;
- nenhuma diferenca de deploy desconhecida.

**Capacidade:** altissima para auditoria/decisao; alta para ajustes e testes.

### Fase 1 - Contrato do ledger familiar

**Status em 2026-06-24:** concluida localmente por `docs/decisions/ADR-006-canonical-financial-ledger.md`,
`docs/specs/canonical-financial-ledger.md` e
`docs/plans/phase-1-canonical-ledger-implementation-plan.md`. Esta abertura
preserva o baseline read-only atual: `FINANCIAL_AGENT_MODE=answer`,
`FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true` e
`FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer`. O Gemini Planner fica ativo; o que
nao pode acontecer sem novo gate e expandi-lo para escrita, admin, migracao ou
calculo final.

O fechamento inclui projetor puro, fixtures, relatorio dry-run, SQLite shadow
com backup/restore, politica executavel de rollout e runbook de dual projection.
A decisao de saida e `NO-GO` para shadow em producao: a Fase 2 deve primeiro
projetar recibos unitarios ja verificados e medir paridade sem mudar o resultado
legado.

**Objetivo:** definir a fonte de verdade sem alterar producao.

**Tarefas:**

1. Criar ADR SQLite canonico x Sheets espelho x Postgres futuro.
2. Definir schema v1 e invariantes contabeis.
3. Definir adaptadores de compatibilidade para abas atuais.
4. Definir politica de backup, restauracao, criptografia e retencao.
5. Criar fixtures anonimizadas com os casos reais de Daniel/Thais.
6. Criar migrador dry-run e relatorio de diferencas, sem escrita.

**Invariantes obrigatorios:**

- transferencia interna nao muda patrimonio;
- pagamento de fatura nao duplica gasto;
- reembolso reduz gasto da categoria correta;
- parcela aparece uma vez na competencia correta;
- reserva muda disponibilidade, nao renda;
- correcoes preservam auditoria.

**Gate de saida:** schema e ADR aprovados; restore testado; dry-run sem diferenca
inexplicada.

**Capacidade:** altissima para ADR/schema; alta para migrador/testes.

### Fase 2 - Contas, datas e status

**Objetivo:** entregar o primeiro corte vertical do novo nucleo.

**Escopo:**

- contas e saldos iniciais;
- gasto/entrada unitarios;
- data do evento e efetivacao;
- status pendente/concluido;
- transferencias pareadas e neutras;
- espelho nas abas atuais.

**Rollout:** shadow -> dual projection -> leitura canario -> escrita canonica.

**Gate corretivo 2A - planner financeiro unificado:**

O incidente real de pagamento de conta de telefone mostrou que a projecao
canonica pode estar correta e ainda assim nao receber um recibo, porque a
mensagem foi classificada antes como pagamento de divida ou gasto comum. Antes
de ativar leitura canario, a Fase 2 deve consolidar a interpretacao inicial em
um `FinancialCommandPlan` validado, mantendo calculo, escopo, confirmacao e
escrita sob controle deterministico. O plano detalhado esta em
`docs/plans/phase-2a-unified-financial-command-planner-plan.md`.

Esse gate nao antecipa a modelagem completa de recorrencias da Fase 3 nem o
orcamento por categoria da Fase 4.

**Gate de saida:** saldos e movimentos batem entre ledger, Sheets, read-model e
dashboard; E2E marker-only limpo e idempotente.

**Capacidade:** alta para implementacao; altissima no gate de cutover.

### Fase 3 - Recorrencias, parcelas, contas e faturas

**Objetivo:** transformar previsao e conciliacao em capacidades nativas.

**Escopo:**

- regras de recorrencia versionadas;
- ocorrencias materializadas sob demanda;
- contas a pagar/receber;
- cronograma de parcelas;
- faturas e itens vinculados;
- baixa de fatura com conta pagadora;
- estorno/reembolso vinculado;
- reconciliacao de importacao versus lancamento manual.

**Gate de saida:** nenhuma duplicacao ao importar, pagar fatura, reiniciar ou editar
regra recorrente.

**Capacidade:** alta; altissima para auditoria de reconciliacao.

**Portao arquitetural 3F.1, antes de 3G:** rebasear o nucleo analitico
read-only sobre `FinancialQuerySpec`, catalogo semantico, ferramentas
componiveis, calculo deterministico e verificacao de trajetoria. Esse portao nao
cria uma decima fase nem autoriza reescrita: ele corrige a rota tecnica dentro da
Fase 3 antes de ampliar reconciliacao e dashboard.

A aprovacao exige corpus de perguntas reais sanitizadas, comparacao entre
baseline e arquitetura candidata, zero vazamento/escrita, numeros exatos, falha
de fonte distinta de zero, custo limitado, E2E completo pelo WhatsApp e canario
read-only reversivel de Daniel. O detalhamento e os limiares estao no roadmap
passo a passo.

### Fase 4 - Orcamento por categoria e Dashboard Familiar v2

**Objetivo:** oferecer a clareza visual apreciada no benchmark, com identidade e
criterios proprios.

**Dashboard v2:**

1. Hoje e ciclo atual.
2. Receitas, gastos, saldo economico, reserva e disponivel.
3. Planejado versus realizado por categoria.
4. Contas, faturas, parcelas e receitas futuras.
5. Daniel, Thais e total familiar.
6. Cartoes e competencias futuras.
7. Metas e dividas.
8. Qualidade dos dados: classificados, pendentes e nao conciliados.

Cada numero deve permitir drill-down e responder `de onde veio esse valor?` pelo
mesmo motor usado no WhatsApp.

O mapa de navegacao e o inventario funcional dos estudos do Meu Planner devem ser
convertidos na matriz de rastreabilidade definida neste plano. A Fase 4
implementa essa hierarquia com identidade propria e sobre o mesmo catalogo
semantico aprovado no portao 3F.1; nao cria calculos paralelos para a interface.

**Principios visuais:** hierarquia clara, poucos graficos por decisao, mobile-first,
sem elementos cortados, sem misturar caixa, competencia e patrimonio.

**Gate de saida:** contratos de API, desktop/mobile, consistencia WhatsApp/dashboard
e explicabilidade aprovados com dados reais e fixtures.

**Capacidade:** altissima para arquitetura de informacao; alta para implementacao;
media para QA visual repetitivo depois dos contratos estarem fechados.

### Fase 5 - Planos projetados

**Objetivo:** evoluir metas e dividas sem quebrar comandos atuais.

**Escopo:**

- contrato interno comum de plano;
- views compativeis para metas e dividas existentes;
- cronograma mensal;
- aportes, retiradas e pagamentos;
- antecipacao;
- retirada com ou sem reposicao;
- recalculo auditavel de parcelas futuras.

**Gate de saida:** nenhum movimento duplica despesa ou renda; historico antigo e
preservado; comandos atuais continuam funcionando via adaptador.

**Capacidade:** altissima para regras; alta para implementacao.

### Fase 6 - Manutencao, formatos e comprovantes

**Status em 2026-07-14:** encerrada com `GO de producao`; bateria combinada
`76/76`, cinco E2Es reais verdes e cleanup zero.

**Objetivo:** reduzir trabalho manual sem reduzir confiabilidade.

**Escopo:**

- correcao e categorizacao em lote com preview;
- exportacao XLSX filtrada;
- importacao XLS/XLSX;
- PDF e imagem/OCR apenas depois, sempre com confirmacao;
- comprovantes financeiros vinculados ao evento correspondente;
- busca por comprovante financeiro a partir do WhatsApp;
- indicador de cobertura de categorizacao;
- undo por recibo/auditoria.

**Gate de saida:** nenhum arquivo, OCR ou IA grava automaticamente campo critico;
limites, timeouts, duplicidade e limpeza estao testados.

**Capacidade:** alta; media para ampliar fixtures e casos repetitivos.

### Fase 7 - Patrimonio e investimentos

**Status em 2026-07-14:** adiada por decisao de produto, nao cancelada. O produto
nao possui ativo real para modelar hoje; consolidar o nucleo existente reduz mais
risco. Reabrir quando houver ativo real, necessidade de separar rendimento de
caixa/reserva ou demanda patrimonial concreta.

**Objetivo:** responder quanto a familia possui, onde esta e como evoluiu.

**Escopo inicial:**

- ativos, emissor, produto, conta, aplicacao, vencimento e liquidez;
- aportes, resgates e valoracoes manuais;
- separacao entre capital transferido e rendimento;
- carteira por classe, instituicao e pessoa;
- rentabilidade simples e evolucao patrimonial.

Indices externos sao informativos e nao devem substituir cotacao/valoracao do ativo.
Impostos e recomendacoes de investimento ficam fora ate ADR especifico.

**Gate de saida:** patrimonio, caixa e resultado nao se misturam; resgate nao vira
renda integral; calculos sao auditaveis.

**Capacidade:** altissima para modelagem financeira; alta para implementacao.

### Fase 8 - Consolidacao e remocao do legado

**Objetivo:** eliminar caminhos duplicados depois da paridade.

**Tarefas:**

1. Medir uso de cada rota/adapter legado.
2. Migrar consumidores restantes.
3. Remover calculos paralelos e schemas obsoletos.
4. Atualizar manuais, memoria operacional e runbooks.
5. Manter exportacao e backup legiveis para Daniel/Thais.

**Gate de saida:** zero uso ativo comprovado antes de qualquer remocao.

**Capacidade:** alta para remocao; altissima para auditoria final.

### Fase 9 - Meu Pluggy/Open Finance somente leitura

**Objetivo:** reduzir importacao manual somente depois que o nucleo financeiro
familiar estiver estavel, auditavel e sem caminhos legados relevantes.

**Decisao registrada:** esta e a ultima alteracao estrutural do roadmap. O caminho
preferido para o casal, se os termos e limites continuarem permitindo, e usar Meu
Pluggy gratuito com consentimentos separados: Daniel autoriza as contas de Daniel,
Thais autoriza as contas de Thais, e o FinancasBot consolida tudo no ledger
familiar.

**Escopo de pesquisa/ADR:**

- confirmar termos atuais do Meu Pluggy e Pluggy para uso pessoal/familiar gratuito;
- confirmar se o acesso continua utilizavel depois do trial de desenvolvedor;
- validar limites de contas, instituicoes, requisicoes, sincronizacao e retencao;
- mapear consentimento, revogacao e renovacao por titular;
- mapear instituicoes suportadas para Daniel/Thais;
- mapear dados retornados: contas, saldo, extrato, cartoes, faturas e investimentos;
- avaliar falhas, atrasos, duplicidade e divergencia com extratos;
- atualizar threat model, politica de privacidade e rollback.

**Escopo tecnico inicial:**

- integracao somente leitura;
- sandbox com dados ficticios, conta descartavel ou consentimento real limitado;
- importacao para staging, nunca direto para lancamento final;
- conciliacao com ledger, lancamentos manuais e importacoes CSV/OFX;
- preview de divergencias antes de alterar qualquer status;
- fallback manual quando Open Finance estiver indisponivel.

**O que nao fazer nesta fase:**

- nao usar uma conta Meu Pluggy de Daniel para autorizar contas da Thais;
- nao conectar bancos reais antes do ADR e do threat model;
- nao deixar Open Finance criar gasto/renda automaticamente;
- nao substituir importacao CSV/OFX ate a paridade ser comprovada;
- nao guardar credenciais bancarias; usar apenas consentimento/provedor autorizado;
- nao pagar plano comercial da Pluggy sem nova decisao explicita.

**Gate de saida:** ADR aprovado, prova de conceito somente leitura, modelo de
consentimento/revogacao definido, conciliacao em shadow sem duplicidade, custos
confirmados para uso familiar e rollback testado.

**Capacidade:** altissima para ADR, seguranca e escolha de provedor; alta para POC
isolada.

## 10. Testes transversais obrigatorios

- Transferencia entre contas mantem patrimonio total.
- Pagamento de fatura nao duplica consumo.
- Compra parcelada respeita evento, competencia e efetivacao.
- Reembolso reduz categoria e orcamento corretos.
- Pendencia muda caixa somente quando efetivada.
- Recorrencia editada nao duplica ocorrencias antigas.
- Importacao reconhece lancamento manual correspondente.
- Daniel e Thais enxergam o escopo familiar autorizado e o responsavel correto.
- Query Engine, SQL sandbox, dashboard e WhatsApp devolvem o mesmo numero.
- Pergunta, `FinancialQuerySpec`, ferramenta, resultado e resposta concordam em
  dominio, metrica, periodo, entidade e escopo.
- Fonte indisponivel, resultado vazio e zero real nunca sao tratados como o mesmo
  estado.
- Corpus real sanitizado cobre metas, orcamento familiar, datas relativas,
  follow-ups, comparacoes e perguntas fora das frases catalogadas.
- Avaliacao mede a trajetoria de ferramentas, nao apenas o texto final.
- Matriz do benchmark liga funcionalidade, pergunta, metrica, API, tela e teste.
- Gemini nunca calcula valor final nem grava campo critico sem gate.
- Restart, timeout e retry nao duplicam escrita.
- Backup restaura ledger, configuracao e projecoes.
- Calendar mostra compromissos/lembretes no dia correto em `America/Sao_Paulo`.
- Open Finance, quando existir, nunca substitui conciliacao e nunca grava sem
  staging/preview.
- Comprovante anexado nao vira transacao automaticamente sem confirmacao.

## 11. Horizonte de produto

### Versao familiar confiavel

O primeiro marco de produto deve ser:

- WhatsApp confiavel para lancar e perguntar;
- `expense.create` e `income.create` em enforce estaveis;
- agente read-only respondendo perguntas analiticas verificadas;
- calendario/resumos funcionando;
- dashboard atual sem inconsistencias graves;
- usuarios fora de Daniel/Thais tratados de forma reversivel e segura.

### Versao financeira completa

O segundo marco deve ser:

- ledger familiar canonico;
- contas/particoes;
- status pendente/concluido/cancelado/incerto;
- faturas e transferencias pareadas;
- orcamento por categoria;
- dashboard v2 com drill-down.

### Versao consolidada e patrimonial

O terceiro marco deve ser:

- planos projetados;
- comprovantes e manutencao em lote;
- investimentos/patrimonio;
- remocao gradual do legado.

### Versao bancaria opcional final

O quarto marco, apenas depois da consolidacao, deve ser:

- ADR e POC Meu Pluggy/Open Finance somente leitura;
- consentimentos separados de Daniel e Thais;
- conciliacao em staging antes de alterar qualquer status;
- producao somente se o custo familiar gratuito/baixo for confirmado;
- rollback e fallback manual testados.

## 12. Estrategia de release

Cada fase usa:

1. spec/ADR;
2. testes vermelhos;
3. implementacao pequena;
4. bateria offline;
5. shadow;
6. canario Daniel;
7. canario Thais;
8. auditoria altissima;
9. deploy com backup/rollback;
10. remocao do caminho antigo apenas depois da estabilidade.

Nao acumular todas as fases para um unico deploy.

## 13. Proximo passo imediato

Executar a Fase `8B.4 - cartoes e modulos em quarentena`:

1. Mapear abas logicas de cartao em runtime, templates, formulas, jobs,
   importacao, exportacao e recuperacao.
2. Instrumentar leitura/escrita sem persistir planilha, cartao ou valor.
3. Auditar imports dinamicos e scripts dos modulos em quarentena.
4. Classificar cada item como runtime, QA, operacao, recuperacao, manter,
   migrar, quarentena ou candidato futuro.
5. Iniciar a janela; nenhuma aba ou modulo sera removido nesta fatia.

Gate 8B.3:
`docs/qa/phase-8b3-financial-undo-product-decision-gate-2026-07-15.md`.
