# Conversation and Proposal Contract v0

Estado: `FROZEN FOR NEXT-00`
Versão: `0.1.0`
Escopo: memória conversacional e qualquer operação com efeito

## 1. Princípio

Conversa auxilia entendimento; não concede autoridade. Toda confirmação aponta
para uma proposta imutável, entregue, vigente e pertencente ao ator, família,
sessão e operação corretos.

O protocolo obrigatório é:

```text
prepare -> preview -> confirm(proposal_id) -> commit -> receipt -> reconcile
```

Uma resposta “sim” nunca é um comando genérico de escrita.

## 2. SessionState v0

```yaml
schema_version: 0
session_id: string
session_version: integer             # monotônica; CAS em toda mutação
family_id: opaque_id
actor_id: opaque_id
channel: enum                        # whatsapp|isolated_test|dashboard
active_turn_id: string
turn_sequence: integer
subject_ref: opaque_ref|null
period: object|null
filters: object
resolved_entities: object            # apenas refs server-side
prior_question_ref: string|null
active_proposal_ids: [string]
evidence_refs: [string]
context_expires_at: datetime_utc
updated_at: datetime_utc
integrity_hash: string
```

Regras:

- Estado durável/versionado é a única memória operacional; memória de processo
  é cache descartável.
- Mensagens concorrentes atualizam a sessão por CAS. Conflito exige replanejar,
  não sobrescrever.
- IDs, permissões e escopo são fornecidos pelo servidor. Texto do usuário ou do
  modelo não pode alterá-los diretamente.
- Follow-up pode herdar somente dimensões registradas e ainda vigentes. Mudança
  explícita substitui a dimensão e incrementa `session_version`.
- Reinício restaura a sessão ou responde insuficiência; não adivinha contexto.

## 3. Proposal v0

```yaml
schema_version: 0
proposal_id: string
proposal_version: integer
proposal_hash: string
operation_kind: string
capability: string
family_id: opaque_id
actor_id: opaque_id
session_id: string
session_version_at_prepare: integer
turn_id: string
payload: object                      # normalizado e imutável
payload_hash: string
observation_refs:
  - observation_id: string
    source_version: string
    material_fingerprint: string
economic_identity_key: string|null
preview_template_version: string
preview_hash: string
created_at: datetime_utc
expires_at: datetime_utc
status: enum
supersedes_proposal_id: string|null
idempotency_key: string
operation_id: string|null
receipt_ref: string|null
revision: integer                    # CAS da proposta
```

O TTL padrão é 10 minutos a partir de `created_at`; o limite máximo é 30
minutos. Operações de maior risco podem usar TTL menor por policy versionada,
nunca maior. Esses valores só podem mudar por nova versão deste contrato antes
da bateria que os julga.

## 4. Estados e transições

```text
prepared -> presented -> confirmed -> committing -> committed -> reconciled
    |           |            |            |             |
    +->cancelled+->expired    +->rejected +->uncertain   +->uncertain
                +->superseded

uncertain -> reconciled|failed
```

Estados terminais: `reconciled`, `cancelled`, `expired`, `superseded`,
`rejected` e `failed`. `committed` não é conclusão até receipt/reconciliação.

Transições exigem compare-and-swap (CAS) de `revision`. Qualquer replay retorna o estado existente;
não cria nova operação.

## 5. Prepare e preview

`prepare`:

1. valida ator, família e capability server-side;
2. resolve identidades e observações vigentes;
3. calcula payload, economic identity e idempotency key deterministicamente;
4. fixa versões/fingerprints das observações;
5. cria `proposal_id`, hashes e TTL;
6. supersede proposta anterior incompatível na mesma operação/contexto;
7. persiste antes de gerar preview.

O preview é determinístico e inclui, conforme a operação:

- ação e efeito;
- pessoa/família;
- conta/cartão por rótulo público não ambíguo;
- valor/moeda e datas relevantes;
- categoria/subcategoria;
- fonte/evidence state e limitações materiais;
- matcher de regra quando a decisão será aplicada a equivalentes;
- identificador curto da proposta quando houver múltiplas opções.

Após entrega confirmada pelo outbox, o estado vira `presented` e registra
`preview_hash` entregue. Preview não entregue não pode ser confirmado.

## 6. Confirmação

Uma confirmação é válida somente se:

- o ator e a família são os mesmos;
- a sessão está vigente;
- a proposta está `presented`;
- TTL não expirou;
- `preview_hash` confirmado coincide com o entregue;
- nenhuma observação material mudou;
- a proposta não foi superseded, cancelada, confirmada ou usada;
- a capability possui owner/lease válido quando aplicável.

Resposta simples (`sim`, `confirmo`) só pode vincular-se automaticamente quando
existe exatamente uma proposta `presented`, não expirada, no mesmo canal,
sessão e ator. Com duas ou mais, o bot exige número/identificador explícito e
não escolhe por recência. Resposta atrasada de turno anterior é rejeitada.

`não` rejeita a proposta indicada; `cancelar` cancela o fluxo indicado. Uma
negação não confirma outra proposta pendente.

## 7. Commit, receipt e reconciliação

`commit` usa CAS para mover `confirmed -> committing`, revalida autorização,
lease, economic identity, source versions, payload e preview hashes, e então
executa o writer específico.

- A mesma `idempotency_key` sempre retorna a mesma operação lógica.
- Resultado confirmado gera receipt sanitizado e estado `committed`.
- Timeout/resultado ambíguo gera `uncertain`; retry de escrita é proibido até
  reconciliação.
- Reconciliação consulta a fonte/destino por operação/receipt e termina em
  `reconciled` ou `failed` com evidência.
- A notificação de sucesso ocorre somente após `reconciled` e usa delivery
  ledger idempotente.
- Falha de entrega do receipt não repete o efeito.

## 8. Observação alterada e supersession

Mudança material em valor, moeda, identidade de conta/cartão, tipo, estado de
liquidação, data financeira ou vínculo de compensação:

1. invalida a proposta anterior;
2. move-a para `superseded`;
3. exige novo `prepare`, novo hash e novo preview;
4. informa ao usuário a dimensão alterada sem expor dado interno.

Correção apenas de forma que não altere payload/effect pode gerar novamente a
mesma apresentação, conservando o hash semântico e registrando nova entrega.

## 9. Consultas e follow-up read-only

Consultas não criam proposta. A memória conserva refs de evidência, período,
time basis e filtros, mas o novo turno precisa revalidar coverage e autorização.
Follow-up nunca converte claim ou sugestão em escrita. Se faltar dimensão
material, o agente pergunta; não escolhe conta, cartão, pessoa ou source.

## 10. Regras aprendidas

Criar/alterar regra é uma operação própria com proposal/preview/confirm. A regra
aprovada pode afetar somente classificação e metadado reversível dentro da
whitelist. Ela nunca autoriza outra proposta, resolve identidade, muda valor,
promove evidence state ou dispensa confirmação futura.

## 11. Segurança e privacidade

- Propostas armazenam refs opacas; mensagens mostram apenas rótulos públicos
  necessários à decisão.
- `proposal_id` não é segredo nem autorização suficiente.
- O modelo pode sugerir intenção e campos públicos, mas não produzir hash,
  idempotency key, scope ou transição.
- Confirmação de outro usuário, família, sessão ou canal é rejeitada e auditada.
- Logs registram IDs técnicos hashados, estado, policy versions e motivo; não
  registram texto integral, payload financeiro ou telefone.

## 12. Testes obrigatórios

Fixtures sintéticas devem cobrir:

- “sim” com zero, uma e duas propostas ativas;
- confirmação atrasada após novo turno;
- confirmação após expiração;
- proposta superseded por mudança material;
- ator/família/sessão divergentes;
- preview hash divergente;
- confirmação duplicada e retry após restart;
- duas confirmações concorrentes: um único CAS vence;
- crash antes do efeito, após efeito e antes do receipt;
- `uncertain` reconciliado sem duplicação;
- preview não entregue;
- escrita manual concorrendo com proposta proativa;
- cancelamento, negação e receipt delivery duplicado;
- follow-up sem coverage suficiente não afirmar zero;
- regra aprendida não dispensar preview/confirm.

Catálogo normativo mínimo desta bateria:

| ID | Propriedade causal | Fase da prova executável |
|---|---|---|
| CP-01 | “sim” com duas propostas exige correlação inequívoca | NEXT-01 |
| CP-02 | preview não entregue torna a confirmação inválida | NEXT-06 |
| CP-03 | observação material alterada supersede a proposta e exige novo preview | NEXT-06 |
| CP-04 | duas confirmações concorrentes produzem um único vencedor CAS | NEXT-06 |
| CP-05 | restart após efeito sem receipt reconcilia sem duplicar | NEXT-06 |

CP-01 e CP-03 admitem guard conversacional antecipado, mas o verde causal
depende da máquina de estado indicada. CP-02, CP-04 e CP-05 são exclusivamente
executáveis.

## 13. Reaproveitamento permitido

Estados duráveis, payload cifrado, operação idempotente, receipt, reconciliação,
detecção de fingerprint alterado e testes de restart do legado podem ser
portados atrás deste contrato. Listas soltas de palavras de confirmação,
memória em singleton, escolha da proposta mais recente e fallbacks do
`messageHandler` não podem ser portados como autoridade.
