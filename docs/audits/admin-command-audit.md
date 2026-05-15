# Admin Command Audit

Admin commands are handled in `src/handlers/messageHandler.js` by `handleAdminCommands()`. Access is restricted by `isAdminWithContext(senderId, activeUser)`, and denied attempts are logged as `[admin] acesso_negado`.

## Command Matrix

| Command | Purpose | Risk | Log Event | Confirmation Needed Now? |
|---|---|---:|---|---|
| `admin ajuda` | Show available admin commands. | Low | `[admin] ajuda` | No |
| `admin listar usuarios` | List up to 30 users and status counts. | Medium: exposes WhatsApp IDs/statuses to admin chat. | `[admin] listar_usuarios` | No |
| `admin stats` | Show user counts by status. | Low | `[admin] stats` | No |
| `admin status <telefone>` | Inspect one user's lifecycle/profile/settings status. | Medium: exposes operational metadata. | `[admin] status` | No |
| `admin log <telefone>` | Show recent consent evidence summary. | Medium: audit metadata exposure. | `[admin] log` | No |
| `admin aprovar <telefone>` | Move a consented user to `APPROVED_AWAITING_GOOGLE`. | High: starts the Google connection gate for a user. | `[admin] aprovar` | Consider two-step confirmation before broad rollout |
| `admin expirar pendentes` | Expire stale `PENDING` users. | Medium: lifecycle-changing, but limited to pending users. | `[admin] expirar_pendentes` | No, safe enough for beta |
| `admin resetar onboarding <telefone>` | Clear onboarding completion and state. | Medium: user experience disruption. | `[admin] resetar_onboarding` | No for beta; reconsider at scale |
| `admin mensagem <telefone> <texto>` | Send manual operational message to a user. | Medium/High: user-facing communication. | `[admin] mensagem` | Not required now, but should be used carefully |
| `admin ativar <telefone>` | Set user lifecycle to `ACTIVE`. | High: grants access. | `[admin] alterar_status` | Consider two-step confirmation before broad rollout |
| `admin inativar <telefone>` | Set user lifecycle to `INACTIVE`. | High: blocks access. | `[admin] alterar_status` | Consider two-step confirmation before broad rollout |
| `admin bloquear <telefone>` | Set user lifecycle to `BLOCKED`. | High: blocks for abuse/spam. | `[admin] alterar_status` | Consider two-step confirmation before broad rollout |
| `admin deletar <telefone>` | Soft-delete a user (`DELETED`). | High: lifecycle/destructive semantics, historical data retained. | `[admin] alterar_status` | Recommended before non-beta users |

## Current Strengths

- All admin commands require admin authorization before execution.
- Lifecycle changes use soft status changes instead of physical deletion.
- Logs include actor context (`sender_id`, `actor_user_id`, `actor_name`) and target context where relevant.
- Manual messages log `message_length`, not message content.

## Current Gaps

- High-risk lifecycle commands execute immediately after one message.
- Admin responses include WhatsApp IDs in chat; this is acceptable for the current admin-only beta, but should be reviewed if admin group size grows.
- There is no immutable AdminActionLog sheet yet; PM2 logs are the current audit trail.

## Recommendation

Before adding many users or multiple admins, add a confirmation state for high-risk commands:

```text
admin deletar 5521...
Bot: Confirme com: CONFIRMAR DELETAR 5521...
```

Also consider an append-only `AdminActionLog` sheet with command, actor, target, timestamp, result, and non-sensitive metadata.
