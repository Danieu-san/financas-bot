# P5 - manifesto de entry points, sinks e prova negativa Google

Data: 2026-07-18
Escopo: tree que contém este manifesto; o código de produto não foi alterado
desde `2b6d1b6ba12292fc744a21bec764d3ba0f0117a1`.
Regra: caracterização local e estática somente. Sem produção, rede, Google,
WhatsApp, credenciais ou dados reais.

## Resultado estático

- Não existe serviço, export, rota, comando, job ou startup hook chamado
  `revokeOAuthConnection` ou `deleteOAuthConnection`.
- Não existe `DELETE FROM oauth_connections`.
- Não existe writer que marque `oauth_connections.revoked_at` com data ou
  outro valor de revogação. `saveOAuthConnection` escreve/limpa esse campo
  para string vazia; `getOAuthConnection` apenas filtra registros revogados.
- O writer operacional de `revoked_at` encontrado atua somente em
  `shared_spreadsheet_members`, por meio de
  `revokeSharedSpreadsheetMembership`.
- Não existe reconciler, journal, claim, resume, recovery worker ou startup
  hook específico da conclusão Google.
- A remoção de compartilhamento familiar e a conexão Google individual são
  domínios separados. Isso é esperado e não é achado adverso.

## Entry points alcançáveis

| Entry point | Arquivo | Encadeamento real | Cenário anterior |
|---|---|---|---|
| Callback HTTP Google | `src/services/dashboardServer.js:1003` | rota -> `completeGoogleOAuthCallback` | OAuth/status, causalidade e replay HTTP |
| Callback OAuth | `src/services/googleOAuthService.js:142` | verifica state -> troca code -> conta -> `saveOAuthConnection` -> usuário -> conclusão | OAuth/status e replay |
| Conclusão Google | `src/services/userSpreadsheetService.js:804` | conexão -> criar/reusar planilha -> template -> metadados -> `ACTIVE` | causalidade, concorrência e corrida com inativação |
| Lifecycle próprio | `src/handlers/messageHandler.js:9046` | `handleMessage` -> `handleAccountLifecycleCommands` -> `updateUserStatus` | revogação/recuperação |
| Admin antes do gate de acesso | `src/handlers/messageHandler.js:8989` | `handleMessage` -> `handleAdminCommandBeforeAccess` -> autorização admin | AUTH-01 e prova negativa |
| Admin altera lifecycle | `src/handlers/messageHandler.js:7982` | dispatcher admin -> `updateUserStatusByWhatsAppId` | prova negativa |
| Admin remove compartilhamento | `src/handlers/messageHandler.js:7709` e `:7739` | permissão Drive -> `revokeSharedSpreadsheetMembership` | revogação/recuperação |
| Worker/job/startup Google | ausente | nenhuma referência a conclusão, revogação ou recovery Google em `src/jobs`/`index.js` | busca negativa |

`completeGoogleConnectionForUser` é uma fronteira de serviço interna; na
aplicação, seu caller de conexão é o callback OAuth. Os harnesses também a
invocam diretamente para controlar interleavings sintéticos.

## Sinks e writers

| Sink/writer | Arquivo | Callers encontrados | Entry point | Cobertura |
|---|---|---|---|---|
| Troca de code | `src/services/googleOAuthService.js:153` | callback OAuth | rota callback | OAuth/status e replay |
| Lookup da conta Google | `src/services/googleOAuthService.js:160` | callback OAuth | rota callback | OAuth/status e causalidade HTTP |
| `saveOAuthConnection` | `src/services/oauthTokenStore.js:162` | `googleOAuthService.js:163` | rota callback | OAuth/status e replay |
| Limpeza de `oauth_connections.revoked_at` | `src/services/oauthTokenStore.js:173-186` | `saveOAuthConnection` | rota callback | classificado; não é revogação |
| `updateOAuthConnectionMetadata` | `src/services/oauthTokenStore.js:213` | `userSpreadsheetService.js:819` | conclusão Google | causalidade e concorrência |
| Writer de revogação OAuth individual | ausente | nenhum | nenhum | busca negativa |
| Criação/aplicação de planilha | `src/services/userSpreadsheetService.js:813-822` | conclusão Google | rota callback | causalidade e concorrência |
| `updateUserStatus` | `src/services/userService.js:622` | lifecycle próprio, aprovação/negação e conclusão Google | mensagem/callback | OAuth/status, causalidade e revogação |
| `updateUserStatusByWhatsAppId` | `src/services/userService.js:638` | dispatcher admin `messageHandler.js:7982` | mensagem admin | prova negativa |
| `revokeSpreadsheetPermission` (remoção de permissão Drive) | `src/services/google.js:609` | `messageHandler.js:7709` | remover compartilhamento | revogação/recuperação |
| `shared_spreadsheet_members.revoked_at` | `src/services/oauthTokenStore.js:303-318` | `messageHandler.js:7739` | remover compartilhamento | revogação/recuperação |
| Resposta de sucesso OAuth | `src/services/dashboardServer.js:1011-1016` | rota callback | HTTP | causalidade HTTP e replay |
| Auditoria admin de sucesso | `src/handlers/messageHandler.js:7994-8001` e comandos equivalentes | dispatcher admin autorizado | mensagem admin | revogação; prova negativa exige zero sucesso |

## Buscas negativas reproduzíveis

Executadas sobre `src` e `index.js`, incluindo exports, imports, chamadas e SQL
literal:

```text
rg -n -i "revokeOAuthConnection|deleteOAuthConnection" src index.js
resultado: zero

rg -n -i "DELETE\s+FROM\s+oauth_connections" src index.js
resultado: zero

rg -n -i "oauth_connections.*revoked_at\s*=|revoked_at\s*=.*oauth_connections" src index.js
resultado: zero

rg -n -i "google.{0,40}(recovery|recover|reconcile|journal|claim|resume)|(?:recovery|recover|reconcile|journal|claim|resume).{0,40}google|oauth.{0,40}(recovery|recover|reconcile|journal|claim|resume)|(?:recovery|recover|reconcile|journal|claim|resume).{0,40}oauth" src index.js
resultado: zero
```

A inspeção dos templates SQL de `oauthTokenStore.js` classifica a aparição
de `revoked_at` em `oauth_connections`: criação da coluna, insert/upsert que
limpa o valor e filtro de leitura. Nenhuma aparição marca revogação.

## Controles negativos dinâmicos

O harness `tests/auditGoogleNegativeProof.test.js` deve provar:

1. state assinado para A, com identidade alterada para B sem nova assinatura:
   rota HTTP, callback, verificação e erro reais; todos os sinks posteriores
   permanecem zero e snapshots A/B ficam idênticos;
2. usuário ACTIVE não admin: resolução real do remetente e dispatcher real
   anterior ao gate; comando admin rejeitado, somente auditoria `denied`, sem
   mutação de lifecycle, OAuth, membership, Drive ou planilha.

## Critério de fechamento

Se o manifesto permanecer completo e os dois controles passarem, a
caracterização da prova negativa pode receber `GO` e o P5 pode ser encerrado
tecnicamente. A conformidade geral permanece `NO-GO`: esses controles não
anulam os achados anteriores.
