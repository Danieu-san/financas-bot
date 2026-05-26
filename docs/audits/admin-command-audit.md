# Admin Command Audit

Admin commands are handled in `src/handlers/messageHandler.js` by `handleAdminCommands()`. Access is restricted by `isAdminWithContext(senderId, activeUser)`, denied attempts are logged as `[admin] acesso_negado`, and privileged/risky outcomes are also recorded in the append-only AdminActionLog.

## AdminActionLog

`src/services/adminActionLogService.js` writes JSONL entries to `data/admin-actions.jsonl` by default.

- Disable only intentionally with `ADMIN_ACTION_LOG_ENABLED=false`.
- Override path with `ADMIN_ACTION_LOG_PATH`.
- Stores hashed actor/target refs plus a sanitized `target_hint`.
- Sanitizes WhatsApp IDs, e-mails, CPF-like values, UUIDs, OAuth params, Google secrets, tokens and Google document IDs.
- Manual admin messages record `message_length`, not body text.

## Command Matrix

| Command | Purpose | Risk | Log Event | Confirmation Needed Now? |
|---|---|---:|---|---|
| `admin ajuda` | Show available admin commands. | Low | `[admin] ajuda` | No |
| `admin listar usuarios` | List up to 30 users and status counts. | Medium: exposes WhatsApp IDs/statuses to admin chat. | `[admin] listar_usuarios` | No |
| `admin stats` | Show user counts by status. | Low | `[admin] stats` | No |
| `admin status <telefone>` | Inspect one user's lifecycle/profile/settings status. | Medium: exposes operational metadata. | `[admin] status` | No |
| `admin log <telefone>` | Show recent consent evidence summary. | Medium: audit metadata exposure. | `[admin] log` | No |
| `admin aprovar <telefone>` | Move a consented user to `APPROVED_AWAITING_GOOGLE`. | High: starts the Google connection gate for a user. | `[admin] confirmacao_pendente`, `[admin] confirmacao_recebida`, `[admin] aprovar`, AdminActionLog `approve_user` | Yes |
| `admin expirar pendentes` | Expire stale `PENDING` users. | Medium: lifecycle-changing, but limited to pending users. | `[admin] confirmacao_pendente`, `[admin] confirmacao_recebida`, `[admin] expirar_pendentes`, AdminActionLog `expire_pending_users` | Yes |
| `admin resetar onboarding <telefone>` | Clear onboarding completion and state. | Medium: user experience disruption. | `[admin] confirmacao_pendente`, `[admin] confirmacao_recebida`, `[admin] resetar_onboarding`, AdminActionLog `reset_onboarding` | Yes |
| `admin mensagem <telefone> <texto>` | Send manual operational message to a user. | Medium/High: user-facing communication. | `[admin] confirmacao_pendente`, `[admin] confirmacao_recebida`, `[admin] mensagem`, AdminActionLog `manual_message` | Yes |
| `admin ativar <telefone>` | Set user lifecycle to `ACTIVE`. | High: grants access. | `[admin] confirmacao_pendente`, `[admin] confirmacao_recebida`, `[admin] alterar_status` | Yes |
| `admin inativar <telefone>` | Set user lifecycle to `INACTIVE`. | High: blocks access. | `[admin] confirmacao_pendente`, `[admin] confirmacao_recebida`, `[admin] alterar_status` | Yes |
| `admin bloquear <telefone>` | Set user lifecycle to `BLOCKED`. | High: blocks for abuse/spam. | `[admin] confirmacao_pendente`, `[admin] confirmacao_recebida`, `[admin] alterar_status` | Yes |
| `admin deletar <telefone>` | Soft-delete a user (`DELETED`). | High: lifecycle/destructive semantics, historical data retained. | `[admin] confirmacao_pendente`, `[admin] confirmacao_recebida`, `[admin] alterar_status` | Yes |
| `admin convidar <telefone>` | Send pre-onboarding invitation to a phone number. | Medium/High: initiates user-facing communication. | `[admin] confirmacao_pendente`, `[admin] confirmacao_recebida`, `[admin] convidar`, AdminActionLog `invite_user` | Yes |
| `admin compartilhar planilha <dono> <membro>` | Link two active users to a shared financial spreadsheet and Drive permission. | High: changes financial data location and Drive access. | `[admin] confirmacao_pendente`, `[admin] confirmacao_recebida`, `[admin] compartilhar_planilha`, AdminActionLog `share_spreadsheet` | Yes |
| `admin remover compartilhamento <membro>` | Remove shared spreadsheet membership and revoke Drive permission when possible. | High: changes family financial access and Drive permission. | `[admin] confirmacao_pendente`, `[admin] confirmacao_recebida`, `[admin] remover_compartilhamento`, AdminActionLog `remove_spreadsheet_share` | Yes |

## Current Strengths

- All admin commands require admin authorization before execution.
- Lifecycle changes use soft status changes instead of physical deletion.
- Logs include actor context (`sender_id`, `actor_user_id`, `actor_name`) and target context where relevant.
- Manual messages log `message_length`, not message content.
- Risky admin commands now require a second WhatsApp message: `confirmar admin`.
- Pending confirmations live only in process memory and expire after 5 minutes; they are not persisted to `state_store.json`.
- Risky/admin-changing actions are mirrored to sanitized JSONL audit entries for easier review after PM2 log rotation.

## Current Gaps

- Admin responses include WhatsApp IDs in chat; this is acceptable for the current admin-only beta, but should be reviewed if admin group size grows.
- The AdminActionLog is local JSONL, not yet a managed immutable external store.

## Recommendation

Before adding many users or multiple admins, consider replacing local JSONL with an append-only managed audit store:

```text
AdminActionLog: actor, action, target, timestamp, result, non-sensitive metadata
```

Keep confirmation prompts concise and avoid echoing secrets or financial content.
