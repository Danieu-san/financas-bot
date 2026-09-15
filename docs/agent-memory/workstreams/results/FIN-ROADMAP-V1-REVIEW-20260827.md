# FinançasBot — Revisão adversarial roadmap draft v1 — 2026-08-27

## Escopo, base e método

Revisão defensiva, independente e somente de leitura do draft
`docs/plans/workstreams/financial-roadmap-draft-v1.md`, confrontado com os
roadmaps históricos, os checkpoints da Fase 8, o workstream ARQ, a auditoria
pré-roadmap e os arquivos de código exigidos pelo manifesto
`FIN-ROADMAP-V1-REVIEW-20260827`.

- task base declarada: `604662928f986c428ab6a0864bd5da56f0e94f76`;
- branch: `chat/chat-codex-orchestration-20260824`;
- a base declarada é ancestral do HEAD remoto usado na execução;
- nenhuma fonte externa, produção, WhatsApp, Pluggy real, planilha real,
  segredo ou dado privado foi acessado;
- nenhum teste foi executado, pois a tarefa é revisão estática/documental;
- contagens e estados históricos citados permanecem evidência documentada, não
  reexecução independente nesta tarefa.

O método foi tentar refutar, para cada fase, a ordem, as dependências, o risco,
os gates, testes, shadow/canário, rollback e a alegação de reutilização do que
já existe. As quatro classificações usadas são exatamente: **CONCORDO**,
**DISCORDO**, **FALTA EVIDÊNCIA** e **RISCO NÃO COBERTO**.

## Veredito executivo

O draft é uma boa consolidação e preserva corretamente Fases 1–9, Fase 7
deferred, Fase 8, Open Finance read-only e ARQ-01..06. Ele não propõe big bang,
não autoriza writer pelo LLM e não remove legado por busca estática.

Contudo, ainda não deve virar roadmap canônico sem ajustes obrigatórios:

1. ROAD-05 aparece tarde demais. Os contratos mínimos do Financial Truth Kernel
   precisam ser congelados logo após ROAD-00; caso contrário ROAD-01..04 podem
   criar uma segunda semântica temporária e depois ser retrabalhados.
2. ROAD-08 seguido de ROAD-09 cria uma dependência potencialmente circular:
   consumidores precisam migrar para permitir cutover, mas fallbacks de fonte
   só podem ser retirados depois do cutover e da janela de estabilidade. A
   execução deve ser intercalada por domínio/consumidor.
3. ROAD-01 descreve como migração geral algo que já está parcialmente entregue:
   o template atual já define Saídas A:K e Entradas A:J; o defeito confirmado é
   que leitores legados ainda pedem A:J/A:I. Primeiro deve vir registry + reparo
   dos consumidores, e migração física somente para planilhas comprovadamente
   antigas.
4. ROAD-02 trata `Mês de Cobrança` presente na linha como potencial evidência
   confirmada, mas o writer atual pode tê-lo projetado por `closingDay`. Sem
   provenance, presença não significa confirmação.
5. ROAD-06 sugere até aproximadamente quatro tools em análise ampla, embora o
   ARQ entregue esteja limitado a três. Isso é ampliação silenciosa de contrato
   e exige gate próprio; não pode entrar como default do roadmap.

**Veredito final: APROVÁVEL APÓS AJUSTES.**

## Matriz fase a fase

| Fase | Classificação | Fundamentação adversarial | Ajuste/gate exigido |
| --- | --- | --- | --- |
| ROAD-00 | **CONCORDO** | Baseline, Golden Set e mapa `capability -> consumer -> source -> fallback -> telemetry -> rollback` são a menor proteção contra repetir capacidades existentes ou aceitar falso zero. A exigência de revalidar heartbeat preserva a Fase 8. | Acrescentar uma matriz de autoridade por domínio e distinguir evidência estática, histórica, runtime atual e dado externo. O exit gate deve exigir cobertura de todos os consumidores mutáveis, não apenas os read-only. |
| ROAD-AUDIO-01 | **CONCORDO** | O código já possui rota `ptt/audio`, retry, reaquisição, conversão, transcrição e retorno a `msg.body`; portanto a fase corretamente busca regressão causal em vez de reimplementar áudio. | Separar erro de transcrição de “áudio incompreensível”: `transcribeAudio` hoje converte erro em `null`, apagando a causa. Exigir códigos sanitizados de roteamento, download, mídia, codec, conversão, API, resposta vazia e retomada. Teste unitário não substitui E2E real marker-only. |
| ROAD-01 | **DISCORDO** | A direção de schema/card identity é correta, mas a execução proposta começa como migração ampla. O template já usa Saídas A:K, Entradas A:J e `card_id`; o drift confirmado está em consumidores antigos e nas fórmulas por nome. Migrar antes de inventariar versões pode alterar planilhas corretas. | Ordem obrigatória: schema registry e detector de versão -> inventário de readers/writers -> compat reader dual -> reparo de consumidores -> dry-run de migração -> migração idempotente apenas onde houver drift comprovado. Definir compatibilidade da nova subcategoria antes de adicionar coluna. |
| ROAD-02 | **RISCO NÃO COBERTO** | A fase reutiliza 3B/3E corretamente e identifica `timeBasis`, mas a precedência de evidência pode promover projeção antiga a fato. `saveCreditCardExpense` materializa parcelas com a mesma data de compra e calcula competência por `> closingDay`; a linha resultante não carrega provenance. `billForecastDate` também não é necessariamente fatura confirmada. | Definir estados e provenance antes do resolver: `statement_confirmed`, `provider_forecast`, `sheet_projected`, `closing_day_estimate`. Nunca considerar `Mês de Cobrança` confirmado só por existir. Separar identidade da compra, ocorrência confirmada e projeção; garantir que rollback window do resolver não seja confundida com a janela de remoção de legado da Fase 8. |
| ROAD-03 | **DISCORDO** | Saldo cumulativo, budget e compensações precisam de correção, mas a dependência integral de ROAD-02 serializa trabalho independente. O saldo atual realmente recebe apenas movimentos já filtrados para o mês; `budget.sum` realmente devolve `dailyGoal.spent`. | Dividir em ROAD-03A (saldo as-of, budget e transferências neutras, após ROAD-01) e ROAD-03B (eventos de cartão/refund/fatura, após a semântica relevante de ROAD-02). Exigir cobertura desde `openedOn`, estado de completude e vínculo separado de `payment_reversal` com pagamento de fatura. |
| ROAD-04 | **RISCO NÃO COBERTO** | Menu 1–4 e onboarding explícito são seguros, mas quatro problemas distintos estão agrupados: adapters, UX de writer, catálogo de cartões e descoberta Pluggy. Isso aumenta blast radius e torna rollback ambíguo. O vínculo Atacadão real continua não provado sem dado externo. | Separar 04A adapter personal_sheet, 04B menu numérico e 04C onboarding read-only de cartão. Cada um com flag/gate próprio. Atacadão deve permanecer `FALTA EVIDÊNCIA EXTERNA` até mapeamento autorizado; ausência não vira “não cadastrado”. |
| ROAD-05 | **DISCORDO** | Um kernel determinístico único é necessário, mas construí-lo depois de ROAD-01..04 repete o erro que pretende corrigir. Além disso, Fase 3F.1 e ARQ-01..06 já entregaram `FinancialQuerySpec`, fachada, tools e verificador; “implementar kernel” pode reconstruir essa base. | Mover um **ROAD-K0 — contrato de convergência semântica** para logo após ROAD-00. Ele congela IR existente, source policy, timeBasis, evidence states e regra de dupla contagem. ROAD-01..04 implementam adapters/fixes nesse contrato. ROAD-05 posterior vira apenas gate de convergência/paridade, não nova arquitetura. |
| ROAD-06 | **DISCORDO** | Reusar ARQ-03/05/06 e manter writer separado está correto. Porém ampliar de limite absoluto de três tools para “até ~4” é mudança causal sem evidência. O limiar `>=95% não adversarial` também é insuficiente se diluir casos críticos. | Preservar máximo atual de três tools. Uma quarta exige gate separado com ganho medido. Exigir 100% nos casos críticos de escopo, money, unavailable/zero, timeBasis e writer; `>=95%` vale apenas para o agregado cego não crítico. Manter canário por domínio/fonte e baseline intacto. |
| ROAD-07 | **RISCO NÃO COBERTO** | Preview, confirmação, idempotência, recibo e reconciliação estão corretos, e writer continua fora do ARQ read-only. Mas “writers confiáveis” é amplo demais e não reconcilia explicitamente os gates já existentes de proposta Open Finance/escrita gradual. | Fatiar por comando/classe (`expense.create`, `income.create`, transfer, refund, card, Open Finance proposal), cada um com próprio candidato, corpus, canário, receipt e rollback. Inventariar entregas atuais antes de construir; não considerar Interpretation Reliability shadow como autorização de promoção. |
| ROAD-08 | **FALTA EVIDÊNCIA** | O desenho preserva heartbeat, rotação, janelas e rollback, e não reinicia observação. Porém o último checkpoint exigido é de 2026-07-30: cartões ainda tinham uso forte, dashboard v1 tinha uso, e `legacy_auth_utility` aguardava auditoria. Não há evidência sanitizada atual nesta tarefa de continuidade da instrumentação até 2026-08-27. | Revalidar saúde, retenção, arquivos rotacionados e cobertura de cada ponto de entrada antes de usar a janela histórica. Carregar explicitamente o candidato `legacy_auth_utility`; não declarar cartões/dashboard candidatos. Ausência de telemetria atual é `FALTA EVIDÊNCIA`, nunca zero. |
| ROAD-09 | **DISCORDO** | Cutover por domínio, backup/restore e Sheets como espelho são corretos, mas `dependencies: ROAD-01–08` após uma ROAD-08 global cria ciclo: remover legado depende do cutover, e o cutover depende de “retirada” concluída. | Intercalar por domínio: migrar consumidor em 8B -> canário/paridade -> cutover de fonte do domínio em 9 -> janela de estabilidade -> remover somente o fallback morto em 8C. ROAD-08 não deve ser gate global concluído antes de ROAD-09. |
| ROAD-10 | **CONCORDO** | Hardening final, ADR-002, privacy, marker-only, rollback e auditoria independente são necessários. A fase não substitui auditorias por correção. | Declarar que a suíte ampla final é executada uma vez por candidato estável e que cada mudança material anterior já precisa de auditoria própria. Incluir inventário de flags finais e prova de que shadows/canários deixados `off` não são descritos como ativos. |

## Achados adicionais

### P0 — ordem do kernel induz retrabalho e source-of-truth concorrente

ROAD-01..04 pretendem corrigir schema, cartão, tempo, saldo, budget e adapters
antes de ROAD-05 definir a semântica única. Isso permite que cada fase crie
contratos locais diferentes. A solução não é antecipar uma grande
reimplementação: é extrair de ROAD-05 um contrato mínimo ROAD-K0 baseado no
`FinancialQuerySpec`, semantic facade e adequacy verifier já entregues.

### P0 — ciclo ROAD-08/ROAD-09

A remoção de consumidores e fallbacks de fonte não pode ser uma fase global
anterior ao cutover. A Fase 8 histórica já separa migração de consumidor,
soft-disable, 8C e 8D. O draft deve conservar essa granularidade: migração e
cutover avançam por domínio; remoção física vem depois da estabilidade.

### P0 — linha de competência sem provenance

`Lançamentos Cartão` contém `Mês de Cobrança`, mas o writer atual o calcula por
`closingDay`. A mesma coluna pode misturar competência observada e projetada.
Qualquer resolver que prefira a linha antes de introduzir provenance pode
congelar um erro antigo como verdade canônica.

### P0 — ledger cumulativo precisa de cobertura, não apenas soma

Somar desde `Saldo Inicial` não é suficiente se o histórico começa depois da
abertura, se a conta foi criada posteriormente ou se há intervalo sem fonte.
O contrato deve carregar `as_of`, `coverage_start`, `coverage_end`, provenance e
completude. Se a cobertura for parcial, a resposta não pode ser “saldo atual”.

### P1 — áudio perde a classe causal de falha

`transcribeAudio` captura timeout/quota/HTTP e retorna `null`; `handleAudio`
então responde como se o áudio apenas não tivesse sido entendido. Isso não
prova que o relato real esteja nessa etapa, mas mostra que a telemetria atual é
insuficiente para localizar a causa sem códigos por fronteira.

### P1 — `financialPersonalSheetSemanticAdapters` não executa `timeBasis`

O adapter preserva `timeBasis` somente em `details`. O snapshot já foi filtrado
antes, e `budget.sum` usa gasto diário. ROAD-04 não pode validar paridade até
ROAD-K0/ROAD-02/03 fornecerem execução causal do período e da base temporal.

### P1 — importação, Open Finance e writer precisam do mesmo evento canônico

O importador tem categorização e heurísticas próprias; o reconciliador Open
Finance já falha fechado para parcelamento e conta ambígua; o writer de cartão
materializa parcelas diretamente. Corrigir cada um isoladamente antes de
definir o envelope canônico recria source-of-truth concorrente.

### P1 — aceitação do ARQ não pode diluir invariantes críticos

Um percentual global de 95% pode aprovar um conjunto com falha rara de escopo,
falso zero ou writer. A matriz precisa ter duas camadas: críticos 100%; qualidade
semântica não crítica >=95% e superior ao baseline.

### P2 — menu numérico é independente

O menu 1–4 é uma melhoria delimitada de normalização/UX. Ele não precisa esperar
saldo, parcelamentos e onboarding Pluggy. Pode entrar cedo após o schema mínimo,
com controle textual retrocompatível e sem ampliar o escopo de ROAD-04.

## Dependências, gates e risco reclassificados

1. `ROAD-K0` deve ser P0 e preceder ROAD-01..04.
2. ROAD-01 deve separar P0 (`card_id`/schema contract) de P1 (migração de ranges,
   subcategoria e dados legados).
3. ROAD-02 permanece P0, mas `closingDay`/calendário isoladamente é P1; o P0 é
   a contaminação de realizado/projetado e identidade/competência.
4. ROAD-03A saldo/budget é P0 e pode rodar em paralelo ao cartão; compensações
   semânticas ficam P1/P0 conforme risco de dupla contagem.
5. ROAD-04B menu é P2; 04A adapter e 04C onboarding são P1.
6. ROAD-06 é P1 enquanto read-only; qualquer writer ou ampliação de tool budget
   sobe para gate próprio P0.
7. ROAD-07 e ROAD-09 permanecem P0.
8. ROAD-08 é P0 de regressão, mas cada candidato precisa de sua própria
   classificação e evidência atual.

## Mudanças obrigatórias

1. Extrair ROAD-K0 de ROAD-05 e colocá-lo imediatamente após ROAD-00.
2. Reescrever ROAD-01 como reparo consumer-first e migração somente após
   detecção de versão/drift.
3. Introduzir provenance para competência/fatura/parcela antes de confiar em
   `Mês de Cobrança` ou metadado forecast.
4. Dividir ROAD-03 em saldo/budget e eventos/compensações.
5. Dividir ROAD-04 em adapter, menu e onboarding Pluggy.
6. Preservar limite máximo de três tools no ARQ; quarta tool somente em novo
   gate.
7. Tornar invariantes críticos 100%, sem diluí-los no limiar de 95%.
8. Fatiar writers por operação/classe e reconciliar explicitamente entregas
   anteriores antes de implementar.
9. Revalidar a saúde atual da telemetria da Fase 8 e carregar o estado do
   candidato `legacy_auth_utility`.
10. Intercalar ROAD-08 e ROAD-09 por domínio, eliminando a dependência circular.

## Mudanças opcionais

1. Renomear ROAD-05 para “Gate de convergência do Financial Truth Kernel” para
   deixar claro que não é um kernel greenfield.
2. Transformar ROAD-AUDIO-01 em trilha paralela visual no roadmap.
3. Publicar um diagrama de estados de evidência
   `confirmed/committed/projected/estimated/incomplete/unavailable`.
4. Usar a mesma fixture de cartão para Faturas, Parcelamentos, dashboard,
   personal_sheet, importação e Open Finance.
5. Criar um quadro por domínio com `consumer migration`, `source cutover`,
   `stability window` e `legacy removal`, evitando status global enganoso.

## Ordem recomendada revisada

```text
ROAD-00  baseline, Golden Set e inventário
   |
ROAD-K0  contrato mínimo de convergência semântica já baseado em 3F.1/ARQ
   |
ROAD-01  schema/identidade consumer-first
   |
   +--> ROAD-02  cartão/fatura/parcela/tempo
   |       |
   |       +--> ROAD-03B eventos de cartão, refund e fatura
   |
   +--> ROAD-03A saldo as-of, budget e transferências
   |
   +--> ROAD-AUDIO-01 em paralelo após baseline mínimo
           |
ROAD-04A personal_sheet adapter
ROAD-04B menu numérico (pode ser antecipado após ROAD-01)
ROAD-04C onboarding Pluggy/Atacadão read-only
   |
ROAD-05  gate de convergência/paridade, não nova arquitetura
   |
ROAD-06  ARQ read-only, máximo três tools, canário por domínio
   |
ROAD-07  writers fatiados por comando/classe
   |
PARA CADA DOMÍNIO:
  8B migrar consumidor -> canário/paridade
  9  cutover da fonte -> janela de estabilidade/rollback
  8C remover somente fallback/código realmente morto
   |
ROAD-10 hardening final e gate de produto
```

Essa ordem é menor porque evita construir semântica local em ROAD-01..04 para
depois refazê-la em ROAD-05. Também preserva a Fase 8 sem bloquear o cutover em
um ciclo artificial.

## Seções específicas exigidas

### Áudio

Tratar como regressão causal é correto. Não presumir download, ffmpeg ou Gemini.
O gate precisa preservar códigos por fronteira e provar o caminho real
`ptt/audio -> handleAudio -> msg.body -> pipeline`. Testes locais atuais não
provam funcionamento no runtime.

### Parcelamentos e fechamento

Reutilizar 3B/3E é obrigatório. A primeira correção deve ser provenance e
separação `compra/evento -> ocorrência confirmada -> projeção`, antes da fórmula
de fechamento. Alterar `>` para `>=` isoladamente seria incorreto. Saldo
restante só pode ser exibido como fato quando a fonte o demonstrar; caso
contrário é projeção rotulada.

### Atacadão e Pluggy

O contrato Pluggy aceita contas `CREDIT` dinamicamente, mas isso não cria opção
de escrita. O catálogo `Cartões` continua sendo o gate. O caso Atacadão exige
mapeamento autorizado externo e onboarding explícito; sem isso o estado é
`FALTA EVIDÊNCIA`, não ausente nem pronto.

### Retirada do legado

Heartbeat, rotação, backups, janela, paridade e rollback continuam obrigatórios.
As janelas históricas não devem reiniciar sem causa, mas também não podem ser
consideradas contínuas sem provar saúde atual. Cartões/dashboard não são
candidatos com a evidência requerida; `legacy_auth_utility` precisa manter seu
estado individual.

### Writer versus ARQ read-only

ARQ-01..06 permanece estritamente read-only. ROAD-06 não autoriza writer.
ROAD-07 precisa reutilizar Interpretation Reliability e commands existentes,
mas promoção ocorre por operação, com preview/confirm/idempotency/receipt e
auditoria própria. Nenhum rollout de leitura concede autoridade de escrita.

## Lacunas de evidência que permanecem

- estado runtime atual das flags e telemetrias da Fase 8 em 2026-08-27;
- vínculo real Atacadão Pluggy -> alias -> `card_id` -> configuração de
  fechamento/vencimento;
- fronteira causal da falha real de áudio;
- quais planilhas pessoais ainda possuem headers realmente antigos;
- provenance histórico de `Mês de Cobrança` nas linhas existentes;
- cobertura cumulativa suficiente para saldo as-of por conta;
- estado atual dos gates de writer/proposta Open Finance posteriores aos
  documentos históricos exigidos pelo manifesto.

Essas lacunas não impedem a reconciliação documental do draft, mas impedem que
as fases correspondentes recebam GO operacional ou sejam descritas como já
prontas.

## Veredito final

**APROVÁVEL APÓS AJUSTES.**

O Chat pode reconciliar este parecer em um `roadmap-draft-v2`, desde que aplique
as dez mudanças obrigatórias acima. O usuário ainda precisa confirmar o roadmap
final. Este relatório não autoriza implementação, deploy, promoção de flag,
escrita financeira, acesso externo ou retirada de legado.
