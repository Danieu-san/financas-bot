# Coexistence and Single-Writer Contract v0

Estado: `FROZEN FOR NEXT-00`
Versão: `0.1.0`
Escopo: convivência entre legado, Next e qualquer worker futuro

## 1. Regra central

Para cada chave de ownership
`{environment, family_id, capability}`, exatamente um runtime pode possuir cada
uma destas autoridades operacionais:

- `write`;
- `notify`;
- `schedule`;
- `cursor`.

Leitura shadow pode ocorrer em mais de um runtime, desde que não altere cursor,
estado do usuário, outbox, proposta, projeção nem sistema externo. Uma sessão
WhatsApp única não substitui este contrato: a exclusão é por família,
capacidade e autoridade.

## 2. Capability e unidade de transferência

`capability` é uma operação ou domínio de efeito delimitado, por exemplo:
`transaction.write`, `open_finance.notify`, `open_finance.cursor`,
`reminder.schedule`, `calendar.write` ou `dashboard.project`.

Transferência global de “todo o bot” é proibida. Cada capability possui gate,
lease e rollback próprios. O owner de `write` não recebe implicitamente
`notify`, `schedule` ou `cursor`.

## 3. Lease v0

```yaml
schema_version: 0
lease_id: string
environment: enum                    # dev|test|beta|production
family_id: opaque_id
capability: string
authority: enum                      # write|notify|schedule|cursor
holder_runtime_id: string
epoch: integer                       # monotônico por ownership key
fencing_token: opaque_string
issued_at: datetime_utc
renewed_at: datetime_utc
expires_at: datetime_utc
status: enum                         # active|released|expired|revoked
previous_lease_id: string|null
transfer_reason: enum                # canary|cutover|rollback|recovery
policy_version: string
integrity_hash: string
```

Propriedades:

1. Existe no máximo um lease `active` não expirado por ownership key.
2. `epoch` só aumenta; nunca é reutilizado após rollback.
3. `fencing_token` é imprevisível, ligado ao lease/epoch e não aparece no
   modelo, logs públicos ou payload funcional.
4. Aquisição, renovação, revogação e transferência usam operação atômica/CAS.
5. Relógio e duração serão fixados no Quality Contract; expiração é avaliada
   server-side por fonte de tempo confiável.
6. Renovação não altera epoch; transferência ou reacquisição altera.

## 4. Protocolo de efeito cercado

Antes de qualquer efeito, o runtime deve:

1. carregar lease vigente da ownership key;
2. verificar holder, epoch, token e expiração;
3. registrar `operation_id`, idempotency key e epoch no write ledger;
4. executar precondition/CAS no destino quando suportado;
5. persistir receipt ligado ao mesmo epoch;
6. reconciliar resultado antes de notificar sucesso.

O adapter de efeito recebe um `FencedOperationEnvelope`:

```yaml
operation_id: string
idempotency_key: string
ownership_key: object
lease_id: string
epoch: integer
fencing_token_ref: opaque_ref
precondition_version: string|null
payload_hash: string
```

Epoch antigo, lease ausente, expirado, revogado ou pertencente a outro holder
falha fechado antes do efeito. Se o destino externo não suporta fencing nativo,
o gateway serializa pelo ledger local e faz reconciliação por idempotency
key/receipt; resultado ambíguo vira `uncertain`, nunca retry cego.

## 5. Máquinas de estado

Lease:

```text
absent -> active -> released
                 -> expired
                 -> revoked

released|expired|revoked -> active(epoch + 1)
```

Operação cercada:

```text
prepared -> claimed -> executing -> committed -> reconciled
                           |             |
                           v             v
                       uncertain <-------+
                           |
                           v
                    reconciled|failed
```

Somente `reconciled` autoriza receipt final e notificação de sucesso.
`uncertain` bloqueia nova operação com a mesma identidade econômica até
reconciliação.

## 6. Shadow, canário e produção

### Shadow

Permite somente leitura e comparação. É proibido:

- escrever em ledger/projeção externa;
- criar proposta visível ao usuário;
- avançar cursor compartilhado;
- inserir outbox ou enviar mensagem;
- executar Calendar/reminder;
- adquirir lease de efeito.

Artefatos shadow usam storage isolado e sintético/descartável.

### Canário

Exige allowlist de família, capability explícita, lease próprio, epoch vigente,
rollback testado e observabilidade. Não amplia autoridade por alias textual.

### Produção

O legado conserva ownership até a transferência atômica da capability. O Next
somente assume após gate aprovado. Durante cutover:

1. congelar novas claims no owner antigo;
2. drenar/reconciliar operações `pending` e `uncertain`;
3. registrar checkpoint de cursor e outbox;
4. revogar lease antigo;
5. emitir lease com epoch superior ao Next;
6. fazer prova canário da capability;
7. manter rollback por nova transferência, nunca restaurando epoch antigo.

## 7. Scheduler, cursor e notificações

- Scheduler precisa de lease próprio para criar execuções.
- Cada execução registra `schedule_instance_id` e epoch.
- Cursor é durável, monotônico por fonte/família/capability e só avança após
  persistência das observações correspondentes.
- Notificação usa outbox/delivery ledger com chave idempotente e lease de
  `notify`; retry não duplica entrega lógica.
- Leitura do cursor não concede autoridade para atualizá-lo.
- Mudança de owner transfere cursor por checkpoint validado, nunca por “última
  data” inferida da interface.

## 8. Falhas e recuperação

- Crash antes do efeito: outra instância só retoma após expiração/revogação e
  novo epoch; a operação anterior é reconciliada primeiro.
- Crash após efeito e antes do receipt: estado `uncertain`; consultar destino
  pela idempotency key antes de qualquer repetição.
- Partição/split-brain: somente maior epoch vigente pode progredir; menor epoch
  falha em toda fronteira local e externa disponível.
- Relógio divergente: validade é decidida pelo lease store, não pelo worker.
- Falha de notificação não desfaz efeito financeiro; receipt permanece e outbox
  tenta entrega idempotente.
- Falha de projeção não reexecuta o writer financeiro.

## 9. Segurança e privacidade

`family_id`, tokens e referências de lease são resolvidos server-side. O modelo
não escolhe runtime, family, capability owner, epoch ou cursor. Admin não ganha
acesso financeiro por controlar leases. Toda mudança de ownership gera evento
de auditoria sanitizado.

## 10. Testes obrigatórios

Fixtures sintéticas devem provar:

- duas instâncias tentando adquirir o mesmo lease: uma vence;
- stale worker após transferência: efeito rejeitado;
- retry com mesma idempotency key: um único efeito;
- crash antes e depois do efeito;
- destino externo retorna timeout após commit: `uncertain` e reconciliação;
- shadow não altera nenhum estado compartilhado;
- owners distintos para `write` e `notify` não usurpam autoridade;
- scheduler duplicado não cria duas execuções lógicas;
- cursor não avança antes de persistência e não retrocede no cutover;
- rollback emite epoch novo;
- operação manual e proativa concorrentes não reivindicam duas vezes a mesma
  identidade econômica;
- Calendar, reminders e Open Finance obedecem ao mesmo fencing.

Catálogo normativo mínimo desta bateria:

| ID | Propriedade causal | Fase da prova executável |
|---|---|---|
| SW-01 | duas instâncias disputam o mesmo owner e somente um lease fica ativo | NEXT-06 |
| SW-02 | stale epoch tenta escrever e falha antes do efeito | NEXT-06 |
| SW-03 | timeout após provável commit entra em `uncertain` e reconcilia | NEXT-06 |
| SW-04 | shadow tenta avançar cursor e é bloqueado | NEXT-06 |
| SW-05 | rollback emite epoch novo e não restaura autoridade antiga | NEXT-06 |

Esses cinco IDs são propriedades de state machine/fault injection. Nenhum caso
conversacional ou inspeção documental concede verde executável a eles.

## 11. Reaproveitamento permitido

Rollout policies fail-closed, write ledger, operation keys, receipts, outbox e
casos de restart/retry do legado podem ser portados atrás deste contrato. Flags
ambientais, aliases, singletons de processo e a existência de uma única sessão
WhatsApp não são prova de ownership e não podem ser portados como mecanismo de
exclusão.
