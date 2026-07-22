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

A primeira reauditoria do delta `0b8f5bf9d4e6c3d9ae23711435380006ec580b80`
encontrou um segundo achado MEDIUM válido: `trashed=true` era avaliado antes do
marcador, permitindo falso sucesso para recurso alheio ou sem marcador. A
decisão agora valida primeiro a propriedade da tentativa e somente depois
aceita `trashed=true` como convergência. Recurso com marcador diferente ou
ausente retorna `false` independentemente de estar ativo ou na lixeira.

A saga mantém intenção, lease, backoff e credenciais cifradas antes do efeito.
Assim, perda da resposta deixa `compensation_pending`; o worker retoma, observa
ausência e conclui `compensated`, eliminando o material sensível.

## Provas locais pós-correção

- sintaxe do módulo de produto alterado: verde;
- saga + serviço real de planilha: `38/38`;
- saga isolada: `21/21`, incluindo delete efetivado com resposta perdida;
- cruzamentos adversariais do serviço: recurso ativo ou descartado com marcador
  alheio e recurso descartado sem marcador retornam `false`, sem chamar delete;
- callback, causalidade e idempotência: bateria anterior `31/31`; subconjunto
  causal reexecutado após a segunda correção: `17/17`;
- o runner hermético do commit pai passou 1.185 testes, 0 falhas e 5 skips
  previstos; não foi repetido porque o delta é restrito à semântica idempotente
  de exclusão, coberta pelas provas acima.

## Limite

Nenhum serviço Google real foi chamado. Este delta não autoriza deploy. O novo
hash deve ser revisado estaticamente para confirmar que ausência converge sem
permitir exclusão ou falso sucesso para planilha com marcador alheio/ausente.
