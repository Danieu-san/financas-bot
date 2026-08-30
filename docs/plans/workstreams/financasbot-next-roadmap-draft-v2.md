# Roadmap do novo FinançasBot — draft v2

Data: 2026-08-30
Status: `DRAFT_V2_AWAITING_FOCAL_REVIEW_AND_USER_CONFIRMATION`
Base revisada: commit `570ec0878ebbaf479b9aef23320e9e37a5b62d67`
Produto temporário: `FinançasBot Next`

## 1. Decisão proposta

Construir o FinançasBot Next em paralelo ao produto atual. O legado permanece
operacional e reversível até o cutover comprovado. O Next preserva capacidades
úteis, mas não transporta a arquitetura de cérebros, semânticas e fallbacks
concorrentes.

O produto alvo combina:

1. uma única IA conversacional para linguagem, investigação e follow-up;
2. tools tipadas e combináveis;
3. um kernel financeiro determinístico;
4. writers separados por operação;
5. ledger/event store canônico do Next;
6. ingestão Open Finance proativa;
7. memória conversacional versionada;
8. dashboard v2 preservado como experiência, usando a mesma verdade do
   WhatsApp;
9. migração e cutover por capacidade, com exclusividade de writer/notifier.

Este documento não autoriza código, produção, credenciais, dados privados,
escrita financeira, deploy ou retirada do legado.

## 2. Fronteiras de autoridade

### 2.1 IA

A IA pode interpretar, decompor perguntas, selecionar tools, combinar leituras,
pedir esclarecimento e redigir respostas. Ela não pode:

- resolver identidades internas ou permissões;
- calcular valores, diferenças, percentuais, rankings ou projeções finais;
- declarar zero diante de evidência ausente ou incompleta;
- promover projeção a realizado;
- escolher a autoridade entre fontes;
- confirmar ou executar escrita;
- transformar regra aprendida em permissão ou efeito financeiro.

### 2.2 Kernel

O kernel é a autoridade para identidade, semântica, métricas, cálculos,
reconciliação e claims quantitativos. Tools de produto são fachadas sobre
primitivas e métricas registradas no kernel; não implementam agregações próprias.

### 2.3 Writers

Toda operação segue:

`prepare -> preview -> confirm(proposal_id) -> commit -> receipt -> reconcile`

Não existe writer financeiro genérico. Cada operação possui gate, idempotência,
state machine e rollback próprios.

## 3. Modelo canônico de dados

O fluxo obrigatório é:

```text
SourceObservation imutável
          |
          v
CanonicalFinancialEvent versionado
          |
          v
Projection / Read Model / Sheets compatível
```

### 3.1 SourceObservation

Representa algo observado em Pluggy, Sheets legado, importação ou writer.
Campos mínimos:

- `observation_id`;
- `source_type`, `source_instance_id`, `source_record_id`;
- `source_version` ou fingerprint;
- `observed_at`, `effective_at` e coverage;
- payload normalizado estritamente necessário;
- provenance e evidence state;
- `origin_runtime`, `origin_operation_id`, quando gerado pelo sistema;
- integridade e deduplication key.

Observação é append-only. Mudança do provedor cria nova versão ligada à anterior.

### 3.2 CanonicalFinancialEvent

Campos mínimos:

- `event_id`, `event_version`, `event_kind`;
- `family_id`, `person_id`, `account_id` e/ou `card_id` resolvidos server-side;
- valor em centavos e moeda;
- `transaction_date`, `billing_period`, `due_date`, `settlement_date`, `as_of`
  quando aplicáveis;
- `evidence_state` e provenance por campo;
- links `originates_from`, `compensates`, `settles`, `installment_of`,
  `reserve_transfer_of`, `supersedes`, `reverses`;
- status, cobertura e completude;
- idempotency key e receipt da operação que o criou.

Tipos iniciais incluem compra, entrada, transferência, parcela, pagamento de
fatura, estorno, reversão, saldo anterior, tarifa/juros, aplicação e resgate.

### 3.3 Projection e prevenção de realimentação

Sheets, dashboard e read models são projeções. Uma projeção gravada pelo Next
carrega `origin_operation_id` e nunca pode reentrar como nova observação.

Durante a transição:

- registros legados sem identidade de origem podem ser observações, após
  fingerprint e reconciliação;
- registros escritos pelo Next são reconhecidos por receipt/origin;
- output do sistema não retorna como novo input;
- totais iguais não bastam: migração compara contagem, fingerprint por evento,
  dimensões e vínculos de compensação.

### 3.4 Autoridade decidida

O ledger do Next é a única autoridade semântica do novo produto a partir de
NEXT-02. Pluggy, Sheets e importações fornecem observações. Sheets pode continuar
como projeção e interface compatível; não redefine o significado financeiro.

A política de fonte por domínio decide quais observações podem criar ou atualizar
eventos. Essa política é versionada e testada. A promoção de mirror para
autoridade operacional ocorre por capacidade, nunca globalmente.

## 4. Contratos obrigatórios de NEXT-00

NEXT-00 deve congelar oito contratos antes de qualquer implementação funcional.

### 4.1 Data Authority Contract

- schema v0 de observações e eventos;
- tipos e vínculos financeiros;
- source precedence por domínio;
- identidade e versionamento;
- projeção não reingerível;
- regras de realized/committed/projected/estimated/unavailable;
- zero/vazio/incompleto/indisponível;
- double-count invariants.

### 4.2 Coexistence and Single-Writer Contract

Para cada `{family_id, capability}` exatamente um runtime possui autoridade para:

- escrita;
- notificação;
- scheduler;
- cursor proativo.

A transferência usa lease versionado, fencing token e epoch. Shadow é
estritamente read-only. Escritas com epoch antigo falham fechado. A mesma regra
abrange Calendar, lembretes e Open Finance.

### 4.3 Conversation and Proposal Contract

Toda sessão possui versão monotônica. Cada `prepare` cria `proposal_id` e hash
imutáveis ligados a usuário, família, operação, payload, versão das observações,
turno e TTL.

O commit usa compare-and-swap e rejeita proposta:

- expirada;
- superseded;
- confirmada anteriormente;
- de outra sessão/família;
- cuja observação material mudou;
- cujo preview não corresponde ao hash confirmado.

### 4.4 Model Data Boundary Contract

Define:

- campos que podem chegar ao modelo;
- minimização por tool;
- proibição de secrets, tokens e payload bancário bruto;
- retenção, treinamento e região aceitáveis;
- segregação dev/test/prod;
- providers/modelos autorizados;
- redaction e auditoria;
- política para troca de provider.

### 4.5 Integration Capability Manifest

Cada adapter declara:

- operações read/write;
- famílias de dados permitidas;
- scopes OAuth e secrets autorizados;
- endpoints/egress e webhooks;
- rate limit e timeout;
- se pode ser fonte observacional;
- se pode receber projeção;
- efeitos externos e rollback;
- testes negativos de escopo.

Estado inicial de toda integração: read-only e sem autoridade financeira.
Promoção exige revisão humana e gate próprio.

### 4.6 Capability and Cutover Matrix

Cada capacidade recebe uma classe:

1. necessária para beta;
2. necessária para cutover do WhatsApp principal;
3. necessária antes de aposentar o legado;
4. pós-MVP.

Capacidade atualmente usada no legado não pode desaparecer no cutover sem
aceitação explícita de Daniel. NEXT-08 deixa de ser marco monolítico.

### 4.7 Tool Budget and Failure Policy

Default inicial para avaliação:

- soft budget: 6 chamadas;
- hard budget: 12 chamadas;
- no máximo 2 repetições do mesmo tool+argument fingerprint;
- timeout total de 30 segundos em avaliação local;
- custo e latência registrados por turno de forma sanitizada.

Os números são configuração versionada, calibrada pelo Golden Set. Não são
limite semântico do produto.

Ao atingir limite, faltar evidência ou falhar invariantes, o sistema responde
com insuficiência explícita ou pede a informação indispensável. Não usa palpite
nem fallback silencioso.

Falha apenas de redação permite uma única recomposição com a mesma evidência.
Falha factual, de escopo, coverage ou cálculo bloqueia a resposta candidata.

### 4.8 Quality, Stability and Retention Contract

Define antes dos testes:

- métricas e limiares de beta/cutover;
- duração da janela de estabilidade;
- taxa permitida de divergência factual e duplicidade;
- latência e custo máximos;
- RTO/procedimento de rollback;
- sanitização e cobertura mínima do Golden Set;
- logical delete, tombstone, hard delete, retenção e restore.

O GO de NEXT-00 proíbe placeholders `TBD`: duração, percentuais, limites de
latência/custo, RTO e critérios de rollback precisam possuir valores numéricos
versionados antes de qualquer teste usado como evidência de beta ou cutover.

Evento reconciliado ou com efeito externo usa tombstone/reversal, não hard
delete. Hard delete fica limitado a draft não confirmado ou obrigação legal
explicitamente governada. Restore nunca ressuscita tombstone.

## 5. Arquitetura alvo

```text
WhatsApp / canal futuro
        |
Conversation Gateway
  identity + session version + delivery
        |
Single Conversational Agent
        |
Tool Gateway ---------------- Write Proposal Gateway
        |                            |
Financial Truth Kernel        Deterministic Writers
        |                            |
Canonical Ledger <------------ receipt/reconcile
        |
Source/Projection Adapters
  Pluggy | Sheets | Dashboard v2 | Calendar | outros
```

Não haverá múltiplos planners/agentes tomando decisões sobre a mesma mensagem.
Eventual roteamento entre modelos continua sendo um único agente lógico, com
trace único, configuração explícita e o mesmo Golden Set. O primeiro MVP usa um
único modelo para facilitar medição.

## 6. Claims quantitativos e verificador

Tools/kernel produzem totais, diferenças, razões, rankings, comparações e
projeções. A IA somente seleciona e explica claims já materializados.

Cada claim possui:

- `claim_id`;
- operação/métrica;
- valor e unidade;
- entidades e período;
- time basis;
- coverage/completude;
- IDs de evidência;
- provenance/evidence state.

O verificador valida `claim -> valor -> entidade -> período -> unidade ->
cobertura`. “O número aparece em algum resultado” não é suficiente.

Em falha:

1. resposta não é entregue;
2. somente falha de forma pode tentar uma recomposição;
3. falha factual/escopo/cobertura gera resposta explícita de insuficiência;
4. nenhuma cadeia alternativa silenciosa é acionada.

## 7. Catálogo inicial de tools

### 7.1 Read

- `transactions.search`
- `transactions.summarize`
- `balances.get_as_of`
- `accounts.list`
- `cards.list`
- `card_statement.get`
- `installments.get_schedule`
- `budgets.get_cycle`
- `category_limits.get_status`
- `recurring.list`
- `income.summarize`
- `debts.get_status`
- `goals.get_status`
- `bills.list_due`
- `reminders.list`
- `merchant_rules.lookup`
- `forecasts.run`
- `calendar.events.list`
- `open_finance.unregistered_events`
- `financial_sources.get_coverage`

Todas são fachadas do kernel e registry de métricas.

### 7.2 Write protocols

- expense/income/transfer/card expense;
- refund/adjustment;
- recurring rule;
- transaction update/delete/undo;
- merchant rule;
- reminder create/update/delete/complete/snooze;
- Calendar create/update/delete;
- Open Finance proposal/commit.

Calendar exige ETag/precondition, timezone, escolha explícita para ocorrência ou
série recorrente e receipt externo. Lembretes usam delivery ledger para impedir
notificação duplicada.

## 8. Regras aprendidas e ambiguidades

Regras são dados versionados, explicáveis, desativáveis e escopados como pessoal
ou familiar. Regra familiar exige permissão específica; acesso familiar de
leitura não concede permissão para criá-la.

Automação inicial é whitelist fechada de classificação e metadado reversível.
Regra aprendida nunca pode:

- conceder autorização;
- resolver identidade interna;
- mudar valor, data ou fonte;
- promover evidence state;
- confirmar writer;
- dispensar preview/confirm;
- executar efeito externo.

A interface de ambiguidades mostra evidência suficiente e permite aplicar uma
decisão a ocorrências equivalentes somente quando Daniel solicitar e o matcher
for exibido no preview.

## 9. Capacidades preservadas

O produto alvo mantém:

- gastos por categoria/subcategoria e limites por categoria;
- dashboard v2 como experiência visual;
- Google Calendar;
- contas a pagar, lembretes e vencimentos;
- alertas de fatura;
- edição, exclusão e undo;
- compartilhamento familiar autorizado;
- classificação aprendida e regras pessoais;
- projeções e comparação de cenários;
- ambiguidades;
- exportação, backup e restore;
- criação/manutenção controlada da Planilha;
- importação CSV/OFX;
- áudio e comprovantes;
- saúde financeira, dívidas e metas;
- salvamento proativo Open Finance;
- adapters futuros além de Google, Pluggy e WhatsApp.

### 9.1 Dashboard v2

O dashboard v2 não é descartado. Seu contrato visual e funcionalidades úteis são
preservados, mas cálculos independentes não são portados.

Dashboard e WhatsApp consultam o mesmo Tool Gateway, kernel, ledger, scope,
time basis e source policy. Paridade é testada por claim/fingerprint. O dashboard
atual permanece durante shadow e só muda de fonte por gate reversível.

### 9.2 Gasto por categoria

É capacidade central de NEXT-02. Deve permitir pessoa/família, conta/cartão,
categoria/subcategoria, período/time basis, realizado versus projetado e
exclusão de eventos neutros. A mesma métrica alimenta WhatsApp, dashboard e
limites por categoria.

## 10. Salvamento proativo

Fluxo:

1. buscar observações desde cursor durável cercado por epoch;
2. versionar e normalizar;
3. reconciliar com ledger/projeções;
4. classificar tipo financeiro deterministicamente;
5. agrupar somente itens elegíveis;
6. numerar propostas;
7. resolver ambiguidades materiais antes do writer;
8. preparar preview com fingerprint da observação;
9. confirmar `proposal_id` específico;
10. revalidar versão no commit;
11. gravar, emitir receipt e reconciliar;
12. não reenviar item visto/rejeitado/expirado/registrado sem mudança material.

Mudança material inclui valor, moeda, identidade de conta/cartão, tipo do evento,
status de liquidação, data financeira relevante ou vínculo de compensação. Ela
invalida a proposta antiga.

Concorrência manual versus proativa é teste obrigatório: somente uma operação
pode reivindicar a mesma identidade econômica.

Compra em fatura aberta não é “pendente” apenas por a fatura estar aberta.

## 11. Três baterias independentes

### 11.1 Conversational Replay

Perguntas simples/complexas, múltiplas tools, follow-up, pessoa/família,
categoria, dashboard parity, insuficiência e áudio.

### 11.2 Kernel Properties

Identidade, schema de evento, source precedence, claims, double-count,
zero/vazio/incomplete/unavailable, time basis, projections e migração por
fingerprint/dimensões.

### 11.3 State Machine and Fault Injection

Proposal CAS/TTL, restart, retries, concorrência, falha externa, receipt,
reconcile, single-writer fencing, scheduler, Calendar, notificações e Open
Finance.

Diálogo verde não prova exactly-once.

O Golden Set v1 é um artefato versionado e sanitizado, construído em NEXT-00.
Seu piso inicial é de 48 conversas:

- 16 perguntas simples;
- 16 investigações com múltiplas tools;
- 8 follow-ups que preservam ou alteram uma dimensão;
- 8 casos negativos de indisponibilidade, incompletude, ambiguidade ou escopo.

Cada dimensão crítica — pessoa/família, conta/cartão, categoria, período,
time basis, transferência, pagamento de fatura, estorno, projeção e zero/vazio/
incompleto/indisponível — aparece em pelo menos três casos. Daniel e um revisor
independente aprovam a cobertura. Fixtures não contêm dados privados.

## 12. Fases e gates

### NEXT-00 — Charter e contratos

Produzir os oito contratos da seção 4, inventário de capacidades e taxonomia de
reaproveitamento. Construir, sanitizar, versionar e revisar o Golden Set v1 com
a cobertura mínima da seção 11. Decidir isolamento de repo/workspace, banco e
ambiente apenas quando necessário ao contrato; essas escolhas não bloqueiam
abrir NEXT-00.

**GO:** todos os contratos e o Golden Set v1 estão versionados e revisados; os
limiares de qualidade, estabilidade, custo, latência, janela e rollback possuem
valores numéricos, sem `TBD`; a matriz de capacidades está preenchida; nenhuma
fonte real, produção ou writer foi acessado.

### NEXT-01 — Esqueleto isolado

Gateway, schemas, ledger vazio, catálogo/policy, memória versionada, tool budget,
observabilidade e replay sem rede.

**GO:** conversa sintética, follow-up, falha fechada e zero writer.

### NEXT-02 — Vertical de gastos por categoria

Observações -> eventos -> claims -> tools para despesas por categoria, pessoa,
conta/cartão e período. Transferência e pagamento de fatura neutros.

**GO:** kernel properties e Golden Set 100% nos invariantes críticos.

### NEXT-03 — Agente read-only

Uma IA combina tools do NEXT-02, mantém follow-up e responde por claims.

**GO:** críticos 100%, qualidade superior ao legado, custo/latência dentro do
contrato e zero efeitos.

### NEXT-04 — Adapters reais read-only e shadow

Sheets, Pluggy e ledger legado viram observações/projeções sob manifestos.

**GO:** paridade factual, cobertura explícita e nenhuma realimentação.

### NEXT-05 — Canal isolado, dashboard shadow e áudio

Canal de teste, entrega/retry, áudio pela rota textual e dashboard v2 consumindo
claims em shadow.

**GO:** WhatsApp/canal e dashboard equivalentes; áudio e restart verdes.

### NEXT-06 — Writers por operação

Cada writer abre gate próprio. Edição, exclusão e undo respeitam tombstone,
versões e efeitos externos.

**GO por writer:** state machine, idempotência, CAS, receipt, reconcile e
rollback.

### NEXT-07 — Open Finance proativo

Cursor cercado, proposta numerada, mudança material, ambiguidade e concorrência
manual/proativa.

**GO:** evento aparece uma vez e commit reconciliado não reaparece.

### NEXT-08 — Loop por domínio

Não existe NEXT-08 global. Para cada domínio:

`kernel -> tools -> replay -> shadow -> writer opcional -> canary -> gate`

Domínios incluem faturas/parcelas, orçamento/limites, contas a pagar,
reminders/Calendar, recorrências, regras aprendidas, projeções, dívidas/metas,
import/export/backup, planilha, dashboard, saúde e scheduler.

Cada domínio recebe classificação beta/cutover/retirement/post-MVP da matriz.

### NEXT-09 — Cutover por capacidade e sessão

Transferir lease/fencing de cada capacidade. O WhatsApp principal só migra
quando todas as capacidades atualmente usadas e classificadas como necessárias
estiverem verdes ou Daniel aceitar explicitamente uma ausência temporária.

**GO:** limiares objetivos, janela cumprida, rollback ensaiado.

### NEXT-10 — Retirada seletiva

Somente componentes sem ownership, uso, rollback necessário ou capacidade
pendente podem ser arquivados. Telemetria forense/segurança/auditoria continua
quando possui valor demonstrado.

## 13. Dependências

```text
NEXT-00 -> NEXT-01 -> NEXT-02 -> NEXT-03 -> NEXT-04 -> NEXT-05
                                                     |          
                                                     +-> NEXT-06 por writer
                                                     +-> NEXT-07 proativo

NEXT-05 -> NEXT-08 por domínio -> NEXT-09 por capacidade -> NEXT-10 seletivo
```

## 14. Métricas de beta e cutover

NEXT-00 fixa valores finais e método, cobrindo:

- 100% de invariantes críticos;
- divergência factual por claim;
- falso zero;
- duplicidade de evento/notificação;
- writer sem confirmação;
- proposta obsoleta aceita;
- falha de reconciliação;
- latência p50/p95;
- custo por conversa;
- taxa de clarificação redundante;
- duração mínima da janela;
- RTO e sucesso de rollback.

“Qualidade superior” e “estável” não podem ser decisões pós-hoc.

## 15. Segurança e privacidade

- escopo resolvido server-side;
- least privilege por manifest;
- model data boundary obrigatório;
- logs/traces sem conteúdo financeiro bruto, transcrição, identidade ou secrets;
- ADR-002 significa que admin não terá acesso amplo a gastos individuais na
  expansão multiusuário; o beta familiar atual não autoriza esse futuro acesso;
- regra familiar exige permissão de administração daquela família;
- webhook e egress são allowlisted;
- provider/modelo não recebe dados além do contrato.

## 16. Fora do escopo inicial

- multiusuário público;
- recomendações de investimento e patrimônio completo;
- OCR/PDF/imagem no primeiro MVP, preservados pós-MVP;
- auto-write sem confirmação;
- substituição imediata da Planilha;
- retirada prematura do legado;
- treinamento de modelo próprio.

## 17. Critérios globais

1. Uma mensagem possui um agente lógico e trace único.
2. Identidade, escopo e matemática são determinísticos.
3. Ledger do Next possui autoridade semântica única.
4. Projeção não reentra como observação.
5. Um writer/notifier por família e capacidade.
6. Zero, vazio, incompleto e indisponível são distintos.
7. Claims quantitativos são vinculados à evidência.
8. Confirmação aponta para proposta imutável vigente.
9. Regras aprendidas não ampliam autoridade.
10. Dashboard v2 e WhatsApp usam os mesmos claims.
11. Gasto por categoria é semanticamente único.
12. Eventos proativos aparecem uma vez.
13. Calendar/reminders são versionados e idempotentes.
14. Integrações novas começam read-only e sem autoridade.
15. Erro real vira regressão permanente.
16. Cutover e retirada permanecem reversíveis e mensuráveis.

## 18. Gate atual

Único gate aberto: revisão focal do draft v2 e confirmação humana.

Sequência:

1. publicar hash imutável do v2 e matriz de resolução;
2. Chat e Claude verificam apenas fechamento dos achados;
3. reconciliar eventual residual;
4. Daniel confirma ou rejeita o roadmap;
5. somente com confirmação abrir NEXT-00.

