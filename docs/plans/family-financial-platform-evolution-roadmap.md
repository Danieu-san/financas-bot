# Plano mestre: evolucao do FinancasBot familiar

Data: 2026-06-20
Status: Fase 1 concluida; Fase 2 em shadow com gate corretivo 2A iniciado em 2026-06-25

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
- Nao trocar Gemini, LangGraph, Query Engine ou provedor de WhatsApp nesta rodada.
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
          +------------+-------------+
          |                          |
  Interpretation Reliability    LangGraph Agent
  (writes/commands)              (read-only)
          |                          |
  Idempotent Write Executor      Safe tools/verifier
          |                          |
          +------- Domain Services --+
                       |
             Canonical Family Ledger
                    SQLite
                       |
          +------------+-------------+
          |            |             |
       Read model   Dashboard      Sheets mirror
       / Queries    snapshots      / export
```

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

Iniciar a Fase 2 com TDD em um corte pequeno:

1. Definir o contrato de recibo verificado para gasto/entrada unitarios.
2. Projetar o recibo no ledger shadow depois do commit legado, sem afetar a
   resposta nem transformar falha shadow em falha do lancamento.
3. Preservar idempotencia pela chave original do executor.
4. Emitir paridade sanitizada para `transactions`.
5. Manter todas as flags canonicas desligadas por padrao e nao ativar producao
   antes de novo gate altissima.
6. Manter o Gemini Planner ativo no baseline read-only, sem acesso a escrita ou
   calculo final.
7. Manter `INTERPRETATION_RELIABILITY_MODE=shadow`, Family Mode desligado e o
   pacote orcamento/categorias fora do baseline ate seus gates proprios.
