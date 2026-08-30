# Capability and Cutover Matrix v0

Estado: `FROZEN FOR NEXT-00`
Versão: `0.1.0`
Fonte: inventário NEXT00-01, 30 capacidades

## 1. Classes

1. `BETA_REQUIRED`: necessária para o primeiro beta controlado com dados reais.
2. `PRIMARY_CUTOVER_REQUIRED`: necessária antes de o WhatsApp principal trocar
   para o Next.
3. `LEGACY_RETIREMENT_REQUIRED`: pode entrar após o cutover, mas deve existir
   antes de aposentar o legado.
4. `POST_MVP`: preservada no produto alvo, sem bloquear beta, cutover ou
   aposentadoria inicial.

Uma capacidade atualmente usada não pode desaparecer temporariamente no
cutover sem aceitação explícita de Daniel registrada por capability e prazo.
`RUNTIME_UNKNOWN` nunca é usado como justificativa para apagá-la: exige prova de
uso antes do cutover e fica no tier mais conservador compatível.

## 2. Matriz

| ID | Capacidade | Classe | Slice mínima e gate | Dependências principais | Critério objetivo |
|---|---|---:|---|---|---|
| CAP-01 | conversa textual/follow-up | 1 | NEXT-01/03 | sessão, tool budget, Model Boundary | replay simples/follow-up crítico 100% |
| CAP-02 | consultas simples/investigativas | 1 | NEXT-02/03 | kernel, claims, coverage | zero claim material divergente |
| CAP-03 | gastos categoria/subcategoria | 1 | NEXT-02 | Observation/Event, metric registry | WhatsApp/dashboard mesmo fingerprint |
| CAP-04 | gasto livre/limites categoria | 1 | NEXT-02/08-budget | CAP-03, recurring/neutral policy | política aprovada e neutros excluídos |
| CAP-05 | dashboard v2 | 1 | NEXT-05 shadow | CAP-02/03, same Tool Gateway | paridade por claim e scope negativo |
| CAP-06 | writes manuais | 2 | NEXT-06 por writer | proposal/CAS, lease, receipt | idempotência/reconcile/rollback 100% |
| CAP-07 | edição/exclusão/undo | 2 | NEXT-06 por operação | event version, tombstone, precondition | replay/restart sem perda ou ressurreição |
| CAP-08 | Open Finance proativo | 2 | NEXT-07 | Pluggy read, cursor, proposal, notifier | ocorrência única; committed não reaparece |
| CAP-09 | estorno/transferência/fatura/reserva | 1 | NEXT-02 semantics | event links, double-count policy | invariantes críticos 100% |
| CAP-10 | cartões/faturas/parcelamentos | 1 | NEXT-02/08-cards | card_id, billing period, schedule | card identity e competência 100% |
| CAP-11 | importação CSV/OFX | 3 | NEXT-08-import | import manifest, proposal, dedup | dry-run/fingerprint/rollback |
| CAP-12 | criação/manutenção da Planilha | 2 | NEXT-06/08-sheet | Google manifest, projection anti-loop | writer cercado; Sheet não vira autoridade |
| CAP-13 | compartilhamento familiar | 1 | NEXT-01/04 | membership server-side, ADR-002 | cross-family negatives 100% |
| CAP-14 | onboarding/termos/aprovação/OAuth | 1 | NEXT-01/04 | consent lifecycle, OAuth manifest | saga/revocation/restart 100% |
| CAP-15 | contas a pagar/recorrências | 2 | NEXT-08-bills | rule vs occurrence, tools/writers | listar/criar/editar/concluir sem duplicar |
| CAP-16 | lembretes/vencimentos | 2 | NEXT-08-reminders | scheduler, delivery ledger | zero entrega lógica duplicada |
| CAP-17 | Google Calendar | 2 | NEXT-08-calendar | ETag, timezone, series/occurrence | CRUD/retry/reconcile/rollback 100% |
| CAP-18 | alertas de fatura | 2 | NEXT-08-invoice-alerts | card/fatura, scheduler, notifier | competência correta; zero duplicidade |
| CAP-19 | regras de estabelecimento/aprendizado | 3 | NEXT-08-rules | whitelist, personal/family permission | nenhuma regra amplia autoridade |
| CAP-20 | interface de ambiguidades | 2 | NEXT-07/08 | evidence, matcher preview, proposal | decisão explícita e auditável |
| CAP-21 | metas/dívidas/saúde financeira | 3 | NEXT-08-health | claims, forecasts, coverage | tools sem código órfão como autoridade |
| CAP-22 | projeções/cenários | 3 | NEXT-08-forecast | canonical schedule, claims | premissas/coverage e comparação determinística |
| CAP-23 | áudio | 2 | NEXT-05 | transcription manifest, textual gateway | mesma resposta do texto; zero segunda lógica |
| CAP-24A | comprovantes/recibos sem OCR | 3 | NEXT-08-receipts | Drive manifest, privacy/retention | store/get/delete com receipt e scope |
| CAP-24B | OCR/PDF/imagem | 4 | pós-MVP gate próprio | media manifest e threat model | não bloqueia retirement do fluxo textual |
| CAP-25A | backup/restore | 1 | NEXT-01 storage + todo writer | retention, tombstone, drills | RPO/RTO e restore sem ressurreição |
| CAP-25B | exportação do usuário | 3 | NEXT-08-export | scope, artifact lifecycle | export completo e apagado após 24h |
| CAP-26 | qualidade/cobertura/ambiguidades de fonte | 1 | NEXT-01/02 | coverage/evidence verifier | falso zero 0; insufficiency correta 100% |
| CAP-27 | adapters futuros | 4 | pós-MVP por manifest | Integration Contract | nasce read-only e sem authority |
| CAP-28 | scheduler operacional | 2 | NEXT-08-scheduler | lease/fencing, job IDs, outbox | split-brain/restart 100% |
| CAP-29 | observabilidade/auditoria | 1 | NEXT-01 | trace único, redaction, metrics | zero conteúdo/segredo bruto |
| CAP-30 | release imutável/rollback | 1 | NEXT-01 infra e cada promoção | artifact, health, leases, restore | dois drills consecutivos verdes |

Os sufixos A/B apenas separam subcapacidades já agrupadas no inventário; não
criam escopo novo. CAP-24 e CAP-25 estão integralmente cobertas.

## 3. Conteúdo do primeiro beta

O beta só abre quando todas as classes 1 estiverem verdes:

- conversa/follow-up e consultas por claims;
- gasto por categoria, gasto livre/limites e semântica de neutros;
- cartões/faturas/parcelamentos read-only;
- dashboard v2 em paridade;
- família, consentimento e OAuth com scope server-side;
- backup/restore, qualidade/coverage, observabilidade e rollback.

O beta pode permanecer read-only. Nenhum writer é necessário para provar o
agente, mas a ausência é visível e o legado continua owner das escritas.

## 4. Conteúdo do cutover do WhatsApp principal

Além das classes 1, todas as classes 2 precisam estar verdes ou ter exceção
explícita, temporária e datada de Daniel:

- writes manuais, edição/exclusão/undo e projeção na Planilha;
- Open Finance proativo e ambiguidades;
- bills/recorrências, reminders, Calendar, alertas de fatura e scheduler;
- áudio pelo mesmo gateway textual.

Cada capability transfere `write/notify/schedule/cursor` separadamente. O canal
principal só troca depois de o conjunto necessário possuir owner definido,
rollback ensaiado e janela de estabilidade cumprida.

## 5. Antes de aposentar o legado

Classes 3 precisam existir ou Daniel precisa aceitar sua retirada definitiva:

- CSV/OFX;
- regras aprendidas/pessoais;
- metas, dívidas, saúde, projeções e cenários;
- comprovantes sem OCR;
- exportação do usuário.

Até lá o componente legado correspondente permanece disponível sem dividir
ownership com o Next. Código não usado só pode ser aposentado após prova de
ausência de consumer/rollback.

## 6. Pós-MVP

OCR/PDF/imagem e adapters futuros ficam preservados como slots de capability,
mas não bloqueiam o MVP. Entram apenas com manifest, threat model, Golden Set e
gate próprios. “Pós-MVP” não autoriza implementação genérica antecipada.

## 7. Gates de mudança da matriz

Mover capacidade para tier posterior exige:

1. evidência de não uso ou aceitação explícita de Daniel;
2. impacto em dependências e rollback;
3. atualização versionada desta matriz;
4. auditoria antes do cutover afetado.

Mover para tier anterior é permitido, mas não amplia automaticamente escopo do
gate ativo. Nenhum status verde é inferido da existência do legado.

## 8. Testes negativos

| ID | Falha que a matriz deve impedir |
|---|---|
| CM-01 | abrir beta sem capability classe 1 verde |
| CM-02 | cortar WhatsApp omitindo capability usada classe 2 |
| CM-03 | aposentar legado com classe 3 ausente |
| CM-04 | tratar runtime desconhecido como “não usado” |
| CM-05 | transferir todas as authorities por uma flag global |
| CM-06 | declarar dashboard verde com cálculo independente |
| CM-07 | contar OCR/PDF como parte do primeiro MVP |
| CM-08 | exceção temporária sem capability, prazo e aceite de Daniel |
