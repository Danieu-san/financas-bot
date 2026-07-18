# Auditoria exaustiva dos caminhos financeiros e analíticos

Data da caracterização: 2026-07-18
Base congelada: `0737d7ccbdd309e4c39f503ca781e89d5aac7bc3`
Escopo: escritas financeiras, idempotência, importação, metas, dívidas,
exclusão, read-model, Query Engine, agente read-only, dashboard e projeção
canônica.
Restrições: nenhum código de produto, produção, Google real, WhatsApp real,
planilha real ou dado pessoal foi alterado ou acessado.

## 1. Veredito desta frente

- **Caracterização da superfície:** `GO COM RESSALVAS`. Os caminhos produtivos
  de escrita e consulta foram cruzados com callers, flags, persistências e
  testes. As ressalvas metodológicas do relatório central continuam valendo:
  alcance estático não equivale a cobertura comportamental e a cobertura do
  Node mede apenas arquivos carregados.
- **Conformidade da superfície:** `NO-GO`. Há caminhos analíticos que respondem
  perguntas com uma semântica diferente da solicitada, follow-ups que perdem
  período/base temporal e mutações compostas que ainda podem ficar parciais.
- **Alcance:** este veredito não autoriza correção, rollout, deploy ou produção.

## 2. Método e legenda de evidência

Foram lidos os caminhos alcançáveis a partir de `messageHandler`, serviços de
Google, Query Engine, agente financeiro, read-model SQLite, ledger de escrita,
planos projetados, importação, exclusão e projeção canônica.

Legenda:

- `R`: caminho executado localmente com doubles/fixture ou coberto pela bateria
  integrada;
- `D`: teste automatizado existente cobre a propriedade indicada;
- `I`: inferência estática reproduzível pelo código e callers;
- `GAP`: propriedade relevante sem prova dinâmica suficiente.

A bateria local deduplicada executou 92 roots, carregou 18 arquivos de teste
por agregação e produziu 1.112 execuções: 1.107 aprovadas, zero falhas e cinco
skips funcionais protegidos. Esses números são execuções, não casos únicos.

## 3. Mapa das escritas financeiras

| Caminho | Sinks | Idempotência/recuperação | Atualização de leitura | Evidência |
|---|---|---|---|---|
| Gasto/entrada unitários | append em `Saídas`/`Entradas` | chave explícita ou derivada de usuário, messageId, sequência e fingerprint; ledger `pending/committed/uncertain/failed`; reconciliação de append incerto | marca read-model dirty | R/D |
| Transferência/caixinha | append em `Transferências` | mesma proteção do append quando há contexto de mensagem | marca dirty | R/D |
| Cartão unitário/parcelado | um append por parcela | replay da mesma mensagem é deduplicado; não há transação englobando todas as parcelas | marca dirty somente ao fim | R/D/I |
| Lote comum e lote de cartão | vários appends sequenciais | proteção por item depende do mesmo messageId/ordem; não há recibo composto da intenção inteira | marca dirty ao final; falha intermediária pode impedir a marca | I |
| Importação de extrato | vários appends | chave estável por usuário, índice e fingerprint; itens já committed são reusados em retry | dirty por item; conciliação shadow após o loop | R/D/I |
| Movimento/status de meta | update de `Metas` + append em `Movimentações Metas` | executor composto restart-safe somente quando o rollout de planos projetados permite shadow writes; fallback faz dois sinks diretos | dirty no caller de sucesso | R/D/I |
| Pagamento de dívida | update de `Dívidas` | operation key explícita e revalidação da linha; histórico individual não existe na planilha real | dirty no caller principal | R/D |
| Pagamento de conta/fatura | append em `Saídas`/`Transferências` | operation key explícita | dirty no caller | R/D |
| Criação de meta/dívida | append único | chave automática pelo contexto da mensagem | não marca dirty no handler de criação | I |
| Exclusão | batch delete por aba, abas em sequência | sem retry cego; ledger por delete/aba; conjunto multiaba não é atômico | não marca dirty | R/D/I |
| Manutenção financeira em lote | updates sequenciais | preview + operation keys por linha e ledger próprio | não marca dirty | R/D/I |
| Undo | delete exato por recibo | serviço idempotente e auditado | serviço não possui caller produtivo | D/I |
| Projeção canônica | projeção após append committed | falha é apenas warning e não desfaz Sheets | updates/deletes não projetam equivalentemente | R/D/I |

## 4. Controles positivos confirmados nas escritas

1. `appendRowToSheet()` desliga retry cego por padrão, registra ledger quando
   há operation key e reconcilia resultado incerto somente quando encontra a
   linha/fingerprint esperada (`R/D`).
2. `updateRowInSheet()` revalida o conteúdo alvo antes de converter uma
   operação incerta em committed; conteúdo divergente bloqueia replay (`R/D`).
3. `deleteRowsByIndices()` ordena de baixo para cima, não faz retry remoto e
   bloqueia repetição incerta (`R/D`).
4. O ledger sanitiza identificadores, valores e mensagens em hashes (`D/I`).
5. A importação possui operation key por item e pode reaproveitar itens já
   committed após falha intermediária (`D/I`).
6. O caminho protegido de metas/dívidas possui recibo restart-safe e testes de
   falha entre sinks (`D`).

## 5. Achados de escrita

### FAP-WR-01 — HIGH — lote/cartão não possui commit lógico composto

Os loops de lote e parcelamento gravam linhas uma a uma. A proteção automática
usa o messageId da mensagem que está sendo processada e uma sequência mutável.
Ela evita duplicar a mesma entrega, mas não representa a intenção composta do
usuário. Se uma parcela/item intermediário falhar, parte do lote já existe. Uma
nova resposta do usuário tem outro messageId e pode gerar novas chaves para as
linhas já salvas. O estado só é apagado após o sucesso integral.

Impacto: lote parcial, nova tentativa com duplicação ou resposta final que não
corresponde a uma transação atômica.
Evidência: `messageHandler.js`, estados
`awaiting_batch_payment_method` e `awaiting_installments_batch`; geração de
chave em `google.js::resolveAppendOperationKey()` (`I`).
Correção futura: envelope/recibo composto por intenção, status por item e retry
somente dos itens ausentes.

### FAP-WR-02 — HIGH — atomicidade de meta depende de flag de rollout

Com projected-plan shadow write habilitado, update da meta e movimento usam
chaves-filhas e recibo composto. Sem a flag, o mesmo comando chama primeiro
`updateRowInSheet()` e depois `appendRowToSheet()`. Falha no segundo sink deixa
o saldo alterado sem histórico; não há compensação. O fallback também executa
sem a confirmação usada pelo caminho protegido.

Impacto: saldo/histórico divergentes e semântica diferente conforme flag.
Evidência: `goalService.js::applyGoalMovement()` e `updateGoalStatus()`, caller
`messageHandler.js::handleGoalManagementCommand()`; testes
`projectedPlanWrites.test.js` provam apenas o caminho protegido (`D/I`).

### FAP-WR-03 — HIGH — exclusão multiaba pode terminar parcialmente

`deletionHandler.confirmDeletion()` agrupa itens por aba e executa deletes em
sequência. Uma aba pode ser apagada e a seguinte falhar. O estado é limpo mesmo
quando algum resultado falha, e não existe transação/compensação do conjunto.

Impacto: exclusão parcial apresentada apenas como erro genérico; recuperação
manual exige nova busca e não há undo integrado.
Evidência: `deletionHandler.js:510-525` e ledger por operação de
`google.deleteRowsByIndices()` (`D/I`).

### FAP-WR-04 — HIGH — writers não invalidam uniformemente o read-model

Criação de meta/dívida, exclusão e manutenção financeira em lote escrevem na
planilha, mas não chamam `markFinancialReadModelDirty()`. As consultas e o
dashboard podem continuar servindo o snapshot anterior até outra sincronização.

Impacto: o bot confirma uma mutação e logo depois responde com dados antigos.
Evidência: callers de `appendRowToSheet`, `updateRowInSheet` e
`deleteRowsByIndices` nos handlers citados versus a lista de calls de
`markFinancialReadModelDirty()` concentrada em `messageHandler.js` (`I`).

### FAP-WR-05 — MEDIUM-HIGH — projeção canônica não acompanha update/delete

O hook canônico é chamado depois de append committed. Updates e deletes
invalidam cache Sheets, mas não projetam evento corretivo/tombstone equivalente
no ledger canônico. Quando canary reads forem habilitados, a visão canônica pode
manter meta, dívida ou lançamento já alterado/excluído.

Impacto: divergência entre Sheets, canário e futuras leituras canônicas.
Evidência: `google.js::projectCanonicalLedgerShadowAfterAppend()` existe apenas
no append; não há caller equivalente nos caminhos update/delete (`I`).

### FAP-WR-06 — MEDIUM — undo implementado, mas não alcançável no runtime

`FinancialUndoService` tem recibos, claim, replay e auditoria, com testes
verdes, mas nenhum módulo produtivo instancia ou chama o serviço. O usuário
continua dependente da exclusão por busca/índice.

Impacto: controle de recuperação existe só como capacidade isolada.
Evidência: busca tree-wide encontra callers apenas em testes (`D/I`).

### FAP-WR-07 — MEDIUM — mesma mutação possui rotas legada e protegida

Metas, dívidas, lote, cartão e comandos planejados ainda possuem variantes com
confirmação, operação composta e telemetria diferentes. O comportamento depende
do classificador e de flags, não apenas do contrato da mutação.

Impacto: propriedades de segurança demonstradas em uma rota não se transferem
automaticamente para a rota paralela.
Evidência: callers e branches por `shadowWritesAllowed`, estados legados e
Financial Command Planner (`I`).

## 6. Mapa do caminho analítico

Fluxo dominante:

```text
mensagem
→ planner local ou Gemini
→ normalizeFinancialQueryPlan
→ Scope Resolver
→ SQLite/read-model (preferido) ou Sheets escopado
→ executeFinancialQuery
→ composer determinístico ou agente read-only
→ resultVerifier
→ WhatsApp/dashboard
```

Controles positivos:

- IDs/tokens/campos internos são bloqueados pelo contrato do plano;
- escopo amplo/admin é bloqueado na Query Engine;
- escopo familiar/membro exige autorização externa ao LLM;
- SQL livre aceita somente `SELECT` em views públicas e escopadas;
- o planner Gemini recebe pergunta/data/catálogo, não linhas financeiras;
- o contextual analyst, quando habilitado, recebe itens sanitizados e limitados;
- cálculos principais permanecem na Query Engine/SQL, não no Gemini.

## 7. Achados analíticos

### FAP-AN-01 — HIGH — perguntas de dívida prometem fontes inexistentes

`total_pagamentos_dividas_mes` cria filtro `source=payments` e
`contagem_parcelas_dividas` cria `source=installments`, mas o executor de dívidas
não seleciona essas fontes. Ele usa as linhas atuais de `Dívidas`: soma saldo,
conta dívidas ou agrupa vencimentos. A própria engine registra que não há
histórico individual de pagamentos.

Impacto: resposta numericamente plausível, semanticamente errada, para
“quanto paguei” e “quantas parcelas faltam”.
Evidência: `financialQueryPlan.js:592-595`, executor de dívidas em
`financialQueryEngine.js`; testes atuais verificam o plano, não essa semântica
(`D/I`).

### FAP-AN-02 — HIGH — follow-up perde período e base temporal

O checkpoint analítico persiste mês/ano e poucos filtros públicos, mas não o
plano canônico completo. Um follow-up pode reconstruir outra base temporal e
alargar o intervalo. Exemplo reproduzível: pergunta de gastos “ontem” em
`transaction_date` seguida de “e no cartão?” pode virar o mês inteiro em
`billing_month`.

Impacto: conversa coerente na linguagem, mas consulta diferente da anterior.
Evidência: `messageHandler.js::sanitizeAnalyticalParametersForContext()` e
`deriveFollowUpAnalyticalQueryPlan()` (`I`).

### FAP-AN-03 — HIGH — SQLite pronto porém vazio/stale vira zero real

O contrato `FinancialQuerySpec` prevê `sourceHealth`, mas o caminho operacional
não exige esse campo para cada execução. Uma fonte inicializada sem linhas ou
desatualizada pode retornar `ok` e zero, em vez de “fonte indisponível”. O mesmo
zero pode alimentar cache e dashboard.

Impacto: ausência de evidência é apresentada como ausência de dinheiro/dados.
Evidência: contrato em `financialQuerySpec.js`, execução no read-model e
fallback de leitura que converte erro em `[]`; sobrepõe WGL-05 (`I`).

### FAP-AN-04 — HIGH quando resposta LLM está ativa — verifier prova presença, não significado

O verificador compara domínio/operação/base temporal da trajetória, mas não
confere integralmente período, filtros, agrupamento, ordenação e limite. Para
compare/trend, rótulos de período são dispensados; uma resposta pode citar um
número existente no toolResult em contexto errado e ainda passar.

Impacto: resposta conversacional verificada superficialmente, mas com relação
semântica incorreta entre número e afirmação.
Evidência: `agent/resultVerifier.js`, especialmente validação de trajetória e
branches compare/trend (`D/I`).

### FAP-AN-05 — HIGH — critério público do dashboard contradiz o cálculo de cartões

O resumo público declara cartões mensais por data da compra, enquanto partes
do KPI, categorias e caixa usam competência/mês de cobrança. O bloco v2 de
competência está correto, mas o resumo/caixa legado não segue uma única regra.

Impacto: WhatsApp e dashboard podem explicar bases diferentes para o mesmo
valor.
Evidência: `dashboardSummaryService`, `dashboardV2SummaryService` e critérios
adicionados ao snapshot (`I`).

### FAP-AN-06 — MEDIUM-HIGH — ranking por contagem é ordenado por valor

`groupRows()` ordena grupos pelo total monetário. Uma pergunta sobre cartão com
mais lançamentos/parcelas pode usar `operation=rank` e `sort.by=count`, mas o
agrupamento ignora essa chave na ordenação final.

Impacto: ranking válido em formato, errado no critério solicitado.
Evidência: `financialQueryEngine.js::groupRows()` e branch `group/rank` (`I`).

### FAP-AN-07 — MEDIUM-HIGH — plano valida forma, não coerência temporal

`normalizeFinancialQueryPlan()` normaliza shape/allowlists, porém aceita período
desconhecido, data impossível e intervalo invertido sem rejeição semântica
completa.

Impacto: planner inválido pode executar consulta vazia ou período diferente do
esperado em vez de pedir esclarecimento.
Evidência: `financialQueryPlan.js::normalizePeriod()` e validação final (`D/I`).

### FAP-AN-08 — MEDIUM — timezone não é uniforme

Alguns caminhos fixam `America/Sao_Paulo`; outros usam `new Date()`, getters e
timezone do processo. Limites de hoje/ontem, virada do mês e data de cobrança
podem divergir se o host não estiver no timezone esperado.

Impacto: erro de um dia em bordas de horário.
Evidência: comparação tree-wide de helpers/data atual e engine (`I`).

### FAP-AN-09 — MEDIUM — SQL seguro é mais amplo que o composer genérico

O sandbox SQL aceita consultas read-only seguras além de ranking por dia da
semana, mas o composer genérico só possui resposta rica para subconjuntos. Sem
o contextual analyst, alguns resultados válidos viram apenas contagem de linhas
ou resposta genérica.

Impacto: ferramenta calcula corretamente, mas a resposta perde significado.
Evidência: `safeReadonlySql.js` versus composer em `langGraphRuntime.mjs` (`I`).

## 8. Sobreposições com as outras frentes

- fallback de Sheets central, erro convertido em `[]`, dashboard com IDs e
  lifecycle Google pertencem primariamente a WGL;
- ordem de gates, estado desconhecido, áudio e handlers fora do catch pertencem
  primariamente a WCP;
- invalidação do read-model, rotas paralelas e resposta após escrita cruzam WCP
  e FAP;
- o relatório central deve contar cada causa raiz uma vez e manter referências
  cruzadas, sem somar severidades como se fossem falhas independentes.

## 9. Lacunas explícitas

1. Não houve falha real do Google no meio de lote/cartão; o risco é caracterizado
   por sequência de sinks e unit tests dos wrappers, não por serviço real.
2. Não houve comparação visual/real do dashboard; os critérios foram auditados
   por código e contratos locais.
3. Os cinco testes funcionais que podem resetar planilha permaneceram skip.
4. Cobertura de 88,42% é apenas dos arquivos carregados e não prova os módulos
   ausentes do denominador.
5. `covering_test_count` do inventário indica alcance por import, não asserção
   comportamental.

## 10. Ordem recomendada de correção desta frente

1. Corrigir semântica inexistente de pagamentos/parcelas de dívida e tornar
   fonte ausente explicitamente indisponível.
2. Preservar plano/período/base temporal completos em follow-ups seguros.
3. Tornar source health obrigatório no caminho operacional e no dashboard.
4. Fechar commit composto de lote/cartão/meta e exclusão.
5. Centralizar invalidação/sincronização após todo writer.
6. Fortalecer verifier com vínculo entre afirmação, campo e trajetória completa.
7. Alinhar uma única regra temporal de cartões no dashboard.
8. Integrar ou remover o undo isolado antes de anunciá-lo como capacidade.
