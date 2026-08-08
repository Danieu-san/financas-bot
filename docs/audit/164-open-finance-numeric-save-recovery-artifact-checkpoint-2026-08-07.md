# OF-NUMERIC-SAVE-OCI-03 - checkpoint do artefato de recovery

Data: 2026-08-07

Hash de produto auditado:
`ce49c0705120ea9a421e05fd60a9373aea889019`.

## Artefato local

- build executado exatamente do hash auditado, sem incluir o commit documental
  posterior;
- manifesto verificado: `807` arquivos;
- SHA-256 do pacote:
  `f05f4734e3b1f877120d6dcb82582770030c197d1c6f0b1c62f946ed21bd1ba6`;
- SHA-256 do instalador:
  `30452d41be2b0aa60649b17d0f18e2004e269edc05c2893b4c43d5db471dd507`;
- checksum do instalador: valido;
- verificador OCI local: `verified=true`, hash e manifesto coerentes.

Os artefatos permanecem locais e ignorados pelo Git. Nenhum upload, prepare,
restart, polling, mensagem ou escrita financeira foi executado depois do GO
independente.

## Fronteira remota

O IP publico atual ainda coincide com o `/32` anteriormente autorizado. A
sessao da console Oracle expirou antes de a nova regra SSH ser criada. A regra
nao foi adicionada e a porta permaneceu fechada; nao houve acesso remoto.

## Estado

`ARTEFATO LOCAL VERDE; AGUARDANDO LOGIN ORACLE`.

Depois do login, a proxima acao unica e adicionar a regra SSH `/32` temporaria,
confirmar a identidade ja confiada, repetir preflight, enviar/verificar/preparar
os quatro arquivos e somente entao repetir a promocao controlada.
