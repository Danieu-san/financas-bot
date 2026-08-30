# NEXT00-01 — Inventário de capacidades e taxonomia de reaproveitamento

Data: 2026-08-30
Estado: `COMPLETE — STATIC INVENTORY; ZERO RUNTIME ACCESS`
Branch: `codex/financasbot-next-00`
Base de inspeção: `6216aeb321e547d079c18fb70a9786edfeb088c0`
Roadmap normativo: `911af93343210ccfe2d7b7fe0b898542044a1fdf`

> Este inventário distingue capacidade de produto, wiring estático e estado
> operacional. Nenhum runtime, integração, planilha, segredo, dado financeiro,
> WhatsApp, Pluggy, Google ou produção foi consultado. Arquivo existente não
> prova uso; wiring estático não prova saúde; teste verde não prova adoção.

## 1. Fontes e classes de evidência

Fontes principais:

- roadmap v2 ratificado e seu charter NEXT-00;
- `docs/agent-memory/architecture-map.md`;
- inventário estático auditado `financial-roadmap-road00-inventory.md`;
- inventário semântico `financial-roadmap-roadk0-contract-inventory.md`;
- inventário consumer-first `financial-roadmap-road01-inventory.md`;
- imports de `index.js` e `src/handlers/messageHandler.js`;
- módulos e testes rastreados em `src/` e `tests/`.

Classes de evidência:

- `USER_REQUIRED`: Daniel exigiu preservação no produto alvo;
- `STATIC_WIRED`: há consumer/import/caminho no snapshot Git;
- `CONTRACT_PROVEN`: contrato puro e testes localizados;
- `TEST_ONLY`: implementação validada, sem consumer produtivo confirmado;
- `QUARANTINED`: presença no código sem autorização para tratar como ativa;
- `RUNTIME_UNKNOWN`: estado atual dependeria de fonte externa não consultada.

## 2. Taxonomia de decisão

- `PORT_AS_IS`: regra normativa sem acoplamento ao runtime e sem semântica
  concorrente; pode ser incorporada sem mudança substantiva.
- `PORT_BEHIND_NEW_CONTRACT`: algoritmo, fixture ou adapter aproveitável somente
  atrás dos contratos do Next e após testes de conformidade.
- `REWRITE`: capacidade permanece, mas a implementação atual não atravessa a
  nova fronteira de autoridade.
- `REPLACE_WITH_TOOL`: experiência permanece como tool tipada; handler/intents
  antigos não são a unidade portada.
- `DO_NOT_PORT`: comportamento ou estrutura incompatível com o Next.

`PORT_AS_IS` nunca significa ligar código legado diretamente à produção Next.

## 3. Capacidades de produto

| ID | Capacidade | Evidência | Decisão | Destino e razão | Evidência local principal |
| --- | --- | --- | --- | --- | --- |
| CAP-01 | conversa textual e follow-up | `USER_REQUIRED`, `STATIC_WIRED` | `REWRITE` | gateway e sessão versionada; não portar o roteamento monolítico | `messageHandler.js`, `financialQueryPlan.js` |
| CAP-02 | consultas financeiras simples e investigativas | `USER_REQUIRED`, `STATIC_WIRED` | `REPLACE_WITH_TOOL` | agente único compõe reads tipados; matemática fica no kernel | `calculationOrchestrator.js`, semantic facade |
| CAP-03 | gastos por categoria/subcategoria | `USER_REQUIRED`, `STATIC_WIRED` | `REPLACE_WITH_TOOL` | primeiro vertical do Next, uma métrica única para WhatsApp/dashboard | query engine, `categoryBudgetService.js` |
| CAP-04 | gasto livre e limites por categoria | `USER_REQUIRED`, `STATIC_WIRED` | `REPLACE_WITH_TOOL` | política e claims no kernel; apresentação fora do cálculo | budget utils/service e testes de categoria |
| CAP-05 | dashboard v2 | `USER_REQUIRED`, `CONTRACT_PROVEN` | `PORT_BEHIND_NEW_CONTRACT` | preservar UX e contrato público; trocar fonte por claims do Next | `dashboardV2SummaryService.js`, `dashboard-api.md` |
| CAP-06 | gasto, entrada, cartão e transferência manuais | `USER_REQUIRED`, `STATIC_WIRED` | `REWRITE` | writers separados com proposta, confirmação, receipt e reconcile | caminhos de write no `messageHandler.js` |
| CAP-07 | edição, exclusão e undo | `USER_REQUIRED`; undo `TEST_ONLY` | `REWRITE` | protocolos por operação, CAS e tombstone; serviço de undo é insumo, não runtime pronto | deletion handler, `financialUndoService.js` |
| CAP-08 | salvamento proativo Open Finance | `USER_REQUIRED`, `STATIC_WIRED`, `RUNTIME_UNKNOWN` | `REWRITE` | conservar estados e testes úteis sob cursor cercado e identidade econômica única | `src/openFinance/`, testes proativos |
| CAP-09 | estorno, transferência, fatura e reserva | `USER_REQUIRED`, `STATIC_WIRED` | `REWRITE` | eventos ligados e neutralidade no kernel; não portar heurísticas como autoridade | ledger projector, reviewed proposals |
| CAP-10 | cartões, faturas e parcelamentos | `USER_REQUIRED`, `STATIC_WIRED` | `REWRITE` | identidade por `card_id`, competência e schedule canônicos | ROAD-01 inventory, installment schedule |
| CAP-11 | importação CSV/OFX | `USER_REQUIRED`, `CONTRACT_PROVEN` | `PORT_BEHIND_NEW_CONTRACT` | reaproveitar parsers/dedup; preview e commit usam proposta Next | `statementImportService.js` e testes |
| CAP-12 | criação/manutenção de planilha | `USER_REQUIRED`, `STATIC_WIRED` | `PORT_BEHIND_NEW_CONTRACT` | adaptar template/projeção; Sheets nunca volta a ser autoridade semântica | `userSpreadsheetService.js`, `google.js` |
| CAP-13 | compartilhamento familiar | `USER_REQUIRED`, `STATIC_WIRED` | `PORT_BEHIND_NEW_CONTRACT` | preservar membership server-side e fail-closed; aplicar ADR-002 | `userService.js`, family mode e revocation |
| CAP-14 | onboarding, termos, aprovação e OAuth Google | `STATIC_WIRED`, `CONTRACT_PROVEN` | `PORT_BEHIND_NEW_CONTRACT` | reaproveitar lifecycle/saga sob capability manifest | user lifecycle, OAuth service/tests |
| CAP-15 | contas a pagar e recorrências | `USER_REQUIRED`, `STATIC_WIRED` | `REPLACE_WITH_TOOL` | tools de listar/criar/atualizar/concluir; regra e ocorrência separadas | recurring matcher, query intents, `Contas` |
| CAP-16 | lembretes individuais e vencimentos | `USER_REQUIRED`, `STATIC_WIRED` | `REPLACE_WITH_TOOL` | lifecycle explícito e delivery ledger | scheduler, `schedulerMessageOutbox.js` |
| CAP-17 | Google Calendar | `USER_REQUIRED`, `STATIC_WIRED` | `REPLACE_WITH_TOOL` | create/update/delete com ETag, timezone e série/ocorrência | `createCalendarEvent`, scheduler |
| CAP-18 | alertas de vencimento de fatura | `USER_REQUIRED`, `STATIC_WIRED` | `REWRITE` | notifier com lease/fencing, fonte e competência explícitas | scheduler e métricas de fatura |
| CAP-19 | regras de estabelecimento e classificação aprendida | `USER_REQUIRED`, `STATIC_WIRED` | `REPLACE_WITH_TOOL` | regra versionada, pessoal/familiar e whitelist só de metadado | recurring bill rules, historical merchant rules |
| CAP-20 | interface para ambiguidades | `USER_REQUIRED`, `STATIC_WIRED` | `REWRITE` | preview mostra matcher/evidência e aplicação em equivalentes exige pedido | historical ambiguity review/runtime |
| CAP-21 | metas, dívidas e saúde financeira | `USER_REQUIRED`; health parcialmente `QUARANTINED` | `REPLACE_WITH_TOOL` | tools sobre eventos/claims; não tratar serviço órfão como ativo | projected plans, goal/debt handlers, health service |
| CAP-22 | projeções e cenários | `USER_REQUIRED`, `CONTRACT_PROVEN` | `PORT_BEHIND_NEW_CONTRACT` | reaproveitar schedule puro; inputs e claims passam pelo kernel | `projectedPlansSchedule.js`, ledger forecast |
| CAP-23 | áudio | `USER_REQUIRED`, `STATIC_WIRED`, `RUNTIME_UNKNOWN` | `PORT_BEHIND_NEW_CONTRACT` | adapter produz texto e reentra no mesmo gateway; falha não cria segunda lógica | `audioHandler.js`, testes de privacidade/transcrição |
| CAP-24 | comprovantes/recibos | `USER_REQUIRED`, `CONTRACT_PROVEN` | `PORT_BEHIND_NEW_CONTRACT` | preservar serviço atrás de policy e manifest; não expor IDs internos | receipts service/handler/tests |
| CAP-25 | exportação, backup e restore | `USER_REQUIRED`, `CONTRACT_PROVEN` | `PORT_BEHIND_NEW_CONTRACT` | contratos por artefato, tombstone e restore; sem ressurreição | export service, state backup, projected plans store |
| CAP-26 | qualidade, cobertura e ambiguidades de fonte | `STATIC_WIRED`, `CONTRACT_PROVEN` | `PORT_BEHIND_NEW_CONTRACT` | alimentar claims e fail-closed, sem corrigir fatos silenciosamente | `dataQualityService.js`, evidence verifier |
| CAP-27 | integrações futuras | `USER_REQUIRED` | `REWRITE` | gateway por capability manifest; read-only e sem autoridade por padrão | contrato NEXT-00, sem adapter genérico aprovado |
| CAP-28 | scheduler operacional | `STATIC_WIRED`, `RUNTIME_UNKNOWN` | `REWRITE` | ownership por capacidade, delivery ledger e jobs independentes | `scheduler.js`, scheduler outbox/tests |
| CAP-29 | observabilidade e auditoria | `CONTRACT_PROVEN`, `RUNTIME_UNKNOWN` | `PORT_BEHIND_NEW_CONTRACT` | manter valor forense sanitizado; trace único e sem dados brutos | legacy/reliability telemetry, receipts |
| CAP-30 | release imutável e rollback | `CONTRACT_PROVEN`, `RUNTIME_UNKNOWN` | `PORT_BEHIND_NEW_CONTRACT` | reaproveitar protocolo operacional após manifestar ambiente Next | OCI artifact release e testes |

## 4. Ativos técnicos reaproveitáveis

| ID | Ativo | Estado | Decisão | Condição de entrada no Next |
| --- | --- | --- | --- | --- |
| AST-01 | `FinancialQueryPlan` | IR executável existente | `PORT_BEHIND_NEW_CONTRACT` | convergir vocabulário temporal e claims do Next |
| AST-02 | `financialSemanticReadFacade` | fronteira read-only testada | `PORT_BEHIND_NEW_CONTRACT` | source policy, scope e coverage conforme contratos 1/4 |
| AST-03 | evidence adequacy verifier | prova determinística testada | `PORT_BEHIND_NEW_CONTRACT` | validar claims materializados, não resposta livre |
| AST-04 | canonical ledger projector | semântica/eventos existentes | `PORT_BEHIND_NEW_CONTRACT` | mapear integralmente para Observation/Event/Projection v0 |
| AST-05 | canonical installment schedule | schedule puro testado | `PORT_BEHIND_NEW_CONTRACT` | identidade e competência aprovadas no contrato 1 |
| AST-06 | financial write ledger | operation key/receipt | `PORT_BEHIND_NEW_CONTRACT` | proposal/CAS/epoch/reconcile do contrato Next |
| AST-07 | projected plans schedule/store | cálculo puro + shadow | `PORT_BEHIND_NEW_CONTRACT` | eventos/claims Next e writer ownership explícito |
| AST-08 | dashboard v2 API/page | contrato e UX existentes | `PORT_BEHIND_NEW_CONTRACT` | somente Tool Gateway; zero cálculo paralelo |
| AST-09 | statement parsers/dedup | testes focais existentes | `PORT_BEHIND_NEW_CONTRACT` | observation IDs e preview/commit Next |
| AST-10 | Open Finance stores/outbox/review tests | ampla evidência acumulada | `PORT_BEHIND_NEW_CONTRACT` | não portar como subsistema autônomo; conformar a contratos 1–3 |
| AST-11 | Golden Set/fixtures ROAD-00 | sintético e auditado | `PORT_BEHIND_NEW_CONTRACT` | converter e ampliar para o piso de 48 sem dados privados |
| AST-12 | ADR-002 e escopo server-side | política normativa | `PORT_AS_IS` | permanecer invariante em toda expansão familiar/multiusuário |
| AST-13 | timezone `America/Sao_Paulo` | regra operacional consolidada | `PORT_AS_IS` | aplicar em Calendar, reminders e datas do kernel |
| AST-14 | outbox/receipts sanitizados | mecanismos testados por domínio | `PORT_BEHIND_NEW_CONTRACT` | namespace, epoch e idempotência únicos do Next |
| AST-15 | suíte de regressões financeiras | evidência extensa | `PORT_BEHIND_NEW_CONTRACT` | selecionar testes causais; não transportar arquitetura incidental |

Nenhum módulo de runtime recebeu `PORT_AS_IS`. Somente políticas normativas
sem autoridade executável receberam essa classificação.

## 5. Estruturas e comportamentos que não serão portados

| ID | Item | Decisão | Motivo |
| --- | --- | --- | --- |
| DNP-01 | `messageHandler.js` como orquestrador monolítico | `DO_NOT_PORT` | mistura linguagem, estado, cálculo, efeitos, compatibilidade e fallbacks |
| DNP-02 | `userStateManager` em memória como verdade conversacional | `DO_NOT_PORT` | reinício perde estado e confirmação pode se ligar ao turno errado |
| DNP-03 | múltiplos planners/agentes/fallbacks sobre a mesma mensagem | `DO_NOT_PORT` | recria cérebros concorrentes e decisões não auditáveis |
| DNP-04 | Sheets/fórmulas como autoridade semântica | `DO_NOT_PORT` | projeção não pode redefinir evento, identidade ou competência |
| DNP-05 | writer genérico via `google.js`/append arbitrário | `DO_NOT_PORT` | writers precisam ser separados por operação e receipt |
| DNP-06 | labels, nomes de aba ou método PIX/Débito como identidade | `DO_NOT_PORT` | identidade financeira é resolvida server-side por ID estável |
| DNP-07 | admin com visão de gastos de todos os usuários | `DO_NOT_PORT` | incompatível com ADR-002/LGPD e escopo familiar autorizado |
| DNP-08 | fallback silencioso, falso zero e “ausência = zero” | `DO_NOT_PORT` | viola coverage/evidence e mascara falha de fonte |
| DNP-09 | código órfão/test-only tratado como capacidade ativa | `DO_NOT_PORT` | existência e teste não comprovam consumer nem uso |
| DNP-10 | telemetria/log com texto, identidade ou valor financeiro bruto | `DO_NOT_PORT` | viola Model Data Boundary e privacidade |
| DNP-11 | detalhes históricos de host/provedor como configuração do Next | `DO_NOT_PORT` | infraestrutura é variável e deve vir de manifest vigente |
| DNP-12 | auto-write sem confirmação | `DO_NOT_PORT` | fora do roadmap e da fronteira de autoridade |

## 6. Cobertura das capacidades preservadas no roadmap

| Capacidade do roadmap §9 | Cobertura neste inventário |
| --- | --- |
| categoria/subcategoria e limites | CAP-03, CAP-04 |
| dashboard v2 | CAP-05, AST-08 |
| Google Calendar | CAP-17 |
| contas a pagar, lembretes e vencimentos | CAP-15, CAP-16 |
| alertas de fatura | CAP-18 |
| edição, exclusão e undo | CAP-07 |
| compartilhamento familiar | CAP-13, CAP-14, AST-12 |
| classificação aprendida e regras pessoais | CAP-19 |
| projeções e cenários | CAP-22 |
| ambiguidades | CAP-20, CAP-26 |
| exportação, backup e restore | CAP-25 |
| criação/manutenção da Planilha | CAP-12 |
| importação CSV/OFX | CAP-11 |
| áudio e comprovantes | CAP-23, CAP-24 |
| saúde financeira, dívidas e metas | CAP-21 |
| salvamento proativo Open Finance | CAP-08, CAP-09 |
| adapters futuros | CAP-27 |

Todos os itens preservados possuem destino. A cobertura não significa que todos
entram no beta; a classificação beta/cutover/retirement/pós-MVP pertence à
Capability and Cutover Matrix de NEXT00-03.

## 7. Achados e lacunas carregadas

1. O mapa de arquitetura ainda cita EC2, mas evidência posterior registra OCI;
   nenhum endereço histórico será usado como contrato do Next.
2. Áudio, flags, telemetry, Open Finance e scheduler têm wiring estático, mas
   saúde operacional atual permanece `RUNTIME_UNKNOWN`.
3. Cartões ainda possuem drift entre `card_id` e label, além de subcategoria
   ausente no schema unificado legado; o Next não pode herdar esse shape.
4. Conta financeira não pode ser inferida de PIX/Débito/Dinheiro.
5. `financialHealthService`, `debtUpdateHandler` e undo não comprovam todos um
   consumer produtivo; preservar a capacidade não autoriza portar o wiring.
6. O Golden Set anterior é insumo, não satisfaz sozinho o piso de 48.
7. O extenso Open Finance legado contém testes e protocolos úteis, mas deve ser
   reduzido aos contratos comuns, não migrado como segundo subsistema.

Nenhuma dessas lacunas exige fonte real para fechar NEXT00-01. Elas se tornam
entradas explícitas dos contratos e matrizes seguintes.

## 8. Veredito NEXT00-01

`GO DOCUMENTAL PARA NEXT00-02`.

O inventário cobre capacidades de leitura, escrita, canal, família,
integrações, scheduler, dashboard, Open Finance e operação; distingue uso
exigido, wiring, contrato, teste-only e runtime desconhecido; e não recomenda
port por mera existência.

Este GO não autoriza implementação, acesso externo, produção, writer, migração
ou NEXT-01.

