# Integration Capability Manifest v0

Estado: `FROZEN FOR NEXT-00`
Versão: `0.1.0`
Escopo: todo adapter interno ou externo do FinançasBot Next

## 1. Regra central

Implementar um protocolo não concede acesso. Toda integração nasce
`disabled_read_only`, sem autoridade financeira, sem writer, sem webhook ativo
e sem lease operacional. Promoção exige manifest concreto, teste negativo,
revisão humana e gate da capability.

O manifest limita o adapter; o Data Authority Contract decide se uma observação
pode criar/atualizar evento; o Single-Writer Contract decide quem pode produzir
efeito. Nenhum adapter escolhe scope, source precedence ou identidade.

## 2. Schema do manifest

```yaml
schema_version: 0
integration_id: string
manifest_version: string
adapter_version: string
state: enum                         # disabled_read_only|shadow_read_only|canary|active|revoked
environments: [dev|test|beta|production]
owner: string
capabilities:
  read: [string]
  write_declared_but_disabled: [string]
  write_enabled: [string]
data_families: [string]
scope_resolution: server_side
oauth_scopes: [string]
secret_refs: [symbolic_secret_name]
egress_allowlist: [origin_or_internal_service]
webhook_allowlist: [path_or_none]
limits:
  reads_per_minute_per_family: integer
  writes_per_minute_per_family: integer
  request_timeout_seconds: integer
  max_attempts: integer
  max_payload_bytes: integer
observation_source:
  allowed: boolean
  source_type: string|null
  policy_version: string|null
projection_receiver:
  allowed: boolean
  projection_types: [string]
external_effects: [string]
rollback: [step]
negative_tests: [test_id]
required_contracts: [string]
promotion_gate: string
reviewed_at: date
```

Campos desconhecidos falham fechado. `secret_refs` contém nomes simbólicos,
nunca valores. `write_declared_but_disabled` documenta o destino futuro sem
autorizar a operação. `write_enabled` permanece vazio em NEXT-00.

## 3. Gates comuns

Qualquer promoção precisa provar:

1. scope server-side e teste cross-family negativo;
2. least privilege de OAuth/secret;
3. allowlist de egress e webhook com validação de assinatura/replay;
4. rate limit, timeout, retry e payload limit locais;
5. normalização para `SourceObservation` sem payload bruto no modelo;
6. lease/fencing/epoch para efeito, cursor, scheduler ou notificação;
7. idempotency key, receipt, reconcile e rollback para escrita;
8. revogação e limpeza de referências locais;
9. observabilidade sanitizada;
10. revisão humana e hash imutável do manifest.

## 4. Registry inicial

Todos os registros abaixo estão desativados. Valores de limites são tetos
locais e todas as tentativas precisam caber no timeout total de 30 segundos do
Tool Budget; `max_attempts` nunca multiplica esse prazo. Os limites independem
de limites mais permissivos do provider.

### INT-01 — WhatsApp channel

```yaml
integration_id: whatsapp_channel
state: disabled_read_only
environments: [test, beta, production]
capabilities:
  read: [message.receive]
  write_declared_but_disabled: [message.send, media.send]
  write_enabled: []
data_families: [conversation_text, delivery_metadata, user_supplied_media]
scope_resolution: server_side
oauth_scopes: []
secret_refs: [WHATSAPP_SESSION_REF]
egress_allowlist: [whatsapp_web_transport_registry]
webhook_allowlist: [none]
limits:
  reads_per_minute_per_family: 60
  writes_per_minute_per_family: 10
  request_timeout_seconds: 15
  max_attempts: 2
  max_payload_bytes: 16777216
observation_source: { allowed: true, source_type: user_message, policy_version: conversation_input_v0 }
projection_receiver: { allowed: false, projection_types: [] }
external_effects: [deliver_message, deliver_media]
promotion_gate: NEXT-05/channel; NEXT-09/main-session
```

Rollback: revoke
otify` lease, stop outbox claims, preserve delivery ledger and
return the session to the prior owner with a higher epoch. Session files are
never copied between two active runtimes.

### INT-02 — Google OAuth and account linkage

```yaml
integration_id: google_oauth
state: disabled_read_only
environments: [test, beta, production]
capabilities:
  read: [oauth.callback, account.identity]
  write_declared_but_disabled: [token.revoke]
  write_enabled: []
data_families: [consent, account_linkage]
scope_resolution: server_side
oauth_scopes:
  - openid
  - email
  - https://www.googleapis.com/auth/drive.file
  - https://www.googleapis.com/auth/calendar.events.owned
secret_refs: [GOOGLE_OAUTH_CLIENT_REF, OAUTH_TOKEN_ENCRYPTION_REF]
egress_allowlist: [google_oauth_registry]
webhook_allowlist: [oauth_callback_exact_path]
limits:
  reads_per_minute_per_family: 10
  writes_per_minute_per_family: 5
  request_timeout_seconds: 10
  max_attempts: 2
  max_payload_bytes: 65536
observation_source: { allowed: true, source_type: consent_state, policy_version: oauth_link_v0 }
projection_receiver: { allowed: false, projection_types: [] }
external_effects: [exchange_code, revoke_token]
promotion_gate: NEXT-04/google-read; writer-gate/revocation
```

Redirect URI é correspondência exata do registry do ambiente. Token revogado é
removido do runtime imediatamente; journal sanitizado permanece 30 dias.

### INT-03 — Google Sheets and Drive

```yaml
integration_id: google_sheets_drive
state: disabled_read_only
environments: [test, beta, production]
capabilities:
  read: [sheet.read, drive.file.lookup]
  write_declared_but_disabled: [sheet.project, spreadsheet.create, spreadsheet.update, receipt.store, file.delete]
  write_enabled: []
data_families: [legacy_sheet_observation, projection, receipt_artifact]
scope_resolution: server_side
oauth_scopes: [https://www.googleapis.com/auth/drive.file]
secret_refs: [USER_GOOGLE_TOKEN_REF]
egress_allowlist: [google_sheets_drive_registry]
webhook_allowlist: [none]
limits:
  reads_per_minute_per_family: 60
  writes_per_minute_per_family: 30
  request_timeout_seconds: 15
  max_attempts: 2
  max_payload_bytes: 1048576
observation_source: { allowed: true, source_type: legacy_sheet, policy_version: sheet_observation_v0 }
projection_receiver: { allowed: false, projection_types: [financial_projection, dashboard_projection] }
external_effects: [create_file, update_cells, delete_owned_file]
promotion_gate: NEXT-04/read; NEXT-06 or NEXT-08/domain-write
```

`drive.file` restringe o adapter a arquivos criados/abertos pelo app. Projeção
do Next leva `origin_operation_id` e não pode ser reingerida. Delete exige
precondition, ownership e receipt.

### INT-04 — Google Calendar

```yaml
integration_id: google_calendar
state: disabled_read_only
environments: [test, beta, production]
capabilities:
  read: [calendar.events.list]
  write_declared_but_disabled: [calendar.events.create, calendar.events.update, calendar.events.delete]
  write_enabled: []
data_families: [calendar_event, reminder_link]
scope_resolution: server_side
oauth_scopes: [https://www.googleapis.com/auth/calendar.events.owned]
secret_refs: [USER_GOOGLE_TOKEN_REF]
egress_allowlist: [google_calendar_registry]
webhook_allowlist: [none]
limits:
  reads_per_minute_per_family: 20
  writes_per_minute_per_family: 10
  request_timeout_seconds: 15
  max_attempts: 2
  max_payload_bytes: 262144
observation_source: { allowed: true, source_type: calendar, policy_version: calendar_v0 }
projection_receiver: { allowed: false, projection_types: [reminder_projection] }
external_effects: [create_event, update_event, delete_event]
promotion_gate: NEXT-08/calendar-domain
```

Write exige ETag/precondition, timezone, decisão ocorrência/série, lease,
receipt e reconcile. Falha ambígua não repete evento.

### INT-05 — Pluggy/Open Finance

```yaml
integration_id: pluggy_open_finance
state: disabled_read_only
environments: [test, beta, production]
capabilities:
  read: [items.read, accounts.read, transactions.read, cards.read, investments.read]
  write_declared_but_disabled: []
  write_enabled: []
data_families: [bank_observation, card_observation, investment_observation, consent_health]
scope_resolution: server_side
oauth_scopes: []
secret_refs: [PLUGGY_CLIENT_REF, PLUGGY_ITEM_MAPPING_REF]
egress_allowlist: [https://api.pluggy.ai]
webhook_allowlist: [open_finance_webhook_exact_path]
limits:
  reads_per_minute_per_family: 30
  writes_per_minute_per_family: 0
  request_timeout_seconds: 20
  max_attempts: 2
  max_payload_bytes: 1048576
observation_source: { allowed: true, source_type: pluggy, policy_version: open_finance_v0 }
projection_receiver: { allowed: false, projection_types: [] }
external_effects: []
promotion_gate: NEXT-04/read; NEXT-07/cursor-notify-proposal
```

Webhook aceita no máximo 1 MiB e 500 record refs, exige assinatura/token,
timestamp/replay protection e inbox idempotente. O adapter nunca grava evento,
Sheet ou proposta diretamente; ele produz observações.

### INT-06 — Model provider

```yaml
integration_id: model_provider
state: disabled_read_only
environments: [dev, test, beta, production]
capabilities:
  read: [language.interpret, tool.select, response.compose]
  write_declared_but_disabled: []
  write_enabled: []
data_families: [public_product, internal_sanitized, financial_minimized]
scope_resolution: server_side
oauth_scopes: []
secret_refs: [MODEL_PROVIDER_CREDENTIAL_REF]
egress_allowlist: [approved_model_registry]
webhook_allowlist: [none]
limits:
  reads_per_minute_per_family: 20
  writes_per_minute_per_family: 0
  request_timeout_seconds: 20
  max_attempts: 2
  max_payload_bytes: 262144
observation_source: { allowed: false, source_type: null, policy_version: null }
projection_receiver: { allowed: false, projection_types: [] }
external_effects: []
promotion_gate: NEXT-03/model-evaluation
```

O registry exige treinamento desabilitado, retenção máxima de 30 dias e região
declarada. O modelo não é source nem writer. Falha não aciona provider oculto.

### INT-07 — Audio transcription

```yaml
integration_id: audio_transcription
state: disabled_read_only
environments: [test, beta, production]
capabilities:
  read: [audio.transcribe]
  write_declared_but_disabled: []
  write_enabled: []
data_families: [user_supplied_audio, transient_transcript]
scope_resolution: server_side
oauth_scopes: []
secret_refs: [TRANSCRIPTION_PROVIDER_CREDENTIAL_REF]
egress_allowlist: [approved_transcription_registry]
webhook_allowlist: [none]
limits:
  reads_per_minute_per_family: 5
  writes_per_minute_per_family: 0
  request_timeout_seconds: 30
  max_attempts: 1
  max_payload_bytes: 10485760
observation_source: { allowed: true, source_type: user_message, policy_version: audio_input_v0 }
projection_receiver: { allowed: false, projection_types: [] }
external_effects: []
promotion_gate: NEXT-05/audio
```

Áudio máximo: 10 MiB e 5 minutos. Transcript reentra no mesmo gateway textual,
é apagado após 24 horas e nunca cria lógica financeira paralela.

### INT-08 — Dashboard v2 internal adapter

```yaml
integration_id: dashboard_v2_internal
state: disabled_read_only
environments: [test, beta, production]
capabilities:
  read: [claims.read, dashboard.snapshot]
  write_declared_but_disabled: []
  write_enabled: []
data_families: [financial_claims, coverage, public_labels]
scope_resolution: server_side
oauth_scopes: []
secret_refs: [DASHBOARD_SIGNING_REF]
egress_allowlist: [same_origin_only]
webhook_allowlist: [none]
limits:
  reads_per_minute_per_family: 120
  writes_per_minute_per_family: 0
  request_timeout_seconds: 5
  max_attempts: 1
  max_payload_bytes: 1048576
observation_source: { allowed: false, source_type: null, policy_version: null }
projection_receiver: { allowed: true, projection_types: [financial_claim_view] }
external_effects: []
promotion_gate: NEXT-05/dashboard-shadow
```

Admin não pode selecionar scope financeiro arbitrário. A origem é o Tool
Gateway/kernel, sem cálculo próprio ou assets terceiros.

### INT-09 — CSV/OFX local import

```yaml
integration_id: statement_file_import
state: disabled_read_only
environments: [test, beta, production]
capabilities:
  read: [csv.parse, ofx.parse]
  write_declared_but_disabled: [observations.prepare]
  write_enabled: []
data_families: [user_supplied_statement]
scope_resolution: server_side
oauth_scopes: []
secret_refs: []
egress_allowlist: [none]
webhook_allowlist: [none]
limits:
  reads_per_minute_per_family: 5
  writes_per_minute_per_family: 0
  request_timeout_seconds: 20
  max_attempts: 1
  max_payload_bytes: 5242880
observation_source: { allowed: true, source_type: import, policy_version: statement_import_v0 }
projection_receiver: { allowed: false, projection_types: [] }
external_effects: []
promotion_gate: NEXT-08/import-domain
```

Limite adicional: 10.000 registros por arquivo. PDF/imagem/OCR não pertencem a
este manifest e permanecem pós-MVP.

## 5. Testes negativos comuns

| ID | Tentativa | Resultado |
|---|---|---|
| IM-01 | modelo fornece family/account/card/source ID | ignorar/rejeitar; scope server-side |
| IM-02 | adapter disabled tenta write | bloquear antes do egress |
| IM-03 | origin fora da allowlist | bloquear e auditar metadado |
| IM-04 | OAuth com scope extra | rejeitar grant/promoção |
| IM-05 | segredo no log/erro | redigir e falhar teste |
| IM-06 | webhook inválido/replay | 401/409 e nenhum cursor/evento |
| IM-07 | retry após timeout ambíguo de write | `uncertain`, reconciliar |
| IM-08 | dado cross-family | bloquear antes do adapter |
| IM-09 | payload excede limite | rejeitar sem parse parcial |
| IM-10 | revogação | impedir novas chamadas e limpar refs |
| IM-11 | integração vira source sem policy | rejeitar observação |
| IM-12 | projeção tenta reentrar | rejeitar por origin/receipt |

## 6. Promoção e revisão

O registry inicial não autoriza chamadas reais. Cada adapter recebe novo
`manifest_version`, endpoints exatos e evidência de testes no gate indicado.
Mudança de scope, secret class, egress, webhook, data family, efeito ou source
policy é mudança material e exige nova revisão humana. Reduzir permissão pode
ser promovido imediatamente após testes; ampliar nunca é automático.
