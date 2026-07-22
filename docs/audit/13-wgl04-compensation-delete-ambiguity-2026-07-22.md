# WGL-04 — convergência após exclusão remota ambígua

Data: 2026-07-22

## Origem do achado

A auditoria independente do commit
`fe369897ced1b45d886e91e19e6f2ba773e241ba` confirmou WGL-03, mas registrou
NO-GO WGL-04 por uma lacuna MEDIUM: se `drive.files.delete` efetivasse a
exclusão e a resposta se perdesse antes de `finishOAuthConnectionCompensation`,
a retomada receberia `404`, interpretaria `false` e manteria uma pendência falsa.

## Correção focal

`deleteUserSpreadsheetForAttempt` agora considera convergência idempotente:

- `404`: o recurso já não existe, portanto não há efeito restante;
- `trashed=true`: o recurso já foi descartado;
- marcador diferente da tentativa: continua retornando `false` e nunca chama
  delete;
- recurso ativo com marcador correto: executa delete normalmente.

A saga mantém intenção, lease, backoff e credenciais cifradas antes do efeito.
Assim, perda da resposta deixa `compensation_pending`; o worker retoma, observa
ausência e conclui `compensated`, eliminando o material sensível.

## Provas locais pós-correção

- sintaxe dos três arquivos alterados: verde;
- saga + serviço real de planilha: `38/38`;
- saga isolada: `21/21`, incluindo delete efetivado com resposta perdida;
- callback, causalidade e idempotência: `31/31`;
- o runner hermético do commit pai passou 1.185 testes, 0 falhas e 5 skips
  previstos; não foi repetido porque o delta é restrito à semântica idempotente
  de exclusão, coberta pelas provas acima.

## Limite

Nenhum serviço Google real foi chamado. Este delta não autoriza deploy. O novo
hash deve ser revisado estaticamente para confirmar que ausência converge sem
permitir exclusão de planilha com marcador alheio.
