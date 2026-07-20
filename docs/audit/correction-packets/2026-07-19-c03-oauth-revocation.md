# Pacote C-03 - revogacao OAuth individual por lifecycle

## Estado

- Prioridade: `CRITICAL`.
- Achado causal: `C-03 / WGL-02`.
- Estado atual: implementacao versionada e testes locais diretamente afetados
  verdes; revisao adversarial independente pendente.
- Produto, producao, Google real, WhatsApp, flags, push e deploy permanecem
  congelados.

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
`revocation_id` unico, `user_id`, `generation`, tentativas, proximo retry e
expiracao. Resultados atualizam somente a combinacao
`user_id + revocation_id`; resultado atrasado de uma geracao antiga nao altera
o job corrente.

Estados sanitizados:

- `pending`: token criptografado reservado apenas para a tentativa remota;
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
sweep horario respeita backoff exponencial limitado, maximo de tentativas,
retencao e lote limitado; logs possuem apenas contagens e codigos constantes.

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

GREEN atual:

- revogacao local preserva metadata e torna a conexao invisivel;
- falha remota falha fechado e pode ser repetida idempotentemente;
- sucesso remoto apaga o token pendente e replay nao chama Google novamente;
- reconexao fica bloqueada enquanto a tentativa antiga for retryable;
- resultados sao condicionados por `user_id + revocation_id` e nao atravessam
  geracoes;
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

## Gate de saida

O diff esta pronto para auditoria independente. O `GO local` final exige:

- preservar os gates locais verdes ja registrados;
- revisao adversarial sem `BLOCKER`, `HIGH` ou `MEDIUM` criado pelo pacote.

Commit local e inicio do pacote seguinte so ocorrem apos esse gate. Push,
deploy e Google real exigem autorizacao separada.

## Veredito

Implementacao local e gates amplos verdes, pronta para commit sanitizado e
auditoria independente. Push serve apenas para publicar o hash imutavel da
revisao; deploy continua proibido antes do `GO local` independente.
