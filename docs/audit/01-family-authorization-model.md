# Modelo real de autorização familiar

Objeto: tree `363ef7fcbbeb18bbc3eb4810e0d4e9cce48755ae`.

## Princípios observados

O bot possui cinco identidades diferentes que não podem ser tratadas como
sinônimas:

1. remetente WhatsApp (`@c.us` ou `@lid`);
2. cadastro interno (`user_id`);
3. conta Google e seu token OAuth;
4. membro de um escopo familiar/planilha compartilhada;
5. titular de uma conexão Open Finance.

O nome de exibição é atributo de apresentação e entrada do usuário. Ele não é
um identificador autenticado.

## Ciclo de vida esperado e efetivo

| Estado | Mensagem comum | Admin antes do gate | Google OAuth | Scheduler | Dashboard novo |
| --- | --- | --- | --- | --- | --- |
| desconhecido | cria `PENDING`; não autoriza | deveria negar | não deveria existir | não | não |
| `PENDING` | termos/`ACEITO` | deveria negar | não | não | não |
| `PENDING_APPROVAL` | aguarda admin | deveria negar | não | não | não |
| `APPROVED_AWAITING_GOOGLE` | fornece link Google | somente admin real | sim | não | não |
| `ACTIVE` | autorizado, sujeito ao modo família | somente admin real | já conectado/reconexão controlada | sim | sim |
| `INACTIVE`/`BLOCKED` | negado | somente admin real | deveria ser revogado | não | token já emitido ainda funciona até expirar |
| `DELETED`/`EXPIRED` | negado | somente admin real | deveria ser revogado | não | token já emitido ainda funciona até expirar |

## Matriz de escopo

| Superfície | Pessoal | Familiar | Outro membro | Admin amplo |
| --- | --- | --- | --- | --- |
| perguntas financeiras | padrão | apenas IDs retornados por `getFinancialScopeUserIds` | exige membro autorizado e não ambíguo | bloqueado no Query Engine |
| dashboard v2 | apenas o `uid` do token | não agrega por parâmetro | não | não |
| dashboard v1 | apenas o `uid` por padrão | não | não | `Todos os usuários` somente com `adm=true` e flag temporária |
| importação de extrato | próprio ou candidato do vínculo familiar | seleção explícita | seleção explícita | não |
| planilha Google | própria ou compartilhamento persistido | conforme membership | conforme membership | não deveria ampliar por ser admin |
| Open Finance | política cifrada por alias/titular | visibilidade explícita | somente viewer autorizado | sem atalho admin |

## Controles demonstrados

- `resolveFinancialQueryScope` não concede `admin-support` e falha para membro
  desconhecido/ambíguo (`CODE`, `TEST`).
- Dashboard v2 rejeita qualquer parâmetro `user`; dashboard v1 restringe o
  parâmetro a admin mais flag específica (`CODE`, `TEST`).
- O modo familiar falha fechado quando habilitado com allowlist vazia
  (`CODE`, `TEST`).
- O preview Open Finance exige viewer WhatsApp cifrado e não infere autoria
  pela titularidade da conexão (`CODE`, `TEST`).
- A remoção explícita de compartilhamento tenta retirar primeiro a permissão no
  Drive e só então revoga a membership local (`CODE`, `TEST`).

## Achados

### AUTH-01 — P1 — privilégio admin derivado de nome controlável

Status posterior à auditoria: **RESOLVIDO em produção em 2026-07-18**. O commit
`7f61aaa` removeu a decisão por `display_name`; telefone e `@lid` do mesmo e
único admin lógico passaram a constar explicitamente em `ADMIN_IDS`. Os testes
provam que colisão de nome é negada e que apenas o `@lid` listado atravessa o
gate anterior ao onboarding. O deploy equivalente usa a tree
`943fe932184e37552e908339b4523879684f7a0a`; health, SQLite, WhatsApp, flags e
rollback do `.env` foram validados sanitizadamente. O texto abaixo preserva o
achado no objeto congelado da auditoria.

`src/utils/adminCheck.js:43-52` autoriza um remetente quando o seu
`display_name` coincide com o nome associado a um `ADMIN_IDS`. O nome inicial
vem de `notifyName`/`pushname` e o onboarding permite que o próprio usuário o
substitua (`src/services/userService.js:706-716` e
`src/handlers/onboardingHandler.js:203-212`).

O problema atravessa o gate: `handleAdminCommandBeforeAccess` encaminha o
cadastro ainda não autorizado para o mesmo verificador
(`src/handlers/messageHandler.js:8011-8017`). O teste em
`tests/unit.test.js:2506-2529` afirma que um `@lid` diferente com o nome do
admin deve ser admin, e `tests/unit.test.js:2548-2565` afirma que esse cadastro
pode executar comandos admin antes do acesso.

Impacto: um remetente não incluído em `ADMIN_IDS` pode obter comandos de
administração, inclusive os que alteram status, enviam mensagens e liberam
usuários. A confirmação em duas mensagens reduz erro acidental, mas não corrige
a identidade do ator.

Evidência: `CODE` + `TEST`. Menor correção futura: admin deve ser reconhecido
somente por identificador autenticado previamente vinculado; a resolução
`@lid` precisa de mapeamento explícito e não de nome.

### AUTH-02 — P1 — link OAuth sobrevive a bloqueio e pode reativar usuário

O state Google é assinado e expira, mas não possui nonce consumível. O callback
valida apenas assinatura/expiração, grava a conexão e depois chama uma rotina
que muda o status para `ACTIVE` sem exigir
`APPROVED_AWAITING_GOOGLE` (`src/services/googleOAuthService.js:142-187` e
`src/services/userSpreadsheetService.js:804-830`).

Impacto: um link emitido antes de `BLOCKED`, `INACTIVE`, `DELETED` ou `EXPIRED`
continua válido por até duas horas e pode reativar o cadastro. O mesmo state
pode iniciar mais de uma autorização enquanto não expira.

Evidência: `CODE`; não há teste de status revogado nem de consumo único
(`GAP`). Menor correção futura: state persistente de uso único, consumo atômico
no callback e revalidação do estado do usuário antes de trocar código ou gravar
tokens.

### AUTH-03 — P1 — mudança de status não revoga credenciais e compartilhamento

`inativar conta`, `excluir conta` e os comandos admin de status alteram apenas
a linha de usuário. O token OAuth permanece ativo no store e uma membership de
planilha compartilhada mantém sua permissão no Drive até o comando separado de
remoção de compartilhamento.

Impacto: bloquear o bot não encerra todos os caminhos de acesso já concedidos.
Um membro removido no cadastro pode continuar acessando diretamente uma
planilha familiar no Google Drive.

Evidência: `CODE`; nenhum teste prova cascata de revogação por mudança de status
(`GAP`). Menor correção futura: um lifecycle service único, transacional por
etapas, com revogação Google/Drive, auditoria e reconciliação de falhas.

### AUTH-04 — P2 — token de dashboard não consulta o status atual

As APIs validam assinatura e validade temporal do token, mas não reconsultam o
cadastro. Um token emitido antes de bloqueio/inativação permanece útil até o seu
TTL, normalmente 15 minutos e no máximo 30.

Evidência: `CODE`. Menor correção futura: versão/revogação de sessão ou consulta
leve ao status para superfícies financeiras.

## Exceção temporária conhecida

O seletor v1 `Todos os usuários` é uma exceção de beta protegida pela flag
`DASHBOARD_ADMIN_ALL_USERS_ENABLED`. Ela permanece incompatível com escala
multiusuário sem consentimento e modo de suporte auditado. A auditoria não a
classifica como defeito novo, mas mantém o lançamento multiusuário em `NO-GO`
enquanto a exceção existir.
