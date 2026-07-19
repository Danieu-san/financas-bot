# Pacote C-02 - precedencia de lifecycle no OAuth Google

## Estado

- Prioridade: `CRITICAL`.
- Base auditada: `0737d7ccbdd309e4c39f503ca781e89d5aac7bc3`.
- Achado causal: `C-02 / WGL-01`.
- Autorizacao atual: `GO local formal` apos revisao adversarial independente.
- Produto, producao, Google real, WhatsApp, flags e deploy permanecem
  congelados.

## Problema causal

O callback OAuth validava apenas assinatura e expiracao do `state`. Depois
disso, trocava o codigo, consultava a conta Google e persistia credenciais antes
de confirmar se o usuario ainda existia e se seu lifecycle permitia conexao.
A conclusao da planilha usava um snapshot antigo do usuario e escrevia
`ACTIVE` ao final, mesmo se uma inativacao tivesse sido confirmada durante a
operacao.

As consequencias reproduzidas antes da correcao eram:

- credencial persistida para usuario inexistente;
- `BLOCKED`, `INACTIVE`, `DELETED`, `PENDING`, `PENDING_APPROVAL` e `EXPIRED`
  aceitos pelo callback;
- alteracao de lifecycle durante chamadas externas ignorada;
- conclusao pausada capaz de ressuscitar uma conta inativada.

## Contrato corrigido

Somente estes estados podem iniciar ou concluir a conexao:

```text
APPROVED_AWAITING_GOOGLE
ACTIVE
```

O callback faz leitura fresca da fonte de lifecycle em tres fronteiras. A
terceira leitura e a persistencia sincronica compartilham a mesma fila das
mudancas de status:

Nessas leituras, o caminho estrito ignora tanto o cache do `userService`
quanto o cache e a promessa in-flight de `google.readDataFromSheet()`. Erro ou
fonte vazia nao reutiliza snapshot anterior: o gate falha fechado.

```text
state/code validos
-> lifecycle antes da troca do code
-> troca do code
-> lifecycle antes de consultar a conta Google
-> consulta da conta Google
-> lifecycle imediatamente antes da persistencia sincronica
-> persistencia OAuth
-> criacao/reuso da planilha
-> transicao condicional e serializada para ACTIVE
```

Usuario ausente ou status fora da allowlist falha fechado. Antes da primeira
persistencia nao pode haver token salvo, lookup adicional ou ativacao.

## Precedencia e concorrencia

As alteracoes internas feitas por `updateUserStatus()` e a ativacao OAuth
condicional passam pela mesma fila por usuario. `transitionUserStatus()` relê
a fonte apos operacoes anteriores da fila e so ativa quando o estado observado
ainda pertence a allowlist. Portanto:

- uma inativacao ja iniciada tem precedencia sobre uma ativacao OAuth que
  chegou depois;
- uma inativacao ja enfileirada antes do guard final impede a persistencia da
  conexao OAuth;
- uma conclusao atrasada nao sobrescreve `INACTIVE`, `BLOCKED` ou `DELETED`;
- callbacks concorrentes podem concluir a funcao, mas somente uma transicao
  efetivamente escreve `ACTIVE`.

Edicao manual externa e simultanea da planilha `Users` nao participa da fila
do processo. Esse limite de atomicidade da fonte Google Sheets permanece
registrado; o pacote fecha as corridas internas reproduziveis, nao promete uma
transacao distribuida inexistente.

## TDD e evidencias

RED confirmado:

- dez cenarios provaram que status proibidos, usuario inexistente e mudancas
  durante token/account lookup alcançavam persistencia ou conclusao;
- a regressao de lifecycle falhou antes da existencia da transicao condicional.

GREEN confirmado:

- status proibidos falham antes de token exchange e persistencia;
- usuario inexistente falha antes de token exchange e persistencia;
- mudanca durante token exchange falha antes de account lookup;
- mudanca durante account lookup falha antes de persistencia;
- inativacao concorrente nao e ultrapassada pela ativacao OAuth;
- o auditor de replay distingue duas conclusoes de uma unica escrita efetiva
  de `ACTIVE`;
- leitura fresca ignora cache de status alterado diretamente na fonte;
- suite focada OAuth/lifecycle: `56/56`.
- cache Sheets estrito e in-flight: `2/2`;
- suite principal `npm test`: `1014/1014`;
- runner exaustivo hermetico: `1134` testes, `1129` aprovados, `0` falhas e
  `5` skips funcionais esperados; rede externa bloqueada;
- `npm audit --audit-level=high`: zero vulnerabilidades em `365`
  dependencias;
- `node --check`, `git diff --check` e NUL scan: limpos, salvo avisos esperados
  de conversao LF/CRLF;
- `state_store.json`: restaurado para `{}`.

## Residuos explicitamente fora do C-02

1. `C-03 / WGL-02`: inativar, bloquear ou excluir ainda nao revoga a conexao
   OAuth individual, tokens, planilha ou Calendar.
2. `WGL-03`: o mesmo `state` ainda e replayavel; conclusoes concorrentes ainda
   podem criar duas planilhas e deixar uma orfa.
3. `WGL-04`: a saga Google nao possui compensacao integral para token, planilha
   e metadata ja persistidos antes de uma falha posterior.
4. O pacote nao altera compartilhamento familiar, Drive, dashboard, comandos
   admin nem o fluxo de revogacao.

Testes verdes que caracterizam esses residuos nao significam conformidade. Eles
permanecem prova executavel dos proximos pacotes.

## Gate de saida

`GO local` exige:

- testes focados e suite completa verdes;
- runner exaustivo hermetico verde;
- `node --check`, `git diff --check` e NUL scan limpos;
- `npm audit --audit-level=high` sem vulnerabilidade alta/critica;
- `state_store.json` restaurado para `{}`;
- revisao adversarial do diff sem `BLOCKER`, `HIGH` ou `MEDIUM` criado pelo
  pacote.

Commit, push, deploy e qualquer chamada Google real exigem gate separado.

## Veredito final

`GO local formal` para `C-02 / WGL-01` em 18/07/2026. A revisao adversarial
final nao encontrou `BLOCKER`, `HIGH` ou `MEDIUM` remanescente no pacote.

Este veredito nao fecha nem rebaixa `C-03/WGL-02`, `WGL-03` ou `WGL-04` e nao
autoriza commit, push, deploy ou Google real.
