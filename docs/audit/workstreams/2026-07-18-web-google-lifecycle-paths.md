# Workstream exaustivo — startup, web/dashboard, Google e lifecycle

Data da inspeção: 2026-07-18
Commit de referência: `0737d7ccbdd309e4c39f503ca781e89d5aac7bc3`
Escopo: `index.js`; servidor e contratos do dashboard; tokens do dashboard; OAuth Google; armazenamento OAuth e compartilhamento; Sheets, Drive e Calendar; lifecycle, consentimento, onboarding, modo familiar e administração; jobs e scheduler.
Restrições: nenhuma conexão com produção, Google real, WhatsApp real, EC2, rede, segredos ou dados financeiros reais. Nenhum código de produto foi alterado.

## 1. Veredito desta frente

- **Caracterização:** `GO`. Os entrypoints, guards, branches, persistências, efeitos externos, respostas e fallbacks desta frente estão mapeados abaixo, com execução local para os controles existentes e inspeção estática para os resíduos.
- **Conformidade:** `NO-GO`. Os testes verdes confirmam tanto controles desejados quanto comportamentos incompatíveis com um fechamento geral: callback OAuth sem gate de status e reutilizável, ausência de revogação OAuth individual, conclusão Google não atômica, corrida que cria planilhas órfãs, fallback silencioso da planilha pessoal para a central, desvios de lifecycle por comandos admin, jobs misturando dados centrais e pessoais, ausência de idempotência de entrega agendada e exposição de identificadores internos em coleções do dashboard v1 e em linhas cruas consumidas pelo v2.
- **Fechamento exaustivo geral:** não autorizado por esta frente. O relatório é inventário e prova de caracterização; não implementa nem autoriza correções, deploy ou acesso real.

## 2. Legenda de força da evidência

- **R — controle real local:** a função/rota/dispatcher de produto foi executada; Google, WhatsApp, disco sensível ou usuário foram substituídos apenas nas bordas.
- **D — double dirigido:** o comportamento foi exercitado majoritariamente com stubs/mocks; prova contrato local, não o efeito externo real.
- **I — inferência estática:** conclusão derivada do caminho de código e de seus callers; não há execução específica que prove o branch.
- **E — efeito externo real:** não executado nesta auditoria. Nenhuma linha abaixo recebe `E`.

## 3. Evidência executada

### 3.1 Bateria web, Google, lifecycle e scheduler

```powershell
node --test tests/dashboardAuthSecurity.test.js tests/dashboardApiContracts.test.js tests/dashboardV2SummaryService.test.js tests/googleOAuthService.test.js tests/oauthRoutes.test.js tests/userLifecycle.test.js tests/onboardingState.test.js tests/familyModeService.test.js tests/userSpreadsheetService.test.js tests/schedulerJobs.test.js tests/auditOAuthStatusPrecedence.test.js tests/auditGoogleConnectionCausality.test.js tests/auditGoogleConnectionIdempotency.test.js tests/auditGoogleRevocationRecovery.test.js tests/auditGoogleNegativeProof.test.js
```

Resultado: `122` testes/subtestes aprovados, `0` falhas, `0` cancelados, `0` ignorados.

### 3.2 Suíte unitária transversal

```powershell
node --test tests/unit.test.js
```

Resultado: `193` testes aprovados, `0` falhas, `0` cancelados, `0` ignorados.

Total desta frente: `315` testes aprovados. Esse total não altera o `NO-GO`: alguns testes de auditoria foram escritos justamente para comprovar a existência dos comportamentos não conformes.

## 4. Mapa exaustivo de startup

Entrypoint real: `index.js`, que registra reloads de configuração em import-time e chama `startBot()` sem exportá-lo.

| Caminho | Branches/guards | Sinks e resposta | Evidência | Lacuna/prova residual |
|---|---|---|---|---|
| Variáveis essenciais ausentes | falta qualquer um de `SPREADSHEET_ID`, `GEMINI_API_KEY`, `GOOGLE_REFRESH_TOKEN`, `ADMIN_IDS` | `console.error` e `process.exit(1)` | I | Não há teste isolado de `startBot`; o requisito central legado continua obrigatório mesmo com OAuth individual. |
| Bootstrap Google central | `authorizeGoogle()` lê credentials, cria clientes e usa refresh token | memória do processo; log de sucesso; erro sobe | I + D nos wrappers | Nenhum teste de boot valida arquivo ausente, JSON inválido, credencial revogada ou latência/timeout real. |
| Estrutura da planilha central | `ensureSpreadsheetStructure()` cria abas ausentes e reaplica cabeçalhos/formatação | Sheets central | I | A função captura até o erro “fatal” e retorna; o boot pode continuar dizendo que Google foi configurado sem estrutura íntegra. |
| Leitura de IDs das abas | `getSheetIds()` resolve target e lê metadata | objeto em memória | I | Também captura erro e retorna `undefined`; o retorno é ignorado no boot. |
| Read model local | `initializeReadModel()` carrega JSON, inicializa SQLite e copia snapshot | `data/read_model.json`, SQLite/memória | D em suítes próprias; I no boot | Exceção em `initializeReadModel()` é fatal; só a sincronização seguinte tem fallback. |
| Sync inicial forçado | `syncReadModelIfNeeded({force:true})` | Sheets, JSON, SQLite, dashboard visual central | D | Erro é avisado e o legado permanece; leituras de Sheets que retornam `[]` podem produzir snapshot vazio sem lançar. |
| Backfill opcional | somente `AUTO_BACKFILL_USER_ID_ON_STARTUP=true`; fallback de usuário único também depende de flag | batch update e updates individuais no Sheets | R/D em `tests/unit.test.js` para regras; I no boot | Falha sobe e derruba o boot; contagem `updated` é planejada, não recibo independente de cada célula. |
| Validação de `user_id` | padrão ligado, salvo `VALIDATE_USER_ID_ON_STARTUP=false`; cartões seguem `off/canary/on` | apenas relatório/log | R/D em unitários | `readDataFromSheet()` transforma falha em lista vazia, podendo registrar “sem pendências” por ausência de fonte. |
| Inicialização WhatsApp | `initializeWhatsAppClient()` pode retornar falsy | cliente/sessão WhatsApp | fora desta frente | Se retornar falsy, sai silenciosamente antes de dashboard/scheduler. |
| Dashboard | só começa após cliente WhatsApp truthy | socket HTTP | R nas rotas; I no encadeamento do boot | Erro de `listen` não tem handler explícito; porta ocupada e bind negado não têm prova de recuperação. |
| Evento `ready` | listener `once`; só então scheduler, canary Open Finance e unread backfill | crons, runtime, mensagens | fora/dentro conforme serviço | Scheduler nunca inicia se `ready` não ocorrer. Falha síncrona no callback não tem contenção local. |
| Mensagens | `client.on('message', handleMessage)` | dispatcher WhatsApp | outra frente | O handler é passado diretamente; rejeições dependem do tratamento global. |
| Falha no `try` principal | qualquer exceção não capturada antes da instalação normal | `process.exit(1)` | I | Não há compensação para efeitos já persistidos no boot. |
| `unhandledRejection` | qualquer Promise rejeitada fora de `await/catch` | apenas `console.error` | I | O processo não encerra nem coloca saúde em degradado; pode continuar parcialmente funcional. |

## 5. Dashboard HTTP/API

Entrypoint real: `startDashboardServer()` em `src/services/dashboardServer.js`.

### 5.1 Rotas e branches

| Rota | Guards/escopo | Fonte/sink | Resposta/auditoria | Evidência | Lacuna |
|---|---|---|---|---|---|
| `GET /dashboard` | nenhuma autenticação na página estática | HTML v1 | `200`, headers no-store/CSP; métrica de page view | R, `dashboardApiContracts` | Sem token, a página abre mas a API falha no cliente; comportamento intencional. |
| `GET /dashboard/v2` | `DASHBOARD_V2_ENABLED` | HTML v2 | `200` ou `404`; métrica | R | Rollback provado localmente. |
| `GET /dashboard/health` | sem token | estado `isSqliteReady()` | `200 {ok, sqlite}` | I + checklist | Não verifica Google, WhatsApp, freshness do read model ou scheduler; pode declarar `ok` em serviço degradado. |
| `GET /oauth/google/start` | state assinado, provider, userId e expiração | geração de URL Google | `302`; erro vira HTML `400` seguro | R com OAuth client double | Sem consumo/nonce; mesmo state pode iniciar mais de uma autorização. |
| `GET /oauth/google/callback` | exige `code` e state válido | token exchange, SQLite OAuth, Sheets, Users, WhatsApp | `200` depois dos efeitos; qualquer erro vira HTML `400`; métrica/log | R nas funções reais com bordas dobradas | Status do usuário não é guard; replay/concorrência e parcialidade detalhados na seção 7. |
| `GET /dashboard/api/summary` | token; v1 permite próprio ou admin cross-user apenas com flag | planilha pessoal se próprio; senão SQLite/memória | `200`, `401`, `403` ou `500`; access log + telemetria | R | Falha de leitura pessoal pode se transformar em zeros; coleções v1 não são sanitizadas globalmente. |
| `GET /dashboard/api/v2/summary` | flag v2; token; rejeita qualquer parâmetro `user` | snapshot pessoal/fallback + seis query tools | contrato em blocos; `401/403/404/500` | R/D | Sanitização por chave não remove identificadores que estejam em arrays posicionais. |
| `GET /dashboard/api/users` | token; admin deriva do claim; flag controla opções cross-user | `getAllUsers()` | próprio para comum; ativos para admin/flag | R | Claim admin não é revalidado contra `ADMIN_IDS`; cache de Users pode estar obsoleto. |
| `GET /dashboard/api/kpis` | token + `getDashboardDataUserId` | pessoal, SQLite ou memória | contrato estável | R | Admin com flag pode fornecer qualquer ID, não apenas opção ativa listada. |
| `GET /dashboard/api/cashflow` | idem | idem | contrato estável | R | Mesma lacuna de arbitrary ID e ausência-vira-vazio. |
| `GET /dashboard/api/debts` | idem | pessoal, SQLite ou memória | lista | R/D | Planilha pessoal entrega linhas cruas com `user_id` posicional. |
| `GET /dashboard/api/goals` | idem | pessoal, SQLite ou memória | lista | R/D | Snapshot pessoal v1 inclui propriedade `user_id`. |
| `GET /dashboard/api/alerts` | idem | pessoal/SQLite; memória cria só saldo negativo | lista | R | Contratos divergem por fonte; vazio pode significar indisponibilidade. |
| outro método/rota | nenhum branch correspondente | nenhum | `404` JSON | I | Não há `405`; sem limitação de taxa ou timeout por requisição no servidor. |

Antes de cada `/dashboard/api/*`, `recordDashboardDurableRequest()` registra telemetria sanitizada. O writer trata suas próprias falhas e não deve bloquear a rota. `recordDashboardAccessEvent()` também captura falhas e retorna `null`, portanto disponibilidade é preservada ao custo de auditoria best-effort.

### 5.2 Token e sessão do dashboard

Fluxo: usuário `ACTIVE` e admitido pelo modo familiar passa onboarding, envia `dashboard`, recebe token HMAC curto no fragmento; a página move o token para `sessionStorage`, remove o fragmento e chama a API com `?token=`.

Controles comprovados: segredo explícito em modo público/produção, HMAC, comparação timing-safe, TTL mínimo/máximo, adulteração e segredo diferente rejeitados, token fora do query string do link inicial, fallback v2 para v1 e headers de privacidade.

Resíduos:

1. A implementação exige segredo presente, mas não impõe comprimento/entropia mínimos ao `DASHBOARD_TOKEN_SECRET`.
2. O verifier não valida header/algoritmo, `iat`, tipo de `adm` ou expiração máxima contida no payload; a assinatura impede alteração externa, mas não há hardening de claims.
3. `exp < now`, e não `exp <= now`, deixa o token aceito no segundo exato de expiração.
4. Não há `jti`, store de sessão ou revogação. Token continua válido até expirar após conta `INACTIVE/BLOCKED/DELETED`, remoção do modo familiar, mudança de compartilhamento ou remoção do admin de `ADMIN_IDS`.
5. O claim `adm` é congelado na emissão e a API não reconsulta `ADMIN_IDS` nem status do usuário.
6. Em v1, quando `DASHBOARD_ADMIN_ALL_USERS_ENABLED=true`, um token admin pode pedir `user=all` ou qualquer string; o seletor lista só ativos, mas a API não limita o valor à lista.
7. A exceção cross-user continua expressamente temporária pelo `ADR-002`; não é compatível com escala multiusuário.
8. O token passa na query da API, podendo aparecer em logs de proxy fora do sanitizador da aplicação. Isso não foi verificado por ausência de infraestrutura real.

### 5.3 Privacidade e semântica de ausência

- `decorateDashboardSummary()` apenas adiciona critérios; não sanitiza o v1.
- `getUserSheetDashboardData()` retorna metas com `user_id` e dívidas como arrays cruas cujo último campo é `user_id`. Logo, o v1 expõe identificadores internos ao dono do token; o v2 remove chaves `user_id` em objetos, mas não reconhece o último valor de uma linha posicional. **Inferência estática reproduzível, sem teste específico do payload pessoal cru.**
- Todas as nove leituras da planilha pessoal usam `readDataFromSheet()`, que converte qualquer erro final em `[]`. O dashboard então calcula totais `0`, listas vazias e `source: personal_sheet`; a fonte ausente pode ser apresentada como ausência de movimentação.
- Os testes do v2 comprovam `null/unavailable` quando os query tools falham, mas não quando o snapshot já foi preenchido com zeros por falha de Sheets.

## 6. Resolução de escopo Google e operações comuns

### 6.1 Seleção de credencial e planilha

`resolveSpreadsheetTarget()`:

1. Obtém userId do `AsyncLocalStorage` ou options.
2. Para abas financeiras elegíveis, consulta membership; membro usa conexão do dono, dono usa a própria.
3. Se houver spreadsheetId e OAuth client, retorna planilha pessoal/compartilhada.
4. **Qualquer erro** de SQLite, decrypt, chave, tokens ou construção é capturado; o código avisa e cai na planilha central.
5. Sem target pessoal, autoriza Google central e devolve `SPREADSHEET_ID`.

Essa política preserva disponibilidade, mas não é fail-closed. Um usuário `ACTIVE` sem conexão utilizável — inclusive ativado manualmente por admin — pode ler/escrever no legado central. Não há `requireUserScoped` geral para mutações; apenas callers pontuais exigem planilha pessoal em leituras.

`resolveCalendarTarget()` é semelhante, mas não usa membership: cada usuário usa seu Calendar; em erro também cai no Calendar central. Eventos centrais carregam `financas_bot_user_id` e são filtrados por esse campo.

### 6.2 Retry, cache, replay e erro incerto

| Operação | Caminho normal | Retry/replay | Erro/resposta | Evidência |
|---|---|---|---|---|
| Autorização central | credentials + refresh token, clientes Sheets/Tasks/Calendar | `authInFlight` coalesce; erro auth em operação força uma reautorização | erro sobe | D/unit; sem Google real |
| Operação user-scoped | OAuth salvo e googleapis | retry transitório 429/5xx; template repair em range ausente | não há reautorização/lifecycle recovery em 401/invalid_grant | D + I |
| Leitura Sheets | cache TTL + coalescing in-flight | retry padrão | após falha retorna `[]`; missing opcional só muda log | R/D |
| Append | valida `user_id`; mapeia aba/linha; escreve | retry não idempotente desligado por padrão; write ledger deduplica, reconcilia último row ou bloqueia incerto | marca committed/uncertain/failed quando há operationKey; sem key, falha não tem proteção durável | R/D unit |
| Update | escreve uma linha | ledger replay; reconcilia conteúdo; retry só explicitamente permitido quando ledger existe | incerto é bloqueado; erro público genérico | R/D unit |
| Batch values update | várias ranges | retry padrão | não usa write ledger próprio; erro sobe | I/D indireta |
| Delete rows | resolve IDs, ordena de baixo para cima | retry remoto desligado; ledger deduplica ou bloqueia pending/uncertain | retorna `{success:false}` em falha | R/D unit |
| Cache | leitura clonada | append/update/batch/delete invalidam por spreadsheetId | cache in-flight também removido | R/D unit |
| Template repair | só user-scoped, uma tentativa por `userId:spreadsheetId` por processo | reaplica template e repete operação | falha logada; chave fica no Set e não tenta novamente no processo | I/D parcial |
| Projeção canônica shadow | após append committed/replayed | safe wrapper | falha não desfaz Sheets; apenas warning | outra frente |

### 6.3 Drive

- Compartilhar valida dono, spreadsheetId e formato de e-mail; cria permissão `writer` com notificação. Em `409`, procura permissão existente por e-mail. Retriable 429/5xx.
- Revogar exige permissionId; `404` vira `false` idempotente; outros erros sobem.
- O escopo OAuth é `drive.file`, não acesso amplo ao Drive.
- A permissão Drive e a tabela `shared_spreadsheet_members` não participam de transação/compensação comum.

### 6.4 Calendar

- Criação exige `userId`, converte horário, fixa São Paulo, grava propriedades privadas e recorrência opcional.
- Calendar pessoal chama `events.insert/list` diretamente, sem wrapper de retry/reauth; central usa o wrapper.
- Leitura de qualquer erro retorna `[]`, indistinguível de agenda vazia.
- Limpeza de teste só aceita prefixo exato `TESTE_APAGAR_`, data-alvo, dono e source WhatsApp; é idempotente e provada localmente.
- Não houve Calendar real; timezones, filtros e payloads foram testados com doubles.

### 6.5 Renderização e bootstrap central

- `ensureSpreadsheetStructure()` cria e formata estrutura central, mas engole falha final.
- `renderVisualDashboard()` e `syncDashboardForUser()` escrevem o dashboard central via cliente legado; não são operações da planilha pessoal do usuário.
- `getSheetIds()` engole falha e retorna indefinido.
- Não existe timeout de aplicação; o tempo máximo depende do client Google, e retries podem esperar `GOOGLE_API_RETRY_DELAY_MS` por tentativa.

## 7. OAuth individual e conclusão da planilha

### 7.1 State e autorização

- State contém provider, userId, `iat` e `exp`; HMAC e timing-safe protegem integridade. TTL mínimo é 300s, mas não há teto.
- `/start` rejeita state inválido antes de construir o OAuth client.
- Escopos: `openid`, `email`, `drive.file`, `calendar.events.owned`.
- State não tem nonce persistido nem consumo único.

### 7.2 Callback e ordem causal real

Ordem: validar state → validar code → trocar tokens → setCredentials → tentar obter conta → `saveOAuthConnection()` → buscar usuário → `completeGoogleConnectionForUser()` → criar/reaplicar template → salvar spreadsheetId → `updateUserStatus(ACTIVE)` → notificar WhatsApp → responder HTTP.

Provas locais fortes:

- State adulterado para antes de todos os sinks (`R` com rota real e tripwires).
- State expirado é rejeitado.
- Qualquer status atual (`ACTIVE`, `INACTIVE`, `BLOCKED`, `DELETED` e outros testados) chega à conclusão; inexistente salva credenciais antes de falhar.
- Falha depois de salvar credenciais preserva a conexão.
- Falha antes do commit da planilha não muda metadata/status.
- Falha de metadata depois da criação deixa planilha órfã.
- Falha de status deixa planilha e metadata persistidas, usuário ainda aguardando.
- Falha de resposta ocorre depois de OAuth, planilha, metadata e `ACTIVE` comprometidos.
- Duas conclusões simultâneas criam duas planilhas; última metadata vence e a perdedora fica órfã.
- Replay exato repete troca de token, sobrescreve conexão, reaplica template e repete lifecycle.

### 7.3 Revogação e recovery

- Não existe writer de revogação OAuth individual no tree auditado (`revoked_at` existe, mas só é zerado/consultado).
- `INACTIVE` e `DELETED` não revogam tokens nem removem planilha/Calendar.
- Remoção familiar revoga apenas permissão Drive e membership; OAuth das duas pessoas permanece.
- Conclusão pausada pode reativar para `ACTIVE` uma conta inativada durante o fluxo.
- Em token individual inválido, operações user-scoped não mudam lifecycle para aguardando reconexão nem emitem link de recovery; podem cair no central durante resolução ou apenas falhar depois.

Veredito OAuth: caracterização `GO`; conformidade `NO-GO`.

## 8. Lifecycle, consentimento, onboarding e modo familiar

### 8.1 Máquina de estados persistente

| Estado | Entrada/guard | Saída normal | Efeitos | Evidência/lacuna |
|---|---|---|---|---|
| usuário ausente | WhatsApp sender não encontrado | cria `PENDING`, envia termos | append Users | R/D; concorrência sem lock pode criar duplicados. |
| `PENDING` | `ACEITO` | `PENDING_APPROVAL` | append ConsentLog, update Users, notifica admins | R/D; dois commits sem transação; retry pode duplicar consentimento. |
| `EXPIRED` | `ACEITO` | `PENDING_APPROVAL` | idem | R/D |
| `PENDING_APPROVAL` | qualquer mensagem | continua bloqueado | resposta/silêncio por cooldown | R/D |
| `APPROVED_AWAITING_GOOGLE` | mensagem comum | link Google | nenhum dado financeiro | R/D; callback não revalida esse estado. |
| `ACTIVE`, termos antigos | somente `ACEITO` | continua `ACTIVE` | novo ConsentLog + update | R/D; dois commits não atômicos. |
| `ACTIVE`, termos atuais | acesso normal | modo familiar, contexto pessoal | cache/handlers | R/D |
| `INACTIVE/DELETED/BLOCKED` | mensagem comum | bloqueado | resposta legal ou gate | R/D; OAuth e token dashboard existentes permanecem. |
| estado desconhecido | não `ACTIVE` | bloqueado genérico | nenhum | I |

`getAllUsers()` usa cache de 30s. Se a leitura crítica continuar vazia após retries, retorna cache previamente carregado; uma decisão antiga `ACTIVE` pode continuar sendo usada durante indisponibilidade da fonte. Em duplicidade de whatsapp_id, a seleção prefere qualquer linha `ACTIVE` antes de `BLOCKED/DELETED`, sem ordenar por `updated_at`; isso é uma lacuna de integridade/acesso.

### 8.2 Aprovação e defaults

`approveUserByWhatsAppId()` muda o status antes de criar UserProfile/UserSettings. Não valida o estado de origem e toda repetição recria defaults. Falha entre os passos deixa usuário aprovado com defaults parciais. O comando admin `ativar` é ainda mais direto: define `ACTIVE` sem exigir OAuth, planilha, consentimento atual, defaults ou onboarding.

### 8.3 Onboarding

- Estado de conversa é em memória, TTL 12h; restart reinicia o questionário.
- Se profile já está concluído, estado stale é limpo.
- Voltar/recomeçar/ajuda e validações de nome/valores/sim-não são provados.
- Conclusão salva profile completo e depois display name; falha no segundo commit deixa profile concluído e impede retomada automática para o nome.
- Oferta pós-onboarding também é memória volátil.

### 8.4 Modo familiar

- Desligado por padrão.
- Ligado com allowlist vazia falha fechado.
- Admite por userId, whatsapp do cadastro, sender ou phone normalizado.
- É aplicado **depois** do dispatcher admin pré-acesso. Assim, qualquer número em `ADMIN_IDS` mantém comandos admin mesmo fora da allowlist familiar.
- Escopo financeiro familiar vem da tabela de memberships, não da allowlist. Memberships de usuários `INACTIVE/DELETED/BLOCKED` continuam no cálculo até remoção explícita.

## 9. Administração e trilhas

### 9.1 Gate e confirmação

- `handleAdminCommandBeforeAccess()` roda logo após `resolveUserAccess()`, antes de bloquear lifecycle e antes do modo familiar.
- Privilégio deriva somente de `ADMIN_IDS`, normalizado por ID/dígitos; display name/user row não concede admin.
- Não admin recebe uma resposta e um evento `access_denied`; a prova negativa confirmou zero mutações de lifecycle/OAuth/membership/Drive/Sheets.
- Comandos de risco guardam um único pending por sender em memória por cinco minutos. `confirmar admin` reexecuta o texto com `skipConfirmation`.
- Um novo comando substitui o pending anterior; confirmação não referencia messageId/hash do pedido. Restart perde o pending. Isso é controle de UX/erro, não autenticação adicional.

### 9.2 Subcomandos

| Comando | Confirmação | Branches/sinks | Prova e lacuna |
|---|---|---|---|
| ajuda/listar/stats | não | lê Users; responde identificadores/status | Dispatcher provado em parte; listagem completa não tem teste específico de privacidade. |
| status bot/health | não | memória/process/read-model; audit log | R/D, resposta sanitizada. |
| reiniciar bot | sim | agenda `process.exit(0)` 1,5s; depende de PM2 | R/D; não prova PM2 nem drain de requisições/jobs. |
| convidar | sim | mensagem WhatsApp | R/D sucesso/falha/fallback; sem outbox/replay durável. |
| compartilhar planilha | sim | Users/OAuth → Drive permission → membership SQLite → mensagens | Helpers Drive provados; dispatcher de criação não tem cenário causal completo. Sem rollback se membership falhar. Reatribuição de membro não revoga permissão do dono anterior. |
| remover compartilhamento | sim | Drive delete → membership revoke → audit/resposta | R/D no pacote de revogação. Se DB falhar após Drive, membership fica ativo internamente; sem permissionId, acesso Drive manual pode permanecer. |
| status usuário | não | Users/Profile/Settings/OAuth membership | I + serviços testados; divulga dados de cadastro ao admin. |
| aprovar | sim | status awaiting → defaults → link/mensagem → audit | Serviços e notificação provados; não há gate de estado; parcialidade/duplicação possíveis. Audit marca ação `success` mesmo quando envio falha, embora metadata revele `google_link_sent:false`. |
| negar | sim | status `BLOCKED`, audit, mensagem | serviço provado; dispatcher/erro de envio não têm bateria causal completa. |
| log consentimento | não | ConsentLog → resposta | I/D de store; evidence retorna message_id ao admin. |
| resetar onboarding | sim | limpa flag profile e estados em memória | I/D parcial; update e limpeza não são transação. |
| mensagem manual | sim | WhatsApp + audit | confirmação provada; sem outbox, limite de tamanho ou replay durável. |
| ativar/inativar/bloquear/deletar | sim | update Users | serviços provados; `ativar` burla gate Google; delete/inactivate não revogam OAuth/share/dashboard token. |
| expirar pendentes | sim | updates em lote sequenciais | serviço provado; parcialidade possível se uma linha falhar. |

### 9.3 Auditoria

- AdminActionLog e DashboardAccessLog são JSONL append-only, sanitizam telefones, e-mails, CPF, UUID, tokens e URLs, e foram testados.
- Ambos podem ser desligados por ambiente.
- Falha de mkdir/append é capturada e retorna `null`; a ação principal continua. Logo, nenhuma operação de risco exige recibo de auditoria durável para comprometer.
- O reinício é agendado antes de enviar a resposta; não há flush coordenado de logs/scheduler/servidor.

## 10. Jobs e scheduler

`initializeScheduler(client)` usa trava booleana em memória. A trava é marcada antes de registrar todos os crons; se um `cron.schedule` lançar no meio, a inicialização fica parcial e novas chamadas são ignoradas.

| Cron São Paulo | Job | Dados/efeitos | Guards | Evidência | Lacuna |
|---|---|---|---|---|---|
| `0 3 * * *` | expirar pending | Users updates | PENDING > 48h | serviços R/D | Sem lock/outbox; falha parcial. |
| `0 7 * * *` | morning + bills + events | Dívidas/Contas/Saídas/Calendar → WhatsApp | usuários ACTIVE, IDs sintéticos bloqueados fora de test | R/D dos cálculos/envios | Dívidas, contas e saídas iniciais são lidas sem contexto pessoal; podem omitir planilhas individuais. Event reminder roda só aqui. |
| `0 20 * * *` | evening | Calendar + Dívidas + Contas por user → WhatsApp | ACTIVE | R/D | Um erro de usuário aborta os seguintes. |
| `0 19 * * 0` | weekly check-in | Settings → WhatsApp | opt-in `SIM` | R/D | Falha de settings vira opt-out; sem idempotência de entrega. |
| `0 8 1 * *` | monthly report | Saídas/Entradas centrais + cartões por policy → WhatsApp | opt-in default `SIM` | R/D | Saídas/Entradas não usam planilha pessoal; fonte indisponível vira zero; settings ausente assume opt-in. |
| `0 * * * *` | heartbeat | telemetria + métricas → admins | flag de alertas; contadores | R/D | `flushToLogs` ocorre antes do envio; falha de WhatsApp pode perder a janela de alerta. |
| `5 9 * * *` | daily ops | flags/read model/metrics → admins | notifier | R/D | Prova local; sem entrega real. |
| `15 9 * * *` | readiness | gate de interpretação → admins | notifier | R/D | Prova local; sem entrega real. |
| `*/10 * * * *` | read-model sync | Sheets → JSON/SQLite/dashboard | `syncInFlight`, freshness/context | R/D | Coalescing protege o sync, não outros jobs; falha só métrica/log. |

Achados de scheduler:

1. `checkUpcomingEvents()` procura compromissos entre 55 e 70 minutos, mas só é chamado no cron das 07:00. Na prática, só há lembrete de “uma hora” para eventos próximos de 08:00; não existe cron frequente de lembretes.
2. `notifiedEventIds` é memória e é limpo às 07:00/restart; não é uma outbox durável.
3. Morning, evening, weekly, monthly e alert loops têm um `try/catch` envolvendo o conjunto; falha de envio/leitura em um destinatário interrompe destinatários seguintes.
4. Não há mutex/no-overlap para jobs, chave de idempotência por destinatário/período, recibo durável ou recuperação de envio parcial.
5. `readDataFromSheet()` e Calendar retornam listas vazias em falhas. Resumos podem afirmar “nenhuma dívida/conta/evento” quando a fonte está indisponível.
6. Os testes provam escopo, datas, mês curto, opt-in, política de cartões e notifiers, mas não registram os nove schedules reais, overlap, restart, falha no meio da inicialização ou replay pós-crash.

## 11. Achados priorizados

| ID | Severidade | Achado | Força | Consequência |
|---|---|---|---|---|
| WGL-01 | crítica | Callback OAuth não valida lifecycle; pode persistir/ativar `INACTIVE/BLOCKED/DELETED`, salvar credencial para usuário inexistente e ressuscitar conta inativada durante o fluxo. | R | Gate de acesso não é causalmente preservado. |
| WGL-02 | crítica | Não existe revogação OAuth individual; delete/inactivate/block preservam tokens, spreadsheet e Calendar. | R + I estática tree-wide | Exclusão/bloqueio não encerra credenciais e efeitos externos. |
| WGL-03 | alta | State/callback é replayável; concorrência cria duas planilhas, last-write-wins e órfãs sem compensação. | R | Duplicação externa e metadata divergente. |
| WGL-04 | alta | Conclusão Google é uma saga sem compensação; falhas deixam tokens, planilha ou metadata em estados parciais. | R | Recovery manual não especificado. |
| WGL-05 | alta | Resolução de planilha/Calendar cai no legado central em qualquer falha do OAuth individual; mutações não exigem target pessoal. | I + D wrappers | Usuário ativo pode operar fora da planilha própria; ausência não falha fechado. |
| WGL-06 | alta | `admin ativar` burla OAuth/defaults/onboarding; aprovação aceita qualquer estado e pode duplicar defaults. | I + R dos serviços | Fluxo multiusuário aprovado pode ser contornado por comando operacional. |
| WGL-07 | alta | Compartilhamento Drive e membership não são atômicos; reatribuição não remove permissão anterior. | I + D helpers | Acesso externo pode ficar órfão, amplo ou divergente do escopo interno. |
| WGL-08 | alta | Dashboard pessoal v1 expõe `user_id` em metas e linhas cruas de dívidas; sanitização v2 não remove IDs posicionais. | I | Identificadores internos vazam no contrato autenticado e podem aparecer no browser. |
| WGL-09 | alta | Falhas de Sheets/Calendar viram listas vazias; dashboard e scheduler podem apresentar zeros/“nenhuma pendência” como se fossem fatos. | R/D + I | Viola a regra “ausência de fonte não vira zero”. |
| WGL-10 | alta | Jobs morning/bills/monthly ainda leem fontes centrais para usuários com planilha pessoal. | I + D | Resumos agendados podem omitir dados reais individuais. |
| WGL-11 | alta | Lembrete de evento “em uma hora” só roda às 07:00. | I | Eventos fora da janela de 08:00 não são lembrados. |
| WGL-12 | média-alta | Dashboard token não é revogável e não revalida status/admin/family; cross-user beta aceita ID arbitrário com flag. | R + I | Acesso persiste até TTL após revogação lógica; ADR-002 continua gate. |
| WGL-13 | média-alta | Decisões de Users podem usar cache obsoleto em outage; duplicatas preferem linha ACTIVE a bloqueios/deleções. | I | Acesso antigo pode sobreviver à indisponibilidade/integridade ruim da planilha. |
| WGL-14 | média-alta | Admin logs são best-effort e desligáveis; ações de risco não exigem commit da auditoria. | R/D | Ação pode existir sem trilha durável. |
| WGL-15 | média | Consentimento, aprovação/defaults, onboarding e expiração são sequências não atômicas. | R/D + I | Duplicatas e estados parciais. |
| WGL-16 | média | Jobs não têm no-overlap/outbox e um erro aborta destinatários seguintes. | I + D | Duplicação ou perda silenciosa de notificações. |
| WGL-17 | média | Startup ignora falhas de estrutura/IDs, não tem teste direto e health é superficial. | I | Processo pode parecer online em modo parcialmente inicializado. |
| WGL-18 | média | Operações user-scoped não têm recovery de 401/invalid_grant equivalente ao cliente central. | I | Falha persistente ou fallback central sem reconexão guiada. |
| WGL-19 | média | Confirmação admin é volátil e vinculada só ao sender; novo pedido sobrescreve o anterior. | R/D + I | Protege contra toque acidental, mas não fornece correlação/auditoria forte. |
| WGL-20 | média | Servidor HTTP não define rate limit, timeout de aplicação ou handler explícito de erro de listen. | I | Exaustão/requests pendentes e boot parcial não cobertos. |

## 12. Matriz de cobertura e lacunas indispensáveis

| Superfície | Sucesso | Negação | Erro | Timeout/retry | Replay/concorrência | Persistência/efeito | Estado |
|---|---|---|---|---|---|---|---|
| startup | I | I | I | parcial D | não coberto | I | **lacuna** |
| token dashboard | R | R | R | TTL R | replay válido por design I | sem store | controle parcial |
| API v1 | R | R | R | não há timeout | token replay aceito | read-only + logs | controle parcial |
| API v2 | R | R | R/D | failures de tools D | token replay aceito | read-only + logs | controle parcial |
| OAuth start | R | R | R | não coberto | state reutilizável R/I | redirect | **NO-GO** |
| OAuth callback | R | R | R | parciais R | replay/corrida R | OAuth+Sheets+Users+WhatsApp | **NO-GO** |
| token store | R/D | validações R/D | R/D | SQLite local | upsert R | cifrado | controle parcial |
| share/revoke Drive | D | D/I | D/I | retry D | 409/404 D | Drive + membership | **lacuna causal** |
| Sheets reads | D | requireUserScoped parcial | D | retry/cache D | coalescing D | nenhuma | **NO-GO semântico** |
| Sheets writes | D | user_id/ledger D | D | retry/uncertain D | ledger D | Sheets + shadow | controle parcial |
| Calendar | D | user_id/test marker D | D | central parcial | sem outbox | Calendar | lacuna real |
| lifecycle | R/D | R/D | parciais R | retries de read | duplicidade I | Sheets | **NO-GO** |
| admin gate | R | R | D/I | não aplicável | confirmação R/D | Sheets/SQLite/Drive/WhatsApp | **NO-GO em desvios** |
| scheduler | D | opt-in D | D | sync lock parcial | sem no-overlap/outbox | WhatsApp/Sheets/Calendar | **lacuna** |

Lacunas indispensáveis antes de qualquer `GO` geral:

1. Provar e fazer cumprir a precedência de lifecycle em todo callback OAuth, inclusive pausa, replay e usuário inexistente.
2. Especificar e provar revogação/recovery OAuth individual para inativação, bloqueio e deleção.
3. Tornar conclusão Google e compartilhamento recuperáveis/idempotentes, sem órfãs ou permissões divergentes.
4. Fechar o fallback central para operações que exigem planilha própria e distinguir fonte indisponível de conjunto vazio.
5. Impedir bypass de lifecycle por `admin ativar/aprovar` e provar todos os subcomandos de risco com falhas entre commits.
6. Sanitizar coleções posicionais e testar payload real de planilha pessoal em v1 e v2.
7. Alinhar todos os jobs a planilhas pessoais/compartilhadas, adicionar semântica de indisponibilidade, entrega idempotente e cobertura dos schedules/overlap.
8. Criar prova direta de boot/health degradado, bind failure e recuperação de inicialização parcial.

## 13. Arquivos inspecionados diretamente

- `index.js`
- `src/services/dashboardServer.js`
- `src/services/dashboardSummaryService.js`
- `src/services/dashboardV2SummaryService.js`
- `src/services/dashboardV2Page.js`
- `src/utils/dashboardAuth.js`
- `src/utils/auth.js`
- `src/utils/adminCheck.js`
- `src/services/googleOAuthService.js`
- `src/services/oauthTokenStore.js`
- `src/services/google.js`
- `src/services/userSpreadsheetService.js`
- `src/services/userSheetAnalyticsService.js`
- `src/services/userService.js`
- `src/services/userIdMaintenanceService.js`
- `src/services/readModelService.js` (entrypoints de boot/dashboard)
- `src/handlers/onboardingHandler.js`
- `src/handlers/messageHandler.js` (ordem de acesso, dashboard, lifecycle e admin)
- `src/services/familyModeService.js`
- `src/services/adminActionLogService.js`
- `src/services/dashboardAccessLogService.js`
- `src/services/adminMaintenanceService.js`
- `src/services/dailyOpsCheckService.js`
- `src/jobs/scheduler.js`
- `src/telemetry/legacyUsageTelemetry.js`
- `src/config/constants.js`
- `docs/decisions/ADR-002-admin-financial-data-access.md`
- `docs/runbooks/release-checklist.md`
- suites de teste relacionadas citadas na seção 3.

## 14. Próximo gate permitido

Consolidar este workstream com os workstreams de WhatsApp/handlers e caminhos financeiros. A consolidação deve montar uma matriz única de todos os entrypoints e verificar interseções; só depois pode priorizar correções. Este documento não autoriza alteração de produto, produção, flags, dados, deploy ou teste real.
