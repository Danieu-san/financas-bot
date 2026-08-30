# Data Authority Contract v0

Estado: `FROZEN FOR NEXT-00`
Versão: `0.1.0`
Escopo: FinançasBot Next, todos os ambientes
Vigência semântica: a partir de `NEXT-02`

## 1. Propósito e autoridade

Este contrato define a única cadeia pela qual um fato externo pode adquirir
significado financeiro no FinançasBot Next:

```text
SourceObservation (imutável)
          |
          v
CanonicalFinancialEvent (versionado)
          |
          v
Projection / Read Model / Sheets compatível
```

O ledger do Next é a única autoridade semântica. Pluggy, Sheets legado,
importações, Calendar e resultados de writers são fontes de observação; não
definem por si só identidade, tipo financeiro, contribuição econômica ou
estado de evidência. Dashboard, WhatsApp e Sheets são projeções ou consumidores
dos mesmos claims do kernel.

Antes de `NEXT-02`, este documento é apenas normativo: não autoriza leitura,
gravação, migração ou promoção de fonte real.

## 2. Invariantes obrigatórios

1. Toda observação é append-only; correção da fonte cria outra versão.
2. Identidade, escopo, tipo financeiro, precedência e matemática são resolvidos
   server-side pelo kernel, nunca pelo modelo.
3. Uma projeção produzida pelo Next não pode voltar como nova observação.
4. Um evento canônico aponta para ao menos uma observação e conserva a
   provenance por campo material.
5. Valor monetário usa inteiro em centavos e código ISO 4217; ponto flutuante é
   proibido como representação canônica.
6. Total igual não prova equivalência: identidade, dimensões e vínculos também
   precisam coincidir.
7. Compra, parcela, pagamento de fatura, transferência, estorno, aplicação e
   resgate possuem contribuições econômicas distintas; não são aliases.
8. `zero`, `empty`, `incomplete` e `unavailable` são estados diferentes.
9. Uma policy de fonte é versionada e identificada em toda decisão de
   reconciliação.
10. Nenhum output do modelo cria ou altera estes registros diretamente.

## 3. SourceObservation v0

Schema lógico mínimo:

```yaml
schema_version: 0
observation_id: string              # estável e não reutilizável
observation_version: integer        # >= 1, monotônica no source record
previous_observation_id: string|null
source_type: enum                    # pluggy|legacy_sheet|import|writer|calendar
source_instance_ref: opaque_ref      # resolvida/armazenada server-side
source_record_ref: opaque_ref        # nunca exposta ao modelo
source_version: string               # versão nativa ou fingerprint estável
deduplication_key: string
observed_at: datetime_utc
effective_at: datetime_utc|null
coverage:
  start: date|null
  end: date|null
  as_of: datetime_utc
  completeness: enum                # complete|partial|unknown|unavailable
normalized_payload: object           # somente campos necessários ao kernel
evidence_state: enum                 # confirmed|committed|projected|estimated|incomplete|unavailable
field_provenance: map<string, evidence_ref>
origin_runtime: string|null
origin_operation_id: string|null
integrity_hash: string
ingestion_policy_version: string
```

Regras:

- `observation_id` identifica uma versão imutável; uma mudança material gera
  novo ID e referencia `previous_observation_id`.
- Se a fonte não oferece versão estável, `source_version` é um fingerprint de
  campos materiais normalizados, não de posição de linha.
- `deduplication_key` identifica entrega repetida da mesma versão, mas não
  autoriza fundir eventos economicamente diferentes.
- `origin_operation_id` é obrigatório para observação originada por writer do
  Next. A ausência em registro legado não é inferida retroativamente.
- `normalized_payload` não contém segredo, token, cookie nem payload bancário
  bruto. O bruto, se indispensável à auditoria, permanece fora deste schema sob
  retenção própria e nunca vai ao modelo.

Mudança material é qualquer alteração de valor, moeda, conta/cartão resolvido,
tipo do evento, estado de liquidação, data financeira relevante ou vínculo de
compensação. Ela invalida propostas que apontem para a versão anterior.

## 4. CanonicalFinancialEvent v0

```yaml
schema_version: 0
event_id: string
event_version: integer               # >= 1, monotônica por event_id
previous_event_version: integer|null
event_kind: enum
family_id: opaque_id
person_id: opaque_id|null
account_id: opaque_id|null
card_id: opaque_id|null
amount_minor: integer
currency: string                     # ISO 4217
transaction_date: date|null
billing_period: year_month|null
due_date: date|null
settlement_date: date|null
as_of: datetime_utc
status: enum                         # active|superseded|reversed|tombstoned
evidence_state: enum
coverage: object
observation_refs: [observation_id]
field_provenance: map<string, evidence_ref>
links: [FinancialEventLink]
economic_identity_key: string
idempotency_key: string|null
origin_operation_id: string|null
receipt_ref: string|null
source_policy_version: string
created_at: datetime_utc
```

`event_kind` inicial:

- `purchase`;
- `income`;
- `transfer`;
- `installment`;
- `invoice_payment`;
- `refund`;
- `reversal`;
- `opening_balance`;
- `fee_interest`;
- `reserve_application`;
- `reserve_redemption`;
- `adjustment`.

`FinancialEventLink` contém `link_type`, `from_event_id`, `to_event_id`,
`link_version` e provenance. Tipos permitidos inicialmente:
`originates_from`, `compensates`, `settles`, `installment_of`,
`reserve_transfer_of`, `supersedes` e `reverses`.

Regras:

- Correção semântica cria nova `event_version`; versões antigas não são
  reescritas.
- Exclusão de evento reconciliado ou com efeito externo usa tombstone ou evento
  de reversão. Hard delete só poderá existir para draft nunca confirmado ou
  obrigação legal, conforme contrato de retenção.
- `economic_identity_key` é calculada pelo kernel a partir das identidades e
  dimensões materiais. Ela é compartilhada pelas rotas manual e proativa para
  impedir dupla reivindicação.
- IDs internos são opacos e não podem ser fornecidos ou aceitos pelo modelo.

## 5. Política de fonte e reconciliação

Cada domínio registra uma `SourceAuthorityPolicy` versionada:

```yaml
policy_version: string
domain: string
allowed_source_types: [enum]
field_authority: map<field, ordered_sources>
promotion_conditions: [predicate]
conflict_action: enum                # reject|hold_for_review|append_new_version
coverage_requirements: object
```

Política inicial obrigatória:

| Domínio | Observação primária | Autoridade complementar | Regra |
|---|---|---|---|
| transação bancária/cartão | Pluggy ou import autorizado | input confirmado do usuário | provider fornece ocorrência; kernel define semântica |
| lançamento manual | writer com receipt | observação vinculada, se houver | receipt cria observação `committed`; não simula dado bancário |
| Sheet legado | legacy_sheet | fingerprint/reconciliação | somente migração/read compatível; nunca sobrepõe evento canônico por posição |
| Calendar/lembrete | writer/calendar adapter | estado local versionado | ETag e receipt externos são obrigatórios |
| regra aprendida | confirmação explícita | matcher versionado | afeta apenas classificação/metadado reversível |

Conflito de identidade, moeda, valor ou vínculo material nunca é resolvido por
ordem de chegada. O evento fica retido para revisão ou ganha nova versão segundo
a policy; o modelo pode explicar a ambiguidade, não decidi-la.

## 6. Estados de evidência, cobertura e vazio

Precedência semântica de `evidence_state`:

- `confirmed`: ocorrência externa confirmada pela fonte autoritativa;
- `committed`: efeito confirmado por writer e receipt reconciliável;
- `projected`: esperado no futuro, sem ocorrência realizada;
- `estimated`: valor derivado por regra determinística com premissas expostas;
- `incomplete`: há evidência, mas a cobertura exigida não está completa;
- `unavailable`: a fonte necessária não pôde responder.

`projected` e `estimated` nunca são promovidos por texto da IA. Promoção exige
nova observação e policy do kernel.

Resultado de consulta:

- `zero`: cobertura completa e soma determinística igual a zero;
- `empty`: cobertura completa e zero eventos elegíveis;
- `incomplete`: cobertura parcial ou dimensões ausentes;
- `unavailable`: fonte/adapter necessário indisponível.

Somente os dois primeiros admitem afirmação conclusiva de ausência.

## 7. Invariantes de dupla contagem

1. Compra reconhece consumo; pagamento de fatura liquida obrigação e é neutro
   para consumo.
2. Transferência entre contas da mesma família é neutra no agregado familiar;
   as duas pontas ficam vinculadas, não somadas como receita e despesa.
3. Estorno/reembolso compensa o evento alvo; não vira receita independente.
4. Compra parcelada contribui uma única vez segundo o `time_basis` solicitado:
   compra total ou parcelas por competência, nunca ambos na mesma métrica.
5. `installment` aponta para `installment_of`; fatura não cria novas compras.
6. Aplicação e resgate de reserva são movimentos patrimoniais, não consumo ou
   renda, salvo rendimento explicitamente separado.
7. Saldo anterior, pagamento de dívida e tarifa/juros mantêm tipos distintos.
8. Reimportação do mesmo fingerprint e projeção com `origin_operation_id`
   conhecido não criam novo evento.

## 8. Projeções e anti-realimentação

Toda linha/registro projetado contém, em canal técnico não editável pelo modelo:

```yaml
projection_id: string
projection_version: integer
event_id: string
event_version: integer
origin_runtime: financasbot_next
origin_operation_id: string
projection_target: string
projected_at: datetime_utc
integrity_hash: string
```

O ingestor rejeita como nova observação qualquer registro cujo
`origin_operation_id` e integridade sejam reconhecidos. Se alguém alterar campo
material da projeção, o conflito é `hold_for_review`; a alteração não se torna
automaticamente verdade financeira.

## 9. Conformidade e testes negativos

Uma implementação só é conforme se provar, com fixtures sintéticas:

- replay da mesma observação não duplica evento;
- nova versão preserva histórico e invalida proposta antiga;
- projeção do Next não reentra;
- totais iguais com identidades diferentes não são fundidos;
- compra + pagamento de fatura não duplicam consumo;
- transferência familiar não vira renda/despesa familiar;
- estorno compensa o alvo correto;
- parcela total e competência não são somadas juntas;
- cobertura parcial nunca responde zero/empty;
- IDs ou fonte sugeridos pelo modelo são ignorados/rejeitados;
- corrida entre writer manual e proativo concede a identidade econômica a uma
  única operação.

## 10. Reaproveitamento permitido

Podem ser portados atrás deste contrato: fingerprints, agenda canônica de
parcelas, projector do ledger, operation keys, receipts, estados `uncertain` e
fixtures causais do legado. Não podem ser portados como autoridade: Sheets,
SQLite/read-model, `messageHandler`, fallbacks, heurísticas de source selection
ou qualquer módulo apenas por já existir.
