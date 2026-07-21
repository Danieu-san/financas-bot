# Pacote C-03 - revogacao OAuth individual por lifecycle

## Estado

- Prioridade: `CRITICAL`.
- Achado causal: `C-03 / WGL-02`.
- Estado atual: `GO local formal`. O Chat confirmou e revisou estaticamente o
  HEAD `be8eb6e850b3d51a012238d78053b6602cf9cba8`, sem `BLOCKER`, `HIGH` ou
  `MEDIUM`.
- Produto, producao, Google real, WhatsApp, flags e deploy permanecem
  congelados. Publicacao GitHub serve apenas ao gate de auditoria.

## Problema causal

Alterar um usuario para `INACTIVE`, `BLOCKED` ou `DELETED` impedia novas
mensagens no gate de acesso, mas preservava a conexao OAuth individual ativa.
Tokens continuavam recuperaveis pelo runtime e ainda podiam autorizar Sheets e
Calendar. A mudanca de lifecycle, portanto, nao encerrava a capacidade externa.

## Contrato corrigido

Toda transicao para um estado impeditivo passa pela mesma fila causal por
usuario criada no C-02:

```text
INACTIVE | BLOCKED | DELETED
-> tentativa de tombstone local atomico + job versionado
-> credencial removida do caminho operacional quando o store responde
-> tentativa remota com timeout
-> persistencia incondicional do status terminal
```

O tombstone local precede a tentativa remota. Se o banco OAuth falhar, a falha
e reduzida ao codigo constante `LOCAL_REVOKE_FAILED`, mas o lifecycle terminal
ainda e persistido e o gate de acesso continua fechado. Se apenas a chamada
remota falhar, a conexao permanece localmente inacessivel e o job conserva
somente o token cifrado necessario ao retry. Os pontos operacionais sao
`beginOAuthRevocation()` no token store, `revokeGoogleConnectionForUser()` no
adaptador Google e o sweep horario do scheduler.

## Ledger e recuperacao

A tabela SQLite `oauth_revocations` e append-only por geracao. Cada job possui
`revocation_id` unico, `user_id`, `generation`, tentativas, proximo retry,
expiracao e politica maxima de tentativas persistida. Cada tentativa recebe um
`lease_id` exclusivo e permanece `in_progress` ate concluir ou o lease vencer.
Resultados atualizam somente a combinacao
`user_id + revocation_id + lease_id`; resultado atrasado de geracao ou lease
substituido nao altera o job corrente. Um lease apenas vencido ainda pode
concluir se continua sendo o lease atual e nenhum claim ou cleanup venceu a
serializacao.

Estados sanitizados:

- `pending`: estado legado sem lease, elegivel para claim atomico;
- `in_progress`: tentativa remota com lease exclusivo ativo;
- `remote_failed`: falha remota, com codigo constante e retry possivel;
- `remote_revoked`: sucesso remoto e token de retry apagado;
- `manual_required_expired`: retencao vencida e material cifrado apagado;
- `manual_required_exhausted`: limite de tentativas atingido e material
  cifrado apagado.

O registro publico da revogacao nao expoe tokens nem mensagens de erro. O token
de retry permanece AES-256-GCM e nunca volta por `getOAuthConnection()`.
Reconexao e rejeitada enquanto existir qualquer job retryable; ela deixa de ser
bloqueada somente depois de revogacao remota, expiracao ou exaustao, quando o
material retido ja foi apagado.

A revogacao remota usa `refresh_token` quando existe e `access_token` como
fallback. A chamada possui timeout configuravel e limitado a 30 segundos. O
sweep horario respeita backoff exponencial limitado, `max_attempts` e
`expires_at` persistidos e lote limitado. Claim, reconnect e migracao usam
transacao SQLite `IMMEDIATE` com espera limitada. Logs de saida sao sanitizados
e o sweep publica apenas contagens e codigos constantes.

## Limites preservados

- A planilha criada no Drive do usuario nao e apagada.
- IDs publicos de planilha e Calendar permanecem apenas como metadata historica
  na linha revogada; nao existe mais credencial operacional para usa-los.
- Membership familiar e permissao Drive nao sao removidos por revogacao OAuth
  individual. Remocao de compartilhamento continua sendo operacao separada.
- O pacote nao corrige replay de `state`, planilhas orfas ou compensacao da saga
  Google (`WGL-03/WGL-04`).
- O pacote nao altera o atalho legado `admin ativar`, tratado em achado proprio.

## TDD e evidencias

RED confirmado:

- token store nao possuia tombstone ou ledger de revogacao;
- servico remoto e retry nao existiam;
- lifecycle nao disparava revogacao para estados impeditivos;
- reconexao preservava tentativa antiga;
- chamada remota sem resposta podia bloquear indefinidamente.
- dois workers consumiam o mesmo job e faziam duas chamadas remotas;
- recovery podia disputar o token com a tentativa inicial ainda em voo;
- resultado atrasado podia concluir um lease ja substituido;
- recovery recalculava retencao pela configuracao atual;
- os schemas legado e versionado nao tinham prova de startup concorrente.

GREEN atual:

- revogacao local preserva metadata e torna a conexao invisivel;
- falha remota falha fechado e pode ser repetida idempotentemente;
- sucesso remoto apaga o token pendente e replay nao chama Google novamente;
- reconexao fica bloqueada enquanto a tentativa antiga for retryable;
- resultados sao condicionados por `user_id + revocation_id + lease_id` e nao
  atravessam geracoes nem tentativas;
- dois workers concorrentes produzem um unico claim, uma chamada remota e um
  unico incremento de tentativa;
- recovery nao disputa lease inicial ativo e expiracao nao limpa token em voo;
- `expires_at` e `max_attempts` persistidos prevalecem sobre mudanca do runtime;
- migracoes legado e versionada passam com dois processos concorrentes e
  `busy_timeout` limitado;
- sweep horario respeita backoff, exaure tentativas e apaga material cifrado
  ao vencer retencao ou limite;
- timeout mantem o tombstone local e registra falha remota sanitizada;
- `INACTIVE`, `BLOCKED` e `DELETED` passam pelo mesmo hook causal;
- falha local nao impede persistir lifecycle terminal nem reabrir acesso;
- inativacao concorrente impede conclusao OAuth atrasada;
- remover compartilhamento familiar nao revoga OAuth dos membros;
- testes focados OAuth/lifecycle: `30/30`;
- harnesses OAuth/auditoria diretamente afetados: `35/35`;
- scheduler diretamente afetado: `17/17`;
- prova negativa repetida apos o encaixe do recovery path unico: `4/4`;
- `node --check` nos nove arquivos JS tocados e `git diff --check`: limpos,
  salvo avisos esperados de LF/CRLF;
- suite padrao com pretestes: bateria principal `1025/1025`;
- runner hermetico: `1145` testes, `1140` aprovados, cinco skips funcionais
  esperados, zero falhas, rede externa bloqueada e resultado valido;
- cobertura do runner: linhas `88.64%`, branches `71.5%`, funcoes `89.14%`;
- `npm audit --offline --audit-level=high`: zero vulnerabilidades;
- `state_store.json` permaneceu sem diff depois do runner.
- regressao especifica do NO-GO: RED `13/18`, com cinco falhas esperadas;
- GREEN atual do patch de lease: OAuth/lifecycle `38/38`; cinco harnesses
  OAuth/auditoria mais scheduler `52/52`;
- checks atuais dos quatro JS tocados e `git diff --check`: verdes;
- o candidato auditado publica `pending_independent_review`, sem autodeclarar
  `go_local`; o fechamento independente posterior esta registrado neste
  documento.
- suite padrao atual: `1033/1033`;
- runner hermetico atual: `1153` testes, `1148` aprovados, cinco skips
  funcionais esperados, zero falhas, rede externa bloqueada e resultado valido;
- auditoria offline atual: zero vulnerabilidades; estado e logs rastreados
  restaurados sem diff.

## Gate de saida

Os gates locais amplos foram repetidos. O `GO local` final exige:

- preservar os gates locais verdes ja registrados;
- revisao adversarial sem `BLOCKER`, `HIGH` ou `MEDIUM` criado pelo pacote.

Ambas as condicoes foram satisfeitas. A revisao independente de 2026-07-21 deu
`GO` local e registrou somente dois `LOW`: precisao documental sobre lease
vencido e cobertura funcional concorrente no mesmo processo. Nenhum dos dois
demonstrou quebra do fencing multiprocesso.

O SHA imutavel foi publicado e revisado. Deploy e Google real permanecem gates
separados e nao foram autorizados por este `GO` local.

## Veredito

O commit sanitizado imutavel
`6c91074138138dc6f55e7d6271708a299c087f50` recebeu `NO-GO` independente por
falta de claim/lease exclusivo, uso de retencao recalculada e ausencia de prova
de migracao sob contencao. Os tres achados foram corrigidos no commit
`606ae5b`; o HEAD documental `be8eb6e850b3d51a012238d78053b6602cf9cba8`
recebeu `GO` independente para fechamento local. Deploy continua proibido e
producao nao foi avaliada.

O revisor nao reproduziu os testes. O apontamento de log com `user_id` e
mitigado pelo sanitizador global do logger, e a promessa documental fica
restrita a saida sanitizada. O harness agora imprime
`pending_independent_review` no candidato imutavel; o parecer verde posterior
e este registro documental encerram o gate sem alterar retroativamente o SHA
auditado.
